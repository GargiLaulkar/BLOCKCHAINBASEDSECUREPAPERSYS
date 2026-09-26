import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { canonicalize } from "./canonical.js";
import type { Address, BankIndex, Hex, Variant } from "./types.js";

const coder = AbiCoder.defaultAbiCoder();
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytes(hex: Hex): Uint8Array {
  const clean = hex.slice(2);

  const out = new Uint8Array(clean.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(
      clean.slice(i * 2, i * 2 + 2),
      16
    );
  }

  return out;
}

function uint32be(i: number): Uint8Array {
  const out = new Uint8Array(4);

  new DataView(out.buffer).setUint32(
    0,
    i >>> 0,
    false
  );

  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(
    parts.reduce((n, p) => n + p.length, 0)
  );

  let o = 0;

  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }

  return out;
}

function rand(
  seed: Hex,
  label: string,
  i: number
): bigint {
  const digest = keccak256(
    concat(
      bytes(seed),
      toUtf8Bytes(label),
      uint32be(i)
    )
  );

  return BigInt(digest);
}

function shuffle<T>(
  input: readonly T[],
  seed: Hex,
  label: string
): T[] {
  const a = [...input];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Number(
      rand(seed, label, i) % BigInt(i + 1)
    );

    [a[i], a[j]] = [a[j]!, a[i]!];
  }

  return a;
}

/**
 * Select questions from each section.
 *
 * The seed must be a valid 32-byte hexadecimal value:
 * 0x followed by exactly 64 hexadecimal characters.
 */
export function selectPaper(
  seed: Hex,
  poolSizes: readonly number[],
  quotas: readonly number[]
): number[][] {

  // Validate seed before doing any work.
  if (!/^0x[0-9a-fA-F]{64}$/.test(seed)) {
    throw new Error(
      "seed must be a 32-byte hex value"
    );
  }

  // There must be one quota for every section.
  if (poolSizes.length !== quotas.length) {
    throw new Error(
      "poolSizes and quotas must have equal length"
    );
  }

  return poolSizes.map((size, s) => {

    // Pool size must be a non-negative integer.
    if (!Number.isInteger(size) || size < 0) {
      throw new RangeError(
        "pool size must be a non-negative integer"
      );
    }

    const quota = quotas[s]!;

    // Quota must be at least 1 and cannot exceed pool size.
    if (
      !Number.isInteger(quota) ||
      quota < 1 ||
      quota > size
    ) {
      throw new RangeError(
        `Invalid quota for section ${s}`
      );
    }

    // Create the question pool.
    const pool = Array.from(
      { length: size },
      (_, i) => i
    );

    // Deterministically shuffle, select the requested
    // number of questions, then return them sorted.
    return shuffle(
      pool,
      seed,
      `select:${s}`
    )
      .slice(0, quota)
      .sort((a, b) => a - b);
  });
}

function variantSeed(
  seed: Hex,
  examId: bigint,
  centre: Address
): Hex {
  return keccak256(
    coder.encode(
      ["bytes32", "uint256", "address"],
      [
        seed,
        examId,
        getAddress(centre)
      ]
    )
  ) as Hex;
}

function hasBankEntry(
  bank: BankIndex,
  qid: string
): boolean {
  return Object.prototype.hasOwnProperty.call(
    bank,
    qid
  );
}

export function buildVariant(
  seed: Hex,
  examId: bigint,
  centre: Address,
  selection: readonly number[][],
  bank: BankIndex
): Variant {

  const vs = variantSeed(
    seed,
    examId,
    centre
  );

  const sections = selection.map(
    (selected, s) => {

      // Shuffle the selected questions to create
      // the ordering for this variant.
      const ordered = shuffle(
        selected,
        vs,
        `order:${s}`
      );

      const items = ordered.map(
        (index) => {

          const qid = `${s}:${index}`;

          if (!hasBankEntry(bank, qid)) {
            throw new Error(
              `Bank is missing question ${qid}`
            );
          }

          // Shuffle the four answer-option indexes.
          const opts = shuffle(
            [0, 1, 2, 3] as const,
            vs,
            `opt:${qid}`
          ) as [
            number,
            number,
            number,
            number
          ];

          return {
            qid,
            opts
          };
        }
      );

      return {
        sectionId: s,
        items
      };
    }
  );

  return {
    v: 1,
    examId: examId.toString(),
    centre: getAddress(centre) as Address,
    sections
  };
}

export function variantHash(
  v: Variant
): Hex {
  return keccak256(
    toUtf8Bytes(
      canonicalize(v)
    )
  ) as Hex;
}

export function variantCode(
  hash: Hex
): string {

  const input = bytes(hash).slice(0, 4);

  let buffer = 0;
  let bits = 0;
  let output = "";

  for (const b of input) {

    buffer = (buffer << 8) | b;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;

      output +=
        BASE32[
          (buffer >>> bits) & 31
        ];
    }
  }

  if (bits > 0) {
    output +=
      BASE32[
        (buffer << (5 - bits)) & 31
      ];
  }

  return output;
}

function correctIndexFor(
  bank: BankIndex,
  qid: string
): number {

  const entry = bank[qid] as any;

  // Format 1:
  // qid -> number
  if (typeof entry === "number") {
    return entry;
  }

  // Format 2:
  // qid -> { correctIndex }
  if (
    entry &&
    typeof entry.correctIndex === "number"
  ) {
    return entry.correctIndex;
  }

  // Format 3:
  // qid -> { question: { correctIndex } }
  if (
    entry &&
    entry.question &&
    typeof entry.question.correctIndex === "number"
  ) {
    return entry.question.correctIndex;
  }

  throw new Error(
    `Bank entry ${qid} does not expose correctIndex`
  );
}

export function answerKey(
  v: Variant,
  bank: BankIndex
): number[] {

  const out: number[] = [];

  for (const section of v.sections) {

    for (const item of section.items) {

      const correctIndex =
        correctIndexFor(
          bank,
          item.qid
        );

      if (
        !Number.isInteger(correctIndex) ||
        correctIndex < 0 ||
        correctIndex > 3
      ) {
        throw new Error(
          `Invalid correctIndex for ${item.qid}`
        );
      }

      out.push(
        item.opts.indexOf(
          correctIndex
        )
      );
    }
  }

  return out;

}