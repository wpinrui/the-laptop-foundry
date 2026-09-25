import type { PowerSpec } from "../types";

// One formula per architecture: score = a * P^k, a concave power law that
// gives diminishing returns as power rises, capped at the part's top power.
// The part's `a` is fitted to its curated points in log space with the
// architecture's k. Single-core runs at full score once the core gets
// `singleShare` of the rated power, and falls off with the square root below.

export interface Arch {
  /** Exponent of the multi-core (or graphics) power law. */
  k: number;
  /** Power one core needs for full single-core boost, as a share of rated power. */
  singleShare: number;
  /** Die to heat sink resistance, kelvin per watt. */
  rDie: number;
  /** Die temperature limit, degrees Celsius. */
  tj: number;
  /** How long the boost limit holds under full load, seconds. */
  boostSeconds: number;
  /** Exponent of integrated graphics against package power. */
  igpuK: number;
}

export const ARCHS: Record<string, Arch> = {
  yonah: { k: 0.42, singleShare: 0.6, rDie: 0.9, tj: 100, boostSeconds: 0, igpuK: 0 },
  merom: { k: 0.42, singleShare: 0.6, rDie: 0.85, tj: 100, boostSeconds: 0, igpuK: 0 },
  k8: { k: 0.45, singleShare: 0.6, rDie: 0.8, tj: 95, boostSeconds: 0, igpuK: 0 },
  "skylake-y": { k: 0.45, singleShare: 1.0, rDie: 2.5, tj: 100, boostSeconds: 28, igpuK: 0.5 },
  "skylake-u": { k: 0.45, singleShare: 1.2, rDie: 1.4, tj: 100, boostSeconds: 28, igpuK: 0.5 },
  "skylake-h": { k: 0.4, singleShare: 0.5, rDie: 0.6, tj: 100, boostSeconds: 28, igpuK: 0.4 },
  "bristol-ridge": { k: 0.45, singleShare: 1.0, rDie: 1.2, tj: 95, boostSeconds: 60, igpuK: 0.5 },
  maxwell: { k: 0.5, singleShare: 1, rDie: 0.4, tj: 93, boostSeconds: 0, igpuK: 0 },
  pascal: { k: 0.5, singleShare: 1, rDie: 0.2, tj: 93, boostSeconds: 0, igpuK: 0 },
  gcn: { k: 0.5, singleShare: 1, rDie: 0.8, tj: 100, boostSeconds: 0, igpuK: 0 },
  "raptor-lake-u": { k: 0.45, singleShare: 1.6, rDie: 1.4, tj: 100, boostSeconds: 28, igpuK: 0.5 },
  "lunar-lake": { k: 0.45, singleShare: 0.8, rDie: 1.4, tj: 100, boostSeconds: 28, igpuK: 0.5 },
  "panther-lake": { k: 0.42, singleShare: 1.0, rDie: 1.0, tj: 100, boostSeconds: 28, igpuK: 0.5 },
  "arrow-lake-hx": { k: 0.35, singleShare: 0.6, rDie: 0.28, tj: 105, boostSeconds: 56, igpuK: 0.3 },
  "zen5-mobile": { k: 0.4, singleShare: 0.8, rDie: 1.0, tj: 100, boostSeconds: 60, igpuK: 0.5 },
  "strix-halo": { k: 0.4, singleShare: 0.5, rDie: 0.25, tj: 100, boostSeconds: 60, igpuK: 0.55 },
  "fire-range": { k: 0.35, singleShare: 0.6, rDie: 0.3, tj: 95, boostSeconds: 60, igpuK: 0.2 },
  oryon: { k: 0.42, singleShare: 0.7, rDie: 1.0, tj: 100, boostSeconds: 30, igpuK: 0.5 },
  curie: { k: 0.5, singleShare: 1, rDie: 1.2, tj: 100, boostSeconds: 0, igpuK: 0 },
  r500: { k: 0.5, singleShare: 1, rDie: 1.2, tj: 100, boostSeconds: 0, igpuK: 0 },
  blackwell: { k: 0.5, singleShare: 1, rDie: 0.12, tj: 87, boostSeconds: 0, igpuK: 0 },
};

export function archOf(spec: PowerSpec): Arch {
  return ARCHS[spec.arch] ?? ARCHS["zen5-mobile"];
}

const clampPower = (spec: PowerSpec, p: number) =>
  Math.min(spec.range[1], Math.max(0, p));

function coefficient(spec: PowerSpec, k: number): number {
  if (spec.points.length === 0) return 0;
  const mean =
    spec.points.reduce(
      (sum, pt) => sum + Math.log(pt.score) - k * Math.log(pt.watts),
      0,
    ) / spec.points.length;
  return Math.exp(mean);
}

/** Multi-core (processor) or graphics (discrete graphics) score at a power. */
export function scoreAt(spec: PowerSpec, watts: number): number {
  const { k } = archOf(spec);
  const p = clampPower(spec, watts);
  return coefficient(spec, k) * p ** k;
}

/** Single-core score when the processor may draw this much. */
export function singleAt(spec: PowerSpec, watts: number): number {
  const need = archOf(spec).singleShare * spec.rated;
  const f = Math.min(1, Math.max(0, watts) / need);
  return (spec.single ?? 0) * Math.sqrt(f);
}

/** Integrated graphics score at a package power. */
export function igpuAt(spec: PowerSpec, watts: number): number {
  if (!spec.igpu) return 0;
  const ratio = Math.min(1.5, Math.max(0, watts) / spec.igpu.watts);
  return spec.igpu.score * ratio ** archOf(spec).igpuK;
}
