import { describe, expect, test } from "bun:test";
import { compileRequest } from "./compile-request.ts";
import type { appRequestShape } from "./types.ts";

describe("compileRequest", () => {
  test("compiles unified codex requests into the upstream payload", () => {
    const request: appRequestShape = {
      provider: "openai-codex",
      model: "gpt-5.4",
      system: "Be concise.",
      stream: true,
      temperature: 0.4,
      maxRetries: 2,
      messages: [
        {
          role: "user",
          content: "Describe the current status.",
          timestamp: 1,
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Calling the tool now.",
            },
            {
              type: "thinking",
              thinking: "Need repo context first.",
            },
            {
              type: "toolcall",
              id: "call_1",
              name: "read_file",
              arguments: {
                path: "README.md",
              },
            },
          ],
          usage: {
            input: 1,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 3,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          provider: "openai-codex",
          stopReason: "toolUse",
          timestamp: 2,
        },
      ],
    };

    expect(compileRequest(request)).toEqual({
      model: "gpt-5.4",
      instructions: "Be concise.",
      input: [
        {
          role: "user",
          content: "Describe the current status.",
        },
        {
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Calling the tool now.",
            },
            {
              type: "output_text",
              text: "Need repo context first.",
            },
            {
              type: "output_text",
              text: JSON.stringify({
                id: "call_1",
                name: "read_file",
                arguments: {
                  path: "README.md",
                },
              }),
            },
          ],
        },
      ],
      stream: true,
      store: false,
    });
  });

  test("serializes multimodal user and tool content", () => {
    const request: appRequestShape = {
      provider: "openai-codex",
      model: "gpt-5.2-codex",
      system: "Look at the image.",
      stream: false,
      temperature: 0,
      maxRetries: 1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What is in this image?",
            },
            {
              type: "image",
              data: "Zm9v",
              mimetype: "image/png",
            },
          ],
          timestamp: 1,
        },
        {
          role: "tool",
          toolCallId: "tool_1",
          toolName: "vision",
          content: [
            {
              type: "text",
              text: "Detected a graph.",
            },
          ],
          isError: false,
          timestamp: 2,
        },
      ],
    };

    expect(compileRequest(request)).toEqual({
      model: "gpt-5.2-codex",
      instructions: "Look at the image.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "What is in this image?",
            },
            {
              type: "input_image",
              image_url: "data:image/png;base64,Zm9v",
            },
          ],
        },
        {
          role: "user",
          content: "[tool:vision id=tool_1 error=false] Detected a graph.",
        },
      ],
      stream: false,
      store: false,
    });
  });
});
