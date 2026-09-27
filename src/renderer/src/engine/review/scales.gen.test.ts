import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { RIVALS } from "../content/rivals";
import { factsOf, rivalSubject } from "./index";
import { CATEGORY_KEYS, categoryValues } from "./score";
import { type CategoryKey, SCALES } from "./scales";

// Dev script, not a test: drafts the review scales from the year's rivals.
// GEN_SCALES=1 yarn vitest run scales.gen
// Per year, the low reference is the 10th percentile of the rivals as built,
// with no quality spend; the high one the 90th percentile of the same rivals
// with half quality spend everywhere, so full spend still has room above it.
// Both are held so a scale never loosens (a `loose` scale follows a running
// mean instead), and a span too narrow to tell
// builds apart is widened downward. Scales marked `hand` are kept as they
// are. The block goes to temp/scales.txt, to paste between the
// GENERATED-SCALES markers in scales.ts.

const LOW_PCT = 0.1;
const HIGH_PCT = 0.9;

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

const sig = (n: number) => Number(n.toPrecision(3));

/** Narrowest span: a ratio of high over low on log scales, a share of the high one on linear. */
const MIN_RATIO = 1.5;
const MIN_SHARE = 0.25;
const SPEND = 0.5;

describe.skipIf(!process.env.GEN_SCALES)("review scales draft", () => {
  it("prints the scales", { timeout: 600000 }, () => {
    const low = new Map<number, Record<CategoryKey, number>[]>();
    const high = new Map<number, Record<CategoryKey, number>[]>();
    const push = (m: Map<number, Record<CategoryKey, number>[]>, y: number, v: Record<CategoryKey, number>) =>
      m.set(y, [...(m.get(y) ?? []), v]);
    for (const r of RIVALS) {
      const f = factsOf(rivalSubject(r));
      if (!f.m.cooling) continue;
      push(low, r.build.year, categoryValues(f));
      const q = { display: SPEND, keyboard: SPEND, trackpad: SPEND, speakers: SPEND, webcam: SPEND };
      const s = rivalSubject(r);
      const g = factsOf({ ...s, id: `${s.id}:spend`, build: { ...s.build, quality: q } });
      push(high, r.build.year, categoryValues(g));
    }
    const byYear = low;
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const lines: string[] = [];
    for (const k of CATEGORY_KEYS) {
      if (SCALES[k].hand) {
        lines.push(`  ${k}: ${JSON.stringify(SCALES[k]).replace(/"(\w+)":/g, "$1: ")},`);
        continue;
      }
      const lower = !!SCALES[k].lower;
      const better = (a: number, b: number) => (lower ? Math.min(a, b) : Math.max(a, b));
      const rawLo = years.map((y) => pct((low.get(y) ?? []).map((v) => v[k]), lower ? HIGH_PCT : LOW_PCT));
      const rawHi = years.map((y) => pct((high.get(y) ?? []).map((v) => v[k]), lower ? LOW_PCT : HIGH_PCT));
      // Held: never looser than any earlier year. Loose: a five-year running mean.
      const shape = (xs: number[]) =>
        SCALES[k].loose
          ? xs.map((_, i) => {
              const w = xs.slice(Math.max(0, i - 2), i + 3);
              return w.reduce((a, b) => a + b, 0) / w.length;
            })
          : xs.map((_, i) => xs.slice(0, i + 1).reduce(better));
      const los = shape(rawLo);
      const his = shape(rawHi);
      const refs: string[] = [];
      years.forEach((y, i) => {
        const hi = his[i];
        let l = los[i];
        if (SCALES[k].log) {
          const ratio = lower ? l / hi : hi / l;
          if (ratio < MIN_RATIO) l = lower ? hi * MIN_RATIO : hi / MIN_RATIO;
        } else if (Math.abs(hi - l) < MIN_SHARE * Math.abs(hi)) l = lower ? hi * (1 + MIN_SHARE) : hi * (1 - MIN_SHARE);
        refs.push(`[${y}, ${sig(l)}, ${sig(hi)}]`);
      });
      const flags = [lower ? "lower: true" : "", SCALES[k].log ? "log: true" : "", SCALES[k].loose ? "loose: true" : ""].filter(Boolean);
      lines.push(`  ${k}: { ${[...flags, `refs: [${refs.join(", ")}]`].join(", ")} },`);
    }
    const out = lines.join("\n");
    console.log(out);
    writeFileSync("temp/scales.txt", out);
  });
});
