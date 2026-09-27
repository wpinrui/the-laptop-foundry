import { describe, expect, it } from "vitest";
import type { SavedModel } from "../../../../preload/store";
import type { Rival } from "../market/field";
import { generateModel, hashOf, rngOf } from "../market/generate";
import { LINES } from "../market/makers";
import { REVIEW_PAR } from "./constants";
import { criticsScore, publicationQuarter, publishReviews } from "./critics";
import { type CampaignState, campaignOf, newCampaign, type QuarterOfYear, savedCampaign } from "./index";
import { launchQuarter, quarterIndex } from "./rivals";
import { profileOf } from "./sales";

const line = LINES.find((l) => l.id === "dell-xps");
if (!line) throw new Error("no line");
const g = generateModel(line, 2012, rngOf(hashOf("critics", 2012)));
const model: SavedModel = { id: "own", name: "Own", build: g.build, created: 0, updated: 0 };
const rival: Rival = { id: "dell-xps-2012", maker: "dell", line: "dell-xps", name: "XPS", build: g.build };

const at = (s: CampaignState, quarter: QuarterOfYear): CampaignState => ({ ...s, now: { year: 2012, quarter } });

const released = (): CampaignState => ({
  ...newCampaign(2012),
  now: { year: 2012, quarter: 2 },
  releases: {
    own: { quarter: { year: 2012, quarter: 2 }, price: 999, refresh: false, stock: 100, made: 100, unitCost: 500, sold: 0 },
  },
});

describe("critics", () => {
  it("publishes the quarter after launch", () => {
    expect(publicationQuarter({ year: 2012, quarter: 2 })).toEqual({ year: 2012, quarter: 3 });
    expect(publicationQuarter({ year: 2012, quarter: 4 })).toEqual({ year: 2013, quarter: 1 });
  });

  it("holds a player's review back in its launch quarter and prints it the next", () => {
    const s = released();
    const same = publishReviews(s, { models: [model] });
    expect(same.reviews.own).toBeUndefined();
    expect(criticsScore(same, "own")).toBe(REVIEW_PAR);
    const next = publishReviews(at(s, 3), { models: [model] });
    expect(next.reviews.own.quarter).toEqual({ year: 2012, quarter: 3 });
    expect(next.reviews.own.score).toBe(profileOf("own", { ...g.build, price: 999 }).review);
    expect(criticsScore(next, "own")).toBe(next.reviews.own.score);
  });

  it("does not review an unreleased model", () => {
    const s = { ...newCampaign(2012), now: { year: 2012, quarter: 4 as const } };
    expect(publishReviews(s, { models: [model] }).reviews).toEqual({});
  });

  it("keeps a review's first publication", () => {
    const s = publishReviews(at(released(), 3), { models: [model] });
    const later = publishReviews(at(s, 4), { models: [model] });
    expect(later.reviews.own.quarter.quarter).toBe(3);
  });

  it("reviews a rival the quarter after its launch", () => {
    const q = launchQuarter("c", "dell-xps", 2012);
    const launch = { ...newCampaign(2011), now: { year: 2012, quarter: q }, onSale: [rival.id] };
    const ctx = { models: [], company: "c", rivals: [rival] };
    expect(publishReviews(launch, ctx).reviews[rival.id]).toBeUndefined();
    const i = quarterIndex(launch.now) + 1;
    const after = { ...launch, now: { year: Math.floor(i / 4), quarter: ((i % 4) + 1) as QuarterOfYear } };
    expect(publishReviews(after, ctx).reviews[rival.id]).toBeDefined();
  });

  it("survives a save", () => {
    const s = publishReviews(at(released(), 3), { models: [model] });
    expect(campaignOf(savedCampaign(s)).reviews).toEqual(s.reviews);
  });
});
