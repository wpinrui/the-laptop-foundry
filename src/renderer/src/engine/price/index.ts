import { type Content, CONTENT } from "../content";
import { panelBaseCost, panelOf, type ResolvedPanel } from "../screen";
import type { Measurements } from "../sim";
import {
  type Build,
  type BuildPart,
  type Category,
  CATEGORIES,
  type Fit,
  type Part,
  PIECES,
  type Piece,
  QUALITY_KEYS,
  type QualityKey,
} from "../types";
import { pouchOf, pouchShape } from "../battery";
import { compactable } from "../compact";
import { padShapeOf, padSize, padSurface } from "../pad";
import { qualityCost } from "../quality";
import { opt } from "../units";
import { CPU_PRICES, estimatedPrice } from "../content/chips/cpus";
import { GPU_PRICES } from "../content/chips/gpus";

// Cost price, weight and device class. Costs are bill-of-materials figures in
// the build year's nominal US dollars. Spend never trades anything off, but
// every slider adds to the cost.

// ------------------------------------------------------------------ era rows

interface EraPrice {
  year: number;
  /** Retail below `low` is low budget, below `premium` is midrange. */
  budget: { low: number; premium: number };
  /** Thin and light at or under both; large at or over either. */
  body: { thinKg: number; thinMm: number; largeKg: number; largeWidth: number };
  /** Performance class cut-offs on the sustained results. */
  perf: { gamingGraphics: number; mixedGraphics: number; mixedMulti: number };
  board: number;
  assembly: number;
}

const ERA_PRICE: EraPrice[] = [
  {
    year: 2006,
    budget: { low: 900, premium: 1600 },
    body: { thinKg: 1.9, thinMm: 32, largeKg: 3.2, largeWidth: 390 },
    perf: { gamingGraphics: 100, mixedGraphics: 50, mixedMulti: 700 },
    board: 120,
    assembly: 30,
  },
  {
    year: 2016,
    budget: { low: 600, premium: 1200 },
    body: { thinKg: 1.6, thinMm: 21, largeKg: 2.7, largeWidth: 385 },
    perf: { gamingGraphics: 1600, mixedGraphics: 750, mixedMulti: 4000 },
    board: 90,
    assembly: 25,
  },
  {
    year: 2026,
    budget: { low: 800, premium: 1500 },
    body: { thinKg: 1.6, thinMm: 19, largeKg: 2.8, largeWidth: 385 },
    perf: { gamingGraphics: 8000, mixedGraphics: 4500, mixedMulti: 12000 },
    board: 80,
    assembly: 25,
  },
];

/**
 * The row for a year. Between two rows prices and sizes move in a straight
 * line; the performance cut-offs move on a log scale, as performance grew.
 */
function eraPrice(year: number): EraPrice {
  const first = ERA_PRICE[0];
  const last = ERA_PRICE[ERA_PRICE.length - 1];
  if (year <= first.year) return first;
  if (year >= last.year) return last;
  const i = ERA_PRICE.findIndex((r) => r.year > year);
  const a = ERA_PRICE[i - 1];
  const b = ERA_PRICE[i];
  if (a.year === year) return a;
  const t = (year - a.year) / (b.year - a.year);
  const lin = (x: number, y: number) => x + (y - x) * t;
  const log = (x: number, y: number) => x * (y / x) ** t;
  return {
    year,
    budget: { low: lin(a.budget.low, b.budget.low), premium: lin(a.budget.premium, b.budget.premium) },
    body: {
      thinKg: lin(a.body.thinKg, b.body.thinKg),
      thinMm: lin(a.body.thinMm, b.body.thinMm),
      largeKg: lin(a.body.largeKg, b.body.largeKg),
      largeWidth: lin(a.body.largeWidth, b.body.largeWidth),
    },
    perf: {
      gamingGraphics: log(a.perf.gamingGraphics, b.perf.gamingGraphics),
      mixedGraphics: log(a.perf.mixedGraphics, b.perf.mixedGraphics),
      mixedMulti: log(a.perf.mixedMulti, b.perf.mixedMulti),
    },
    board: lin(a.board, b.board),
    assembly: lin(a.assembly, b.assembly),
  };
}

// ------------------------------------------------------------------ part costs

