import { type Results, results } from "../bench";
import { type Content, CONTENT } from "../content";
import { costOf, PRICE_OVER_COST, weightOf } from "../price";
import { panelOf, ppiOf } from "../screen";
import { AMBIENT, type Measurements, simulate } from "../sim";
import { singleAt } from "../sim/curves";
import { specs as specsOf } from "../sim/specs";
import { solve } from "../solve";
import type { Build, Fit, Part } from "../types";
import { BASS_RANGE, GRILL_LOSS, LOUD_WATTS } from "../../panel/tuning";
import { speakerModel } from "../speaker";
import { connectivityOf } from "./io";
import type { HeadlineStat } from "./types";

// The market score's headline stats (GDD, Version 0.2, "Market score"): one
// positive number per stat, higher is better, from measured values and spec
// formulas only. No dice. The numbers mean nothing alone; the market score
// only ever divides one by the year's market average, so constant factors
// cancel and only the shape of each formula matters.
//
// Lower-is-better figures are inverted:
//   portability  1000 / sqrt(kg x total thickness in mm)
//   thermals     10 / sqrt(skin rise over the room x loudness in sones)
//   price        1000 / price in the year's dollars

/** One value per headline stat, higher is better, never below FLOOR. */
export type HeadlineValues = Record<HeadlineStat, number>;

/** A missing figure (no battery, no cooling yet) scores this, so a ratio never divides by zero. */
export const FLOOR = 1e-6;

/** Frame rates past this buy a buyer nothing more. */
export const FPS_CAP = 144;

/** Headline stats of a build, from its fit, simulation and benchmark results. */
export function headlineStats(
  build: Build,
  fit: Fit,
  m: Measurements,
  r: Results | null,
  content: Content = CONTENT,
): HeadlineValues {
  const kg = weightOf(build, fit, content);
  const price = build.price && build.price > 0 ? build.price : costOf(build, fit, content).total * PRICE_OVER_COST;
  const out: HeadlineValues = {
    app: appOf(build, m, content),
    games: gamesOf(r),
    battery: batteryOf(m),
    portability: 1000 / Math.sqrt(kg * (fit.frame.z + fit.lidZ)),
    display: displayOf(build, m, content),
    chassis: chassisOf(m),
    keyboard: keyboardOf(build, m, content),
    trackpad: trackpadOf(build, fit, content),
    connectivity: connectivityOf(build, m, content),
    thermals: thermalsOf(m),
    audio: audioOf(build, fit, content),
    price: 1000 / price,
  };
  for (const k of Object.keys(out) as HeadlineStat[])
    if (!Number.isFinite(out[k]) || out[k] < FLOOR) out[k] = FLOOR;
  return out;
}

/** Solves, simulates and benchmarks the build, then takes its headline stats. */
export function headlineStatsOf(build: Build, content: Content = CONTENT): HeadlineValues {
  const fit = solve(build);
  const m = simulate(build, fit, content);
  return headlineStats(build, fit, m, results(build, m, build.year, content), content);
}

function partIn(build: Build, cat: keyof Build["parts"], content: Content): Part | undefined {
  const id = build.parts[cat]?.[0]?.part;
  return id ? content.parts.find((p) => p.id === id) : undefined;
}

// ------------------------------------------------------------------ performance

/**
 * Application performance: geometric mean of single-core and multi-core
 * (Cinebench R23 scale), both at the sustained power after 30 minutes. Before
 * the cooling can be simulated, the boost figures stand in.
 */
export function appOf(build: Build, m: Measurements, content: Content): number {
  const c = m.cooling;
  const p = m.performance;
  if (!p) return 0;
  if (!c) return Math.sqrt(p.single * p.multi);
  const cpu = partIn(build, "processor", content);
  const single = cpu?.power ? singleAt(cpu.power, c.cpuWatts.sustained) : p.single;
  return Math.sqrt(single * c.sustained);
}

/**
 * Games performance: mean frame rate over the three games of the year's
 * edition at the high preset, each capped at FPS_CAP. A game that refuses to
 * run counts 0.
 */
export function gamesOf(r: Results | null): number {
  if (!r || r.games.length === 0) return 0;
  let sum = 0;
  for (const g of r.games) {
    const run = g.runs?.find((x) => x.preset === "high" && !x.native);
    sum += run ? Math.min(FPS_CAP, run.fps) : 0;
  }
  return sum / r.games.length;
}

/** Battery life: hours of web browsing in the balanced profile, the review's test. */
export function batteryOf(m: Measurements): number {
  const b = m.battery;
  return b ? (b.runtime[b.balanced]?.web ?? 0) : 0;
}

// ------------------------------------------------------------------ display

/**
 * Display, from the lab figures: a product of diminishing factors, so no one
 * figure carries the stat alone.
 *   sqrt(ppi / 100)                       sharpness
 *   sqrt(average nits / 250)              brightness
 *   sqrt(sRGB coverage)                   colour
 *   (min(contrast, 5000) / 1000) ^ 0.2    contrast; OLED is capped at 5000
 *   1 + 0.25 log2(refresh / 60)           motion
 *   3 / (3 + mean DeltaE)                 accuracy
 *   sqrt(uniformity)                      evenness
 */
export function displayOf(build: Build, m: Measurements, content: Content): number {
  const lab = m.lab.display;
  const panel = panelOf(build, content);
  if (!lab || !panel) return 0;
  // The builder realism audit's display quality slider (D10) lands in the lab's
  // DeltaE and uniformity, so it flows in here without a change. Brightness and
  // gamut are specs already (#254) and arrive through the lab the same way.
  const ppi = ppiOf(panel.inches, panel.res);
  const hz = panel.hz;
  return (
    Math.sqrt(ppi / 100) *
    Math.sqrt(lab.average / 250) *
    Math.sqrt(lab.coverage.srgb / 100) *
    (Math.min(lab.contrast, 5000) / 1000) ** 0.2 *
    (1 + 0.25 * Math.log2(Math.max(1, hz / 60))) *
    (3 / (3 + lab.deltaE.avg)) *
    Math.sqrt(lab.uniformity / 100)
  );
}

