import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { resolveMcpEndpoint } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

export function registerMcpCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("mcp <id>")
    .description("Print MCP endpoint URL and token for a Mecha")
    .option("--show-token", "Show full auth token (masked by default)")
    .option("--config", "Output ready-to-paste MCP client config JSON")
    .action(async (id: string, opts: { showToken?: boolean; config?: boolean }) => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;

      try {
        const result = await resolveMcpEndpoint(dockerClient, id);

        if (opts.config) {
          const serverEntry: Record<string, unknown> = { url: result.endpoint };
          if (result.token) {
            serverEntry.headers = { Authorization: `Bearer ${result.token}` };
          }
          formatter.json({ mcpServers: { [`mecha-${id}`]: serverEntry } });
          return;
        }

        if (jsonMode) {
          const output = { ...result };
          if (output.token && !opts.showToken) {
            output.token = `${output.token.slice(0, 4)}...${output.token.slice(-4)}`;
          }
          formatter.json(output);
        } else {
          formatter.info(`Endpoint: ${result.endpoint}`);
          if (result.token) {
            const display = opts.showToken
              ? result.token
              : `${result.token.slice(0, 4)}...${result.token.slice(-4)}  (use --show-token for full value)`;
            formatter.info(`Token:    ${display}`);
          } else {
            formatter.info("Token:    (not found)");
          }
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