const FIXED: Record<string, number> = {
  "celeron-m-430": 86,
  "core-duo-u2500": 262,
  "core-duo-t2500": 241,
  "core2-duo-t5500": 209,
  "core2-duo-t7600": 637,
  "turion64-x2-tl60": 220,
  "core5-120u": 180,
  "core-ultra7-258v": 420,
  "core-ultra7-256v": 400,
  "core-ultra5-236v": 320,
  "core-ultra-x9-388h": 600,
  "core-ultra9-275hx": 590,
  "ryzen-ai5-340": 230,
  "ryzen-ai9-hx470": 480,
  "ryzen-ai-max-395": 850,
  "ryzen9-9955hx3d": 650,
  "snapdragon-x2e-88-100": 450,
  "geforce-go-7400": 45,
  "radeon-x1400": 45,
  "geforce-go-7600": 90,
  "radeon-x1600": 90,
  "geforce-go-7900-gtx": 350,
  "rtx-5050-laptop": 250,
  "rtx-5060-laptop": 330,
  "rtx-5070-laptop": 420,
  "rtx-5070ti-laptop": 600,
  "rtx-5080-laptop": 950,
  "rtx-5090-laptop": 1600,
  // 32 GB on the processor package.
  "core-m3-6y30": 281,
  "core-i5-6200u": 281,
  "core-i7-6500u": 393,
  "core-i7-7500u": 393,
  "core-i7-6700hq": 378,
  "core-i7-7700hq": 378,
  "a10-9600p": 150,
  "geforce-940mx": 60,
  "radeon-r7-m460": 55,
  "geforce-gtx-960m": 150,
  "geforce-gtx-970m": 280,
  "geforce-gtx-1060-laptop": 300,
  "geforce-gtx-1070-laptop": 480,
  "geforce-gtx-1080-laptop": 750,
  "dvd-rw-slim-2016": 18,
  "bd-combo-slim": 45,
  "wifi-n-draft": 25,
  "wifi-n-bt3": 18,
  "wifi-n-bt4": 15,
  "wifi-6": 12,
  displayport: 4,
  "hdmi-2.0": 3,
  "esata-usb": 3,
  "usb-c-5g": 3,
  "thunderbolt-1": 15,
  "thunderbolt-2": 18,
  "wifi-ac": 15,
  "kb-2.0": 16,
  "pad-100x56": 10,
  "pad-105x70": 12,
  "pad-130x80": 18,
  "spk-stereo-2016": 5,
  "spk-stereo-2016-sub": 12,
  "hdmi-1.4": 3,
  "mini-dp": 4,
  "thunderbolt-3": 20,
  "bay-battery": 70,
  "bridge-battery": 25,
  fanless: 5,
  "one-fan": 14,
  "two-fans": 32,
  "vapour-chamber": 45,
  combo: 30,
  "dvd-rw-dl": 45,
  "dvd-rw-slim-2006": 60,
  "bd-writer": 400,
  "hd-dvd": 300,
  "dvd-rw-slim": 20,
  "bd-writer-slim": 60,
  "wifi-bg": 15,
  "wifi-abg": 22,
  "wifi-6e": 12,
  "wifi-7": 18,
  "kb-2.5": 15,
  "kb-3.0": 12,
  "kb-1.0": 18,
  "kb-1.5": 15,
  "kb-mech-1.8": 60,
  "kb-mech-3.5": 80,
  "cam-720p-ir": 12,
  "pad-65x40": 8,
  "pad-75x45": 10,
  "pad-85x50": 12,
  "pad-110x70": 15,
  "pad-125x80": 20,
  "pad-145x90": 30,
  "pad-160x100": 40,
  "cam-0.3mp": 10,
  "cam-1.3mp": 15,
  "cam-720p": 4,
  "cam-1080p": 8,
  "cam-1080p-ir": 15,
  "cam-5mp-ir": 25,
  "spk-mono": 2,
  "spk-stereo-2006": 5,
  "spk-stereo-sub": 15,
  "spk-stereo-2026": 6,
  "spk-quad": 14,
  "spk-six": 25,
  "dc-jack": 2,
  vga: 2,
  "dvi-d": 4,
  "s-video": 2,
  "hdmi-1.3": 3,
  "hdmi-2.1": 4,
  "ethernet-100": 5,
  "ethernet-1g": 6,
  "ethernet-2.5g": 8,
  "ethernet-drop-jaw": 7,
  "modem-rj11": 8,
  "usb-a-2.0": 1,
  "usb-a-5g": 2,
  "usb-a-10g": 3,
  "usb-c-10g": 4,
  "usb4-40g": 12,
  "thunderbolt-4": 15,
  "thunderbolt-5": 25,
  "firewire-400": 4,
  "pc-card": 10,
  "expresscard-34": 8,
  "expresscard-54": 8,
  "sd-reader": 4,
  "sd-reader-uhs2": 7,
  "microsd-reader": 3,
  "headphone-mic": 1,
  "audio-combo": 1,
  "lock-slot": 1,
};

