import { faceAt } from "./grill";
import { bumperBlock, outerSection, perimInsets, perimSpan, perimZones, planDistance, ringCorner } from "./shell";
import type {
  Box,
  Build,
  Opening,
  OptionValue,
  ResolvedStyle,
  Size,
  SpeakerGrillFit,
  SpeakerPanel,
  SpeakerPattern,
  SpeakerPlace,
} from "./types";

// The speaker grill: where the sound leaves the shell. A mirrored pair of
// perforated panels, either on the deck beside the keyboard or, on older
// laptops, on the front wall between the top and bottom case. The holes are
// openings in the surface they sit on: the grill adds no material of its own.
// Stored on the speakers part's options; absent means the era's stock.

export const SPEAKER_PLACES: SpeakerPlace[] = ["none", "deck", "front"];
export const SPEAKER_PATTERNS: SpeakerPattern[] = ["dots", "slots", "bars", "hex"];
/** The last year a front-wall grill is offered. */
export const FRONT_UNTIL = 2012;
/** Each pattern's hole range before the era's least, mm. */
const PATTERN_RANGE: Record<SpeakerPattern, [number, number]> = {
  dots: [0.3, 2.5],
  slots: [0.6, 2.0],
  bars: [0.6, 2.0],
  hex: [1.0, 3.0],
};
const MARGIN = 0.4;
const END_GAP = 1.5;
const PORT_GAP = 2;
/** Deck panel off the deck's flat edge and off the keyboard, mm. */
const EDGE_GAP = 4;
const KEY_GAP = 4;
const DECK_MIN_W = 8;
const DECK_MAX_W = 34;
const DECK_MIN_L = 20;
/** Shortest front band that takes a grill, and the tallest grill, mm. */
const FRONT_MIN = 4;
const FRONT_MAX_H = 7;
/** A front panel keeps this far in from its end of the flat run, mm. */
const FRONT_IN = 6;
/** Step along the deck when finding where it stays flat, mm. */
const STEP = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const tenth = (v: number) => Math.round(v * 10) / 10;

/** Least hole and least web between holes by era: moulded early, machined finer later. */
function eraOf(year: number): { min: number; web: number } {
  if (year < 2011) return { min: 0.8, web: 0.8 };
  if (year < 2019) return { min: 0.5, web: 0.6 };
  return { min: 0.3, web: 0.4 };
}

export const speakerWeb = (hole: number, year: number) => Math.max(eraOf(year).web, 0.6 * hole);

/** What an untouched build gets. */
function stockOf(year: number): { prefer: SpeakerPlace[]; pattern: SpeakerPattern; hole: number } {
  if (year < 2011) return { prefer: ["front", "deck"], pattern: "slots", hole: 1.2 };
  if (year < 2019) return { prefer: ["deck"], pattern: "dots", hole: 1.0 };
  return { prefer: ["deck"], pattern: "dots", hole: 0.5 };
}

export interface SpeakerGrill {
  place?: SpeakerPlace;
  pattern?: SpeakerPattern;
  hole?: number;
}

/** The player's grill as stored; unset fields fall to the era's stock. */
export function speakerGrillOf(build: Build): SpeakerGrill {
  const o = build.parts.speakers?.[0]?.opts ?? {};
  const out: SpeakerGrill = {};
  if (SPEAKER_PLACES.includes(o.spkGrill as SpeakerPlace)) out.place = o.spkGrill as SpeakerPlace;
  if (SPEAKER_PATTERNS.includes(o.spkPattern as SpeakerPattern)) out.pattern = o.spkPattern as SpeakerPattern;
  if (typeof o.spkHole === "number" && Number.isFinite(o.spkHole)) out.hole = o.spkHole;
  return out;
}

/** The build with its speaker grill changed. */
export function withSpeakerGrill(build: Build, patch: SpeakerGrill): Build {
  const list = [...(build.parts.speakers ?? [])];
  const bp = list[0];
  if (!bp) return build;
  const g = { ...speakerGrillOf(build), ...patch };
  const { spkGrill: _p, spkPattern: _t, spkHole: _h, ...rest } = bp.opts ?? {};
  const opts: Record<string, OptionValue> = { ...rest };
  if (g.place) opts.spkGrill = g.place;
  if (g.pattern) opts.spkPattern = g.pattern;
  if (g.hole !== undefined) opts.spkHole = tenth(g.hole);
  list[0] = Object.keys(opts).length > 0 ? { ...bp, opts } : { part: bp.part };
  return { ...build, parts: { ...build.parts, speakers: list } };
}

