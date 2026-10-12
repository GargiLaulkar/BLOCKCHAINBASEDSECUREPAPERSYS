import * as canonicalizeModule from "canonicalize";
import { keccak256, toUtf8Bytes } from "ethers";
import type { Hex } from "./types.js";

type CanonicalizeFn = (value: unknown) => string | undefined;
const canonicalizeJson: CanonicalizeFn =
  (canonicalizeModule as unknown as { default?: CanonicalizeFn }).default ??
  (canonicalizeModule as unknown as CanonicalizeFn);

/** RFC 8785 JSON Canonicalization Scheme representation. */
export function canonicalize(value: unknown): string {
  const result = canonicalizeJson(value);
  if (result === undefined) throw new TypeError("Value is not JSON-serializable");
  return result;
}

/** keccak256 of the UTF-8 JCS representation. */
export function keccakJson(value: unknown): Hex {
  return keccak256(toUtf8Bytes(canonicalize(value))) as Hex;
}
