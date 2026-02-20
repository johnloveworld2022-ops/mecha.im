import { NextResponse } from "next/server";
import { mechaDoctor } from "@mecha/service";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async () => {
  const client = getDockerClient();
  const result = await mechaDoctor(client);

  const checks = [
    {
      name: "docker",
      ok: result.dockerAvailable,
      message: result.dockerAvailable ? "Docker is available" : "Docker is not available",
    },
    ...(result.dockerAvailable
      ? [{
          name: "network",
          ok: result.networkExists,
          message: result.networkExists ? "Network exists" : "Network not found",
        }]
      : []),
  ];

  const healthy = checks.every((c) => c.ok);
  return NextResponse.json({ healthy, checks }, { status: healthy ? 200 : 503 });
});
