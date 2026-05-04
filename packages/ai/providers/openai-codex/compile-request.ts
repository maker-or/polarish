import { Effect, Array as EffectArray, JSONSchema, Schema, pipe } from "effect";
import { zodToJsonSchema } from "zod-to-json-schema";
import { aiDebugLog } from "../../client/debug.ts";
import type {
	AttachmentContent,
	TextContent,
	ToolResultMessage,
	UserMessage,
	message,
} from "../../types.ts";
import type {
	appRequestShape,
	assistantContentPart,
	codexFunctionTool,
	codexInputContent,
	codexRequestShape,
	fileInput,
	functionCallInputType,
	functionToolOutputType,
	imageInput,
	inputMessageType,
	textInput,
} from "./types.ts";

type JsonSchemaObject = Record<string, unknown>;
type ZodSchemaLike = {
	safeParse(input: unknown): unknown;
	toJSONSchema?: (options?: { target?: string }) => unknown;
	_zod: unknown;
};
type ShorthandLeaf =
	| StringConstructor
	| NumberConstructor
	| BooleanConstructor
	| DateConstructor
	| null
	| string
	| number
	| boolean;
type JsTsShorthandValue =
	| ShorthandLeaf
	| readonly [ShorthandLeaf | JsTsObjectShorthand]
	| JsTsObjectShorthand;
interface JsTsObjectShorthand {
	[key: string]: JsTsShorthandValue;
}

const JSON_SCHEMA_KEYWORDS = new Set([
	"$schema",
	"$id",
	"$ref",
	"$defs",
	"type",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"enum",
	"const",
	"anyOf",
	"oneOf",
	"allOf",
	"description",
	"title",
	"default",
	"examples",
	"format",
	"nullable",
	"patternProperties",
	"propertyNames",
	"minItems",
	"maxItems",
	"minLength",
	"maxLength",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"multipleOf",
]);

const toTextContentPart = (content: TextContent): Effect.Effect<textInput> =>
	Effect.succeed({
		type: "input_text",
		text: content.text,
	});

const toAssistantTextPart = (text: string): assistantContentPart => ({
	type: "output_text",
	text,
});

/**
 * This turns an image attachment into the Codex image input shape.
 */
const toImageContentPart = (
	content: AttachmentContent,
): Effect.Effect<imageInput> => {
	switch (content.source.type) {
		case "base64":
			return Effect.succeed({
				type: "input_image",
				image_url: `data:${content.mimetype};base64,${content.source.data}`,
			});
		case "url":
			return Effect.succeed({
				type: "input_image",
				image_url: content.source.url,
			});
		case "file_id":
			return Effect.succeed({
				type: "input_image",
				file_id: content.source.fileId,
			});
	}
};

/**
 * This turns a non-image attachment into the Codex file input shape.
 */
const toFileContentPart = (
	content: AttachmentContent,
): Effect.Effect<fileInput> => {
	switch (content.source.type) {
		case "base64":
			return Effect.succeed({
				type: "input_file",
				file_data: content.source.data,
				...(content.filename ? { filename: content.filename } : {}),
			});
		case "url":
			return Effect.succeed({
				type: "input_file",
				file_url: content.source.url,
				...(content.filename ? { filename: content.filename } : {}),
			});
		case "file_id":
			return Effect.succeed({
				type: "input_file",
				file_id: content.source.fileId,
				...(content.filename ? { filename: content.filename } : {}),
			});
	}
};

/**
 * This picks the right Codex input shape for an attachment.
 */
const toAttachmentContentPart = (
	content: AttachmentContent,
): Effect.Effect<codexInputContent> =>
	content.kind === "image"
		? toImageContentPart(content)
		: toFileContentPart(content);

const collapseContent = (
	parts: ReadonlyArray<codexInputContent>,
): string | codexInputContent[] =>
	parts.length === 1 && parts[0]?.type === "input_text"
		? parts[0].text
		: [...parts];

const collapseAssistantContent = (
	parts: ReadonlyArray<assistantContentPart>,
): string | assistantContentPart[] =>
	parts.length === 1 && parts[0]?.type === "output_text"
		? parts[0].text
		: [...parts];

