import type { Rival } from "../market/field";
import { marketScore } from "../market/score";
import { NOVELTY_DECAY_BASE, NOVELTY_LAUNCH_BONUS, population, priceCeiling, quarterlyBuyers, SEGMENTS, screenFit } from "../market/segments";
import { profileOf, rivalProfile } from "../market/profile";
import type { HeadlineValues } from "../market/stats";
import { HEADLINE_STATS, type Segment, type SegmentId } from "../market/types";
import { rng } from "../review";
import type { Build } from "../types";
import { brandFactor, type SegmentOutcome } from "./brand";
import {
  CRITICS_STRENGTH,
  DEMAND_SCALE,
  MARKET_PAR,
  MAX_REACH,
  OVER_CEILING_STEEPNESS,
  REVIEW_PAR,
  REVIEW_SPAN,
  RIVAL_BRAND,
  RIVAL_BRAND_DEFAULT,
  SALES_HISTORY,
  SALES_NOISE,
  SCORE_STEEPNESS,
  WORD_OF_MOUTH,
} from "./constants";
import type { CampaignState, Quarter, QuarterStep } from "./index";
import { awardFactor } from "./awards";
import { criticsScore } from "./critics";
import { launchQuarter, quarterIndex } from "./rivals";

// The sales simulation (GDD, Version 0.2, "Sales"), ported from Laptop
// Tycoon: each segment's buyers in the quarter (population over the
// replacement cycle, on the seasonal curve) split among the laptops on sale
// by appeal. Appeal multiplies the market score, the price against the
// segment's ceiling, the screen fit, novelty, the critics and the maker's
// brand. Every buyer buys; the player's sales stop at the stock, and the
// rest of that demand is lost. A sold-out model still takes its share of
// appeal and gets its demand recorded, but its buyers re-split among the
// sellers that still have stock rather than vanish from the market.

/** A laptop on sale in the quarter. */
export interface Seller {
  id: string;
  /** The rival maker's id, or null for the player's own model. */
  maker: string | null;
  stats: HeadlineValues;
  price: number;
  inches: number;
  /** Review score, 0 to 100. */
  review: number;
  /** Launch quarter, as a quarter index. */
  launch: number;
  /** Units on hand; rivals never run out. */
  stock: number;
}

/** One quarter's sales, kept compactly for display. */
export interface SalesRecord {
  quarter: Quarter;
  /** Units the player sold per model. */
  units: Record<string, number>;
  /** Units the player's buyers wanted per model, before stock. */
  demand: Record<string, number>;
  /** Units each rival maker sold. */
  makers: Record<string, number>;
  /** Every unit sold in the market. */
  total: number;
  /** The quarter's best-selling laptop, the player's or a rival's. Older saves lack it. */
  top?: { id: string; units: number };
}

