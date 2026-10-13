import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { canonical } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import type { Contract } from "ethers";

const mockExams = new Map<string, any>();
const mockPanel = new Map<string, any>();

vi.mock("../src/db.js", () => {
  return {
    prisma: {
      exam: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve(Array.from(mockExams.values()))),
        findUnique: vi.fn().mockImplementation(({ where }: { where: { examId: string } }) => {
          return Promise.resolve(mockExams.get(where.examId) || null);
        }),
        create: vi.fn().mockImplementation(({ data }: { data: any }) => {
          mockExams.set(data.examId, { ...data, createdAt: new Date(), updatedAt: new Date() });
          return Promise.resolve(mockExams.get(data.examId));
        }),
        upsert: vi.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = mockExams.get(where.examId);
          if (existing) {
            const updated = { ...existing, ...update, updatedAt: new Date() };
            mockExams.set(where.examId, updated);
            return Promise.resolve(updated);
          }
          const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
          mockExams.set(where.examId, created);
          return Promise.resolve(created);
        }),
      },
      panelMember: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { examId: string; address: string } }) => {
          for (const m of mockPanel.values()) {
            if (m.examId === where.examId && m.address.toLowerCase() === where.address.toLowerCase()) {
              return Promise.resolve(m);
            }
          }
          return Promise.resolve(null);
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
  const otherAuthorityWallet = ethers.Wallet.createRandom();
  const unassignedHolderWallet = ethers.Wallet.createRandom();

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
          state: 0,
          authority: authorityWallet.address,
          metaHash: expectedMetaHash,
          releaseOpensAt: 1770000000n,
          examStartsAt: 1770003600n,
          examEndsAt: 1770014400n,
          threshold: 2,
          holderCount: 3,
          bankHash: ethers.ZeroHash,
          seed: ethers.ZeroHash,
        });
      }
      throw new Error("ExamNotFound");
    }),
    getPanel: vi.fn().mockImplementation((examId: bigint) => {
      if (examId === 1n) {
        return Promise.resolve([[], [], []]);
      }
      throw new Error("ExamNotFound");
    }),
    hasRole: vi.fn().mockImplementation((roleHash: string, account: string) => {
      const norm = ethers.getAddress(account);
      const authorityRole = ethers.keccak256(ethers.toUtf8Bytes("AUTHORITY_ROLE"));
      if (roleHash === authorityRole) {
        return Promise.resolve(
          norm === ethers.getAddress(authorityWallet.address) ||
          norm === ethers.getAddress(otherAuthorityWallet.address)
        );
      }
      return Promise.resolve(false);
    }),
  } as unknown as Contract;

  async function loginAs(agent: ReturnType<typeof request.agent>, wallet: ethers.Wallet) {
    const nonceRes = await agent.get("/api/auth/nonce");
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce: nonceRes.body.nonce,
      issuedAt: new Date().toISOString(),
    });
    const msg = siwe.prepareMessage();
    const sig = await wallet.signMessage(msg);
    await agent.post("/api/auth/verify").send({ message: msg, signature: sig });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockExams.clear();
    mockPanel.clear();

    mockExams.set("1", {
      examId: "1",
      chainId: 31337,
      metaHash: expectedMetaHash,
      metaJson: null,
      state: 0,
      releaseOpensAt: 1770000000n,
      examStartsAt: 1770003600n,
      examEndsAt: 1770014400n,
      threshold: 2,
      bankHash: null,
      seed: null,
    });
  });

  it("should reject unauthenticated POST /api/exams/:id/meta", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const res = await request(app).post("/api/exams/1/meta").send(sampleMeta);
    expect(res.status).toBe(401);
  });

  it("should reject invalid metadata schema", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, authorityWallet);

    const invalidMeta = { ...sampleMeta, title: "Hi" };
    const res = await agent.post("/api/exams/1/meta").send(invalidMeta);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("should reject mismatched metaHash on POST /api/exams/:id/meta with clear error", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, authorityWallet);

    const mismatchedMeta = {
      ...sampleMeta,
      title: "Completely Different Exam Title With Mismatched Hash",
    };
    const res = await agent.post("/api/exams/1/meta").send(mismatchedMeta);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("HASH_MISMATCH");
    expect(res.body.error.message).toContain("Computed canonical hash");
  });

  it("should reject non-creator authority on POST /api/exams/:id/meta", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, otherAuthorityWallet);

    const res = await agent.post("/api/exams/1/meta").send(sampleMeta);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toContain("creating Authority");
  });

  it("should successfully store metadata when hash matches on-chain metaHash", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, authorityWallet);

    const res = await agent.post("/api/exams/1/meta").send(sampleMeta);
    expect(res.status).toBe(200);
    expect(res.body.examId).toBe("1");
    expect(res.body.metaHash).toBe(expectedMetaHash);
    expect(res.body.metaJson).toEqual(sampleMeta);
  });

  it("should return public summary leaking nothing beyond section 4.3 public data", async () => {
    const app = createApp(validConfig, undefined, mockContract);

    const detailRes = await request(app).get("/api/exams/1");
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.examId).toBe("1");
    expect(detailRes.body.metaHash).toBe(expectedMetaHash);
    expect(detailRes.body.threshold).toBe(2);
    expect(detailRes.body.metaJson).toBeUndefined();
    expect(detailRes.body.id).toBeUndefined();

    const listRes = await request(app).get("/api/exams");
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body[0].metaJson).toBeUndefined();
  });

  it("should return 403 on GET /api/exams/:id for unassigned authenticated user", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, unassignedHolderWallet);

    const res = await agent.get("/api/exams/1");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
