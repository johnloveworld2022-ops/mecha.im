# Project Instructions

> mecha.im is a local-first multi-agent runtime where each Mecha is a containerized CASA (Claude Agent SDK App) instance.

## Guidelines

### CLI-First Development (Mandatory)

Every new feature follows this strict pipeline: **CLI → Test → GUI**

1. **CLI First** — Implement in `packages/cli/src/commands/` using `CommandDeps` DI pattern
2. **Test Next** — Write tests in `packages/cli/__tests__/`, meet coverage gates (100%)
3. **Verify Gates** — `pnpm test` + `pnpm test:coverage` + `pnpm typecheck` must all pass
4. **GUI Last** — Only then add dashboard/ui components as thin wrappers over shared logic

Use `/cli-first-dev` skill to guide implementation of any new feature.

Rules enforcing this pattern:
- `.claude/rules/cli-first.md` — Global enforcement on all TS/TSX files
- `.claude/rules/no-gui-without-cli.md` — Blocks GUI-only features in dashboard/ui

## Shared Memory

**Always write new instructions, rules, and memory to `AGENTS.md` only.**

Never modify `CLAUDE.md` or `GEMINI.md` directly - they only import `AGENTS.md`.
This ensures Claude Code, Codex CLI, and Gemini CLI share the same context consistently.

## Project Structure

- `.claude/agents/` - Custom subagents for specialized tasks
- `.claude/skills/` - Claude Code skills (slash commands)
- `.claude/rules/` - Modular rules auto-loaded into context
- `.codex/skills/` - Codex CLI skills
- `.codex/prompts/` - Codex CLI custom slash commands
- `.gemini/skills/` - Gemini CLI skills
- `.gemini/commands/` - Gemini CLI custom slash commands (TOML)
- `.mcp.json` - MCP server configuration
