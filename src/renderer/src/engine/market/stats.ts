import { type Results, results } from "../bench";
import { type Content, CONTENT } from "../content";
import { costOf, weightOf } from "../price";
import { panelOf, ppiOf } from "../screen";
import { AMBIENT, type Measurements, simulate } from "../sim";
import { singleAt } from "../sim/curves";
import { specs as specsOf } from "../sim/specs";
import { solve } from "../solve";
import type { Build, Fit, Part } from "../types";
import { BASS_K, BASS_RANGE, DSP_BASS, DSP_FROM, GRILL_LOSS, LOUD_WATTS, SPEAKER_WATTS, SPEAKER_WATTS_DEFAULT } from "../../panel/tuning";
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

/** Retail price over part cost when the player has not set a price, as the review assumes. */
export const PRICE_OVER_COST = 1.3;

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

function opt(build: Build, cat: keyof Build["parts"], part: Part | undefined, key: string): string | undefined {
  const v = build.parts[cat]?.[0]?.opts?.[key] ?? part?.options?.[key]?.[0];
  return v === undefined ? undefined : String(v);
}

// ------------------------------------------------------------------ performance

/**
 * Application performance: geometric mean of single-core and multi-core
 * (Cinebench R23 scale), both at the sustained power after 30 minutes. Before
 * the cooling can be simulated, the boost figures stand in.
 */
