import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../package.json",
);

const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
	name: string;
	version: string;
};

/**
 * Published package name (e.g. `@polarish/cli`) for update checks and `polarish update` hints.
 */
export const PACKAGE_NAME = pkg.name;

/**
 * Current CLI version from `package.json`.
 */
export const PACKAGE_VERSION = pkg.version;
