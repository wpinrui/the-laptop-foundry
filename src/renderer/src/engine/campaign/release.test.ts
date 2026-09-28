import { describe, expect, it } from "vitest";
import { SAMPLES } from "../samples";
import {
  buildCost,
  isRefresh,
  newCampaign,
  release,
  releaseQuote,
  reorder,
  reorderQuote,
  scaleFactor,
  stepRun,
} from "./index";

describe("buildCost and chassis", () => {
  it("prices a sample build and knows a refresh by its body", () => {
    const b = SAMPLES[0].build;
    const cost = buildCost(b);
    expect(cost).toBeGreaterThan(100);
    expect(cost).toBeLessThan(5_000);
    const bumped = structuredClone(b);
    bumped.price = 1234;
    expect(isRefresh(bumped, [b])).toBe(true);
    bumped.size = { ...b.size, x: b.size.x + 10 };
    expect(isRefresh(bumped, [b])).toBe(false);
  });
});

describe("scaleFactor", () => {
  it("is full cost at the reference, dearer below it and cheaper above, down to 0.7", () => {
    expect(scaleFactor(5_000)).toBe(1);
    expect(scaleFactor(1_000)).toBeCloseTo(1.16, 2);
    expect(scaleFactor(100)).toBeCloseTo(1.39, 2);
    expect(scaleFactor(10_000)).toBeCloseTo(0.89, 2);
    expect(scaleFactor(50_000)).toBeCloseTo(1 / 1.4, 6);
    expect(scaleFactor(100_000)).toBe(0.7);
  });

  it("moves the unit cost with every step of the run", () => {
    for (const u of [100, 1_000, 4_200, 4_900, 5_500, 20_000]) expect(scaleFactor(u)).not.toBe(scaleFactor(u + 100));
  });
});

describe("quotes", () => {
  it("adds design and tooling to a new release, less on a refresh", () => {
    expect(releaseQuote(600, 5_000, false)).toEqual({
      unit: 600,
      setup: 1_000_000,
      total: 4_000_000,
    });
    expect(releaseQuote(600, 5_000, true).setup).toBe(125_000);
    expect(reorderQuote(600, 5_000)).toEqual({
      unit: 600,
      setup: 0,
      total: 3_000_000,
    });
  });

  it("steps along the run sizes", () => {
    expect(stepRun(5_000, 1)).toBe(5_500);
    expect(stepRun(5_000, -1)).toBe(4_900);
    expect(stepRun(100, -1)).toBe(100);
    expect(stepRun(100_000, 1)).toBe(100_000);
    expect(stepRun(20_000, 1)).toBe(21_000);
  });
});

describe("release", () => {
  const s = newCampaign(2010);

  it("charges cash and puts the run in stock", () => {
    const next = release(s, "a", 999, 600, 5_000, false);
    expect(next?.cash).toBe(1_000_000);
    expect(next?.releases.a).toMatchObject({
      stock: 5_000,
      made: 5_000,
      price: 999,
      quarter: { year: 2010, quarter: 1 },
    });
    const more = next && reorder(next, "a", 600, 1_000);
    expect(more?.cash).toBeCloseTo(1_000_000 - 600 * scaleFactor(1_000) * 1_000, 6);
    expect(more?.releases.a.stock).toBe(6_000);
  });

  it("is blocked when cash is short, unpriced or already released", () => {
    expect(release(s, "a", 999, 600, 10_000, false)).toBeNull();
    expect(release(s, "a", undefined, 600, 1_000, false)).toBeNull();
    const once = release(s, "a", 999, 600, 1_000, false);
    expect(once && release(once, "a", 999, 600, 1_000, false)).toBeNull();
    expect(reorder(s, "a", 600, 1_000)).toBeNull();
  });
});
