import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import * as core from "../src/index.js";

describe("CR-11 performance", () => {
  it("assembles a 900-question variant within the one-second target", () => {
    const seed = (`0x${"33".repeat(32)}`) as `0x${string}`;
    const bank: Record<string, unknown> = {};
    const selection = [Array.from({ length: 900 }, (_, i) => i)];
    for (let i = 0; i < 900; i++) bank[`0:${i}`] = { correctIndex: i % 4 };
    const start = performance.now();
    const variant = core.paper.buildVariant(seed, 7n, "0x0000000000000000000000000000000000000001", selection, bank);
    const elapsed = performance.now() - start;
    expect(variant.sections[0]?.items).toHaveLength(900);
    expect(elapsed).toBeLessThan(1000);
  }, 2000);
});
