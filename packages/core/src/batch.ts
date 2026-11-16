import { keccak256, solidityPackedKeccak256 } from "ethers";
import { aadFor, decryptEnvelope, encryptToPublicKey } from "./envelope.js";
import type { BatchPlain, Hex } from "./types.js";

const encoder = new TextEncoder();

/** Verifies ordered ciphertext hashes and the contract's packed bankHash formula. */
export function verifyBatchBankIntegrity(
  batches: readonly { envelope: Uint8Array; ciphertextHash: Hex }[],
  expectedBankHash: Hex
): void {
  if (batches.length === 0) throw new Error("Question bank contains no batches");

  const orderedHashes = batches.map(({ envelope, ciphertextHash }) => {
    const actualHash = keccak256(envelope).toLowerCase();
    if (actualHash !== ciphertextHash.toLowerCase()) {
      throw new Error("Question batch ciphertext integrity check failed");
    }
    return ciphertextHash;
  });

  // Solidity uses keccak256(abi.encodePacked(bytes32[] batchHashes)) in submission order.
  const calculatedBankHash = solidityPackedKeccak256(["bytes32[]"], [orderedHashes]);
  if (calculatedBankHash.toLowerCase() !== expectedBankHash.toLowerCase()) {
    throw new Error("Question bank integrity check failed");
  }
}

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
