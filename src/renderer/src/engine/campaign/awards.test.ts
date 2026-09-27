import { describe, expect, it } from "vitest";
import type { CategoryKey } from "../review/scales";
import { CATEGORY_KEYS } from "../review/score";
import { type Award, awardFactor, awardsOf, judgeAwards, type Nominee, presentAwards } from "./awards";
import { AWARD_APPEAL, AWARD_PERCEPTION } from "./constants";
import { campaignOf, newCampaign, savedCampaign } from "./index";

const cats = (v: number, over: Partial<Record<CategoryKey, number>> = {}) =>
  ({ ...Object.fromEntries(CATEGORY_KEYS.map((k) => [k, v])), ...over }) as Record<CategoryKey, number>;

const nominee = (id: string, overall: number, price: number, over: Partial<Record<CategoryKey, number>> = {}): Nominee => ({
  id,
  maker: id === "own" ? null : "dell",
  name: id,
  price,
  overall,
  categories: cats(overall, over),
});

const winner = (awards: Award[], id: string) => awards.find((a) => a.award === id)?.id;

describe("awards", () => {
  const field = [
    nominee("flagship", 90, 2000),
    nominee("cheap", 60, 400),
    nominee("value", 80, 700),
    nominee("light", 78, 1200, { weight: 99, battery: 97 }),
    nominee("fast", 75, 1500, { app: 99 }),
    nominee("gamer", 72, 1800, { games: 99 }),
    nominee("office", 82, 1100, { keyboard: 98, battery: 90, connectivity: 96, chassis: 95 }),
  ];
  const awards = judgeAwards(2012, field);

  it("gives one of each award", () => {
    expect(awards.map((a) => a.award).sort()).toEqual(["business", "gaming", "overall", "performance", "portable", "value"]);
    expect(awards.every((a) => a.year === 2012)).toBe(true);
  });

  it("names each winner from review scores and measurements", () => {
    expect(winner(awards, "overall")).toBe("flagship");
    expect(winner(awards, "portable")).toBe("light");
    expect(winner(awards, "performance")).toBe("fast");
    expect(winner(awards, "gaming")).toBe("gamer");
    expect(winner(awards, "business")).toBe("office");
  });

  it("keeps a cheap dud from the value award", () => {
    expect(winner(awards, "value")).toBe("value");
  });

  it("breaks a tie on the better overall", () => {
    const a = judgeAwards(2012, [nominee("a", 70, 1000, { games: 90 }), nominee("b", 80, 1000, { games: 90 })]);
    expect(winner(a, "gaming")).toBe("b");
  });

  it("gives nothing in an empty year", () => {
    expect(judgeAwards(2012, [])).toEqual([]);
  });

  it("lifts a winner's appeal only in the next year and the segments that care", () => {
    const won: Award = { year: 2012, award: "gaming", id: "x", maker: "dell", name: "x", score: 80 };
    const s = { ...newCampaign(2012), now: { year: 2013, quarter: 2 as const }, awards: [won] };
    expect(awardFactor(s, "x", "gamer")).toBeCloseTo(1 + AWARD_APPEAL);
    expect(awardFactor(s, "x", "corporate")).toBe(1);
    expect(awardFactor(s, "y", "gamer")).toBe(1);
    expect(awardFactor({ ...s, now: { year: 2014, quarter: 1 } }, "x", "gamer")).toBe(1);
  });

  it("waits for Q4 and gives a year's awards once", () => {
    const s = newCampaign(2012);
    expect(presentAwards(s, { models: [] })).toBe(s);
    const own: Award = { year: 2012, award: "overall", id: "own", maker: null, name: "own", score: 90 };
    const q4 = { ...s, now: { year: 2012, quarter: 4 as const }, awards: [own] };
    expect(presentAwards(q4, { models: [] })).toBe(q4);
  });

  it("survives a save", () => {
    const s = { ...newCampaign(2012), awards };
    expect(campaignOf(savedCampaign(s)).awards).toEqual(awards);
    expect(awardsOf([{ year: 2012 }, null])).toEqual([]);
  });

  it("uses Tycoon's perception bonus", () => {
    expect(AWARD_PERCEPTION).toBe(5);
  });
});
