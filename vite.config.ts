import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
  },
  test: {
    root: ".",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 83,
        lines: 85,
      },
    },
  },
});
