import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

const MODULE_NAMES = [
  "canonical",
  "envelope",
  "ceremony",
  "shares",
  "keystore",
  "batch",
  "paper",
  "matcher",
  "schemas"
] as const;

describe("CR-01 scaffold: package shape", () => {
  it("exposes every module named in the core package spec (section 9)", () => {
    for (const name of MODULE_NAMES) expect(core).toHaveProperty(name);
  });

  it("exposes every frozen function signature", () => {
    expect(typeof core.canonical.canonicalize).toBe("function");
    expect(typeof core.canonical.keccakJson).toBe("function");
    expect(typeof core.envelope.aadFor).toBe("function");
    expect(typeof core.envelope.encryptToPublicKey).toBe("function");
    expect(typeof core.envelope.decryptEnvelope).toBe("function");
    expect(typeof core.ceremony.runCeremony).toBe("function");
    expect(typeof core.shares.shareCommitment).toBe("function");
    expect(typeof core.shares.combineShares).toBe("function");
    expect(typeof core.shares.verifyKeyMatchesPublic).toBe("function");
    expect(typeof core.keystore.createKeystore).toBe("function");
    expect(typeof core.keystore.unlockKeystore).toBe("function");
    expect(typeof core.keystore.deriveReveal).toBe("function");
    expect(typeof core.keystore.randomnessCommitment).toBe("function");
    expect(typeof core.batch.encryptBatch).toBe("function");
    expect(typeof core.batch.decryptBatch).toBe("function");
    expect(typeof core.paper.selectPaper).toBe("function");
    expect(typeof core.paper.buildVariant).toBe("function");
    expect(typeof core.paper.variantHash).toBe("function");
    expect(typeof core.paper.variantCode).toBe("function");
    expect(typeof core.paper.answerKey).toBe("function");
    expect(typeof core.matcher.matchLeak).toBe("function");
  });

  it("returns real CR-02/CR-03/CR-04/CR-07/CR-09 behavior instead of scaffold stubs", async () => {
    expect(core.canonical.canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(core.canonical.keccakJson({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
    expect(core.envelope.aadFor(1n, "batch", "ctx")).toBe("SIGIL/v1:1:batch:ctx");
    expect(core.shares.shareCommitment(1n, "0x0000000000000000000000000000000000000001", new Uint8Array([1]))).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => core.paper.selectPaper("0x00" as never, [1], [1])).toThrow();
    expect(core.matcher.matchLeak("", {}, [])).toEqual({ matches: [] });
    await expect(core.shares.combineShares([])).rejects.toThrow(/At least two shares/);
  });

  it("async crypto functions reject invalid input without requiring scaffold-specific errors", async () => {
    const pair = await globalThis.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
    ) as CryptoKeyPair;
    const pub = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", pair.publicKey));
    await expect(core.envelope.encryptToPublicKey(new Uint8Array(), new Uint8Array(), "aad")).rejects.toThrow();
    const envelope = await core.envelope.encryptToPublicKey(pub, new Uint8Array([1, 2, 3]), "aad");
    const jwk = await globalThis.crypto.subtle.exportKey("jwk", pair.privateKey);
    await expect(core.envelope.decryptEnvelope(jwk, envelope, "wrong-aad")).rejects.toThrow();
    await expect(core.keystore.createKeystore("short")).rejects.toThrow(/12 characters/);
  });
});
