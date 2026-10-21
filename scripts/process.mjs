import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const BACKEND = fileURLToPath(new URL("../backend/", import.meta.url));
export const CONTRACTS = fileURLToPath(new URL("../contracts/", import.meta.url));

const require = createRequire(resolve(BACKEND, "package.json"));
const dotenv = require("dotenv");

export function loadBackendEnv() {
  const result = dotenv.config({
    path: resolve(BACKEND, ".env"),
    override: false,
  });
  if (result.error && result.error.code !== "ENOENT") {
    throw new Error(`Could not load backend/.env: ${result.error.message}`);
  }
  return process.env;
}

let shimDirectory;
if (process.platform === "win32") {
  shimDirectory = mkdtempSync(join(tmpdir(), "sigil-pnpm-shim-"));
  const corepackEntrypoint = resolve(dirname(process.execPath), "node_modules/corepack/dist/corepack.js");
  writeFileSync(join(shimDirectory, "pnpm.cmd"), `@"${process.execPath}" "${corepackEntrypoint}" pnpm %*\r\n`);
  process.env.PATH = `${shimDirectory}${delimiter}${process.env.PATH ?? ""}`;
  process.once("exit", () => rmSync(shimDirectory, { recursive: true, force: true }));
}

const packageManagerCommand = process.platform === "win32" ? process.execPath : "pnpm";

export function startPnpm(args, options = {}) {
  const commandArgs = process.platform === "win32"
    ? [resolve(dirname(process.execPath), "node_modules/corepack/dist/corepack.js"), "pnpm", ...args]
    : args;
  return spawn(packageManagerCommand, commandArgs, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
}

export function runPnpm(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = startPnpm(args, options);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm ${args.join(" ")} exited with ${signal || code}`));
    });
  });
}

export function runPnpmCapture(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = startPnpm(args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    const stdout = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`pnpm ${args.join(" ")} exited with ${signal || code}`));
    });
  });
}

export function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (!result.error) return;
  }
  child.kill("SIGTERM");
}

export async function waitForRpc(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Hardhat node exited early with code ${child.exitCode}`);
    }
    let chainId;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) chainId = (await response.json()).result;
    } catch {
      // The node is still starting.
    }
    if (chainId) {
      if (chainId.toLowerCase() !== "0x7a69") {
        throw new Error(`Expected local Hardhat chain ID 31337 at ${url}, received ${chainId}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for the local chain at ${url}`);
}

export async function waitForHttp(url, child, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}
