import { AbiCoder, getAddress, keccak256 } from "ethers";
import type { Address, Hex, HolderKey } from "./types.js";

const ITERATIONS = 600_000;
const VERSION = 1;
const textEncoder = new TextEncoder();

function cryptoOrThrow(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable; use localhost or HTTPS");
  return c;
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(value: string): Uint8Array {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bufferSource(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 12) throw new Error("Passphrase must be at least 12 characters");
}

export async function createKeystore(passphrase: string): Promise<{ keystore: string; pubKey: Uint8Array }> {
  validatePassphrase(passphrase);
  const crypto = cryptoOrThrow();
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const pubKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey("raw", bufferSource(textEncoder.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bufferSource(salt), iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const plaintext = textEncoder.encode(JSON.stringify(privateJwk));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferSource(iv), tagLength: 128 }, aesKey, bufferSource(plaintext)));
  return {
    keystore: JSON.stringify({ v: VERSION, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: bytesToB64url(salt), cipher: "AES-256-GCM", iv: bytesToB64url(iv), ciphertext: bytesToB64url(ciphertext) }),
    pubKey
  };
}

export async function unlockKeystore(keystore: string, passphrase: string): Promise<HolderKey> {
  validatePassphrase(passphrase);
  const crypto = cryptoOrThrow();
  let parsed: any;
  try { parsed = JSON.parse(keystore); } catch { throw new Error("Invalid keystore JSON"); }
  if (parsed?.v !== VERSION || parsed?.kdf !== "PBKDF2-SHA256" || parsed?.cipher !== "AES-256-GCM" || parsed?.iterations < ITERATIONS) throw new Error("Unsupported or insecure keystore");
  const salt = b64urlToBytes(parsed.salt);
  const iv = b64urlToBytes(parsed.iv);
  const ciphertext = b64urlToBytes(parsed.ciphertext);
  const baseKey = await crypto.subtle.importKey("raw", bufferSource(textEncoder.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bufferSource(salt), iterations: parsed.iterations, hash: "SHA-256" }, baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bufferSource(iv), tagLength: 128 }, aesKey, bufferSource(ciphertext));
  const privateKeyJwk = JSON.parse(new TextDecoder().decode(plaintext)) as JsonWebKey;
  if (privateKeyJwk.kty !== "EC" || privateKeyJwk.crv !== "P-256" || !privateKeyJwk.d || !privateKeyJwk.x || !privateKeyJwk.y) throw new Error("Keystore does not contain a valid P-256 private key");
  const publicKey = concat(new Uint8Array([4]), b64urlToBytes(privateKeyJwk.x), b64urlToBytes(privateKeyJwk.y));
  return { privateKeyJwk, publicKey };
}

export async function deriveReveal(key: HolderKey, examId: bigint): Promise<Hex> {
  if (!key.privateKeyJwk.d) throw new Error("Holder key does not contain private scalar");
  if (examId < 0n || examId >= (1n << 256n)) throw new RangeError("examId must fit uint256");
  const crypto = cryptoOrThrow();
  const d = b64urlToBytes(key.privateKeyJwk.d);
  const salt = new Uint8Array(32);
  let value = examId;
  for (let i = 31; i >= 0; i--) { salt[i] = Number(value & 255n); value >>= 8n; }
  const hkdfKey = await crypto.subtle.importKey("raw", bufferSource(d), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: bufferSource(salt), info: bufferSource(textEncoder.encode("SIGIL/v1/randomness")) }, hkdfKey, 256);
  return (`0x${Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("")}`) as Hex;
}

export function randomnessCommitment(examId: bigint, holder: Address, reveal: Hex): Hex {
  const coder = AbiCoder.defaultAbiCoder();
  return keccak256(coder.encode(["uint256", "address", "bytes32"], [examId, getAddress(holder), reveal])) as Hex;
}
