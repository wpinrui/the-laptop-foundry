import { neighbours, population, SEGMENTS, segmentById } from "../market/segments";
import type { SegmentId } from "../market/types";
import {
  EXPERIENCE_WEIGHTS,
  MARKET_PAR,
  MARKET_SPAN,
  MARKETING_BASE_YEAR,
  MARKETING_INFLATION,
  MAX_REACH,
  NEGATIVITY,
  PERCEPTION_ALPHA,
  PERCEPTION_MAX,
  PERCEPTION_MIN,
  PERCEPTION_SCALE,
  REACH_DECAY,
  REACH_FLOOR,
  REVIEW_PAR,
  REVIEW_SPAN,
  SPILLOVER,
  STARTING_PERCEPTION,
  STARTING_REACH,
  TIER_ACQUISITIONS,
  TIER_CEILING,
  TIER_COST,
  TIER_CUTOFFS,
  TOP_TIER,
} from "./constants";
import type { CampaignState } from "./index";

// The company's brand per buyer segment: reach, the share of the segment
// that knows the company, and perception, what it thinks of it. Paid
// campaigns grow reach, with spillover to neighbouring segments; reach fades
// without them. Buyers' experience moves perception, smoothed over quarters.
// Ported from Laptop Tycoon's brand progression.

/** A campaign tier, 1 to 5; a segment with no campaign has no entry. */
export type Tier = 1 | 2 | 3 | 4 | 5;

export interface Brand {
  /** Share of each segment that knows the company, 0 to 1. */
  reach: Record<SegmentId, number>;
  /** Each segment's opinion of the company, PERCEPTION_MIN to PERCEPTION_MAX. */
  perception: Record<SegmentId, number>;
  /** The campaigns that run each quarter until changed. */
  campaigns: Partial<Record<SegmentId, Tier>>;
}

/**
 * What one model's buyers in a segment made of it in a quarter. The sales
 * simulation hands these to updatePerception.
 */
