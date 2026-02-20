import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { errMsg } from "../types.js";
import { startContainer, stopContainer } from "@mecha/docker";
import { containerName, type MechaId } from "@mecha/core";
import type { DockerClient } from "../types.js";

type Action = (client: DockerClient, name: string) => Promise<void>;

function pastTense(verb: string): string {
  if (verb.endsWith("e")) return verb + "d";
  if (/[^aeiou]([aeiou][^aeiouw])$/.test(verb)) return verb + verb.at(-1) + "ed";
  return verb + "ed";
}

function makeLifecycleCommand(verb: string, description: string, action: Action) {
  return (parent: Command, deps: CommandDeps) => {
    parent.command(`${verb} <id>`).description(description)
      .action(async (id: string) => {
        const { dockerClient, formatter } = deps;
        try {
          await action(dockerClient, containerName(id as MechaId));
          formatter.success(`Mecha '${id}' ${pastTense(verb)}.`);
        } catch (err) { formatter.error(errMsg(err)); process.exitCode = 1; }
      });
  };
}

export const registerStartCommand = makeLifecycleCommand(
  "start", "Start a Mecha by ID",
  (client, name) => startContainer(client, name),
);

export const registerStopCommand = makeLifecycleCommand(
  "stop", "Stop a Mecha by ID",
  (client, name) => stopContainer(client, name),
);

export const registerRestartCommand = makeLifecycleCommand(
  "restart", "Restart a Mecha by ID",
  async (client, name) => {
    await stopContainer(client, name);
    await startContainer(client, name);
  },
);
