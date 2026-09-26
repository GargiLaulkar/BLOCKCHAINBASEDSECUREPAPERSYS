import { variantHash } from "./paper.js";
import type { BankPlain, MatchReport, Variant } from "./types.js";

function normalise(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(text: string): string[] {
  const n = normalise(text);
  return n ? n.split(" ") : [];
}

function grams(text: string): Set<string> {
  const t = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < t.length; i++) out.add(`${t[i]} ${t[i + 1]} ${t[i + 2]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function kendallAgreement<T>(reference: readonly T[], observed: readonly T[]): number {
  if (reference.length < 2 || observed.length < 2) return reference.length === observed.length ? 1 : 0;
  const rank = new Map(reference.map((v, i) => [v, i]));
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < observed.length; i++) {
    for (let j = i + 1; j < observed.length; j++) {
      const a = rank.get(observed[i]!);
      const b = rank.get(observed[j]!);
      if (a === undefined || b === undefined) continue;
      total++;
      if (a < b) concordant++;
    }
  }
  return total ? concordant / total : 0;
}

function maxQuestionSimilarity(leaked: string, question: string): { score: number; position: number } {
  const q = normalise(question);
  if (!q) return { score: 0, position: Number.MAX_SAFE_INTEGER };
  const direct = leaked.indexOf(q);
  if (direct >= 0) return { score: 1, position: direct };
  const qTokens = tokens(q);
  const qGrams = grams(q);
  if (!qGrams.size) return { score: 0, position: Number.MAX_SAFE_INTEGER };
  const leakedTokens = tokens(leaked);
  let best = { score: 0, position: Number.MAX_SAFE_INTEGER };
  for (let i = 0; i + qTokens.length <= leakedTokens.length; i++) {
    const candidate = leakedTokens.slice(i, i + qTokens.length).join(" ");
    const score = jaccard(qGrams, grams(candidate));
    if (score > best.score) best = { score, position: i };
  }
  return best;
}

function questionMatches(leakedText: string, bank: BankPlain): Array<{ qid: string; score: number; position: number }> {
  const leaked = normalise(leakedText);
  const result: Array<{ qid: string; score: number; position: number }> = [];
  for (const [qid, question] of Object.entries(bank)) {
    const match = maxQuestionSimilarity(leaked, question.text);
    if (match.score >= 0.5) result.push({ qid, score: match.score, position: match.position });
  }
  return result.sort((a, b) => a.position - b.position || b.score - a.score);
}

function optionAgreement(leakedText: string, matchedQids: string[], bank: BankPlain, variant: Variant): number {
  const leaked = normalise(leakedText);
  const variantOrder = new Map<string, number[]>();
  for (const section of variant.sections) for (const item of section.items) variantOrder.set(item.qid, [...item.opts]);
  const agreements: number[] = [];
  for (const qid of matchedQids) {
    const q = bank[qid];
    const opts = variantOrder.get(qid);
    if (!q || !opts) continue;
    const positions = opts.map((original) => leaked.indexOf(normalise(q.options[original as 0 | 1 | 2 | 3])));
    const observed = positions.map((p, i) => ({ p, i })).filter((x) => x.p >= 0).sort((a, b) => a.p - b.p).map((x) => x.i);
    if (observed.length >= 2) agreements.push(kendallAgreement(observed.map((_, i) => i), observed));
  }
  return agreements.length ? agreements.reduce((a, b) => a + b, 0) / agreements.length : 0;
}

export function matchLeak(leakedText: string, bank: BankPlain, variants: readonly Variant[]): MatchReport {
  const matches = questionMatches(leakedText, bank);
  if (matches.length < 5) return { matches: [] };
  const observedQids = matches.map((m) => m.qid);
  const reports = variants.map((variant) => {
    const reference = variant.sections.flatMap((s) => s.items.map((i) => i.qid));
    const overlap = observedQids.filter((qid) => reference.includes(qid));
    const questionOrderAgreement = kendallAgreement(reference.filter((q) => overlap.includes(q)), overlap);
    const optionOrderAgreement = optionAgreement(leakedText, overlap, bank, variant);
    const score = 0.6 * questionOrderAgreement + 0.4 * optionOrderAgreement;
    return {
      variantHash: variantHash(variant),
      centre: variant.centre,
      score,
      evidence: [`matched ${overlap.length} questions`, `question-order agreement ${(questionOrderAgreement * 100).toFixed(1)}%`, `option-order agreement ${(optionOrderAgreement * 100).toFixed(1)}%`]
    };
  }).sort((a, b) => b.score - a.score);
  return { matches: reports };
}