/** Per gigabyte and per module, for memory. */
const MEMORY: Record<string, { gb: number; module: number }> = {
  "ddr2-667-sodimm": { gb: 100, module: 10 },
  "ddr2-800-sodimm": { gb: 40, module: 8 },
  "ddr3-1066-sodimm": { gb: 20, module: 6 },
  "ddr3-1333-sodimm": { gb: 10, module: 5 },
  "ddr3-1600-sodimm": { gb: 8, module: 5 },
  "ddr3l-1600-sodimm": { gb: 8, module: 5 },
  "ddr4-2133-sodimm": { gb: 6, module: 5 },
  "ddr4-2400-sodimm": { gb: 7, module: 5 },
  "ddr4-2666-sodimm": { gb: 6, module: 5 },
  "ddr4-3200-sodimm": { gb: 4, module: 5 },
  "lpddr4x-soldered": { gb: 5, module: 0 },
  "ddr5-4800-sodimm": { gb: 7, module: 5 },
  "lpddr5-soldered": { gb: 6, module: 0 },
  "ddr5-6400-sodimm": { gb: 11, module: 5 },
  "lpddr3-soldered": { gb: 7, module: 0 },
  "ddr5-5600-sodimm": { gb: 10, module: 5 },
  lpcamm2: { gb: 12, module: 10 },
  "apple-unified": { gb: 5, module: 0 },
  "lpddr5x-soldered": { gb: 9, module: 0 },
};

/** Base plus per gigabyte, for storage. */
const STORAGE: Record<string, { base: number; gb: number }> = {
  "hdd25-5400": { base: 45, gb: 0.5 },
  "hdd25-7200": { base: 60, gb: 0.6 },
  hdd18: { base: 70, gb: 1 },
  "ssd18-pata": { base: 50, gb: 12.5 },
  "hdd25-5400-2010": { base: 40, gb: 0.08 },
  "hdd25-7200-2010": { base: 50, gb: 0.1 },
  "hdd25-2016": { base: 40, gb: 0.03 },
  "msata-ssd": { base: 20, gb: 0.8 },
  "m2-2280-sata": { base: 15, gb: 0.25 },
  "m2-2280-g3": { base: 20, gb: 0.35 },
  "ssd25-sata": { base: 15, gb: 0.07 },
  "m2-2280-g4": { base: 15, gb: 0.08 },
  "m2-2280-g5": { base: 25, gb: 0.12 },
  "m2-2242-g4": { base: 25, gb: 0.08 },
  "m2-2230-g4": { base: 25, gb: 0.08 },
};

/** Dollars per watt-hour. */
const BATTERY: Record<string, number> = {
  "li-ion-18650": 1.2,
  "slim-li-po-2006": 1.8,
  "li-po-pouch-2012": 0.9,
  "li-po-pouch": 0.5,
};

const LIGHT: Record<string, number> = {
  none: 0,
  "lid-light": 5,
  backlit: 12,
  white: 6,
  "rgb-zones": 15,
  "rgb-per-key": 40,
};

/** Capacity and cell thickness: thin cells cost more per Wh. */
function batteryOf(part: Part, bp: BuildPart, year: number, spend: number): { wh: number; thin: number } {
  const cells = opt(part, bp, "cells");
  if (cells !== undefined) return { wh: Number(part.info?.[`wh${cells}`] ?? 0), thin: 1 };
  const shape = pouchShape(part);
  if (!shape) return { wh: 0, thin: 1 };
  const p = pouchOf(part, shape, bp, year, spend);
  // Five percent more per Wh for every millimetre under 5.5 mm.
  return { wh: p.wh, thin: 1 + 0.05 * Math.max(0, 5.5 - p.size.z) };
}

/**
 * Trackpad technologies: a base and a price per square centimetre of touch
 * surface, and what glass adds per square centimetre. Older size parts keep
 * their fixed prices.
 */
