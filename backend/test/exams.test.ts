import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { canonical } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import type { Contract } from "ethers";

// Mock Prisma client
vi.mock("../src/db.js", () => {
  const mockDb = new Map<string, any>();
  return {
    prisma: {
      exam: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve(Array.from(mockDb.values()))),
        findUnique: vi.fn().mockImplementation(({ where }: { where: { examId: string } }) => {
          return Promise.resolve(mockDb.get(where.examId) || null);
        }),
        create: vi.fn().mockImplementation(({ data }: { data: any }) => {
          mockDb.set(data.examId, { ...data, createdAt: new Date(), updatedAt: new Date() });
          return Promise.resolve(mockDb.get(data.examId));
        }),
        upsert: vi.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = mockDb.get(where.examId);
          if (existing) {
            const updated = { ...existing, ...update, updatedAt: new Date() };
            mockDb.set(where.examId, updated);
            return Promise.resolve(updated);
          }
          const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
          mockDb.set(where.examId, created);
          return Promise.resolve(created);
        }),
      },
    },
  };
});

describe("Exam Metadata & Endpoints (BE-04)", () => {
  const validConfig = parseConfig({
    PORT: "4000",
    NODE_ENV: "test",
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "31337",
    CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    DEPLOY_BLOCK: "0",
    DATABASE_URL: "postgresql://sigil:sigil_password@localhost:5432/sigil_db?schema=public",
    SESSION_SECRET: "super-secret-session-key-at-least-32-characters-long",
    FRONTEND_ORIGIN: "http://localhost:5173",
    BLOB_DIR: "./uploads",
  });

  const authorityWallet = ethers.Wallet.createRandom();

  const sampleMeta = {
    title: "National Entrance Examination 2026",
    sections: [
      { name: "Physics", quota: 45 },
      { name: "Chemistry", quota: 45 },
    ],
    releaseOpensAt: 1770000000,
    examStartsAt: 1770003600,
    examEndsAt: 1770014400,
  };

  const expectedMetaHash = canonical.keccakJson(sampleMeta);

  const mockContract = {
    getExam: vi.fn().mockImplementation((examId: bigint) => {
      if (examId === 1n) {
        return Promise.resolve({
          id: 1n,
          state: 0, // Draft
          authority: authorityWallet.address,
          metaHash: expectedMetaHash,
          releaseOpensAt: 1770000000n,
          examStartsAt: 1770003600n,
          examEndsAt: 1770014400n,
          threshold: 3,
          holderCount: 5,
          bankHash: ethers.ZeroHash,
          seed: ethers.ZeroHash,
        });
      }
      throw new Error("ExamNotFound");
    }),
    hasRole: vi.fn().mockImplementation(() => Promise.resolve(true)),
  } as unknown as Contract;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject unauthenticated POST /api/exams/:id/meta", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const res = await request(app).post("/api/exams/1/meta").send(sampleMeta);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("should reject invalid metadata schema", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    // Mock session by logging in via SIWE
    // Alternatively test with agent having session
    const nonceRes = await agent.get("/api/auth/nonce");
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: authorityWallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce: nonceRes.body.nonce,
      issuedAt: new Date().toISOString(),
    });
    const msg = siwe.prepareMessage();
    const sig = await authorityWallet.signMessage(msg);
    await agent.post("/api/auth/verify").send({ message: msg, signature: sig });

    // Send invalid metadata (title too short)
    const invalidMeta = { ...sampleMeta, title: "Hi" };
    const res = await agent.post("/api/exams/1/meta").send(invalidMeta);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("should reject when canonical hash does not match on-chain metaHash (HASH_MISMATCH)", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    // Login as authority
    const nonceRes = await agent.get("/api/auth/nonce");
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: authorityWallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce: nonceRes.body.nonce,
      issuedAt: new Date().toISOString(),
    });
    const msg = siwe.prepareMessage();
    const sig = await authorityWallet.signMessage(msg);
    await agent.post("/api/auth/verify").send({ message: msg, signature: sig });

    // Send valid schema but with different content so hash mismatches expectedMetaHash
    const mismatchedMeta = {
      ...sampleMeta,
      title: "Different Exam Title That Does Not Match Stored Hash",
    };
    const res = await agent.post("/api/exams/1/meta").send(mismatchedMeta);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("HASH_MISMATCH");
    expect(res.body.error.message).toContain("Computed canonical hash");
  });

  it("should successfully store metadata when hash matches on-chain metaHash", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    // Login as authority
    const nonceRes = await agent.get("/api/auth/nonce");
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: authorityWallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce: nonceRes.body.nonce,
      issuedAt: new Date().toISOString(),
    });
    const msg = siwe.prepareMessage();
    const sig = await authorityWallet.signMessage(msg);
    await agent.post("/api/auth/verify").send({ message: msg, signature: sig });

    // Submit matching metadata
    const res = await agent.post("/api/exams/1/meta").send(sampleMeta);

    expect(res.status).toBe(200);
    expect(res.body.examId).toBe("1");
    expect(res.body.metaHash).toBe(expectedMetaHash);
    expect(res.body.metaJson).toEqual(sampleMeta);

    // Verify GET /api/exams/1 returns the stored meta
    const detailRes = await agent.get("/api/exams/1");
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.metaJson).toEqual(sampleMeta);
  });

  it("should return public summary variant for unauthenticated GET /api/exams and /api/exams/:id", async () => {
    const app = createApp(validConfig, undefined, mockContract);

    // Unauthenticated GET detail
    const detailRes = await request(app).get("/api/exams/1");
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.metaHash).toBe(expectedMetaHash);
    expect(detailRes.body.metaJson).toBeUndefined(); // public view excludes metaJson

    // Unauthenticated GET list
    const listRes = await request(app).get("/api/exams");
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body[0].metaJson).toBeUndefined();
  });
});
