import type { Build, QualityKey } from "./types";

// Quality spend. Past what a part gives, a maker can pay for better tuning,
// binning, materials and assembly. Each figure moves from the part's own
// toward the era's best along an eased curve, 1 - (1 - q)^2, so the last
// steps give least; the cost grows with the square of q, so they cost most.

/** The build's quality spend on an area, 0 to 1. */
export function qualityOf(build: Build, key: QualityKey): number {
  const v = build.quality?.[key];
  if (v === undefined || !Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** How far toward the best a spend of q gets. */
export function eased(q: number): number {
  return 1 - (1 - q) ** 2;
}

/** The eased quality of an area. */
export function qualityEffect(build: Build, key: QualityKey): number {
  return eased(qualityOf(build, key));
}

/** A figure that moves in a straight line between dated points, flat past the ends. */
export function byYear(year: number, points: [number, number][]): number {
  if (year <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [y1, v1] = points[i];
    if (year <= y1) {
      const [y0, v0] = points[i - 1];
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** Worst to best at an eased quality e. */
export function between(worst: number, best: number, e: number): number {
  return worst + (best - worst) * e;
}

/** Dollars of full quality spend per area; a spend of q costs q squared of it. The display's grows with the panel. */
const QUALITY_COST: Record<QualityKey, number> = {
  display: 20,
  keyboard: 25,
  trackpad: 20,
  speakers: 20,
  webcam: 12,
};

/** Cost of an area's quality spend, nominal dollars. `extra` is added to the full-spend cost first. */
export function qualityCost(build: Build, key: QualityKey, extra = 0): number {
  const q = qualityOf(build, key);
  return (QUALITY_COST[key] + extra) * q * q;
}