// ------------------------------------------------------------------ chassis

/**
 * Chassis and build: the case's durability index (materials and material
 * spend, lid weighted most), 0 to 1.
 */
export function chassisOf(m: Measurements): number {
  // Build-quality specs from the audit (a chassis quality or design figure,
  // if one lands) multiply in here.
  return m.durability.index;
}

// ------------------------------------------------------------------ input

const LIGHT: Record<string, number> = {
  none: 1,
  "lid-light": 1.04,
  backlit: 1.08,
  white: 1.08,
  "rgb-zones": 1.1,
  "rgb-per-key": 1.12,
};

/**
 * Keyboard, from the specs:
 *   sqrt(travel + 0.5)                   deeper keys, with diminishing returns
 *   pitch / 19                           full-size pitch is 1
 *   lighting, 1 to 1.12                  see LIGHT
 *   mechanical 1.1, numpad 1.03
 *   1 / (1 + 0.3 x wobble in mm)         loose keys rattle
 *   0.8 + 0.4 x snap                     a crisp tactile bump
 *   1 - 0.01 x |force - 58 g|            too light or too heavy
 *   1 - 0.01 x force spread in %         uneven keys
 *   1 / (1 + 0.25 x deck flex in mm)     a stiff deck
 */
export function keyboardOf(build: Build, _m: Measurements, content: Content): number {
  const kb = specsOf(build, content).keyboard;
  if (!kb) return 0;
  return (
    Math.sqrt(kb.travel + 0.5) *
    (kb.pitch / 19) *
    (LIGHT[kb.light] ?? 1) *
    (kb.mechanical ? 1.1 : 1) *
    (kb.numpad ? 1.03 : 1) *
    (1 / (1 + 0.3 * kb.wobble)) *
    (0.8 + (0.4 * kb.snap) / 100) *
    (1 - 0.01 * Math.abs(kb.force - 58)) *
    (1 - 0.01 * kb.forceSpread) *
    (1 / (1 + 0.25 * kb.flex))
  );
}

/**
 * Trackpad, from the specs:
 *   sqrt(area in cm2)                    the pad as fitted, after the size sliders
 *   haptic 1.2, clickpad 1.1, separate buttons 1
 *   0.85 + 0.15 x clickable share        clickpads that click only near the bottom
 *   1.2 - 0.6 x friction                 glass glides, mylar drags
 *   1 / (1 + rattle in mm)               play before the click
 *   Precision drivers 1.1
 *   pointing stick 1.05
 */
export function trackpadOf(build: Build, _fit: Fit, content: Content): number {
  const tp = specsOf(build, content).trackpad;
  if (!tp) return 0;
  return (
    Math.sqrt(tp.area) *
    (tp.kind === "haptic" ? 1.2 : tp.kind === "clickpad" ? 1.1 : 1) *
    (tp.kind === "buttons" ? 1 : 0.85 + (0.15 * tp.clickArea) / 100) *
    (1.2 - 0.6 * tp.friction) *
    (1 / (1 + tp.rattle)) *
    (tp.driver === "precision" ? 1.1 : 1) *
    (tp.stick ? 1.05 : 1)
  );
}

// ------------------------------------------------------------------ connectivity

export { connectivityOf };

// ------------------------------------------------------------------ thermals

/**
 * Thermals and noise, inverted: 10 / sqrt(rise x sones), where rise is the
 * hottest skin point over the room in degrees (at least 1) and sones is the
 * sustained fan noise as perceived loudness, 2 ^ ((dB(A) - 40) / 10).
 */
export function thermalsOf(m: Measurements): number {
  const c = m.cooling;
  if (!c) return 0;
  const rise = Math.max(1, c.peakSkin - AMBIENT);
  const sones = 2 ** ((c.noise.sustained - 40) / 10);
  return 10 / Math.sqrt(rise * sones);
}

// ------------------------------------------------------------------ audio

/**
 * Audio, from the same speaker model the in-game sound uses (engine/speaker.ts),
 * so the speaker quality spend counts:
 *   level      sqrt(watts / LOUD_WATTS), capped at 1, less the grill's loss
 *   bass       1 + log2(highest cutoff / cutoff), octaves of bass gained
 *   stereo 1, mono 0.7
 */
export function audioOf(build: Build, fit: Fit, content: Content): number {
  const spk = speakerModel(build, content);
  if (!spk) return 0;
  const hi = BASS_RANGE[1];
  const place = fit.shell.speakerGrill?.place ?? "none";
  const level = Math.sqrt(Math.min(1, spk.watts / LOUD_WATTS)) * 10 ** (GRILL_LOSS[place] / 20);
  return level * (1 + Math.log2(hi / spk.hp)) * (spk.count >= 2 ? 1 : 0.7);
}

// ------------------------------------------------------------------ camera

/**
 * Camera, not a headline stat but the review scores it:
 *   sqrt(megapixels)                     detail
 *   sqrt(sensor / 4.5 x 2.4 / aperture)  light gathered, the 2006 norm is 1
 *   IR 1.1
 */
export function cameraOf(build: Build, content: Content = CONTENT): number {
  const cam = specsOf(build, content).webcam;
  if (!cam) return 0;
  return Math.sqrt(cam.megapixels) * Math.sqrt((cam.sensor / 4.5) * (2.4 / cam.aperture)) * (cam.ir ? 1.1 : 1);
}
