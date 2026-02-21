# Installation

## Prerequisites

- **Node.js** 22 or later
- **Docker** — running and accessible via the Docker socket
- **pnpm** — recommended package manager

## Install the CLI

```bash
pnpm add -g @mecha/cli
```

Or with npm:

```bash
npm install -g @mecha/cli
```

## Verify Installation

```bash
mecha --version
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `CLAUDE_CODE_OAUTH_TOKEN` | No | OAuth token for Claude Code authentication |
| `MECHA_OTP` | No | One-time password for agent creation |

## Docker Setup

Mecha requires Docker to be running. Verify with:

```bash
docker info
```

If Docker is not installed, follow the [official Docker installation guide](https://docs.docker.com/get-docker/).

## Next Steps

Once installed, head to the [Getting Started guide](./) to create your first Mecha.
