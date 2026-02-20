import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { resolveMcpEndpoint } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";

export function registerMcpCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("mcp <id>")
    .description("Print MCP endpoint URL and token for a Mecha")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;

      try {
        const result = await resolveMcpEndpoint(dockerClient, id);

        if (jsonMode) {
          formatter.json(result);
        } else {
          formatter.info(`Endpoint: ${result.endpoint}`);
          formatter.info(`Note:     ${result.note}`);
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}
