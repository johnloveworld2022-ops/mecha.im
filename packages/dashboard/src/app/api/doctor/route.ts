import { NextResponse } from "next/server";
import { ping } from "@mecha/docker";
import { networkName } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async () => {
  const client = getDockerClient();
  const checks: { name: string; ok: boolean; message: string }[] = [];

  try {
    await ping(client);
    checks.push({ name: "docker", ok: true, message: "Docker is available" });
  } catch {
    checks.push({ name: "docker", ok: false, message: "Docker is not available" });
    return NextResponse.json({ healthy: false, checks }, { status: 503 });
  }

  try {
    const net = networkName();
    const networks = await client.docker.listNetworks({ filters: { name: [net] } });
    const found = networks.some((n: { Name: string }) => n.Name === net);
    checks.push({
      name: "network",
      ok: found,
      message: found ? `Network '${net}' exists` : `Network '${net}' not found`,
    });
  } catch {
    checks.push({ name: "network", ok: false, message: "Failed to check network" });
  }

  const healthy = checks.every((c) => c.ok);
  return NextResponse.json({ healthy, checks }, { status: healthy ? 200 : 503 });
});
