import { contentYear } from "./content/years";
import type { Axis, BuildPart, Mm, OptionValue, Part, Shape } from "./types";

// A pouch pack is sized by the player: length along the chassis width (x),
// depth (y) and thickness (z). Capacity is the cell volume times the era's
// energy density, capped at the 99.9 Wh flight limit. The Compact slider buys
// denser cells: at full spend the same volume holds 1 / 0.85 times the energy.
//
// Older saves chose a capacity and a Slim or Standard thickness instead. They
// load as the dimensions that hold that same capacity: the part's default depth,
// the keyed thickness, and the length that makes up the rest.

/** Airlines take packs up to 100 Wh; laptops stop just under. */
export const FLIGHT_WH = 99.9;

/** Energy density grows about 2 percent a year over a part's life. */
const DENSITY_GROWTH = 0.02;

export type PouchShape = Extract<Shape, { kind: "pouch" }>;

export interface Pouch {
  /** Cell size in mm, before any removable casing. */
  size: Record<Axis, Mm>;
  /** Capacity, capped at the flight limit. */
  wh: number;
  /** Capacity the cells would hold uncapped. */
  raw: number;
  /** Wh per litre after the Compact slider. */
  density: number;
}

export function pouchShape(part: Part | undefined): PouchShape | undefined {
  if (!part) return undefined;
  const s = Array.isArray(part.shape) ? part.shape[0] : part.shape;
  return s?.kind === "pouch" ? s : undefined;
}

/** Wh per litre in `year` at Compact spend `spend` (0 to 1). */
export function pouchDensity(part: Part, shape: PouchShape, year: number, spend: number): number {
  const years = Math.max(0, contentYear(year) - part.from);
  const f = 1 - 0.15 * Math.min(1, Math.max(0, spend));
  return (shape.whPerLitre * (1 + DENSITY_GROWTH) ** years) / f;
}

/** Capacity of cells of `size` mm: uncapped. */
export function pouchRawWh(size: Record<Axis, Mm>, density: number): number {
  return ((size.x * size.y * size.z) / 1e6) * density;
}

/** The option keys the player sets on a pouch. */
export const POUCH_KEYS: Record<Axis, string> = { x: "length", y: "depth", z: "thick" };

/** The pack as built: the player's dimensions, or an older save's capacity turned into them. */
export function pouchOf(part: Part, shape: PouchShape, bp: BuildPart | undefined, year: number, spend: number): Pouch {
  const density = pouchDensity(part, shape, year, spend);
  const o = bp?.opts ?? {};
  const num = (k: string) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  let size: Record<Axis, Mm>;
  const x = num(POUCH_KEYS.x);
  const y = num(POUCH_KEYS.y);
  const z = num(POUCH_KEYS.z);
  if (x !== undefined && y !== undefined && z !== undefined) {
    size = { x, y, z };
  } else {
    const keys = Object.keys(shape.thickness);
    const key = String(o.thickness ?? keys[0]);
    const t = shape.thickness[key] ?? shape.thickness[keys[0]];
    const wh = num("wh") ?? shape.wh;
    const d = shape.depth;
    size = { x: (wh * 1e6) / (density * d * t), y: d, z: t };
  }
  const raw = pouchRawWh(size, density);
  return { size, wh: Math.min(FLIGHT_WH, raw), raw, density };
}

/** The dimensions as option values, rounded to the slider steps. */
export function pouchOpts(size: Record<Axis, Mm>): Record<string, number> {
  return {
    [POUCH_KEYS.x]: Math.round(size.x),
    [POUCH_KEYS.y]: Math.round(size.y),
    [POUCH_KEYS.z]: Math.round(size.z * 10) / 10,
  };
}

/** Whether a pouch option is a positive dimension, an older save's capacity, or its thickness key. */
export function pouchOptionOk(shape: PouchShape, key: string, value: OptionValue): boolean {
  if (key === "thickness") return String(value) in shape.thickness;
  if (key === "wh" || Object.values(POUCH_KEYS).includes(key)) return Number(value) > 0;
  return false;
}
