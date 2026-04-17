# @polarish/cli

Polarish CLI configures the local bridge that browser apps use to reach vendor runtimes like Codex on your machine.

The bridge HTTP server ships **inside** this package (`src/bridge/`). Installing `@polarish/cli` is enough; you do not install a separate `@polarish/bridge` package.

## Common commands

```bash
polarish status
polarish bridge run
polarish origins list
polarish origins add https://app.example.com
polarish origins remove https://app.example.com
```

## Installation

```bash
bun add -g @polarish/cli
```

(`npm i -g @polarish/cli` works the same.)

## What gets published

The npm tarball includes the compiled CLI under `dist/`, including `**dist/bridge/**` (the HTTP server and Codex adapter). Consumers install **one** package; they do not install `@polarish/bridge` separately.

## Related

- `[@polarish/ai](https://www.npmjs.com/package/@polarish/ai)` — browser/app SDK that calls `POST {baseUrl}/v1/generate` against this bridge.