function appOf(build: Build, m: Measurements, content: Content): number {
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
function gamesOf(r: Results | null): number {
  if (!r || r.games.length === 0) return 0;
  let sum = 0;
  for (const g of r.games) {
    const run = g.runs?.find((x) => x.preset === "high" && !x.native);
    sum += run ? Math.min(FPS_CAP, run.fps) : 0;
  }
  return sum / r.games.length;
}

/** Battery life: hours of web browsing in the balanced profile, the review's test. */
function batteryOf(m: Measurements): number {
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
function displayOf(build: Build, m: Measurements, content: Content): number {
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
function chassisOf(m: Measurements): number {
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
 *   0.8 + 0.2 x deck durability          a stiff deck flexes less
 */
function keyboardOf(build: Build, m: Measurements, content: Content): number {
  const kb = specsOf(build, content).keyboard;
  if (!kb) return 0;
  // Audit K1 adds key wobble (mm), snap ratio (%), actuation force (g) and
  // deck flex (mm) as specs. Each becomes one more factor here; deck flex
  // replaces the durability term below.
  return (
    Math.sqrt(kb.travel + 0.5) *
    (kb.pitch / 19) *
    (LIGHT[kb.light] ?? 1) *
    (kb.mechanical ? 1.1 : 1) *
    (kb.numpad ? 1.03 : 1) *
    (0.8 + 0.2 * m.durability.deck)
  );
}

/** From this year a pad with no finish chosen is glass (types.ts, Build.pad). */
const GLASS_FROM = 2015;

/**
 * Trackpad:
 *   sqrt(area in cm2)                    the pad as fitted, after the size sliders
 *   haptic 1.2, clickpad 1.1, separate buttons 1
 *   glass 1.1, matte plastic 1
 *   pointing stick 1.05
 */
function trackpadOf(build: Build, fit: Fit, content: Content): number {
  const part = partIn(build, "trackpad", content);
  if (!part) return 0;
  const shape = !Array.isArray(part.shape) && part.shape.kind === "pad" ? part.shape : undefined;
  const w = fit.place.pad?.w ?? shape?.x ?? 0;
  const d = fit.place.pad?.d ?? shape?.y ?? 0;
  const mechanism = opt(build, "trackpad", part, "mechanism");
  const buttons = opt(build, "trackpad", part, "buttons");
  const stick = opt(build, "trackpad", part, "stick") === "yes";
  const glass = (build.pad?.finish ?? (build.year >= GLASS_FROM ? "glass" : "matte")) === "glass";
  // Audit T1 to T5 turn the parts into the technology (buttons, clickpad,
  // haptic) and add clickable share (%), friction, rattle (mm) and driver
  // (Precision or not) as specs, with the surface as a dated spec. Those
  // replace the mechanism and surface factors here.
  return (
    Math.sqrt((w * d) / 100) *
    (mechanism === "haptic" ? 1.2 : buttons === "clickpad" ? 1.1 : 1) *
    (glass ? 1.1 : 1) *
    (stick ? 1.05 : 1)
  );
}

// ------------------------------------------------------------------ connectivity

/** Signalling rate per port, Gbit/s. Power, lock and audio carry no data worth counting. */
const PORT_GBPS: Record<string, number> = {
  "dc-jack": 0,
  vga: 0.5,
  "dvi-d": 1,
  "s-video": 0.2,
  "hdmi-1.3": 3,
  "hdmi-1.4": 5,
  "mini-dp": 8,
  displayport: 8,
  "hdmi-2.0": 14,
  "hdmi-2.1": 40,
  "ethernet-100": 0.1,
  "ethernet-1g": 1,
  "ethernet-2.5g": 2.5,
  "ethernet-drop-jaw": 1,
  "modem-rj11": 0.05,
  "usb-a-2.0": 0.48,
  "usb-a-5g": 5,
  "usb-a-10g": 10,
  "esata-usb": 3,
  "usb-c-5g": 5,
  "usb-c-10g": 10,
  "usb4-40g": 40,
  "thunderbolt-1": 10,
  "thunderbolt-2": 20,
  "thunderbolt-3": 40,
  "thunderbolt-4": 40,
  "thunderbolt-5": 80,
  "firewire-400": 0.4,
  "pc-card": 1,
  "expresscard-34": 2.5,
  "expresscard-54": 2.5,
  "sd-reader": 0.8,
  "sd-reader-uhs2": 2.5,
  "microsd-reader": 0.8,
  "headphone-mic": 0,
  "audio-combo": 0,
  "lock-slot": 0,
};

/**
 * Connectivity, a sum of points:
 *   each connector    0.5 + log2(1 + Gbit/s); the DC jack scores 0
 *   charging from two sides   +1
 *   Wi-Fi             log2(1 + measured receive Mbit/s / 10)
 *   Bluetooth         +1
 */
function connectivityOf(build: Build, m: Measurements, content: Content): number {
  let points = 0;
  const chargeSides = new Set<string>();
  for (const bp of build.ports) {
    const part = content.parts.find((p) => p.id === bp.part);
    const shape = part && !Array.isArray(part.shape) && part.shape.kind === "port" ? part.shape : undefined;
    if (shape?.charges) chargeSides.add(bp.side);
    if (bp.part === "dc-jack") continue;
    const n = shape?.count ?? 1;
    const gbps = PORT_GBPS[bp.part] ?? 1;
    points += n * (0.5 + Math.log2(1 + gbps));
  }
  if (chargeSides.size >= 2) points += 1;
  if (m.lab.wifi) points += Math.log2(1 + m.lab.wifi.receive / 10);
  const wl = partIn(build, "wireless", content);
  if (wl) {
    const bt = opt(build, "wireless", wl, "bluetooth");
    if (bt && bt !== "none") points += 1;
  }
  return points;
}

// ------------------------------------------------------------------ thermals

/**
 * Thermals and noise, inverted: 10 / sqrt(rise x sones), where rise is the
 * hottest skin point over the room in degrees (at least 1) and sones is the
 * sustained fan noise as perceived loudness, 2 ^ ((dB(A) - 40) / 10).
 */
function thermalsOf(m: Measurements): number {
  const c = m.cooling;
  if (!c) return 0;
  const rise = Math.max(1, c.peakSkin - AMBIENT);
  const sones = 2 ** ((c.noise.sustained - 40) / 10);
  return 10 / Math.sqrt(rise * sones);
}

// ------------------------------------------------------------------ audio

/**
 * Audio, from the same speaker model the in-game sound uses (panel/speaker.ts):
 *   level      sqrt(watts / LOUD_WATTS), capped at 1, less the grill's loss
 *   bass       1 + log2(highest cutoff / cutoff), octaves of bass gained
 *   stereo 1, mono 0.7
 */
function audioOf(build: Build, fit: Fit, content: Content): number {
  const part = partIn(build, "speakers", content);
  if (!part) return 0;
  const shapes = Array.isArray(part.shape) ? part.shape : [part.shape];
  let area = 0;
  let count = 0;
  for (const s of shapes)
    if (s.kind === "box")
      for (const u of s.units) {
        const d = [u.size.x, u.size.y, u.size.z].sort((a, b) => b - a);
        area += d[0] * d[1] * (u.count ?? 1);
        count += u.count ?? 1;
      }
  area = Math.max(area, 200);
  const [lo, hi] = BASS_RANGE;
  const hp = Math.min(hi, Math.max(lo, (BASS_K / Math.sqrt(area)) * (part.from >= DSP_FROM ? DSP_BASS : 1)));
  const watts = SPEAKER_WATTS[part.id] ?? SPEAKER_WATTS_DEFAULT;
  const place = fit.shell.speakerGrill?.place ?? "none";
  const level = Math.sqrt(Math.min(1, watts / LOUD_WATTS)) * 10 ** (GRILL_LOSS[place] / 20);
  // Audit S1's speaker quality slider (lower bass cutoff, higher level) feeds
  // hp and level here once it lands, the same way it feeds the in-game sound.
  return level * (1 + Math.log2(hi / hp)) * (count >= 2 ? 1 : 0.7);
}
