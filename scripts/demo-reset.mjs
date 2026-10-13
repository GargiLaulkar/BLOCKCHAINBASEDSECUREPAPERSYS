import { access, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";
import { BACKEND, CONTRACTS, ROOT, loadBackendEnv, runPnpm } from "./process.mjs";

async function main() {
  loadBackendEnv();
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const blobSetting = process.env.BLOB_DIR || "./uploads";
  const blobPath = resolve(BACKEND, blobSetting);
  const relativeToBackend = relative(BACKEND, blobPath);
  const forbiddenRoots = [parse(blobPath).root, resolve(ROOT), resolve(BACKEND), resolve(homedir())];
  if (
    !isAbsolute(blobPath) ||
    forbiddenRoots.includes(blobPath) ||
    relativeToBackend === ".." ||
    relativeToBackend.startsWith(`..${sep}`)
  ) {
    throw new Error(`Refusing to wipe unsafe BLOB_DIR path: ${blobPath}. Configure a directory inside backend/ for demo reset.`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Refusing to reset: DATABASE_URL must be configured in the environment or backend/.env and point to a local PostgreSQL database.");
  }
  let database;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error("Refusing to reset: DATABASE_URL is not a valid database URL (credential details withheld).");
  }
  if (!["localhost", "127.0.0.1"].includes(database.hostname)) {
    throw new Error(`Refusing to reset a non-local database host: ${database.hostname}.`);
  }

  const rpc = new URL(rpcUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(rpc.hostname)) {
    throw new Error(`Refusing to reset non-local RPC host: ${rpc.hostname}`);
  }
  const chainResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(3000),
  });
  const chainResult = await chainResponse.json();
  if (!chainResponse.ok || chainResult.result?.toLowerCase() !== "0x7a69") {
    throw new Error(`Refusing to reset RPC that is not a local Hardhat chain with ID 31337: ${rpcUrl}`);
  }

  await runPnpm(
    ["--filter", "@sigil/backend", "exec", "prisma", "migrate", "reset", "--force", "--skip-seed", "--schema", "prisma/schema.prisma"],
    { cwd: BACKEND }
  );

  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "hardhat_reset", params: [] }),
    signal: AbortSignal.timeout(3000),
  });
  if (!rpcResponse.ok) throw new Error(`Local chain reset failed with HTTP ${rpcResponse.status}`);
  const rpcResult = await rpcResponse.json();
  if (rpcResult.error) throw new Error(`Local chain reset failed: ${rpcResult.error.message}`);

  try {
    await access(blobPath);
    await rm(blobPath, { recursive: true, force: false });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(blobPath, { recursive: true });

  await runPnpm([
    "--filter",
    "@sigil/contracts",
    "exec",
    "hardhat",
    "run",
    "scripts/deploy.ts",
    "--network",
    "localhost",
  ]);

  const deploymentPath = resolve(CONTRACTS, "deployments", "localhost.json");
  console.log(`Local chain, database, and blob storage reset. Fresh empty deployment: ${deploymentPath}`);
  console.log("No roles or demo records were seeded. Restart the API if it was already running.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
