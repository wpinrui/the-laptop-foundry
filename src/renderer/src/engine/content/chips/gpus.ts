import type { Arch } from "../../sim/curves";
import type { Part, PowerSpec, Size } from "../../types";
import { ARC } from "./arc";
import { dxFeatures } from "./cpus";
import { GENERATIONS, offeredGenerations } from "./gens";
import { NVIDIA } from "./nvidia";
import { RADEON } from "./radeon";
import type { GpuRow } from "./rows";

// Discrete graphics built from the makers' spec rows, alongside the
// hand-calibrated parts in graphics.ts. Scores are Time Spy graphics points:
// the review average where there is one, else the part's FP32 throughput
// times its generation's points per GFLOPS (the median of the generation's
// measured parts, or a figure set against the neighbouring generations for
// parts that predate Time Spy).

export const GPU_ROWS: GpuRow[] = [...NVIDIA, ...RADEON, ...ARC];

/** Time Spy graphics points per FP32 GFLOPS, for generations with no measured part. */
const EFFICIENCY: Record<string, number> = {
  "nvidia-go7": 0.7,
  "nvidia-8m": 1.15,
  "nvidia-9m": 1.15,
  "nvidia-200m": 1.15,
  "nvidia-300m": 1.15,
  "nvidia-400m": 0.8,
  "nvidia-500m": 0.8,
  "nvidia-600m": 0.65,
  "nvidia-700m": 0.65,
  "nvidia-800m": 0.7,
  "radeon-x1000": 1.1,
  "radeon-hd2000": 0.6,
  "radeon-hd3000": 0.6,
  "radeon-hd4000": 0.5,
  "radeon-hd5000": 0.4,
  "radeon-hd6000m": 0.5,
  "radeon-hd7000m": 0.5,
  "radeon-hd8000m": 0.51,
};

