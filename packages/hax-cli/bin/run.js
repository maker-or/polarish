#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "@oclif/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** When no subcommand is given, run the interactive `menu` command (auth + provider picker). */
const passthrough = process.argv.slice(2);
if (passthrough.length === 0) {
	process.argv.push("menu");
}

await execute({
	dir: join(__dirname, ".."),
});
