import { BACKEND, loadBackendEnv, runPnpm, waitForRpc } from "./process.mjs";

async function main() {
  loadBackendEnv();
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  await waitForRpc(rpcUrl, null, 3000);
  await runPnpm(
    ["--filter", "@sigil/backend", "exec", "vitest", "run", "test/indexer-process.test.ts"],
    {
      cwd: BACKEND,
      env: { ...process.env, SIGIL_INDEXER_PROCESS_TEST: "1" },
    },
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
