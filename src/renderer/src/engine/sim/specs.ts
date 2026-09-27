import { type Content, CONTENT } from "../content";
import { padMechanism, padButtons, padShapeOf, padSize, padSurface } from "../pad";
import { between, byYear, qualityEffect, qualityOf } from "../quality";
import { panelOf } from "../screen";
import type { Build, BuildPart, OptionValue, Part, Side } from "../types";
import { durabilityOf } from "./index";

// Raw figures that need only the parts themselves, so the builder can show
// them as soon as each part is chosen, long before cooling can be simulated.

export interface KeyboardSpec {
  /** Key travel, mm. */
  travel: number;
  /** Key pitch, mm. */
  pitch: number;
  numpad: boolean;
  /** Lighting option id: none, lid-light, backlit, white, rgb-zones, rgb-per-key. */
  light: string;
  mechanical: boolean;
  /** Quality spend, 0 to 1. */
  quality: number;
  /** Side-to-side play at a key's corner, mm. */
  wobble: number;
  /** Tactile snap: the force drop after the bump over the peak, %. */
  snap: number;
  /** Actuation force, g. */
  force: number;
  /** Spread of actuation force across the keys, %. */
  forceSpread: number;
  /** Deck flex under a 1 kg press in the middle of the keyboard, mm. */
  flex: number;
}

export interface TrackpadSpec {
  kind: "buttons" | "clickpad" | "haptic";
  surface: "mylar" | "glass";
  /** Touch surface, mm. */
  width: number;
  depth: number;
  /** Touch surface, cm2. */
  area: number;
  stick: boolean;
  /** Windows Precision Touchpad drivers, or the maker's own. */
  driver: "precision" | "legacy";
  /** Quality spend, 0 to 1. */
  quality: number;
  /** Share of the surface that clicks, %. 0 where separate buttons do the clicking. */
  clickArea: number;
  /** Sliding friction of a fingertip on the surface, coefficient. */
  friction: number;
  /** Play of the surface before it clicks, mm. */
  rattle: number;
}

export interface WebcamSpec {
  res: [number, number];
  megapixels: number;
  ir: boolean;
  shutter: boolean;
}

export interface SpeakerSpec {
  drivers: number;
  channels: "mono" | "stereo";
  /** Woofers or a subwoofer. */
  bass: boolean;
}

export interface DisplaySpec {
  inches: number;
  res: [number, number];
  aspect: [number, number];
  ppi: number;
  type: string;
  nits: number;
  refresh: number;
  gamut: string;
  /** HDR peak, cd/m2; null without HDR. */
  peak: number | null;
}

export interface PortSpec {
  /** Connectors per side, in the order sides were first used. */
  sides: { side: Side; connectors: number; charges: boolean }[];
  total: number;
}

export interface Specs {
  keyboard: KeyboardSpec | null;
  trackpad: TrackpadSpec | null;
  webcam: WebcamSpec | null;
  speakers: SpeakerSpec | null;
  display: DisplaySpec | null;
  ports: PortSpec | null;
}

const CAMERA_RES: Record<string, [number, number]> = {
  "0.3 MP": [640, 480],
  "1.3 MP": [1280, 1024],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "5 MP": [2592, 1944],
};

function opt(bp: BuildPart, part: Part, key: string): OptionValue | undefined {
  return bp.opts?.[key] ?? part.options?.[key]?.[0];
}

function unitsOf(p: Part): number {
  const shapes = Array.isArray(p.shape) ? p.shape : [p.shape];
  let n = 0;
  for (const s of shapes)
    if (s.kind === "box") for (const u of s.units) n += u.count ?? 1;
  return n;
}

