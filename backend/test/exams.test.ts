import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { canonical } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import type { Contract } from "ethers";

// In-memory mock database for testing
const mockExams = new Map<string, any>();
const mockShares = new Map<string, any>();
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
      encryptedShare: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { examId_holder: { examId: string; holder: string } } }) => {
          const key = `${where.examId_holder.examId}_${where.examId_holder.holder.toLowerCase()}`;
          return Promise.resolve(mockShares.get(key) || null);
        }),
        upsert: vi.fn().mockImplementation(({ where, create, update }: any) => {
          const key = `${where.examId_holder.examId}_${where.examId_holder.holder.toLowerCase()}`;
          const existing = mockShares.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            mockShares.set(key, updated);
            return Promise.resolve(updated);
          }
          const created = { id: `share-${mockShares.size + 1}`, ...create, createdAt: new Date() };
          mockShares.set(key, created);
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
        findMany: vi.fn().mockImplementation(({ where }: { where: { examId: string; kind?: string } }) => {
          const res = Array.from(mockPanel.values()).filter((m) => {
            if (m.examId !== where.examId) return false;
            if (where.kind && m.kind !== where.kind) return false;
            return true;
          });
          return Promise.resolve(res);
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback: any) => {
        return callback({
          encryptedShare: {
            upsert: vi.fn().mockImplementation(({ where, create, update }: any) => {
              const key = `${where.examId_holder.examId}_${where.examId_holder.holder.toLowerCase()}`;
              const existing = mockShares.get(key);
              if (existing) {
                const updated = { ...existing, ...update };
                mockShares.set(key, updated);
                return Promise.resolve(updated);
              }
              const created = { id: `share-${mockShares.size + 1}`, ...create, createdAt: new Date() };
              mockShares.set(key, created);
              return Promise.resolve(created);
            }),
          },
        });
      }),
    },
  };
});

