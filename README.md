# Hax Monorepo

This repository is now a Turborepo workspace for the Hax platform.

## Apps

- `apps/desktop` - Electron + Vite desktop connector
- `apps/web` - Next.js web console scaffold

## Shared

- `convex/` - shared Convex project
- `packages/config` - shared TypeScript config
- `packages/shared` - shared package placeholder

## Tooling

- `bun` workspaces
- `turbo` for task orchestration
- `biome` for formatting and linting
- `tailwindcss` in web and desktop
- `shadcn/ui` scaffold files in web and desktop

## Commands

```bash
bun run dev
bun run build
bun run lint
bun run typecheck
bun run web:dev
bun run desktop:dev
```

