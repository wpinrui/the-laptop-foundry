import type { Budget, BodyClass, DeviceClass, PerfClass } from "../price";
import type { CategoryKey } from "./scales";

// How much each category counts toward the overall review score, per device
// class. A class is budget x body x performance (GDD, "Device classes"); a
// category's weight is the product of its three axis factors, normalised so
// a class's weights sum to 1. All the tuning is in the one table below.
//
//   performance  gaming leans on games, temperature and noise; office on
//                keyboard, battery and connectivity; mixed-use on the processor
//   body         thin and light leans on weight and battery; large forgives both
//   budget       premium buyers expect the chassis, display and extras to shine;
//                low-budget critics forgive the extras

type Axis = Record<CategoryKey, number>;

export const CLASS_WEIGHTS: {
  performance: Record<PerfClass, Axis>;
  body: Record<BodyClass, Axis>;
  budget: Record<Budget, Axis>;
} = {
  performance: {
    office: { chassis: 1, keyboard: 1.4, pointing: 1.1, connectivity: 1.2, weight: 1, battery: 1.4, display: 1, games: 0.15, app: 0.8, temperature: 0.9, noise: 1, audio: 0.6, camera: 0.9 },
    "mixed-use": { chassis: 1, keyboard: 1, pointing: 1, connectivity: 1, weight: 0.9, battery: 1, display: 1.2, games: 0.6, app: 1.3, temperature: 1, noise: 1, audio: 0.8, camera: 0.6 },
    gaming: { chassis: 0.9, keyboard: 1, pointing: 0.5, connectivity: 0.8, weight: 0.5, battery: 0.5, display: 1.2, games: 2.2, app: 1.1, temperature: 1.4, noise: 1.2, audio: 0.8, camera: 0.3 },
  },
  body: {
    "thin and light": { chassis: 1.1, keyboard: 1, pointing: 1.1, connectivity: 0.9, weight: 2, battery: 1.5, display: 1, games: 1, app: 1, temperature: 1, noise: 1, audio: 1, camera: 1.1 },
    medium: { chassis: 1, keyboard: 1, pointing: 1, connectivity: 1, weight: 1, battery: 1, display: 1, games: 1, app: 1, temperature: 1, noise: 1, audio: 1, camera: 1 },
    large: { chassis: 1, keyboard: 1.1, pointing: 1, connectivity: 1.1, weight: 0.4, battery: 0.6, display: 1.1, games: 1, app: 1, temperature: 0.9, noise: 1, audio: 1.1, camera: 0.9 },
  },
  budget: {
    low: { chassis: 0.8, keyboard: 1, pointing: 1, connectivity: 0.9, weight: 1, battery: 1, display: 0.8, games: 1, app: 1.1, temperature: 1, noise: 1, audio: 0.6, camera: 0.6 },
    midrange: { chassis: 1, keyboard: 1, pointing: 1, connectivity: 1, weight: 1, battery: 1, display: 1, games: 1, app: 1, temperature: 1, noise: 1, audio: 1, camera: 1 },
    premium: { chassis: 1.3, keyboard: 1.1, pointing: 1.1, connectivity: 1, weight: 1, battery: 1, display: 1.3, games: 1, app: 1, temperature: 1, noise: 1, audio: 1.2, camera: 1.2 },
  },
};

/** Normalised category weights for a class. An unpriced build counts as midrange; one not yet cooled as mixed-use. */
export function weightsFor(cls: DeviceClass): Record<CategoryKey, number> {
  const p = CLASS_WEIGHTS.performance[cls.performance ?? "mixed-use"];
  const b = CLASS_WEIGHTS.body[cls.body];
  const g = CLASS_WEIGHTS.budget[cls.budget ?? "midrange"];
  const keys = Object.keys(p) as CategoryKey[];
  const raw = Object.fromEntries(keys.map((k) => [k, p[k] * b[k] * g[k]])) as Record<CategoryKey, number>;
  const sum = keys.reduce((s, k) => s + raw[k], 0);
  for (const k of keys) raw[k] /= sum;
  return raw;
}
