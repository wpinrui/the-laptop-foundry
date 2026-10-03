import { activeArea } from "../content/display";
import { factsOf } from "../review";
import type { CategoryKey } from "../review/scales";
import { CATEGORY_KEYS, scoresFromFacts } from "../review/score";
import type { Build } from "../types";
import type { Rival, SavedMarket } from "./field";
import { type HeadlineValues, headlineStats } from "./stats";
import { HEADLINE_STATS } from "./types";

// What the sales and awards read of a laptop: its headline stats, review
// scores and screen size. Measuring one runs the review, so a year's rivals are
// measured once, in the market worker, and saved with the market.

export interface Profile {
  stats: HeadlineValues;
  review: number;
  /** Review score per category, for the awards. */
  categories: Record<CategoryKey, number>;
  inches: number;
  /** Packaging, for the sales: kg, total thickness in mm, and screen-to-body (active panel area over the base footprint, 0 to 1). */
  pack: Pack;
}

export interface Pack {
  kg: number;
  mm: number;
  stb: number;
}

/** The mean packaging of a market, or null when it is empty. */
export function packAverage(list: Pack[]): Pack | null {
  if (list.length === 0) return null;
  const n = list.length;
  return {
    kg: list.reduce((a, x) => a + x.kg, 0) / n,
    mm: list.reduce((a, x) => a + x.mm, 0) / n,
    stb: list.reduce((a, x) => a + x.stb, 0) / n,
  };
}

const profiles = new Map<string, Profile>();

/** A laptop's headline stats, review score and screen size, measured once per build. */
export function profileOf(id: string, build: Build): Profile {
  const key = `${id}:${JSON.stringify(build)}`;
  const hit = profiles.get(key);
  if (hit) return hit;
  const f = factsOf({ id, name: id, company: "", build });
  const s = scoresFromFacts(f);
  const area = f.panel ? activeArea(f.panel) : { x: 0, y: 0 };
  const foot = f.fit.frame.x * f.fit.frame.y;
  const p: Profile = {
    stats: headlineStats(build, f.fit, f.m, f.r),
    review: s.overall,
    categories: Object.fromEntries(s.categories.map((c) => [c.key, c.score])) as Record<CategoryKey, number>,
    inches: f.panel?.inches ?? build.screen?.diag ?? 14,
    pack: { kg: f.kg, mm: f.fit.frame.z + f.fit.lidZ, stb: foot > 0 ? (area.x * area.y) / foot : 0 },
  };
  profiles.set(key, p);
  return p;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isProfile(p: Profile | undefined): p is Profile {
  return !!p && num(p.review) && num(p.inches) && !!p.stats && HEADLINE_STATS.every((k) => num(p.stats[k])) && !!p.categories && CATEGORY_KEYS.every((k) => num(p.categories[k])) && !!p.pack && num(p.pack.kg) && num(p.pack.mm) && num(p.pack.stb);
}

/** A rival's profile: the one saved with its market, or measured now for a market saved without one (or without packaging). */
export function rivalProfile(r: Rival): Profile {
  return isProfile(r.profile) ? r.profile : profileOf(r.id, r.build);
}

/** The market with every rival measured. */
export function withProfiles(m: SavedMarket): SavedMarket {
  return { ...m, models: m.models.map((r) => ({ ...r, profile: profileOf(r.id, r.build) })) };
}
