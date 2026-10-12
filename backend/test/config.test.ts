import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config.js";

describe("Backend Config Validation", () => {
  const validEnv = {
    PORT: "4000",
    NODE_ENV: "development",
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "31337",
    CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    DEPLOY_BLOCK: "0",
    DATABASE_URL: "postgresql://sigil:sigil_password@localhost:5432/sigil_db?schema=public",
    SESSION_SECRET: "super-secret-session-key-at-least-32-characters-long",
    FRONTEND_ORIGIN: "http://localhost:5173",
    BLOB_DIR: "./uploads",
  };

  it("should successfully parse valid environment variables", () => {
    const config = parseConfig(validEnv);
    expect(config.PORT).toBe(4000);
    expect(config.CHAIN_ID).toBe(31337);
    expect(config.CONTRACT_ADDRESS).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    expect(config.DEPLOY_BLOCK).toBe(0);
    expect(config.BLOB_DIR).toBe("./uploads");
  });

  it("should fail fast when RPC_URL is missing or invalid", () => {
    expect(() =>
      parseConfig({ ...validEnv, RPC_URL: "not-a-valid-url" })
    ).toThrow("RPC_URL must be a valid URL");
  });

  it("should fail fast when CONTRACT_ADDRESS is not a valid 20-byte EVM address", () => {
    expect(() =>
      parseConfig({ ...validEnv, CONTRACT_ADDRESS: "0x123InvalidAddress" })
    ).toThrow("CONTRACT_ADDRESS must be a valid 20-byte EVM address");
  });

  it("should fail fast when SESSION_SECRET is shorter than 32 characters", () => {
    expect(() =>
      parseConfig({ ...validEnv, SESSION_SECRET: "short-secret" })
    ).toThrow("SESSION_SECRET must be at least 32 characters long");
  });

  it("should fail fast when CHAIN_ID is negative or invalid", () => {
    expect(() =>
      parseConfig({ ...validEnv, CHAIN_ID: "-5" })
    ).toThrow("CHAIN_ID must be a positive integer");
  });

  it("should fail fast when FRONTEND_ORIGIN is invalid", () => {
    expect(() =>
      parseConfig({ ...validEnv, FRONTEND_ORIGIN: "invalid-origin" })
    ).toThrow("FRONTEND_ORIGIN must be a valid URL");
  });

  it("should fail fast when BLOB_DIR is missing", () => {
    expect(() =>
      parseConfig({ ...validEnv, BLOB_DIR: "" })
    ).toThrow("BLOB_DIR is required");
  });
});
