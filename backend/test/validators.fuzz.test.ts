import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { schemas } from "@sigil/core";

describe("BE-10 validator fuzz checks", () => {
  it("never accepts zero or malformed values as non-zero 32-byte hashes", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        if (/^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/i.test(value)) {
          expect(schemas.HashSchema.safeParse(value).success).toBe(true);
        } else {
          expect(schemas.HashSchema.safeParse(value).success).toBe(false);
        }
      }),
      { numRuns: 250 }
    );
  });

  it("rejects profile strings outside their declared bounds", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (displayName, organisation) => {
        const result = schemas.ProfilePayloadSchema.safeParse({ displayName, organisation });
        if (
          displayName.trim().length >= 1 &&
          displayName.trim().length <= 120 &&
          organisation.trim().length >= 1 &&
          organisation.trim().length <= 200
        ) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
        }
      }),
      { numRuns: 250 }
    );
  });
});
