import { describe, expect, it } from "vitest";
import { keccak256, toUtf8Bytes } from "ethers";
import * as core from "../src/index.js";

const pub = new Uint8Array([4, ...new Uint8Array(64)]);


const validQuestion = {
  text: "What is the capital of France?",
  options: ["Paris", "Rome", "Berlin", "Madrid"] as [string, string, string, string],
  correctIndex: 0 as const
};

const bank = {
  "0:0": validQuestion,
  "0:1": { ...validQuestion, text: "Which planet is known as the Red Planet?" },
  "0:2": { ...validQuestion, text: "What is 2 plus 2?" },
  "0:3": { ...validQuestion, text: "Which language runs in a web browser?" },
  "0:4": { ...validQuestion, text: "What is the largest ocean?" },
  "0:5": { ...validQuestion, text: "What gas do plants absorb?" }
};

describe("CR-02 canonical and keccak", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(core.canonical.canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(core.canonical.canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });
  it("matches the published Keccak-256 hello vector", () => {
    expect(keccak256(toUtf8Bytes("hello"))).toBe("0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8");
  });
  it("hashes canonical JSON", () => {
    expect(core.canonical.keccakJson({ b: 2, a: 1 })).toBe(core.canonical.keccakJson({ a: 1, b: 2 }));
  });
});

describe("CR-03 envelope", () => {
  it("round-trips and rejects modified AAD", async () => {
    const crypto = globalThis.crypto;
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const recipientPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const plaintext = new TextEncoder().encode("secret paper");
    const envelope = await core.envelope.encryptToPublicKey(recipientPub, plaintext, "SIGIL/v1:7:batch:0");
    expect(await core.envelope.decryptEnvelope(jwk, envelope, "SIGIL/v1:7:batch:0")).toEqual(plaintext);
    await expect(core.envelope.decryptEnvelope(jwk, envelope, "SIGIL/v1:8:batch:0")).rejects.toThrow();
    const tampered = envelope.slice(); tampered[tampered.length - 1] ^= 1;
    await expect(core.envelope.decryptEnvelope(jwk, tampered, "SIGIL/v1:7:batch:0")).rejects.toThrow();
  });
});

describe("CR-04 shares", () => {
  it("uses ABI-encoded commitments and reconstructs any threshold", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const { split } = await import("shamir-secret-sharing");
    const shares = await split(secret, 5, 3);
    const combinations = [[0,1,2], [0,2,4], [1,3,4], [2,3,4]];
    for (const indexes of combinations) {
      expect(await core.shares.combineShares(indexes.map(i => shares[i]!))).toEqual(secret);
    }
    const commitment = core.shares.shareCommitment(7n, "0x0000000000000000000000000000000000000001", shares[0]!);
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("CR-05 keystore", () => {
  it("encrypts, rejects wrong passphrase and gives stable reveal", async () => {
    const { keystore, pubKey } = await core.keystore.createKeystore("a-strong-passphrase");
    expect(pubKey).toHaveLength(65);
    await expect(core.keystore.unlockKeystore(keystore, "wrong-passphrase")).rejects.toThrow();
    const key = await core.keystore.unlockKeystore(keystore, "a-strong-passphrase");
    const r1 = await core.keystore.deriveReveal(key, 7n);
    const r2 = await core.keystore.deriveReveal(key, 7n);
    expect(r1).toBe(r2);
  });
});

describe("CR-07 paper selection", () => {
  const seed = (`0x${"11".repeat(32)}`) as `0x${string}`;
  it("is deterministic and respects quotas", () => {
    const a = core.paper.selectPaper(seed, [10, 8], [4, 3]);
    const b = core.paper.selectPaper(seed, [10, 8], [4, 3]);
    expect(a).toEqual(b);
    expect(a[0]).toHaveLength(4);
    expect(a[1]).toHaveLength(3);
    expect([...a[0]!].sort((x,y)=>x-y)).toEqual(a[0]);
  });
  it("builds a deterministic variant and answer key", () => {
    const selection = [[0,1,2,3]];
    const v = core.paper.buildVariant(seed, 7n, "0x0000000000000000000000000000000000000001", selection, bank);
    expect(core.paper.variantHash(v)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(core.paper.variantCode(core.paper.variantHash(v))).toMatch(/^[A-Z2-7]{7}$/);
    expect(core.paper.answerKey(v, bank)).toHaveLength(4);
  });
});

describe("CR-08 schemas", () => {
  it("accepts valid question and rejects duplicate options", () => {
    expect(core.schemas.QuestionSchema.parse(validQuestion)).toEqual(validQuestion);
    expect(() => core.schemas.QuestionSchema.parse({ ...validQuestion, options: ["x", "x", "y", "z"] })).toThrow();
  });
});

describe("CR-09 matcher", () => {
  it("finds strong synthetic matches and returns variant evidence", () => {
    const seed = (`0x${"22".repeat(32)}`) as `0x${string}`;
    const selection = [[0,1,2,3,4,5]];
    const v = core.paper.buildVariant(seed, 7n, "0x0000000000000000000000000000000000000001", selection, bank);
    const leaked = Object.values(bank).map(q => q.text).join(" ");
    const report = core.matcher.matchLeak(leaked, bank, [v]);
    expect(report.matches).toHaveLength(1);
    expect(report.matches[0]!.variantHash).toBe(core.paper.variantHash(v));
  });
});

describe("CR-10 encrypted local drafts", () => {
  it("round-trips and rejects tampering", async () => {
    const payload = await core.draft.encryptLocalDraft({ title: "Draft", count: 3 }, "a-strong-passphrase");
    expect(await core.draft.decryptLocalDraft(payload, "a-strong-passphrase")).toEqual({ title: "Draft", count: 3 });
    const parsed = JSON.parse(payload); parsed.ciphertext = parsed.ciphertext.slice(0, -2) + "AA";
    await expect(core.draft.decryptLocalDraft(JSON.stringify(parsed), "a-strong-passphrase")).rejects.toThrow();
  });
});

describe("CR-07 frozen vector", () => {
  it("matches the generated cross-language selection/variant vector", async () => {
    const vector = await import("../vectors/basic.json", { with: { type: "json" } });
    const v = vector.default;
    const selection = core.paper.selectPaper(v.seed as `0x${string}`, [10], [4]);
    expect(selection).toEqual(v.selection);
    const bankForVector: Record<string, unknown> = {};
    for (const item of v.variant.sections[0].items) bankForVector[item.qid] = { correctIndex: 0 };
    const actual = core.paper.buildVariant(v.seed as `0x${string}`, 7n, v.centre as `0x${string}`, selection, bankForVector);
    expect(actual).toEqual(v.variant);
    expect(core.paper.variantHash(actual)).toBe(v.variantHash);
    expect(core.paper.variantCode(v.variantHash as `0x${string}`)).toBe(v.variantCode);
  });
});
