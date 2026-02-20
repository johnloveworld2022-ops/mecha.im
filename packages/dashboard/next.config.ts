import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "dockerode",
    "docker-modem",
    "ssh2",
    "cpu-features",
    "@mecha/docker",
    "@mecha/core",
  ],
  // webpack externals are required in addition to serverExternalPackages because
  // pnpm workspace symlinks prevent Next.js from resolving the native module chain
  // (dockerode → docker-modem → ssh2 → cpu-features) via serverExternalPackages alone.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(/^(dockerode|docker-modem|ssh2|cpu-features)$/);
    }
    return config;
  },
};

export default nextConfig;