/** Whether a speakers option is a grill setting in range. */
export function speakerGrillOptionOk(key: string, value: OptionValue): boolean {
  if (key === "spkGrill") return SPEAKER_PLACES.includes(value as SpeakerPlace);
  if (key === "spkPattern") return SPEAKER_PATTERNS.includes(value as SpeakerPattern);
  if (key === "spkHole") return typeof value === "number" && Number.isFinite(value) && value >= 0.3 && value <= 3;
  return false;
}

/** The grill's options, kept when the player swaps speaker parts. */
export function speakerGrillOpts(opts: Record<string, OptionValue> | undefined): Record<string, OptionValue> {
  const out: Record<string, OptionValue> = {};
  for (const k of ["spkGrill", "spkPattern", "spkHole"]) if (opts?.[k] !== undefined) out[k] = opts[k];
  return out;
}

/** Whether the deck's top at (x, y) is the flat deck: off the edge profile, a shelf, a spine or a lift. */
function deckFlat(style: ResolvedStyle, outer: Size, x: number, y: number, inset: number): boolean {
  const { x: X, y: Y, z: Z } = outer;
  if (planDistance(x, y, X, Y, style.corner, style.cornerKind === "chamfer") < inset) return false;
  if (style.pm) {
    const s = perimSpan(style, outer, x, y, 0);
    return !!s && s[1] >= Z - 0.02;
  }
  const s = outerSection(style, outer, y);
  return !!s && Math.abs(s[1] - (Z - style.q)) < 0.02;
}

/** The two deck panels beside the keyboard, or null where the gutter is too narrow. */
function deckPanels(style: ResolvedStyle, outer: Size, keys: Box | undefined): SpeakerPanel[] | null {
  if (!keys) return null;
  const X = outer.x;
  const topIn = style.pm ? perimZones(style.pm, style.pm.m.s).dT : style.profile;
  const gutter = Math.min(keys.at.x, X - keys.at.x - keys.size.x) - topIn - EDGE_GAP - KEY_GAP;
  const w = Math.min(gutter, DECK_MAX_W);
  if (w < DECK_MIN_W) return null;
  const cx = topIn + EDGE_GAP + gutter / 2;
  // From the keyboard's middle out to where either edge of either panel leaves the flat deck.
  const xs = [cx - w / 2, cx + w / 2, X - cx - w / 2, X - cx + w / 2];
  const inset = topIn + EDGE_GAP / 2;
  const flat = (y: number) => xs.every((x) => deckFlat(style, outer, x, y, inset));
  const mid = keys.at.y + keys.size.y / 2;
  if (!flat(mid)) return null;
  let y0 = mid;
  while (y0 - STEP >= keys.at.y && flat(y0 - STEP)) y0 -= STEP;
  let y1 = mid;
  while (y1 + STEP <= keys.at.y + keys.size.y && flat(y1 + STEP)) y1 += STEP;
  if (y1 - y0 < DECK_MIN_L) return null;
  const cy = (y0 + y1) / 2;
  return [cx, X - cx].map((x) => ({ surface: "deck", cx: x, cy, cz: outer.z, s: w, l: y1 - y0 }));
}

