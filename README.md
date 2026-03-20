# Mecha

An army of agents. Run autonomous AI bots in Docker containers with scheduling, webhooks, and bot-to-bot communication over Tailscale, while keeping your workspace ready for Codex CLI, Claude Code, and Gemini CLI.

## Quickstart

```bash
# Install
npm install -g @mecha.im/cli
# Or run without installing: npx @mecha.im/cli

# Initialize (builds Docker image)
mecha init

# Preferred for Codex runtime: login once with your Codex account
codex login
# Optional fallback: use an API key/profile
# export OPENAI_API_KEY=sk-...
# mecha auth add openai-main sk-...

# Spawn a bot inline
mecha spawn --name greeter --runtime codex --model gpt-5.3-codex --system "You greet people warmly."

# Chat with it
mecha query greeter "Hello!"

# List bots
mecha ls

# Stop / restart / remove
mecha stop greeter
mecha start greeter
mecha rm greeter
```

## Config File

```yaml
name: reviewer
runtime: codex
system: |
  You are a code reviewer. You review PRs for bugs,
  security issues, and style violations.
model: gpt-5.3-codex
# auth: openai-main   # optional when Codex account session is available
max_turns: 25
max_budget_usd: 1.00

schedule:
  - cron: "*/30 * * * *"
    prompt: "Check for new unreviewed PRs."

webhooks:
  accept:
    - "pull_request.opened"
    - "pull_request.synchronize"

workspace: ./myproject
expose: 8080
```

```bash
mecha spawn reviewer.yaml
```

## Commands

| Command | Description |
|---------|-------------|
| `mecha init [--headscale]` | Initialize mecha, build Docker image |
| `mecha spawn <config> [--dir] [--expose]` | Spawn bot from config file |
| `mecha spawn --name X --system "..." [--model M]` | Spawn bot inline |
| `mecha start <name>` | Start a stopped bot |
| `mecha stop <name>` | Stop a running bot |
| `mecha rm <name>` | Remove a bot |
| `mecha ls` | List all bots |
| `mecha query <name> "prompt"` | Send a one-shot prompt to a bot |
| `mecha restart <name>` | Restart a running bot |
| `mecha exec <name> [cmd...]` | Run a command inside a bot's container |
| `mecha logs <name> [-f]` | Show bot logs |
| `mecha auth add <profile> <key>` | Add auth profile |
| `mecha auth list` | List auth profiles |
| `mecha auth swap <bot> <profile>` | Swap auth for a bot |
| `mecha token` | Generate a bot token |
| `mecha dashboard [--port N]` | Start fleet dashboard |

## Architecture

```
Host (CLI)                    Container (Agent)
─────────────────────────     ──────────────────────────
src/cli.ts                    agent/entry.ts
src/docker.ts (dockerode)     agent/server.ts (Hono)
src/store.ts (~/.mecha/)      agent/session.ts
src/config.ts                 agent/scheduler.ts (croner)
src/auth.ts                   agent/webhook.ts
src/dashboard-server.ts       agent/costs.ts
                              agent/activity.ts
                              agent/tools/mecha-server.ts
                              agent/tools/mecha-call.ts
                              agent/tools/mecha-list.ts
```

## Bot-to-Bot Communication

Bots discover each other via Tailscale/Headscale and communicate using built-in MCP tools:

- `mecha_call` — send a prompt to another bot
- `mecha_list` — discover available bots on the network
- `mecha_new_session` — start a fresh conversation

## Scheduling

Bots run prompts on cron schedules with safety rails:
- Max 50 runs per day
- 10 minute timeout per run
- Auto-pause after 5 consecutive errors
- Skip if busy

## Dashboard

```bash
mecha dashboard
# Opens http://localhost:7700
```

Fleet dashboard shows all bots with status, costs, and a communication map. Click a bot to access its individual dashboard with chat, tasks, schedule, logs, and config views.

The dashboard now uses a local browser session on `localhost` so the SPA and proxied bot dashboards work without manually copying bearer tokens into browser requests.

## Auth

Auth works via existing Codex login session, or environment variable / named profiles:

```bash
# Preferred: Codex CLI account login (reused by mecha)
codex login

# Optional: OpenAI key/profile fallback
# export OPENAI_API_KEY=sk-...
# mecha auth add openai-main sk-...

# Claude runtime still supported
export ANTHROPIC_API_KEY=sk-ant-...
mecha auth add anthropic-main sk-ant-...
mecha auth add tailscale-main tskey-auth-...
```

Profiles are stored at `~/.mecha/auth/<name>.json`.

## Container Runtime Notes

- Workspace-mounted bots load shared project instructions from `AGENTS.md`, Claude Code settings from `.claude/`, and Codex CLI prompts/skills from `.codex/` when present.
- Bots without a mounted workspace run from a stable state-backed working directory and only load user settings.
- Host Codex auth (`~/.codex/auth.json`) is copied into bot state by default when available. Set `MECHA_COPY_HOST_CODEX_AUTH=0` to disable this behavior.

## Codex CLI Workspace Support

This repository now includes tracked Codex CLI prompt files under `.codex/prompts/` so the same operational workflows are available in Codex CLI as slash-style prompts:

- `bump-version` — bump versions, build, tag, publish
- `hot-dashboard` — build and hot-deploy the bot dashboard for preview

The root `AGENTS.md` remains the shared source of truth for Claude Code, Codex CLI, and Gemini CLI instructions.

## Testing

```bash
# Fast local tests
npm test

# Docker-dependent suites
npm run test:docker

# Live SDK/API suite (costs money)
npm run test:live
```

## Credits

The pixel office engine uses artwork and inspiration from:

- [MetroCity Free TopDown Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) by Jik-A-4 — character sprites
- [pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca — architecture & inspiration

## Requirements

- Node.js 22+
- Docker (Colima, Docker Desktop, or any OCI runtime)
- Tailscale (optional, for multi-machine mesh)
