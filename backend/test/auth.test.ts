import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { SiweMessage } from "siwe";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { clearRoleCache } from "../src/services/roles.js";
import type { Contract } from "ethers";

describe("SIWE Authentication Endpoints (BE-03)", () => {
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

  const wallet = ethers.Wallet.createRandom();

  const mockContract = {
    hasRole: vi.fn().mockImplementation((roleHash: string) => {
      // Return true for AUTHORITY for testing
      const authorityHash = ethers.keccak256(ethers.toUtf8Bytes("AUTHORITY_ROLE"));
      return Promise.resolve(roleHash === authorityHash);
    }),
  } as unknown as Contract;

  it("should generate a nonce and return it with a session cookie", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const res = await request(app).get("/api/auth/nonce");

    expect(res.status).toBe(200);
    expect(res.body.nonce).toBeDefined();
    expect(typeof res.body.nonce).toBe("string");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("should successfully verify a valid SIWE message, derive roles, and persist session", async () => {
    clearRoleCache();
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    // 1. Fetch nonce
    const nonceRes = await agent.get("/api/auth/nonce");
    const nonce = nonceRes.body.nonce;

    // 2. Prepare SIWE message
    const siweMessage = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in to SIGIL custody console",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    const preparedMessage = siweMessage.prepareMessage();
    const signature = await wallet.signMessage(preparedMessage);

    // 3. Verify
    const verifyRes = await agent
      .post("/api/auth/verify")
      .send({ message: preparedMessage, signature });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.address).toBe(ethers.getAddress(wallet.address));
    expect(verifyRes.body.roles).toContain("AUTHORITY");

    // 4. Verify session persistence via /me
    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.address).toBe(ethers.getAddress(wallet.address));
    expect(meRes.body.roles).toContain("AUTHORITY");
  });

  it("should reject replaying an already-used nonce (nonce replay protection)", async () => {
    clearRoleCache();
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    const nonceRes = await agent.get("/api/auth/nonce");
    const nonce = nonceRes.body.nonce;

    const siweMessage = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in to SIGIL custody console",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    const preparedMessage = siweMessage.prepareMessage();
    const signature = await wallet.signMessage(preparedMessage);

    // First attempt succeeds
    const firstRes = await agent
      .post("/api/auth/verify")
      .send({ message: preparedMessage, signature });
    expect(firstRes.status).toBe(200);

    // Replay attempt fails immediately
    const replayRes = await agent
      .post("/api/auth/verify")
      .send({ message: preparedMessage, signature });

    expect(replayRes.status).toBe(400);
    expect(replayRes.body.error.code).toBe("INVALID_NONCE");
  });

  it("should reject SIWE message if domain does not match FRONTEND_ORIGIN", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    const nonceRes = await agent.get("/api/auth/nonce");
    const nonce = nonceRes.body.nonce;

    const evilMessage = new SiweMessage({
      domain: "attacker.com",
      address: wallet.address,
      statement: "Phishing attempt",
      uri: "http://attacker.com",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    const preparedMessage = evilMessage.prepareMessage();
    const signature = await wallet.signMessage(preparedMessage);

    const res = await agent
      .post("/api/auth/verify")
      .send({ message: preparedMessage, signature });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_DOMAIN");
  });

  it("should reject tampered or invalid signature", async () => {
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    const nonceRes = await agent.get("/api/auth/nonce");
    const nonce = nonceRes.body.nonce;

    const siweMessage = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in to SIGIL custody console",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    const preparedMessage = siweMessage.prepareMessage();
    const otherWallet = ethers.Wallet.createRandom();
    const badSignature = await otherWallet.signMessage(preparedMessage);

    const res = await agent
      .post("/api/auth/verify")
      .send({ message: preparedMessage, signature: badSignature });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_SIGNATURE");
  });

  it("should successfully logout and clear session", async () => {
    clearRoleCache();
    const app = createApp(validConfig, undefined, mockContract);
    const agent = request.agent(app);

    // Login
    const nonceRes = await agent.get("/api/auth/nonce");
    const nonce = nonceRes.body.nonce;

    const siweMessage = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in to SIGIL custody console",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const preparedMessage = siweMessage.prepareMessage();
    const signature = await wallet.signMessage(preparedMessage);

    await agent
      .post("/api/auth/verify")
      .send({ message: preparedMessage, signature });

    // Logout
    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Me should now be unauthorized
    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
    expect(meRes.body.error.code).toBe("UNAUTHORIZED");
  });
});
