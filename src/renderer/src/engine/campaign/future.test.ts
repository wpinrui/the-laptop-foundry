import { describe, expect, it } from "vitest";
import type { SavedModel } from "../../../../preload/store";
import { LAST_YEAR } from "../content";
import { type Rival, savedMarketOf } from "../market/field";
import { generateModel, generateYear, hashOf, rngOf } from "../market/generate";
import { LINES } from "../market/makers";
import { campaignOf, type CampaignState, newCampaign, resolveQuarter, savedCampaign } from "./index";
import { buildCost, release } from "./release";
import { unitsOf } from "./shelf";

// Campaigns have no last year. A company plays 2024 Q1 to 2030 Q4, releasing
// a model built for the year at the start of each one, and every year past
// the content's last still has a market, sales, reviews and awards.

const COMPANY = "future";
const FIRST = 2024;
const LAST = 2030;

describe("an open-ended campaign", () => {
  it("plays on past the content's last year", { timeout: 900_000 }, () => {
    expect(LAST).toBeGreaterThan(LAST_YEAR);
    const markets = new Map<number, Rival[]>();
    for (let y = FIRST - 1; y <= LAST; y++)
      markets.set(y, savedMarketOf(generateYear(y, hashOf("market", COMPANY, y))).models);
    for (let y = FIRST; y <= LAST; y++) expect(markets.get(y)?.length, `market ${y}`).toBeGreaterThan(10);

    const line = LINES.find((l) => l.id === "dell-inspiron");
    if (!line) throw new Error("no line");
    const models: SavedModel[] = [];
    // Cash enough that the run is about the calendar, not the books.
    let s: CampaignState = { ...newCampaign(FIRST), cash: 200_000_000 };
    const onSale: Record<number, number> = {};
    while (!s.over && s.now.year <= LAST) {
      const y = s.now.year;
      if (s.now.quarter === 1) {
        const g = generateModel(line, y, rngOf(hashOf("player", y)));
        expect(g.build.year).toBe(y);
        const cost = buildCost(g.build);
        expect(Number.isFinite(cost) && cost > 0, `cost ${y}`).toBe(true);
        const build = { ...g.build, price: Math.round((cost * 1.5) / 10) * 10 - 1 };
        const id = `own-${y}`;
        models.push({ id, name: `Own ${y}`, build, created: 0, updated: 0 });
        const next = release(s, id, build.price, cost, 5_000, false);
        if (!next) throw new Error(`no release in ${y}`);
        s = next;
      }
      const rivals = [...(markets.get(y - 1) ?? []), ...(markets.get(y) ?? [])];
      s = resolveQuarter(s, { models, company: COMPANY, rivals });
      onSale[y] = Math.min(onSale[y] ?? Infinity, s.onSale.length);
    }

    expect(s.over).toBe(false);
    expect(s.now).toEqual({ year: LAST + 1, quarter: 1 });
    expect(s.ledger).toHaveLength((LAST - FIRST + 1) * 4);
    for (let y = FIRST; y <= LAST; y++) {
      expect(onSale[y], `rivals on sale ${y}`).toBeGreaterThan(10);
      const units = s.shelf
        .filter((r) => r.quarter.year === y)
        .reduce((sum, r) => sum + Object.values(r.units).reduce((a, u) => a + unitsOf(u), 0), 0);
      expect(units, `market units ${y}`).toBeGreaterThan(0);
      const own = s.ledger.filter((e) => e.quarter.year === y).reduce((a, e) => a + e.revenue, 0);
      expect(own, `own revenue ${y}`).toBeGreaterThan(0);
      const review = s.reviews[`own-${y}`];
      expect(review?.quarter, `own review ${y}`).toEqual({ year: y, quarter: 2 });
      expect(review.score).toBeGreaterThan(0);
      const rivalReviews = Object.entries(s.reviews).filter(([id, r]) => !id.startsWith("own-") && r.quarter.year === y);
      expect(rivalReviews.length, `rival reviews ${y}`).toBeGreaterThan(0);
      expect(s.awards.some((a) => a.year === y), `awards ${y}`).toBe(true);
    }

    // A save past 2026 loads back where it was.
    expect(campaignOf(savedCampaign(s)).now).toEqual(s.now);
  });

  it("carries a campaign saved as ended after 2026 on into 2027", () => {
    const s = { ...newCampaign(2020), now: { year: 2026, quarter: 4 as const }, over: true };
    const loaded = campaignOf(savedCampaign(s));
    expect(loaded.over).toBe(false);
    expect(loaded.now).toEqual({ year: 2027, quarter: 1 });
  });
});
