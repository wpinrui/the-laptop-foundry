import { type CostLine, costOf } from "../price";
import { solve } from "../solve";
import type { Build } from "../types";
import {
  DESIGN_COST,
  MIN_RUN,
  SCALE_FLOOR,
  SCALE_REFERENCE,
  SCALE_SLOPE,
  SCALE_SMALL_SLOPE,
  HOLDING_RATE,
  OVERHEAD_BASE,
  OVERHEAD_PER_LINE,
  RETAILER_CUT,
  TOOLING_COST,
} from "./constants";
import type { CampaignState, Quarter } from "./index";
import { unitsOf } from "./shelf";

// Releasing a model: one-off design and tooling, then production runs paid
// up front at the scaled unit cost. The units go into stock.

/** A released model's place on the market. */
export interface Release {
  /** The quarter it went on sale. */
  quarter: Quarter;
  /** Retail price, fixed at release. */
  price: number;
  /** Released on a body an earlier release already tooled. */
  refresh: boolean;
  /** Units on hand. */
  stock: number;
  /** Units made over every run. */
  made: number;
  /** What a unit in stock cost to make, averaged over the runs. */
  unitCost: number;
  /** Units sold in the quarter being resolved. The sales step fills it. */
  sold: number;
  /** The price each settled quarter sold at, oldest first. */
  prices: PricedQuarter[];
}

/** The model has sold at least one unit: deleting it archives it instead. */
export function hasSold(state: CampaignState, id: string): boolean {
  const r = state.releases[id];
  if (r && (r.sold > 0 || r.made > r.stock)) return true;
  return state.shelf.some((s) => unitsOf(s.units[id]) > 0) || state.sales.some((s) => (s.units[id] ?? 0) > 0);
}

/** A quarter's price for a release. */
export interface PricedQuarter {
  quarter: Quarter;
  price: number;
}

/** The highest price the player can set. */
export const MAX_PRICE = 20_000;

/** What producing a run costs. */
export interface Quote {
  /** Per unit, after economies of scale. */
  unit: number;
  /** Design and tooling, paid once at release; 0 on a reorder. */
  setup: number;
  total: number;
}

/**
 * The share of a build's cost a unit in a run of this size pays: above 1 for
 * runs under SCALE_REFERENCE, below it for larger ones, down to SCALE_FLOOR.
 * The one place the run-size curve lives; constants.ts gives its figures.
 */
export function scaleFactor(units: number): number {
  if (units <= 0) return 1;
  const x = Math.log10(units / SCALE_REFERENCE);
  const f = x < 0 ? 1 - SCALE_SMALL_SLOPE * x : 1 / (1 + SCALE_SLOPE * x);
  return Math.max(SCALE_FLOOR, f);
}

/** A build's parts and assembly cost per unit, before scale. */
export function buildCost(build: Build): number {
  return costOf(build, solve(build)).total;
}

/** A build's per-unit cost by part and process, before scale. */
export function buildCostLines(build: Build): CostLine[] {
  return costOf(build, solve(build)).lines;
}

/** What the shell's tooling depends on: its body, size, materials and port cut-outs. */
export function chassisKey(b: Build): string {
  return JSON.stringify([
    b.body,
    b.layout,
    b.size,
    b.materials,
    b.shape?.[b.body],
    b.sides?.[b.body],
    b.curve?.[b.body],
    b.ports.map((p) => [p.part, p.side]),
  ]);
}

/** Whether a build keeps the body of a model already released. */
export function isRefresh(build: Build, released: Build[]): boolean {
  const key = chassisKey(build);
  return released.some((b) => chassisKey(b) === key);
}

export function releaseQuote(
  cost: number,
  units: number,
  refresh: boolean,
): Quote {
  const unit = cost * scaleFactor(units);
  const kind = refresh ? "refresh" : "new";
  const setup = DESIGN_COST[kind] + TOOLING_COST[kind];
  return { unit, setup, total: setup + unit * units };
}

