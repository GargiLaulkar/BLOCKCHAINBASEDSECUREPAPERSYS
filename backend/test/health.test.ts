import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import type { Provider } from "ethers";

describe("GET /api/health Endpoint", () => {
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

  it("should return status 200 with liveness and chain block details when RPC node is reachable", async () => {
    const mockProvider = {
      getBlockNumber: vi.fn().mockResolvedValue(105),
    } as unknown as Provider;

    const app = createApp(validConfig, mockProvider);
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      chain: {
        connected: true,
        chainId: 31337,
        contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        latestBlock: 105,
      },
    });
    expect(response.body.timestamp).toBeDefined();
  });

  it("should return status 503 with uniform error shape when RPC node fails or is unreachable", async () => {
    const mockProvider = {
      getBlockNumber: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as Provider;

    const app = createApp(validConfig, mockProvider);
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Chain node unreachable or unhealthy",
        details: "Connection refused",
      },
    });
  });

  it("should return status 404 with uniform error shape for non-existent endpoints", async () => {
    const mockProvider = {
      getBlockNumber: vi.fn().mockResolvedValue(100),
    } as unknown as Provider;

    const app = createApp(validConfig, mockProvider);
    const response = await request(app).get("/api/unknown-endpoint");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    });
  });
});
