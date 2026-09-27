import { describe, expect, it } from "vitest";
import type { Rival } from "../market/field";
import type { Build } from "../types";
import { LAUNCH_WINDOWS } from "./constants";
import { launchQuarter, quarterIndex, rivalsOnSale, saleWindow } from "./rivals";

const rival = (line: string, year: number): Rival => ({
  id: `${line}-${year}`,
  maker: line.split("-")[0],
  line,
  name: line,
  build: { year } as Build,
});

describe("rival launch quarters", () => {
  it("is the same for a company, line and year", () => {
    expect(launchQuarter("a", "dell-xps", 2012)).toBe(launchQuarter("a", "dell-xps", 2012));
  });

  it("keeps business lines early and gaming lines late", () => {
    for (let y = 2006; y <= 2026; y++) {
      expect(LAUNCH_WINDOWS.business).toContain(launchQuarter("a", "lenovo-thinkpad", y));
      expect([3, 4]).toContain(launchQuarter("a", "dell-alienware", y));
    }
  });

  it("differs across companies somewhere", () => {
    const qs = new Set<number>();
    for (let i = 0; i < 20; i++) qs.add(launchQuarter(`c${i}`, "dell-inspiron", 2012));
    expect(qs.size).toBeGreaterThan(1);
  });

  it("sells from launch until the successor's launch quarter", () => {
    const r = rival("dell-xps", 2012);
    const [from, until] = saleWindow("a", r, new Set([2011, 2012]));
    expect(from).toBe(quarterIndex({ year: 2012, quarter: launchQuarter("a", "dell-xps", 2012) }));
    expect(until).toBe(quarterIndex({ year: 2013, quarter: launchQuarter("a", "dell-xps", 2013) }));
  });

  it("stands a model in from Q1 when last year's market is not known", () => {
    const [from] = saleWindow("a", rival("dell-xps", 2012), new Set([2012]));
    expect(from).toBe(quarterIndex({ year: 2012, quarter: 1 }));
  });

  it("has exactly one model per line on sale outside the overlap", () => {
    const rivals = [rival("dell-inspiron", 2011), rival("dell-inspiron", 2012)];
    for (const q of [1, 2, 3, 4] as const) {
      const on = rivalsOnSale("a", rivals, { year: 2012, quarter: q });
      expect(on.length).toBeGreaterThanOrEqual(1);
      expect(on.length).toBeLessThanOrEqual(2);
    }
  });
});
