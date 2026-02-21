import { NextResponse, type NextRequest } from "next/server";
import { resolveMcpEndpoint } from "@mecha/service";
import { ContainerNotFoundError } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const { endpoint, token } = await resolveMcpEndpoint(client, id);
    const config = {
      name: `mecha-${id}`,
      url: endpoint,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
    return NextResponse.json({ endpoint, token, config });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
});
