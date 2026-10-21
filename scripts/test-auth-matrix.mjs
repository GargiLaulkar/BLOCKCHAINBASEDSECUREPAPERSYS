import net from "node:net";
import { runPnpm, startPnpm, stopChild, waitForRpc } from "./process.mjs";

let chain;
let testProcess;

async function findPort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function main() {
  await runPnpm(["--filter", "@sigil/contracts", "exec", "hardhat", "compile"]);
  const port = await findPort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  chain = startPnpm([
    "--filter",
    "@sigil/contracts",
    "exec",
    "hardhat",
    "node",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  await waitForRpc(rpcUrl, chain);
  testProcess = startPnpm(["--filter", "@sigil/backend", "run", "test:authorization-matrix"], {
    env: { ...process.env, LOG_LEVEL: "silent", SIGIL_AUTH_MATRIX_RPC_URL: rpcUrl },
  });
  const code = await new Promise((resolveCode, reject) => {
    testProcess.once("error", reject);
    testProcess.once("exit", (exitCode, signal) => resolveCode(exitCode ?? (signal ? 1 : 0)));
  });
  if (code !== 0) throw new Error(`Authorization matrix tests failed with exit code ${code}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    stopChild(testProcess);
    stopChild(chain);
  });
