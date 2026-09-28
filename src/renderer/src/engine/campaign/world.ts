import type { Rival } from "../market/field";
import { shapeFor, LINES } from "../market/makers";
import { profileOf, rivalProfile } from "../market/profile";
import { marketScore } from "../market/score";
import { SEGMENTS } from "../market/segments";
import type { HeadlineValues } from "../market/stats";
import { HEADLINE_STATS, type HeadlineStat, type SegmentId } from "../market/types";
import type { BodyClass, Budget, PerfClass } from "../price";
import { factsOf } from "../review";
import type { Build } from "../types";
import type { Award } from "./awards";
import type { LedgerEntry } from "./finance";
import type { CampaignState, Quarter } from "./index";
import { quarterIndex } from "./rivals";
import type { SalesRecord } from "./sales";
import { type ShelfRecord, unitsOf } from "./shelf";

// The market world as the views read it: pure selectors over the campaign
// state, the loaded rivals and the player's saved models. They return values
// only; how they are laid out is the components' business.

/** What the selectors read besides the campaign state. */
export interface WorldMarket {
  /** Every loaded rival, any year. */
  rivals: Rival[];
  /** The player's saved models. */
  models: { id: string; name: string; build: unknown }[];
}

/** One laptop as the market views show it. */
export interface WorldLaptop {
  id: string;
  /** The player's own model. */
  own: boolean;
  /** The rival maker's id, or null for the player's. */
  maker: string | null;
  /** The model's name, without its maker. */
  name: string;
  year: number;
  price: number;
  inches: number;
  /** Null when the laptop can no longer be measured, a deleted model. */
  kg: number | null;
  budget: Budget | null;
  body: BodyClass | null;
  performance: PerfClass | null;
  /** The published review score by the quarter, or null before publication. */
  review: number | null;
  stats: HeadlineValues | null;
  /** Its saved build, for specs; null for a deleted model. */
  build: Build | null;
}

const same = (a: Quarter, b: Quarter) => a.year === b.year && a.quarter === b.quarter;

/** The shelf record of the quarter, if one was kept. */
export function shelfAt(state: CampaignState, q: Quarter): ShelfRecord | undefined {
  return state.shelf.find((r) => same(r.quarter, q));
}

function salesAt(state: CampaignState, q: Quarter): SalesRecord | undefined {
  return state.sales.find((r) => same(r.quarter, q));
}

/** The quarter before. */
export function previousQuarter(q: Quarter): Quarter {
  return q.quarter === 1 ? { year: q.year - 1, quarter: 4 } : { year: q.year, quarter: (q.quarter - 1) as Quarter["quarter"] };
}

/** Every quarter the market views can show, newest first. */
export function worldQuarters(state: CampaignState): Quarter[] {
  const seen = new Map<number, Quarter>();
  for (const r of [...state.sales, ...state.shelf]) seen.set(quarterIndex(r.quarter), r.quarter);
  return [...seen.entries()].sort((a, b) => b[0] - a[0]).map(([, q]) => q);
}

function safe<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}

