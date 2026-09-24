import { CONTENT, type Content } from "./content";
import type {
  Build,
  BuildPart,
  Category,
  OptionValue,
  Piece,
  Side,
} from "./types";

type PartSpec = string | [string, Record<string, OptionValue>];

interface Spec {
  year: number;
  body: string;
  layout: string;
  parts: Partial<Record<Category, PartSpec | PartSpec[]>>;
  ports: [string, Side][];
  materials?: Partial<Record<Piece, string>>;
  spend?: Build["spend"];
}

function toParts(spec: Spec["parts"]): Build["parts"] {
  const out: Build["parts"] = {};
  for (const [cat, v] of Object.entries(spec) as [
    Category,
    PartSpec | PartSpec[],
  ][]) {
    const list =
      Array.isArray(v) &&
      (v.length === 0 || typeof v[1] !== "object" || Array.isArray(v[0]))
        ? (v as PartSpec[])
        : [v as PartSpec];
    out[cat] = list.map(
      (p): BuildPart =>
        typeof p === "string" ? { part: p } : { part: p[0], opts: p[1] },
    );
  }
  return out;
}

/** Make a build from a compact spec, at the body's default size. */
export function makeBuild(spec: Spec, content: Content = CONTENT): Build {
  const body = content.bodies.find((b) => b.id === spec.body);
  const mat = {
    floor: "plastic",
    deck: "plastic",
    lid: "plastic",
    ...spec.materials,
  };
  const texture = (m: string) =>
    content.materials.find((x) => x.id === m)?.finishes[0] ?? "matte";
  return {
    year: spec.year,
    body: spec.body,
    layout: spec.layout,
    size: body ? { ...body.size } : { x: 300, y: 220, z: 20 },
    parts: toParts(spec.parts),
    ports: spec.ports.map(([part, side]) => ({ part, side })),
    materials: mat,
    finish: {
      floor: { colour: "black", texture: texture(mat.floor) },
      deck: { colour: "black", texture: texture(mat.deck) },
      lid: { colour: "black", texture: texture(mat.lid) },
    },
    spend: { ...spec.spend },
  };
}

export interface Sample {
  id: string;
  name: string;
  build: Build;
  /** Real machine of the era for comparison, outer size x by y by total thickness. */
  real: string;
}

const s = (id: string, name: string, real: string, spec: Spec): Sample => ({
  id,
  name,
  real,
  build: makeBuild(spec),
});

