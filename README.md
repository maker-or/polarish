# Polarish

If you're building AI apps and you're tired of handling inference costs or forcing users to pay for yet another AI subscription, this is for you.

Polarsih lets your users bring their own AI subscriptions (Codex, Claude Code, etc.) into your app.

You focus on building workflows.  
Your users use the AI they already pay for.

# Agent skills
install the agent skills 
```bash
npx skills add maker-or/skills
```

# How to use

First ask your users to download the polarish cli tool  and run the commnad

```bash
bun add -g @polarish/cli
```

After installation, users must run this command once:

```bash
polarish
```

This first run is compulsory and will guide them through installing and signing in to Codex and Claude Code.

```bash
polarish origins add https://app.example.com
```

that's it , Now as a devloper use the polarish [ai package](./packages/ai/README.md) to build your ai app

# Important

the polarish wrap round the codex and clauade-code so that it is really imporatnt that your users have codex and claude-code installed and signed into it

- codex setup follw this [link](https://developers.openai.com/codex/cli)
- claude-code setup follow this [link](https://claude.com/product/claude-code)

polarish is heavily inspired from [t3code](https://github.com/pingdotgg/t3code) and [pi-mono](https://github.com/badlogic/pi-mono/) ❤️‍🔥
