import { OPTICAL_WANT } from "../campaign/constants";
import { optionAvailable } from "../compat";
import { available, CONTENT, eraFor, panelsFor } from "../content";
import { offeredGenerationIds } from "../content/chips/gens";
import { activeArea } from "../content/display";
import { pouchDensity, pouchShape } from "../battery";
import { padLimits, padShapeOf } from "../pad";
import { type Budget, classify, costOf, type PerfClass, partPrice, weightOf } from "../price";
import {
  defaultScreen,
  gamutsFor,
  kindAvailable,
  maxNits,
  MIN_NITS,
  ppiOf,
  specOfPanel,
  standardResolutions,
} from "../screen";
import { simulate } from "../sim";
import { solve } from "../solve";
import type {
  Build,
  BuildPart,
  BuildPort,
  Fit,
  OptionValue,
  PanelOption,
  Part,
  Piece,
  Problem,
  QualityKey,
  ScreenKind,
  ScreenSpec,
  Side,
  Size,
} from "../types";
import { PIECES, QUALITY_KEYS } from "../types";
import { curveAt } from "./io";
import { logoMarks } from "./logos";
import { dress, type Look, lookFor } from "./looks";
import { linesIn, nameFor, priceFor, shapeFor } from "./makers";
import { modelName } from "./names";
import type { CpuVendor, HeadlineStat, Line, LineShape } from "./types";

// The rival generator (GDD, Version 0.2, "Rival generator"). For a line and a
// year it picks every part at a percentile of that year's options, driven by
// the line's class and priorities, then runs a cheap loop: solve, fix what does
// not fit (grow the chassis, shrink or drop a part, switch the layout or body),
// then check the build against its class (thin enough, fast enough) and swap
// one thing at a time toward it. It keeps the best valid build it saw.

export type Rng = () => number;

