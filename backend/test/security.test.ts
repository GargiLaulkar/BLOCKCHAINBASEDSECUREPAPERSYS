import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { Provider } from "ethers";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

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

describe("BE-10 security middleware", () => {
  it("sets Helmet headers and rejects a non-frontend CORS origin", async () => {
    const provider = { getBlockNumber: async () => 1 } as unknown as Provider;
    const app = createApp(config, provider);
    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const rejected = await request(app)
      .get("/api/health")
      .set("Origin", "https://attacker.invalid");
    expect(rejected.status).toBe(403);
    expect(rejected.body.error).toMatchObject({ code: "CORS_FORBIDDEN" });
  });

  it("serves the committed OpenAPI document as JSON", async () => {
    const response = await request(createApp(config)).get("/api/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths["/api/profiles"]).toBeDefined();
    expect(response.body.paths["/api/audit/traces/{id}"]).toBeDefined();
  });

  it("enforces the stricter authentication and batch-upload rate limits", async () => {
    const authApp = createApp(config);
    const authResponses = await Promise.all(
      Array.from({ length: 11 }, () => request(authApp).get("/api/auth/nonce"))
    );
    expect(authResponses.slice(0, 10).every((response) => response.status === 200)).toBe(true);
    expect(authResponses[10].status).toBe(429);
    expect(authResponses[10].body.error.code).toBe("RATE_LIMITED");

    const uploadApp = createApp(config);
    const uploadResponses = await Promise.all(
      Array.from({ length: 6 }, () => request(uploadApp).post("/api/exams/1/batches"))
    );
    expect(uploadResponses.slice(0, 5).every((response) => response.status === 401)).toBe(true);
    expect(uploadResponses[5].status).toBe(429);
    expect(uploadResponses[5].body.error.code).toBe("RATE_LIMITED");
  });

  it("redacts sensitive values from captured structured logs", async () => {
    const capture = new PassThrough();
    let output = "";
    capture.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    const log = createLogger(capture);
    log.info({
      authorization: "secret-authorization",
      cookies: "secret-cookie",
      ciphertext: "secret-ciphertext",
      shares: ["secret-share"],
      req: {
        headers: {
          authorization: "nested-authorization",
          cookie: "nested-cookie",
        },
        body: { envelope: "secret-envelope" },
      },
      context: {
        authorization: "deep-authorization",
        ciphertext: "deep-ciphertext",
      },
    }, "security redaction test");
    await new Promise((resolve) => setImmediate(resolve));

    expect(output).toContain("[REDACTED]");
    for (const value of [
      "secret-authorization",
      "secret-cookie",
      "secret-ciphertext",
      "secret-share",
      "nested-authorization",
      "nested-cookie",
      "secret-envelope",
      "deep-authorization",
      "deep-ciphertext",
    ]) {
      expect(output).not.toContain(value);
    }
  });

  it("returns the uniform error shape for invalid JSON and malformed query values", async () => {
    const app = createApp(config);
    const malformedJson = await request(app)
      .post("/api/auth/verify")
      .set("Content-Type", "application/json")
      .send("{invalid");
    expect(malformedJson.status).toBe(400);
    expect(malformedJson.body.error).toMatchObject({
      code: "INVALID_JSON",
      message: "Request body must contain valid JSON",
    });

    const malformedQuery = await request(app).get("/api/events?limit[]=1");
    expect(malformedQuery.status).toBe(400);
    expect(malformedQuery.body.error).toHaveProperty("code");
    expect(malformedQuery.body.error).toHaveProperty("message");
  });
});
