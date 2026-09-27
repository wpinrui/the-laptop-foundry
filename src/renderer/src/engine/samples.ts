import { CONTENT, type Content } from "./content";
import { migrateScreen } from "./screen";
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
  /** Outer size x, y and base z in mm; the body's default size when absent. */
  size?: [number, number, number];
  /** The body's signature setting, 0 to 1; the body's middle when absent. */
  shape?: number;
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

/** Make a build from a compact spec, at its size or else the body's default size. */
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
  return migrateScreen({
    year: spec.year,
    body: spec.body,
    layout: spec.layout,
    size: spec.size
      ? { x: spec.size[0], y: spec.size[1], z: spec.size[2] }
      : body
        ? { ...body.size }
        : { x: 300, y: 220, z: 20 },
    parts: toParts(spec.parts),
    ports: spec.ports.map(([part, side]) => ({ part, side })),
    materials: mat,
    finish: {
      floor: { colour: "black", texture: texture(mat.floor) },
      deck: { colour: "black", texture: texture(mat.deck) },
      lid: { colour: "black", texture: texture(mat.lid) },
    },
    spend: { ...spec.spend },
    shape: spec.shape === undefined ? {} : { [spec.body]: spec.shape },
  });
}

export interface Sample {
  id: string;
  name: string;
  build: Build;
  /** Real machine of the era for comparison, outer size x by y by total thickness. */
  real: string;
  /**
   * The real machine's total thickness (base plus lid), thinnest to thickest,
   * in mm. The fit check holds the engine's minimum within 2 mm of it.
   */
  thickness: [number, number] | null;
}

const s = (
  id: string,
  name: string,
  real: string,
  thickness: [number, number] | null,
  spec: Spec,
): Sample => ({ id, name, real, thickness, build: makeBuild(spec) });

export const SAMPLES: Sample[] = [
  s(
    "t60",
    "2006 15.4 inch business, full T60 port set, Workhorse, layout B",
    "ThinkPad T60 15.4 inch: about 357 x 268 x 31 to 36",
    [31, 36],
    {
      year: 2006,
      body: "workhorse",
      layout: "b",
      size: [376, 317, 23.5],
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
      // Full T60 set: 3 USB, VGA, gigabit Ethernet, modem, PC Card, ExpressCard/54, headphone and mic, DC, lock.
      ports: [
        ["dc-jack", "left"],
        ["vga", "left"],
        ["usb-a-2.0", "left"],
        ["pc-card", "left"],
        ["expresscard-54", "left"],
        ["modem-rj11", "right"],
        ["ethernet-1g", "right"],
        ["usb-a-2.0", "right"],
        ["usb-a-2.0", "right"],
        ["lock-slot", "right"],
        ["headphone-mic", "front"],
      ],
      materials: { floor: "plastic", deck: "plastic", lid: "magnesium" },
    },
  ),
  s(
    "t60-trim",
    "2006 15.4 inch business, trimmed port set, Workhorse, layout B",
    "ThinkPad T60 15.4 inch: about 357 x 268 x 31 to 36",
    [31, 36],
    {
      year: 2006,
      body: "workhorse",
      layout: "b",
      size: [358, 290, 23.5],
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
        ["dc-jack", "left"],
        ["vga", "left"],
        ["usb-a-2.0", "left"],
        ["expresscard-34", "right"],
        ["modem-rj11", "right"],
        ["ethernet-1g", "right"],
        ["usb-a-2.0", "right"],
        ["headphone-mic", "front"],
      ],
      materials: { floor: "plastic", deck: "plastic", lid: "magnesium" },
    },
  ),
  s(
    "dtr-2006",
    "2006 17 inch desktop replacement, Pillow, layout C",
    "Dell XPS M1710: 394 x 287 x 42",
    [42, 42],
    {
      year: 2006,
      body: "pillow",
      layout: "c",
      size: [421.5, 310, 35],
      // The M1710's edges round over less deeply than Pillow's middle setting.
      shape: 0.25,
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
        ["s-video", "right"],
        ["usb-a-2.0", "right"],
        ["usb-a-2.0", "right"],
        ["firewire-400", "right"],
        ["ethernet-1g", "front"],
        ["headphone-mic", "front"],
      ],
    },
  ),
  s(
    "ultraportable-2006",
    "2006 12.1 inch ultraportable, Workhorse, layout B",
    "ThinkPad X60s: 267 x 211 x 21.1 to 28.2",
    [21.1, 28.2],
    {
      year: 2006,
      body: "workhorse",
      layout: "b",
      size: [270, 225, 23],
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
      spend: { material: 0.5 },
    },
  ),
  s(
    "ultrabook-14",
    "2026 14 inch ultrabook, Workhorse, layout A",
    "Asus Zenbook S 14 (UX5406): 310 x 215 x 11.9 to 12.9",
    [11.9, 12.9],
    {
      year: 2026,
      body: "workhorse",
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
    "Asus Zenbook S 13 OLED (UX5304): 296 x 216 x 10.9 to 11.8",
    [10.9, 11.8],
    {
      year: 2026,
      body: "blade",
      layout: "a",
      // The Zenbook tapers only gently, 10.9 mm at the front to 11.8 at the rear.
      shape: 0,
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
        keyboard: 1,
        trackpad: 1,
      },
    },
  ),
  s(
    "gaming-16",
    "2026 16 inch gaming, Shelf, layout A",
    "Lenovo Legion Pro 7i Gen 10: 364 x 276 x 21.8 to 26.7",
    [21.8, 26.7],
    {
      year: 2026,
      body: "shelf",
      layout: "a",
      size: [376, 276, 22],
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
    "Asus ROG Strix SCAR 18 (2025): 399 x 298 x 23.6 to 32",
    [23.6, 32],
    {
      year: 2026,
      body: "workhorse",
      layout: "a",
      size: [399, 298, 22],
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
    "x1-carbon",
    "2026 14 inch business ultraportable, Workhorse, layout A",
    "Lenovo ThinkPad X1 Carbon Gen 12: 316 x 223 x 15",
    [15, 15],
    {
      year: 2026,
      body: "workhorse",
      layout: "a",
      parts: {
        processor: "core-ultra7-258v",
        memory: "lpddr5x-on-package",
        storage: "m2-2280-g4",
        display: "2026-14-1920x1200-ips",
        battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
        cooling: "one-fan",
        wireless: "wifi-7",
        keyboard: ["kb-1.5", { light: "white" }],
        trackpad: [
          "pad-110x70",
          { mechanism: "mechanical", buttons: "separate", stick: "yes" },
        ],
        webcam: "cam-1080p-ir",
        speakers: "spk-stereo-2026",
      },
      ports: [
        ["usb4-40g", "left"],
        ["usb4-40g", "left"],
        ["usb-a-5g", "left"],
        ["hdmi-2.1", "left"],
        ["usb-a-5g", "right"],
        ["audio-combo", "right"],
      ],
      materials: { floor: "magnesium", deck: "magnesium", lid: "cfrp" },
    },
  ),
  s(
    "no-fit",
    "2026 18 inch RTX 5090 with a 99.9 Wh slim pack, Blade, layout A (should not fit)",
    "No real machine: a 4.5 mm pouch 435 mm long, capped at 99.9 Wh",
    null,
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
        battery: ["li-po-pouch", { length: 435, depth: 85, thick: 4.5 }],
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
