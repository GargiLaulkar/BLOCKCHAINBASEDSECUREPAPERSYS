import { readFile, writeFile } from "node:fs/promises";
import { ethers } from "ethers";
import { ExamVaultIndexer } from "../../src/indexer/indexer.js";
import { IndexerStateManager } from "../../src/indexer/state.js";
import type { Config } from "../../src/config.js";

interface Snapshot {
  chainEvents: Record<string, any>;
  exams: Record<string, any>;
  batches: Record<string, any>;
  panelMembers: Record<string, any>;
  participants: Record<string, any>;
}

function key(examId: string, sectionId: number, ciphertextHash: string) {
  return `${examId}_${sectionId}_${ciphertextHash.toLowerCase()}`;
}

async function main() {
  const [rpcUrl, contractAddress, deployBlockArg, stateDir, databasePath, pauseArg] =
    process.argv.slice(2);
  const deployBlock = Number(deployBlockArg);
  const pauseAfterGetLogs = pauseArg === "pause";
  const snapshot = JSON.parse(await readFile(databasePath, "utf8")) as Snapshot;
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const db = {
    chainEvent: {
      upsert: async ({ where, create, update }: any) => {
        const id = `${where.txHash_logIndex.txHash}_${where.txHash_logIndex.logIndex}`;
        const row = { ...(snapshot.chainEvents[id] || create), ...update };
        snapshot.chainEvents[id] = row;
        return row;
      },
    },
    exam: {
      upsert: async ({ where, create, update }: any) => {
        const id = where.examId;
        snapshot.exams[id] = { ...(snapshot.exams[id] || create), ...update };
        return snapshot.exams[id];
      },
      updateMany: async ({ where, data }: any) => {
        const row = snapshot.exams[where.examId];
        if (!row || (where.state?.lt !== undefined && row.state >= where.state.lt)) {
          return { count: 0 };
        }
        snapshot.exams[where.examId] = { ...row, ...data };
        return { count: 1 };
      },
    },
    panelMember: {
      upsert: async ({ where, create }: any) => {
        const id = `${where.examId_address_kind.examId}_${where.examId_address_kind.address}_${where.examId_address_kind.kind}`;
        snapshot.panelMembers[id] ||= create;
        return snapshot.panelMembers[id];
      },
    },
    batch: {
      findUnique: async ({ where }: any) => {
        const value = where.examId_sectionId_ciphertextHash;
        return snapshot.batches[key(value.examId, value.sectionId, value.ciphertextHash)] || null;
      },
      create: async ({ data }: any) => {
        const id = key(data.examId, data.sectionId, data.ciphertextHash);
        snapshot.batches[id] = { id, ...data };
        return snapshot.batches[id];
      },
      update: async ({ where, data }: any) => {
        const entry = Object.entries(snapshot.batches).find(([, row]) => row.id === where.id);
        if (!entry) throw new Error(`Batch ${where.id} not found`);
        const [id, row] = entry;
        snapshot.batches[id] = { ...row, ...data };
        return snapshot.batches[id];
      },
    },
    participant: {
      findUnique: async ({ where }: any) => snapshot.participants[where.address] || null,
      create: async ({ data }: any) => {
        snapshot.participants[data.address] = data;
        return data;
      },
      update: async ({ where, data }: any) => {
        snapshot.participants[where.address] = {
          ...snapshot.participants[where.address],
          ...data,
        };
        return snapshot.participants[where.address];
      },
    },
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => {
      const result = await callback(db);
      await writeFile(databasePath, JSON.stringify(snapshot, jsonReplacer, 2));
      return result;
    },
  };

  if (pauseAfterGetLogs) {
    const getLogs = provider.getLogs.bind(provider);
    provider.getLogs = async (filter) => {
      const logs = await getLogs(filter);
      process.send?.({ type: "backfill-paused", logCount: logs.length });
      await new Promise<void>(() => {});
      return logs;
    };
  }

  const config: Config = {
    PORT: 4000,
    NODE_ENV: "test",
    RPC_URL: rpcUrl,
    CHAIN_ID: 31337,
    CONTRACT_ADDRESS: contractAddress,
    DEPLOY_BLOCK: deployBlock,
    DATABASE_URL: "postgresql://process-test",
    SESSION_SECRET: "process-indexer-test-secret-value",
    FRONTEND_ORIGIN: "http://localhost:5173",
    BLOB_DIR: stateDir,
  };

  try {
    const indexer = new ExamVaultIndexer(config, provider, db, new IndexerStateManager(stateDir));
    await indexer.processToBlock();
    await writeFile(databasePath, JSON.stringify(snapshot, jsonReplacer, 2));
    process.send?.({ type: "backfill-complete" });
  } finally {
    provider.destroy();
  }
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

main().catch((error: unknown) => {
  process.send?.({
    type: "worker-error",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
