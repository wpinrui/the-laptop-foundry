import { describe, expect, it } from "vitest";
import { ADJACENCY, GROWTH_ANCHORS, population, priceCeiling, SEGMENTS, screenFit } from "./segments";
import { HEADLINE_STATS } from "./types";

describe("buyer segments", () => {
  it("has Tycoon's 20 segments, 10 of each tier", () => {
    expect(new Set(SEGMENTS.map((s) => s.id)).size).toBe(20);
    expect(SEGMENTS.filter((s) => s.tier === "generalist")).toHaveLength(10);
  });

  it("keeps Tycoon's weights summing to 1 with price", () => {
    for (const s of SEGMENTS) {
      const sum = Object.values(s.tycoon.stats).reduce((a, b) => a + b, 0) + s.tycoon.price;
      expect(sum, s.id).toBeCloseTo(1, 6);
    }
  });

  it("remaps onto the headline stats, summing to 1, ratios kept", () => {
    for (const s of SEGMENTS) {
      const sum = HEADLINE_STATS.reduce((a, k) => a + s.weights[k], 0);
      expect(sum, s.id).toBeCloseTo(1, 6);
      if (s.tycoon.stats.keyboard > 0) {
        expect(s.weights.price / s.weights.keyboard, s.id).toBeCloseTo(s.tycoon.price / s.tycoon.stats.keyboard, 6);
      }
    }
  });

  it("has seasonal curves summing to 1 and growth for every segment", () => {
    for (const s of SEGMENTS) {
      expect(s.seasonal.reduce((a, b) => a + b, 0), s.id).toBeCloseTo(1, 6);
      for (const g of GROWTH_ANCHORS) expect(g.multipliers[s.id], `${s.id} ${g.year}`).toBeGreaterThan(0);
      expect(population(s, 2026)).toBeGreaterThanOrEqual(population(s, 2006));
      expect(priceCeiling(s, 2006)).toBeGreaterThan(s.priceCeiling);
    }
  });

  it("scores screen fit with a floor", () => {
    const gamer = SEGMENTS.find((s) => s.id === "gamer");
    if (!gamer) throw new Error("no gamer");
    expect(screenFit(gamer, 15.6)).toBe(1);
    expect(screenFit(gamer, 14)).toBeCloseTo(0.82, 6);
    expect(screenFit(gamer, 5)).toBe(0.05);
  });

  it("names only known segments in adjacency", () => {
    const ids = new Set(SEGMENTS.map((s) => s.id));
    for (const [a, b] of ADJACENCY) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});
