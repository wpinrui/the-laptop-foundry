import { type Content, CONTENT } from "../content";
import type { Build, BuildPart, OptionValue, Part, Side } from "../types";

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
}

export interface PortSpec {
  /** Connectors per side, in the order sides were first used. */
  sides: { side: Side; connectors: number; charges: boolean }[];
  total: number;
}

export interface Specs {
  keyboard: KeyboardSpec | null;
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

  let keyboard: KeyboardSpec | null = null;
  const kb = build.parts.keyboard?.[0];
  const kbPart = partOf(kb);
  if (kb && kbPart) {
    const travel = Number(/([\d.]+) mm travel/.exec(kbPart.name)?.[1] ?? 0);
    keyboard = {
      travel,
      pitch: Number(opt(kb, kbPart, "pitch") ?? 19),
      numpad: Number(opt(kb, kbPart, "cols") ?? 15) > 15,
      light: String(opt(kb, kbPart, "light") ?? "none"),
      mechanical: kbPart.name.toLowerCase().includes("mechanical"),
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
  const disp = build.parts.display?.[0];
  const panel = disp && content.panels.find((p) => p.id === disp.part);
  if (disp && panel) {
    const diag = Math.hypot(panel.res[0], panel.res[1]);
    display = {
      inches: panel.inches,
      res: panel.res,
      aspect: panel.aspect,
      ppi: Math.round(diag / panel.inches),
      type: panel.type,
      nits: panel.nits,
      refresh: Number(disp.opts?.refresh ?? panel.refresh[0] ?? 60),
      gamut: panel.gamut,
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

  return { keyboard, webcam, speakers, display, ports };
}
