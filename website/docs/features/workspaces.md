# Workspace Mounting

Bots can access host directories by mounting them as workspaces.

## Configuration

```yaml
name: reviewer
system: "You review code in the mounted project."
workspace: ./myproject
workspace_writable: false
```

| Field | Default | Description |
|-------|---------|-------------|
| `workspace` | — | Path to mount (resolved relative to config file) |
| `workspace_writable` | `false` | If `true`, the bot can modify files in the workspace |

## Read-Only (Default)

By default, workspaces are mounted read-only. The bot can read and analyze code but cannot modify files. This is the safe default for review and analysis bots.

## Writable Workspaces

Set `workspace_writable: true` to let the bot make changes:

```yaml
name: formatter
system: "You format and lint code."
workspace: ./myproject
workspace_writable: true
```

::: warning
Writable workspaces give the bot full write access to the mounted directory. Pair this with `max_turns` and `max_budget_usd` limits.
:::

## Project Settings

When a workspace is mounted, the bot loads project settings from it:
- `AGENTS.md` for shared agent instructions
- `.claude/settings.json` and `CLAUDE.md` for Claude Code-specific behavior
- `.codex/prompts/` and `.codex/skills/` for Codex CLI workflows
- Skills and plugins

Bots without a mounted workspace run from a stable state-backed working directory and only load user-level settings.

## Codex CLI Helpers

This repository tracks Codex CLI prompt definitions in `.codex/prompts/` so common maintenance workflows can be reused across assistants without copying instructions by hand.

## Host Codex Auth

By default, host Codex authentication is **not** copied into containers. To opt in:

```bash
export MECHA_COPY_HOST_CODEX_AUTH=1
```
