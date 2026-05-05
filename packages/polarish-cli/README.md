# @polarish/cli

Polarish is an open-source SDK for building AI workflows where users bring their own AI subscriptions.

It has two packages that work in tandem:

- `@polarish/ai` — a TypeScript SDK to build AI workflows in your app.
- `@polarish/cli` — a local CLI bridge that helps users connect their AI subscriptions and run those workflows through local provider runtimes.

To deliver the full end-user experience, you typically use both packages together.

Running `polarish` with no arguments (or `polarish connect`) opens an interactive flow to install and authenticate Codex and/or Claude Code when needed.

After you change allowed origins with `polarish origins add` or `remove`, the running bridge reloads `bridge.json` on each request—no restart needed for new origins. If you change the listen **port** in config, stop `polarish bridge run` (or your autostart job) and start it again so the server can bind the new port.

The bridge HTTP server ships **inside** this package (`src/bridge/`). Installing `@polarish/cli` is enough; you do not install a separate `@polarish/bridge` package.

## Common commands

```bash
polarish
polarish status
polarish bridge run
polarish origins add https://app.example.com
polarish origins remove https://app.example.com
```

## Installation

```bash
bun add -g @polarish/cli
```

```bash
bun add @polarish/ai
```

## Important first step

After installing the package, run:

```bash
polarish
```

This guides you through installing and authenticating Codex and/or Claude Code. Use `polarish status` to see bridge settings, allowed browser origins, and which providers are connected.