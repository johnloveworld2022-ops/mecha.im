# Getting Started

Mecha is a local-first multi-agent runtime where each **Mecha** is a containerized [CASA](https://docs.anthropic.com/en/docs/claude-agent-sdk) (Claude Agent SDK App) instance.

## What is Mecha?

Mecha lets you spin up isolated Claude agents in Docker containers, each with its own workspace, tools, and permissions. You manage them through a simple CLI or web dashboard.

## Key Concepts

- **Mecha** — A running containerized Claude agent instance
- **CASA** — Claude Agent SDK App, the runtime inside each container
- **Project Path** — The local directory mounted into the container as the agent's workspace

## Quick Start

```bash
# Install
pnpm add -g @mecha/cli

# Create and start a new agent
mecha up ./my-project

# List running agents
mecha ls

# Stop an agent
mecha down <mecha-id>
```

See the [Installation guide](./installation) for detailed setup instructions.