export const SAMPLES: Sample[] = [
  s(
    "t60",
    "2006 15.4 inch business, Workhorse, layout B",
    "ThinkPad T60 15.4 inch: about 357 x 262 x 31 to 36",
    {
      year: 2006,
      body: "workhorse",
      layout: "b",
      parts: {
        processor: "core-duo-t2500",
        graphics: "radeon-x1400",
        memory: ["ddr2-667-sodimm", { capacity: 1, slots: 2 }],
        storage: "hdd25-5400",
        display: "2006-15.4-1680x1050-tn-matte",
        battery: ["li-ion-18650", { cells: 6 }],
        cooling: "one-fan",
        optical: "dvd-rw-slim-2006",
        wireless: ["wifi-abg", { bluetooth: "2.0" }],
        keyboard: ["kb-2.5", { cols: 15, pitch: 19, light: "lid-light" }],
        trackpad: ["pad-65x40", { stick: "yes" }],
        speakers: "spk-stereo-2006",
      },
      ports: [
        ["vga", "left"],
        ["usb-a-2.0", "left"],
        ["expresscard-34", "left"],
        ["dc-jack", "right"],
        ["ethernet-1g", "right"],
        ["modem-rj11", "right"],
        ["usb-a-2.0", "right"],
        ["headphone-mic", "right"],
        ["lock-slot", "right"],
      ],
      materials: { floor: "plastic", deck: "plastic", lid: "magnesium" },
    },
  ),
  s(
    "dtr-2006",
    "2006 17 inch desktop replacement, Pillow, layout B",
    "Dell XPS M1710: about 394 x 286 x 43",
    {
      year: 2006,
      body: "pillow",
      layout: "b",
      parts: {
        processor: "core2-duo-t7600",
        graphics: "geforce-go-7900-gtx",
        memory: ["ddr2-667-sodimm", { capacity: 2, slots: 2 }],
        storage: [
          ["hdd25-7200", { capacity: 100 }],
          ["hdd25-7200", { capacity: 100 }],
        ],
        display: "2006-17-1920x1200-tn-glossy",
        battery: ["li-ion-18650", { cells: 12 }],
        cooling: "two-fans",
        optical: "dvd-rw-dl",
        wireless: ["wifi-abg", { bluetooth: "2.0" }],
        keyboard: ["kb-3.0", { cols: 19, pitch: 19, light: "none" }],
        trackpad: "pad-85x50",
        webcam: "cam-1.3mp",
        speakers: "spk-stereo-sub",
      },
      ports: [
        ["dc-jack", "left"],
        ["vga", "left"],
        ["usb-a-2.0", "left"],
        ["ethernet-1g", "right"],
        ["usb-a-2.0", "right"],
        ["firewire-400", "right"],
        ["expresscard-54", "right"],
        ["headphone-mic", "front"],
        ["s-video", "front"],
      ],
    },
  ),
  s(
    "dtr-2006-a",
    "2006 17 inch desktop replacement, Pillow, layout A: one drive, no optical",
    "Dell XPS M1710: about 394 x 286 x 43",
    {
      year: 2006,
      body: "pillow",
      layout: "a",
      parts: {
        processor: "core2-duo-t7600",
        graphics: "geforce-go-7900-gtx",
        memory: ["ddr2-667-sodimm", { capacity: 2, slots: 2 }],
        storage: ["hdd25-7200", { capacity: 100 }],
        display: "2006-17-1920x1200-tn-glossy",
        battery: ["li-ion-18650", { cells: 12 }],
        cooling: "two-fans",
        wireless: ["wifi-abg", { bluetooth: "2.0" }],
        keyboard: ["kb-3.0", { cols: 19, pitch: 19, light: "none" }],
        trackpad: "pad-85x50",
        webcam: "cam-1.3mp",
        speakers: "spk-stereo-sub",
      },
      ports: [
        ["usb-a-2.0", "left"],
        ["firewire-400", "left"],
        ["expresscard-54", "left"],
        ["headphone-mic", "left"],
        ["usb-a-2.0", "right"],
        ["usb-a-2.0", "right"],
        ["dc-jack", "rear"],
        ["vga", "rear"],
        ["dvi-d", "rear"],
        ["ethernet-1g", "rear"],
        ["s-video", "rear"],
      ],
    },
  ),
  s(
    "ultraportable-2006",
    "2006 12.1 inch ultraportable, Workhorse, layout B",
    "ThinkPad X60s: about 268 x 211 x 21 to 28",
    {
      year: 2006,
      body: "workhorse",
      layout: "b",
      parts: {
        processor: "core-duo-u2500",
        memory: ["ddr2-667-sodimm", { capacity: 1, slots: 1 }],
        storage: "hdd18",
        display: "2006-12.1-1024x768-tn-matte",
        battery: ["li-ion-18650", { cells: 4 }],
        cooling: "one-fan",
        wireless: "wifi-abg",
        keyboard: ["kb-2.5", { cols: 15, pitch: 17 }],
        trackpad: ["pad-65x40", { stick: "yes" }],
        speakers: "spk-mono",
      },
      ports: [
        ["vga", "left"],
        ["usb-a-2.0", "left"],
        ["dc-jack", "right"],
        ["ethernet-1g", "right"],
        ["usb-a-2.0", "right"],
        ["headphone-mic", "front"],
      ],
      materials: { floor: "magnesium", deck: "magnesium", lid: "magnesium" },
    },
  ),
  s(
    "ultrabook-14",
    "2026 14 inch ultrabook, Blade, layout A",
    "Asus Zenbook S 14 (258V): about 310 x 215 x 12 to 13",
    {
      year: 2026,
      body: "blade",
      layout: "a",
      parts: {
        processor: "core-ultra7-258v",
        memory: "lpddr5x-on-package",
        storage: "m2-2280-g4",
        display: ["2026-14-2880x1800-oled", { refresh: 120 }],
        battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
        cooling: "two-fans",
        wireless: "wifi-7",
        keyboard: "kb-1.0",
        trackpad: ["pad-125x80", { mechanism: "haptic" }],
        webcam: "cam-1080p-ir",
        speakers: "spk-stereo-2026",
      },
      ports: [
        ["usb4-40g", "left"],
        ["usb4-40g", "left"],
        ["hdmi-2.1", "left"],
        ["usb-a-5g", "right"],
        ["audio-combo", "right"],
      ],
      materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
    },
  ),
  s(
    "thinnest-13",
    "2026 13.3 inch thinnest, Blade, layout A, all spend at 1",
    "Asus Zenbook S 13 OLED: about 296 x 216 x 11",
    {
      year: 2026,
      body: "blade",
      layout: "a",
      parts: {
        processor: "core-ultra7-258v",
        memory: "lpddr5x-on-package",
        storage: "m2-2230-g4",
        display: "2026-13.3-2880x1800-oled",
        battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
        cooling: "fanless",
        wireless: "wifi-7",
        keyboard: "kb-1.0",
        trackpad: ["pad-110x70", { mechanism: "haptic" }],
        webcam: "cam-720p",
        speakers: "spk-stereo-2026",
      },
      ports: [
        ["usb4-40g", "left"],
        ["usb4-40g", "right"],
      ],
      materials: { floor: "magnesium", deck: "magnesium", lid: "magnesium" },
      spend: {
        material: 1,
        packing: 1,
        battery: 1,
        display: 1,
        speakers: 1,
        webcam: 1,
        processor: 1,
      },
    },
  ),
  s(
    "gaming-16",
    "2026 16 inch gaming, Workhorse, layout A",
    "Lenovo Legion Pro 7i 16: about 363 x 262 x 22 to 27",
    {
      year: 2026,
      body: "workhorse",
      layout: "a",
      parts: {
        processor: "core-ultra9-275hx",
        graphics: "rtx-5070ti-laptop",
        memory: ["ddr5-5600-sodimm", { capacity: 32, slots: 2 }],
        storage: ["m2-2280-g4", "m2-2280-g4"],
        display: ["2026-16-2560x1600-ips", { refresh: 240 }],
        battery: ["li-po-pouch", { wh: 99.9, thickness: "standard" }],
        cooling: "vapour-chamber",
        wireless: "wifi-7",
        keyboard: ["kb-1.5", { cols: 19, pitch: 18, light: "rgb-zones" }],
        trackpad: "pad-125x80",
        webcam: "cam-1080p",
        speakers: "spk-quad",
      },
      ports: [
        ["usb-a-10g", "left"],
        ["usb-c-10g", "left"],
        ["audio-combo", "left"],
        ["dc-jack", "rear"],
        ["hdmi-2.1", "rear"],
        ["ethernet-2.5g", "rear"],
        ["thunderbolt-5", "rear"],
        ["usb-a-10g", "right"],
        ["sd-reader-uhs2", "right"],
      ],
      materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
    },
  ),
  s(
    "flagship-18",
    "2026 18 inch RTX 5090, Workhorse, layout A",
    "Asus ROG Strix SCAR 18: about 399 x 298 x 23 to 31",
    {
      year: 2026,
      body: "workhorse",
      layout: "a",
      parts: {
        processor: "core-ultra9-275hx",
        graphics: "rtx-5090-laptop",
        memory: ["ddr5-5600-sodimm", { capacity: 64, slots: 2 }],
        storage: ["m2-2280-g5", "m2-2280-g5"],
        display: ["2026-18-3840x2400-mini-led", { refresh: 240 }],
        battery: ["li-po-pouch", { wh: 90, thickness: "standard" }],
        cooling: "vapour-chamber",
        wireless: "wifi-7",
        keyboard: [
          "kb-mech-1.8",
          { cols: 19, pitch: 19, light: "rgb-per-key" },
        ],
        trackpad: "pad-145x90",
        webcam: "cam-1080p",
        speakers: "spk-quad",
      },
      ports: [
        ["usb-a-10g", "left"],
        ["usb-a-10g", "left"],
        ["audio-combo", "left"],
        ["dc-jack", "rear"],
        ["hdmi-2.1", "rear"],
        ["ethernet-2.5g", "rear"],
        ["thunderbolt-5", "rear"],
        ["thunderbolt-5", "right"],
        ["usb-c-10g", "right"],
      ],
      materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
    },
  ),
  s(
    "no-fit",
    "2026 18 inch RTX 5090 on Blade, layout A (should not fit)",
    "No real machine: an 18 inch panel is wider than the Blade allows",
    {
      year: 2026,
      body: "blade",
      layout: "a",
      parts: {
        processor: "core-ultra9-275hx",
        graphics: "rtx-5090-laptop",
        memory: ["ddr5-5600-sodimm", { capacity: 64, slots: 2 }],
        storage: ["m2-2280-g5", "m2-2280-g5"],
        display: ["2026-18-3840x2400-mini-led", { refresh: 240 }],
        battery: ["li-po-pouch", { wh: 99.9, thickness: "standard" }],
        cooling: "vapour-chamber",
        wireless: "wifi-7",
        keyboard: ["kb-mech-1.8", { cols: 19, pitch: 19 }],
        trackpad: "pad-145x90",
        speakers: "spk-quad",
      },
      ports: [
        ["dc-jack", "rear"],
        ["ethernet-2.5g", "rear"],
        ["thunderbolt-5", "left"],
      ],
      materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
    },
  ),
];
