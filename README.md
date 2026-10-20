# squadagents

**English** | [Español](README.es.md)

A Claude Code mod. It picks haiku/sonnet/opus for each subagent using local rules (0 tokens) and shows agents live: model, task, tokens, cost, time and log (`/squadagents`).

## Install

In a Claude Code session:

```
/plugin install squadagents --marketplace LordSantox/squadagents
```

Answer `y` to add the marketplace, then choose the scope (user or project).

From a terminal:

```bash
claude plugin install squadagents --marketplace LordSantox/squadagents
```

### Install by asking Claude

Paste this into Claude Code:

> Install the mod from https://github.com/LordSantox/squadagents following the instructions in its README.

## What it does

- **Model routing**: when you launch a subagent without `model`, the mod picks one by rules (`hooks/router.ts`):
  Plan→opus · Explore→haiku (sonnet if it verifies code) · validate/investigate/decide/plan→opus · tests/diagnose/implement→sonnet · short search/read→haiku · everything else→sonnet.
- An explicit `model` is kept only if it is the same price or cheaper than the rule's pick.
- **`/squadagents` panel**: live subagents with model, task, tokens, estimated cost, savings vs opus, and log.
- **Streak warning**: if the main agent takes many direct actions in a row (browser >3, Bash/Edit/Write >5), it adds a note suggesting delegation.

The UI text and notes are in Spanish.

## Uninstall

```
/plugin uninstall squadagents
```

## License

MIT
