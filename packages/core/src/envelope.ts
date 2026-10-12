import { sha256 } from "ethers";

const textEncoder = new TextEncoder();

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable; use localhost or HTTPS");
  return c;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64urlToBytes(value: string): Uint8Array {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function publicFromJwk(jwk: JsonWebKey): Uint8Array {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("Expected a P-256 EC JWK");
  }
  const x = b64urlToBytes(jwk.x);
  const y = b64urlToBytes(jwk.y);
  if (x.length !== 32 || y.length !== 32) throw new Error("Invalid P-256 public coordinates");
  return concat(new Uint8Array([0x04]), x, y);
}

function validatePublicKey(pub: Uint8Array): void {
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("P-256 public key must be 65 bytes and start with 0x04");
}

async function importPublic(pub: Uint8Array): Promise<CryptoKey> {
  validatePublicKey(pub);
  return getCrypto().subtle.importKey("raw", bufferSource(pub), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return getCrypto().subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function hkdf(shared: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  return getCrypto().subtle.importKey("raw", bufferSource(shared), "HKDF", false, ["deriveKey"]);
}

function encodeU64(value: bigint): string {
  if (value < 0n) throw new RangeError("examId must be non-negative");
  return value.toString(10);
}

/** Builds the exact AAD binding required by the SIGIL specification. */
export function aadFor(examId: bigint, purpose: "batch" | "share", context: string): string {
  if (context.length === 0) throw new Error("AAD context must not be empty");
  return `SIGIL/v1:${encodeU64(examId)}:${purpose}:${context}`;
}

export async function encryptToPublicKey(
  pub: Uint8Array,
  plaintext: Uint8Array,
  aad: string
): Promise<Uint8Array> {
  const crypto = getCrypto();
  validatePublicKey(pub);
  const recipient = await importPublic(pub);
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  ) as CryptoKeyPair;
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256));
  const salt = hexToBytes(sha256(concat(epk, pub)));
  const hkdfKey = await hkdf(shared, salt);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: bufferSource(salt), info: bufferSource(textEncoder.encode("SIGIL/v1/envelope")) },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferSource(iv), additionalData: bufferSource(textEncoder.encode(aad)), tagLength: 128 },
    aesKey,
    bufferSource(plaintext)
  ));
  return concat(new Uint8Array([1]), epk, iv, ciphertext);
}

export async function decryptEnvelope(
  privJwk: JsonWebKey,
  envelope: Uint8Array,
  aad: string
): Promise<Uint8Array> {
  const crypto = getCrypto();
  if (envelope.length < 1 + 65 + 12 + 16 || envelope[0] !== 1) throw new Error("Invalid SIGIL envelope");
  const epk = envelope.slice(1, 66);
  const iv = envelope.slice(66, 78);
  const ciphertext = envelope.slice(78);
  const recipientPub = publicFromJwk(privJwk);
  const recipientPrivate = await importPrivate(privJwk);
  const ephemeralPublic = await importPublic(epk);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ephemeralPublic }, recipientPrivate, 256));
  const salt = hexToBytes(sha256(concat(epk, recipientPub)));
  const hkdfKey = await hkdf(shared, salt);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: bufferSource(salt), info: bufferSource(textEncoder.encode("SIGIL/v1/envelope")) },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(iv), additionalData: bufferSource(textEncoder.encode(aad)), tagLength: 128 },
    aesKey,
    bufferSource(ciphertext)
  ));
}
