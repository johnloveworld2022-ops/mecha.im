import { NextResponse, type NextRequest } from "next/server";
import { resolveMcpEndpoint } from "@mecha/service";
import { ContainerNotFoundError } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const reveal = request.nextUrl.searchParams.get("reveal") === "true";
  try {
    const { endpoint, token } = await resolveMcpEndpoint(client, id);
    const maskedToken = token
      ? `${token.slice(0, 4)}...${token.slice(-4)}`
      : undefined;
    const config = {
      name: `mecha-${id}`,
      url: endpoint,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
    return NextResponse.json({
      endpoint,
      token: reveal ? token : maskedToken,
      config,
    });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to resolve MCP endpoint" },
      { status: 500 },
    );
  }
});
