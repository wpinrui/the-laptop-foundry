import type { SavedCampaign, SavedModel } from "../../../../preload/store";
import { END_YEAR, FIRST_START, LAST_START, STARTING_CASH } from "./constants";
import { entryOf, type LedgerEntry, NO_SPEND, type Spent, settle, spentOf } from "./finance";
import { type Release, releaseOf } from "./release";

// Campaign mode: a company plays forward from a start year a quarter at a
// time, to the end of 2026. The state lives in the company save; the main
// process keeps it opaque, so this module owns its shape.

export * from "./constants";
export * from "./finance";
export * from "./release";

export type QuarterOfYear = 1 | 2 | 3 | 4;

/** A point on the campaign clock. */
export interface Quarter {
  year: number;
  quarter: QuarterOfYear;
}

export interface CampaignState {
  start: number;
  /** The quarter being played. */
  now: Quarter;
  cash: number;
  /** Set once the last quarter of 2026 has been resolved. */
  over: boolean;
  /** Released models by model id. */
  releases: Record<string, Release>;
  /** Setup and production paid so far this quarter, for its ledger entry. */
  spent: Spent;
  /** One entry per resolved quarter, oldest first. */
  ledger: LedgerEntry[];
  /** Ended a year with negative cash. A bankrupt campaign is also over. */
  bankrupt: boolean;
}

/** What a quarter's resolution reads besides the campaign state. */
export interface QuarterContext {
  models: SavedModel[];
}

/** One step of a quarter's resolution: the state in, the changed state out. */
export type QuarterStep = (state: CampaignState, ctx: QuarterContext) => CampaignState;

export function quarterLabel(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

export function isLastQuarter(q: Quarter): boolean {
  return q.year >= END_YEAR && q.quarter === 4;
}

export function nextQuarter(q: Quarter): Quarter {
  return q.quarter === 4 ? { year: q.year + 1, quarter: 1 } : { year: q.year, quarter: (q.quarter + 1) as QuarterOfYear };
}

export function newCampaign(start: number): CampaignState {
  const year = Math.min(LAST_START, Math.max(FIRST_START, Math.round(start)));
  return { start: year, now: { year, quarter: 1 }, cash: STARTING_CASH, over: false,
    releases: {},
    spent: { ...NO_SPEND },
    ledger: [],
    bankrupt: false,
  };
}

/** A saved campaign's state, with anything missing or broken filled from a fresh start. */
export function campaignOf(saved: SavedCampaign): CampaignState {
  const fresh = newCampaign(saved.start);
  const s = (saved.state ?? {}) as Partial<CampaignState>;
  const n = s.now;
  const now =
    n &&
    Number.isInteger(n.year) &&
    n.year >= fresh.start &&
    n.year <= END_YEAR &&
    [1, 2, 3, 4].includes(n.quarter)
      ? { year: n.year, quarter: n.quarter }
      : fresh.now;
  return {
    start: fresh.start,
    now,
    cash: typeof s.cash === "number" && Number.isFinite(s.cash) ? s.cash : fresh.cash,
    over: s.over === true,
    releases: releasesOf(s.releases),
    spent: spentOf(s.spent),
    ledger: Array.isArray(s.ledger) ? s.ledger.map(entryOf).filter((e): e is LedgerEntry => !!e) : [],
    bankrupt: s.bankrupt === true,
  };
}

function releasesOf(x: unknown): Record<string, Release> {
  const out: Record<string, Release> = {};
  if (!x || typeof x !== "object") return out;
  for (const [id, v] of Object.entries(x)) {
    const r = releaseOf(v);
    if (r) out[id] = r;
  }
  return out;
}

export function savedCampaign(state: CampaignState): SavedCampaign {
  const { start, ...rest } = state;
  return { start, state: rest };
}

// ------------------------------------------------------------------ quarter steps
// Each step plugs a later system into the quarter. They run in this order.

/** Rival lines that launch this quarter bring out their model for the year. */
export const launchRivals: QuarterStep = (state) => state;

/** Critics review the laptops launched this quarter. */
export const publishReviews: QuarterStep = (state) => state;

/** Segment demand for the quarter is split among the laptops on sale. */
export const simulateSales: QuarterStep = (state) => state;

/** Paid campaigns run, and reach and reputation move with sales and reviews. */
export const runMarketing: QuarterStep = (state) => state;

/** Revenue, part and production costs and stock settle into cash. */
export const settleFinances: QuarterStep = (state) => settle(state);

/** At year end, awards are given from the review scores. */
export const presentAwards: QuarterStep = (state) => state;

const STEPS: QuarterStep[] = [launchRivals, publishReviews, simulateSales, runMarketing, settleFinances, presentAwards];

/** Moves the clock on a quarter, or ends the campaign after its last one. */
export function advanceClock(state: CampaignState): CampaignState {
  if (state.over) return state;
  if (isLastQuarter(state.now)) return { ...state, over: true };
  return { ...state, now: nextQuarter(state.now) };
}

/** Plays out the current quarter and moves to the next. A finished campaign stays as it is. */
export function resolveQuarter(state: CampaignState, ctx: QuarterContext = { models: [] }): CampaignState {
  if (state.over) return state;
  return advanceClock(STEPS.reduce((s, step) => step(s, ctx), state));
}
