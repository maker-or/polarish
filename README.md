# Polarish

If you are building anything with AI and you want your users to bring their existing AI subscriptions , instead of you maintaining the infernce cost , then you are in the right place , we have build polarish for exactly same purpouse , so that user can bring in their existing ai subs and you can foucs more on building your product instead of worring about the infernce cost

# How to use

First ask your users to download the polarish cli tool  and run the commnad

```bash
bun add -g @polarish/cli
```

After installation, users must run this command once:

```bash
polarish
```

This first run is compulsory and will guide them through installing and signing in to Codex and/or Claude Code.

```bash
polarish origins add https://app.example.com
```

that's it , Now as a devloper use the polarish [ai package](./packages/ai/README.md) 

# important

the polarish wrap round the codex and clauade-code so that it is really imporatnt that your users have codex and claude-code installed and signed into it

- codex setup follw this [link](https://developers.openai.com/codex/cli)
- claude-code setup follow this [link](https://claude.com/product/claude-code)

polarish is heavily inspired from t3code and pimono ❤️‍🔥  