export interface SegmentOutcome {
  segment: SegmentId;
  /** Units sold to the segment. */
  units: number;
  /** The model's market score for the segment, 1 to 10. */
  market: number;
  /** The model's review score, 0 to 100. */
  review: number;
  /** Value for money as a ratio to the segment's market average, 1 at par. */
  value: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function perSegment(v: number): Record<SegmentId, number> {
  return Object.fromEntries(SEGMENTS.map((s) => [s.id, v])) as Record<SegmentId, number>;
}

export function newBrand(): Brand {
  return { reach: perSegment(STARTING_REACH), perception: perSegment(STARTING_PERCEPTION), campaigns: {} };
}

/** The top tier a segment takes, from its permeability. */
export function maxTier(segment: SegmentId): Tier {
  const p = segmentById(segment).permeability;
  const cut = TIER_CUTOFFS.find(([min]) => p >= min);
  return (cut ? cut[1] : TOP_TIER) as Tier;
}

/** The reach a tier grows a segment to, rescaled so its top tier reaches MAX_REACH. */
export function reachCeiling(segment: SegmentId, tier: Tier): number {
  const top = Math.min(tier, maxTier(segment));
  return Math.min(MAX_REACH, TIER_CEILING[top] * (MAX_REACH / TIER_CEILING[maxTier(segment)]));
}

/** A tier's cost for a quarter in the year's dollars. */
export function tierCost(tier: Tier, year: number): number {
  return Math.round(TIER_COST[tier] * MARKETING_INFLATION ** (year - MARKETING_BASE_YEAR));
}

/** What the brand's campaigns cost for a quarter of the year. */
export function marketingCost(brand: Brand, year: number): number {
  let total = 0;
  for (const t of Object.values(brand.campaigns)) if (t) total += tierCost(t, year);
  return total;
}

/** The brand with a segment's campaign set, or cleared at tier 0. Tiers above the segment's top are cut to it. */
export function setCampaign(brand: Brand, segment: SegmentId, tier: number): Brand {
  const { [segment]: _, ...rest } = brand.campaigns;
  const t = Math.min(Math.round(tier), maxTier(segment));
  return { ...brand, campaigns: t >= 1 ? { ...rest, [segment]: t as Tier } : rest };
}

/** Reach after a quarter of the brand's campaigns in the year: growth, spillover and decay. */
export function applyCampaigns(brand: Brand, year: number): Record<SegmentId, number> {
  const won: Partial<Record<SegmentId, number>> = {};
  for (const [id, tier] of Object.entries(brand.campaigns) as [SegmentId, Tier][]) {
    const acq = TIER_ACQUISITIONS[tier];
    won[id] = (won[id] ?? 0) + acq;
    for (const n of neighbours(id)) won[n.id] = (won[n.id] ?? 0) + acq * n.weight * SPILLOVER;
  }
  const reach = { ...brand.reach };
  for (const s of SEGMENTS) {
    const now = brand.reach[s.id];
    const pool = population(s, year);
    const gain = pool > 0 ? (won[s.id] ?? 0) / pool : 0;
    const decay = REACH_DECAY * (1 + s.permeability);
    const tier = brand.campaigns[s.id];
    let next: number;
    if (tier) {
      const ceiling = reachCeiling(s.id, tier);
      // Below the ceiling a campaign grows reach up to it; above, reach sinks back toward it.
      next = now < ceiling ? Math.min(ceiling, now + gain) : ceiling + (now - ceiling) * (1 - decay);
    } else next = now * (1 - decay) + gain;
    reach[s.id] = clamp(next, REACH_FLOOR, 1);
  }
  return reach;
}

/** A buyer's experience of a model, as a gap to par of about -0.5 to 0.5. */
export function experienceOf(o: SegmentOutcome): number {
  const w = EXPERIENCE_WEIGHTS;
  const value = clamp(o.value - 1, -0.5, 0.5);
  const market = clamp((o.market - MARKET_PAR) / MARKET_SPAN, -0.5, 0.5);
  const review = clamp((o.review - REVIEW_PAR) / REVIEW_SPAN, -0.5, 0.5);
  return w.value * value + w.market * market + w.review * review;
}

/**
 * The state with perception moved by a quarter's outcomes. Each segment's
 * buyers average their experience by units, bad experience weighs
 * NEGATIVITY times more, and perception moves a PERCEPTION_ALPHA share of
 * the way to the result. Only buyers form opinions: a segment that bought
 * nothing holds its perception.
 */
export function updatePerception(state: CampaignState, outcomes: SegmentOutcome[]): CampaignState {
  const sum: Partial<Record<SegmentId, { units: number; exp: number }>> = {};
  for (const o of outcomes) {
    if (!(o.units > 0)) continue;
    const s = sum[o.segment] ?? { units: 0, exp: 0 };
    s.units += o.units;
    s.exp += experienceOf(o) * o.units;
    sum[o.segment] = s;
  }
  const perception = { ...state.brand.perception };
  for (const [id, s] of Object.entries(sum) as [SegmentId, { units: number; exp: number }][]) {
    const gap = s.exp / s.units;
    const target = (gap < 0 ? gap * NEGATIVITY : gap) * PERCEPTION_SCALE;
    const next = PERCEPTION_ALPHA * target + (1 - PERCEPTION_ALPHA) * perception[id];
    perception[id] = clamp(next, PERCEPTION_MIN, PERCEPTION_MAX);
  }
  return { ...state, brand: { ...state.brand, perception } };
}

/**
 * The brand's multiplier on a laptop's appeal to a segment for the sales
 * simulation: reach times (1 + perception / 100), Tycoon's shape. Reach is
 * the share of buyers who consider the company at all, so it scales linearly;
 * perception tilts those who do by up to half either way. 0 to 1.5.
 */
export function brandFactor(state: CampaignState, segment: SegmentId): number {
  return state.brand.reach[segment] * (1 + state.brand.perception[segment] / 100);
}

/** The state after a quarter of marketing: campaigns paid into cash and the ledger, reach moved. */
export function market(state: CampaignState): CampaignState {
  const cost = marketingCost(state.brand, state.now.year);
  return {
    ...state,
    cash: state.cash - cost,
    spent: { ...state.spent, marketing: state.spent.marketing + cost },
    brand: { ...state.brand, reach: applyCampaigns(state.brand, state.now.year) },
  };
}

/** A saved brand, with anything missing or broken filled from a new one. */
export function brandOf(x: unknown): Brand {
  const fresh = newBrand();
  const b = (x ?? {}) as Partial<Brand>;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  let campaigns: Brand["campaigns"] = {};
  for (const s of SEGMENTS) {
    const r = b.reach?.[s.id];
    const p = b.perception?.[s.id];
    if (num(r)) fresh.reach[s.id] = clamp(r, 0, 1);
    if (num(p)) fresh.perception[s.id] = clamp(p, PERCEPTION_MIN, PERCEPTION_MAX);
    const t = b.campaigns?.[s.id];
    if (num(t)) campaigns = setCampaign({ ...fresh, campaigns }, s.id, t).campaigns;
  }
  return { ...fresh, campaigns };
}