/** A run's money before it is ordered: per unit, one-off, and the run if it all sells. */
export interface Economics {
  /** Per unit, after economies of scale. */
  unit: number;
  design: number;
  tooling: number;
  price: number;
  /** The retailers' cut of a unit's price. */
  retail: number;
  /** What a unit sold earns after the retailers' cut and its cost. */
  margin: number;
  /** Units to sell to pay back the one-off costs, or null when a unit loses money. */
  breakEven: number | null;
  /** The run's cost, one-off costs included. */
  total: number;
  /** Revenue after the retailers' cut if the whole run sells. */
  revenue: number;
  /** Profit if the whole run sells. */
  profit: number;
}

/** A run's economics: a release, or a reorder once released. */
export function economics(
  cost: number,
  price: number,
  units: number,
  refresh: boolean,
  released: boolean,
): Economics {
  const unit = cost * scaleFactor(units);
  const kind = refresh ? "refresh" : "new";
  const design = released ? 0 : DESIGN_COST[kind];
  const tooling = released ? 0 : TOOLING_COST[kind];
  const retail = price * RETAILER_CUT;
  const margin = price - retail - unit;
  const total = design + tooling + unit * units;
  const revenue = (price - retail) * units;
  return {
    unit,
    design,
    tooling,
    price,
    retail,
    margin,
    breakEven: margin > 0 ? Math.ceil((design + tooling) / margin) : null,
    total,
    revenue,
    profit: revenue - total,
  };
}

export function reorderQuote(cost: number, units: number): Quote {
  const unit = cost * scaleFactor(units);
  return { unit, setup: 0, total: unit * units };
}

/** The next run size up or down from this one. */
export function stepRun(units: number, dir: 1 | -1): number {
  // Fine steps where a run is small, coarser as it grows.
  const at = dir > 0 ? units : units - 1;
  const step = at < 5_000 ? 100 : at < 20_000 ? 500 : 1_000;
  return clampRun(Math.round((units + dir * step) / step) * step);
}

/** A typed run size kept to whole units within the allowed range. */
export function clampRun(units: number): number {
  if (!Number.isFinite(units)) return MIN_RUN;
  return Math.max(MIN_RUN, Math.round(units));
}

/** The state with the model released, or null when it cannot be: already released, no price, or short of cash. */
export function release(
  state: CampaignState,
  id: string,
  price: number | undefined,
  cost: number,
  units: number,
  refresh: boolean,
): CampaignState | null {
  if (state.over || state.releases[id] || !price || price <= 0 || units <= 0)
    return null;
  const q = releaseQuote(cost, units, refresh);
  if (q.total > state.cash) return null;
  const r: Release = {
    quarter: { ...state.now },
    price,
    refresh,
    stock: units,
    made: units,
    unitCost: q.unit,
    sold: 0,
    prices: [],
  };
  return {
    ...state,
    cash: state.cash - q.total,
    releases: { ...state.releases, [id]: r },
    spent: {
      ...state.spent,
      setup: state.spent.setup + q.setup,
      production: state.spent.production + q.unit * units,
    },
  };
}

/** The state with another run of a released model in stock, or null when it cannot be. */
export function reorder(
  state: CampaignState,
  id: string,
  cost: number,
  units: number,
): CampaignState | null {
  const r = state.releases[id];
  if (state.over || !r || units <= 0) return null;
  const q = reorderQuote(cost, units);
  if (q.total > state.cash) return null;
  const stock = r.stock + units;
  const next: Release = {
    ...r,
    stock,
    made: r.made + units,
    unitCost: (r.stock * r.unitCost + units * q.unit) / stock,
  };
  return {
    ...state,
    cash: state.cash - q.total,
    releases: { ...state.releases, [id]: next },
    spent: { ...state.spent, production: state.spent.production + q.total },
  };
}

/** A saved release, or null when it is unreadable. */
export function releaseOf(x: unknown): Release | null {
  const r = x as Partial<Release> | null;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!r || !r.quarter || !num(r.quarter.year) || !num(r.quarter.quarter))
    return null;
  if (!num(r.price) || !num(r.stock) || !num(r.made)) return null;
  return {
    quarter: { year: r.quarter.year, quarter: r.quarter.quarter },
    price: r.price as number,
    refresh: r.refresh === true,
    stock: r.stock as number,
    made: r.made as number,
    unitCost: num(r.unitCost) ? (r.unitCost as number) : 0,
    sold: num(r.sold) ? (r.sold as number) : 0,
    prices: Array.isArray(r.prices)
      ? r.prices.filter(
          (p): p is PricedQuarter =>
            !!p && num(p.price) && !!p.quarter && num(p.quarter.year) && num(p.quarter.quarter),
        )
      : [],
  };
}

