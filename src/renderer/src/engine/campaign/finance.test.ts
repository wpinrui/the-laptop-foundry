import { describe, expect, it } from "vitest";
import {
  type CampaignState,
  campaignOf,
  costsOf,
  newCampaign,
  release,
  resolveQuarter,
  savedCampaign,
  settle,
} from "./index";

const released = (): CampaignState => {
  const s = release(newCampaign(2010), "a", 1_000, 600, 5_000, false);
  if (!s) throw new Error("release failed");
  return s;
};

describe("settle", () => {
  it("charges overhead and holding and records the quarter", () => {
    const s = settle(released());
    const e = s.ledger[0];
    expect(e.quarter).toEqual({ year: 2010, quarter: 1 });
    expect(e.revenue).toBe(0);
    expect(e.setup).toBe(1_000_000);
    expect(e.production).toBe(3_000_000);
    // Base plus one line on the market.
    expect(e.overhead).toBe(190_000);
    // 4% of 5,000 units at $600.
    expect(e.holding).toBe(120_000);
    expect(e.profit).toBe(-4_310_000);
    expect(s.cash).toBe(1_000_000 - 310_000);
    expect(e.cash).toBe(s.cash);
    expect(s.spent).toEqual({ setup: 0, production: 0 });
  });

  it("turns units sold into revenue less the retailers' cut", () => {
    const r = released();
    r.releases.a.sold = 2_000;
    const s = settle(r);
    const e = s.ledger[0];
    expect(e.revenue).toBe(2_000_000);
    expect(e.retail).toBe(400_000);
    expect(s.releases.a.stock).toBe(3_000);
    expect(s.releases.a.sold).toBe(0);
    expect(e.holding).toBe(3_000 * 600 * 0.04);
    expect(e.profit).toBe(e.revenue - costsOf(e));
  });

  it("never sells more than the stock", () => {
    const r = released();
    r.releases.a.sold = 9_000;
    expect(settle(r).ledger[0].revenue).toBe(5_000_000);
  });
});

describe("bankruptcy", () => {
  it("ends the campaign when a year closes in debt", () => {
    let s: CampaignState = { ...newCampaign(2010), cash: 100_000 };
    s = resolveQuarter(s);
    expect(s.bankrupt).toBe(false);
    expect(s.cash).toBeLessThan(0);
    s = resolveQuarter(resolveQuarter(s));
    expect(s.now).toEqual({ year: 2010, quarter: 4 });
    s = resolveQuarter(s);
    expect(s.bankrupt).toBe(true);
    expect(s.over).toBe(true);
    expect(s.now).toEqual({ year: 2010, quarter: 4 });
    expect(resolveQuarter(s)).toBe(s);
  });

  it("survives a year with cash left", () => {
    let s = newCampaign(2010);
    for (let i = 0; i < 4; i++) s = resolveQuarter(s);
    expect(s.bankrupt).toBe(false);
    expect(s.now).toEqual({ year: 2011, quarter: 1 });
    expect(s.cash).toBe(5_000_000 - 4 * 150_000);
  });
});

describe("saving", () => {
  it("round-trips the ledger, spend and releases", () => {
    const s = settle(released());
    expect(campaignOf(JSON.parse(JSON.stringify(savedCampaign(s))))).toEqual(s);
  });
});
