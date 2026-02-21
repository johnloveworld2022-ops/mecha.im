import type { DockerClient } from "@mecha/docker";
import { ping } from "@mecha/docker";
import { networkName } from "@mecha/core";
import type { DoctorResultType } from "@mecha/contracts";

// --- mechaDoctor ---
export async function mechaDoctor(client: DockerClient): Promise<DoctorResultType> {
  const issues: string[] = [];
  let dockerAvailable = false;
  let networkExists = false;

  try {
    await ping(client);
    dockerAvailable = true;
  } catch {
    issues.push("Docker is not available. Is Docker/Colima running?");
  }

  if (dockerAvailable) {
    try {
      const net = networkName();
      const networks = await client.docker.listNetworks({ filters: { name: [net] } });
      networkExists = networks.some((n: { Name: string }) => n.Name === net);
      if (!networkExists) {
        issues.push(`Network '${net}' not found. Run 'mecha init' first.`);
      }
    } catch {
      issues.push("Failed to check network status.");
    }
  }

  return { dockerAvailable, networkExists, issues };
}