export function specs(build: Build, content: Content = CONTENT): Specs {
  const partOf = (bp: BuildPart | undefined) =>
    bp ? content.parts.find((p) => p.id === bp.part) : undefined;

  const year = build.year;
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // Keyboard quality buys stiffer scissors and stabilisers, tuned domes and a
  // stiffer key plate. The best a maker could do improved over the years.
  let keyboard: KeyboardSpec | null = null;
  const kb = build.parts.keyboard?.[0];
  const kbPart = partOf(kb);
  if (kb && kbPart) {
    const travel = Number(/([\d.]+) mm travel/.exec(kbPart.name)?.[1] ?? 0);
    const mechanical = kbPart.name.toLowerCase().includes("mechanical");
    const e = qualityEffect(build, "keyboard");
    const wobble = between(byYear(year, [[2006, 0.9], [2026, 0.7]]), byYear(year, [[2006, 0.3], [2016, 0.2], [2026, 0.12]]), e);
    const deck = durabilityOf(build, content).deck;
    keyboard = {
      travel,
      pitch: Number(opt(kb, kbPart, "pitch") ?? 19),
      numpad: Number(opt(kb, kbPart, "cols") ?? 15) > 15,
      light: String(opt(kb, kbPart, "light") ?? "none"),
      mechanical,
      quality: qualityOf(build, "keyboard"),
      wobble: r2(wobble * (mechanical ? 0.7 : 1)),
      snap: Math.round(mechanical ? between(45, 55, e) : between(30, 55, e)),
      force: mechanical ? (travel > 3 ? 55 : 60) : travel >= 2.5 ? 60 : travel >= 2 ? 58 : travel >= 1.5 ? 57 : 55,
      forceSpread: Math.round(between(18, 5, e)),
      flex: r2((0.4 + 1.4 * (1 - deck)) * (1 - 0.6 * e)),
    };
  }

  // Trackpad quality buys a better hinge and click, a finer surface finish and
  // tighter assembly. Precision drivers came with Windows 8.1 (2013) on the
  // better pads and on every pad by 2017.
  let trackpad: TrackpadSpec | null = null;
  const tp = build.parts.trackpad?.[0];
  const tpPart = partOf(tp);
  const size = padSize(build, content);
  if (tp && tpPart && padShapeOf(tpPart) && size) {
    const q = qualityOf(build, "trackpad");
    const e = qualityEffect(build, "trackpad");
    const kind = padButtons(tpPart, tp) ? "buttons" : padMechanism(tpPart, tp) === "haptic" ? "haptic" : "clickpad";
    const surface = padSurface(tpPart, tp, year);
    trackpad = {
      kind,
      surface,
      width: Math.round(size.w),
      depth: Math.round(size.d),
      area: Math.round((size.w * size.d) / 100),
      stick: opt(tp, tpPart, "stick") === "yes",
      driver: year >= 2017 || (year >= 2013 && q >= 0.5) ? "precision" : "legacy",
      quality: q,
      clickArea: kind === "haptic" ? 100 : kind === "buttons" ? 0 : Math.round(between(55, 85, e)),
      friction: r2(surface === "glass" ? between(0.3, 0.2, e) : between(0.45, 0.35, e)),
      rattle: r2(kind === "haptic" ? 0 : kind === "buttons" ? between(0.1, 0.02, e) : between(0.3, 0.03, e)),
    };
  }

  let webcam: WebcamSpec | null = null;
  const cam = build.parts.webcam?.[0];
  const camPart = partOf(cam);
  if (cam && camPart) {
    const key = camPart.name.replace(/ with IR$/, "");
    const res = CAMERA_RES[key] ?? [640, 480];
    webcam = {
      res,
      megapixels: Math.round((res[0] * res[1]) / 100000) / 10,
      ir: camPart.name.includes("IR"),
      shutter: opt(cam, camPart, "shutter") === "yes",
    };
  }

  let speakers: SpeakerSpec | null = null;
  const spkPart = partOf(build.parts.speakers?.[0]);
  if (spkPart) {
    const drivers = unitsOf(spkPart);
    speakers = {
      drivers,
      channels: spkPart.name.startsWith("Mono") ? "mono" : "stereo",
      bass: /sub|woofer/i.test(spkPart.name),
    };
  }

  let display: DisplaySpec | null = null;
  const panel = panelOf(build, content);
  if (panel) {
    const diag = Math.hypot(panel.res[0], panel.res[1]);
    display = {
      inches: panel.inches,
      res: panel.res,
      aspect: panel.aspect,
      ppi: Math.round(diag / panel.inches),
      type: panel.type,
      nits: panel.nits,
      refresh: panel.hz,
      gamut: panel.gamut,
      peak: panel.peak ?? null,
    };
  }

  let ports: PortSpec | null = null;
  if (build.ports.length > 0) {
    const sides: PortSpec["sides"] = [];
    let total = 0;
    for (const bp of build.ports) {
      const part = content.parts.find((p) => p.id === bp.part);
      const shape = part && !Array.isArray(part.shape) ? part.shape : undefined;
      const n = shape?.kind === "port" ? (shape.count ?? 1) : 1;
      const charges = shape?.kind === "port" && !!shape.charges;
      let s = sides.find((x) => x.side === bp.side);
      if (!s) {
        s = { side: bp.side, connectors: 0, charges: false };
        sides.push(s);
      }
      s.connectors += n;
      s.charges ||= charges;
      total += n;
    }
    ports = { sides, total };
  }

  return { keyboard, trackpad, webcam, speakers, display, ports };
}
