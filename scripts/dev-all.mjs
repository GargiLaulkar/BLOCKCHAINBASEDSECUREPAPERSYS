import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BACKEND, CONTRACTS, runPnpm, startPnpm, stopChild, waitForHttp, waitForRpc } from "./process.mjs";

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const children = [];
let shuttingDown = false;

function cleanup(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.reverse()) stopChild(child);
  process.exitCode = exitCode;
}

process.once("SIGINT", () => cleanup(130));
process.once("SIGTERM", () => cleanup(143));

async function main() {
  let chainIsReady = false;
  try {
    await waitForRpc(rpcUrl, null, 1500);
    chainIsReady = true;
    console.log(`Using existing Hardhat chain at ${rpcUrl}`);
  } catch (error) {
    if (!error.message.startsWith("Timed out waiting for the local chain")) throw error;
    const chain = startPnpm(["dev:chain"]);
    children.push(chain);
    await waitForRpc(rpcUrl, chain);
    chainIsReady = true;
  }
  if (!chainIsReady) throw new Error("Local Hardhat chain did not start");

  const deploymentPath = resolve(CONTRACTS, "deployments", "localhost.json");
  let deployment;
  try {
    deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const hasLiveDeployment = await (async () => {
    if (!deployment?.address) return false;
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [deployment.address, "latest"] }),
      });
      const result = await response.json();
      return response.ok && typeof result.result === "string" && result.result !== "0x";
    } catch {
      return false;
    }
  })();

  if (!hasLiveDeployment) {
    await runPnpm(["--filter", "@sigil/contracts", "exec", "hardhat", "run", "scripts/deploy.ts", "--network", "localhost"]);
    deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  }

  try {
    await runPnpm(["exec", "docker", "compose", "up", "-d", "--wait", "postgres"]);
  } catch (error) {
    throw new Error(`Could not start PostgreSQL. Install and start Docker Desktop, then retry. ${error.message}`);
  }
  process.env.RPC_URL = rpcUrl;
  process.env.CHAIN_ID = String(deployment.chainId);
  process.env.CONTRACT_ADDRESS = deployment.address;
  process.env.DEPLOY_BLOCK = String(deployment.blockNumber);

  await runPnpm(["demo:bootstrap-roles"]);
  await runPnpm(["--filter", "@sigil/backend", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], { cwd: BACKEND });

  const api = startPnpm(["dev:api"]);
  const web = startPnpm(["dev:web"]);
  children.push(api, web);
  await Promise.all([
    waitForHttp("http://127.0.0.1:4000/api/health", api, "SIGIL API"),
    waitForHttp("http://127.0.0.1:5173", web, "SIGIL web app"),
  ]);
  console.log("SIGIL stack is ready: http://localhost:5173");
  console.log("Press Ctrl+C to stop the API, web app, and any chain started by this command.");

  const childExit = await Promise.race(
    children.map((child) => new Promise((resolveExit) => child.once("exit", (code) => resolveExit(code ?? 1))))
  );
  cleanup(childExit);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  cleanup(1);
});