/** The two front-wall panels on its flat band, over the speakers where they sit near the front. */
function frontPanels(
  style: ResolvedStyle,
  outer: Size,
  spk: Box[],
  cutouts: Opening[],
): SpeakerPanel[] | null {
  const { x: X, y: Y } = outer;
  // The front's own flat band: the panels keep off the corners, where the side zones take over.
  const zf = style.pm ? perimZones(style.pm, style.pm.m.f) : null;
  const f: [number, number] | null = zf
    ? [zf.hB + MARGIN, outer.z - zf.hT - MARGIN]
    : faceAt(style, outer, "front", X / 2);
  if (!f || f[1] - f[0] < FRONT_MIN) return null;
  const h = Math.min(f[1] - f[0], FRONT_MAX_H);
  const mid = (f[0] + f[1]) / 2;
  const z: [number, number] = [mid - h / 2, mid + h / 2];
  // Clear of the plan corners and bumpers, and on a perimeter body of the corners its zones round.
  let lo = Math.max(style.corner, bumperBlock(style)) + END_GAP;
  let hi = X - lo;
  if (style.pm) {
    const pm = style.pm;
    for (let i = 0; i <= 8; i++) {
      const I = perimInsets(pm, outer.z, z[0] + ((z[1] - z[0]) * i) / 8);
      const k = (a: number, b: number) => ringCorner(style.corner, a, b, X, Y, I);
      lo = Math.max(lo, I.l + k(I.l, I.f) + END_GAP);
      hi = Math.min(hi, X - I.r - k(I.r, I.f) - END_GAP);
    }
  }
  const L = clamp(0.13 * X, 32, 52);
  // Over the speakers that sit in the front of the base, mirrored; else near each corner.
  const near = spk.filter((b) => b.at.y + b.size.y / 2 < Y / 3);
  const lefts = near.map((b) => b.at.x + b.size.x / 2).map((x) => (x < X / 2 ? x : X - x));
  let cx = lefts.length > 0 ? lefts.reduce((s, x) => s + x, 0) / lefts.length : lo + FRONT_IN + L / 2;
  cx = clamp(cx, lo + L / 2, X / 2 - 3 - L / 2);
  if (cx - L / 2 < lo - 1e-6) return null;
  const out: SpeakerPanel[] = [];
  for (const c of [cx, X - cx]) {
    let a = c - L / 2;
    let b = c + L / 2;
    // Off ports, bays and vents on the front, keeping the side nearer the panel's middle.
    for (const o of cutouts) {
      if (o.side !== "front" || o.z[1] < z[0] - PORT_GAP || o.z[0] > z[1] + PORT_GAP) continue;
      const u0 = o.u[0] - PORT_GAP;
      const u1 = o.u[1] + PORT_GAP;
      if (u1 <= a || u0 >= b) continue;
      if ((u0 + u1) / 2 < c) a = Math.max(a, u1);
      else b = Math.min(b, u0);
    }
    if (b - a < Math.min(12, 0.6 * L)) return null;
    out.push({ surface: "front", cx: (a + b) / 2, cy: 0, cz: mid, s: h, l: b - a });
  }
  return out;
}

/** The largest hole of a pattern that still fits two across `S`, and whether its least does. */
function rangeOf(pattern: SpeakerPattern, year: number, S: number): { min: number; max: number; ok: boolean } {
  const [pmin, pmax] = PATTERN_RANGE[pattern];
  const lo = tenth(Math.max(pmin, eraOf(year).min));
  const fits = (h: number) => 2 * h + 3 * speakerWeb(h, year) <= S + 1e-9;
  let hi = lo;
  for (let h = pmax; h >= lo - 1e-9; h -= 0.1)
    if (fits(h)) {
      hi = tenth(h);
      break;
    }
  return { min: lo, max: Math.max(lo, hi), ok: fits(lo) };
}

/** The speaker grill as solved: where it can go, the player's choice where it fits (else stock), and its panels. */
export function speakerGrillFit(
  build: Build,
  style: ResolvedStyle,
  outer: Size,
  boxes: Box[],
  cutouts: Opening[],
): SpeakerGrillFit | undefined {
  if (!build.parts.speakers?.[0]) return undefined;
  const year = build.year;
  const keys = boxes.find((b) => b.kind === "unit" && b.role === "keys");
  const spk = boxes.filter((b) => b.kind === "unit" && b.role === "spk");
  const frontOffered = year <= FRONT_UNTIL;
  const deck = deckPanels(style, outer, keys);
  const front = frontOffered ? frontPanels(style, outer, spk, cutouts) : null;
  const fits = { deck: !!deck, front: !!front };
  const want = speakerGrillOf(build);
  const stock = stockOf(year);
  const ok = (p: SpeakerPlace) => p === "none" || fits[p];
  const place: SpeakerPlace =
    want.place && ok(want.place) ? want.place : (stock.prefer.find((p) => ok(p)) ?? "none");
  const panels = (place === "deck" ? deck : place === "front" ? front : null) ?? [];
  const S = panels.length > 0 ? Math.min(...panels.map((p) => p.s)) : 0;
  const range = Object.fromEntries(SPEAKER_PATTERNS.map((p) => [p, rangeOf(p, year, S)])) as SpeakerGrillFit["range"];
  let pattern = want.pattern && range[want.pattern].ok ? want.pattern : stock.pattern;
  if (!range[pattern].ok) pattern = SPEAKER_PATTERNS.find((p) => range[p].ok) ?? stock.pattern;
  const r = range[pattern];
  const hole = tenth(clamp(want.hole ?? stock.hole, r.min, r.max));
  return {
    place,
    fits,
    frontOffered,
    pattern,
    hole,
    range,
    web: speakerWeb(hole, year),
    panels: range[pattern].ok ? panels : [],
  };
}

