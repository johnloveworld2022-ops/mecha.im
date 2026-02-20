import type { createDockerClient } from "@mecha/docker";
import type { Formatter } from "./output/formatter.js";

export type DockerClient = ReturnType<typeof createDockerClient>;

export interface CommandDeps {
  dockerClient: DockerClient;
  formatter: Formatter;
}