const PAD_RATE: Record<string, { base: number; cm2: number }> = {
  "pad-buttons": { base: 6, cm2: 0.06 },
  "pad-clickpad": { base: 8, cm2: 0.08 },
  "pad-haptic": { base: 25, cm2: 0.15 },
};
const GLASS_CM2 = 0.06;

function partCost(
  cat: Category,
  part: Part,
  bp: BuildPart,
  year: number,
  packageGb?: number,
  spend = 0,
  build?: Build,
): number {
  const o = (k: string) => opt(part, bp, k);
  switch (cat) {
    case "memory": {
      // On-package memory: its size is the processor's, 32 GB costs $150.
      if (part.id === "lpddr5x-on-package") return ((packageGb ?? 32) * 150) / 32;
      const m = MEMORY[part.id];
      if (!m) return FIXED[part.id] ?? 0;
      const slots = Number(o("slots") ?? 1);
      return Number(o("capacity") ?? 0) * m.gb + slots * m.module;
    }
    case "storage": {
      const s = STORAGE[part.id] ?? { base: 30, gb: 0.1 };
      // A 2.5 inch SATA SSD cost about four times as much per gigabyte in
      // 2016, and far more before that.
      const flash = part.id !== "ssd25-sata" ? 1 : year < 2012 ? 15 : year < 2014 ? 8 : year < 2020 ? 4 : 1;
      return s.base + Number(o("capacity") ?? 0) * s.gb * flash;
    }
    case "battery": {
      const perWh = BATTERY[part.id] ?? 1;
      const b = batteryOf(part, bp, year, spend);
      return b.wh * perWh * b.thin + 5;
    }
    case "wireless":
      return (FIXED[part.id] ?? 15) + (o("bluetooth") === "2.0" ? 8 : 0);
    case "keyboard":
      return (
        (FIXED[part.id] ?? 15) +
        (LIGHT[String(o("light") ?? "none")] ?? 0) +
        (Number(o("cols")) === 19 ? 2 : 0)
      );
    case "trackpad": {
      const rate = PAD_RATE[part.id];
      const stick = o("stick") === "yes" ? 8 : 0;
      if (!rate) return (FIXED[part.id] ?? 12) + (o("mechanism") === "haptic" ? 25 : 0) + stick;
      const shape = padShapeOf(part);
      const size = build?.parts.trackpad?.[0]?.part === part.id ? padSize(build) : undefined;
      const cm2 = ((size?.w ?? shape?.x ?? 100) * (size?.d ?? shape?.y ?? 60)) / 100;
      const glass = padSurface(part, bp, year) === "glass" && part.options?.surface ? GLASS_CM2 * cm2 : 0;
      return rate.base + rate.cm2 * cm2 + glass + stick;
    }
    case "webcam":
      return (FIXED[part.id] ?? 8) + (o("shutter") === "yes" ? 1 : 0);
    // Switching needs a multiplexer and the drivers to hand the screen over.
    case "graphics":
      return (FIXED[part.id] ?? GPU_PRICES[part.id] ?? 0) + (o("switchable") === "yes" ? 5 : 0);
    case "processor":
      return FIXED[part.id] ?? CPU_PRICES[part.id] ?? estimated(part);
    // A chosen fan size costs a little more or less than a 60 mm fan and its fins, per fan.
    case "cooling": {
      const d = o("fan");
      const shape = Array.isArray(part.shape) ? part.shape[0] : part.shape;
      const count = shape.kind === "fan" ? shape.count : 0;
      const extra = typeof d === "number" ? count * 0.12 * (d - 60) : 0;
      return Math.max(0, (FIXED[part.id] ?? 0) + extra);
    }
    default:
      return FIXED[part.id] ?? 0;
  }
}

const estimates = new Map<string, number>();

/** A processor with no published price: what its performance went for that year. */
function estimated(part: Part): number {
  let v = estimates.get(part.id);
  if (v === undefined) {
    v = estimatedPrice(part);
    estimates.set(part.id, v);
  }
  return v;
}

// ------------------------------------------------------------------ body

const MARK_COST: Record<string, number> = { etched: 1.5, printed: 0.5, embossed: 2.5 };

