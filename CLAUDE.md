# Polarish

Polarish lets developers build applications where users bring their own AI subscriptions — decoupling AI access from the tool developer.

## Key Commands

```bash
# Install CLI
bun add -g @polarish/cli

# Add an origin
polarish origins add https://app.example.com

# Run the bridge
polarish bridge run

# Status
polarish status
```

## Packages

- `packages/hax-cli` — CLI tool that wraps Codex/Claude Code as a local HTTP bridge
- `packages/ai` — TypeScript SDK for browser/app integration

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review