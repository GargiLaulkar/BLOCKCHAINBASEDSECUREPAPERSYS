/**
 * Shared types for @sigil/core.
 *
 * These mirror the shapes implied by docs/SIGIL_Master_Project_Document.md
 * section 9 (core package specification) and section 8 (on-chain / batch
 * data shapes). Full validation of these shapes is added in CR-08 (zod
 * schemas); this file only carries the TypeScript surface so the CR-01
 * stub signatures type-check.
 */

/** 0x-prefixed hex string, e.g. a keccak256 digest or a variant hash. */
export type Hex = `0x${string}`;

/** 0x-prefixed, 20-byte EVM address. Checksumming is not enforced here. */
export type Address = `0x${string}`;

/** A single multiple-choice question in its plaintext (pre-encryption) form. */
export interface QuestionPlain {
  /** 10..2000 chars per the question-batch format (section 9). */
  text: string;
  /** Exactly 4 unique, non-empty strings, each <= 500 chars. */
  options: readonly [string, string, string, string];
  /** Index into `options` of the correct answer. */
  correctIndex: 0 | 1 | 2 | 3;
  /** Optional explanation, <= 2000 chars. */
  explanation?: string;
}

/** Canonical question-batch shape, encrypted as a whole to the exam public key. */
export interface BatchPlain {
  v: 1;
  examId: string;
  sectionId: number;
  setter: Address;
  questions: readonly QuestionPlain[];
}

/** A decrypted, unlocked holder key ready to derive reveals / combine shares. */
export interface HolderKey {
  /** P-256 private key, extractable JWK form (see docs section 9, keystore). */
  privateKeyJwk: JsonWebKey;
  /** Uncompressed SEC1 public key: 0x04 || X(32) || Y(32). */
  publicKey: Uint8Array;
}

/**
 * Maps a global question id ("{sectionId}:{indexInSection}") to whatever a
 * given module needs to look the question up (bank position, hash, etc.).
 * Refined once `paper` (CR-07) defines the concrete bank layout.
 */
export type BankIndex = Record<string, unknown>;

/** Maps a global question id to its plaintext question, for leak matching. */
export type BankPlain = Record<string, QuestionPlain>;

/** A single centre's fixed exam paper: question order and per-question option order. */
export interface Variant {
  v: 1;
  examId: string;
  centre: Address;
  sections: ReadonlyArray<{
    sectionId: number;
    items: ReadonlyArray<{
      /** Global question id, "{sectionId}:{indexInSection}". */
      qid: string;
      /** opts[p] = original option index displayed at position p. */
      opts: readonly [number, number, number, number];
    }>;
  }>;
}

/** Result of matching leaked material against the question bank and known variants. */
export interface MatchReport {
  matches: ReadonlyArray<{
    variantHash: Hex;
    centre: Address;
    /** 0..1 confidence score. */
    score: number;
    /** Human-readable evidence supporting this match (matched question ids, snippets, etc). */
    evidence: readonly string[];
  }>;
}
