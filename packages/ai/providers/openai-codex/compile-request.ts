import { Array, Effect, Option, pipe } from "effect";
import type {
  ImageContent,
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

const toImageContentPart = (
  content: ImageContent,
): Effect.Effect<imageInput> =>
  Effect.succeed({
    type: "input_image",
    image_url: `data:${content.mimetype};base64,${content.data}`,
  });

const collapseContent = (
  parts: ReadonlyArray<codexInputContent>,
): string | codexInputContent[] =>
  parts.length === 1 && parts[0]?.type === "input_text" ? parts[0].text : [...parts];

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
    Array.map((entry) => {
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
    Array.map((entry) => {
      switch (entry.type) {
        case "text":
          return toTextContentPart(entry);
        case "image":
          return toImageContentPart(entry);
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
    Array.map((entry) => {
      switch (entry.type) {
        case "text":
          return toTextContentPart(entry);
        case "image":
          return toImageContentPart(entry);
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
        Array.map(compileMessage),
        Effect.all,
      );

      return {
        model: request.model,
        // Upstream requires `instructions` always present (never omit / undefined).
        instructions: request.system ?? "",
        input: Array.filterMap(compiledMessages, (item) => item),
        stream: request.stream,
        store: false,
      };
    }),
  );
