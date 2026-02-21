import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import { mechaStart, mechaStop, mechaRestart } from "@mecha/service";
import { toUserMessage, toExitCode } from "@mecha/contracts";
import type { DockerClient } from "@mecha/docker";

type Action = (client: DockerClient, id: string) => Promise<void>;

function pastTense(verb: string): string {
  /* v8 ignore start */
  if (verb.endsWith("e")) return verb + "d";
  /* v8 ignore stop */
  if (/[^aeiou]([aeiou][^aeiouw])$/.test(verb)) return verb + verb.at(-1) + "ed";
  return verb + "ed";
}

function makeLifecycleCommand(verb: string, description: string, action: Action) {
  return (parent: Command, deps: CommandDeps) => {
    parent.command(`${verb} <id>`).description(description)
      .action(async (id: string) => {
        const { dockerClient, formatter } = deps;
        try {
          await action(dockerClient, id);
          formatter.success(`Mecha '${id}' ${pastTense(verb)}.`);
        } catch (err) {
          formatter.error(toUserMessage(err));
          process.exitCode = toExitCode(err);
        }
      });
  };
}

export const registerStartCommand = makeLifecycleCommand(
  "start", "Start a Mecha by ID",
  (client, id) => mechaStart(client, id),
);

export const registerStopCommand = makeLifecycleCommand(
  "stop", "Stop a Mecha by ID",
  (client, id) => mechaStop(client, id),
);

export const registerRestartCommand = makeLifecycleCommand(
  "restart", "Restart a Mecha by ID",
  (client, id) => mechaRestart(client, id),
);
