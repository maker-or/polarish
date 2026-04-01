import { Effect, Array as EffectArray, Option, pipe } from "effect";
import type {
	AttachmentContent,
	TextContent,
	ToolResultMessage,
	UserMessage,
	message,
} from "../../types";
import type {
	appRequestShape,
	assistantContentPart,
	codexInputContent,
	codexRequestShape,
	fileInput,
	imageInput,
	inputMessageType,
	textInput,
} from "./types";

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

const serializeAssistantContent = (
	content: Extract<message, { role: "assistant" }>["content"],
): Effect.Effect<string | assistantContentPart[]> =>
	pipe(
		content,
		EffectArray.map((entry) => {
			switch (entry.type) {
				case "text":
					return Effect.succeed(toAssistantTextPart(entry.text));
				case "thinking":
					return Effect.succeed(toAssistantTextPart(entry.thinking));
				case "toolcall":
					return Effect.succeed(
						toAssistantTextPart(
							JSON.stringify({
								id: entry.id,
								name: entry.name,
								arguments: entry.arguments,
							}),
						),
					);
			}
		}),
		Effect.all,
		Effect.map(collapseAssistantContent),
	);

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
			}
		}),
		Effect.all,
		Effect.map(collapseContent),
	);

const serializeToolResultMessage = (
	toolMessage: ToolResultMessage,
): Effect.Effect<inputMessageType> =>
	pipe(
		serializeToolContent(toolMessage),
		Effect.map((content) => ({
			role: "user" as const,
			content:
				typeof content === "string"
					? `[tool:${toolMessage.toolName} id=${toolMessage.toolCallId} error=${toolMessage.isError}] ${content}`
					: [
							{
								type: "input_text" as const,
								text: `[tool:${toolMessage.toolName} id=${toolMessage.toolCallId} error=${toolMessage.isError}]`,
							},
							...content,
						],
		})),
	);

const compileMessage = (
	item: message,
): Effect.Effect<Option.Option<inputMessageType>> =>
	(() => {
		switch (item.role) {
			case "user":
				return pipe(
					serializeUserContent(item),
					Effect.map((content) =>
						Option.some({
							role: "user" as const,
							content,
						}),
					),
				);
			case "assistant":
				return pipe(
					serializeAssistantContent(item.content),
					Effect.map((content) =>
						Option.some({
							role: "assistant" as const,
							content,
						}),
					),
				);
			case "tool":
				return pipe(
					serializeToolResultMessage(item),
					Effect.map((content) => Option.some(content)),
				);
		}
	})();

export const compileRequest = (request: appRequestShape): codexRequestShape =>
	Effect.runSync(
		Effect.gen(function* () {
			const compiledMessages = yield* pipe(
				request.messages,
				EffectArray.map(compileMessage),
				Effect.all,
			);

			return {
				model: request.model,
				// Upstream requires `instructions` always present (never omit / undefined).
				instructions: request.system ?? "",
				input: EffectArray.filterMap(compiledMessages, (item) => item),
				stream: request.stream,
				store: false,
			};
		}),
	);