/** A laptop by id as it stood in the quarter: its price then, and its review if it was out. */
export function laptopOf(state: CampaignState, market: WorldMarket, id: string, q: Quarter): WorldLaptop | null {
  const rev = state.reviews[id];
  const review = rev && quarterIndex(rev.quarter) <= quarterIndex(q) ? rev.score : null;
  const rival = market.rivals.find((r) => r.id === id);
  if (rival) {
    const p = safe(() => rivalProfile(rival));
    const f = safe(() => factsOf({ id: rival.id, name: rival.name, company: "", build: rival.build }));
    const line = LINES.find((l) => l.id === rival.line);
    const shape = line ? shapeFor(line, rival.build.year).class : null;
    return {
      id,
      own: false,
      maker: rival.maker,
      name: rival.name,
      year: rival.build.year,
      price: rival.build.price ?? 0,
      inches: p?.inches ?? rival.build.screen?.diag ?? 0,
      kg: f?.kg ?? null,
      budget: f?.cls.budget ?? shape?.budget ?? null,
      body: f?.cls.body ?? shape?.body ?? null,
      performance: f?.cls.performance ?? shape?.performance ?? null,
      review,
      stats: p?.stats ?? null,
      build: rival.build,
    };
  }
  const shelfOwn = shelfAt(state, q)?.own[id];
  const model = market.models.find((m) => m.id === id);
  const release = state.releases[id];
  if (!model && !shelfOwn) return null;
  const kept = release?.prices.find((p) => same(p.quarter, q))?.price;
  const price = shelfOwn?.price ?? kept ?? release?.price ?? (model?.build as Build | undefined)?.price ?? 0;
  const build = model ? { ...(model.build as Build), price } : null;
  const p = build ? safe(() => profileOf(id, build)) : null;
  const f = build ? safe(() => factsOf({ id, name: model?.name ?? "", company: "", build })) : null;
  return {
    id,
    own: true,
    maker: null,
    name: model?.name ?? shelfOwn?.name ?? "",
    year: build?.year ?? q.year,
    price,
    inches: p?.inches ?? build?.screen?.diag ?? 0,
    kg: f?.kg ?? null,
    budget: f?.cls.budget ?? null,
    body: f?.cls.body ?? null,
    performance: f?.cls.performance ?? null,
    review,
    stats: p?.stats ?? null,
    build,
  };
}

// ------------------------------------------------------------------ quarter

/** A laptop with its units. */
export interface WorldSeller extends WorldLaptop {
  units: number;
  /** Its share of every unit sold in the quarter, 0 to 1. */
  share: number;
}

export interface MakerShare {
  /** The rival maker's id, or null for the player's company. */
  maker: string | null;
  units: number;
  share: number;
  /** Share points against the quarter before, or null with nothing to compare. */
  change: number | null;
}

export interface QuarterSummary {
  quarter: Quarter;
  /** Every unit sold in the market. */
  total: number;
  /** The best sellers, most units first. */
  best: WorldSeller[];
  /** Every maker's units and share, largest first. */
  makers: MakerShare[];
  launches: WorldLaptop[];
  /** Reviews published in the quarter. */
  reviews: WorldLaptop[];
  /** The year's awards, in a Q4. */
  awards: Award[];
  /** Units sold per segment. Empty for a quarter kept before the shelf was. */
  segments: { segment: SegmentId; units: number }[];
  player: {
    units: number;
    share: number;
    change: number | null;
    entry: LedgerEntry | null;
    models: { id: string; name: string; units: number; demand: number; price: number }[];
  };
}

/** Units per maker in a quarter, the player's under null. */
function makerUnits(state: CampaignState, market: WorldMarket, q: Quarter): Map<string | null, number> | null {
  const shelf = shelfAt(state, q);
  const out = new Map<string | null, number>();
  if (shelf) {
    for (const [id, u] of Object.entries(shelf.units)) {
      const maker = shelf.own[id] ? null : (market.rivals.find((r) => r.id === id)?.maker ?? rivalMaker(id));
      out.set(maker, (out.get(maker) ?? 0) + unitsOf(u));
    }
    return out;
  }
  const sales = salesAt(state, q);
  if (!sales) return null;
  for (const [m, u] of Object.entries(sales.makers)) out.set(m, u);
  out.set(null, Object.values(sales.units).reduce((a, b) => a + b, 0));
  return out;
}

/** A rival's maker from its id when its market is not loaded: ids are the line's id and the year. */
function rivalMaker(id: string): string {
  const line = LINES.find((l) => id.startsWith(`${l.id}-`));
  return line?.maker ?? id;
}

const shareIn = (units: number, total: number) => (total > 0 ? units / total : 0);

