import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { inspectContainer } from "@mecha/docker";
import { containerName, DEFAULTS } from "@mecha/core";
import type { MechaId } from "@mecha/core";

export function registerMcpCommand(parent: Command, deps: CommandDeps): void {
  parent
    .command("mcp <id>")
    .description("Print MCP endpoint URL and token for a Mecha")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      const jsonMode = parent.opts().json ?? false;
      const cName = containerName(id as MechaId);

      try {
        const info = await inspectContainer(dockerClient, cName);
        const portKey = `${DEFAULTS.CONTAINER_PORT}/tcp`;
        const bindings =
          info.NetworkSettings.Ports[portKey];
        const hostPort = bindings?.[0]?.HostPort;

        if (!hostPort) {
          formatter.error("No port binding found for this Mecha.");
          process.exitCode = 1;
          return;
        }

        const endpoint = `http://127.0.0.1:${hostPort}/mcp`;
        // TODO: Retrieve the real auth token from the runtime (stored in state volume)
        // For now, instruct the user to check container logs for the generated token
        const token = "(check container logs for auth token)";

        if (jsonMode) {
          formatter.json({ endpoint, token });
        } else {
          formatter.info(`Endpoint: ${endpoint}`);
          formatter.info(`Token:    ${token}`);
        }
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
