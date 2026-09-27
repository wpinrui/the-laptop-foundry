import {
  HOLDING_RATE,
  OVERHEAD_BASE,
  OVERHEAD_PER_LINE,
  RETAILER_CUT,
} from "./constants";
import type { CampaignState, Quarter } from "./index";
import type { Release } from "./release";

// The quarter's books: sales turn stock into revenue, the retailers take
// their cut, overhead and holding costs come out of cash, and the quarter's
// line goes in the ledger. Design, tooling and production were paid when
// spent, so they only enter the ledger here.

/** What the quarter's releases and runs cost, paid when they were ordered. */
export interface Spent {
  setup: number;
  production: number;
}

/** One quarter's books. */
export interface LedgerEntry {
  quarter: Quarter;
  revenue: number;
  /** The retailers' cut of the revenue. */
  retail: number;
  setup: number;
  production: number;
  overhead: number;
  holding: number;
  /** Revenue less every cost. */
  profit: number;
  /** Cash at the quarter's end. */
  cash: number;
}

export const NO_SPEND: Spent = { setup: 0, production: 0 };

/** Every cost in an entry. */
export function costsOf(e: LedgerEntry): number {
  return e.retail + e.setup + e.production + e.overhead + e.holding;
}

/** The state with the current quarter's books settled into cash and the ledger. */
export function settle(state: CampaignState): CampaignState {
  let revenue = 0;
  let lines = 0;
  let stockValue = 0;
  const releases: Record<string, Release> = {};
  for (const [id, r] of Object.entries(state.releases)) {
    const units = Math.min(r.stock, Math.max(0, Math.floor(r.sold)));
    if (r.stock > 0) lines++;
    revenue += units * r.price;
    const stock = r.stock - units;
    stockValue += stock * r.unitCost;
    releases[id] = { ...r, stock, sold: 0 };
  }
  const retail = revenue * RETAILER_CUT;
  const overhead = OVERHEAD_BASE + OVERHEAD_PER_LINE * lines;
  const holding = stockValue * HOLDING_RATE;
  const cash = state.cash + revenue - retail - overhead - holding;
  const entry: LedgerEntry = {
    quarter: { ...state.now },
    revenue,
    retail,
    setup: state.spent.setup,
    production: state.spent.production,
    overhead,
    holding,
    profit: 0,
    cash,
  };
  entry.profit = revenue - costsOf(entry);
  // A company that ends a year owing money is bust.
  const bankrupt = state.now.quarter === 4 && cash < 0;
  return {
    ...state,
    cash,
    releases,
    spent: { ...NO_SPEND },
    ledger: [...state.ledger, entry],
    bankrupt,
    over: state.over || bankrupt,
  };
}

/** A saved ledger entry, or null when it is unreadable. */
export function entryOf(x: unknown): LedgerEntry | null {
  const e = x as Partial<LedgerEntry> | null;
  const num = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  if (!e || !e.quarter || !num(e.quarter.year) || !num(e.quarter.quarter))
    return null;
  const keys = [
    "revenue",
    "retail",
    "setup",
    "production",
    "overhead",
    "holding",
    "profit",
    "cash",
  ] as const;
  if (!keys.every((k) => num(e[k]))) return null;
  return {
    ...(e as LedgerEntry),
    quarter: { year: e.quarter.year, quarter: e.quarter.quarter },
  };
}

/** Saved spend, zero where unreadable. */
export function spentOf(x: unknown): Spent {
  const s = x as Partial<Spent> | null;
  const num = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  return {
    setup: num(s?.setup) ? s.setup : 0,
    production: num(s?.production) ? s.production : 0,
  };
}
