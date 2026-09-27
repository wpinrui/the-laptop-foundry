import { factsOf, rivalSubject } from "../review";
import { scoresFromFacts } from "../review/score";
import type { CategoryKey } from "../review/scales";
import type { Rival } from "../market/field";
import { rivalProfile } from "../market/profile";
import type { SegmentId } from "../market/types";
import type { Build } from "../types";
import { AWARD_APPEAL, AWARD_PERCEPTION, AWARD_SECONDARY, AWARD_SEGMENTS, PERCEPTION_MAX, PERCEPTION_MIN } from "./constants";
import type { CampaignState, QuarterStep } from "./index";

// Awards (GDD, Version 0.2, "Critics and awards"): at the end of each Q4 the
// critics name the year's best laptops among every model launched that year,
// the player's and the rivals'. They judge from review scores and the
// measured categories, never the market score. A winner's appeal rises in the
// segments that care for the whole next year, and a player's win lifts the
// company's perception there at once.

export type AwardId = "overall" | "value" | "portable" | "performance" | "business" | "gaming";

export const AWARD_IDS: AwardId[] = ["overall", "value", "portable", "performance", "business", "gaming"];

export const AWARD_NAMES: Record<AwardId, string> = {
  overall: "Best overall",
  value: "Best value",
  portable: "Best portable",
  performance: "Best performance",
  business: "Best business",
  gaming: "Best gaming",
};

export interface Award {
  year: number;
  award: AwardId;
  /** The winning model's or rival's id. */
  id: string;
  /** The rival maker's id, or null for the player's own model. */
  maker: string | null;
  /** The model's name, without its maker. */
  name: string;
  /** Its overall review score. */
  score: number;
}

/** A laptop in the running: its review scores and price. */
export interface Nominee {
  id: string;
  maker: string | null;
  name: string;
  price: number;
  overall: number;
  categories: Record<CategoryKey, number>;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * How each award judges a nominee, higher is better. Value is review score
 * per dollar among laptops at or above the year's median score, so a cheap
 * dud cannot win it. Portable weighs weight and battery life with the
 * overall; business the keyboard, battery, ports and chassis with it.
 */
const JUDGES: Record<AwardId, (n: Nominee) => number> = {
  overall: (n) => n.overall,
  value: (n) => (n.price > 0 ? n.overall / n.price : 0),
  portable: (n) => mean([n.categories.weight, n.categories.battery, n.overall]),
  performance: (n) => n.categories.app,
  business: (n) =>
    mean([n.categories.keyboard, n.categories.battery, n.categories.connectivity, n.categories.chassis, n.overall]),
  gaming: (n) => n.categories.games,
};

/** The year's winners, one per award, from the nominees. Ties go to the better overall, then the id. */
export function judgeAwards(year: number, nominees: Nominee[]): Award[] {
  if (nominees.length === 0) return [];
  const sorted = [...nominees].map((n) => n.overall).sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const out: Award[] = [];
  for (const award of AWARD_IDS) {
    const field = award === "value" ? nominees.filter((n) => n.overall >= median && n.price > 0) : nominees;
    const judge = JUDGES[award];
    const best = field.reduce<Nominee | null>((a, b) => {
      if (!a) return b;
      const d = judge(b) - judge(a);
      if (d !== 0) return d > 0 ? b : a;
      if (b.overall !== a.overall) return b.overall > a.overall ? b : a;
      return b.id < a.id ? b : a;
    }, null);
    if (best) out.push({ year, award, id: best.id, maker: best.maker, name: best.name, score: best.overall });
  }
  return out;
}

function nomineeOf(id: string, maker: string | null, name: string, build: Build, overall?: number): Nominee | null {
  try {
    const f = factsOf({ id, name, company: "", build });
    const s = scoresFromFacts(f);
    const categories = Object.fromEntries(s.categories.map((c) => [c.key, c.score])) as Record<CategoryKey, number>;
    return { id, maker, name, price: build.price ?? 0, overall: overall ?? s.overall, categories };
  } catch {
    return null;
  }
}

/** Every laptop launched in the state's year: the player's releases and that year's rivals. */
export function nomineesOf(
  state: CampaignState,
  models: { id: string; name: string; build: unknown }[],
  rivals: Rival[],
): Nominee[] {
  const year = state.now.year;
  const out: Nominee[] = [];
  for (const [id, r] of Object.entries(state.releases)) {
    if (r.quarter.year !== year) continue;
    const m = models.find((x) => x.id === id);
    if (!m) continue;
    const n = nomineeOf(id, null, m.name, { ...(m.build as Build), price: r.price }, state.reviews[id]?.score);
    if (n) out.push(n);
  }
  for (const r of rivals) {
    if (r.build.year !== year) continue;
    try {
      const p = rivalProfile(r);
      const overall = state.reviews[r.id]?.score ?? p.review;
      out.push({ id: r.id, maker: r.maker, name: rivalSubject(r).name, price: r.build.price ?? 0, overall, categories: p.categories });
    } catch {}
  }
  return out;
}

/** How much a segment cares about an award: 1 primary, 0.2 secondary, 0 not at all. */
export function awardWeight(award: AwardId, segment: SegmentId): number {
  const s = AWARD_SEGMENTS[award];
  return s.primary.includes(segment) ? 1 : s.secondary.includes(segment) ? AWARD_SECONDARY : 0;
}

/** A laptop's appeal multiplier in a segment from the awards it won last year. */
export function awardFactor(state: CampaignState, id: string, segment: SegmentId): number {
  let f = 1;
  for (const a of state.awards) {
    if (a.id !== id || a.year !== state.now.year - 1) continue;
    f *= 1 + AWARD_APPEAL * awardWeight(a.award, segment);
  }
  return f;
}

/** The state with the player's wins lifting perception in the segments that care. */
export function honour(state: CampaignState, won: Award[]): CampaignState {
  if (won.length === 0) return state;
  const perception = { ...state.brand.perception };
  for (const a of won)
    for (const id of Object.keys(perception) as SegmentId[]) {
      const w = awardWeight(a.award, id);
      if (w > 0) perception[id] = Math.min(PERCEPTION_MAX, Math.max(PERCEPTION_MIN, perception[id] + AWARD_PERCEPTION * w));
    }
  return { ...state, brand: { ...state.brand, perception } };
}

/** At the end of Q4 the year's awards are given. */
export const presentAwards: QuarterStep = (state, ctx) => {
  const year = state.now.year;
  if (state.now.quarter !== 4 || state.awards.some((a) => a.year === year)) return state;
  const won = judgeAwards(year, nomineesOf(state, ctx.models, ctx.rivals ?? []));
  if (won.length === 0) return state;
  return honour({ ...state, awards: [...state.awards, ...won] }, won.filter((a) => a.maker === null));
};

/** Saved awards, dropping any that are unreadable. */
export function awardsOf(x: unknown): Award[] {
  if (!Array.isArray(x)) return [];
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  return x.filter(
    (a): a is Award =>
      !!a &&
      num(a.year) &&
      AWARD_IDS.includes(a.award) &&
      typeof a.id === "string" &&
      (a.maker === null || typeof a.maker === "string") &&
      typeof a.name === "string" &&
      num(a.score),
  );
}