/** Mulberry32: small, fast and deterministic. */
export function rngOf(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the parts, for a per-model seed. */
export function hashOf(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Most solves one model may spend. */
export const MAX_SOLVES = 30;
/** Most simulations one model may spend on the class check. */
const MAX_SIMS = 4;
/** Wall-clock budget per model, ms: past it, the loop stops at the next step once it holds a valid build. */
export const MODEL_BUDGET_MS = 250;

export interface Generated {
  build: Build;
  /** Solves with no problems. */
  valid: boolean;
  /** The line's own picks never came out valid, so this is the plain safe build. */
  fallback: boolean;
  solves: number;
  sims: number;
  ms: number;
  /** Problems left on the returned build: empty when valid. */
  problems: Problem[];
  /** The line's price for the model, before any raise to cover its parts. */
  listPrice: number;
  /** The parts cost more than the line's price allows, so the price was raised. */
  repriced: boolean;
}

export interface GeneratedModel extends Generated {
  id: string;
  line: string;
  maker: string;
  name: string;
}

export interface GeneratedYear {
  year: number;
  seed: number;
  models: GeneratedModel[];
  solves: number;
  ms: number;
}

// ------------------------------------------------------------------ helpers

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The item at percentile p of a list sorted worst to best. */
function at<T>(list: T[], p: number): T {
  return list[Math.round(clamp01(p) * (list.length - 1))];
}

const firstShape = (p: Part) => (Array.isArray(p.shape) ? p.shape[0] : p.shape);

const partCache = new Map<string, Part[]>();
/** Parts of a category on sale in the year; rival-only parts (Apple silicon) only when asked. */
function partsIn(cat: Part["category"], year: number, rival: boolean): Part[] {
  const key = `${cat}|${year}|${rival}`;
  let hit = partCache.get(key);
  if (!hit) {
    hit = CONTENT.parts.filter((p) => p.category === cat && available(p, year) && (!p.rivalOnly || rival));
    partCache.set(key, hit);
  }
  return hit;
}

function partById(id: string): Part | undefined {
  return CONTENT.parts.find((p) => p.id === id);
}

function vendorOf(p: Part): CpuVendor | undefined {
  const v = p.provides?.find((t) => t.startsWith("platform:"))?.slice(9);
  return v as CpuVendor | undefined;
}

/** A chip's speed for ranking: geometric mean of its best multi-core point and its single-core score. */
function speedOf(p: Part): number {
  const pw = p.power;
  if (!pw) return 0;
  const multi = Math.max(...pw.points.map((x) => x.score));
  return Math.sqrt(multi * (pw.single ?? multi / 4));
}

/** Option values a part can take in the year, in the part's order, with their needs met. */
function optionValues(part: Part, key: string, year: number, provided: Set<string> = new Set()): OptionValue[] {
  return (part.options?.[key] ?? []).filter((v) => {
    if (!optionAvailable(part, key, v, year)) return false;
    const needs = part.optionNeeds?.[key]?.[String(v)] ?? [];
    return needs.every((n) => provided.has(n));
  });
}

function numericAt(values: OptionValue[], p: number): OptionValue | undefined {
  if (values.length === 0) return undefined;
  return at([...values].sort((a, b) => Number(a) - Number(b)), p);
}

// ------------------------------------------------------------------ persona

interface Persona {
  budget: Budget;
  thin: boolean;
  large: boolean;
  perf: PerfClass;
  gaming: boolean;
  /** Keyboard, battery and ports first: ThinkPad, Latitude, EliteBook, Portege. */
  business: boolean;
  apple: boolean;
  /** May use Apple silicon (rival-only parts). */
  silicon: boolean;
}

interface Ctx {
  line: Line;
  year: number;
  shape: LineShape;
  who: Persona;
  rng: Rng;
  /** The model's place in the line's range, 0 (base) to 1 (top). */
  pos: number;
  /** Part percentile before priorities: class base plus the model's place. */
  trim: number;
  vendor: CpuVendor;
  /** Escalation counters, one per kind of fix. */
  step: Record<string, number>;
  /** Scales the processor and graphics power window down on thin fixes. */
  powerScale: number;
  /** Percentile cuts per pick, taken to fit the parts budget. */
  cut: Record<string, number>;
  /** Shrinks that stick once a fix has taken them, so a later pick does not undo them. */
  batteryShrink: number;
  smallStorage: boolean;
  lighter: boolean;
  /** Picks the budget fit leaves alone: what a class fix just paid for. */
  protect: Set<string>;
  /** Actual cost over the estimate, last seen: the estimate lays the parts in a rough shell. */
  costBias: number;
  /** The line's design language for the year. */
  look: Look;
  /** The panel was already grown once to fill the lid. */
  filled?: boolean;
}

const BASE: Record<Budget, number> = { low: 0.2, midrange: 0.5, premium: 0.78 };
const MEAN_WEIGHT = 1 / 12;

/** Percentile for a part that serves a headline stat. */
function pct(ctx: Ctx, stat: HeadlineStat, shift = 0, key?: string): number {
  return clamp01(ctx.trim + (ctx.line.priorities[stat] - MEAN_WEIGHT) * 1.5 + shift - (key ? (ctx.cut[key] ?? 0) : 0));
}

function personaOf(line: Line, shape: LineShape, year: number): Persona {
  const w = line.priorities;
  return {
    budget: shape.class.budget,
    thin: shape.class.body === "thin and light",
    large: shape.class.body === "large",
    perf: shape.class.performance,
    gaming: shape.class.performance === "gaming",
    business: w.keyboard >= 0.13 && w.connectivity >= 0.08,
    apple: line.maker === "apple",
    silicon: line.rivalOnlyFrom !== undefined && year >= line.rivalOnlyFrom,
  };
}

// ------------------------------------------------------------------ choices

/** Everything the generator picked; assembled into a Build for each solve. */
interface Choices {
  body: string;
  layout: string;
  cpu: Part;
  gpu?: Part;
  memory: BuildPart;
  storage: BuildPart[];
  screen: ScreenSpec;
  battery: BuildPart;
  cooling: BuildPart;
  optical?: BuildPart;
  wireless: BuildPart;
  keyboard: BuildPart;
  trackpad: BuildPart;
  webcam?: BuildPart;
  speakers?: BuildPart;
  ports: BuildPort[];
  materials: Record<Piece, string>;
  finish: Build["finish"];
  spend: Build["spend"];
  quality: NonNullable<Build["quality"]>;
  pad?: { w: number; d: number };
  /** Keyboard moved back over the strip behind it, mm. */
  kbBack?: number;
  price: number;
  /** Room left over the minimum, mm. */
  slack: Size;
  /** The body's signature slider, 0 to 1: lower is a smaller edge profile, which leaves more flat wall for the ports. */
  sig: number;
}

function assemble(ctx: Ctx, c: Choices, size: Size): Build {
  const parts: Build["parts"] = {
    processor: [{ part: c.cpu.id }],
    memory: [c.memory],
    storage: c.storage,
    battery: [c.battery],
    cooling: [c.cooling],
    wireless: [c.wireless],
    keyboard: [c.keyboard],
    trackpad: [c.trackpad],
  };
  if (c.gpu) parts.graphics = [{ part: c.gpu.id }];
  if (c.optical) parts.optical = [c.optical];
  if (c.webcam) parts.webcam = [c.webcam];
  if (c.speakers) parts.speakers = [c.speakers];
  return {
    year: ctx.year,
    body: c.body,
    layout: c.layout,
    size,
    parts,
    ports: c.ports,
    materials: c.materials,
    finish: c.finish,
    spend: c.spend,
    quality: c.quality,
    price: c.price,
    screen: c.screen,
    shape: { [c.body]: c.sig },
    ...(c.pad || c.kbBack ? { place: { ...(c.pad ? { pad: { w: c.pad.w, d: c.pad.d } } : {}), ...(c.kbBack ? { kb: { y: -c.kbBack } } : {}) } } : {}),
  };
}

// ------------------------------------------------------------------ body and layout

function bodiesFor(ctx: Ctx): string[] {
  const list = ctx.shape.bodies.filter((id) => {
    const b = CONTENT.bodies.find((x) => x.id === id);
    return b && available(b, ctx.year);
  });
  return list.length > 0 ? list : ["workhorse"];
}

function layoutsFor(ctx: Ctx, body: string, c: Partial<Choices>): string[] {
  const b = CONTENT.bodies.find((x) => x.id === body);
  const ok = (b?.layouts ?? ["a"]).filter((id) => {
    const l = CONTENT.layouts.find((x) => x.id === id);
    return l && available(l, ctx.year);
  });
  const cells = c.battery && firstShape(partById(c.battery.part) as Part).kind === "cells";
  const pref = ctx.who.large && c.optical && ctx.year < 2014 ? ["c", "b", "a", "d"] : cells ? ["b", "c", "a", "d"] : ["a", "b", "c", "d"];
  return pref.filter((id) => ok.includes(id));
}

// ------------------------------------------------------------------ processor, graphics, memory

/** Rated power window for the processor, W. */
function cpuWindow(ctx: Ctx): [number, number] {
  const w = ctx.who;
  const s = ctx.powerScale;
  if (w.thin) return w.perf === "office" ? [0, (ctx.year < 2011 ? 25 : 28) * s] : [0, 45 * s];
  if (w.gaming || w.large) return [(ctx.year < 2011 ? 30 : 42) * s, 250];
  if (w.perf === "mixed-use") return [15 * s, 47 * s];
  return [8, 35 * s];
}

function pickCpu(ctx: Ctx, shift = 0): Part {
  const year = ctx.year;
  const gens = offeredGenerationIds(year);
  // Only chips some memory of the year fits: a platform may be listed before its memory.
  const all = partsIn("processor", year, ctx.who.silicon).filter((p) => memoryFor(p, year, ctx.who.silicon).length > 0);
  const fresh = (p: Part) => !p.gen || gens.has(p.gen);
  let list = all.filter((p) => vendorOf(p) === ctx.vendor && fresh(p));
  if (list.length === 0) list = all.filter((p) => vendorOf(p) === ctx.vendor);
  if (list.length === 0) list = all.filter((p) => !p.rivalOnly && fresh(p));
  if (list.length === 0) list = all;
  const [lo, hi] = cpuWindow(ctx);
  const inWindow = list.filter((p) => (p.power?.rated ?? 0) >= lo && (p.power?.rated ?? 0) <= hi);
  if (inWindow.length > 0) list = inWindow;
  list = [...list].sort((a, b) => speedOf(a) - speedOf(b) || a.id.localeCompare(b.id));
  return at(list, pct(ctx, "app", shift, "cpu"));
}

function gpuWindow(ctx: Ctx): number {
  const w = ctx.who;
  if (w.thin) return (w.gaming ? 110 : 35) * ctx.powerScale;
  if (w.gaming || w.large) return 250;
  return 60 * ctx.powerScale;
}

function wantsGpu(ctx: Ctx, cpu: Part): boolean {
  if (!cpu.provides?.includes("dgpu")) return false;
  if (ctx.who.gaming) return true;
  if (ctx.who.perf === "mixed-use") return ctx.rng() < 0.55 + ctx.line.priorities.games * 3;
  return ctx.line.priorities.games >= 0.03 && ctx.rng() < 0.25;
}

/** Graphics the processor and the line's power window take, slowest first. */
function gpusFor(ctx: Ctx, cpu: Part): Part[] {
  if (!cpu.provides?.includes("dgpu")) return [];
  const gens = offeredGenerationIds(ctx.year);
  const all = partsIn("graphics", ctx.year, false);
  let list = all.filter((p) => !p.gen || gens.has(p.gen));
  if (list.length === 0) list = all;
  const hi = gpuWindow(ctx);
  const inWindow = list.filter((p) => (p.power?.rated ?? 0) <= hi);
  if (inWindow.length > 0) list = inWindow;
  return [...list].sort((a, b) => speedOf(a) - speedOf(b) || a.id.localeCompare(b.id));
}

function pickGpu(ctx: Ctx, cpu: Part, shift = 0): Part | undefined {
  const list = gpusFor(ctx, cpu);
  if (list.length === 0) return undefined;
  // Gaming lines spread over the whole range by their place in it; others buy a modest part.
  const g = ctx.line.priorities.games;
  const p = ctx.who.gaming ? ctx.trim + (g - 0.3) * 2 : ctx.trim - 0.3 + g * 2;
  return at(list, clamp01(p + shift - (ctx.cut.gpu ?? 0)));
}

const memoryCache = new Map<string, Part[]>();
/** Memory of the year the processor takes. */
function memoryFor(cpu: Part, year: number, rival: boolean): Part[] {
  const key = `${cpu.id}|${year}|${rival}`;
  let hit = memoryCache.get(key);
  if (!hit) {
    const provided = new Set(cpu.provides ?? []);
    hit = partsIn("memory", year, rival).filter((p) => (p.needs ?? []).every((n) => provided.has(n)));
    memoryCache.set(key, hit);
  }
  return hit;
}

function pickMemory(ctx: Ctx, cpu: Part): BuildPart {
  const provided = new Set(cpu.provides ?? []);
  const fits = memoryFor(cpu, ctx.year, ctx.who.silicon);
  // Soldered memory on thin lines where the platform takes it; the newest kind otherwise.
  const soldered = (p: Part) => {
    const s = firstShape(p);
    return s.kind === "none" || (s.kind === "block" && !s.stack);
  };
  let list = fits;
  if (ctx.who.thin && list.some(soldered)) list = list.filter(soldered);
  else if (!ctx.who.thin && list.some((p) => !soldered(p))) list = list.filter((p) => !soldered(p));
  list = [...list].sort((a, b) => b.from - a.from || a.id.localeCompare(b.id));
  const cut = ctx.cut.memory ?? 0;
  const build = (part: Part): BuildPart => {
    const opts: Record<string, OptionValue> = {};
    const cap = numericAt(optionValues(part, "capacity", ctx.year, provided), pct(ctx, "app", -0.1, "memory") * 0.9);
    if (cap !== undefined) opts.capacity = cap;
    const slots = optionValues(part, "slots", ctx.year);
    // A tight budget fills one slot.
    if (slots.length > 0) opts.slots = (ctx.who.thin || cut >= 0.9) && slots.includes(1) ? 1 : slots.includes(2) ? 2 : slots[0];
    return Object.keys(opts).length > 0 ? { part: part.id, opts } : { part: part.id };
  };
  // A tight budget buys the cheapest kind the platform takes rather than the newest.
  if (cut >= 0.6 && list.length > 1) {
    const priced = list.filter((p) => p.id !== "lpddr5x-on-package").map((p) => ({ bp: build(p), usd: partPrice("memory", build(p), ctx.year) }));
    if (priced.length > 0) return priced.reduce((a, b) => (b.usd < a.usd ? b : a)).bp;
  }
  return build(list[0] ?? fits[0] ?? partsIn("memory", ctx.year, false)[0]);
}

/** A new processor, with memory and graphics that go with it. */
function setCpu(ctx: Ctx, c: Choices, cpu: Part, gpuShift = 0): void {
  c.cpu = cpu;
  c.memory = pickMemory(ctx, cpu);
  if (!cpu.provides?.includes("dgpu")) c.gpu = undefined;
  else if (c.gpu) c.gpu = pickGpu(ctx, cpu, gpuShift);
  c.cooling = pickCooling(ctx, c.cpu, c.gpu);
  if (c.ports.length > 0) c.ports = fixPlatformPorts(c.ports, cpu, ctx.year);
}

// ------------------------------------------------------------------ storage

function storageRank(p: Part): number {
  const id = p.id;
  const kind = id.startsWith("hdd")
    ? 0
    : id.startsWith("ssd")
      ? 1
      : id.startsWith("msata") || id === "m2-2280-sata"
        ? 2
        : id.endsWith("g3")
          ? 3
          : id.endsWith("g4")
            ? 4
            : 5;
  return kind * 100 + (p.from - 2000);
}

const bayDrive = (p: Part) => {
  const s = firstShape(p);
  return s.kind === "box" && s.units.some((u) => u.size.z >= 7);
};

function pickStorage(ctx: Ctx, small = false, count?: number): BuildPart[] {
  if (small) ctx.smallStorage = true;
  small = ctx.smallStorage;
  let list = partsIn("storage", ctx.year, false);
  if ((ctx.who.thin || small) && list.some((p) => !bayDrive(p))) list = list.filter((p) => !bayDrive(p));
  // One in ten of every gen: the smallest M.2 cards are for tablets and handhelds.
  if (list.some((p) => p.id !== "m2-2230-g4" && p.id !== "m2-2242-g4"))
    list = list.filter((p) => p.id !== "m2-2230-g4" && p.id !== "m2-2242-g4");
  list = [...list].sort((a, b) => storageRank(a) - storageRank(b) || a.id.localeCompare(b.id));
  const part = at(list, pct(ctx, "app", -0.05, "storage"));
  const cap = numericAt(optionValues(part, "capacity", ctx.year), pct(ctx, "app", -0.15, "storage"));
  const one: BuildPart = cap !== undefined ? { part: part.id, opts: { capacity: cap } } : { part: part.id };
  const two = count !== undefined ? count > 1 && !small : ctx.who.large && !small && ctx.rng() < 0.4;
  return two ? [one, { ...one }] : [one];
}

// ------------------------------------------------------------------ screen

const GAMUT_RANK: Record<string, number> = { "45% sRGB": 0, "60% sRGB": 1, "100% sRGB": 2, "100% DCI-P3": 3 };

function kindOf(p: PanelOption): ScreenKind {
  if (p.type.startsWith("tn")) return "tn";
  if (p.type.startsWith("ips")) return "ips";
  return p.type as ScreenKind;
}

function panelScore(p: PanelOption): number {
  const kind = kindOf(p);
  const bonus = kind === "oled" ? 1.4 : kind === "mini-led" ? 1.3 : kind === "ips" ? 1.15 : 1;
  return ppiOf(p.inches, p.res) * Math.sqrt(p.nits) * (1 + (GAMUT_RANK[p.gamut] ?? 0) * 0.3) * bonus * (1 + Math.max(...p.refresh) / 600);
}

function pickScreen(ctx: Ctx, towardSmall = false, keep?: number): ScreenSpec {
  const [lo, hi] = ctx.shape.screen;
  const year = ctx.year;
  const rows = panelsFor(year).filter((p) => p.inches >= lo - 0.06 && p.inches <= hi + 0.06 && kindAvailable(kindOf(p), year));
  const sizes = [...new Set(rows.map((p) => p.inches))].sort((a, b) => a - b);
  const pd = pct(ctx, "display", 0, "screen");
  let spec: ScreenSpec;
  let rowNits: number | undefined;
  let rowGamut: string | undefined;
  if (sizes.length > 0) {
    // Thin lines lean small, large and gaming lines lean big.
    const lean = towardSmall ? 0 : ctx.who.thin ? 0.3 : ctx.who.large || ctx.who.gaming ? 0.75 : 0.5;
    const diag =
      keep !== undefined
        ? sizes.reduce((a, b) => (Math.abs(b - keep) < Math.abs(a - keep) ? b : a))
        : at(sizes, clamp01(lean + (ctx.rng() - 0.5) * 0.7));
    const same = rows.filter((p) => p.inches === diag).sort((a, b) => panelScore(a) - panelScore(b) || a.id.localeCompare(b.id));
    const row = at(same, pd);
    const rates = [...row.refresh].sort((a, b) => a - b);
    const hz = ctx.who.gaming ? rates[rates.length - 1] : at(rates, pd - 0.3);
    spec = specOfPanel(row, hz, year);
    rowNits = row.nits;
    rowGamut = row.gamut;
  } else {
    // No panel sold in the line's range that year: a custom one at the nearest size the line used.
    const base = defaultScreen(year);
    const diag = keep ?? Math.round((towardSmall ? lo : lerp(lo, hi, ctx.rng())) * 10) / 10;
    const kind = base.panel;
    const res = standardResolutions(base.ratio, diag, year, kind);
    spec = { ...base, diag, res: res.length > 0 ? at(res, pd) : base.res };
  }
  // Brightness and gamut past the panel's own on displays the line cares about.
  const kind = spec.panel;
  const ceiling = maxNits(year, kind);
  const stock = clamp(rowNits ?? ceiling * 0.6, MIN_NITS, ceiling);
  const nits = Math.round(clamp(lerp(stock * 0.9, ceiling, clamp01((pd - 0.45) * 1.6)), MIN_NITS, ceiling) / 10) * 10;
  const tiers = gamutsFor(year, kind);
  const stockTier = rowGamut && tiers.includes(rowGamut) ? tiers.indexOf(rowGamut) : 0;
  const gamut = tiers[clamp(stockTier + (pd > 0.75 ? 1 : 0), 0, tiers.length - 1)];
  // Premium lines run the era's thinnest bezel; cheaper ones a little more.
  const bezel = spec.bezel + BEZEL_TIER[ctx.who.budget];
  return { ...spec, bezel, nits, ...(gamut ? { gamut } : {}) };
}

const BEZEL_TIER: Record<Budget, number> = { premium: 0, midrange: 1, low: 2 };

/**
 * A bigger panel in the line's range when the lid has room for it: the chassis
 * is sized by what sits in the base, and a panel far smaller than its lid
 * shows as a giant bezel.
 */
function fillDiag(ctx: Ctx, build: Build): number | undefined {
  const [lo, hi] = ctx.shape.screen;
  const screen = build.screen;
  if (!screen) return undefined;
  const era = eraFor(ctx.year).bezel;
  const room = build.size.y - era.top - era.chin - 6;
  const sizes = [...new Set(panelsFor(ctx.year).filter((p) => p.inches >= lo - 0.06 && p.inches <= hi + 0.06 && kindAvailable(kindOf(p), ctx.year)).map((p) => p.inches))];
  const fits = sizes.filter((d) => d > screen.diag && activeArea({ inches: d, aspect: screen.ratio } as PanelOption).y <= room);
  return fits.length > 0 ? Math.max(...fits) : undefined;
}

// ------------------------------------------------------------------ battery and cooling

function activeWidth(s: ScreenSpec): number {
  return activeArea({ inches: s.diag, aspect: s.ratio } as PanelOption).x;
}

function pickBattery(ctx: Ctx, screen: ScreenSpec, shrink = 0, flat = false, cap = Number.POSITIVE_INFINITY): BuildPart {
  const year = ctx.year;
  shrink = Math.max(shrink, ctx.batteryShrink);
  ctx.batteryShrink = shrink;
  const list = partsIn("battery", year, false);
  const cells = list.find((p) => firstShape(p).kind === "cells");
  const pouches = list.filter((p) => firstShape(p).kind === "pouch").sort((a, b) => b.from - a.from);
  const pb = clamp01(pct(ctx, "battery", 0, "battery") - shrink);
  const useCells = cells && !(flat && pouches.length > 0) && (pouches.length === 0 || (!ctx.who.thin && (year < 2010 || (year < 2013 && ctx.pos < 0.5))));
  if (useCells) {
    const counts = optionValues(cells, "cells", year);
    const pick = numericAt(counts, ctx.who.large ? pb + 0.2 : ctx.who.thin ? pb - 0.3 : pb) ?? 6;
    return { part: cells.id, opts: { cells: pick } };
  }
  const part = pouches[0] ?? list[0];
  const shape = pouchShape(part);
  if (!shape) return { part: part.id };
  const density = pouchDensity(part, shape, year, clamp01(ctx.who.thin ? 0.5 : 0));
  // Capacity grows with the panel and the class: about 35 to 60 Wh at 13 inch, up to the flight limit on big machines.
  const size = clamp((screen.diag - 11) / 7, 0, 1);
  const lo = 30 + size * 15;
  const hi = Math.min(99, 55 + size * 40 + (ctx.who.gaming ? 10 : 0));
  const wh = lerp(lo, hi, pb) * (1 - shrink * 0.5);
  const keys = Object.keys(shape.thickness);
  // Flat packs take the thickest cells the part offers, for the least depth.
  const thick = flat ? Math.max(...Object.values(shape.thickness)) : ctx.who.thin || shrink > 0 ? (shape.thickness.slim ?? shape.thickness[keys[0]]) : shape.thickness[keys[0]];
  const maxLen = Math.max(shape.limits.x[0], Math.min(shape.limits.x[1], activeWidth(screen) * 0.85, cap));
  let depth = shape.depth;
  let length = (wh * 1e6) / (density * depth * thick);
  // Flat: the full width the panel allows, so the pack takes the least depth.
  if (flat || length > maxLen) {
    depth = clamp((wh * 1e6) / (density * maxLen * thick), shape.limits.y[0], shape.limits.y[1]);
    length = (wh * 1e6) / (density * depth * thick);
  }
  length = clamp(length, shape.limits.x[0], maxLen);
  return {
    part: part.id,
    opts: {
      length: Math.round(length),
      depth: Math.round(clamp(depth, shape.limits.y[0], shape.limits.y[1])),
      thick: Math.round(clamp(thick, shape.limits.z[0], shape.limits.z[1]) * 10) / 10,
    },
  };
}

const COOLERS = ["fanless", "one-fan", "two-fans", "vapour-chamber"];

function pickCooling(ctx: Ctx, cpu: Part, gpu: Part | undefined, bump = 0): BuildPart {
  const watts = (cpu.power?.rated ?? 15) + (gpu?.power?.rated ?? 0);
  let i = watts <= 12 && ctx.who.thin && !gpu ? 0 : watts <= 36 && !gpu ? 1 : 2;
  if (ctx.who.gaming && ctx.who.budget === "premium" && watts >= 140) i = 3;
  if (ctx.line.priorities.thermals >= 0.08 && i === 1) i = 2;
  i += bump;
  const ok = COOLERS.filter((id) => partsIn("cooling", ctx.year, false).some((p) => p.id === id));
  const id = ok.includes(COOLERS[clamp(i, 0, 3)]) ? COOLERS[clamp(i, 0, 3)] : ok[Math.min(clamp(i, 0, 3), ok.length - 1)];
  // Apple hides its exhaust in the hinge: no grill on any wall, the air leaving through the seams.
  return ctx.who.apple && id !== "fanless" ? { part: id, opts: { grill: "none" } } : { part: id };
}

// ------------------------------------------------------------------ peripherals

function travelOf(p: Part): number {
  const m = /(\d+(?:\.\d+)?)$/.exec(p.id);
  return m ? Number(m[1]) : 2;
}

function pickKeyboard(ctx: Ctx, screen: ScreenSpec, flattest = false): BuildPart {
  const w = ctx.line.priorities;
  let list = partsIn("keyboard", ctx.year, false);
  const mech = (p: Part) => p.id.includes("mech");
  const wantMech = ctx.who.gaming && ctx.who.budget === "premium" && ctx.rng() < 0.35;
  if (list.some((p) => mech(p) === wantMech)) list = list.filter((p) => mech(p) === wantMech);
  list = [...list].sort((a, b) => travelOf(a) - travelOf(b) || a.id.localeCompare(b.id));
  const pk = flattest ? 0 : clamp01(0.45 + (w.keyboard - w.portability) * 3 + (ctx.rng() - 0.5) * 0.3);
  const part = at(list, pk);
  const opts: Record<string, OptionValue> = {};
  const cols = optionValues(part, "cols", ctx.year);
  if (cols.length > 0) opts.cols = screen.diag >= 15.5 && !ctx.who.thin && cols.includes(19) ? 19 : cols.includes(15) ? 15 : cols[0];
  const lights = optionValues(part, "light", ctx.year);
  if (lights.length > 0) {
    const rgb = lights.filter((l) => String(l).startsWith("rgb"));
    const plain = lights.filter((l) => !String(l).startsWith("rgb") && l !== "none");
    const light =
      ctx.who.gaming && rgb.length > 0
        ? at(rgb, ctx.trim)
        : ctx.trim >= 0.45 && plain.length > 0
          ? plain[plain.length - 1]
          : lights.includes("none")
            ? "none"
            : lights[0];
    opts.light = light;
  }
  return Object.keys(opts).length > 0 ? { part: part.id, opts } : { part: part.id };
}

const MECH_RANK = (p: Part) => {
  const s = padShapeOf(p);
  return s?.mechanism === "haptic" ? 2 : s?.buttons ? 0 : 1;
};

function pickTrackpad(ctx: Ctx): { bp: BuildPart; pad?: { w: number; d: number } } {
  const w = ctx.line.priorities;
  const list = [...partsIn("trackpad", ctx.year, false)].sort((a, b) => MECH_RANK(a) - MECH_RANK(b) || a.id.localeCompare(b.id));
  const pt = pct(ctx, "trackpad");
  // Business lines kept separate buttons for the pointing stick longest.
  const part = ctx.who.business && ctx.year < 2013 ? list[0] : at(list, pt);
  const opts: Record<string, OptionValue> = {};
  const surfaces = optionValues(part, "surface", ctx.year);
  if (surfaces.length > 0) opts.surface = surfaces.includes("glass") && (pt >= 0.45 || ctx.who.budget === "premium") ? "glass" : surfaces[0];
  const stick = optionValues(part, "stick", ctx.year);
  if (stick.includes("yes") && ctx.who.business && w.keyboard >= 0.14) opts.stick = "yes";
  const bp: BuildPart = Object.keys(opts).length > 0 ? { part: part.id, opts } : { part: part.id };
  const shape = padShapeOf(part);
  if (!shape) return { bp };
  const lim = padLimits(ctx.year);
  const f = 0.85 + 0.45 * pt;
  return {
    bp,
    pad: {
      w: Math.round(clamp(shape.x * f, lim.w[0], lim.w[1])),
      d: Math.round(clamp(shape.y * Math.min(f, 1.15), lim.d[0], lim.d[1])),
    },
  };
}

function unitVolume(p: Part): number {
  const s = firstShape(p);
  if (s.kind !== "box") return 0;
  return s.units.reduce((sum, u) => sum + u.size.x * u.size.y * u.size.z * (u.count ?? 1), 0);
}

function pickWebcam(ctx: Ctx, smaller = 0): BuildPart | undefined {
  if (ctx.year < 2008 && ctx.rng() > 0.3 + ctx.pos * 0.5) return undefined;
  let list = [...partsIn("webcam", ctx.year, false)].sort((a, b) => a.from - b.from || unitVolume(a) - unitVolume(b));
  if (smaller > 0) list = [...list].sort((a, b) => unitVolume(a) - unitVolume(b)).slice(0, Math.max(1, list.length - smaller));
  if (list.length === 0) return undefined;
  const part = at(list, smaller > 0 ? 0 : ctx.trim + (ctx.who.business ? 0.15 : 0));
  const shutter = optionValues(part, "shutter", ctx.year);
  return shutter.includes("yes") && ctx.who.business && ctx.year >= 2018 ? { part: part.id, opts: { shutter: "yes" } } : { part: part.id };
}

function pickSpeakers(ctx: Ctx, smallest = false): BuildPart | undefined {
  let list = [...partsIn("speakers", ctx.year, false)].sort((a, b) => unitVolume(a) - unitVolume(b) || a.id.localeCompare(b.id));
  const tall = (p: Part) => {
    const s = firstShape(p);
    return s.kind === "box" && s.units.some((u) => u.size.z > 6);
  };
  if (ctx.who.thin && list.some((p) => !tall(p))) list = list.filter((p) => !tall(p));
  if (list.length === 0) return undefined;
  return { part: at(list, smallest ? 0 : pct(ctx, "audio")).id };
}

function pickWireless(ctx: Ctx): BuildPart {
  const list = [...partsIn("wireless", ctx.year, false)].sort((a, b) => a.from - b.from || a.id.localeCompare(b.id));
  const part = at(list, pct(ctx, "connectivity", 0.1));
  const bt = optionValues(part, "bluetooth", ctx.year);
  return bt.length > 1 && ctx.trim >= 0.4 ? { part: part.id, opts: { bluetooth: bt[bt.length - 1] } } : { part: part.id };
}

/** Share of the year's non-thin lines that kept an optical drive: nearly all to 2011, fading out by 2017. A premium line drops it sooner. */
const OPTICAL_KEPT: [year: number, share: number][] = [
  [2011, 1],
  [2012, 0.85],
  [2013, 0.65],
  [2014, 0.45],
  [2015, 0.25],
  [2016, 0.1],
  [2017, 0],
];

/** Buyers still want a drive, so a fix keeps it until nothing else is left. */
function opticalWanted(ctx: Ctx): boolean {
  return curveAt(OPTICAL_WANT, ctx.year) > 0.1;
}

function pickOptical(ctx: Ctx): BuildPart | undefined {
  if (ctx.who.thin) return undefined;
  const y = ctx.year;
  const keep = curveAt(OPTICAL_KEPT, y) * (ctx.who.budget === "premium" ? 0.5 : 1);
  if (ctx.rng() >= keep) return undefined;
  const rank = (p: Part) => (p.id.startsWith("bd") || p.id.startsWith("hd") ? 2 : p.id.startsWith("combo") ? 0 : 1);
  const list = [...partsIn("optical", y, false)].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  if (list.length === 0) return undefined;
  return { part: at(list, ctx.trim).id };
}

// ------------------------------------------------------------------ ports

const PORT_DROP_ORDER = ["modem-rj11", "firewire-400", "pc-card", "lock-slot", "expresscard-54", "expresscard-34", "s-video", "dvi-d", "vga"];

function portOn(id: string, year: number): boolean {
  const p = partById(id);
  return !!p && p.category === "port" && available(p, year);
}

/** Thunderbolt needs an Intel platform: anything else gets USB4 or USB-C in its place. */
function fixPlatformPorts(ports: BuildPort[], cpu: Part, year: number): BuildPort[] {
  if (vendorOf(cpu) === "intel") return ports;
  return ports.map((p) =>
    p.part.startsWith("thunderbolt")
      ? { ...p, part: portOn("usb4-40g", year) ? "usb4-40g" : portOn("usb-c-10g", year) ? "usb-c-10g" : "usb-a-5g" }
      : p,
  );
}

function pickPorts(ctx: Ctx, layout: string, cpu: Part): BuildPort[] {
  const y = ctx.year;
  const who = ctx.who;
  const sides = CONTENT.layouts.find((l) => l.id === layout)?.portSides ?? ["left", "right"];
  const rear = sides.includes("rear");
  const front = sides.includes("front");
  const has = (id: string) => portOn(id, y);
  const first = (...ids: string[]) => ids.find(has);
  const intel = vendorOf(cpu) === "intel";
  const conn = ctx.line.priorities.connectivity;
  const out: [string, "power" | "video" | "net" | "usb" | "usbc" | "cards" | "audio" | "other"][] = [];

  const usbCOnly = who.thin && y >= 2016 && (who.apple ? y < 2021 : ctx.rng() < 0.5);
  if (!usbCOnly) out.push(["dc-jack", "power"]);

  // USB-C and Thunderbolt.
  if (y >= 2011 && who.apple && y < 2016) {
    const tb = first(y >= 2013 ? "thunderbolt-2" : "thunderbolt-1", "thunderbolt-1", "mini-dp");
    if (tb) out.push([tb, "video"]);
  }
  if (y >= 2015) {
    const n = who.thin ? 2 : who.budget === "premium" ? 2 : 1;
    const fast = who.budget !== "low" || ctx.pos > 0.6;
    const id = intel && fast
      ? first(y >= 2024 && who.gaming && who.budget === "premium" ? "thunderbolt-5" : "", "thunderbolt-4", "thunderbolt-3", "usb-c-10g", "usb-c-5g")
      : first(fast ? "usb4-40g" : "", "usb-c-10g", "usb-c-5g");
    if (id) for (let i = 0; i < (usbCOnly ? Math.max(2, n) : n); i++) out.push([id, "usbc"]);
  }
  if (usbCOnly && !out.some(([id]) => partById(id) && (firstShape(partById(id) as Part) as { charges?: boolean }).charges))
    out.unshift(["dc-jack", "power"]);

  // USB-A.
  const usbA = who.apple && !who.thin && y < 2016 ? 2 : who.thin ? (y < 2016 ? 2 : who.apple ? 0 : 1) : who.gaming || who.business ? 3 : who.large ? 4 : 2 + (ctx.pos < 0.5 ? 1 : 0);
  const aId = y < 2010 ? "usb-a-2.0" : first(ctx.trim >= 0.6 ? "usb-a-10g" : "", "usb-a-5g", "usb-a-2.0");
  if (aId) for (let i = 0; i < usbA; i++) out.push([aId, "usb"]);

  // Video.
  // Apple: Mini DisplayPort before Thunderbolt, no VGA, HDMI only on the 2012 to 2015 Pros and from 2021.
  if (who.apple && y >= 2008 && y < 2011 && has("mini-dp")) out.push(["mini-dp", "video"]);
  if (!who.apple && !who.thin && (y <= 2012 || (who.business && y <= 2016)) && has("vga")) out.push(["vga", "video"]);
  const appleHdmi = !who.apple || (!who.thin && ((y >= 2012 && y < 2016) || y >= 2021));
  if (appleHdmi && ((!who.thin && (y >= 2008 || who.perf !== "office")) || (who.thin && y >= 2013 && conn >= 0.04 && !who.apple))) {
    const hdmi = first("hdmi-2.1", "hdmi-2.0", "hdmi-1.4", "hdmi-1.3");
    if (hdmi) out.push([hdmi, "video"]);
  }
  if (who.gaming && who.large && y < 2010 && has("dvi-d")) out.push(["dvi-d", "video"]);

  // Network.
  const wired = y < 2016 ? !who.thin : who.gaming || who.large || (who.business && !who.thin) || (who.budget === "low" && ctx.rng() < 0.3);
  if (wired || (who.business && y < 2013)) {
    const eth = who.gaming && y >= 2020 ? first("ethernet-2.5g", "ethernet-1g") : y < 2008 && who.budget === "low" ? first("ethernet-100", "ethernet-1g") : first("ethernet-1g");
    if (eth) out.push([eth, "net"]);
  }
  if (y <= 2008 && (who.business || who.budget === "low") && has("modem-rj11")) out.push(["modem-rj11", "other"]);

  // Cards.
  if (who.business && y <= 2012) {
    const ec = first(who.thin ? "expresscard-34" : "expresscard-54", "expresscard-34");
    if (ec) out.push([ec, "cards"]);
  }
  if (y >= 2008 && !(who.apple && y >= 2016 && y < 2021) && (conn >= 0.03 || !who.thin)) {
    const sd = first(who.budget === "premium" && y >= 2018 ? "sd-reader-uhs2" : "", "sd-reader", "sd-reader-uhs2", "microsd-reader");
    if (sd) out.push([sd, "cards"]);
  }
  if (y <= 2010 && (who.apple || (who.budget === "premium" && who.perf !== "office")) && has("firewire-400")) out.push(["firewire-400", "other"]);

  // Audio and the lock.
  const audio = first(y <= 2011 ? "headphone-mic" : "audio-combo", "audio-combo", "headphone-mic");
  if (audio) out.push([audio, "audio"]);
  if (!who.apple && (who.business || (who.budget === "low" && ctx.rng() < 0.5)) && has("lock-slot")) out.push(["lock-slot", "other"]);

  // Walls: power and the big video and network ports rearmost, audio at the front where there is a front strip.
  const left: string[] = [];
  const right: string[] = [];
  const back: string[] = [];
  const fore: string[] = [];
  let flip = false;
  for (const [id, slot] of out) {
    if (slot === "power") (who.gaming && rear ? back : left).push(id);
    else if (slot === "video" || slot === "net") (rear && (who.gaming || id.startsWith("ethernet")) ? back : left).push(id);
    else if (slot === "audio") (front && y <= 2011 ? fore : right).push(id);
    else if (slot === "cards" || slot === "other") right.push(id);
    else if (slot === "usbc") left.push(id);
    else {
      (flip ? left : right).push(id);
      flip = !flip;
    }
  }
  while (left.length > right.length + 2) {
    const i = left.findIndex((id) => id.startsWith("usb-a"));
    if (i < 0) break;
    right.push(...left.splice(i, 1));
  }
  const list: BuildPort[] = [
    ...left.map((part) => ({ part, side: "left" as Side })),
    ...back.map((part) => ({ part, side: "rear" as Side })),
    ...right.map((part) => ({ part, side: "right" as Side })),
    ...fore.map((part) => ({ part, side: "front" as Side })),
  ].filter((p) => p.part !== undefined);
  return fixPlatformPorts(list, cpu, y);
}

/** Ports moved to the walls a new layout has. */
function reseatPorts(ports: BuildPort[], layout: string): BuildPort[] {
  const sides = CONTENT.layouts.find((l) => l.id === layout)?.portSides ?? ["left", "right"];
  return ports.map((p) => (sides.includes(p.side) ? p : { ...p, side: p.side === "rear" || p.side === "front" ? "left" : p.side }));
}

/**
 * Ports for a thinner wall: no Ethernet or VGA, USB-A down to one (or USB-C
 * where the year has it), and a microSD slot for the full-size reader.
 */
function thinPorts(ports: BuildPort[], year: number): BuildPort[] {
  const usbC = ["usb-c-10g", "usb-c-5g"].find((id) => portOn(id, year));
  let usbA = 0;
  const out: BuildPort[] = [];
  for (const p of ports) {
    if (p.part.startsWith("ethernet") || p.part === "vga" || p.part === "dvi-d" || p.part === "s-video" || p.part.startsWith("expresscard") || p.part === "pc-card" || p.part === "modem-rj11") continue;
    if (p.part.startsWith("usb-a")) {
      usbA++;
      if (usbA > 1) {
        if (usbC) out.push({ ...p, part: usbC });
        continue;
      }
    }
    if (p.part === "sd-reader" && portOn("microsd-reader", year)) {
      out.push({ ...p, part: "microsd-reader" });
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * The body the line's picks come out thinnest in: one solve per body at the
 * panel's size, the line's most typical body winning a near tie.
 */
function thinnestBody(ctx: Ctx, c: Choices, t: Tally): void {
  const bodies = bodiesFor(ctx);
  if (bodies.length < 2) return;
  const area = activeArea({ inches: c.screen.diag, aspect: c.screen.ratio } as PanelOption);
  let best: { body: string; layout: string; ports: BuildPort[]; z: number } | undefined;
  bodies.forEach((body, i) => {
    if (t.solves >= MAX_SOLVES / 3) return;
    const layout = layoutsFor(ctx, body, c)[0] ?? "a";
    const ports = reseatPorts(c.ports, layout);
    const lim = CONTENT.bodies.find((b) => b.id === body)?.limits ?? { x: [240, 450], y: [160, 330], z: [8, 55] };
    const size: Size = {
      x: clamp(up(area.x + 2 * c.screen.bezel + 6), lim.x[0], lim.x[1]),
      y: clamp(up(area.y + 40), lim.y[0], lim.y[1]),
      z: 15,
    };
    const fit = counted(t, assemble(ctx, { ...c, body, layout, ports }, size), false);
    if (fit.problems.some((p) => !growable(p))) return;
    const z = fit.min.z + i * (ctx.who.thin ? 0.75 : 2);
    if (!best || z < best.z) best = { body, layout, ports, z };
  });
  if (best) {
    c.body = best.body;
    c.layout = best.layout;
    c.ports = best.ports;
  }
}

// ------------------------------------------------------------------ materials, finish, spend, price

const PALETTE: Record<string, string[]> = {
  plastic: ["#1b1b1c", "#2a2b2e", "#e9e9ea", "#3b4150", "#5a1e2a"],
  aluminium: ["#c8cacd", "#8c8f94", "#2f3134", "#d6c3a5"],
  magnesium: ["#1c1c1d", "#2b2d30", "#b9bbbe"],
  cfrp: ["#161617", "#202124"],
};

function pickMaterials(ctx: Ctx, lighter = false): Record<Piece, string> {
  if (lighter) ctx.lighter = true;
  lighter = ctx.lighter;
  const era = eraFor(ctx.year);
  const ok = (m: string, piece: Piece) => {
    const mat = CONTENT.materials.find((x) => x.id === m);
    return !!mat && available(mat, ctx.year) && !!era.pieces[m]?.includes(piece);
  };
  const c = pct(ctx, "chassis", 0, "materials");
  const who = ctx.who;
  let pick: [string, string, string];
  if (who.apple) pick = ctx.line.id === "apple-macbook" && ctx.year < 2015 ? ["plastic", "plastic", "plastic"] : ["aluminium", "aluminium", "aluminium"];
  else if (lighter) pick = ["magnesium", "magnesium", who.business ? "cfrp" : "magnesium"];
  else if (c < 0.35) pick = ["plastic", "plastic", "plastic"];
  else if (c < 0.55) pick = ["plastic", "plastic", ctx.year >= 2009 ? "aluminium" : "plastic"];
  else if (c < 0.75) pick = who.business ? ["plastic", "magnesium", "magnesium"] : ["plastic", "aluminium", "aluminium"];
  else pick = who.business ? ["magnesium", "magnesium", "cfrp"] : who.thin && ctx.line.priorities.portability >= 0.2 ? ["magnesium", "magnesium", "magnesium"] : ["aluminium", "aluminium", "aluminium"];
  const out = {} as Record<Piece, string>;
  PIECES.forEach((piece, i) => {
    const want = pick[i];
    out[piece] = ok(want, piece) ? want : ok("magnesium", piece) && want === "cfrp" ? "magnesium" : "plastic";
  });
  return out;
}

function pickFinish(ctx: Ctx, materials: Record<Piece, string>): Build["finish"] {
  const main = materials.lid;
  const colours = ctx.who.gaming ? ["#141415", "#1e1f22"] : (PALETTE[main] ?? PALETTE.plastic);
  const colour = colours[Math.floor(ctx.rng() * colours.length) % colours.length];
  const out = {} as Build["finish"];
  for (const piece of PIECES) {
    const mat = CONTENT.materials.find((x) => x.id === materials[piece]);
    const fins = (mat?.finishes ?? ["matte"]).filter((f) => {
      const tex = CONTENT.finishes.find((x) => x.id === f);
      return tex && available(tex, ctx.year);
    });
    const pref =
      materials[piece] === "plastic"
        ? ctx.year <= 2012 && ctx.who.budget !== "premium" && !ctx.who.business
          ? "glossy"
          : ctx.who.business
            ? "soft-touch"
            : "matte"
        : materials[piece] === "aluminium"
          ? ctx.pos >= 0.5
            ? "anodised"
            : "brushed"
          : ctx.who.business
            ? "soft-touch"
            : "matte";
    const texture = fins.includes(pref) ? pref : (fins[0] ?? "matte");
    // The underside is darker on anything that is not one colour all round.
    const c = piece === "floor" && materials.floor !== materials.lid ? "#1d1d1f" : colour;
    out[piece] = { colour: c, texture };
  }
  return out;
}

const QUALITY_STAT: Record<QualityKey, HeadlineStat> = {
  display: "display",
  keyboard: "keyboard",
  trackpad: "trackpad",
  speakers: "audio",
  webcam: "connectivity",
};

function pickQuality(ctx: Ctx): NonNullable<Build["quality"]> {
  const out: NonNullable<Build["quality"]> = {};
  for (const key of QUALITY_KEYS) {
    const stat = QUALITY_STAT[key] ?? "chassis";
    const q = clamp01(ctx.trim - 0.35 + (ctx.line.priorities[stat] - MEAN_WEIGHT) * 3);
    const r = Math.round(q * 20) / 20;
    if (r > 0) out[key] = r;
  }
  return out;
}

function pickSpend(ctx: Ctx, all = false): Build["spend"] {
  const w = ctx.line.priorities;
  const thin = ctx.who.thin;
  const compact = all ? 0.9 : thin ? clamp01(0.2 + w.portability * 3) : clamp01(w.portability * 1.5);
  const r = (v: number) => Math.round(clamp01(v) * 20) / 20;
  const out: Build["spend"] = {
    material: r(all ? 1 : pct(ctx, "chassis") - 0.25),
    packing: r(all ? 1 : thin ? 0.3 + w.portability * 3 : w.portability * 2),
  };
  if (compact > 0)
    for (const k of ["battery", "keyboard", "trackpad", "cooling", "processor"] as const) out[k] = r(compact);
  return out;
}

function pickPrice(ctx: Ctx): number {
  const [lo, hi] = priceFor(ctx.line, ctx.year);
  const p = lerp(lo, hi, ctx.pos);
  return Math.max(199, Math.round(p / 50) * 50 - 1);
}

/**
 * The most of its price a model's parts may cost. The retailer keeps about a
 * fifth, and freight, warranty and the operating system licence take most of
 * the rest; past this the line would sell at a loss.
 */
const MAX_COST_SHARE = 0.7;

/** The build at its line's price, or at the lowest price that covers its parts when the line's would not. */
function pricedAtCost(build: Build, fit: Fit): Build {
  const floor = costOf(build, fit).total / MAX_COST_SHARE;
  const price = build.price ?? 0;
  if (price >= floor) return build;
  return { ...build, price: Math.ceil((floor + 1) / 50) * 50 - 1 };
}

// ------------------------------------------------------------------ parts budget

/**
 * The share of its price a line spends on parts: a budget or midrange machine
 * about 55 to 70 percent, a premium one 45 to 60, the rest being margin the
 * brand is paid for. The picks aim under this, and a class fix may spend up to
 * the hard ceiling before the line would have to raise its price.
 */
function shareOf(ctx: Ctx): number {
  return ctx.who.budget === "premium" ? 0.58 : 0.66;
}
const HARD_SHARE = MAX_COST_SHARE - 0.015;

/** A cheap cost estimate: the parts in a shell sized from the panel, no solve. */
function estimate(ctx: Ctx, c: Choices): number {
  return rawEstimate(assemble(ctx, c, { x: 0, y: 0, z: 0 })) * ctx.costBias;
}

function rawEstimate(build: Build): number {
  const lim = CONTENT.bodies.find((b) => b.id === build.body)?.limits ?? { x: [240, 450], y: [160, 330], z: [8, 55] };
  const screen = build.screen ?? defaultScreen(build.year);
  const area = activeArea({ inches: screen.diag, aspect: screen.ratio } as PanelOption);
  const size: Size = {
    x: clamp(up(area.x + 2 * screen.bezel + 6), lim.x[0], lim.x[1]),
    y: clamp(up(area.y + 40), lim.y[0], lim.y[1]),
    z: 15,
  };
  return costOf({ ...build, size }, { frame: size } as Fit).total;
}

const SPEND_COMPACT = ["battery", "keyboard", "trackpad", "cooling", "processor"] as const;

interface Move {
  /** The pick it touches, for protection. */
  key: string;
  /** How much the line cares about what it gives up. */
  weight: number;
  apply: (c: Choices) => boolean;
}

/** Every one-step saving the budget fit may take. */
function movesOf(ctx: Ctx): Move[] {
  const w = ctx.line.priorities;
  /** Cut a pick's percentile until the pick changes, or give up. */
  const recut = (key: string, pick: () => string, d = 0.15): boolean => {
    const before = pick();
    for (let i = 0; i < 6; i++) {
      if ((ctx.cut[key] ?? 0) >= 1.2) return false;
      ctx.cut[key] = (ctx.cut[key] ?? 0) + d;
      if (pick() !== before) return true;
    }
    return false;
  };
  const moves: Move[] = [
    {
      key: "cpu",
      weight: w.app,
      apply: (c) =>
        recut("cpu", () => {
          const cpu = pickCpu(ctx);
          if (cpu.id !== c.cpu.id) setCpu(ctx, c, cpu);
          return c.cpu.id;
        }),
    },
    {
      key: "gpu",
      weight: w.games + (ctx.who.gaming ? 0.1 : 0),
      apply: (c) => {
        if (!c.gpu) return false;
        const done = recut("gpu", () => {
          c.gpu = pickGpu(ctx, c.cpu);
          return c.gpu?.id ?? "";
        });
        // A line that does not sell on games drops the chip once the cheapest one is still too dear.
        if (!done && !ctx.who.gaming) c.gpu = undefined;
        c.cooling = pickCooling(ctx, c.cpu, c.gpu);
        return done || !c.gpu;
      },
    },
    {
      key: "memory",
      weight: w.app * 0.8,
      apply: (c) =>
        recut("memory", () => {
          c.memory = pickMemory(ctx, c.cpu);
          return JSON.stringify(c.memory);
        }),
    },
    {
      key: "storage",
      weight: w.app * 0.6,
      apply: (c) => {
        if (c.storage.length > 1) {
          c.storage = c.storage.slice(0, 1);
          return true;
        }
        return recut("storage", () => {
          c.storage = pickStorage(ctx, false, 1);
          return JSON.stringify(c.storage);
        });
      },
    },
    {
      key: "screen",
      weight: w.display,
      apply: (c) =>
        recut("screen", () => {
          c.screen = pickScreen(ctx, false, c.screen.diag);
          return JSON.stringify(c.screen);
        }),
    },
    {
      key: "battery",
      weight: w.battery,
      apply: (c) =>
        recut("battery", () => {
          c.battery = pickBattery(ctx, c.screen);
          return JSON.stringify(c.battery);
        }),
    },
    {
      key: "materials",
      weight: w.chassis,
      apply: (c) => {
        const done = recut("materials", () => {
          c.materials = pickMaterials(ctx);
          return JSON.stringify(c.materials);
        });
        if (done) c.finish = pickFinish(ctx, c.materials);
        return done;
      },
    },
    {
      key: "ports",
      weight: w.connectivity,
      apply: (c) => {
        const ports = thinPorts(c.ports, ctx.year);
        if (ports.length === c.ports.length && ports.every((p, i) => p.part === c.ports[i].part)) return false;
        c.ports = ports;
        return true;
      },
    },
    {
      key: "optical",
      // While buyers want a drive, the budget fit gives it up as late as a real priority.
      weight: 0.05 + 0.4 * Math.max(0, curveAt(OPTICAL_WANT, ctx.year)),
      apply: (c) => {
        if (!c.optical) return false;
        c.optical = undefined;
        return true;
      },
    },
  ];
  for (const k of QUALITY_KEYS)
    moves.push({
      key: "quality",
      weight: w[QUALITY_STAT[k] ?? "chassis"],
      apply: (c) => {
        const q = c.quality[k] ?? 0;
        if (q <= 0) return false;
        const next = Math.round(Math.max(0, q - 0.2) * 20) / 20;
        if (next > 0) c.quality[k] = next;
        else delete c.quality[k];
        return true;
      },
    });
  const lower = (keys: readonly string[]) => (c: Choices) => {
    let any = false;
    for (const k of keys) {
      const v = c.spend[k as keyof Build["spend"]] ?? 0;
      if (v <= 0) continue;
      c.spend[k as keyof Build["spend"]] = Math.round(Math.max(0, v - 0.2) * 20) / 20;
      any = true;
    }
    return any;
  };
  moves.push(
    { key: "spend", weight: w.chassis, apply: lower(["material"]) },
    { key: "spend", weight: w.portability, apply: lower(["packing"]) },
    { key: "spend", weight: w.portability, apply: lower(SPEND_COMPACT) },
  );
  return moves;
}

/**
 * Cut the picks until the estimate fits the budget, each step taking the
 * saving that costs the line least of what it cares about per dollar.
 */
function fitBudget(ctx: Ctx, c: Choices, share = shareOf(ctx)): void {
  const cap = c.price * share;
  let cost = estimate(ctx, c);
  if (cost <= cap) return;
  /** Saving per unit of what the line cares about, if the move were taken now. */
  const score = (move: Move): number => {
    const saved = { cut: { ...ctx.cut }, batteryShrink: ctx.batteryShrink, smallStorage: ctx.smallStorage, lighter: ctx.lighter };
    const trial = clone(c);
    const rng = ctx.rng;
    ctx.rng = () => 0.5;
    const ok = move.apply(trial);
    ctx.rng = rng;
    Object.assign(ctx, saved);
    if (!ok) return 0;
    const saving = cost - estimate(ctx, trial);
    return saving <= 0.5 ? 0 : saving / (move.weight + 0.03);
  };
  // Lazy greedy: a move's score only falls as others are taken, so re-score the leader alone
  // and take it when it still leads.
  let queue = movesOf(ctx)
    .filter((m) => !ctx.protect.has(m.key))
    .map((move) => ({ move, score: score(move) }))
    .filter((q) => q.score > 0);
  for (let i = 0; i < 60 && cost > cap && queue.length > 0; i++) {
    queue.sort((a, b) => b.score - a.score);
    const top = queue[0];
    top.score = score(top.move);
    if (top.score <= 0) {
      queue = queue.slice(1);
      continue;
    }
    if (queue.length > 1 && top.score < queue[1].score) continue;
    top.move.apply(c);
    cost = estimate(ctx, c);
    top.score = score(top.move);
  }
}

/**
 * Raise the compaction, packing and material spend as far toward `level` as
 * the budget allows. Returns false when it could not raise them at all.
 */
function spendWithin(ctx: Ctx, c: Choices, level: number, share: number): boolean {
  const cap = c.price * share;
  const now = c.spend;
  const at = (l: number): Build["spend"] => {
    const out: Build["spend"] = { ...now };
    out.packing = Math.max(now.packing ?? 0, l);
    out.material = Math.max(now.material ?? 0, Math.min(l, 1));
    for (const k of SPEND_COMPACT) out[k] = Math.max(now[k] ?? 0, Math.round(l * 0.9 * 20) / 20);
    return out;
  };
  let got: Build["spend"] | undefined;
  for (let l = level; l > 0.05; l -= 0.1) {
    const spend = at(Math.round(l * 20) / 20);
    if (estimate(ctx, { ...c, spend }) <= cap) {
      got = spend;
      break;
    }
  }
  if (!got || JSON.stringify(got) === JSON.stringify(now)) return false;
  c.spend = got;
  return true;
}

// ------------------------------------------------------------------ first picks

/** The look's body, when the year has it. */
function lookBody(ctx: Ctx): string | undefined {
  const b = CONTENT.bodies.find((x) => x.id === ctx.look.body);
  return b && available(b, ctx.year) ? b.id : undefined;
}

function firstChoices(ctx: Ctx): Choices {
  const cpu = pickCpu(ctx);
  const gpu = wantsGpu(ctx, cpu) ? pickGpu(ctx, cpu) : undefined;
  const screen = pickScreen(ctx);
  const battery = pickBattery(ctx, screen);
  const optical = pickOptical(ctx);
  const bodies = bodiesFor(ctx);
  const roll = ctx.rng() < 0.6 ? bodies[0] : bodies[Math.floor(ctx.rng() * bodies.length) % bodies.length];
  const body = lookBody(ctx) ?? roll;
  const partial: Partial<Choices> = { battery, optical };
  const layout = layoutsFor(ctx, body, partial)[0] ?? "a";
  const tp = pickTrackpad(ctx);
  const materials = pickMaterials(ctx);
  const w = ctx.line.priorities;
  const loose = clamp01(1 - w.portability * 4);
  const c: Choices = {
    body,
    layout,
    cpu,
    gpu,
    memory: pickMemory(ctx, cpu),
    storage: pickStorage(ctx),
    screen,
    battery,
    cooling: pickCooling(ctx, cpu, gpu),
    optical,
    wireless: pickWireless(ctx),
    keyboard: pickKeyboard(ctx, screen),
    trackpad: tp.bp,
    pad: tp.pad,
    webcam: pickWebcam(ctx),
    speakers: pickSpeakers(ctx),
    ports: pickPorts(ctx, layout, cpu),
    materials,
    finish: pickFinish(ctx, materials),
    spend: pickSpend(ctx),
    quality: pickQuality(ctx),
    price: pickPrice(ctx),
    sig: lookBody(ctx) ? ctx.look.sig : Math.round(ctx.rng() * 0.35 * 20) / 20,
    slack: ctx.who.thin
      ? { x: 0, y: 0, z: 0 }
      : { x: Math.round(ctx.rng() * 4 * loose), y: Math.round(ctx.rng() * 10 * loose), z: Math.round((0.5 + ctx.rng() * 2.5) * loose * 2) / 2 },
  };
  fitBudget(ctx, c);
  return c;
}

/** The plainest build the year allows: a last resort when the line's own picks never fit. */
function safeChoices(ctx: Ctx): Choices {
  const plain: Ctx = { ...ctx, trim: 0.3, who: { ...ctx.who, thin: false, gaming: false, large: false, perf: "office", silicon: false }, powerScale: 1, vendor: "intel", cut: {}, batteryShrink: 0, smallStorage: false, lighter: false };
  const cpu = pickCpu(plain);
  const screen = pickScreen(plain, true);
  const layout = "a";
  const tp = pickTrackpad(plain);
  const materials = { floor: "plastic", deck: "plastic", lid: "plastic" };
  return {
    body: "workhorse",
    layout,
    cpu,
    memory: pickMemory(plain, cpu),
    storage: pickStorage(plain, true),
    screen,
    battery: pickBattery(plain, screen, 0.5),
    cooling: pickCooling(plain, cpu, undefined, 1),
    wireless: pickWireless(plain),
    keyboard: pickKeyboard(plain, screen),
    trackpad: tp.bp,
    speakers: pickSpeakers(plain, true),
    ports: [
      { part: "dc-jack", side: "left" },
      { part: portOn("usb-a-5g", ctx.year) ? "usb-a-5g" : "usb-a-2.0", side: "right" },
    ],
    materials,
    finish: pickFinish(plain, materials),
    spend: {},
    quality: {},
    price: pickPrice(ctx),
    slack: { x: 0, y: 0, z: 0 },
    sig: 0,
  };
}

// ------------------------------------------------------------------ the loop

interface Tally {
  solves: number;
  sims: number;
  start: number;
}

function counted(t: Tally, build: Build, auto: boolean): Fit {
  t.solves++;
  return solve(build, CONTENT, auto ? {} : { auto: false });
}

const up = (v: number) => Math.ceil(v * 2) / 2;

/** A problem a bigger chassis can fix: a short axis, or a wall too short for its ports. */
function growable(p: Problem): boolean {
  return p.kind === "geometry" || (p.kind === "compat" && p.code === "no-room" && String(p.role).startsWith("port:"));
}

/**
 * Grow the chassis from the body's least size to the build's minimum with every
 * part where the layout puts it, add the line's slack, and check the result
 * the way the game solves it.
 */
function settle(ctx: Ctx, c: Choices, t: Tally): { build: Build; fit: Fit } {
  const body = CONTENT.bodies.find((b) => b.id === c.body);
  const lim = body?.limits ?? { x: [240, 450], y: [160, 330], z: [8, 55] };
  // Seed from the panel, so the first solve is not laid out in a shell far too small for it.
  const area = activeArea({ inches: c.screen.diag, aspect: c.screen.ratio } as PanelOption);
  let size: Size = {
    x: clamp(up(area.x + 2 * c.screen.bezel + 6), lim.x[0], lim.x[1]),
    y: clamp(up(area.y + 30), lim.y[0], lim.y[1]),
    z: clamp(15, lim.z[0], lim.z[1]),
  };
  let fit: Fit | undefined;
  for (let i = 0; i < 5 && t.solves < MAX_SOLVES; i++) {
    fit = counted(t, assemble(ctx, c, size), false);
    // A problem growing cannot fix: stop and let the fixes see it.
    if (fit.problems.some((p) => !growable(p) || (p.kind === "geometry" && p.code === "too-big" && i > 0))) return { build: assemble(ctx, c, size), fit };
    // Plan grows only; thickness follows the minimum both ways, as a bigger plan may need less of it.
    const next: Size = {
      x: Math.min(up(Math.max(size.x, fit.min.x)), lim.x[1]),
      y: Math.min(up(Math.max(size.y, fit.min.y)), lim.y[1]),
      z: clamp(up(fit.min.z), lim.z[0], lim.z[1]),
    };
    if (next.x === size.x && next.y === size.y && next.z === size.z) break;
    size = next;
  }
  const slack: Size = {
    x: Math.min(size.x + c.slack.x, lim.x[1]),
    y: Math.min(size.y + c.slack.y, lim.y[1]),
    z: Math.min(size.z + c.slack.z, lim.z[1]),
  };
  let build = assemble(ctx, c, slack);
  fit = counted(t, build, true);
  // The shape follows the size, so the slack can move the minimum a little: meet it, with a
  // little more each time in case the shape moves it again.
  let now = slack;
  for (let k = 0; k < 3 && fit.problems.length > 0 && fit.problems.every(growable) && t.solves < MAX_SOLVES; k++) {
    const f = fit;
    now = {
      x: Math.min(up(Math.max(now.x, f.min.x + 0.25 * k)), lim.x[1]),
      y: Math.min(up(Math.max(now.y, f.min.y + 0.25 * k)), lim.y[1]),
      z: Math.min(up(Math.max(now.z, f.min.z + 0.25 * k)), lim.z[1]),
    };
    build = assemble(ctx, c, now);
    fit = counted(t, build, true);
  }
  return { build, fit: fit as Fit };
}

const clone = (c: Choices): Choices => ({ ...c, storage: [...c.storage], ports: [...c.ports], spend: { ...c.spend }, quality: { ...c.quality } });

function nextOf<T>(list: T[], now: T): T | undefined {
  const i = list.indexOf(now);
  return list[i + 1];
}

/** One targeted change for the first problem, or undefined when nothing is left to try. */
function fixProblems(ctx: Ctx, c0: Choices, problems: Problem[]): Choices | undefined {
  const c = clone(c0);
  const p = problems.find((x) => !(x.kind === "geometry" && x.code === "short")) ?? problems[0];
  const bump = (k: string) => {
    ctx.step[k] = (ctx.step[k] ?? 0) + 1;
    return ctx.step[k] - 1;
  };
  const switchLayout = (): boolean => {
    const next = nextOf(layoutsFor(ctx, c.body, c), c.layout);
    if (!next) return false;
    c.layout = next;
    c.ports = reseatPorts(c.ports, next);
    return true;
  };
  const switchBody = (): boolean => {
    const next = nextOf(bodiesFor(ctx), c.body) ?? (c.body !== "workhorse" ? "workhorse" : undefined);
    if (!next) return false;
    c.body = next;
    c.layout = layoutsFor(ctx, next, c)[0] ?? "a";
    c.ports = reseatPorts(c.ports, c.layout);
    return true;
  };
  const shrink = (): boolean => {
    switch (bump("shrink")) {
      case 0:
        c.battery = pickBattery(ctx, c.screen, 0.35);
        return true;
      case 1:
        if (!opticalWanted(ctx)) c.optical = undefined;
        c.storage = pickStorage(ctx, true);
        return true;
      case 2:
        c.speakers = pickSpeakers(ctx, true);
        c.keyboard = pickKeyboard(ctx, { ...c.screen, diag: 14 }, true);
        return true;
      case 3:
        c.screen = pickScreen(ctx, true);
        c.battery = pickBattery(ctx, c.screen, 0.5);
        return true;
      case 4:
        return switchLayout() || switchBody();
      case 5:
        return switchBody();
      default:
        return false;
    }
  };

  if (p.kind === "geometry") return shrink() ? c : undefined;
  if (p.kind === "year") {
    // A dated part slipped through: pick that category again, or drop it.
    if (p.what === "panel") c.screen = { ...defaultScreen(ctx.year), diag: c.screen.diag };
    else if (p.what === "part" || p.what === "option") {
      const ref = p.ref.split(":")[0];
      c.ports = c.ports.filter((x) => x.part !== ref);
      if (c.optical?.part === ref) c.optical = undefined;
      if (c.webcam?.part === ref) c.webcam = undefined;
      if (c.speakers?.part === ref) c.speakers = undefined;
      if (c.memory.part === ref) c.memory = { part: ref };
    } else if (!switchLayout() && !switchBody()) return undefined;
    return bump("year") < 4 ? c : undefined;
  }
  switch (p.code) {
    case "no-room": {
      const role = String(p.role);
      if (role.startsWith("port:")) {
        const side = role.slice(5) as Side;
        const on = c.ports.filter((x) => x.side === side);
        const drop = PORT_DROP_ORDER.find((id) => on.some((x) => x.part === id)) ?? on[on.length - 1]?.part;
        const i = c.ports.findIndex((x) => x.side === side && x.part === drop);
        if (i < 0) return shrink() ? c : undefined;
        c.ports.splice(i, 1);
        return c;
      }
      if (role === "odd" && bump("odd") > 0) {
        c.optical = undefined;
        return c;
      }
      if (role === "spk" && bump("spk") > 0) {
        c.speakers = pickSpeakers(ctx, true);
        if (ctx.step.spk > 2) c.speakers = undefined;
        return c;
      }
      if (role === "drive" && bump("drive") > 0) {
        c.storage = pickStorage(ctx, true);
        return c;
      }
      if (role === "webcam") {
        c.webcam = bump("cam") < 1 ? pickWebcam(ctx, 1) : undefined;
        return c;
      }
      return switchLayout() || shrink() ? c : undefined;
    }
    case "bezel-fit":
      if (p.role === "webcam") {
        c.webcam = bump("cam") < 1 ? pickWebcam(ctx, 1) : undefined;
        return c;
      }
      return switchBody() ? c : undefined;
    case "overlap":
      return switchLayout() || switchBody() ? c : undefined;
    case "needs":
      if (p.part.startsWith("thunderbolt")) c.ports = fixPlatformPorts(c.ports, c.cpu, ctx.year);
      else if (p.part === c.gpu?.id) c.gpu = undefined;
      else c.memory = pickMemory(ctx, c.cpu);
      return bump("needs") < 3 ? c : undefined;
    case "no-charging":
      c.ports = [{ part: "dc-jack", side: c.ports[0]?.side ?? "left" }, ...c.ports];
      return c;
    case "screen":
      c.screen = { ...defaultScreen(ctx.year), diag: clamp(c.screen.diag, 10, 18) };
      return bump("screen") < 2 ? c : undefined;
    case "missing":
      return undefined;
    case "port-side":
      c.ports = reseatPorts(c.ports, c.layout);
      return bump("side") < 2 ? c : undefined;
    default:
      return switchLayout() || switchBody() ? c : undefined;
  }
}

const PERF_RANK: Record<PerfClass, number> = { office: 0, "mixed-use": 1, gaming: 2 };

/** The thin and light thickness ceiling by year, mm (engine/price's era rows). */
function thinMm(year: number): number {
  if (year <= 2006) return 32;
  if (year >= 2026) return 19;
  return year <= 2016 ? lerp(32, 21, (year - 2006) / 10) : lerp(21, 19, (year - 2016) / 10);
}

interface Miss {
  score: number;
  thick: boolean;
  big: boolean;
  slow: boolean;
  /** Parts past the line's budget. */
  dear: boolean;
}

/** How far the valid build is from its class: thin enough, not too big, fast enough. */
function missOf(ctx: Ctx, build: Build, fit: Fit, t: Tally): Miss {
  const target = ctx.shape.class;
  const needsSim = target.performance !== "office";
  if (needsSim) t.sims++;
  const m = needsSim ? simulate(build, fit, CONTENT) : ({} as ReturnType<typeof simulate>);
  const cls = classify(build, fit, m, weightOf(build, fit, CONTENT));
  const thick = target.body === "thin and light" && cls.body !== "thin and light";
  // A medium machine far thicker than the year's thin ones counts as too big too.
  const thickness = fit.frame.z + fit.lidZ;
  const bulky = cls.body === "medium" && thickness > thinMm(ctx.year) * 1.5;
  const big = target.body === "medium" && (cls.body === "large" || bulky);
  const slow = cls.performance !== null && PERF_RANK[cls.performance] < PERF_RANK[target.performance];
  const cost = costOf(build, fit).total;
  // Calibrate the estimate against the real shell.
  ctx.costBias = clamp(cost / Math.max(1, rawEstimate(build)), 0.8, 1.3);
  const price = build.price ?? 1;
  const dear = cost > price * shareOf(ctx);
  // Under the class counts for more than over the budget: past the ceiling the line raises its price.
  const penalty = cost > price * MAX_COST_SHARE ? 0.5 : dear ? 0.25 : 0;
  return {
    score: (thick ? 2 : 0) + (big ? 1 : 0) + (slow ? PERF_RANK[target.performance] - PERF_RANK[cls.performance ?? "office"] : 0) + penalty,
    thick,
    big,
    slow,
    dear,
  };
}

/** One swap toward the line's class or its budget, or undefined when nothing is left to try. */
function fixPriority(ctx: Ctx, c0: Choices, miss: Miss): Choices | undefined {
  const c = clone(c0);
  const bump = (k: string) => {
    ctx.step[k] = (ctx.step[k] ?? 0) + 1;
    return ctx.step[k] - 1;
  };
  if (miss.slow) {
    const s = bump("slow");
    if (s > 3) return undefined;
    // Speed is the class: give back what the budget fit took from the chips.
    delete ctx.cut.cpu;
    delete ctx.cut.gpu;
    if (!c.gpu && c.cpu.provides?.includes("dgpu")) c.gpu = pickGpu(ctx, c.cpu, ctx.who.gaming ? 0 : -0.3);
    else if (c.gpu) {
      // The next chips up, a few at a time: the cheapest that makes the class, not the line's top pick.
      const list = gpusFor(ctx, c.cpu);
      const i = list.findIndex((p) => p.id === c.gpu?.id);
      c.gpu = list[Math.min(list.length - 1, i + Math.max(1, Math.round(list.length * 0.1 * (s + 1))))] ?? c.gpu;
    }
    else setCpu(ctx, c, pickCpu(ctx, 0.2 * (s + 1)));
    c.cooling = pickCooling(ctx, c.cpu, c.gpu, s > 0 ? 1 : 0);
    // Pay for the speed out of the rest of the machine.
    ctx.protect.add("cpu").add("gpu");
    fitBudget(ctx, c);
    return c;
  }
  if (miss.thick || miss.big) {
    // Thinness by the cheap means first: fewer ports, a smaller battery and drives, cooler parts.
    // Compaction spend only as far as the budget allows, and past it only to the hard ceiling.
    for (;;) {
      const s = bump("thin");
      switch (s) {
        case 0:
          c.slack = { x: 0, y: 0, z: 0 };
          c.sig = 0;
          c.ports = thinPorts(c.ports, ctx.year);
          break;
        case 1:
          c.battery = pickBattery(ctx, c.screen, 0.3);
          if (!opticalWanted(ctx)) c.optical = undefined;
          c.storage = pickStorage(ctx, true);
          c.speakers = pickSpeakers(ctx, true);
          break;
        case 2:
          ctx.powerScale *= 0.6;
          c.gpu = ctx.who.gaming ? c.gpu : undefined;
          setCpu(ctx, c, pickCpu(ctx), -0.2);
          c.keyboard = pickKeyboard(ctx, c.screen, true);
          break;
        case 3:
          fitBudget(ctx, c);
          if (!spendWithin(ctx, c, 0.6, shareOf(ctx))) continue;
          ctx.protect.add("spend");
          return c;
        case 4: {
          // Lighter materials only where the budget has room for them.
          if (ctx.lighter) continue;
          const materials = pickMaterials(ctx, true);
          if (estimate(ctx, { ...c, materials }) > c.price * shareOf(ctx)) {
            ctx.lighter = false;
            continue;
          }
          c.materials = materials;
          c.finish = pickFinish(ctx, c.materials);
          ctx.protect.add("materials");
          break;
        }
        case 5:
          fitBudget(ctx, c);
          if (!spendWithin(ctx, c, 1, shareOf(ctx))) continue;
          ctx.protect.add("spend");
          return c;
        case 6:
          c.screen = pickScreen(ctx, true);
          c.battery = pickBattery(ctx, c.screen, 0.4);
          break;
        case 7:
          if (!spendWithin(ctx, c, 1, HARD_SHARE)) continue;
          ctx.protect.add("spend");
          return c;
        default:
          return undefined;
      }
      fitBudget(ctx, c);
      return c;
    }
  }
  if (miss.dear) {
    const before = JSON.stringify(c);
    fitBudget(ctx, c);
    return JSON.stringify(c) === before || bump("dear") > 3 ? undefined : c;
  }
  return undefined;
}

function dressed(ctx: Ctx, build: Build, fit: Fit): Build {
  const out = dress(build, ctx.look, (m) => {
    const mat = CONTENT.materials.find((x) => x.id === m);
    return (mat?.finishes ?? []).filter((f) => {
      const tex = CONTENT.finishes.find((x) => x.id === f);
      return !!tex && available(tex, ctx.year);
    });
  });
  return { ...out, marks: logoMarks(ctx.line, ctx.year, out, fit) };
}

/** Lid depth past what the panel and the era's top bezel and chin need, mm: what shows as an oversized bezel. */
function lidExcess(build: Build): number {
  const s = build.screen;
  if (!s) return 0;
  const e = eraFor(build.year).bezel;
  return build.size.y - activeArea({ inches: s.diag, aspect: s.ratio } as PanelOption).y - e.top - e.chin;
}

/** Past this much spare lid depth, mm, the generator repacks the base. */
const EXCESS_MM = 15;

/** The plan the panel asks for: its active area with the bezel either side, and the era's top bezel and chin. */
function panelPlan(build: Build): Size | undefined {
  const s = build.screen;
  if (!s) return undefined;
  const e = eraFor(build.year).bezel;
  const a = activeArea({ inches: s.diag, aspect: s.ratio } as PanelOption);
  return { x: up(a.x + 2 * s.bezel + 6), y: up(a.y + e.top + e.chin + 6), z: build.size.z };
}

/**
 * Settle with auto placement aimed at a target plan: the solver moves and
 * turns the movable floor parts to fit the room it is given, so starting from
 * the panel's plan packs for the panel's depth, and the plan only grows where
 * the parts still need it.
 */
function settleTo(ctx: Ctx, c: Choices, target: Size, t: Tally): { build: Build; fit: Fit } | undefined {
  const lim = CONTENT.bodies.find((b) => b.id === c.body)?.limits ?? { x: [240, 450], y: [160, 330], z: [8, 55] };
  let size: Size = { x: clamp(target.x, lim.x[0], lim.x[1]), y: clamp(target.y, lim.y[0], lim.y[1]), z: clamp(target.z, lim.z[0], lim.z[1]) };
  for (let i = 0; i < 6; i++) {
    const build = assemble(ctx, c, size);
    const fit = counted(t, build, true);
    if (fit.problems.length === 0) return { build, fit };
    if (!fit.problems.every(growable)) return undefined;
    const next: Size = {
      x: Math.min(up(Math.max(size.x, fit.min.x + 0.25 * i)), lim.x[1]),
      y: Math.min(up(Math.max(size.y, fit.min.y + 0.25 * i)), lim.y[1]),
      z: Math.min(up(Math.max(size.z, fit.min.z + 0.25 * i)), lim.z[1]),
    };
    if (next.x === size.x && next.y === size.y && next.z === size.z) return undefined;
    size = next;
  }
  return undefined;
}

/**
 * The side ports spread over both side walls by the length of wall each takes,
 * the longest first onto the shorter run, the power port staying where it is.
 * A side column of ports sets the depth of the rear block it sits in.
 */
function balancedPorts(ports: BuildPort[], fit: Fit): BuildPort[] {
  const len = new Map<number, number>();
  const units = fit.boxes.filter((b) => b.kind === "unit" && (b.role === "port:left" || b.role === "port:right"));
  const sideIdx = ports.map((p, i) => (p.side === "left" || p.side === "right" ? i : -1)).filter((i) => i >= 0);
  // Units come out in port order per side; match them back by side and order.
  for (const side of ["left", "right"] as const) {
    const idx = sideIdx.filter((i) => ports[i].side === side);
    const us = units.filter((u) => u.role === `port:${side}`).sort((p, q) => p.id.localeCompare(q.id, undefined, { numeric: true }));
    idx.forEach((i, k) => len.set(i, (us[k]?.size.y ?? 12) + 4));
  }
  if (sideIdx.length < 2) return ports;
  const power = sideIdx.find((i) => ports[i].part === "dc-jack" || ports[i].part.startsWith("magsafe"));
  const run = { left: 0, right: 0 };
  const side = new Map<number, "left" | "right">();
  if (power !== undefined) {
    const s0 = ports[power].side as "left" | "right";
    side.set(power, s0);
    run[s0] += len.get(power) ?? 12;
  }
  for (const i of [...sideIdx].filter((i) => i !== power).sort((p, q) => (len.get(q) ?? 0) - (len.get(p) ?? 0))) {
    const s1 = run.left <= run.right ? "left" : "right";
    side.set(i, s1);
    run[s1] += len.get(i) ?? 12;
  }
  return ports.map((p, i) => (side.has(i) ? { ...p, side: side.get(i) as "left" | "right" } : p));
}

/**
 * Repack the base so its depth follows the panel: the line's picks in each of
 * the body's layouts, with the side ports as picked and spread over both
 * walls, and the battery as picked and as a flat full-width pack, each packed
 * toward the panel's plan; then a shallower trackpad. The shallowest that
 * solves clean, no thicker and not much wider, wins.
 */
function compact(ctx: Ctx, c0: Choices, build: Build, fit: Fit, t: Tally): { build: Build; fit: Fit } {
  const target = panelPlan(build);
  if (!target || lidExcess(build) <= EXCESS_MM) return { build, fit };
  let out = { build, fit };
  let best = c0;
  // Room past the panel's plan, wide and deep alike: both show as bezel.
  // A thicker base may stack a drive over the board or battery: each mm of it counts as 5 of plan.
  const thicker = ctx.who.thin ? 1 : 4;
  const over = (b: Build) => Math.max(0, b.size.x - target.x) + Math.max(0, b.size.y - target.y) + 5 * Math.max(0, b.size.z - build.size.z);
  const flat = pickBattery({ ...ctx }, c0.screen, ctx.batteryShrink, true);
  // A pack short enough to sit beside the optical drive in one row, under the palm rest.
  const beside = c0.optical ? pickBattery({ ...ctx }, c0.screen, ctx.batteryShrink, true, activeWidth(c0.screen) - 150) : undefined;
  const packs = [c0.battery, flat, ...(beside ? [beside] : [])];
  const tryOne = (c: Choices): boolean => {
    const r = settleTo(ctx, c, { ...target, z: build.size.z }, t);
    if (!r) return false;
    const b = r.build;
    if (over(b) >= over(out.build) - 3 || b.size.z > build.size.z + thicker) return false;
    out = r;
    best = c;
    return true;
  };
  search: for (const layout of [c0.layout, ...layoutsFor(ctx, c0.body, c0).filter((l) => l !== c0.layout)])
    // Side bay: the left wall runs the whole depth, the right only behind the bay, so the ports may all go left.
    for (const spread of layout === "d" ? ["asis", "spread", "left"] : ["asis", "spread"])
      for (const battery of packs) {
        if (layout === c0.layout && spread === "asis" && battery === c0.battery) continue;
        const c = clone(c0);
        c.layout = layout;
        c.battery = battery;
        // The keyboard back over the hinge strip or a rear battery, as far as it goes.
        c.kbBack = 80;
        c.ports = reseatPorts(c.ports, layout);
        if (spread === "spread") c.ports = balancedPorts(c.ports, fit);
        if (spread === "left") c.ports = c.ports.map((p) => (p.side === "right" ? { ...p, side: "left" } : p));
        tryOne(c);
        if (lidExcess(out.build) <= EXCESS_MM) break search;
      }
  if (lidExcess(out.build) > EXCESS_MM && best.pad) {
    const lim = padLimits(ctx.year);
    const c = clone(best);
    c.pad = { w: best.pad.w, d: Math.round(clamp(best.pad.d * 0.8, lim.d[0], lim.d[1])) };
    tryOne(c);
  }
  return out;
}

/**
 * Shrink the plan back to what the parts need: the settle loop only grows, and
 * a body's shape follows its size, so a chassis can end up far wider or deeper
 * than its minimum, which shows as a giant bezel around the panel.
 */
function tighten(ctx: Ctx, build: Build, fit: Fit, t: Tally): { build: Build; fit: Fit } {
  const room = ctx.who.thin ? 0.5 : 2;
  let b = build;
  let f = fit;
  for (let k = 0; k < 4; k++) {
    const x = Math.min(b.size.x, up(f.min.x + room));
    const y = Math.min(b.size.y, up(f.min.y + room));
    if (b.size.x - x < 1 && b.size.y - y < 1) break;
    const next = { ...b, size: { ...b.size, x, y } };
    const nf = counted(t, next, true);
    if (nf.problems.length > 0) break;
    b = next;
    f = nf;
  }
  return { build: b, fit: f };
}

/** One model of the line in the year. Always returns a build; `valid` says whether it solves clean. */
export function generateModel(line: Line, year: number, rng: Rng, opts: { pos?: number } = {}): Generated {
  const start = performance.now();
  const shape = shapeFor(line, year);
  const who = personaOf(line, shape, year);
  const vendors = shape.cpu.filter((v) => v !== "apple" || who.silicon);
  const pos = opts.pos ?? rng();
  const ctx: Ctx = {
    line,
    year,
    shape,
    who,
    rng,
    pos,
    trim: clamp01(BASE[who.budget] + (pos - 0.5) * 0.3),
    vendor: (rng() < 0.7 ? vendors[0] : vendors[Math.floor(rng() * vendors.length) % vendors.length]) ?? "intel",
    step: {},
    powerScale: 1,
    cut: {},
    batteryShrink: 0,
    smallStorage: false,
    lighter: false,
    protect: new Set(),
    costBias: 1,
    look: lookFor(line, year),
  };
  const t: Tally = { solves: 0, sims: 0, start };
  let c: Choices | undefined = firstChoices(ctx);
  // Start in the body that suits the picks best: some shapes cost the same parts far more thickness.
  if (!lookBody(ctx)) thinnestBody(ctx, c, t);
  let best: { build: Build; fit: Fit; score: number; c?: Choices } | undefined;
  let last: { build: Build; fit: Fit } | undefined;
  // The time budget only cuts the search short once there is a valid build to return.
  while (c && t.solves < MAX_SOLVES && (!best || performance.now() - start < MODEL_BUDGET_MS)) {
    const r = settle(ctx, c, t);
    last = r;
    if (r.fit.problems.length > 0) {
      c = fixProblems(ctx, c, r.fit.problems);
      continue;
    }
    if (t.sims >= MAX_SIMS) {
      if (!best) best = { build: r.build, fit: r.fit, score: Number.POSITIVE_INFINITY };
      break;
    }
    if (!ctx.filled) {
      ctx.filled = true;
      const diag = fillDiag(ctx, r.build);
      if (diag !== undefined) {
        c = clone(c);
        c.screen = pickScreen(ctx, false, diag);
        continue;
      }
    }
    const miss = missOf(ctx, r.build, r.fit, t);
    if (!best || miss.score < best.score) best = { build: r.build, fit: r.fit, score: miss.score, c };
    if (miss.score === 0) break;
    c = fixPriority(ctx, c, miss);
  }
  if (best) {
    best = { ...best, ...tighten(ctx, best.build, best.fit, t) };
    if (best.c) best = { ...best, ...compact(ctx, best.c, best.build, best.fit, t) };
    const build = pricedAtCost(dressed(ctx, best.build, best.fit), best.fit);
    const listPrice = best.build.price ?? 0;
    return { build, valid: true, fallback: false, solves: t.solves, sims: t.sims, ms: performance.now() - start, problems: [], listPrice, repriced: build.price !== listPrice };
  }
  // Nothing the line picked came out clean: the plainest build the year allows.
  const st: Tally = { solves: 0, sims: 0, start };
  const safe = settle({ ...ctx, step: {} }, safeChoices(ctx), st);
  t.solves += st.solves;
  const ok = safe.fit.problems.length === 0;
  const out = ok ? safe : (last ?? safe);
  const build = pricedAtCost(dressed(ctx, out.build, out.fit), out.fit);
  const listPrice = out.build.price ?? 0;
  return {
    build,
    listPrice,
    repriced: build.price !== listPrice,
    valid: ok,
    fallback: true,
    solves: t.solves,
    sims: t.sims,
    ms: performance.now() - start,
    problems: out.fit.problems,
  };
}

/** One model per line on sale in the year, the same every time for a seed. */
export function generateYear(year: number, seed: number): GeneratedYear {
  const start = performance.now();
  const models: GeneratedModel[] = [];
  let solves = 0;
  for (const line of [...linesIn(year)].sort((a, b) => a.id.localeCompare(b.id))) {
    const rng = rngOf(hashOf(seed, line.id, year));
    const g = generateModel(line, year, rng);
    solves += g.solves;
    const cpu = partById(g.build.parts.processor?.[0]?.part ?? "");
    const diag = g.build.screen?.diag ?? 14;
    const name = modelName(line, {
      n: nameFor(line, year),
      year,
      diag,
      tier: pricePlace(line, year, g.build.price ?? 0),
      vendor: cpu ? (vendorOf(cpu) ?? "intel") : "intel",
      cpuName: cpu?.name ?? "",
    });
    models.push({ ...g, id: `${line.id}-${year}`, line: line.id, maker: line.maker, name });
  }
  return { year, seed, models, solves, ms: performance.now() - start };
}

/** Where a price sits in the line's range that year, 0 to 1. */
function pricePlace(line: Line, year: number, price: number): number {
  const [lo, hi] = priceFor(line, year);
  return hi > lo ? clamp01((price - lo) / (hi - lo)) : 0.5;
}
