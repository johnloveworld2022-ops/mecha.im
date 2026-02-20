import type { DockerClient } from "./client.js";

/** Check if a Docker image exists locally */
export async function imageExists(
  client: DockerClient,
  imageName: string,
): Promise<boolean> {
  try {
    const image = client.docker.getImage(imageName);
    await image.inspect();
    return true;
  } catch {
    return false;
  }
}

/** Pull a Docker image from registry */
export async function pullImage(
  client: DockerClient,
  imageName: string,
  onProgress?: (event: { status: string; progress?: string }) => void,
): Promise<void> {
  const stream = await client.docker.pull(imageName);
  return new Promise((resolve, reject) => {
    client.docker.modem.followProgress(
      stream,
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      },
      onProgress,
    );
  });
}