function median(v: number[]): number | undefined {
  if (v.length === 0) return undefined;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const MEASURED: Record<string, number> = {};
for (const g of new Set(GPU_ROWS.map((r) => r.gen))) {
  const m = median(GPU_ROWS.filter((r) => r.gen === g && r.timeSpy).map((r) => (r.timeSpy as number) / r.gflops));
  if (m !== undefined) MEASURED[g] = m;
}

function scoreOf(r: GpuRow): number {
  if (r.timeSpy) return r.timeSpy;
  const eff = MEASURED[r.gen] ?? EFFICIENCY[r.gen] ?? 0.6;
  return Math.max(5, Math.round(r.gflops * eff));
}

// ------------------------------------------------------------------ power

/** Dynamic Boost era parts ship with a sustained limit under their top power. */
function powerOf(r: GpuRow): { range: [number, number]; sustained: number; boost: number; idle: number } {
  const [lo, hi] = r.tgp;
  const dynamic = r.launch[0] >= 2020;
  const sustained = dynamic ? Math.max(lo, Math.round(hi * 0.86)) : hi;
  const min = Math.min(lo, Math.round(hi * 0.6));
  return {
    range: [Math.max(3, Math.min(min, sustained)), hi],
    sustained,
    boost: hi,
    idle: Math.round(Math.min(13, Math.max(2, 2 + hi * 0.07)) * 10) / 10,
  };
}

// ------------------------------------------------------------------ board

function sizeOf(r: GpuRow): Size {
  const hi = r.tgp[1];
  switch (r.mount) {
    case "MXM-II":
      return { x: 78, y: 73, z: 7 };
    case "MXM-III":
    case "MXM-HE":
      return { x: 100, y: 82, z: 7 };
    case "MXM-A":
      return { x: 82, y: 70, z: 5 };
    case "MXM-B":
      return { x: 105, y: 82, z: 5 };
  }
  if (hi <= 30) return r.launch[0] < 2012 ? { x: 45, y: 45, z: 2 } : { x: 40, y: 40, z: 2 };
  if (hi <= 60) return { x: 45, y: 45, z: 2 };
  if (hi <= 100) return { x: 55, y: 45, z: 2 };
  if (hi <= 130) return { x: 60, y: 55, z: 2 };
  if (hi <= 160) return { x: 70, y: 65, z: 2 };
  return { x: 75, y: 70, z: 2 };
}

const sizeClass = (r: GpuRow) => (r.tgp[1] <= 35 ? "s" : r.tgp[1] <= 90 ? "m" : "l");

function archFor(r: GpuRow): Arch {
  const cls = sizeClass(r);
  const modern = r.launch[0] >= 2020;
  const rDie = cls === "s" ? 1.2 : cls === "m" ? 0.4 : modern ? 0.15 : 0.2;
  return { k: 0.5, singleShare: 1, rDie, tj: modern ? 87 : r.gen.startsWith("nvidia") ? 93 : 100, boostSeconds: 0, igpuK: 0 };
}

// ------------------------------------------------------------------ availability and price

/** Last year laptops shipped a part: while its generation is among its maker's two newest, at most three years after launch. */
function untilOf(r: GpuRow): number {
  const g = GENERATIONS.find((x) => x.id === r.gen);
  if (!g) return r.launch[0] + 3;
  let last = g.launch;
  for (let y = g.launch; y <= 2030; y++) if (offeredGenerations(g.vendor, y).some((x) => x.id === r.gen)) last = y;
  return Math.max(r.launch[0] + 1, Math.min(last, r.launch[0] + 3));
}

/** The flagship's module price, nominal dollars, by year. */
function topPrice(year: number): number {
  const a = 350;
  const b = 750;
  const c = 1600;
  if (year <= 2016) return a * (b / a) ** ((year - 2006) / 10);
  return b * (c / b) ** ((year - 2016) / 10);
}

const memText = (gb: number) => (gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb} GB`);

export interface GpuDerived {
  part: Part;
  arch: Arch;
}

function derive(r: GpuRow): GpuDerived {
  const pw = powerOf(r);
  const score = scoreOf(r);
  const arch = `${r.gen}-${sizeClass(r)}`;
  const power: PowerSpec = {
    arch,
    range: pw.range,
    sustained: pw.sustained,
    boost: pw.boost,
    rated: pw.sustained,
    idle: pw.idle,
    points: [{ watts: pw.sustained, score }],
    gpuClock: r.base === undefined ? { boost: r.boost } : { base: r.base, boost: r.boost },
  };
  const features = [...dxFeatures(r.dx), ...(r.rt && !dxFeatures(r.dx).includes("rt") ? ["rt"] : []), ...(r.upscaling ? ["upscaling"] : [])];
  const info: Record<string, string | number> = { memory: `${memText(r.memGb)} ${r.memType}`, process: r.process };
  if (r.mount !== "soldered") info.mount = r.mount;
  return {
    part: {
      id: r.id,
      name: r.name,
      category: "graphics",
      from: r.launch[0],
      until: untilOf(r),
      shape: { kind: "block", role: "gpu", size: sizeOf(r), row: 1, hot: true },
      compact: ["x", "y"],
      power,
      features,
      needs: ["dgpu"],
      ...(r.launch[0] >= 2010 ? { options: { switchable: ["yes", "no"] } } : {}),
      info,
      gen: r.gen,
    },
    arch: archFor(r),
  };
}

const DERIVED = GPU_ROWS.map(derive);

export const GPU_PARTS: Part[] = DERIVED.map((d) => d.part);

export const GPU_ARCHS: Record<string, Arch> = Object.fromEntries(DERIVED.map((d) => [d.part.power?.arch ?? "", d.arch]));

/**
 * Module price: the year's flagship price, falling off steeply with the
 * share of the year's fastest part's score.
 */
export const GPU_PRICES: Record<string, number> = (() => {
  const score = (p: Part) => p.power?.points[0]?.score ?? 0;
  const out: Record<string, number> = {};
  for (const p of GPU_PARTS) {
    const y = p.from;
    const top = Math.max(...GPU_PARTS.filter((q) => q.from <= y && y <= q.until).map(score));
    const rel = top > 0 ? score(p) / top : 0.5;
    out[p.id] = Math.max(25, Math.round(topPrice(y) * Math.exp(3 * (rel - 1))));
  }
  return out;
})();
