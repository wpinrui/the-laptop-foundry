import type { Build } from "../types";
import { CRITICS_DELAY, REVIEW_PAR } from "./constants";
import type { CampaignState, Quarter, QuarterStep } from "./index";
import { quarterIndex } from "./rivals";
import { profileOf, rivalLaunch } from "./sales";

// Critics (GDD, Version 0.2, "Critics and awards"): a laptop's review is
// published CRITICS_DELAY quarters after it goes on sale, and only then does
// its review score move buyers. Until then the sales read the critics as
// neutral. A review the player opens before release is a private preview:
// it shows the same score the critics will give, and counts for nothing.

/** A review in print: when it was published and its overall score. */
export interface PublishedReview {
  quarter: Quarter;
  score: number;
}

/** The quarter a laptop launched in `launch` has its review published in. */
export function publicationQuarter(launch: Quarter): Quarter {
  const i = quarterIndex(launch) + CRITICS_DELAY;
  return { year: Math.floor(i / 4), quarter: ((i % 4) + 1) as Quarter["quarter"] };
}

/** Whether a laptop launched at quarter index `launch` has its review out by quarter index `at`. */
export function isPublishable(launch: number, at: number): boolean {
  return at - launch >= CRITICS_DELAY;
}

/** The review score buyers see for a laptop: its published score, or par before publication. */
export function criticsScore(state: CampaignState, id: string): number {
  return state.reviews[id]?.score ?? REVIEW_PAR;
}

/** Critics publish the reviews of every laptop that went on sale at least CRITICS_DELAY quarters ago. */
export const publishReviews: QuarterStep = (state, ctx) => {
  const at = quarterIndex(state.now);
  const company = ctx.company ?? "";
  const added: Record<string, PublishedReview> = {};
  for (const [id, r] of Object.entries(state.releases)) {
    if (state.reviews[id] || !isPublishable(quarterIndex(r.quarter), at)) continue;
    const m = ctx.models.find((x) => x.id === id);
    if (!m) continue;
    const build = { ...(m.build as Build), price: r.price };
    added[id] = { quarter: { ...state.now }, score: profileOf(id, build).review };
  }
  const on = new Set(state.onSale);
  for (const r of ctx.rivals ?? []) {
    if (state.reviews[r.id] || !on.has(r.id) || !isPublishable(rivalLaunch(company, r, at), at)) continue;
    added[r.id] = { quarter: { ...state.now }, score: profileOf(r.id, r.build).review };
  }
  return Object.keys(added).length > 0 ? { ...state, reviews: { ...state.reviews, ...added } } : state;
};

/** Saved published reviews, dropping any that are unreadable. */
export function reviewsOf(x: unknown): Record<string, PublishedReview> {
  const out: Record<string, PublishedReview> = {};
  if (!x || typeof x !== "object") return out;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  for (const [id, v] of Object.entries(x)) {
    const r = v as Partial<PublishedReview> | null;
    if (!r?.quarter || !num(r.quarter.year) || !num(r.quarter.quarter) || !num(r.score)) continue;
    out[id] = { quarter: { year: r.quarter.year, quarter: r.quarter.quarter }, score: r.score };
  }
  return out;
}

