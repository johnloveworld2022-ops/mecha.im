import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "packages/core/src/**",
        "packages/contracts/src/**",
        "packages/service/src/**",
        "packages/docker/src/**",
        "packages/cli/src/**",
        "packages/runtime/src/**",
      ],
      exclude: [
        "**/__tests__/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/index.ts",
        "packages/ui/**",
        "packages/hub/**",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      reporter: ["text-summary"],
    },
  },
});
