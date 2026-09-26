import { AbiCoder, getAddress, keccak256 } from "ethers";
import { combine } from "shamir-secret-sharing";
import type { Address, Hex } from "./types.js";

const coder = AbiCoder.defaultAbiCoder();

export function shareCommitment(examId: bigint, holder: Address, share: Uint8Array): Hex {
  const encoded = coder.encode(["uint256", "address", "bytes"], [examId, getAddress(holder), share]);
  return keccak256(encoded) as Hex;
}

export async function combineShares(shares: readonly Uint8Array[]): Promise<Uint8Array> {
  if (shares.length < 2) throw new Error("At least two shares are required");
  return combine([...shares]);
}

function b64urlToBytes(value: string): Uint8Array {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bufferSource(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function verifyKeyMatchesPublic(d: Uint8Array, pub: Uint8Array): Promise<boolean> {
  if (d.length !== 32 || pub.length !== 65 || pub[0] !== 0x04) return false;
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new Error("WebCrypto is unavailable");
  const privateJwk: JsonWebKey = {
    kty: "EC", crv: "P-256", d: bytesToB64url(d),
    x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    y: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ext: true
  };
  // The x/y members are required by WebCrypto when importing a P-256 private JWK.
  // Derive them from the private scalar by importing through a temporary ECDH keypair is not
  // possible with a scalar-only API, so use an ECDSA key import/export path with matching curve.
  // WebCrypto does not expose scalar->public derivation directly; instead validate the supplied
  // public point by checking that the scalar/public pair can perform symmetric ECDH.
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralJwk = await crypto.subtle.exportKey("jwk", ephemeral.privateKey);
  const withSuppliedPublic: JsonWebKey = { ...privateJwk, x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)) };
  try {
    const priv = await crypto.subtle.importKey("jwk", withSuppliedPublic, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const ephPub = ephemeral.publicKey;
    const a = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ephPub }, priv, 256));
    const ephPriv = await crypto.subtle.importKey("jwk", ephemeralJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const suppliedPubKey = await crypto.subtle.importKey("raw", bufferSource(pub), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const b = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: suppliedPubKey }, ephPriv, 256));
    return equalBytes(a, b);
  } catch {
    return false;
  }
}