export interface SalesResult {
  /** Units sold per seller. */
  sold: Record<string, number>;
  /** Units demanded per seller, before stock. */
  demand: Record<string, number>;
  /** What the player's buyers made of each model per segment, units after stock. */
  outcomes: SegmentOutcome[];
  total: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A rival maker's brand in the segment, from RIVAL_BRAND. */
export function rivalBrand(maker: string, segment: SegmentId): number {
  const b = RIVAL_BRAND[maker];
  return b ? (b.segments?.[segment] ?? b.base) : RIVAL_BRAND_DEFAULT;
}

/** Appeal from the market score: 1 at par, exponential either way. */
export function scoreFactor(score: number): number {
  return Math.exp(SCORE_STEEPNESS * (score - MARKET_PAR));
}

/** 1 up to the segment's ceiling, falling off fast past it. */
export function priceFactor(price: number, ceiling: number): number {
  if (!(ceiling > 0) || price <= ceiling) return 1;
  return Math.exp(-OVER_CEILING_STEEPNESS * (price / ceiling - 1));
}

/** The critics' pull from the review score. */
export function criticsFactor(review: number): number {
  return Math.exp((CRITICS_STRENGTH * (clamp(review, 0, 100) - REVIEW_PAR)) / REVIEW_SPAN);
}

/** Tycoon's novelty: a launch bonus fading per quarter, faster for segments that chase the new. */
export function noveltyFactor(age: number, s: Segment): number {
  return NOVELTY_LAUNCH_BONUS * NOVELTY_DECAY_BASE ** (Math.max(0, age) * s.freshnessDecay);
}

/** Buyers in the segment this quarter, at real-world scale. */
export function segmentBuyers(s: Segment, q: Quarter): number {
  return quarterlyBuyers(s, q.year, q.quarter) * DEMAND_SCALE;
}

/** Stats but price, weighed for the segment, times the price ratio: value for money, 1 at par. */
function valueOf(ratios: Record<string, number>, s: Segment): number {
  let sum = 0;
  let w = 0;
  for (const k of HEADLINE_STATS) {
    if (k === "price") continue;
    sum += ratios[k] * s.weights[k];
    w += s.weights[k];
  }
  return (w > 0 ? sum / w : 1) * ratios.price;
}

/**
 * Splits every segment's buyers among the sellers. `basis` is the year's
 * market the stats are measured against. `seed` fixes the quarter's noise.
 */
export function splitDemand(
  sellers: Seller[],
  basis: HeadlineValues[],
  state: CampaignState,
  seed: string,
  segments: Segment[] = SEGMENTS,
): SalesResult {
  const now = state.now;
  const at = quarterIndex(now);
  const scores = new Map(sellers.map((x) => [x.id, marketScore({ id: x.id, stats: x.stats }, basis, segments)]));
  const luck = new Map(sellers.map((x) => [x.id, 1 + (rng(`${seed}:${x.id}`)() * 2 - 1) * SALES_NOISE]));
  const demand: Record<string, number> = {};
  const saleDemand: Record<string, number> = {};
  const bySegment: Record<string, { segment: SegmentId; units: number; market: number; value: number }[]> = {};
  for (const x of sellers) {
    demand[x.id] = 0;
    saleDemand[x.id] = 0;
    bySegment[x.id] = [];
  }
  for (const s of segments) {
    const buyers = segmentBuyers(s, now);
    const ceiling = priceCeiling(s, now.year);
    const appeal = sellers.map((x) => {
      const ms = scores.get(x.id)?.segments[s.id];
      const score = ms ? clamp(ms.base + ms.noise, 1, 10) : MARKET_PAR;
      const brand = x.maker === null ? brandFactor(state, s.id) : rivalBrand(x.maker, s.id);
      return (
        scoreFactor(score) *
        priceFactor(x.price, ceiling) *
        screenFit(s, x.inches) *
        noveltyFactor(at - x.launch, s) *
        criticsFactor(x.review) *
        awardFactor(state, x.id, s.id) *
        Math.max(0, brand) *
        (luck.get(x.id) ?? 1)
      );
    });
    // Every seller's share of the segment, sold out or not: what "wanted" reports.
    const fullTotal = appeal.reduce((a, b) => a + b, 0);
    if (!(fullTotal > 0)) continue;
    // The same split with sold-out sellers zeroed: their would-be buyers go
    // to whoever still has stock, in the same proportions as before.
    const available = sellers.map((x, i) => (x.stock > 0 ? appeal[i] : 0));
    const availableTotal = available.reduce((a, b) => a + b, 0);
    sellers.forEach((x, i) => {
      demand[x.id] += (buyers * appeal[i]) / fullTotal;
      const saleUnits = availableTotal > 0 ? (buyers * available[i]) / availableTotal : 0;
      saleDemand[x.id] += saleUnits;
      if (x.maker === null && saleUnits > 0) {
        const sc = scores.get(x.id);
        const ms = sc?.segments[s.id];
        bySegment[x.id].push({
          segment: s.id,
          units: saleUnits,
          market: ms ? ms.score : MARKET_PAR,
          value: sc ? valueOf(sc.ratios, s) : 1,
        });
      }
    });
  }
  const sold: Record<string, number> = {};
  const outcomes: SegmentOutcome[] = [];
  let total = 0;
  for (const x of sellers) {
    demand[x.id] = Math.round(demand[x.id]);
    const saleWant = Math.round(saleDemand[x.id]);
    sold[x.id] = Math.max(0, Math.min(saleWant, Math.floor(x.stock)));
    total += sold[x.id];
    const cut = saleWant > 0 ? sold[x.id] / saleWant : 0;
    for (const o of bySegment[x.id]) outcomes.push({ ...o, units: o.units * cut, review: x.review });
  }
  return { sold, demand, outcomes, total };
}

// ------------------------------------------------------------------ sellers

export { profileOf };

/** A rival's launch as a quarter index. A stand-in for last year's model reads as launched a year earlier. */
export function rivalLaunch(company: string, r: Rival, at: number): number {
  const launch = quarterIndex({ year: r.build.year, quarter: launchQuarter(company, r.line, r.build.year) });
  return launch > at ? launch - 4 : launch;
}

/** Every laptop on sale this quarter: the player's releases (even sold out) and the rivals on sale. */
export function sellersOf(state: CampaignState, models: { id: string; build: unknown }[], rivals: Rival[], company: string): Seller[] {
  const at = quarterIndex(state.now);
  const out: Seller[] = [];
  for (const [id, r] of Object.entries(state.releases)) {
    const m = models.find((x) => x.id === id);
    if (!m || quarterIndex(r.quarter) > at) continue;
    const build = { ...(m.build as Build), price: r.price };
    const p = profileOf(id, build);
    out.push({ id, maker: null, ...p, review: criticsScore(state, id), price: r.price, launch: quarterIndex(r.quarter), stock: r.stock });
  }
  const on = new Set(state.onSale);
  for (const r of rivals) {
    if (!on.has(r.id)) continue;
    const p = rivalProfile(r);
    out.push({
      id: r.id,
      maker: r.maker,
      ...p,
      review: criticsScore(state, r.id),
      price: r.build.price ?? 0,
      launch: rivalLaunch(company, r, at),
      stock: Number.POSITIVE_INFINITY,
    });
  }
  return out;
}

/** Segment demand for the quarter is split among the laptops on sale. */
export const simulateSales: QuarterStep = (state, ctx) => {
  const rivals = ctx.rivals ?? [];
  const company = ctx.company ?? "";
  const sellers = sellersOf(state, ctx.models, rivals, company);
  const year = rivals.filter((r) => r.build.year === state.now.year).map((r) => rivalProfile(r).stats);
  const own = sellers.filter((x) => x.maker === null).map((x) => x.stats);
  const basis = year.length > 0 ? [...year, ...own] : sellers.map((x) => x.stats);
  const res = splitDemand(sellers, basis, state, `sales:${company}:${state.now.year}:${state.now.quarter}`);
  const releases = { ...state.releases };
  const units: Record<string, number> = {};
  const demand: Record<string, number> = {};
  const makers: Record<string, number> = {};
  for (const x of sellers) {
    if (x.maker === null) {
      releases[x.id] = { ...releases[x.id], sold: res.sold[x.id] };
      units[x.id] = res.sold[x.id];
      demand[x.id] = res.demand[x.id];
    } else makers[x.maker] = (makers[x.maker] ?? 0) + res.sold[x.id];
  }
  let top: SalesRecord["top"];
  for (const x of sellers) if (res.sold[x.id] > 0 && res.sold[x.id] > (top?.units ?? 0)) top = { id: x.id, units: res.sold[x.id] };
  const record: SalesRecord = { quarter: { ...state.now }, units, demand, makers, total: res.total, ...(top ? { top } : {}) };
  return {
    ...state,
    releases,
    sales: [...state.sales, record].slice(-SALES_HISTORY),
    outcomes: res.outcomes,
  };
};

/** Reach after word of mouth from the quarter's buyers, per segment that bought. */
export function wordOfMouth(state: CampaignState, outcomes: SegmentOutcome[]): CampaignState {
  const reach = { ...state.brand.reach };
  for (const o of outcomes) {
    const s = SEGMENTS.find((x) => x.id === o.segment);
    const pool = s ? population(s, state.now.year) : 0;
    if (!(pool > 0) || !(o.units > 0)) continue;
    const gain = (WORD_OF_MOUTH * o.units) / DEMAND_SCALE / pool;
    reach[o.segment] = Math.max(reach[o.segment], Math.min(MAX_REACH, reach[o.segment] + gain));
  }
  return { ...state, brand: { ...state.brand, reach } };
}

/** The player's share of every unit sold in the quarter's record, 0 to 1. */
export function shareOf(r: SalesRecord): number {
  const own = Object.values(r.units).reduce((a, b) => a + b, 0);
  return r.total > 0 ? own / r.total : 0;
}

/** A saved sales record, or null when it is unreadable. */
export function salesRecordOf(x: unknown): SalesRecord | null {
  const r = x as Partial<SalesRecord> | null;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!r || !r.quarter || !num(r.quarter.year) || !num(r.quarter.quarter) || !num(r.total)) return null;
  const nums = (o: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (num(v)) out[k] = v;
    return out;
  };
  return {
    quarter: { year: r.quarter.year, quarter: r.quarter.quarter },
    units: nums(r.units),
    demand: nums(r.demand),
    makers: nums(r.makers),
    total: r.total,
    ...(r.top && typeof r.top.id === "string" && num(r.top.units) ? { top: { id: r.top.id, units: r.top.units } } : {}),
  };
}