/** What happened in the quarter: the market, its best sellers, launches, reviews, awards and how the player did. */
export function quarterSummary(state: CampaignState, market: WorldMarket, q: Quarter, top = 10): QuarterSummary {
  const shelf = shelfAt(state, q);
  const sales = salesAt(state, q);
  const now = makerUnits(state, market, q) ?? new Map();
  const before = makerUnits(state, market, previousQuarter(q));
  const total = [...now.values()].reduce((a, b) => a + b, 0) || sales?.total || 0;
  const totalBefore = before ? [...before.values()].reduce((a, b) => a + b, 0) : 0;
  const change = (m: string | null) =>
    before && totalBefore > 0 ? (shareIn(now.get(m) ?? 0, total) - shareIn(before.get(m) ?? 0, totalBefore)) * 100 : null;
  const makers = [...now.entries()]
    .map(([maker, units]) => ({ maker, units, share: shareIn(units, total), change: change(maker) }))
    .sort((a, b) => b.units - a.units);
  const look = (id: string) => laptopOf(state, market, id, q);
  let best: WorldSeller[] = [];
  if (shelf) {
    best = Object.entries(shelf.units)
      .map(([id, u]) => [id, unitsOf(u)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .flatMap(([id, units]) => {
        const l = look(id);
        return l ? [{ ...l, units, share: shareIn(units, total) }] : [];
      });
  } else if (sales?.top) {
    const l = look(sales.top.id);
    if (l) best = [{ ...l, units: sales.top.units, share: shareIn(sales.top.units, total) }];
  }
  const launches = (shelf?.launched ?? []).flatMap((id) => look(id) ?? []);
  const reviews = Object.entries(state.reviews)
    .filter(([, r]) => same(r.quarter, q))
    .flatMap(([id]) => look(id) ?? []);
  const awards = q.quarter === 4 ? state.awards.filter((a) => a.year === q.year) : [];
  const segments = shelf
    ? SEGMENTS.map((s, i) => ({ segment: s.id, units: Object.values(shelf.units).reduce((a, u) => a + (u[i] ?? 0), 0) }))
    : [];
  const ownIds = shelf ? Object.keys(shelf.own) : Object.keys(sales?.units ?? {});
  const models = ownIds.map((id) => {
    const units = shelf ? unitsOf(shelf.units[id]) : (sales?.units[id] ?? 0);
    const l = look(id);
    return {
      id,
      name: l?.name ?? "",
      units,
      demand: shelf?.own[id]?.demand ?? sales?.demand[id] ?? units,
      price: l?.price ?? 0,
    };
  });
  const own = now.get(null) ?? 0;
  return {
    quarter: q,
    total,
    best,
    makers,
    launches,
    reviews,
    awards,
    segments,
    player: {
      units: own,
      share: shareIn(own, total),
      change: change(null),
      entry: state.ledger.find((e) => same(e.quarter, q)) ?? null,
      models,
    },
  };
}

// ------------------------------------------------------------------ store

export interface StoreFilters {
  minPrice?: number;
  maxPrice?: number;
  minInches?: number;
  maxInches?: number;
  budget?: Budget;
  body?: BodyClass;
  performance?: PerfClass;
  /** A rival maker's id, or null for the player's models. Undefined for any. */
  maker?: string | null;
  /** Laptops this segment bought among their top three. */
  segment?: SegmentId;
  sort?: "units" | "price" | "review" | "name";
  /** Cheapest or least first. */
  ascending?: boolean;
}

export interface StoreItem extends WorldLaptop {
  units: number;
  /** Launched this quarter. */
  isNew: boolean;
  /** The segments that bought it most, up to three, most first. */
  segments: SegmentId[];
}

/** The segments that bought a shelf entry most, up to n. */
function topSegments(units: number[] | undefined, n = 3): SegmentId[] {
  if (!units) return [];
  return SEGMENTS.map((s, i) => [s.id, units[i] ?? 0] as const)
    .filter(([, u]) => u > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

/** Every laptop on sale in the quarter, filtered and sorted. */
export function storeListing(state: CampaignState, market: WorldMarket, q: Quarter, filters: StoreFilters = {}): StoreItem[] {
  const shelf = shelfAt(state, q);
  if (!shelf) return [];
  const f = filters;
  const items = Object.entries(shelf.units).flatMap(([id, u]): StoreItem[] => {
    const l = laptopOf(state, market, id, q);
    return l ? [{ ...l, units: unitsOf(u), isNew: shelf.launched.includes(id), segments: topSegments(u) }] : [];
  });
  const shown = items.filter(
    (x) =>
      (f.minPrice === undefined || x.price >= f.minPrice) &&
      (f.maxPrice === undefined || x.price <= f.maxPrice) &&
      (f.minInches === undefined || x.inches >= f.minInches) &&
      (f.maxInches === undefined || x.inches <= f.maxInches) &&
      (!f.budget || x.budget === f.budget) &&
      (!f.body || x.body === f.body) &&
      (!f.performance || x.performance === f.performance) &&
      (f.maker === undefined || x.maker === f.maker) &&
      (!f.segment || x.segments.includes(f.segment)),
  );
  const key: Record<NonNullable<StoreFilters["sort"]>, (x: StoreItem) => number | string> = {
    units: (x) => x.units,
    price: (x) => x.price,
    review: (x) => x.review ?? -1,
    name: (x) => x.name,
  };
  const by = key[f.sort ?? "units"];
  const asc = f.ascending ?? (f.sort === "price" || f.sort === "name");
  return shown.sort((a, b) => {
    const x = by(a);
    const y = by(b);
    const d = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return (asc ? d : -d) || a.id.localeCompare(b.id);
  });
}

/** What a listing can be filtered by: its makers, price and size range, and the segments present. */
export function storeFacets(items: StoreItem[]) {
  const prices = items.map((x) => x.price);
  const inches = items.map((x) => x.inches);
  return {
    makers: [...new Set(items.map((x) => x.maker))],
    segments: SEGMENTS.map((s) => s.id).filter((id) => items.some((x) => x.segments.includes(id))),
    price: prices.length ? ([Math.min(...prices), Math.max(...prices)] as const) : null,
    inches: inches.length ? ([Math.min(...inches), Math.max(...inches)] as const) : null,
  };
}

// ------------------------------------------------------------------ competitors

/** Each headline stat against the shelf's average, 100 at par. Null when the laptop cannot be measured. */
export type StatIndex = Record<HeadlineStat, number> | null;

export interface Competitor extends WorldLaptop {
  units: number;
  index: StatIndex;
  /** How much of the two laptops' buyers come from the same segments, 0 to 1. */
  overlap: number;
  /** Its price over the model's. */
  priceRatio: number;
}

export interface Competition {
  quarter: Quarter;
  model: (WorldLaptop & { units: number; index: StatIndex }) | null;
  rivals: Competitor[];
}

/** A split over the segments that adds up to 1. */
function mixOf(units: number[]): number[] | null {
  const sum = units.reduce((a, b) => a + b, 0);
  return sum > 0 ? units.map((u) => u / sum) : null;
}

/** An unsold model's likely buyers: its market score per segment against the shelf, weighed like appeal. */
function likelyMix(l: WorldLaptop, basis: HeadlineValues[]): number[] | null {
  if (!l.stats) return null;
  const ms = marketScore({ id: l.id, stats: l.stats }, basis);
  return mixOf(SEGMENTS.map((s) => Math.exp(0.35 * (ms.segments[s.id]?.score ?? 5))));
}

/**
 * The rivals closest to a player model in the quarter: those that sold to the
 * same segments at a similar price. The latest kept quarter by default.
 */
export function competitorsOf(state: CampaignState, market: WorldMarket, modelId: string, quarter?: Quarter, n = 5): Competition {
  const shelf = quarter ? shelfAt(state, quarter) : state.shelf[state.shelf.length - 1];
  const q = shelf?.quarter ?? quarter ?? state.now;
  const self = laptopOf(state, market, modelId, q);
  if (!shelf || !self) return { quarter: q, model: self ? { ...self, units: 0, index: null } : null, rivals: [] };
  const rivals = Object.keys(shelf.units)
    .filter((id) => !shelf.own[id])
    .flatMap((id) => laptopOf(state, market, id, q) ?? []);
  const measured = [self, ...rivals].flatMap((l) => (l.stats ? [l.stats] : []));
  const avg = Object.fromEntries(
    HEADLINE_STATS.map((k) => [k, measured.reduce((a, v) => a + v[k], 0) / Math.max(1, measured.length)]),
  ) as Record<HeadlineStat, number>;
  const indexOf = (l: WorldLaptop): StatIndex => {
    const st = l.stats;
    if (!st) return null;
    return Object.fromEntries(HEADLINE_STATS.map((k) => [k, avg[k] > 0 ? (st[k] / avg[k]) * 100 : 100])) as Record<HeadlineStat, number>;
  };
  const mine = shelf.units[modelId];
  const mix =
    (mine && mixOf(mine)) ?? likelyMix(self, rivals.flatMap((r) => (r.stats ? [r.stats] : [])));
  const scored = rivals.map((r): Competitor => {
    const other = mixOf(shelf.units[r.id] ?? []);
    const overlap = mix && other ? mix.reduce((a, m, i) => a + Math.min(m, other[i] ?? 0), 0) : 0;
    const priceRatio = self.price > 0 ? r.price / self.price : 1;
    return { ...r, units: unitsOf(shelf.units[r.id]), index: indexOf(r), overlap, priceRatio };
  });
  const closeness = (c: Competitor) => c.overlap * Math.exp(-Math.abs(Math.log(Math.max(1e-6, c.priceRatio))) / 0.4);
  return {
    quarter: q,
    model: { ...self, units: unitsOf(mine), index: indexOf(self) },
    rivals: scored.sort((a, b) => closeness(b) - closeness(a) || b.units - a.units).slice(0, n),
  };
}

// ------------------------------------------------------------------ buyers

export interface BuyerSegment {
  segment: SegmentId;
  units: number;
  /** Its part of the model's units, 0 to 1. */
  split: number;
  /** The model's share of every unit the segment bought over the same quarters, 0 to 1. */
  won: number;
  /** The headline stats the segment weighs most, most first. */
  priorities: HeadlineStat[];
  /** The company's reach there now, 0 to 1. */
  reach: number;
  /** The company's reputation there now. */
  perception: number;
}

export interface Buyers {
  units: number;
  /** The quarters it sold in. */
  quarters: number;
  /** Every segment, most units first. */
  segments: BuyerSegment[];
}

/** The headline stats a segment weighs most. */
export function prioritiesOf(segment: SegmentId, n = 3): HeadlineStat[] {
  const s = SEGMENTS.find((x) => x.id === segment);
  if (!s) return [];
  return [...HEADLINE_STATS].sort((a, b) => s.weights[b] - s.weights[a]).slice(0, n);
}

/** Who bought a player model: every segment's units, split and share won, over its whole life or one quarter. */
export function buyersOf(state: CampaignState, modelId: string, quarter?: Quarter): Buyers {
  const records = state.shelf.filter((r) => r.units[modelId] && (!quarter || same(r.quarter, quarter)));
  const mine = SEGMENTS.map(() => 0);
  const all = SEGMENTS.map(() => 0);
  let sold = 0;
  for (const r of records) {
    const u = r.units[modelId];
    if (unitsOf(u) > 0) sold++;
    SEGMENTS.forEach((_, i) => {
      mine[i] += u[i] ?? 0;
      for (const v of Object.values(r.units)) all[i] += v[i] ?? 0;
    });
  }
  const units = mine.reduce((a, b) => a + b, 0);
  const segments = SEGMENTS.map((s, i) => ({
    segment: s.id,
    units: mine[i],
    split: shareIn(mine[i], units),
    won: shareIn(mine[i], all[i]),
    priorities: prioritiesOf(s.id),
    reach: state.brand.reach[s.id],
    perception: state.brand.perception[s.id],
  })).sort((a, b) => b.units - a.units || b.reach - a.reach);
  return { units, quarters: sold, segments };
}
