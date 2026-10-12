import { keccak256 } from "ethers";
import { aadFor, decryptEnvelope, encryptToPublicKey } from "./envelope.js";
import type { BatchPlain, Hex } from "./types.js";

const encoder = new TextEncoder();

export async function encryptBatch(
  examPub: Uint8Array,
  batch: BatchPlain
): Promise<{ envelope: Uint8Array; hash: Hex }> {
  const plaintext = encoder.encode(JSON.stringify(batch));
  const aad = aadFor(BigInt(batch.examId), "batch", String(batch.sectionId));
  const envelope = await encryptToPublicKey(examPub, plaintext, aad);
  return { envelope, hash: keccak256(envelope) as Hex };
}

export async function decryptBatch(
  examPrivJwk: JsonWebKey,
  envelope: Uint8Array,
  aad: string
): Promise<BatchPlain> {
  const plaintext = await decryptEnvelope(examPrivJwk, envelope, aad);
  return JSON.parse(new TextDecoder().decode(plaintext)) as BatchPlain;
}
