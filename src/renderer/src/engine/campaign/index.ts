import type { SavedCampaign, SavedModel } from "../../../../preload/store";
import { type Award, awardsOf, presentAwards } from "./awards";
import { type PublishedReview, publishReviews, reviewsOf } from "./critics";
import { type Brand, brandOf, market, newBrand, type SegmentOutcome, updatePerception } from "./brand";
import { FIRST_START, LAST_START, STARTING_CASH } from "./constants";
import { entryOf, type LedgerEntry, NO_SPEND, type Spent, settle, spentOf } from "./finance";
import type { Rival } from "../market/field";
import { type Release, releaseOf } from "./release";
import { launchRivals } from "./rivals";
import { type SalesRecord, salesRecordOf, simulateSales, wordOfMouth } from "./sales";
import { type ShelfRecord, shelfRecordOf } from "./shelf";

// Campaign mode: a company plays forward from a start year a quarter at a
// time, with no last quarter: past 2026 the content holds at its last year
// and the clock runs on. The state lives in the company save; the main
// process keeps it opaque, so this module owns its shape.

export * from "./awards";
export * from "./brand";
export * from "./constants";
export * from "./critics";
export * from "./estimate";
export * from "./finance";
export * from "./release";
export * from "./rivals";
export * from "./sales";
export * from "./shelf";
export * from "./world";

export type QuarterOfYear = 1 | 2 | 3 | 4;

/** A point on the campaign clock. */
export interface Quarter {
  year: number;
  quarter: QuarterOfYear;
}

export interface CampaignState {
  start: number;
  /** The cash the campaign started with. */
  startCash: number;
  /** The quarter being played. */
  now: Quarter;
  cash: number;
  /** Set when the company goes bankrupt; a campaign has no other end. */
  over: boolean;
  /** Released models by model id. */
  releases: Record<string, Release>;
  /** Setup and production paid so far this quarter, for its ledger entry. */
  spent: Spent;
  /** One entry per resolved quarter, oldest first. */
  ledger: LedgerEntry[];
  /** Ended a year with negative cash. A bankrupt campaign is also over. */
  bankrupt: boolean;
  /** Reach, perception and campaigns per buyer segment. */
  brand: Brand;
  /** Ids of the rival models on sale in the quarter being played. */
  onSale: string[];
  /** One record per resolved quarter, oldest first, the last SALES_HISTORY kept. */
  sales: SalesRecord[];
  /** Every resolved quarter's shelf, oldest first, for the market views. Saves from before it start empty. */
  shelf: ShelfRecord[];
  /** The quarter's buyers' outcomes, from sales to marketing. Empty between quarters. */
  outcomes: SegmentOutcome[];
  /** Published reviews by model or rival id. A laptop with none counts as par with buyers. */
  reviews: Record<string, PublishedReview>;
  /** Every year's awards, oldest first. */
  awards: Award[];
  /** A commercial's wheel result per model id, 1.5 for +50%: it multiplies the model's sales in the next quarter to resolve, then goes. */
  boosts: Record<string, number>;
  /** Models that have had their one commercial. */
  advertised: string[];
}

/** What a quarter's resolution reads besides the campaign state. */
export interface QuarterContext {
  models: SavedModel[];
  /** The company's id: seeds the rivals' launch quarters. */
  company?: string;
  /** The company's markets for the year and the year before. */
  rivals?: Rival[];
}

/** One step of a quarter's resolution: the state in, the changed state out. */
export type QuarterStep = (state: CampaignState, ctx: QuarterContext) => CampaignState;

