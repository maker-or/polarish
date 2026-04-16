#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "@oclif/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** When no subcommand is given, show the local bridge status. */
const passthrough = process.argv.slice(2);
if (passthrough.length === 0) {
	process.argv.push("status");
}

await execute({
	dir: join(__dirname, ".."),
});
