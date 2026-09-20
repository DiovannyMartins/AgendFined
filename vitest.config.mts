import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const serverOnlyTestStub = fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url));
const testResolve = {
  alias: { "server-only": serverOnlyTestStub },
  tsconfigPaths: true,
};

export default defineConfig({
  plugins: [react()],
  resolve: testResolve,
  test: {
    projects: [
      {
        resolve: testResolve,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: [
            "lib/**/*.test.{ts,tsx}",
            "app/**/*.test.{ts,tsx}",
            "components/**/*.test.{ts,tsx}",
          ],
        },
      },
      {
        resolve: testResolve,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.integration.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Integration files share the remote project; running them in parallel
          // triggers a transient `businesses_owner_id_fkey` race on setup. Serial
          // file execution makes the suite deterministic.
          fileParallelism: false,
        },
      },
    ],
  },
});
