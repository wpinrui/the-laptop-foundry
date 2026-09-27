import { describe, expect, it } from "vitest";
import { SAMPLES } from "../samples";
import {
  mapToScore,
  marketAverage,
  marketScore,
  NOISE,
  noiseFor,
  sentimentOf,
  statRatio,
  weightedRatio,
} from "./score";
import { SEGMENTS } from "./segments";
import { FLOOR, type HeadlineValues, headlineStatsOf } from "./stats";
import { HEADLINE_STATS, type HeadlineStat } from "./types";

const flat = (v: number): HeadlineValues =>
  Object.fromEntries(HEADLINE_STATS.map((k) => [k, v])) as HeadlineValues;

describe("market score formula", () => {
  it("clamps the ratio to 0.5 to 1.5", () => {
    expect(statRatio(10, 1)).toBe(1.5);
    expect(statRatio(0, 1)).toBe(0.5);
    expect(statRatio(1.2, 1)).toBeCloseTo(1.2);
    expect(statRatio(5, 0)).toBe(1);
  });

  it("maps 0.5 to 1 and 1.5 to 10, linearly", () => {
    expect(mapToScore(0.5)).toBe(1);
    expect(mapToScore(1.5)).toBe(10);
    expect(mapToScore(1)).toBe(5.5);
    expect(mapToScore(0.1)).toBe(1);
    expect(mapToScore(3)).toBe(10);
  });

  it("marks sentiment at 1.15 and 0.85", () => {
    expect(sentimentOf(1.15)).toBe("good");
    expect(sentimentOf(1.14)).toBe("neutral");
    expect(sentimentOf(0.85)).toBe("bad");
    expect(sentimentOf(0.86)).toBe("neutral");
  });

  it("takes the weighted mean under a segment's weights", () => {
    const ratios = { ...flat(1), price: 1.5 } as Record<HeadlineStat, number>;
    const w = { ...flat(0), app: 0.5, price: 0.5 };
    expect(weightedRatio(ratios, w)).toBeCloseTo(1.25);
  });

  it("keeps the noise within plus or minus 0.5 and fixed per laptop and segment", () => {
    for (let i = 0; i < 200; i++) {
      const n = noiseFor(`lap-${i}`, "gamer");
      expect(Math.abs(n)).toBeLessThanOrEqual(NOISE);
      expect(noiseFor(`lap-${i}`, "gamer")).toBe(n);
    }
    expect(noiseFor("a", "gamer")).not.toBe(noiseFor("a", "student"));
  });

  it("scores an average laptop near the middle and the extremes at 1 and 10", () => {
    const market = [flat(1), flat(1)];
    const mid = marketScore({ id: "mid", stats: flat(1) }, market);
    for (const s of Object.values(mid.segments)) {
      expect(s.base).toBe(5.5);
      expect([5, 6]).toContain(s.score);
    }
    const top = marketScore({ id: "top", stats: flat(100) }, market);
    const bottom = marketScore({ id: "bottom", stats: flat(FLOOR) }, market);
    for (const s of Object.values(top.segments)) {
      expect(s.score).toBe(10);
      expect(s.bad).toEqual([]);
    }
    for (const s of Object.values(bottom.segments)) {
      expect(s.score).toBe(1);
      expect(s.good).toEqual([]);
    }
    expect(Object.keys(top.segments)).toHaveLength(SEGMENTS.length);
  });

  it("gives the same laptop the same score every time", () => {
    const market = [flat(1), flat(2), flat(0.5)];
    const a = marketScore({ id: "x", stats: flat(1.1) }, market);
    const b = marketScore({ id: "x", stats: flat(1.1) }, market);
    expect(a).toEqual(b);
  });

  it("averages per stat", () => {
    expect(marketAverage([flat(1), flat(3)]).app).toBe(2);
    expect(marketAverage([]).app).toBe(0);
  });
});

describe("headline stats", () => {
  const picked = SAMPLES.slice(0, 4).concat(SAMPLES.slice(-2));
  const stats = picked.map((s) => ({ id: s.id, stats: headlineStatsOf(s.build) }));

  it.each(stats)("computes every stat as a positive finite number for $id", ({ stats }) => {
    for (const k of HEADLINE_STATS) {
      expect(Number.isFinite(stats[k])).toBe(true);
      expect(stats[k]).toBeGreaterThan(0);
    }
  });

  it("scores the samples against each other within 1 to 10", () => {
    const market = stats.map((s) => s.stats);
    for (const s of stats) {
      const score = marketScore(s, market);
      for (const seg of Object.values(score.segments)) {
        expect(seg.score).toBeGreaterThanOrEqual(1);
        expect(seg.score).toBeLessThanOrEqual(10);
      }
    }
  });
});
