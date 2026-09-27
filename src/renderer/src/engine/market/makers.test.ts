import { describe, expect, it } from "vitest";
import { BODIES } from "../content/bodies";
import { LINES, MAKERS, onSale, priceFor, shapeFor } from "./makers";
import { HEADLINE_STATS } from "./types";

const FIRST = 2006;
const LAST = 2026;

describe("makers and lines", () => {
  it("has unique ids and known makers", () => {
    const ids = new Set(LINES.map((l) => l.id));
    expect(ids.size).toBe(LINES.length);
    const makers = new Set(MAKERS.map((m) => m.id));
    for (const l of LINES) expect(makers.has(l.maker), l.id).toBe(true);
    for (const m of MAKERS) expect(LINES.some((l) => l.maker === m.id), m.id).toBe(true);
  });

  it("keeps years in range, sorted and apart", () => {
    for (const l of LINES) {
      let prev = FIRST - 1;
      for (const [a, b] of l.years) {
        expect(a, l.id).toBeGreaterThan(prev);
        expect(b, l.id).toBeGreaterThanOrEqual(a);
        expect(b, l.id).toBeLessThanOrEqual(LAST);
        prev = b;
      }
      expect(l.shapes[0].from, l.id).toBeLessThanOrEqual(l.years[0][0]);
      for (let i = 1; i < l.shapes.length; i++) expect(l.shapes[i].from, l.id).toBeGreaterThan(l.shapes[i - 1].from);
    }
  });

  it("weights priorities to 1 over the headline stats", () => {
    for (const l of LINES) {
      expect(Object.keys(l.priorities).sort(), l.id).toEqual([...HEADLINE_STATS].sort());
      const sum = HEADLINE_STATS.reduce((s, k) => s + l.priorities[k], 0);
      expect(sum, l.id).toBeCloseTo(1, 6);
    }
  });

  it("names only real bodies, with one available every year on sale", () => {
    const byId = new Map(BODIES.map((b) => [b.id, b]));
    for (const l of LINES) {
      for (const s of l.shapes) for (const id of s.bodies) expect(byId.has(id), `${l.id} ${id}`).toBe(true);
      for (let y = FIRST; y <= LAST; y++) {
        if (!onSale(l, y)) continue;
        const ok = shapeFor(l, y).bodies.some((id) => {
          const b = byId.get(id);
          return b !== undefined && b.from <= y && b.until >= y;
        });
        expect(ok, `${l.id} ${y}`).toBe(true);
      }
    }
  });

  it("has sane prices and screens", () => {
    for (const l of LINES) {
      for (let i = 1; i < l.price.length; i++) expect(l.price[i].year, l.id).toBeGreaterThan(l.price[i - 1].year);
      for (const q of l.price) expect(q.low, l.id).toBeLessThanOrEqual(q.high);
      for (const s of l.shapes) expect(s.screen[0], l.id).toBeLessThanOrEqual(s.screen[1]);
      const [lo, hi] = priceFor(l, l.years[0][0]);
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });

  it("gives Apple silicon only to Apple", () => {
    for (const l of LINES) {
      if (l.rivalOnlyFrom !== undefined) expect(l.maker, l.id).toBe("apple");
      for (const s of l.shapes) if (s.cpu.includes("apple")) expect(l.rivalOnlyFrom, l.id).toBeLessThanOrEqual(s.from);
    }
  });
});
