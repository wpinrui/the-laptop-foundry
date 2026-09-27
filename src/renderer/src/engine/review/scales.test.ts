import { describe, expect, it } from "vitest";
import { CURVE, curve, placeOn, refsAt, type Scale, SCALES, scoreOn } from "./scales";
import { CLASS_WEIGHTS, weightsFor } from "./weights";

describe("curve", () => {
  it("hits the anchor scores at the references", () => {
    expect(curve(0)).toBeCloseTo(CURVE.LOW_SCORE);
    expect(curve(1)).toBeCloseTo(CURVE.HIGH_SCORE);
    expect(curve(0.5)).toBeCloseTo((CURVE.LOW_SCORE + CURVE.HIGH_SCORE) / 2);
  });

  it("is harsh below the low end and never goes below 0", () => {
    const inBand = curve(0.1) - curve(0);
    const below = curve(0) - curve(-0.1);
    expect(below).toBeGreaterThan(inBand);
    expect(curve(-10)).toBeGreaterThanOrEqual(0);
  });

  it("flattens above the high end and never reaches the ceiling", () => {
    expect(curve(1.5)).toBeGreaterThan(curve(1));
    expect(curve(2) - curve(1.5)).toBeLessThan(curve(1.5) - curve(1));
    expect(curve(50)).toBeLessThanOrEqual(CURVE.CEILING);
  });

  it("rises everywhere", () => {
    for (let t = -3; t < 4; t += 0.25) expect(curve(t + 0.25)).toBeGreaterThan(curve(t));
  });
});

describe("scales", () => {
  const up: Scale = { log: true, refs: [[2006, 2, 4], [2026, 8, 16]] };
  const down: Scale = { lower: true, refs: [[2006, 40, 30]] };

  it("interpolates the references between years", () => {
    expect(refsAt(up, 2016)).toEqual({ low: 5, high: 10 });
    expect(refsAt(up, 2000)).toEqual({ low: 2, high: 4 });
  });

  it("places log and lower-is-better measurements", () => {
    expect(placeOn(Math.sqrt(8), up, 2006)).toBeCloseTo(0.5);
    expect(placeOn(35, down, 2006)).toBeCloseTo(0.5);
    expect(placeOn(45, down, 2006)).toBeLessThan(0);
  });

  it("tightens by year: the same measurement scores lower later", () => {
    expect(scoreOn(4, up, 2026)).toBeLessThan(scoreOn(4, up, 2006));
  });

  it("scores a zero on a log scale without breaking", () => {
    const s = scoreOn(0, up, 2006);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeLessThan(CURVE.LOW_SCORE);
  });

  it("has a scale for every year with low and high the right way round", () => {
    for (const [k, sc] of Object.entries(SCALES))
      for (const y of [2006, 2016, 2026]) {
        const { low, high } = refsAt(sc, y);
        expect(sc.lower ? low > high : high > low, `${k} ${y}`).toBe(true);
      }
  });
});

describe("class weights", () => {
  it("sum to 1 for every class", () => {
    for (const performance of Object.keys(CLASS_WEIGHTS.performance) as ("office" | "mixed-use" | "gaming")[])
      for (const body of Object.keys(CLASS_WEIGHTS.body) as ("thin and light" | "medium" | "large")[])
        for (const budget of Object.keys(CLASS_WEIGHTS.budget) as ("low" | "midrange" | "premium")[]) {
          const w = weightsFor({ performance, body, budget });
          expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        }
  });

  it("weights games most for gaming, and weight and battery most for thin and light", () => {
    const gaming = weightsFor({ performance: "gaming", body: "large", budget: "premium" });
    const thin = weightsFor({ performance: "office", body: "thin and light", budget: "midrange" });
    expect(gaming.games).toBe(Math.max(...Object.values(gaming)));
    const top2 = Object.entries(thin).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    expect(top2.sort()).toEqual(["battery", "weight"]);
  });
});
