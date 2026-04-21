# @polarish/cli

Polarish CLI configures the local bridge that browser apps use to reach vendor runtimes like Codex on your machine.

On first run, the CLI checks whether Codex and Claude Code are installed and authenticated. If not, it opens an interactive "Connect your subscriptions" flow to install and log in selected providers in one session.

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

## Important first step

After installing the package, you must run:

```bash
polarish
```

This first run is required. It will guide you through installing and authenticating Codex and/or Claude Code.