const serializeAssistantTextContent = (
	content: Extract<message, { role: "assistant" }>["content"],
): Effect.Effect<string | assistantContentPart[]> =>
	pipe(
		content.filter((entry) => entry.type !== "toolcall"),
		EffectArray.map((entry) => {
			switch (entry.type) {
				case "text":
					return Effect.succeed(toAssistantTextPart(entry.text));
				case "thinking":
					return Effect.succeed(toAssistantTextPart(entry.thinking));
				default:
					return Effect.dieMessage(
						"Unexpected content type in assistant message",
					);
			}
		}),
		Effect.all,
		Effect.map(collapseAssistantContent),
	);

/**
 * This turns one assistant tool call into the native Responses API function call item.
 */
const serializeAssistantToolCall = (
	entry: Extract<
		Extract<message, { role: "assistant" }>["content"][number],
		{ type: "toolcall" }
	>,
): functionCallInputType => ({
	type: "function_call",
	id: entry.id,
	call_id: entry.callId ?? entry.id,
	name: entry.name,
	arguments: JSON.stringify(entry.arguments),
});

const serializeUserContent = (
	userMessage: UserMessage,
): Effect.Effect<string | codexInputContent[]> => {
	if (typeof userMessage.content === "string") {
		return Effect.succeed(userMessage.content);
	}

	return pipe(
		userMessage.content,
		EffectArray.map((entry) => {
			switch (entry.type) {
				case "text":
					return toTextContentPart(entry);
				case "attachment":
					return toAttachmentContentPart(entry);
				default:
					return Effect.dieMessage("Unexpected content type in user message");
			}
		}),
		Effect.all,
		Effect.map(collapseContent),
	);
};

const serializeToolContent = (
	toolMessage: ToolResultMessage,
): Effect.Effect<string | codexInputContent[]> =>
	pipe(
		toolMessage.content,
		EffectArray.map((entry) => {
			switch (entry.type) {
				case "text":
					return toTextContentPart(entry);
				case "attachment":
					return toAttachmentContentPart(entry);
				default:
					return Effect.dieMessage("Unexpected content type in tool message");
			}
		}),
		Effect.all,
		Effect.map(collapseContent),
	);

const serializeToolResultMessage = (
	toolMessage: ToolResultMessage,
): Effect.Effect<functionToolOutputType> =>
	pipe(
		serializeToolContent(toolMessage),
		Effect.map((content) => {
			const output =
				typeof content === "string"
					? content
					: JSON.stringify({
							content,
							toolName: toolMessage.toolName,
							isError: toolMessage.isError,
						});

			return {
				type: "function_call_output" as const,
				call_id: toolMessage.toolCallId,
				output,
			};
		}),
	);

const isPlainRecord = (value: unknown): value is JsonSchemaObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * This checks if the value already looks like a JSON Schema object.
 */
const isJsonSchemaObject = (value: unknown): value is JsonSchemaObject =>
	isPlainRecord(value) &&
	Object.keys(value).some((key) => JSON_SCHEMA_KEYWORDS.has(key));

/**
 * This checks if the value is a plain JS or TS object shorthand that should become a strict object schema.
 */
const isJsTsObjectShorthand = (value: unknown): value is JsTsObjectShorthand =>
	isPlainRecord(value) && !isJsonSchemaObject(value);

/**
 * This checks if the value is a Zod schema that we can serialize.
 */
const isZodSchema = (value: unknown): boolean =>
	isPlainRecord(value) &&
	"_zod" in value &&
	typeof value.safeParse === "function";

/**
 * This normalizes one shorthand leaf into a JSON Schema node.
 */