/** Dollars per square decimetre of piece face. */
const MATERIAL: Record<string, number> = {
  plastic: 0.6,
  magnesium: 2,
  aluminium: 2.5,
  cfrp: 4,
};
const FINISH: Record<string, number> = {
  matte: 0,
  glossy: 0.2,
  "soft-touch": 0.5,
  brushed: 0.4,
  anodised: 0.3,
};
/** Grams per cubic centimetre of each unit's box. */
const DENSITY: Record<string, number> = {
  battery: 2,
  board: 1,
  keys: 1,
  pad: 0.6,
  panel: 1.1,
  odd: 0.9,
  drive: 1.5,
  fan: 0.3,
  fin: 4,
  spk: 0.8,
  hinge: 5,
  inverter: 1,
  webcam: 0.5,
  kblight: 1,
  cpu: 2,
};
const BLOCK_DENSITY = 1.5;
const PORT_DENSITY = 0.8;

// ------------------------------------------------------------------ public

export interface CostLine {
  what: Category | "port" | "board" | "body" | "spend" | "assembly";
  usd: number;
}

export interface Cost {
  total: number;
  lines: CostLine[];
}

/** Cost price of a resolved screen: the panel, the premium when it is custom, and its brightness and gamut past the panel's own. */
export function screenPrice(panel: ResolvedPanel): number {
  const base = panelBaseCost(panel, panel.hz);
  return Math.max(base * 0.7, base + panel.upgrade) + panel.premium;
}

/** Cost price of one chosen part, in the year's nominal dollars. */
export function partPrice(
  cat: Category,
  bp: BuildPart,
  year: number,
  content: Content = CONTENT,
  build?: Build,
): number {
  if (cat === "display") return 0;
  const p = content.parts.find((x) => x.id === bp.part);
  const gb = build && cat === "memory" ? packageGb(build, content) : undefined;
  return p ? partCost(cat, p, bp, year, gb, build?.spend[cat] ?? 0, build) : 0;
}

/** Memory on the build's processor package in GB, when its processor carries it. */
export function packageGb(build: Build, content: Content = CONTENT): number | undefined {
  const cpu = content.parts.find((p) => p.id === build.parts.processor?.[0]?.part);
  const gb = cpu?.info?.onPackageGb;
  return typeof gb === "number" ? gb : undefined;
}

/** Cost price of the build in the year's nominal dollars. */
export function costOf(
  build: Build,
  fit: Fit,
  content: Content = CONTENT,
): Cost {
  const era = eraPrice(build.year);
  const lines: CostLine[] = [];
  const add = (what: CostLine["what"], usd: number) => {
    if (usd > 0) lines.push({ what, usd });
  };
  let spend = 0;
  for (const cat of CATEGORIES) {
    if (cat === "display") {
      const panel = panelOf(build, content);
      if (!panel) continue;
      const c = screenPrice(panel);
      // Calibration and binning cost more on a dear panel.
      add(cat, c + qualityCost(build, "display", 0.3 * c));
      spend += (build.spend.display ?? 0) * (15 + 0.3 * c);
      continue;
    }
    const list = build.parts[cat] ?? [];
    let catCost = 0;
    for (const bp of list) {
      catCost += partPrice(cat, bp, build.year, content, build);
    }
    // Quality spend on the area, on top of the part.
    if (list.length > 0 && (QUALITY_KEYS as string[]).includes(cat)) catCost += qualityCost(build, cat as QualityKey);
    add(cat, catCost);
    // Compacting a part costs more on a dear part. A standard form factor has nothing to compact.
    const s = build.spend[cat] ?? 0;
    if (list.some((bp) => compactable(content.parts.find((p) => p.id === bp.part)))) spend += s * (15 + 0.3 * catCost);
  }
  add(
    "port",
    build.ports.reduce((sum, p) => sum + (FIXED[p.part] ?? 3), 0),
  );
  const hx = content.parts.find(
    (p) => p.id === build.parts.processor?.[0]?.part,
  );
  const chipset = Array.isArray(hx?.shape)
    ? hx.shape.some((s) => s.kind === "block" && s.role === "chipset")
    : false;
  add("board", era.board + (chipset && build.year > 2012 ? 40 : 0));

  const { x, y } = fit.frame;
  const dm2 = (x * y) / 1e4;
  let body = 0;
  for (const piece of PIECES) {
    const rate =
      (MATERIAL[build.materials[piece]] ?? 1) +
      (FINISH[build.finish[piece].texture] ?? 0);
    body += dm2 * rate;
  }
  // Marks: a laser pass, a print or a press die each.
  for (const m of build.marks ?? []) body += MARK_COST[m.process] ?? 1;
  add("body", body + 10);
  spend += (build.spend.packing ?? 0) * 60 + (build.spend.material ?? 0) * 80;
  add("spend", spend);
  add("assembly", era.assembly);
  return { total: lines.reduce((s, l) => s + l.usd, 0), lines };
}

