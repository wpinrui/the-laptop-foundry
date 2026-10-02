import { factsOf, type Subject } from "../engine";
import { marketScore } from "../engine/market/score";
import { segmentById } from "../engine/market/segments";
import { type HeadlineValues, headlineStats } from "../engine/market/stats";

/**
 * Each laptop's best buyer segment and its market score, against the others
 * given for its year: on the review site, that year's market and the player's own.
 */
export function bestSegments(subjects: Subject[]): Map<string, { segment: string; score: number }> {
  const stats = new Map<string, HeadlineValues>();
  for (const s of subjects) {
    try {
      const f = factsOf(s);
      stats.set(s.id, headlineStats(s.build, f.fit, f.m, f.r));
    } catch {}
  }
  const byYear = new Map<number, HeadlineValues[]>();
  for (const s of subjects) {
    const v = stats.get(s.id);
    if (v) byYear.set(s.build.year, [...(byYear.get(s.build.year) ?? []), v]);
  }
  const out = new Map<string, { segment: string; score: number }>();
  for (const s of subjects) {
    const v = stats.get(s.id);
    if (!v) continue;
    const segs = Object.values(marketScore({ id: s.id, stats: v }, byYear.get(s.build.year) ?? []).segments);
    const best = segs.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.base > a.base) ? b : a));
    out.set(s.id, { segment: segmentById(best.segment).shortName, score: best.score });
  }
  return out;
}