export function quarterLabel(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

export function nextQuarter(q: Quarter): Quarter {
  return q.quarter === 4 ? { year: q.year + 1, quarter: 1 } : { year: q.year, quarter: (q.quarter + 1) as QuarterOfYear };
}

export function newCampaign(start: number, startCash = STARTING_CASH): CampaignState {
  const year = Math.min(LAST_START, Math.max(FIRST_START, Math.round(start)));
  return { start: year, startCash, now: { year, quarter: 1 }, cash: startCash, over: false,
    releases: {},
    spent: { ...NO_SPEND },
    ledger: [],
    bankrupt: false,
    brand: newBrand(),
    onSale: [],
    sales: [],
    shelf: [],
    outcomes: [],
    reviews: {},
    awards: [],
    boosts: {},
    advertised: [],
  };
}

/** A saved campaign's state, with anything missing or broken filled from a fresh start. */
export function campaignOf(saved: SavedCampaign): CampaignState {
  const fresh = newCampaign(saved.start, saved.cash);
  const s = (saved.state ?? {}) as Partial<CampaignState>;
  const n = s.now;
  const at =
    n && Number.isInteger(n.year) && n.year >= fresh.start && [1, 2, 3, 4].includes(n.quarter)
      ? { year: n.year, quarter: n.quarter }
      : fresh.now;
  const bankrupt = s.bankrupt === true;
  // Campaigns once ended after Q4 2026 with the clock left on it; such a save
  // carries on from the quarter after.
  const finished = s.over === true && !bankrupt;
  const now = finished ? nextQuarter(at) : at;
  return {
    start: fresh.start,
    startCash: fresh.startCash,
    now,
    cash: typeof s.cash === "number" && Number.isFinite(s.cash) ? s.cash : fresh.cash,
    over: bankrupt,
    releases: releasesOf(s.releases),
    spent: spentOf(s.spent),
    ledger: Array.isArray(s.ledger) ? s.ledger.map(entryOf).filter((e): e is LedgerEntry => !!e) : [],
    bankrupt,
    brand: brandOf(s.brand),
    onSale: Array.isArray(s.onSale) ? s.onSale.filter((x): x is string => typeof x === "string") : [],
    sales: Array.isArray(s.sales) ? s.sales.map(salesRecordOf).filter((r): r is SalesRecord => !!r) : [],
    shelf: Array.isArray(s.shelf) ? s.shelf.map(shelfRecordOf).filter((r): r is ShelfRecord => !!r) : [],
    outcomes: [],
    reviews: reviewsOf(s.reviews),
    awards: awardsOf(s.awards),
    boosts: boostsOf(s.boosts),
    advertised: Array.isArray(s.advertised) ? s.advertised.filter((x): x is string => typeof x === "string") : [],
  };
}

function boostsOf(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!x || typeof x !== "object") return out;
  for (const [id, v] of Object.entries(x)) if (typeof v === "number" && Number.isFinite(v) && v > 0) out[id] = v;
  return out;
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
  const { start, startCash, ...rest } = state;
  return { start, cash: startCash, state: rest };
}

// ------------------------------------------------------------------ quarter steps
// Each step plugs a later system into the quarter. They run in this order.

/** Paid campaigns run before the quarter's sales, so the reach they buy sells this quarter. */
export const runMarketing: QuarterStep = (state) => market(state);

/** Reach and reputation move with the quarter's sales and reviews. */
export const spreadWord: QuarterStep = (state) => ({
  ...updatePerception(wordOfMouth(state, state.outcomes), state.outcomes),
  outcomes: [],
});

/** Revenue, part and production costs and stock settle into cash. */
export const settleFinances: QuarterStep = (state) => settle(state);

/** The quarter's steps by name, in order, so the UI can show which one is running. */
export const QUARTER_STEPS: { name: string; run: QuarterStep }[] = [
  { name: "Rivals", run: launchRivals },
  { name: "Critics", run: publishReviews },
  { name: "Marketing", run: runMarketing },
  { name: "Sales", run: simulateSales },
  { name: "Word of mouth", run: spreadWord },
  { name: "Books", run: settleFinances },
  { name: "Awards", run: presentAwards },
];

const STEPS: QuarterStep[] = QUARTER_STEPS.map((s) => s.run);

/** Moves the clock on a quarter. A bankrupt campaign stays where it is. */
export function advanceClock(state: CampaignState): CampaignState {
  if (state.over) return state;
  return { ...state, now: nextQuarter(state.now) };
}

/** Plays out the current quarter and moves to the next. A bankrupt campaign stays as it is. */
export function resolveQuarter(state: CampaignState, ctx: QuarterContext = { models: [] }): CampaignState {
  if (state.over) return state;
  return advanceClock(STEPS.reduce((s, step) => step(s, ctx), state));
}
