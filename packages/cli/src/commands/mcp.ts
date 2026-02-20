import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { resolveHostPort } from "./ui.js";

export function registerMcpCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("mcp <id>")
    .description("Print MCP endpoint URL and token for a Mecha")
    .action(async (id: string) => {
      const { formatter } = deps;
      const jsonMode = parent.opts().json ?? false;

      try {
        const hostPort = await resolveHostPort(deps, id);
        if (!hostPort) {
          formatter.error("No port binding found for this Mecha.");
          process.exitCode = 1;
          return;
        }

        const endpoint = `http://127.0.0.1:${hostPort}/mcp`;
        const token = "(check container logs for auth token)";

        if (jsonMode) {
          formatter.json({ endpoint, token });
        } else {
          formatter.info(`Endpoint: ${endpoint}`);
          formatter.info(`Token:    ${token}`);
        }
      } catch (err) {
        formatter.error(errMsg(err));
        process.exitCode = 1;
      }
    });
}
