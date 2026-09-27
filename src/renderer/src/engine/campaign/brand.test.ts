import { describe, expect, it } from "vitest";
import { population, segmentById } from "../market/segments";
import {
  applyCampaigns,
  brandFactor,
  type CampaignState,
  campaignOf,
  maxTier,
  newBrand,
  newCampaign,
  PERCEPTION_ALPHA,
  REACH_DECAY,
  REACH_FLOOR,
  reachCeiling,
  resolveQuarter,
  SPILLOVER,
  STARTING_REACH,
  savedCampaign,
  setCampaign,
  tierCost,
  updatePerception,
} from "./index";

const withBrand = (s: CampaignState, f: (b: CampaignState["brand"]) => CampaignState["brand"]): CampaignState => ({
  ...s,
  brand: f(s.brand),
});

describe("reach", () => {
  it("starts low and neutral", () => {
    const s = newCampaign(2010);
    expect(s.brand.reach.gamer).toBe(STARTING_REACH);
    expect(s.brand.perception.gamer).toBe(0);
  });

  it("grows by the tier's buyers over the segment's population", () => {
    const b = setCampaign(newBrand(), "corporate", 3);
    const r = applyCampaigns(b, 2010);
    const gain = 2_000 / population(segmentById("corporate"), 2010);
    expect(r.corporate).toBeCloseTo(STARTING_REACH + gain, 10);
  });

  it("stops at the tier's ceiling", () => {
    let b = setCampaign(newBrand(), "streamer", 2);
    for (let i = 0; i < 100; i++) b = { ...b, reach: applyCampaigns(b, 2020) };
    expect(b.reach.streamer).toBeCloseTo(reachCeiling("streamer", 2), 10);
    // Streamers are permeable: tier 2 is their top and reaches 95%.
    expect(maxTier("streamer")).toBe(2);
    expect(reachCeiling("streamer", 2)).toBeCloseTo(0.95, 10);
  });

  it("caps a campaign at the segment's top tier", () => {
    expect(setCampaign(newBrand(), "gamer", 5).campaigns.gamer).toBe(2);
    expect(setCampaign(setCampaign(newBrand(), "gamer", 2), "gamer", 0).campaigns.gamer).toBeUndefined();
  });

  it("spills over to neighbouring segments", () => {
    const b = setCampaign(newBrand(), "gamer", 2);
    const r = applyCampaigns(b, 2010);
    const decay = REACH_DECAY * (1 + segmentById("esportsPro").permeability);
    const spill = (500 * 0.8 * SPILLOVER) / population(segmentById("esportsPro"), 2010);
    expect(r.esportsPro).toBeCloseTo(STARTING_REACH * (1 - decay) + spill, 10);
    // A segment with no neighbour in the campaign only decays.
    expect(r.corporate).toBeLessThan(STARTING_REACH);
  });

  it("decays slowly without marketing, down to the floor", () => {
    const b = { ...newBrand(), reach: { ...newBrand().reach, corporate: 0.5 } };
    const r = applyCampaigns(b, 2010);
    expect(r.corporate).toBeCloseTo(0.5 * (1 - REACH_DECAY * 1.1), 10);
    let x = b;
    for (let i = 0; i < 200; i++) x = { ...x, reach: applyCampaigns(x, 2010) };
    expect(x.reach.corporate).toBe(REACH_FLOOR);
  });

  it("sinks back toward a lower campaign's ceiling", () => {
    const b = setCampaign({ ...newBrand(), reach: { ...newBrand().reach, corporate: 0.9 } }, "corporate", 1);
    const ceiling = reachCeiling("corporate", 1);
    const r = applyCampaigns(b, 2010);
    expect(r.corporate).toBeLessThan(0.9);
    expect(r.corporate).toBeGreaterThan(ceiling);
  });
});

describe("marketing in the quarter", () => {
  it("pays the campaigns into cash and the ledger", () => {
    const s = withBrand(newCampaign(2010), (b) => setCampaign(setCampaign(b, "gamer", 2), "corporate", 5));
    const cost = tierCost(2, 2010) + tierCost(5, 2010);
    const next = resolveQuarter(s);
    expect(next.ledger[0].marketing).toBe(cost);
    expect(next.brand.reach.gamer).toBeGreaterThan(STARTING_REACH);
    // Campaigns run on until changed.
    expect(next.brand.campaigns).toEqual({ gamer: 2, corporate: 5 });
  });

  it("costs rise with the year", () => {
    expect(tierCost(3, 2000)).toBe(200_000);
    expect(tierCost(3, 2010)).toBeGreaterThan(tierCost(3, 2006));
  });

  it("survives a save", () => {
    const s = withBrand(newCampaign(2010), (b) => setCampaign(b, "gamer", 2));
    expect(campaignOf(savedCampaign(s)).brand).toEqual(s.brand);
    expect(campaignOf({ start: 2010 }).brand).toEqual(newBrand());
  });
});

describe("perception", () => {
  const good = { segment: "gamer" as const, units: 100, market: 10, review: 100, value: 1.5 };
  const bad = { segment: "gamer" as const, units: 100, market: 1, review: 30, value: 0.5 };

  it("holds with no buyers", () => {
    const s = newCampaign(2010);
    expect(updatePerception(s, []).brand.perception).toEqual(s.brand.perception);
    expect(updatePerception(s, [{ ...good, units: 0 }]).brand.perception.gamer).toBe(0);
  });

  it("moves a quarter of the way to the buyers' verdict", () => {
    const s = updatePerception(newCampaign(2010), [good]);
    // The best experience is a gap of 0.5, a target of 25.
    expect(s.brand.perception.gamer).toBeCloseTo(PERCEPTION_ALPHA * 25, 10);
    const t = updatePerception(s, [good]);
    expect(t.brand.perception.gamer).toBeCloseTo(PERCEPTION_ALPHA * 25 + (1 - PERCEPTION_ALPHA) * PERCEPTION_ALPHA * 25, 10);
    expect(t.brand.perception.corporate).toBe(0);
  });

  it("weighs bad value more than good", () => {
    const up = updatePerception(newCampaign(2010), [good]).brand.perception.gamer;
    const down = updatePerception(newCampaign(2010), [bad]).brand.perception.gamer;
    expect(down).toBeCloseTo(-1.5 * up, 10);
  });

  it("averages a segment's buyers by units", () => {
    const s = updatePerception(newCampaign(2010), [good, { ...bad, units: 100 }]);
    // Gaps of 0.5 and -0.5 average to zero.
    expect(s.brand.perception.gamer).toBeCloseTo(0, 10);
  });
});

describe("brand factor", () => {
  it("is reach tilted by perception", () => {
    const s = withBrand(newCampaign(2010), (b) => ({
      ...b,
      reach: { ...b.reach, gamer: 0.4 },
      perception: { ...b.perception, gamer: 25 },
    }));
    expect(brandFactor(s, "gamer")).toBeCloseTo(0.5, 10);
    expect(brandFactor(s, "corporate")).toBeCloseTo(STARTING_REACH, 10);
  });
});