const compileShorthandNode = (
	toolName: string,
	value: unknown,
	path: string,
): JsonSchemaObject => {
	if (value === String) {
		return { type: "string" };
	}

	if (value === Number) {
		return { type: "number" };
	}

	if (value === Boolean) {
		return { type: "boolean" };
	}

	if (value === Date) {
		return { type: "string", format: "date-time" };
	}

	if (value === null) {
		return { type: "null" };
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return { const: value };
	}

	if (Array.isArray(value)) {
		if (value.length !== 1) {
			throw new Error(
				`Tool "${toolName}" uses an unsupported array shorthand at "${path}". Use a single example item like [String].`,
			);
		}

		return {
			type: "array",
			items: compileShorthandNode(toolName, value[0], `${path}[]`),
		};
	}

	if (isPlainRecord(value)) {
		const properties = Object.fromEntries(
			Object.entries(value).map(([key, child]) => [
				key,
				compileShorthandNode(toolName, child, `${path}.${key}`),
			]),
		);

		return {
			type: "object",
			properties,
			required: Object.keys(properties),
			additionalProperties: false,
		};
	}

	throw new Error(
		`Tool "${toolName}" uses an unsupported JS/TS object shorthand value at "${path}".`,
	);
};

/**
 * This converts a plain JS or TS object shorthand into a strict JSON Schema object.
 */
const compileJsTsObjectShorthand = (
	toolName: string,
	schema: JsTsObjectShorthand,
): JsonSchemaObject => compileShorthandNode(toolName, schema, "inputSchema");

/**
 * This recursively normalizes object nodes for strict OpenAI function calling.
 */
const normalizeStrictJsonSchema = (
	toolName: string,
	schema: unknown,
	path: string,
): JsonSchemaObject => {
	if (!isPlainRecord(schema)) {
		throw new Error(
			`Tool "${toolName}" must compile to a JSON Schema object at "${path}".`,
		);
	}

	const next: JsonSchemaObject = { ...schema };

	if (isPlainRecord(next.properties)) {
		const properties = Object.fromEntries(
			Object.entries(next.properties).map(([key, value]) => [
				key,
				normalizeStrictJsonSchema(toolName, value, `${path}.properties.${key}`),
			]),
		);

		next.type = "object";
		next.properties = properties;
		next.required = Object.keys(properties);
		next.additionalProperties = false;
	}

	if (isPlainRecord(next.patternProperties)) {
		next.patternProperties = Object.fromEntries(
			Object.entries(next.patternProperties).map(([key, value]) => [
				key,
				normalizeStrictJsonSchema(
					toolName,
					value,
					`${path}.patternProperties.${key}`,
				),
			]),
		);
	}

	if ("items" in next && next.items !== undefined && next.items !== false) {
		if (Array.isArray(next.items)) {
			next.items = next.items.map((item, index) =>
				normalizeStrictJsonSchema(toolName, item, `${path}.items.${index}`),
			);
		} else {
			next.items = normalizeStrictJsonSchema(
				toolName,
				next.items,
				`${path}.items`,
			);
		}
	}

	for (const key of ["anyOf", "oneOf", "allOf"] as const) {
		const branch = next[key];
		if (Array.isArray(branch)) {
			next[key] = branch.map((item, index) =>
				normalizeStrictJsonSchema(toolName, item, `${path}.${key}.${index}`),
			);
		}
	}

	return next;
};

/**
 * This makes sure the final tool schema is a strict root object schema because Codex function tools expect object parameters.
 */
const ensureStrictObjectToolSchema = (
	toolName: string,
	schema: unknown,
): JsonSchemaObject => {
	const normalized = normalizeStrictJsonSchema(toolName, schema, "parameters");

	if (
		normalized.type !== "object" &&
		!isPlainRecord(normalized.properties) &&
		!("$ref" in normalized)
	) {
		throw new Error(
			`Tool "${toolName}" must compile to a root object JSON Schema for Codex parameters.`,
		);
	}

	if (!("$ref" in normalized)) {
		normalized.type = "object";
		normalized.properties = isPlainRecord(normalized.properties)
			? normalized.properties
			: {};
		normalized.required = Object.keys(
			normalized.properties as Record<string, unknown>,
		);
		normalized.additionalProperties = false;
	}

	return normalized;
};

/**
 * This converts supported tool schema inputs into the JSON Schema shape that Codex expects.
 */
