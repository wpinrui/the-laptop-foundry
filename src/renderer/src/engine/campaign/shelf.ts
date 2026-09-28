import { SEGMENTS } from "../market/segments";
import type { Brand } from "./brand";
import type { Quarter } from "./index";

// The shelf: what every laptop on sale sold to each buyer segment in a
// quarter, the player's and the rivals'. The sales step writes one record per
// quarter, for the whole campaign, so any past quarter can be shown again.
// Rivals' prices, specs and reviews are not copied: the saved market and the
// published reviews hold them. See docs/spikes/market-world.md.

/** A player model on the shelf: what the market cannot tell. */
export interface ShelfOwn {
  /** The model's name that quarter; a deleted model keeps it here. */
  name: string;
  price: number;
  /** Units its buyers wanted, before stock. */
  demand: number;
}

export interface ShelfRecord {
  quarter: Quarter;
  /** Units sold per laptop on sale, one entry per segment in SEGMENTS order. */
  units: Record<string, number[]>;
  /** The player's models on sale. */
  own: Record<string, ShelfOwn>;
  /** Laptops whose launch quarter this was. */
  launched: string[];
  /** The company's brand as the quarter's buyers saw it: reach per mille and perception, per segment in SEGMENTS order. */
  brand: { reach: number[]; perception: number[] };
}

/**
 * Whole numbers for `parts` that add up to `total`, by largest remainder,
 * in proportion to the parts. All zero when the parts are.
 */
export function apportion(parts: number[], total: number): number[] {
  const sum = parts.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(sum > 0) || !(total > 0)) return parts.map(() => 0);
  const exact = parts.map((p) => (Math.max(0, p) * total) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** The brand as a shelf record keeps it. */
export function shelfBrand(brand: Brand): ShelfRecord["brand"] {
  return {
    reach: SEGMENTS.map((s) => Math.round(brand.reach[s.id] * 1000)),
    perception: SEGMENTS.map((s) => Math.round(brand.perception[s.id] * 10) / 10),
  };
}

/** Total units in a shelf entry. */
export function unitsOf(units: number[] | undefined): number {
  return units ? units.reduce((a, b) => a + b, 0) : 0;
}

/** A saved shelf record, or null when it is unreadable. */
export function shelfRecordOf(x: unknown): ShelfRecord | null {
  const r = x as Partial<ShelfRecord> | null;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const nums = (v: unknown): number[] | null => (Array.isArray(v) && v.every(num) ? v : null);
  if (!r || !r.quarter || !num(r.quarter.year) || !num(r.quarter.quarter) || !r.units || typeof r.units !== "object") return null;
  const units: Record<string, number[]> = {};
  for (const [id, v] of Object.entries(r.units)) {
    const a = nums(v);
    if (a) units[id] = a;
  }
  const own: Record<string, ShelfOwn> = {};
  if (r.own && typeof r.own === "object")
    for (const [id, v] of Object.entries(r.own)) {
      const o = v as Partial<ShelfOwn> | null;
      if (o && typeof o.name === "string" && num(o.price) && num(o.demand)) own[id] = { name: o.name, price: o.price, demand: o.demand };
    }
  const launched = Array.isArray(r.launched) ? r.launched.filter((s): s is string => typeof s === "string") : [];
  const reach = nums(r.brand?.reach) ?? [];
  const perception = nums(r.brand?.perception) ?? [];
  return { quarter: { year: r.quarter.year, quarter: r.quarter.quarter }, units, own, launched, brand: { reach, perception } };
}
