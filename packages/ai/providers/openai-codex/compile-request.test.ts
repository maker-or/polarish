import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { z } from "zod";
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
							id: "fc_readme123",
							callId: "call_1",
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
					],
				},
				{
					type: "function_call",
					id: "fc_readme123",
					call_id: "call_1",
					name: "read_file",
					arguments: JSON.stringify({ path: "README.md" }),
				},
			],
			stream: true,
			store: false,
		});
	});

	test("serializes image attachments for user content", () => {
		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.2",
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
							type: "attachment",
							kind: "image",
							mimetype: "image/png",
							source: {
								type: "base64",
								data: "Zm9v",
							},
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
			model: "gpt-5.2",
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
					type: "function_call_output",
					call_id: "tool_1",
					output: "Detected a graph.",
				},
			],
			stream: false,
			store: false,
		});
	});

	test("serializes document attachments for user and tool content", () => {
		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.2",
			system: "Read the file.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Summarize this PDF.",
						},
						{
							type: "attachment",
							kind: "document",
							mimetype: "application/pdf",
							filename: "spec.pdf",
							source: {
								type: "url",
								url: "https://example.com/spec.pdf",
							},
						},
					],
					timestamp: 1,
				},
				{
					role: "tool",
					toolCallId: "tool_2",
					toolName: "fetch_report",
					content: [
						{
							type: "attachment",
							kind: "document",
							mimetype: "text/plain",
							filename: "notes.txt",
							source: {
								type: "file_id",
								fileId: "file_123",
							},
						},
					],
					isError: false,
					timestamp: 2,
				},
			],
		};

		expect(compileRequest(request)).toEqual({
			model: "gpt-5.2",
			instructions: "Read the file.",
			input: [
				{
					role: "user",
					content: [
						{
							type: "input_text",
							text: "Summarize this PDF.",
						},
						{
							type: "input_file",
							file_url: "https://example.com/spec.pdf",
							filename: "spec.pdf",
						},
					],
				},
				{
					type: "function_call_output",
					call_id: "tool_2",
					output: JSON.stringify({
						content: [
							{
								type: "input_file",
								file_id: "file_123",
								filename: "notes.txt",
							},
						],
						toolName: "fetch_report",
						isError: false,
					}),
				},
			],
			stream: false,
			store: false,
		});
	});

	test("converts zod tool schemas into JSON Schema for Codex", () => {
		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.4",
			system: "Call tools when needed.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Add two numbers.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "sum",
					description: "Adds two numbers.",
					inputSchema: z.object({
						a: z.number(),
						b: z.number(),
					}),
				},
			],
		};

		expect(compileRequest(request)).toEqual({
			model: "gpt-5.4",
			instructions: "Call tools when needed.",
			input: [
				{
					role: "user",
					content: "Add two numbers.",
				},
			],
			tools: [
				{
					type: "function",
					name: "sum",
					description: "Adds two numbers.",
					parameters: {
						type: "object",
						properties: {
							a: {
								type: "number",
							},
							b: {
								type: "number",
							},
						},
						required: ["a", "b"],
						additionalProperties: false,
						$schema: "http://json-schema.org/draft-07/schema#",
					},
					strict: true,
				},
			],
			stream: false,
			store: false,
		});
	});

	test("converts effect tool schemas into JSON Schema for Codex", () => {
		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.4",
			system: "Call tools when needed.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Fetch a report.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "fetch_report",
					description: "Fetches one report.",
					inputSchema: Schema.Struct({
						reportId: Schema.String,
					}),
				},
			],
		};

		expect(compileRequest(request)).toEqual({
			model: "gpt-5.4",
			instructions: "Call tools when needed.",
			input: [
				{
					role: "user",
					content: "Fetch a report.",
				},
			],
			tools: [
				{
					type: "function",
					name: "fetch_report",
					description: "Fetches one report.",
					parameters: {
						$schema: "http://json-schema.org/draft-07/schema#",
						type: "object",
						required: ["reportId"],
						properties: {
							reportId: {
								type: "string",
							},
						},
						additionalProperties: false,
					},
					strict: true,
				},
			],
			stream: false,
			store: false,
		});
	});

	test("passes JSON Schema tool inputs through unchanged", () => {
		const inputSchema = {
			type: "object",
			properties: {
				path: {
					type: "string",
				},
			},
			required: ["path"],
			additionalProperties: false,
		};

		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.4",
			system: "Use the tool.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Read one file.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "read_file",
					description: "Reads one file.",
					inputSchema,
				},
			],
		};

		expect(compileRequest(request).tools).toEqual([
			{
				type: "function",
				name: "read_file",
				description: "Reads one file.",
				parameters: inputSchema,
				strict: true,
			},
		]);
	});

	test("normalizes plain JSON Schema objects for strict function calling", () => {
		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.4",
			system: "Use the tool.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Search for one report.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "search_reports",
					description: "Searches reports.",
					inputSchema: {
						type: "object",
						properties: {
							query: {
								type: "string",
							},
							page: {
								type: "number",
							},
						},
					},
				},
			],
		};

		expect(compileRequest(request).tools?.[0]?.parameters).toEqual({
			type: "object",
			properties: {
				query: {
					type: "string",
				},
				page: {
					type: "number",
				},
			},
			required: ["query", "page"],
			additionalProperties: false,
		});
	});

	test("converts JS or TS object shorthand into strict JSON Schema", () => {
		const request: appRequestShape = {
			provider: "openai-codex",
			model: "gpt-5.4",
			system: "Use the tool.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Create one contact.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "create_contact",
					description: "Creates one contact.",
					inputSchema: {
						name: String,
						age: Number,
						active: Boolean,
						createdAt: Date,
						tags: [String] as const,
						address: {
							city: String,
						},
					},
				},
			],
		};

		expect(compileRequest(request).tools?.[0]?.parameters).toEqual({
			type: "object",
			properties: {
				name: {
					type: "string",
				},
				age: {
					type: "number",
				},
				active: {
					type: "boolean",
				},
				createdAt: {
					type: "string",
					format: "date-time",
				},
				tags: {
					type: "array",
					items: {
						type: "string",
					},
				},
				address: {
					type: "object",
					properties: {
						city: {
							type: "string",
						},
					},
					required: ["city"],
					additionalProperties: false,
				},
			},
			required: ["name", "age", "active", "createdAt", "tags", "address"],
			additionalProperties: false,
		});
	});

	test("rejects unsupported tool schema inputs", () => {
		const request = {
			provider: "openai-codex",
			model: "gpt-5.4",
			system: "Use the tool.",
			stream: false,
			temperature: 0,
			maxRetries: 1,
			messages: [
				{
					role: "user",
					content: "Read one file.",
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "read_file",
					description: "Reads one file.",
					inputSchema: "not-a-schema",
				},
			],
		} as appRequestShape;

		expect(() => compileRequest(request)).toThrow(
			'Tool "read_file" has an unsupported input schema. Supported inputs are JSON Schema objects, Zod schemas, Effect schemas, and JS/TS object shorthand.',
		);
	});
});
