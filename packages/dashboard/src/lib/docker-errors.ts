import { NextResponse } from "next/server";
import { ContainerNotFoundError } from "@mecha/core";

export function isConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "statusCode" in err && (err as { statusCode: number }).statusCode === 409;
}

export function handleDockerError(err: unknown): NextResponse {
  if (err instanceof ContainerNotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isConflictError(err)) {
    return NextResponse.json({ error: "Conflict: container state unchanged" }, { status: 409 });
  }
  throw err;
}
