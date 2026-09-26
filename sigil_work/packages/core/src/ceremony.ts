import { split } from "shamir-secret-sharing";
import type { Address, Hex } from "./types.js";
import { encryptToPublicKey, aadFor } from "./envelope.js";
import { shareCommitment } from "./shares.js";

export interface CeremonyInput {
  examId: bigint;
  holders: ReadonlyArray<{ address: Address; pubKey: Uint8Array }>;
  threshold: number;
}

export interface CeremonyResult {
  examPublicKey: Uint8Array;
  commitments: readonly Hex[];
  encryptedShares: ReadonlyArray<{ holder: Address; envelope: Uint8Array }>;
}

function cryptoOrThrow(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable");
  return c;
}

export async function runCeremony(input: CeremonyInput): Promise<CeremonyResult> {
  const n = input.holders.length;
  if (n < 3 || n > 20) throw new Error("Holder count must be between 3 and 20");
  if (input.threshold <= n / 2 || input.threshold > n) throw new Error("Threshold must be a strict majority and at most n");
  const addresses = new Set(input.holders.map((h) => h.address.toLowerCase()));
  if (addresses.size !== n) throw new Error("Duplicate holder address");
  const crypto = cryptoOrThrow();
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!privateJwk.d) throw new Error("Ceremony failed to export private scalar");
  const d = (() => {
    const s = privateJwk.d!.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  })();
  const shares = await split(d, n, input.threshold);
  const commitments: Hex[] = [];
  const encryptedShares: Array<{ holder: Address; envelope: Uint8Array }> = [];
  for (let i = 0; i < input.holders.length; i++) {
    const holder = input.holders[i]!;
    const share = shares[i]!;
    commitments.push(shareCommitment(input.examId, holder.address, share));
    const envelope = await encryptToPublicKey(holder.pubKey, share, aadFor(input.examId, "share", holder.address.toLowerCase()));
    encryptedShares.push({ holder: holder.address, envelope });
  }
  // `d` and the private JWK are intentionally local variables and are not returned or logged.
  return { examPublicKey: publicKey, commitments, encryptedShares };
}
