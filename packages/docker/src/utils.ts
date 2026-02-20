/** Check if a Docker API error is a 404 Not Found */
export function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "statusCode" in err &&
    (err as { statusCode: number }).statusCode === 404
  );
}
