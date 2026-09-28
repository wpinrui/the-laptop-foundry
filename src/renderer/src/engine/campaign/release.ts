import { costOf } from "../price";
import { solve } from "../solve";
import type { Build } from "../types";
import {
  DESIGN_COST,
  MAX_RUN,
  MIN_RUN,
  SCALE_FLOOR,
  SCALE_REFERENCE,
  SCALE_SLOPE,
  TOOLING_COST,
} from "./constants";
import type { CampaignState, Quarter } from "./index";

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
}

/** What producing a run costs. */
export interface Quote {
  /** Per unit, after economies of scale. */
  unit: number;
  /** Design and tooling, paid once at release; 0 on a reorder. */
  setup: number;
  total: number;
}

/** The share of a build's cost a unit in a run of this size pays. */
export function scaleFactor(units: number): number {
  if (units <= 0) return 1;
  const f = 1 / (1 + SCALE_SLOPE * Math.log10(units / SCALE_REFERENCE));
  return Math.min(1, Math.max(SCALE_FLOOR, f));
}

/** A build's parts and assembly cost per unit, before scale. */
export function buildCost(build: Build): number {
  return costOf(build, solve(build)).total;
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
  return Math.min(MAX_RUN, Math.max(MIN_RUN, Math.round(units)));
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
  };
}