/** What one shell piece costs and weighs: its material and finish over its faces. */
export function pieceOf(build: Build, fit: Fit, piece: Piece, content: Content = CONTENT): { usd: number; grams: number } {
  const { x, y, z } = fit.frame;
  const w = fit.shell.walls;
  const usd = ((x * y) / 1e4) * ((MATERIAL[build.materials[piece]] ?? 1) + (FINISH[build.finish[piece].texture] ?? 0));
  const mm3 =
    piece === "floor"
      ? x * y * w.bottom
      : piece === "deck"
        ? x * y * w.top + 2 * (x + y) * z * w.side
        : x * y * (w.lid + w.lidFront) + 2 * (x + y) * fit.lidZ * w.lid;
  const density = content.materials.find((m) => m.id === build.materials[piece])?.density ?? 1.2;
  return { usd, grams: ((mm3 / 1000) * density * 1.08) };
}

/** Weight in kilograms: every unit by its box, plus the shell by material. */
export function weightOf(
  build: Build,
  fit: Fit,
  content: Content = CONTENT,
): number {
  let grams = 0;
  for (const b of fit.boxes) {
    if (b.kind !== "unit") continue;
    const cm3 = (b.size.x * b.size.y * b.size.z) / 1000;
    const role = String(b.role);
    const d = role.startsWith("port:")
      ? PORT_DENSITY
      : role.startsWith("bezel")
        ? 0
        : (DENSITY[role] ?? BLOCK_DENSITY);
    grams += cm3 * d;
  }
  // Heat pipes per fan, and the chamber plate.
  const fans = fit.boxes.filter((b) => b.kind === "unit" && b.role === "fan");
  grams += fans.length * 40;
  const cooling = content.parts.find(
    (p) => p.id === build.parts.cooling?.[0]?.part,
  );
  const shape = Array.isArray(cooling?.shape) ? cooling.shape[0] : cooling?.shape;
  if (shape?.kind === "fan" && shape.chamber) grams += 150;
  if (shape?.kind === "fan" && shape.count === 0) grams += 30;
  const density = (piece: Piece) =>
    content.materials.find((m) => m.id === build.materials[piece])?.density ??
    1.2;
  const { x, y, z } = fit.frame;
  const w = fit.shell.walls;
  const mm3 = {
    floor: x * y * w.bottom,
    deck: x * y * w.top + 2 * (x + y) * z * w.side,
    lid: x * y * (w.lid + w.lidFront) + 2 * (x + y) * fit.lidZ * w.lid,
  };
  for (const piece of PIECES) grams += (mm3[piece] / 1000) * density(piece);
  // Screws, brackets, cables and tape.
  return (grams * 1.08) / 1000;
}

export type Budget = "low" | "midrange" | "premium";
export type BodyClass = "thin and light" | "medium" | "large";
export type PerfClass = "office" | "mixed-use" | "gaming";

export interface DeviceClass {
  budget: Budget | null;
  body: BodyClass;
  performance: PerfClass | null;
}

/** The class the game assigns. Budget waits for a price; performance for the cooling results. */
export function classify(
  build: Build,
  fit: Fit,
  m: Measurements,
  weightKg: number,
): DeviceClass {
  const era = eraPrice(build.year);
  let budget: Budget | null = null;
  if (build.price !== undefined && build.price > 0)
    budget =
      build.price < era.budget.low
        ? "low"
        : build.price < era.budget.premium
          ? "midrange"
          : "premium";

  const thickness = fit.frame.z + fit.lidZ;
  const t = era.body;
  const body: BodyClass =
    weightKg >= t.largeKg || fit.frame.x >= t.largeWidth
      ? "large"
      : weightKg <= t.thinKg && thickness <= t.thinMm
        ? "thin and light"
        : "medium";

  let performance: PerfClass | null = null;
  const c = m.cooling;
  if (c) {
    const g = c.graphics.sustained;
    performance =
      g >= era.perf.gamingGraphics
        ? "gaming"
        : g >= era.perf.mixedGraphics || c.sustained >= era.perf.mixedMulti
          ? "mixed-use"
          : "office";
  }
  return { budget, body, performance };
}
