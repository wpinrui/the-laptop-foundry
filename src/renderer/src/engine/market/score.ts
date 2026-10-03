import { rng } from "../review";
import { SEGMENTS } from "./segments";
import type { HeadlineValues } from "./stats";
import { HEADLINE_STATS, type HeadlineStat, type Segment, type SegmentId } from "./types";

// The market score (GDD, Version 0.2, "Market score"), Laptop Tycoon's
// formula: each headline stat as a ratio to the year's market average,
// clamped; per segment the weighted mean of the ratios, mapped linearly onto
// 1 to 10, plus seeded uniform noise, rounded.

export const RATIO_MIN = 0.5;
export const RATIO_MAX = 1.5;
/**
 * Games ratio's ceiling. Most of a year's market has no graphics card, so its
 * average frame rate is low and even a modest card reached 1.5; past it a
 * stronger card bought a gamer nothing.
 */
export const GAMES_RATIO_MAX = 3;
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
/** Noise is uniform in plus or minus this. */
export const NOISE = 0.5;
export const GOOD_AT = 1.15;
export const BAD_AT = 0.85;

export type Sentiment = "good" | "bad" | "neutral";

/** A laptop in the market: the year's rivals and the player's releases. */
export interface MarketLaptop {
  /** Stable id; seeds the noise, so the same laptop always gets the same score. */
  id: string;
  stats: HeadlineValues;
}

export interface SegmentScore {
  segment: SegmentId;
  /** 1 to 10, rounded, noise included. */
  score: number;
  /** The weighted mean ratio mapped onto 1 to 10, before noise and rounding. */
  base: number;
  /** The noise added, within plus or minus NOISE. */
  noise: number;
  /** Stats the segment weighs that are good or bad for it. */
  good: HeadlineStat[];
  bad: HeadlineStat[];
}

export interface MarketScore {
  /** Clamped ratio to the market average per stat. */
  ratios: Record<HeadlineStat, number>;
  sentiment: Record<HeadlineStat, Sentiment>;
  segments: Record<SegmentId, SegmentScore>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mean of each stat over the market. An empty market averages to 0 per stat. */
export function marketAverage(market: HeadlineValues[]): HeadlineValues {
  const out = Object.fromEntries(HEADLINE_STATS.map((k) => [k, 0])) as HeadlineValues;
  if (market.length === 0) return out;
  for (const m of market) for (const k of HEADLINE_STATS) out[k] += m[k];
  for (const k of HEADLINE_STATS) out[k] /= market.length;
  return out;
}

/** The laptop's value over the average, clamped to 0.5 to 1.5 (games to GAMES_RATIO_MAX). A zero average reads as 1. */
export function statRatio(value: number, average: number, stat?: HeadlineStat): number {
  if (!(average > 0)) return 1;
  return clamp(value / average, RATIO_MIN, stat === "games" ? GAMES_RATIO_MAX : RATIO_MAX);
}

export function sentimentOf(ratio: number): Sentiment {
  return ratio >= GOOD_AT ? "good" : ratio <= BAD_AT ? "bad" : "neutral";
}

/** Weighted mean ratio onto 1 to 10: 0.5 gives 1, 1.5 gives 10. */
export function mapToScore(meanRatio: number): number {
  const t = (clamp(meanRatio, RATIO_MIN, RATIO_MAX) - RATIO_MIN) / (RATIO_MAX - RATIO_MIN);
  return SCORE_MIN + t * (SCORE_MAX - SCORE_MIN);
}

/** Uniform in plus or minus NOISE, fixed per laptop and segment. */
export function noiseFor(laptopId: string, segment: SegmentId): number {
  return (rng(`market:${laptopId}:${segment}`)() * 2 - 1) * NOISE;
}

/** Weighted mean of the ratios under the segment's weights. */
export function weightedRatio(ratios: Record<HeadlineStat, number>, weights: Segment["weights"]): number {
  let sum = 0;
  let w = 0;
  for (const k of HEADLINE_STATS) {
    sum += ratios[k] * weights[k];
    w += weights[k];
  }
  return w > 0 ? sum / w : 1;
}

/**
 * The laptop's market score for every segment. `market` is the year's field
 * (rivals and the player's releases); include the laptop itself if it is on
 * sale, since the average is taken over exactly what is passed.
 */
export function marketScore(
  laptop: MarketLaptop,
  market: HeadlineValues[],
  segments: Segment[] = SEGMENTS,
): MarketScore {
  const avg = marketAverage(market);
  const ratios = {} as Record<HeadlineStat, number>;
  const sentiment = {} as Record<HeadlineStat, Sentiment>;
  for (const k of HEADLINE_STATS) {
    ratios[k] = statRatio(laptop.stats[k], avg[k], k);
    sentiment[k] = sentimentOf(ratios[k]);
  }
  const out = {} as Record<SegmentId, SegmentScore>;
  for (const s of segments) {
    const base = mapToScore(weightedRatio(ratios, s.weights));
    const noise = noiseFor(laptop.id, s.id);
    const weighed = HEADLINE_STATS.filter((k) => s.weights[k] > 0);
    out[s.id] = {
      segment: s.id,
      score: clamp(Math.round(base + noise), SCORE_MIN, SCORE_MAX),
      base,
      noise,
      good: weighed.filter((k) => sentiment[k] === "good"),
      bad: weighed.filter((k) => sentiment[k] === "bad"),
    };
  }
  return { ratios, sentiment, segments: out };
}
