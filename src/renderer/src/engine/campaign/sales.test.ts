import { describe, expect, it } from "vitest";
import { SEGMENTS } from "../market/segments";
import type { HeadlineValues } from "../market/stats";
import { HEADLINE_STATS } from "../market/types";
import { newCampaign } from "./index";
import { quarterIndex } from "./rivals";
import { priceFactor, type Seller, segmentBuyers, splitDemand, wordOfMouth } from "./sales";

const flat = (v = 1): HeadlineValues => Object.fromEntries(HEADLINE_STATS.map((k) => [k, v])) as HeadlineValues;

const state = { ...newCampaign(2012), now: { year: 2012, quarter: 3 as const } };
const at = quarterIndex(state.now);

const seller = (id: string, over: Partial<Seller> = {}): Seller => ({
  id,
  maker: "dell",
  stats: flat(),
  price: 800,
  inches: 14,
  review: 65,
  launch: at,
  stock: Number.POSITIVE_INFINITY,
  ...over,
});

const allBuyers = SEGMENTS.reduce((a, s) => a + segmentBuyers(s, state.now), 0);

describe("sales", () => {
  it("sells every segment's buyers when one laptop is on sale", () => {
    const res = splitDemand([seller("a")], [flat()], state, "t");
    expect(res.sold.a).toBeGreaterThan(allBuyers * 0.99);
    expect(res.sold.a).toBeLessThan(allBuyers * 1.01);
    expect(res.total).toBe(res.sold.a);
  });

  it("puts the quarter's buyers in the millions", () => {
    expect(allBuyers).toBeGreaterThan(5e6);
    expect(allBuyers).toBeLessThan(3e7);
  });

  it("gives the better laptop the larger share", () => {
    const res = splitDemand([seller("good", { stats: flat(1.3) }), seller("bad", { stats: flat(0.7) })], [flat()], state, "t");
    expect(res.sold.good).toBeGreaterThan(res.sold.bad * 3);
    expect(res.sold.good + res.sold.bad).toBe(res.total);
  });

  it("splits by brand: an unknown player sells a sliver next to a known maker", () => {
    const res = splitDemand([seller("dell"), seller("own", { maker: null })], [flat()], state, "t");
    const share = res.sold.own / res.total;
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.05);
  });

  it("caps the player's sales at the stock and loses the rest", () => {
    const res = splitDemand([seller("dell"), seller("own", { maker: null, stock: 100 })], [flat()], state, "t");
    expect(res.demand.own).toBeGreaterThan(100);
    expect(res.sold.own).toBe(100);
    const outcomeUnits = res.outcomes.reduce((a, o) => a + o.units, 0);
    expect(outcomeUnits).toBeCloseTo(100, 1);
  });

  it("reports outcomes only for the player's models", () => {
    const res = splitDemand([seller("dell"), seller("own", { maker: null })], [flat()], state, "t");
    expect(res.outcomes.length).toBeGreaterThan(0);
    for (const o of res.outcomes) {
      expect(o.review).toBe(65);
      expect(o.value).toBeCloseTo(1, 5);
    }
  });

  it("is the same for a seed and moves a little across seeds", () => {
    const list = [seller("a"), seller("b", { maker: "hp" })];
    const x = splitDemand(list, [flat()], state, "q1");
    expect(splitDemand(list, [flat()], state, "q1").sold).toEqual(x.sold);
    const y = splitDemand(list, [flat()], state, "q2");
    expect(Math.abs(y.sold.a - x.sold.a) / x.sold.a).toBeLessThan(0.3);
  });

  it("drops off past the price ceiling", () => {
    expect(priceFactor(900, 1000)).toBe(1);
    expect(priceFactor(1250, 1000)).toBeCloseTo(Math.exp(-1), 5);
  });

  it("fades a laptop's pull with age", () => {
    const res = splitDemand([seller("new"), seller("old", { launch: at - 4 })], [flat()], state, "t");
    expect(res.sold.new).toBeGreaterThan(res.sold.old);
  });

  it("grows reach where the player sold", () => {
    const grown = wordOfMouth(state, [{ segment: "gamer", units: 20_000, market: 6, review: 70, value: 1 }]);
    expect(grown.brand.reach.gamer).toBeGreaterThan(state.brand.reach.gamer);
    expect(grown.brand.reach.corporate).toBe(state.brand.reach.corporate);
  });
});
