# Project Instructions

> Mecha: An army of agents.

## Guidelines

<!-- Add your project-specific instructions here -->

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

## Codex CLI Repository Notes

- Keep shared cross-assistant behavior in the repository root `AGENTS.md`.
- Store tracked Codex CLI reusable prompts in `.codex/prompts/`.
- Store tracked Codex CLI reusable skills in `.codex/skills/`.
- Do not commit local Codex auth/session files; only commit reusable project assets.