const normalizeToolInputSchema = (
	tool: NonNullable<appRequestShape["tools"]>[number],
): JsonSchemaObject => {
	if (Schema.isSchema(tool.inputSchema)) {
		return ensureStrictObjectToolSchema(
			tool.name,
			JSONSchema.make(tool.inputSchema, { target: "jsonSchema7" }),
		);
	}

	if (isZodSchema(tool.inputSchema)) {
		const zodSchema = tool.inputSchema as ZodSchemaLike;

		if (typeof zodSchema.toJSONSchema === "function") {
			return ensureStrictObjectToolSchema(
				tool.name,
				zodSchema.toJSONSchema({ target: "draft-07" }),
			);
		}

		return ensureStrictObjectToolSchema(
			tool.name,
			zodToJsonSchema(zodSchema as never, {
				target: "jsonSchema7",
				$refStrategy: "none",
			}),
		);
	}

	if (isJsonSchemaObject(tool.inputSchema)) {
		return ensureStrictObjectToolSchema(tool.name, tool.inputSchema);
	}

	if (isJsTsObjectShorthand(tool.inputSchema)) {
		return ensureStrictObjectToolSchema(
			tool.name,
			compileJsTsObjectShorthand(tool.name, tool.inputSchema),
		);
	}

	throw new Error(
		`Tool "${tool.name}" has an unsupported input schema. Supported inputs are JSON Schema objects, Zod schemas, Effect schemas, and JS/TS object shorthand.`,
	);
};

const compileMessage = (
	item: message,
): Effect.Effect<ReadonlyArray<inputMessageType>> =>
	(() => {
		switch (item.role) {
			case "user":
				return pipe(
					serializeUserContent(item),
					Effect.map(
						(content) =>
							[
								{
									role: "user" as const,
									content,
								},
							] as const,
					),
				);
			case "assistant":
				return Effect.gen(function* () {
					const items: inputMessageType[] = [];
					const textEntries = item.content.filter(
						(entry) => entry.type !== "toolcall",
					);

					if (textEntries.length > 0) {
						const content = yield* serializeAssistantTextContent(item.content);
						items.push({
							role: "assistant" as const,
							content,
						});
					}

					for (const entry of item.content) {
						if (entry.type === "toolcall") {
							items.push(serializeAssistantToolCall(entry));
						}
					}

					return items;
				});
			case "tool":
				return pipe(
					serializeToolResultMessage(item),
					Effect.map((content) => [content] as const),
				);
		}
	})();

/**
 * This turns a public tool definition into the Codex function tool shape.
 */
const compileToolDefinition = (
	tool: NonNullable<appRequestShape["tools"]>[number],
): codexFunctionTool => ({
	type: "function",
	name: tool.name,
	description: tool.description,
	parameters: normalizeToolInputSchema(tool),
	strict: true,
});

/**
 * This turns live `ToolDefinition` values into JSON-safe Codex `dynamicTools` entries for the local bridge.
 * Call from `run()` before `POST /v1/generate` so `inputSchema` is strict JSON Schema on the wire.
 */
export function toolsToBridgeDynamicToolSpecs(
	tools: ReadonlyArray<NonNullable<appRequestShape["tools"]>[number]>,
): Array<{ name: string; description: string; inputSchema: unknown }> {
	const specs = tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		inputSchema: normalizeToolInputSchema(tool),
	}));
	aiDebugLog("codex-compile", "built dynamic tool specs", {
		toolNames: specs.map((tool) => tool.name),
	});
	return specs;
}

export const compileRequest = (request: appRequestShape): codexRequestShape =>
	Effect.runSync(
		Effect.gen(function* () {
			const compiledMessages = yield* pipe(
				request.messages,
				EffectArray.map(compileMessage),
				Effect.all,
				Effect.map((items) => items.flat()),
			);

			const compiledTools = request.tools?.length
				? request.tools.map(compileToolDefinition)
				: undefined;
			aiDebugLog("codex-compile", "compiled request", {
				model: request.model,
				messageCount: compiledMessages.length,
				toolNames: request.tools?.map((tool) => tool.name) ?? [],
			});

			return {
				model: request.model,
				// Upstream requires `instructions` always present (never omit / undefined).
				instructions: request.system ?? "",
				input: compiledMessages,
				...(compiledTools ? { tools: compiledTools } : {}),
				stream: request.stream,
				store: false,
			};
		}),
	);
