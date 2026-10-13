import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { SiweMessage } from "siwe";
import { canonical } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { clearRoleCache } from "../src/services/roles.js";

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../src/db.js", () => ({
  prisma: {
    participant: { findUnique, update },
  },
}));

const config = parseConfig({
  NODE_ENV: "test",
  RPC_URL: "http://127.0.0.1:8545",
  CHAIN_ID: "31337",
  CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  DEPLOY_BLOCK: "0",
  DATABASE_URL: "postgresql://localhost:5432/sigil_db",
  SESSION_SECRET: "super-secret-session-key-at-least-32-characters-long",
  FRONTEND_ORIGIN: "http://localhost:5173",
  BLOB_DIR: "./uploads",
});

describe("BE-10 profile endpoints", () => {
  const wallet = ethers.Wallet.createRandom();

  beforeEach(() => {
    vi.clearAllMocks();
    clearRoleCache();
  });

  async function authenticatedAgent() {
    const contract = { hasRole: vi.fn().mockResolvedValue(false) } as unknown as ethers.Contract;
    const agent = request.agent(createApp(config, undefined, contract));
    const nonceResponse = await agent.get("/api/auth/nonce");
    const message = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in to SIGIL",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce: nonceResponse.body.nonce,
      issuedAt: new Date().toISOString(),
    });
    await agent.post("/api/auth/verify").send({
      message: message.prepareMessage(),
      signature: await wallet.signMessage(message.prepareMessage()),
    });
    return agent;
  }

  it("requires authentication and hashes normalized profile fields with core keccakJson", async () => {
    const app = createApp(config);
    const denied = await request(app).post("/api/profiles").send({
      displayName: " Ada Lovelace ",
      organisation: " Example University ",
    });
    expect(denied.status).toBe(401);

    findUnique.mockResolvedValue({ address: wallet.address });
    update.mockImplementation(async ({ data }) => ({
      address: wallet.address,
      ...data,
    }));
    const agent = await authenticatedAgent();
    const response = await agent.post("/api/profiles").send({
      displayName: " Ada Lovelace ",
      organisation: " Example University ",
    });
    const expectedHash = canonical.keccakJson({
      displayName: "Ada Lovelace",
      organisation: "Example University",
    });
    expect(response.status).toBe(200);
    expect(response.body.profileHash).toBe(expectedHash);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { address: wallet.address },
      data: {
        displayName: "Ada Lovelace",
        organisation: "Example University",
        profileHash: expectedHash,
      },
    }));
  });

  it("validates checksummed addresses and returns only profile fields", async () => {
    const agent = await authenticatedAgent();
    const invalid = await agent.get(`/api/profiles/${wallet.address.toLowerCase()}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");

    findUnique.mockResolvedValue({
      address: wallet.address,
      displayName: "Ada Lovelace",
      organisation: "Example University",
      profileHash: ethers.keccak256(ethers.toUtf8Bytes("profile")),
      roles: ["ADMIN"],
    });
    const response = await agent.get(`/api/profiles/${wallet.address}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      address: wallet.address,
      displayName: "Ada Lovelace",
      organisation: "Example University",
      profileHash: ethers.keccak256(ethers.toUtf8Bytes("profile")),
    });
    expect(findUnique).toHaveBeenLastCalledWith({
      where: { address: wallet.address },
      select: { address: true, displayName: true, organisation: true, profileHash: true },
    });
  });
});
