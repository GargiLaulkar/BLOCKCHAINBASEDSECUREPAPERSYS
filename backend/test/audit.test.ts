import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { canonical, schemas } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";

const storedTraces = new Map<string, any>();
const auditorAddresses = new Set<string>();

vi.mock("../src/db.js", () => ({
  prisma: {
    exam: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
        where.examId === "7" ? { examId: "7" } : null
      ),
    },
    leakTrace: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const trace = {
          id: `trace-${storedTraces.size + 1}`,
          createdAt: new Date(),
          ...data,
        };
        storedTraces.set(trace.id, trace);
        return trace;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const trace = storedTraces.get(where.id);
        return trace?.auditor === where.auditor ? trace : null;
      }),
    },
  },
}));

describe("Auditor leak trace endpoints (BE-09)", () => {
  const auditor1 = ethers.Wallet.createRandom();
  const auditor2 = ethers.Wallet.createRandom();
  const nonAuditor = ethers.Wallet.createRandom();
  const centre = ethers.Wallet.createRandom();
  const config = parseConfig({
    PORT: "4000",
    NODE_ENV: "test",
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "31337",
    CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    DEPLOY_BLOCK: "0",
    DATABASE_URL: "postgresql://localhost:5432/sigil_db",
    SESSION_SECRET: "test-session-secret-that-is-at-least-32-chars",
    FRONTEND_ORIGIN: "http://localhost:5173",
    BLOB_DIR: "./uploads",
  });
  const contract = {
    hasRole: vi.fn().mockImplementation(async (role: string, address: string) =>
      role === ethers.id("AUDITOR_ROLE") && auditorAddresses.has(ethers.getAddress(address))
    ),
  } as any;
  const report = {
    matches: [
      {
        variantHash: `0x${"ab".repeat(32)}`,
        centre: centre.address,
        score: 0.91,
        evidence: ["4:2", "5:1"],
      },
    ],
  };

  async function createAgent(wallet: ethers.Wallet) {
    const agent = request.agent(createApp(config, undefined, contract));
    const nonce = (await agent.get("/api/auth/nonce")).body.nonce;
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    await agent.post("/api/auth/verify").send({
      message,
      signature: await wallet.signMessage(message),
    });
    return agent;
  }

  beforeEach(() => {
    storedTraces.clear();
    auditorAddresses.clear();
    auditorAddresses.add(auditor1.address);
    auditorAddresses.add(auditor2.address);
  });

  it("allows only current auditors to create valid, hash-verified MatchReports and read their own traces", async () => {
    const agent = await createAgent(auditor1);
    const result = await agent.post("/api/audit/traces").send({
      examId: "7",
      evidenceHash: canonical.keccakJson(report),
      result: report,
    });
    expect(result.status).toBe(201);
    expect(result.body.auditor).toBe(auditor1.address);
    expect(result.body.resultJson).toEqual(report);
    expect(schemas.MatchReportSchema.safeParse(result.body.resultJson).success).toBe(true);

    const ownTrace = await agent.get(`/api/audit/traces/${result.body.id}`);
    expect(ownTrace.status).toBe(200);
    expect(ownTrace.body.id).toBe(result.body.id);

    const otherAuditor = await createAgent(auditor2);
    const denied = await otherAuditor.get(`/api/audit/traces/${result.body.id}`);
    expect(denied.status).toBe(404);
  });

  it("denies non-auditors and validates MatchReport and evidence hash", async () => {
    const nonAuditorAgent = await createAgent(nonAuditor);
    const denied = await nonAuditorAgent.post("/api/audit/traces").send({
      examId: "7",
      evidenceHash: canonical.keccakJson(report),
      result: report,
    });
    expect(denied.status).toBe(403);

    const auditorAgent = await createAgent(auditor1);
    const invalidReport = await auditorAgent.post("/api/audit/traces").send({
      examId: "7",
      evidenceHash: `0x${"00".repeat(32)}`,
      result: { matches: [{ centre: centre.address, score: 2, evidence: [] }] },
    });
    expect(invalidReport.status).toBe(400);
    expect(invalidReport.body.error.code).toBe("VALIDATION_FAILED");

    const badHash = await auditorAgent.post("/api/audit/traces").send({
      examId: "7",
      evidenceHash: ethers.keccak256(ethers.toUtf8Bytes("different evidence")),
      result: report,
    });
    expect(badHash.status).toBe(400);
    expect(badHash.body.error.code).toBe("HASH_MISMATCH");

    const unknownExam = await auditorAgent.post("/api/audit/traces").send({
      examId: "999",
      evidenceHash: canonical.keccakJson(report),
      result: report,
    });
    expect(unknownExam.status).toBe(404);
  });

  it("rechecks auditor role on the chain for existing sessions", async () => {
    const agent = await createAgent(auditor1);
    auditorAddresses.delete(auditor1.address);
    const denied = await agent.post("/api/audit/traces").send({
      examId: "7",
      evidenceHash: canonical.keccakJson(report),
      result: report,
    });
    expect(denied.status).toBe(403);
  });
});