describe("Exam Metadata & Shares Endpoints (BE-04 & BE-06)", () => {
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
  const holder1Wallet = ethers.Wallet.createRandom();
  const holder2Wallet = ethers.Wallet.createRandom();
  const holder3Wallet = ethers.Wallet.createRandom();
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

  // Dynamic state for contract mock
  let examState = 0; // 0 = Draft, 1 = Collecting

  const mockContract = {
    getExam: vi.fn().mockImplementation((examId: bigint) => {
      if (examId === 1n) {
        return Promise.resolve({
          id: 1n,
          state: examState,
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
        return Promise.resolve([
          [holder1Wallet.address, holder2Wallet.address, holder3Wallet.address],
          [], // setters
          [], // centres
        ]);
      }
      throw new Error("ExamNotFound");
    }),
    hasRole: vi.fn().mockImplementation((roleHash: string, account: string) => {
      const norm = ethers.getAddress(account);
      const authorityRole = ethers.keccak256(ethers.toUtf8Bytes("AUTHORITY_ROLE"));
      const holderRole = ethers.keccak256(ethers.toUtf8Bytes("HOLDER_ROLE"));

      if (roleHash === authorityRole) {
        return Promise.resolve(
          norm === ethers.getAddress(authorityWallet.address) ||
          norm === ethers.getAddress(otherAuthorityWallet.address)
        );
      }
      if (roleHash === holderRole) {
        return Promise.resolve(
          norm === ethers.getAddress(holder1Wallet.address) ||
          norm === ethers.getAddress(holder2Wallet.address) ||
          norm === ethers.getAddress(holder3Wallet.address) ||
          norm === ethers.getAddress(unassignedHolderWallet.address)
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

  // Construct valid 94+ byte envelope: 0x01 prefix + 65 bytes epk + 12 bytes iv + 16 bytes tag + ciphertext
  function makeValidEnvelope(tag = "aa") {
    return "0x01" + tag.repeat(65) + "bb".repeat(12) + "cc".repeat(16) + "dd".repeat(10);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockExams.clear();
    mockShares.clear();
    mockPanel.clear();
    examState = 0; // reset to Draft

    // Seed mock exam 1
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

  // --- BE-04 Tests ---

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

    // Unauthenticated GET /api/exams/1
    const detailRes = await request(app).get("/api/exams/1");
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.examId).toBe("1");
    expect(detailRes.body.metaHash).toBe(expectedMetaHash);
    expect(detailRes.body.threshold).toBe(2);
    expect(detailRes.body.metaJson).toBeUndefined();
    expect(detailRes.body.id).toBeUndefined(); // no internal database UUID
    expect(detailRes.body.shares).toBeUndefined(); // no shares

    // Unauthenticated GET /api/exams
    const listRes = await request(app).get("/api/exams");
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body[0].metaJson).toBeUndefined();
    expect(listRes.body[0].id).toBeUndefined();
  });

  it("should return 403 on GET /api/exams/:id for unassigned authenticated holder", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, unassignedHolderWallet);

    const res = await agent.get("/api/exams/1");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  // --- BE-06 Tests ---

  it("should reject PUT /api/exams/:id/shares when caller is non-creator authority", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, otherAuthorityWallet);

    const sharesPayload = [
      { holder: holder1Wallet.address, envelope: makeValidEnvelope("11") },
      { holder: holder2Wallet.address, envelope: makeValidEnvelope("22") },
      { holder: holder3Wallet.address, envelope: makeValidEnvelope("33") },
    ];

    const res = await agent.put("/api/exams/1/shares").send(sharesPayload);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("should reject PUT /api/exams/:id/shares outside Draft state", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, authorityWallet);

    // Advance exam state to 1 (Collecting)
    examState = 1;

    const sharesPayload = [
      { holder: holder1Wallet.address, envelope: makeValidEnvelope("11") },
      { holder: holder2Wallet.address, envelope: makeValidEnvelope("22") },
      { holder: holder3Wallet.address, envelope: makeValidEnvelope("33") },
    ];

    const res = await agent.put("/api/exams/1/shares").send(sharesPayload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WRONG_STATE");
    expect(res.body.error.message).toContain("Draft state");
  });

  it("should reject PUT /api/exams/:id/shares with missing, extra, or duplicate holders", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, authorityWallet);

    // Missing holder3
    const missingPayload = [
      { holder: holder1Wallet.address, envelope: makeValidEnvelope("11") },
      { holder: holder2Wallet.address, envelope: makeValidEnvelope("22") },
    ];
    const resMissing = await agent.put("/api/exams/1/shares").send(missingPayload);
    expect(resMissing.status).toBe(400);
    expect(resMissing.body.error.code).toBe("INVALID_HOLDER_COUNT");

    // Extra non-panel holder
    const extraPayload = [
      { holder: holder1Wallet.address, envelope: makeValidEnvelope("11") },
      { holder: holder2Wallet.address, envelope: makeValidEnvelope("22") },
      { holder: unassignedHolderWallet.address, envelope: makeValidEnvelope("99") },
    ];
    const resExtra = await agent.put("/api/exams/1/shares").send(extraPayload);
    expect(resExtra.status).toBe(400);
    expect(resExtra.body.error.code).toBe("NON_PANEL_HOLDER");

    // Duplicate holder
    const dupPayload = [
      { holder: holder1Wallet.address, envelope: makeValidEnvelope("11") },
      { holder: holder1Wallet.address, envelope: makeValidEnvelope("22") },
      { holder: holder3Wallet.address, envelope: makeValidEnvelope("33") },
    ];
    const resDup = await agent.put("/api/exams/1/shares").send(dupPayload);
    expect(resDup.status).toBe(400);
    expect(resDup.body.error.code).toBe("DUPLICATE_HOLDER");
  });

  it("should reject PUT /api/exams/:id/shares with invalid envelope format", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, authorityWallet);

    // Envelope too short (<94 bytes)
    const shortPayload = [
      { holder: holder1Wallet.address, envelope: "0x01112233" },
      { holder: holder2Wallet.address, envelope: makeValidEnvelope("22") },
      { holder: holder3Wallet.address, envelope: makeValidEnvelope("33") },
    ];
    const resShort = await agent.put("/api/exams/1/shares").send(shortPayload);
    expect(resShort.status).toBe(400);
    expect(resShort.body.error.code).toBe("INVALID_ENVELOPE");

    // Envelope with wrong leading byte (not 0x01)
    const wrongByteEnv = "0x02" + "aa".repeat(65) + "bb".repeat(12) + "cc".repeat(16) + "dd".repeat(10);
    const wrongBytePayload = [
      { holder: holder1Wallet.address, envelope: wrongByteEnv },
      { holder: holder2Wallet.address, envelope: makeValidEnvelope("22") },
      { holder: holder3Wallet.address, envelope: makeValidEnvelope("33") },
    ];
    const resWrong = await agent.put("/api/exams/1/shares").send(wrongBytePayload);
    expect(resWrong.status).toBe(400);
    expect(resWrong.body.error.code).toBe("INVALID_ENVELOPE");
  });

  it("should successfully store shares and allow assigned holder to fetch ONLY their own share", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const authorityAgent = request.agent(app);
    await loginAs(authorityAgent, authorityWallet);

    const env1 = makeValidEnvelope("11");
    const env2 = makeValidEnvelope("22");
    const env3 = makeValidEnvelope("33");

    const sharesPayload = [
      { holder: holder1Wallet.address, envelope: env1 },
      { holder: holder2Wallet.address, envelope: env2 },
      { holder: holder3Wallet.address, envelope: env3 },
    ];

    // PUT shares
    const putRes = await authorityAgent.put("/api/exams/1/shares").send(sharesPayload);
    expect(putRes.status).toBe(200);
    expect(putRes.body.storedCount).toBe(3);

    // Holder 1 logs in and requests /shares/me
    const h1Agent = request.agent(app);
    await loginAs(h1Agent, holder1Wallet);
    const h1Res = await h1Agent.get("/api/exams/1/shares/me");
    expect(h1Res.status).toBe(200);
    expect(h1Res.body.holder.toLowerCase()).toBe(holder1Wallet.address.toLowerCase());
    expect(h1Res.body.envelope.toLowerCase()).toBe(env1.toLowerCase());

    // Holder 2 logs in and requests /shares/me
    const h2Agent = request.agent(app);
    await loginAs(h2Agent, holder2Wallet);
    const h2Res = await h2Agent.get("/api/exams/1/shares/me");
    expect(h2Res.status).toBe(200);
    expect(h2Res.body.holder.toLowerCase()).toBe(holder2Wallet.address.toLowerCase());
    expect(h2Res.body.envelope.toLowerCase()).toBe(env2.toLowerCase());

    // Holder 1 cannot receive Holder 2's envelope (and vice versa)
    expect(h1Res.body.envelope).not.toEqual(h2Res.body.envelope);
  });

  it("should reject GET /api/exams/:id/shares/me with 403 for unassigned holder", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);
    await loginAs(agent, unassignedHolderWallet);

    const res = await agent.get("/api/exams/1/shares/me");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
