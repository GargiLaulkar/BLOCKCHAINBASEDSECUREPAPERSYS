import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { ExamVaultABI, ExamVaultBytecode } from "@sigil/contracts-types";

const backendDir = fileURLToPath(new URL("../", import.meta.url));
const workerPath = fileURLToPath(new URL("./helpers/indexer-process-worker.ts", import.meta.url));
const rpcUrl = "http://127.0.0.1:8545";
let temporaryDirectory: string | undefined;

describe.skipIf(process.env.SIGIL_INDEXER_PROCESS_TEST !== "1")(
  "BE-07 OS-process indexer restart",
  () => {
    afterAll(async () => {
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    });

    it("kills a child during real-chain backfill and resumes without gaps or duplicate events", async () => {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signers = await provider.listAccounts();
      expect(signers.length).toBeGreaterThanOrEqual(7);
      temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "sigil-indexer-process-"));
      const stateDir = path.join(temporaryDirectory, "state");
      const databasePath = path.join(temporaryDirectory, "rows.json");
      await mkdir(stateDir);

      const factory = new ethers.ContractFactory(ExamVaultABI, ExamVaultBytecode, signers[0]);
      const contract = await factory.deploy(60);
      const deploymentReceipt = await contract.deploymentTransaction()?.wait();
      if (!deploymentReceipt) throw new Error("ExamVault deployment did not produce a receipt");
      const contractAddress = await contract.getAddress();
      const authorityAddress = await signers[1].getAddress();
      const setterAddress = await signers[2].getAddress();
      const holderAddresses = await Promise.all(
        [signers[3], signers[4], signers[5]].map((signer) => signer.getAddress()),
      );
      const centreAddress = await signers[6].getAddress();

      for (const [address, role] of [
        [authorityAddress, 1],
        [setterAddress, 2],
        ...holderAddresses.map((address) => [address, 3]),
        [centreAddress, 4],
      ] as Array<[string, number]>) {
        await (await contract.registerParticipant(address, role, ethers.ZeroHash)).wait();
      }

      const publicKey = ethers.hexlify(
        ethers.concat([new Uint8Array([4]), ethers.randomBytes(64)]),
      );
      for (const signer of [signers[3], signers[4], signers[5]]) {
        await (await contract.connect(signer).setEncryptionKey(publicKey)).wait();
      }

      const latestBlock = await provider.getBlock("latest");
      if (!latestBlock) throw new Error("Unable to read latest Hardhat block");
      const examConfig = {
        metaHash: ethers.keccak256(ethers.randomBytes(32)),
        releaseOpensAt: latestBlock.timestamp + 120,
        examStartsAt: latestBlock.timestamp + 240,
        examEndsAt: latestBlock.timestamp + 600,
        threshold: 2,
        holders: holderAddresses,
        setters: [setterAddress],
        centres: [centreAddress],
        quotas: [2],
      };
      const createReceipt = await (
        await contract.connect(signers[1]).createExam(examConfig)
      ).wait();
      const examCreated = createReceipt?.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event) => event?.name === "ExamCreated");
      if (!examCreated) throw new Error("ExamCreated event missing from fixture transaction");
      const examId = examCreated.args.examId.toString();
      const batchHash = ethers.keccak256(ethers.randomBytes(32));
      const openKey = ethers.hexlify(ethers.concat([new Uint8Array([4]), ethers.randomBytes(64)]));
      await (await contract.connect(signers[1]).openCollection(examId, openKey)).wait();
      await (await contract.connect(signers[2]).submitBatch(examId, 0, batchHash, 1)).wait();

      await writeFile(
        databasePath,
        JSON.stringify({
          chainEvents: {},
          exams: {},
          batches: {
            [`${examId}_0_${batchHash.toLowerCase()}`]: {
              id: "pending-process-test-batch",
              examId,
              sectionId: 0,
              ciphertextHash: batchHash,
              setter: setterAddress,
              questionCount: 1,
              startInSection: 0,
              blobPath: "",
              status: "pending",
            },
          },
          panelMembers: {},
          participants: {},
        }),
      );

      const arguments_ = [
        rpcUrl,
        contractAddress,
        String(deploymentReceipt.blockNumber),
        stateDir,
        databasePath,
      ];
      const interrupted = spawnWorker([...arguments_, "pause"]);
      const pauseMessage = await waitForMessage(interrupted, "backfill-paused");
      expect(pauseMessage.logCount).toBeGreaterThan(0);
      interrupted.kill("SIGTERM");
      await waitForExit(interrupted);

      await runWorker(arguments_);
      const firstSnapshot = await readFile(databasePath, "utf8");
      const indexed = JSON.parse(firstSnapshot);
      const expectedLogs = await provider.getLogs({
        address: contractAddress,
        fromBlock: deploymentReceipt.blockNumber + 1,
        toBlock: "latest",
      });
      const indexedKeys = Object.keys(indexed.chainEvents).sort();
      const expectedKeys = expectedLogs.map((log) => `${log.transactionHash}_${log.index}`).sort();
      expect(indexedKeys).toEqual(expectedKeys);
      expect(new Set(indexedKeys).size).toBe(indexedKeys.length);
      expect(indexed.exams[examId].state).toBe(1);
      expect(indexed.batches[`${examId}_0_${batchHash.toLowerCase()}`].status).toBe("confirmed");

      const stableProjection = JSON.stringify({
        chainEvents: indexed.chainEvents,
        exam: indexed.exams[examId],
        batch: indexed.batches[`${examId}_0_${batchHash.toLowerCase()}`],
      });
      await runWorker(arguments_);
      const replayed = JSON.parse(await readFile(databasePath, "utf8"));
      expect(
        JSON.stringify({
          chainEvents: replayed.chainEvents,
          exam: replayed.exams[examId],
          batch: replayed.batches[`${examId}_0_${batchHash.toLowerCase()}`],
        }),
      ).toBe(stableProjection);
      await provider.destroy();
    }, 120_000);
  },
);

function spawnWorker(args: string[]) {
  return spawn(process.execPath, ["--import", "tsx", workerPath, ...args], {
    cwd: backendDir,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
}

function waitForMessage(child: ChildProcess, type: string) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for worker message ${type}`)),
      30_000,
    );
    child.on("message", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "worker-error") {
        clearTimeout(timeout);
        reject(new Error(message.message));
      } else if (message.type === type) {
        clearTimeout(timeout);
        resolve(message as Record<string, any>);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForExit(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for interrupted indexer process to exit")),
      10_000,
    );
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0)
        reject(new Error("Interrupted indexer exited successfully instead of being killed"));
      else if (code !== null || signal) resolve();
      else reject(new Error("Interrupted indexer exited without a status"));
    });
  });
}

async function runWorker(args: string[]) {
  const child = spawnWorker(args);
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const result = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for child indexer")),
      60_000,
    );
    child.on("message", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "backfill-complete") {
        clearTimeout(timeout);
        resolve();
      } else if (message.type === "worker-error") {
        clearTimeout(timeout);
        reject(new Error(message.message));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  await result;
  const status = await exit;
  if (status.code !== 0) {
    throw new Error(
      `Indexer child exited with code ${status.code} (${status.signal || "no signal"})`,
    );
  }
}
