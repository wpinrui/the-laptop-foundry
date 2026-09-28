import { beforeAll, describe, expect, it } from "vitest";
import type { SavedModel } from "../../../../preload/store";
import type { Rival } from "../market/field";
import { generateModel, hashOf, rngOf } from "../market/generate";
import { LINES, linesIn } from "../market/makers";
import { SEGMENTS } from "../market/segments";
import { type CampaignState, campaignOf, newCampaign, resolveQuarter, savedCampaign } from "./index";
import { buildCost, release } from "./release";
import { rivalsOnSale } from "./rivals";
import { segmentBuyers } from "./sales";
import { apportion, unitsOf } from "./shelf";
import { buyersOf, competitorsOf, quarterSummary, storeListing, type WorldMarket, worldQuarters } from "./world";

const COMPANY = "world";
const LINE_IDS = ["dell-inspiron", "lenovo-thinkpad", "apple-macbook-pro", "asus-rog"];

function rivalOf(lineId: string, year: number): Rival {
  const line = LINES.find((l) => l.id === lineId);
  if (!line) throw new Error(lineId);
  const g = generateModel(line, year, rngOf(hashOf("market", COMPANY, lineId, year)));
  return { id: `${lineId}-${year}`, maker: line.maker, line: line.id, name: `${line.name} ${year}`, build: g.build };
}

let rivals: Rival[] = [];
let models: SavedModel[] = [];
let market: WorldMarket;
let s: CampaignState;
const q = (quarter: 1 | 2 | 3 | 4) => ({ year: 2012, quarter });

beforeAll(() => {
  rivals = [2011, 2012].flatMap((y) => LINE_IDS.map((id) => rivalOf(id, y)));
  const own = rivalOf("dell-inspiron", 2012);
  const cost = buildCost(own.build);
  const build = { ...own.build, price: Math.round(cost * 1.6) };
  models = [{ id: "own", name: "Own One", build, created: 0, updated: 0 }];
  market = { rivals, models };
  s = newCampaign(2012);
  const next = release(s, "own", build.price, cost, 5_000, false);
  if (!next) throw new Error("no release");
  s = next;
  for (let i = 0; i < 3; i++) s = resolveQuarter(s, { models, company: COMPANY, rivals });
}, 300_000);

