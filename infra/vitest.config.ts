import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
    // Synthesizing CDK stacks is slower than a normal unit test.
    testTimeout: 30_000,
  },
});
