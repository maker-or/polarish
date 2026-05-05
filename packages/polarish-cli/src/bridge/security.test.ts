import { describe, expect, test } from "bun:test";
import { isAllowedOrigin, tokenizeOriginHeader } from "./security.ts";

describe("tokenizeOriginHeader", () => {
	test("splits on whitespace and trims edges", () => {
		expect(tokenizeOriginHeader("  https://a https://b  ")).toEqual([
			"https://a",
			"https://b",
		]);
	});
});

describe("isAllowedOrigin", () => {
	test("allows one configured origin", () => {
		expect(
			isAllowedOrigin("https://app.example.com", ["https://app.example.com"]),
		).toBe(true);
	});

	test("allows multi-token header when every token is permitted", () => {
		const allowed = ["http://127.0.0.1:8787", "http://localhost:5173"];
		const header = "http://127.0.0.1:8787 http://localhost:5173";
		expect(isAllowedOrigin(header, allowed)).toBe(true);
	});

	test("allows multi-token header when at least one token is permitted", () => {
		const allowed = ["https://good.example"];
		expect(
			isAllowedOrigin("https://evil.example https://good.example", allowed),
		).toBe(true);
	});

	test("rejects when no token is permitted", () => {
		expect(
			isAllowedOrigin("https://a.example https://b.example", [
				"https://c.example",
			]),
		).toBe(false);
	});

	test("allows implicit loopback for a single origin", () => {
		expect(isAllowedOrigin("http://localhost:3000", [])).toBe(true);
	});

	test("allows multiple loopback tokens without bridge.json entries", () => {
		expect(
			isAllowedOrigin("http://localhost:3000 http://127.0.0.1:4000", []),
		).toBe(true);
	});

	test("allows multi-token header if any token is loopback, even when others are unlisted", () => {
		expect(
			isAllowedOrigin("http://localhost:3000 https://prod.example", []),
		).toBe(true);
		expect(
			isAllowedOrigin("http://localhost:3000 https://prod.example", [
				"https://prod.example",
			]),
		).toBe(true);
	});
});