/** The state with a released model's price changed from now on, or null when it cannot be. */
export function setPrice(state: CampaignState, id: string, price: number): CampaignState | null {
  const r = state.releases[id];
  if (state.over || !r || !Number.isFinite(price)) return null;
  const p = Math.min(MAX_PRICE, Math.max(1, Math.round(price)));
  if (p === r.price) return null;
  return { ...state, releases: { ...state.releases, [id]: { ...r, price: p } } };
}

/** The next price up or down: $10 steps under $1,000, $25 from there. */
export function stepPrice(price: number, dir: 1 | -1): number {
  const at = dir > 0 ? price : price - 1;
  const step = at < 1_000 ? 10 : 25;
  return Math.min(MAX_PRICE, Math.max(1, price + dir * step));
}

/** What a quarter holds for a run beside the run itself: the fixed costs, and the profit if it sells. */
export interface Outlook {
  /** The company's own overhead. */
  overheadBase: number;
  /** The overhead this model's line adds while it holds stock. */
  overheadModel: number;
  /** The campaigns running this quarter. */
  marketing: number;
  /** Units on hand once the run is in. */
  available: number;
  /** The quarter's profit if every unit on hand sells. */
  profitSoldOut: number;
  /** At last quarter's demand: units sold, holding on the rest, the quarter's profit. Null without a demand. */
  atDemand: { sold: number; holding: number; profit: number } | null;
  /** Units to sell this quarter to cover its spend, or null when a unit earns nothing. */
  breakEven: number | null;
}

/**
 * A run's quarter: the run and its setup, the company's and this model's
 * overhead and the campaigns running, against what the units on hand earn
 * after the retailers' cut. Stock already on hand was paid for in its own
 * quarter, as in the ledger.
 */
export function outlook(
  e: Economics,
  units: number,
  onHand: { stock: number; unitCost: number } | null,
  marketing: number,
  demand: number | null,
): Outlook {
  const stock = onHand?.stock ?? 0;
  const available = stock + units;
  const avgCost = available > 0 ? (stock * (onHand?.unitCost ?? 0) + units * e.unit) / available : 0;
  const net = e.price - e.retail;
  const spend = e.total + OVERHEAD_BASE + OVERHEAD_PER_LINE + marketing;
  let atDemand: Outlook["atDemand"] = null;
  if (demand !== null) {
    const sold = Math.min(available, Math.max(0, Math.round(demand)));
    const holding = (available - sold) * avgCost * HOLDING_RATE;
    atDemand = { sold, holding, profit: sold * net - spend - holding };
  }
  return {
    overheadBase: OVERHEAD_BASE,
    overheadModel: OVERHEAD_PER_LINE,
    marketing,
    available,
    profitSoldOut: available * net - spend,
    atDemand,
    breakEven: net > 0 ? Math.ceil(spend / net) : null,
  };
}

/**
 * A released model's own profit over every settled quarter: what its units
 * earned after the retailers' cut at each quarter's price, less its runs and
 * its design and tooling. Overhead and marketing are the company's, not its.
 */
export function lifetimeProfit(state: CampaignState, id: string): { profit: number; sold: number } | null {
  const r = state.releases[id];
  if (!r) return null;
  const at = (a: Quarter, b: Quarter) => a.year === b.year && a.quarter === b.quarter;
  let revenue = 0;
  let sold = 0;
  for (const p of r.prices) {
    const shelf = state.shelf.find((s) => at(s.quarter, p.quarter));
    const units = shelf?.units[id] ? unitsOf(shelf.units[id]) : (state.sales.find((s) => at(s.quarter, p.quarter))?.units[id] ?? 0);
    sold += units;
    revenue += units * p.price * (1 - RETAILER_CUT);
  }
  const kind = r.refresh ? "refresh" : "new";
  return { profit: revenue - r.made * r.unitCost - DESIGN_COST[kind] - TOOLING_COST[kind], sold };
}
