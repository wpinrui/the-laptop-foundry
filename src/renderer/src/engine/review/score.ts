import { type Content, CONTENT } from "../content";
import {
  appOf,
  audioOf,
  batteryOf,
  cameraOf,
  chassisOf,
  connectivityOf,
  displayOf,
  gamesOf,
  keyboardOf,
  trackpadOf,
} from "../market/stats";
import type { Facts } from "./index";
import { type CategoryKey, placeOn, SCALES, scoreOn } from "./scales";
import { weightsFor } from "./weights";

// The review score (GDD, Version 0.2, "Review score"): the critics' score.
// Each category comes from its measurement or a spec formula, placed on that
// year's absolute scale (scales.ts). The overall is the class-weighted mean
// (weights.ts). Pros and cons come from the build's own scores. Nothing here
// looks at another laptop.

/** Display names, in the order the review lists them. */
export const CATEGORY_NAMES: Record<CategoryKey, string> = {
  chassis: "Chassis",
  keyboard: "Keyboard",
  pointing: "Pointing device",
  connectivity: "Connectivity",
  weight: "Weight",
  battery: "Battery life",
  display: "Display",
  games: "Games performance",
  app: "Application performance",
  temperature: "Temperature",
  noise: "Noise",
  audio: "Audio",
  camera: "Camera",
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_NAMES) as CategoryKey[];

/**
 * The measurement behind each category. Chassis, keyboard, pointing device,
 * display, audio, camera and connectivity are the market's spec formulas
 * (market/stats.ts); the rest are raw measurements: kg, web hours, mean fps
 * at high, sustained application performance, peak skin in degrees C and
 * sustained fan noise in dB(A).
 */
export function categoryValues(f: Facts, content: Content = CONTENT): Record<CategoryKey, number> {
  const b = f.subject.build;
  const c = f.m.cooling;
  return {
    chassis: chassisOf(f.m),
    keyboard: keyboardOf(b, f.m, content),
    pointing: trackpadOf(b, f.fit, content),
    connectivity: connectivityOf(b, f.m, content),
    weight: f.kg,
    battery: batteryOf(f.m),
    display: displayOf(b, f.m, content),
    games: gamesOf(f.r),
    app: appOf(b, f.m, content),
    temperature: c ? c.peakSkin : 60,
    noise: c ? c.noise.sustained : 55,
    audio: audioOf(b, f.fit, content),
    camera: cameraOf(b, content),
  };
}

export interface CategoryScore {
  key: CategoryKey;
  name: string;
  score: number;
  /** The measurement scored. */
  value: number;
  /** Where it sits on the year's scale: 0 at the low reference, 1 at the high one. */
  place: number;
  /** Its share of the overall, 0 to 1. */
  weight: number;
}

export interface Scores {
  overall: number;
  categories: CategoryScore[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The review scores of a build, from its facts. */
export function scoresFromFacts(f: Facts, content: Content = CONTENT): Scores {
  const year = f.subject.build.year;
  const values = categoryValues(f, content);
  const weights = weightsFor(f.cls);
  const categories = CATEGORY_KEYS.map((key) => ({
    key,
    name: CATEGORY_NAMES[key],
    score: round1(scoreOn(values[key], SCALES[key], year)),
    value: values[key],
    place: placeOn(values[key], SCALES[key], year),
    weight: weights[key],
  }));
  const overall = round1(categories.reduce((s, c) => s + c.score * c.weight, 0));
  return { overall, categories };
}

// ------------------------------------------------------------------ pros and cons

/** A category this good is a pro, this bad a con. */
export const PRO_AT = 88;
export const CON_AT = 65;

const PRO_CON: Record<CategoryKey, [string, string]> = {
  chassis: ["Sturdy, durable case", "Case feels flimsy"],
  keyboard: ["Comfortable keyboard", "Poor keyboard"],
  pointing: ["Precise trackpad", "Awkward trackpad"],
  connectivity: ["Plenty of fast ports", "Limited connectivity"],
  weight: ["Light and easy to carry", "Heavy to carry around"],
  battery: ["Long battery life", "Short battery life"],
  display: ["Excellent display", "Mediocre display"],
  games: ["Fast graphics", "Weak graphics"],
  app: ["Strong application performance", "Slow application performance"],
  temperature: ["Stays cool to the touch", "Gets hot to the touch"],
  noise: ["Quiet under load", "Loud under load"],
  audio: ["Full-sounding speakers", "Thin-sounding speakers"],
  camera: ["Sharp webcam", "Poor or missing webcam"],
};

export interface ProCon {
  pros: string[];
  cons: string[];
}

/**
 * Pros and cons from the build's own scores: its best and worst categories,
 * ranked by how far past the line they are and how much the class cares, plus
 * a few standout measurements. With nothing past a line, the best or worst
 * category still makes the list if it is at least fair or at most middling.
 */
export function prosAndCons(f: Facts, s: Scores): ProCon {
  type Hit = { text: string; rank: number };
  const pros: Hit[] = [];
  const cons: Hit[] = [];
  for (const c of s.categories) {
    const w = Math.sqrt(c.weight);
    if (c.score >= PRO_AT) pros.push({ text: PRO_CON[c.key][0], rank: (c.score - PRO_AT + 1) * w });
    else if (c.score < CON_AT) cons.push({ text: PRO_CON[c.key][1], rank: (CON_AT - c.score + 1) * w });
  }
  const cool = f.m.cooling;
  if (cool && cool.firstRun > 0) {
    const hold = cool.sustained / cool.firstRun;
    if (hold >= 0.97) pros.push({ text: "Holds its performance under sustained load", rank: 0.5 });
    if (hold < 0.8) cons.push({ text: "Throttles under sustained load", rank: (0.8 - hold) * 20 });
  }
  if (f.chargeSides.length >= 2) pros.push({ text: "Charges from either side", rank: 0.3 });
  if (pros.length === 0) {
    const best = [...s.categories].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 75) pros.push({ text: PRO_CON[best.key][0], rank: 0 });
  }
  if (cons.length === 0) {
    const worst = [...s.categories].sort((a, b) => a.score - b.score)[0];
    if (worst && worst.score < 78) cons.push({ text: PRO_CON[worst.key][1], rank: 0 });
  }
  const top = (xs: Hit[]) =>
    xs
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 4)
      .map((x) => x.text);
  return { pros: top(pros), cons: top(cons) };
}
