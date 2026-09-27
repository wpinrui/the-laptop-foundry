import { describe, expect, it } from "vitest";
import { CONTENT } from "../content";
import { solve } from "../solve";
import { generateModel, generateYear, rngOf } from "./generate";
import { LINES, linesIn, priceFor } from "./makers";

const SAMPLE = [2006, 2011, 2016, 2021, 2026];
const years = new Map(SAMPLE.map((y) => [y, generateYear(y, 1)]));

describe("rival generator", () => {
  it.each(SAMPLE)("every model of %i solves with no problems", (year) => {
    const g = years.get(year);
    expect(g).toBeDefined();
    for (const m of g?.models ?? []) {
      expect(m.valid, `${m.name}: ${JSON.stringify(m.problems)}`).toBe(true);
      expect(solve(m.build).problems, m.name).toEqual([]);
      expect(m.build.year).toBe(year);
      expect(m.solves).toBeLessThanOrEqual(40);
    }
  });

  it("makes one model per line on sale, and none for lines off sale", () => {
    for (const year of SAMPLE) {
      const ids = (years.get(year)?.models ?? []).map((m) => m.line).sort();
      expect(ids).toEqual(linesIn(year).map((l) => l.id).sort());
    }
    const y2006 = years.get(2006)?.models.map((m) => m.line) ?? [];
    expect(y2006).not.toContain("lenovo-legion");
    expect(y2006).not.toContain("microsoft-surface-laptop");
    const y2016 = years.get(2016)?.models.map((m) => m.line) ?? [];
    expect(y2016).not.toContain("sony-vaio");
    const y2021 = years.get(2021)?.models.map((m) => m.line) ?? [];
    expect(y2021).not.toContain("toshiba-satellite");
    expect(y2021).not.toContain("toshiba-portege");
  });

  it("is the same for a seed and differs across seeds", () => {
    const a = generateYear(2016, 7);
    const b = generateYear(2016, 7);
    const c = generateYear(2016, 8);
    const key = (g: typeof a) => JSON.stringify(g.models.map((m) => [m.name, m.build]));
    expect(key(a)).toEqual(key(b));
    expect(key(a)).not.toEqual(key(c));
  });

  it("keeps rival-only parts to the lines and years that may use them", () => {
    const rivalOnly = new Set(CONTENT.parts.filter((p) => p.rivalOnly).map((p) => p.id));
    for (const g of years.values())
      for (const m of g.models) {
        const line = LINES.find((l) => l.id === m.line);
        const allowed = line?.rivalOnlyFrom !== undefined && m.build.year >= line.rivalOnlyFrom;
        const used = Object.values(m.build.parts)
          .flat()
          .some((bp) => bp && rivalOnly.has(bp.part));
        if (!allowed) expect(used, m.name).toBe(false);
      }
    const mbp = years.get(2026)?.models.find((m) => m.line === "apple-macbook-pro");
    expect(mbp?.build.parts.processor?.[0].part.startsWith("apple-m")).toBe(true);
  });

  it("uses only parts on sale in the model's year", () => {
    const byId = new Map(CONTENT.parts.map((p) => [p.id, p]));
    for (const g of years.values())
      for (const m of g.models) {
        const ids = [...Object.values(m.build.parts).flat().map((bp) => bp?.part), ...m.build.ports.map((p) => p.part)];
        for (const id of ids) {
          const p = id ? byId.get(id) : undefined;
          expect(p, `${m.name} ${id}`).toBeDefined();
          if (p) expect(p.from <= g.year && g.year <= p.until, `${m.name} ${id}`).toBe(true);
        }
      }
  });

  it("prices each model inside its line's band", () => {
    for (const g of years.values())
      for (const m of g.models) {
        const line = LINES.find((l) => l.id === m.line);
        if (!line) throw new Error(m.line);
        const [lo, hi] = priceFor(line, g.year);
        expect(m.build.price ?? 0, m.name).toBeGreaterThanOrEqual(Math.min(lo - 50, 199));
        expect(m.build.price ?? 0, m.name).toBeLessThanOrEqual(hi + 50);
      }
  });

  it("generates a single model from a line and a random source", () => {
    const line = LINES.find((l) => l.id === "lenovo-thinkpad");
    if (!line) throw new Error("no ThinkPad line");
    const g = generateModel(line, 2012, rngOf(3));
    expect(g.valid).toBe(true);
    expect(g.build.parts.trackpad?.[0].opts?.stick).toBe("yes");
  });
});
