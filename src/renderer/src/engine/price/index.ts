import { type Content, CONTENT } from "../content";
import { activeArea } from "../content/display";
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
} from "../types";
import { opt } from "../units";

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
    perf: { gamingGraphics: 3000, mixedGraphics: 1000, mixedMulti: 2500 },
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

function eraPrice(year: number): EraPrice {
  let row = ERA_PRICE[0];
  for (const r of ERA_PRICE) if (r.year <= year) row = r;
  return row;
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
  "lpddr5x-on-package": 150,
  "bay-battery": 70,
  "bridge-battery": 25,
  fanless: 5,
  "one-fan": 14,
  "two-fans": 26,
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
  "ddr5-5600-sodimm": { gb: 10, module: 5 },
  lpcamm2: { gb: 12, module: 10 },
  "lpddr5x-soldered": { gb: 9, module: 0 },
};

/** Base plus per gigabyte, for storage. */
const STORAGE: Record<string, { base: number; gb: number }> = {
  "hdd25-5400": { base: 45, gb: 0.5 },
  "hdd25-7200": { base: 60, gb: 0.6 },
  hdd18: { base: 70, gb: 1 },
  "ssd18-pata": { base: 50, gb: 12.5 },
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

/** Panel dollars per square decimetre, and per megapixel. */
const PANEL: Record<string, { dm2: number; mp: number }> = {
  "tn-matte": { dm2: 18, mp: 20 },
  "tn-glossy": { dm2: 19, mp: 20 },
  "ips-type": { dm2: 30, mp: 25 },
  ips: { dm2: 7, mp: 8 },
  oled: { dm2: 16, mp: 8 },
  "mini-led": { dm2: 30, mp: 10 },
};

function batteryWh(part: Part, bp: BuildPart): number {
  const cells = opt(part, bp, "cells");
  if (cells !== undefined) return Number(part.info?.[`wh${cells}`] ?? 0);
  return Number(opt(part, bp, "wh") ?? 0);
}

function partCost(cat: Category, part: Part, bp: BuildPart): number {
  const o = (k: string) => opt(part, bp, k);
  switch (cat) {
    case "memory": {
      const m = MEMORY[part.id];
      if (!m) return FIXED[part.id] ?? 0;
      const slots = Number(o("slots") ?? 1);
      return Number(o("capacity") ?? 0) * m.gb + slots * m.module;
    }
    case "storage": {
      const s = STORAGE[part.id] ?? { base: 30, gb: 0.1 };
      return s.base + Number(o("capacity") ?? 0) * s.gb;
    }
    case "battery": {
      const perWh = BATTERY[part.id] ?? 1;
      const slim = o("thickness") === "slim" ? 1.1 : 1;
      return batteryWh(part, bp) * perWh * slim + 5;
    }
    case "wireless":
      return (FIXED[part.id] ?? 15) + (o("bluetooth") === "2.0" ? 8 : 0);
    case "keyboard":
      return (
        (FIXED[part.id] ?? 15) +
        (LIGHT[String(o("light") ?? "none")] ?? 0) +
        (Number(o("cols")) === 19 ? 2 : 0)
      );
    case "trackpad":
      return (
        (FIXED[part.id] ?? 12) +
        (o("mechanism") === "haptic" ? 25 : 0) +
        (o("stick") === "yes" ? 8 : 0)
      );
    case "webcam":
      return (FIXED[part.id] ?? 8) + (o("shutter") === "yes" ? 1 : 0);
    default:
      return FIXED[part.id] ?? 0;
  }
}

// ------------------------------------------------------------------ body

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
  const part = (id: string) => content.parts.find((p) => p.id === id);

  let spend = 0;
  for (const cat of CATEGORIES) {
    const list = build.parts[cat] ?? [];
    let catCost = 0;
    for (const bp of list) {
      if (cat === "display") {
        const panel = content.panels.find((p) => p.id === bp.part);
        if (!panel) continue;
        const a = activeArea(panel);
        const rate = PANEL[panel.type] ?? { dm2: 10, mp: 10 };
        const mp = (panel.res[0] * panel.res[1]) / 1e6;
        const hz = Number(bp.opts?.refresh ?? panel.refresh[0]);
        catCost +=
          ((a.x * a.y) / 1e4) * rate.dm2 +
          mp * rate.mp +
          Math.max(0, (hz - 60) / 60) * 15;
        continue;
      }
      const p = part(bp.part);
      if (p) catCost += partCost(cat, p, bp);
    }
    add(cat, catCost);
    // Compacting a part costs more on a dear part.
    const s = build.spend[cat] ?? 0;
    if (list.length > 0) spend += s * (15 + 0.3 * catCost);
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
  add("body", body + 10);
  spend += (build.spend.packing ?? 0) * 60 + (build.spend.material ?? 0) * 80;
  add("spend", spend);
  add("assembly", era.assembly);
  return { total: lines.reduce((s, l) => s + l.usd, 0), lines };
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