// ------------------------------------------------------------------ holes

export type Poly = [number, number][];

function circle(cs: number, cl: number, r: number, n: number): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cs + r * Math.cos(a), cl + r * Math.sin(a)]);
  }
  return out;
}

/** A stadium `len` long along s and `w` wide. */
function stadium(cs: number, cl: number, len: number, w: number, n = 6): Poly {
  const r = w / 2;
  const a = Math.max(0, len / 2 - r);
  const out: Poly = [];
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([cs + a + r * Math.cos(t), cl + r * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 + (i / n) * Math.PI;
    out.push([cs - a + r * Math.cos(t), cl + r * Math.sin(t)]);
  }
  return out;
}

/** A hexagon `f` across the flats, flats facing across s. */
function hexagon(cs: number, cl: number, f: number): Poly {
  const R = f / Math.sqrt(3);
  const out: Poly = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    out.push([cs + R * Math.cos(a), cl + R * Math.sin(a)]);
  }
  return out;
}

/**
 * Holes in a grill S across (s, its short side) by L along (l), centred on 0,
 * each a convex polygon, and the share of the grill they open.
 */
export function speakerHoles(
  pattern: SpeakerPattern,
  h: number,
  year: number,
  S: number,
  L: number,
): { polys: Poly[]; open: number } {
  const web = speakerWeb(h, year);
  const p = h + web;
  const polys: Poly[] = [];
  let area = 0;
  const sMax = S / 2 - web / 2;
  const lMax = L / 2 - web / 2;
  if (pattern === "dots" || pattern === "hex") {
    const dl = (p * Math.sqrt(3)) / 2;
    const extL = pattern === "hex" ? h / Math.sqrt(3) : h / 2;
    const rows = Math.max(0, Math.floor((2 * lMax - 2 * extL) / dl) + 1);
    const n = Math.max(0, Math.floor((2 * sMax - h) / p) + 1);
    const segs = h < 0.6 ? 6 : h < 0.9 ? 8 : h < 1.8 ? 10 : 14;
    for (let i = 0; i < rows; i++) {
      const l = -((rows - 1) * dl) / 2 + i * dl;
      // Rows alternate n and n - 1 holes, so the grid staggers and stays centred.
      const cols = i % 2 && n > 1 ? n - 1 : n;
      for (let j = 0; j < cols; j++) {
        const sc = -((cols - 1) * p) / 2 + j * p;
        if (pattern === "hex") {
          polys.push(hexagon(sc, l, h));
          area += (Math.sqrt(3) / 2) * h * h;
        } else {
          polys.push(circle(sc, l, h / 2, segs));
          area += (Math.PI / 4) * h * h;
        }
      }
    }
  } else if (pattern === "slots") {
    const len = Math.min(Math.max(3 * h, 2.4), 2 * sMax);
    const step = len + web;
    const rows = Math.max(0, Math.floor((2 * lMax - h) / p) + 1);
    const n = Math.max(0, Math.floor((2 * sMax - len) / step) + 1);
    for (let i = 0; i < rows; i++) {
      const l = -((rows - 1) * p) / 2 + i * p;
      const cols = i % 2 && n > 1 ? n - 1 : n;
      for (let j = 0; j < cols; j++) {
        const sc = -((cols - 1) * step) / 2 + j * step;
        polys.push(stadium(sc, l, len, h));
        area += h * (len - h) + (Math.PI / 4) * h * h;
      }
    }
  } else {
    const len = 2 * sMax;
    const rows = Math.max(0, Math.floor((2 * lMax - h) / p) + 1);
    for (let i = 0; i < rows; i++) {
      const l = -((rows - 1) * p) / 2 + i * p;
      polys.push(stadium(0, l, len, h, 8));
      area += h * (len - h) + (Math.PI / 4) * h * h;
    }
  }
  return { polys, open: S * L > 0 ? area / (S * L) : 0 };
}