describe("shelf record", () => {
  it("keeps one record per quarter that adds up to the sales record", () => {
    expect(s.shelf.map((r) => r.quarter.quarter)).toEqual([1, 2, 3]);
    for (const [i, shelf] of s.shelf.entries()) {
      const sales = s.sales[i];
      const all = Object.values(shelf.units).reduce((a, u) => a + unitsOf(u), 0);
      expect(all).toBe(sales.total);
      expect(unitsOf(shelf.units.own)).toBe(sales.units.own);
      expect(shelf.own.own).toMatchObject({ name: "Own One", demand: sales.demand.own });
      for (const u of Object.values(shelf.units)) expect(u).toHaveLength(SEGMENTS.length);
      const makers: Record<string, number> = {};
      for (const [id, u] of Object.entries(shelf.units)) {
        const r = rivals.find((x) => x.id === id);
        if (r) makers[r.maker] = (makers[r.maker] ?? 0) + unitsOf(u);
      }
      expect(makers).toEqual(sales.makers);
    }
    expect(s.shelf[0].launched).toContain("own");
    expect(s.shelf[1].launched).not.toContain("own");
  });

  it("survives a save and reload", () => {
    const back = campaignOf(JSON.parse(JSON.stringify(savedCampaign(s))));
    expect(back.shelf).toEqual(s.shelf);
  });

  it("apportions whole units that add up", () => {
    expect(apportion([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(apportion([0.2, 0.8], 5)).toEqual([1, 4]);
    expect(apportion([0, 0], 5)).toEqual([0, 0]);
    expect(apportion([3, 1], 0)).toEqual([0, 0]);
  });

  it("stays small over a full 2006 to 2026 campaign", () => {
    // Real shelves and segment sizes, units split unevenly among the sellers.
    let bytes = 0;
    for (let y = 2006; y <= 2026; y++) {
      const fake = (yy: number): Rival[] =>
        linesIn(yy).map((l) => ({ id: `${l.id}-${yy}`, maker: l.maker, line: l.id, name: l.name, build: { year: yy } as never }));
      const all = [...(y > 2006 ? fake(y - 1) : []), ...fake(y)];
      for (const quarter of [1, 2, 3, 4] as const) {
        const on = rivalsOnSale("x", all, { year: y, quarter });
        const units: Record<string, number[]> = {};
        on.forEach((r, i) => {
          const w = on.map((_, j) => 1 / (1 + ((j * 7 + i) % on.length)));
          const tot = w.reduce((a, b) => a + b, 0);
          units[r.id] = SEGMENTS.map((sg) => Math.round((segmentBuyers(sg, { year: y, quarter }) * w[i]) / tot));
        });
        const brand = { reach: SEGMENTS.map(() => 20), perception: SEGMENTS.map(() => 1.5) };
        bytes += JSON.stringify({ quarter: { year: y, quarter }, units, own: {}, launched: on.slice(0, 4).map((r) => r.id), brand }).length;
      }
    }
    expect(bytes).toBeLessThan(450_000);
  });
});

describe("market selectors", () => {
  it("lists the quarters newest first", () => {
    expect(worldQuarters(s).map((x) => x.quarter)).toEqual([3, 2, 1]);
  });

  it("summarises a quarter", () => {
    const a = quarterSummary(s, market, q(1));
    const b = quarterSummary(s, market, q(2));
    expect(a.total).toBe(s.sales[0].total);
    expect(a.makers.reduce((x, m) => x + m.share, 0)).toBeCloseTo(1, 6);
    expect(a.player.units).toBe(s.sales[0].units.own);
    expect(a.player.change).toBeNull();
    expect(b.player.change).not.toBeNull();
    expect(a.launches.map((l) => l.id)).toContain("own");
    for (let i = 1; i < a.best.length; i++) expect(a.best[i - 1].units).toBeGreaterThanOrEqual(a.best[i].units);
    expect(a.segments.reduce((x, g) => x + g.units, 0)).toBe(a.total);
    expect(a.player.entry?.quarter).toEqual(q(1));
    expect(a.player.models[0]).toMatchObject({ id: "own", name: "Own One" });
  });

  it("lists the store and filters it", () => {
    const all = storeListing(s, market, q(2));
    expect(all.length).toBe(Object.keys(s.shelf[1].units).length);
    expect(all.find((x) => x.id === "own")?.own).toBe(true);
    const mine = storeListing(s, market, q(2), { maker: null });
    expect(mine.map((x) => x.id)).toEqual(["own"]);
    const cheap = storeListing(s, market, q(2), { sort: "price" });
    for (let i = 1; i < cheap.length; i++) expect(cheap[i - 1].price).toBeLessThanOrEqual(cheap[i].price);
    const top = all[0];
    expect(storeListing(s, market, q(2), { maxPrice: top.price - 1 }).some((x) => x.id === top.id)).toBe(false);
    const seg = top.segments[0];
    expect(storeListing(s, market, q(2), { segment: seg }).every((x) => x.segments.includes(seg))).toBe(true);
    // Reviews appear only once published.
    const first = storeListing(s, market, q(1));
    expect(first.every((x) => x.review === null || (s.reviews[x.id] && s.reviews[x.id].quarter.quarter <= 1))).toBe(true);
  });

  it("finds a model's closest rivals", () => {
    const c = competitorsOf(s, market, "own");
    expect(c.quarter).toEqual(q(3));
    expect(c.model?.id).toBe("own");
    expect(c.rivals.length).toBeGreaterThan(0);
    for (const r of c.rivals) {
      expect(r.own).toBe(false);
      expect(r.overlap).toBeGreaterThanOrEqual(0);
      expect(r.overlap).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.stats).not.toBeNull();
    }
  });

  it("splits a model's buyers by segment", () => {
    const b = buyersOf(s, "own");
    const sold = s.sales.reduce((a, r) => a + (r.units.own ?? 0), 0);
    expect(b.units).toBe(sold);
    if (sold > 0) expect(b.segments.reduce((a, g) => a + g.split, 0)).toBeCloseTo(1, 6);
    for (const g of b.segments) {
      expect(g.won).toBeGreaterThanOrEqual(0);
      expect(g.won).toBeLessThanOrEqual(1);
      expect(g.priorities).toHaveLength(3);
    }
    const one = buyersOf(s, "own", q(2));
    expect(one.units).toBe(s.sales[1].units.own);
  });
});
