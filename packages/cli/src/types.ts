import type { createDockerClient } from "@mecha/docker";
import type { Formatter } from "./output/formatter.js";

export type DockerClient = ReturnType<typeof createDockerClient>;

export interface CommandDeps {
  dockerClient: DockerClient;
  formatter: Formatter;
}

/** Extract error message from unknown catch value */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
