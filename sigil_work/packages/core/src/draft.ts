const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoOrThrow(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable; use localhost or HTTPS");
  return c;
}
function bufferSource(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }
function b64(bytes: Uint8Array): string { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function unb64(s: string): Uint8Array { const x = atob(s); return Uint8Array.from(x, c => c.charCodeAt(0)); }

export async function encryptLocalDraft<T>(value: T, passphrase: string): Promise<string> {
  if (passphrase.length < 12) throw new Error("Passphrase must be at least 12 characters");
  const crypto = cryptoOrThrow();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", bufferSource(encoder.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bufferSource(salt), iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferSource(iv), tagLength: 128 }, key, bufferSource(encoder.encode(JSON.stringify(value)))));
  return JSON.stringify({ v: 1, iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext) });
}

export async function decryptLocalDraft<T>(payload: string, passphrase: string): Promise<T> {
  if (passphrase.length < 12) throw new Error("Passphrase must be at least 12 characters");
  const crypto = cryptoOrThrow();
  const parsed = JSON.parse(payload) as any;
  if (parsed.v !== 1 || parsed.iterations < ITERATIONS) throw new Error("Unsupported draft format");
  const salt = unb64(parsed.salt), iv = unb64(parsed.iv), ciphertext = unb64(parsed.ciphertext);
  const base = await crypto.subtle.importKey("raw", bufferSource(encoder.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bufferSource(salt), iterations: parsed.iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bufferSource(iv), tagLength: 128 }, key, bufferSource(ciphertext));
  return JSON.parse(decoder.decode(plaintext)) as T;
}
