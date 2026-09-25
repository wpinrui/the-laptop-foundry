import { makeBuild } from "../samples";
import { MATERIALS } from "./finish";
import { solve } from "../solve";
import type { Build, Category, OptionValue, Piece, Side, Size } from "../types";

// Rivals: six fictional makers, constant across the years. Each rival is a
// full build from real content, sized to fit, so it runs through the same
// engine, simulation and review as the player's builds. Each maker's class
// cells are fixed for every year, though not every cell holds a rival in
// every year. The same field faces every player build of that year.

export interface Maker {
  id: string;
  name: string;
  /** Classes the maker competes in, as "body/performance/budget" cells, every year. */
  competes: string[];
}

export const MAKERS: Maker[] = [
  {
    id: "tarrant",
    name: "Tarrant",
    competes: [
      "medium/gaming/midrange",
      "medium/gaming/premium",
      "medium/mixed-use/midrange",
      "medium/mixed-use/premium",
      "medium/office/low",
      "medium/office/midrange",
      "medium/office/premium",
      "thin and light/office/midrange",
      "thin and light/office/premium",
    ],
  },
  {
    id: "halbrook",
    name: "Halbrook",
    competes: [
      "large/gaming/midrange",
      "large/gaming/premium",
      "large/mixed-use/midrange",
      "large/office/low",
      "large/office/midrange",
      "medium/gaming/midrange",
      "medium/gaming/premium",
      "medium/office/low",
      "medium/office/midrange",
      "thin and light/mixed-use/midrange",
      "thin and light/office/midrange",
      "thin and light/office/premium",
    ],
  },
  {
    id: "denholm",
    name: "Denholm",
    competes: [
      "large/gaming/midrange",
      "large/gaming/premium",
      "large/mixed-use/premium",
      "medium/gaming/midrange",
      "medium/gaming/premium",
      "medium/mixed-use/midrange",
      "medium/mixed-use/premium",
      "thin and light/gaming/premium",
      "thin and light/mixed-use/midrange",
      "thin and light/mixed-use/premium",
      "thin and light/office/midrange",
    ],
  },
  {
    id: "quince",
    name: "Quince",
    competes: [
      "large/gaming/midrange",
      "large/mixed-use/premium",
      "medium/gaming/premium",
      "medium/mixed-use/midrange",
      "medium/mixed-use/premium",
      "medium/office/low",
      "medium/office/midrange",
      "medium/office/premium",
      "thin and light/mixed-use/midrange",
      "thin and light/mixed-use/premium",
      "thin and light/office/premium",
    ],
  },
  {
    id: "arvane",
    name: "Arvane",
    competes: [
      "large/gaming/midrange",
      "large/gaming/premium",
      "medium/gaming/midrange",
      "medium/gaming/premium",
      "thin and light/gaming/premium",
      "thin and light/mixed-use/midrange",
      "thin and light/mixed-use/premium",
      "thin and light/office/premium",
    ],
  },
  {
    id: "ecker",
    name: "Ecker",
    competes: [
      "large/gaming/midrange",
      "large/gaming/premium",
      "large/mixed-use/midrange",
      "large/mixed-use/premium",
      "large/office/low",
      "large/office/midrange",
      "medium/gaming/midrange",
      "medium/office/low",
      "medium/office/midrange",
    ],
  },
];

export interface Rival {
  id: string;
  maker: string;
  name: string;
  build: Build;
}

type PartSpec = string | [string, Record<string, OptionValue>];

interface RivalSpec {
  body: string;
  layout: string;
  size: [number, number, number];
  price: number;
  parts: Partial<Record<Category, PartSpec | PartSpec[]>>;
  ports: [string, Side][];
  materials?: Partial<Record<Piece, string>>;
  spend?: Build["spend"];
}

function rival(
  year: number,
  maker: string,
  name: string,
  spec: RivalSpec,
): Rival {
  const build = makeBuild({ year, ...spec });
  // The listed size is the target; a rival never ships short of its own minimum.
  const target: Size = { x: spec.size[0], y: spec.size[1], z: spec.size[2] };
  const min = solve({ ...build, size: target }).min;
  const up = (v: number) => Math.ceil(v * 2) / 2;
  const size: Size = {
    x: up(Math.max(target.x, min.x)),
    y: up(Math.max(target.y, min.y)),
    z: up(Math.max(target.z, min.z)),
  };
  return {
    id: `${maker}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    maker,
    name,
    build: { ...build, size, price: spec.price },
  };
}

/** Another configuration of an existing rival: same chassis, new price and parts. */
function trim(
  base: Rival,
  name: string,
  price: number,
  change: {
    maker?: string;
    parts?: Partial<Record<Category, PartSpec | PartSpec[] | null>>;
    materials?: Partial<Record<Piece, string>>;
    spend?: Build["spend"];
  } = {},
): Rival {
  const maker = change.maker ?? base.maker;
  const parts = { ...base.build.parts };
  for (const [cat, v] of Object.entries(change.parts ?? {}) as [
    Category,
    PartSpec | PartSpec[] | null,
  ][]) {
    if (v === null) {
      delete parts[cat];
      continue;
    }
    const single =
      typeof v === "string" ||
      (typeof v[0] === "string" && typeof v[1] === "object" && !Array.isArray(v[1]));
    const list = single ? [v as PartSpec] : (v as PartSpec[]);
    parts[cat] = list.map((x) =>
      typeof x === "string" ? { part: x } : { part: x[0], opts: x[1] },
    );
  }
  const materials = { ...base.build.materials, ...change.materials };
  const texture = (m: string) =>
    MATERIALS.find((x) => x.id === m)?.finishes[0] ?? "matte";
  const finish = { ...base.build.finish };
  for (const piece of Object.keys(change.materials ?? {}) as Piece[])
    finish[piece] = { ...finish[piece], texture: texture(materials[piece]) };
  const build: Build = {
    ...base.build,
    parts,
    materials,
    finish,
    spend: { ...base.build.spend, ...change.spend },
    price,
  };
  const min = solve(build).min;
  const up = (v: number) => Math.ceil(v * 2) / 2;
  const size: Size = {
    x: up(Math.max(build.size.x, min.x)),
    y: up(Math.max(build.size.y, min.y)),
    z: up(Math.max(build.size.z, min.z)),
  };
  return {
    id: `${maker}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    maker,
    name,
    build: { ...build, size },
  };
}

// ------------------------------------------------------------------ 2006

const PORTS_2006: [string, Side][] = [
  ["dc-jack", "left"],
  ["vga", "left"],
  ["usb-a-2.0", "left"],
  ["expresscard-54", "left"],
  ["ethernet-1g", "right"],
  ["modem-rj11", "right"],
  ["usb-a-2.0", "right"],
  ["headphone-mic", "front"],
];
const PORTS_2006_SMALL: [string, Side][] = [
  ["dc-jack", "left"],
  ["vga", "left"],
  ["usb-a-2.0", "left"],
  ["ethernet-1g", "right"],
  ["usb-a-2.0", "right"],
  ["headphone-mic", "front"],
];
const PORTS_2006_BIG: [string, Side][] = [
  ["dc-jack", "left"],
  ["vga", "left"],
  ["dvi-d", "left"],
  ["s-video", "left"],
  ["usb-a-2.0", "right"],
  ["usb-a-2.0", "right"],
  ["usb-a-2.0", "right"],
  ["firewire-400", "right"],
  ["ethernet-1g", "front"],
  ["headphone-mic", "front"],
];

const R2006: Rival[] = [
  rival(2006, "tarrant", "Wardline T62", {
    body: "workhorse",
    layout: "b",
    size: [357, 268, 26],
    price: 1900,
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
      keyboard: ["kb-2.5", { light: "lid-light" }],
      trackpad: ["pad-65x40", { stick: "yes" }],
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006,
    materials: { lid: "magnesium" },
  }),
  rival(2006, "tarrant", "Wardline X62s", {
    body: "workhorse",
    layout: "b",
    size: [268, 212, 21],
    price: 2000,
    parts: {
      processor: "core-duo-u2500",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 1 }],
      storage: "hdd18",
      display: "2006-12.1-1024x768-tn-matte",
      battery: ["li-ion-18650", { cells: 4 }],
      cooling: "one-fan",
      wireless: "wifi-abg",
      keyboard: ["kb-2.5", { pitch: 17 }],
      trackpad: ["pad-65x40", { stick: "yes" }],
      speakers: "spk-mono",
    },
    ports: PORTS_2006_SMALL,
    materials: { floor: "magnesium", deck: "magnesium", lid: "magnesium" },
    spend: { material: 0.5 },
  }),
  rival(2006, "halbrook", "Carrow 510", {
    body: "pillow",
    layout: "b",
    size: [358, 262, 30],
    price: 799,
    parts: {
      processor: "celeron-m-430",
      memory: ["ddr2-667-sodimm", { capacity: 0.5, slots: 1 }],
      storage: ["hdd25-5400", { capacity: 60 }],
      display: "2006-15.4-1280x800-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "one-fan",
      optical: "combo",
      wireless: "wifi-bg",
      keyboard: "kb-3.0",
      trackpad: "pad-75x45",
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006,
  }),
  rival(2006, "halbrook", "Carrow 720", {
    body: "pillow",
    layout: "b",
    size: [358, 262, 30],
    price: 1149,
    parts: {
      processor: "core2-duo-t5500",
      graphics: "geforce-go-7400",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 2 }],
      storage: ["hdd25-5400", { capacity: 120 }],
      display: "2006-15.4-1280x800-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "one-fan",
      optical: "dvd-rw-dl",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: "kb-3.0",
      trackpad: "pad-75x45",
      webcam: "cam-1.3mp",
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006,
  }),
  rival(2006, "halbrook", "Carrow 790 Play", {
    body: "pillow",
    layout: "b",
    size: [362, 268, 34],
    price: 2199,
    parts: {
      processor: "core2-duo-t7600",
      graphics: "geforce-go-7900-gtx",
      memory: ["ddr2-667-sodimm", { capacity: 2, slots: 2 }],
      storage: ["hdd25-7200", { capacity: 100 }],
      display: "2006-15.4-1680x1050-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "two-fans",
      optical: "dvd-rw-dl",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: "kb-3.0",
      trackpad: "pad-75x45",
      webcam: "cam-1.3mp",
      speakers: "spk-stereo-sub",
    },
    ports: PORTS_2006,
  }),
  rival(2006, "denholm", "Aurel M1720", {
    body: "pillow",
    layout: "c",
    size: [394, 287, 34],
    price: 2799,
    parts: {
      processor: "core2-duo-t7600",
      graphics: "geforce-go-7900-gtx",
      memory: ["ddr2-667-sodimm", { capacity: 2, slots: 2 }],
      storage: [
        ["hdd25-7200", { capacity: 100 }],
        ["hdd25-7200", { capacity: 100 }],
      ],
      display: "2006-17-1920x1200-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "two-fans",
      optical: "dvd-rw-dl",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: ["kb-3.0", { cols: 19 }],
      trackpad: "pad-85x50",
      webcam: "cam-1.3mp",
      speakers: "spk-stereo-sub",
    },
    ports: PORTS_2006_BIG,
    spend: { packing: 0.5 },
  }),
  rival(2006, "denholm", "Aurel E1540", {
    body: "workhorse",
    layout: "b",
    size: [357, 262, 28],
    price: 1799,
    parts: {
      processor: "core2-duo-t7600",
      graphics: "geforce-go-7600",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 2 }],
      storage: ["hdd25-7200", { capacity: 80 }],
      display: "2006-15.4-1680x1050-tn-matte",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "one-fan",
      optical: "dvd-rw-slim-2006",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: "kb-2.5",
      trackpad: "pad-75x45",
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006,
  }),
  rival(2006, "denholm", "Aurel S1310", {
    body: "workhorse",
    layout: "b",
    size: [280, 228, 22],
    price: 1799,
    parts: {
      processor: "core-duo-t2500",
      graphics: "geforce-go-7600",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 1 }],
      storage: "hdd18",
      display: "2006-12.1-1280x800-tn-glossy",
      battery: ["li-ion-18650", { cells: 4 }],
      cooling: "one-fan",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: "kb-2.5",
      trackpad: "pad-65x40",
      speakers: "spk-mono",
    },
    ports: PORTS_2006_SMALL,
    materials: { floor: "magnesium", deck: "magnesium", lid: "cfrp" },
    spend: { material: 1, packing: 1, graphics: 1, battery: 1, storage: 1, cooling: 1, keyboard: 1, speakers: 1 },
  }),
  rival(2006, "quince", "Pomella Pro 15", {
    body: "workhorse",
    layout: "b",
    size: [357, 243, 23],
    price: 1999,
    parts: {
      processor: "core-duo-t2500",
      graphics: "radeon-x1600",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 2 }],
      storage: ["hdd25-5400", { capacity: 80 }],
      display: "2006-15.4-1440x900-tn-glossy",
      battery: ["slim-li-po-2006", { wh: 55 }],
      cooling: "two-fans",
      optical: "dvd-rw-slim-2006",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: ["kb-2.5", { light: "backlit" }],
      trackpad: "pad-85x50",
      webcam: "cam-0.3mp",
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006_SMALL,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2006, "quince", "Pomella 13", {
    body: "pillow",
    layout: "b",
    size: [325, 227, 28],
    price: 1099,
    parts: {
      processor: "core-duo-t2500",
      memory: ["ddr2-667-sodimm", { capacity: 0.5, slots: 2 }],
      storage: ["hdd25-5400", { capacity: 60 }],
      display: "2006-13.3-1280x800-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "one-fan",
      optical: "combo",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: "kb-2.5",
      trackpad: "pad-75x45",
      webcam: "cam-0.3mp",
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006_SMALL,
  }),
  rival(2006, "arvane", "Vesper W6", {
    body: "workhorse",
    layout: "b",
    size: [280, 230, 24],
    price: 2699,
    parts: {
      processor: "core2-duo-t7600",
      graphics: "geforce-go-7900-gtx",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 1 }],
      storage: "hdd18",
      display: "2006-12.1-1280x800-tn-glossy",
      battery: ["li-ion-18650", { cells: 4 }],
      cooling: "one-fan",
      wireless: "wifi-abg",
      keyboard: "kb-2.5",
      trackpad: "pad-65x40",
      speakers: "spk-mono",
    },
    ports: PORTS_2006_SMALL,
    materials: { floor: "magnesium", deck: "magnesium", lid: "cfrp" },
    spend: { material: 1, packing: 1, graphics: 1, battery: 1, storage: 1, cooling: 1, keyboard: 1, speakers: 1, processor: 1 },
  }),
  rival(2006, "arvane", "Vesper G2", {
    body: "pillow",
    layout: "b",
    size: [364, 272, 36],
    price: 2299,
    parts: {
      processor: "core2-duo-t7600",
      graphics: "geforce-go-7900-gtx",
      memory: ["ddr2-667-sodimm", { capacity: 2, slots: 2 }],
      storage: ["hdd25-7200", { capacity: 100 }],
      display: "2006-15.4-1920x1200-tn-matte",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "two-fans",
      optical: "dvd-rw-dl",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: ["kb-3.0", { light: "backlit" }],
      trackpad: "pad-75x45",
      webcam: "cam-1.3mp",
      speakers: "spk-stereo-sub",
    },
    ports: PORTS_2006_BIG,
  }),
  rival(2006, "arvane", "Vesper G7 17", {
    body: "pillow",
    layout: "c",
    size: [398, 290, 38],
    price: 2599,
    parts: {
      processor: "core2-duo-t7600",
      graphics: "geforce-go-7900-gtx",
      memory: ["ddr2-667-sodimm", { capacity: 2, slots: 2 }],
      storage: ["hdd25-7200", { capacity: 100 }],
      display: "2006-17-1920x1200-tn-glossy",
      battery: ["li-ion-18650", { cells: 9 }],
      cooling: "two-fans",
      optical: "dvd-rw-dl",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: ["kb-3.0", { cols: 19, light: "backlit" }],
      trackpad: "pad-85x50",
      webcam: "cam-1.3mp",
      speakers: "spk-stereo-sub",
    },
    ports: PORTS_2006_BIG,
  }),
  rival(2006, "ecker", "Loma 1410", {
    body: "pillow",
    layout: "b",
    size: [318, 234, 30],
    price: 899,
    parts: {
      processor: "core-duo-u2500",
      memory: ["ddr2-667-sodimm", { capacity: 0.5, slots: 1 }],
      storage: ["hdd18", { capacity: 30 }],
      display: "2006-12.1-1280x800-tn-glossy",
      battery: ["li-ion-18650", { cells: 4 }],
      cooling: "one-fan",
      wireless: "wifi-bg",
      keyboard: "kb-3.0",
      trackpad: "pad-65x40",
      speakers: "spk-mono",
    },
    ports: PORTS_2006_SMALL,
  }),
  rival(2006, "ecker", "Loma 9800", {
    body: "pillow",
    layout: "c",
    size: [396, 290, 36],
    price: 899,
    parts: {
      processor: "celeron-m-430",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 2 }],
      storage: ["hdd25-5400", { capacity: 80 }],
      display: "2006-17-1440x900-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "one-fan",
      optical: "dvd-rw-dl",
      wireless: "wifi-bg",
      keyboard: ["kb-3.0", { cols: 19 }],
      trackpad: "pad-75x45",
      speakers: "spk-stereo-2006",
    },
    ports: PORTS_2006_BIG,
  }),
  rival(2006, "ecker", "Loma 9920 Media", {
    body: "pillow",
    layout: "c",
    size: [396, 290, 36],
    price: 1349,
    parts: {
      processor: "turion64-x2-tl60",
      graphics: "radeon-x1600",
      memory: ["ddr2-667-sodimm", { capacity: 1, slots: 2 }],
      storage: ["hdd25-5400", { capacity: 120 }],
      display: "2006-17-1680x1050-tn-glossy",
      battery: ["li-ion-18650", { cells: 6 }],
      cooling: "one-fan",
      optical: "dvd-rw-dl",
      wireless: ["wifi-abg", { bluetooth: "2.0" }],
      keyboard: ["kb-3.0", { cols: 19 }],
      trackpad: "pad-75x45",
      webcam: "cam-1.3mp",
      speakers: "spk-stereo-sub",
    },
    ports: PORTS_2006_BIG,
  }),
];

// ------------------------------------------------------------------ 2026

const PORTS_2026: [string, Side][] = [
  ["usb4-40g", "left"],
  ["usb4-40g", "left"],
  ["hdmi-2.1", "left"],
  ["usb-a-5g", "right"],
  ["audio-combo", "right"],
];
const PORTS_2026_THIN: [string, Side][] = [
  ["usb4-40g", "left"],
  ["usb4-40g", "left"],
  ["usb-a-5g", "right"],
  ["audio-combo", "right"],
];
const PORTS_2026_GAMING: [string, Side][] = [
  ["usb-a-10g", "left"],
  ["usb-c-10g", "left"],
  ["audio-combo", "left"],
  ["dc-jack", "rear"],
  ["hdmi-2.1", "rear"],
  ["ethernet-2.5g", "rear"],
  ["thunderbolt-5", "rear"],
  ["usb-a-10g", "right"],
  ["sd-reader-uhs2", "right"],
];
const PORTS_2026_GAMING_AMD: [string, Side][] = PORTS_2026_GAMING.map(
  ([id, side]) => [id === "thunderbolt-5" ? "usb4-40g" : id, side],
);
const PORTS_2026_BUDGET: [string, Side][] = [
  ["dc-jack", "left"],
  ["hdmi-2.1", "left"],
  ["usb-a-5g", "left"],
  ["usb-c-10g", "left"],
  ["usb-a-5g", "right"],
  ["audio-combo", "right"],
];

const R2026: Rival[] = [
  rival(2026, "tarrant", "Wardline X14 Carbon", {
    body: "workhorse",
    layout: "a",
    size: [316, 223, 11.5],
    price: 1899,
    parts: {
      processor: "core-ultra7-258v",
      memory: "lpddr5x-on-package",
      storage: "m2-2280-g4",
      display: "2026-14-1920x1200-ips",
      battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-7",
      keyboard: ["kb-1.5", { light: "white" }],
      trackpad: ["pad-110x70", { mechanism: "mechanical", buttons: "separate", stick: "yes" }],
      webcam: "cam-1080p-ir",
      speakers: "spk-stereo-2026",
    },
    ports: [...PORTS_2026, ["usb-a-5g", "left"]],
    materials: { floor: "magnesium", deck: "magnesium", lid: "cfrp" },
  }),
  rival(2026, "tarrant", "Wardline E16", {
    body: "workhorse",
    layout: "a",
    size: [356, 250, 18],
    price: 1099,
    parts: {
      processor: "ryzen-ai5-340",
      memory: ["ddr5-5600-sodimm", { capacity: 16, slots: 2 }],
      storage: ["m2-2280-g4", { capacity: 512 }],
      display: "2026-16-1920x1200-ips",
      battery: ["li-po-pouch", { wh: 60, thickness: "standard" }],
      cooling: "one-fan",
      wireless: "wifi-6e",
      keyboard: ["kb-1.5", { cols: 19, light: "white" }],
      trackpad: "pad-125x80",
      webcam: "cam-1080p",
      speakers: "spk-stereo-2026",
    },
    ports: [...PORTS_2026, ["ethernet-1g", "right"]],
    materials: { lid: "aluminium" },
  }),
  rival(2026, "tarrant", "Wardline P16", {
    body: "workhorse",
    layout: "a",
    size: [362, 256, 19],
    price: 2299,
    parts: {
      processor: "ryzen-ai9-hx470",
      memory: ["ddr5-5600-sodimm", { capacity: 32, slots: 2 }],
      storage: "m2-2280-g4",
      display: "2026-16-2560x1600-ips",
      battery: ["li-po-pouch", { wh: 90, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-7",
      keyboard: ["kb-1.5", { cols: 19, light: "white" }],
      trackpad: ["pad-125x80", { buttons: "separate", stick: "yes", mechanism: "mechanical" }],
      webcam: "cam-5mp-ir",
      speakers: "spk-quad",
    },
    ports: [...PORTS_2026, ["ethernet-2.5g", "right"]],
    materials: { floor: "aluminium", deck: "magnesium", lid: "aluminium" },
  }),
  rival(2026, "tarrant", "Wardline Pro 7", {
    body: "workhorse",
    layout: "a",
    size: [364, 276, 20],
    price: 3199,
    parts: {
      processor: "core-ultra9-275hx",
      graphics: "rtx-5080-laptop",
      memory: ["ddr5-5600-sodimm", { capacity: 32, slots: 2 }],
      storage: ["m2-2280-g5", "m2-2280-g4"],
      display: ["2026-16-2560x1600-ips", { refresh: 240 }],
      battery: ["li-po-pouch", { wh: 99.9, thickness: "standard" }],
      cooling: "vapour-chamber",
      wireless: "wifi-7",
      keyboard: ["kb-1.5", { cols: 19, pitch: 18, light: "rgb-per-key" }],
      trackpad: "pad-125x80",
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: PORTS_2026_GAMING,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "halbrook", "Carrow 15", {
    body: "workhorse",
    layout: "a",
    size: [360, 236, 18],
    price: 749,
    parts: {
      processor: "core5-120u",
      memory: ["ddr5-5600-sodimm", { capacity: 8, slots: 1 }],
      storage: ["m2-2280-g4", { capacity: 512 }],
      display: "2026-15.6-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "standard" }],
      cooling: "one-fan",
      wireless: "wifi-6e",
      keyboard: ["kb-1.5", { cols: 19 }],
      trackpad: "pad-110x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2026",
    },
    ports: PORTS_2026_BUDGET,
  }),
  rival(2026, "halbrook", "Carrow Air 14", {
    body: "workhorse",
    layout: "a",
    size: [313, 220, 14],
    price: 999,
    parts: {
      processor: "ryzen-ai5-340",
      memory: ["lpddr5x-soldered", { capacity: 16 }],
      storage: ["m2-2280-g4", { capacity: 512 }],
      display: "2026-14-1920x1200-ips",
      battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-6e",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: "pad-110x70",
      webcam: "cam-1080p",
      speakers: "spk-stereo-2026",
    },
    ports: PORTS_2026,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "halbrook", "Carrow Play 16", {
    body: "workhorse",
    layout: "a",
    size: [358, 262, 22],
    price: 1699,
    parts: {
      processor: "ryzen-ai9-hx470",
      graphics: "rtx-5060-laptop",
      memory: ["ddr5-5600-sodimm", { capacity: 16, slots: 2 }],
      storage: "m2-2280-g4",
      display: ["2026-16-1920x1200-ips", { refresh: 165 }],
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-6e",
      keyboard: ["kb-1.5", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-125x80",
      webcam: "cam-1080p",
      speakers: "spk-stereo-2026",
    },
    ports: PORTS_2026_GAMING_AMD,
  }),
  rival(2026, "denholm", "Aurel 14 Studio", {
    body: "blade",
    layout: "a",
    size: [312, 214, 13],
    price: 1799,
    parts: {
      processor: "core-ultra-x9-388h",
      memory: ["lpddr5x-soldered", { capacity: 32 }],
      storage: "m2-2280-g4",
      display: ["2026-14-2880x1800-oled", { refresh: 120 }],
      battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
      cooling: "two-fans",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: ["pad-125x80", { mechanism: "haptic" }],
      webcam: "cam-1080p-ir",
      speakers: "spk-quad",
    },
    ports: PORTS_2026_THIN,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "denholm", "Aurel 16 Plus", {
    body: "workhorse",
    layout: "a",
    size: [356, 250, 17],
    price: 1799,
    parts: {
      processor: "core-ultra-x9-388h",
      memory: ["lpddr5x-soldered", { capacity: 32 }],
      storage: "m2-2280-g4",
      display: ["2026-16-2560x1600-ips", { refresh: 165 }],
      battery: ["li-po-pouch", { wh: 90, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { cols: 19, light: "white" }],
      trackpad: ["pad-145x90", { mechanism: "haptic" }],
      webcam: "cam-1080p-ir",
      speakers: "spk-quad",
    },
    ports: PORTS_2026,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "denholm", "Aurel Forge 18", {
    body: "workhorse",
    layout: "a",
    size: [399, 298, 22],
    price: 4999,
    parts: {
      processor: "core-ultra9-275hx",
      graphics: "rtx-5090-laptop",
      memory: ["ddr5-5600-sodimm", { capacity: 64, slots: 2 }],
      storage: ["m2-2280-g5", "m2-2280-g5"],
      display: ["2026-18-3840x2400-mini-led", { refresh: 240 }],
      battery: ["li-po-pouch", { wh: 99.9, thickness: "standard" }],
      cooling: "vapour-chamber",
      wireless: "wifi-7",
      keyboard: ["kb-mech-1.8", { cols: 19, pitch: 19, light: "rgb-per-key" }],
      trackpad: "pad-145x90",
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: PORTS_2026_GAMING,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "quince", "Pomella Air 13", {
    body: "workhorse",
    layout: "a",
    size: [304, 215, 11],
    price: 1299,
    parts: {
      processor: "snapdragon-x2e-88-100",
      memory: ["lpddr5x-soldered", { capacity: 16 }],
      storage: ["m2-2230-g4", { capacity: 512 }],
      display: ["2026-13.5-2256x1504-ips", { refresh: 120 }],
      battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
      cooling: "fanless",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: ["pad-125x80", { mechanism: "haptic" }],
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: [
      ["usb4-40g", "left"],
      ["usb4-40g", "left"],
      ["audio-combo", "right"],
    ],
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "quince", "Pomella 15", {
    body: "workhorse",
    layout: "a",
    size: [340, 238, 14],
    price: 1499,
    parts: {
      processor: "core-ultra7-258v",
      memory: "lpddr5x-on-package",
      storage: "m2-2280-g4",
      display: "2026-15.6-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "one-fan",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: ["pad-145x90", { mechanism: "haptic" }],
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: PORTS_2026_THIN,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "quince", "Pomella Pro 16", {
    body: "workhorse",
    layout: "a",
    size: [356, 248, 17],
    price: 2999,
    parts: {
      processor: "ryzen-ai-max-395",
      memory: ["lpddr5x-soldered", { capacity: 64 }],
      storage: ["m2-2280-g5", { capacity: 2048 }],
      display: "2026-16-3200x2000-mini-led",
      battery: ["li-po-pouch", { wh: 99.9, thickness: "standard" }],
      cooling: "vapour-chamber",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: ["pad-160x100", { mechanism: "haptic" }],
      webcam: "cam-5mp-ir",
      speakers: "spk-six",
    },
    ports: [...PORTS_2026_THIN, ["sd-reader-uhs2", "right"], ["hdmi-2.1", "right"]],
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "arvane", "Vesper Neo 14", {
    body: "blade",
    layout: "a",
    size: [312, 220, 14],
    price: 1599,
    parts: {
      processor: "ryzen-ai9-hx470",
      memory: ["lpddr5x-soldered", { capacity: 32 }],
      storage: "m2-2280-g4",
      display: ["2026-14-2880x1800-oled", { refresh: 120 }],
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: ["pad-125x80", { mechanism: "haptic" }],
      webcam: "cam-1080p-ir",
      speakers: "spk-quad",
    },
    ports: PORTS_2026,
    materials: { floor: "magnesium", deck: "magnesium", lid: "aluminium" },
  }),
  rival(2026, "arvane", "Vesper Edge 14", {
    body: "blade",
    layout: "a",
    size: [311, 222, 15],
    price: 2599,
    parts: {
      processor: "ryzen-ai9-hx470",
      graphics: "rtx-5070-laptop",
      memory: ["lpddr5x-soldered", { capacity: 32 }],
      storage: "m2-2280-g4",
      display: ["2026-14-2880x1800-oled", { refresh: 120 }],
      battery: ["li-po-pouch", { wh: 60, thickness: "slim" }],
      cooling: "vapour-chamber",
      wireless: "wifi-7",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: ["pad-125x80", { mechanism: "haptic" }],
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: PORTS_2026,
    materials: { floor: "magnesium", deck: "magnesium", lid: "magnesium" },
    spend: { material: 1, packing: 1, graphics: 1, processor: 1, cooling: 1 },
  }),
  rival(2026, "arvane", "Vesper Strike 16", {
    body: "blade",
    layout: "a",
    size: [355, 266, 22],
    price: 2499,
    parts: {
      processor: "core-ultra9-275hx",
      graphics: "rtx-5070ti-laptop",
      memory: ["ddr5-5600-sodimm", { capacity: 32, slots: 2 }],
      storage: "m2-2280-g4",
      display: ["2026-16-2560x1600-ips", { refresh: 240 }],
      battery: ["li-po-pouch", { wh: 90, thickness: "standard" }],
      cooling: "vapour-chamber",
      wireless: "wifi-7",
      keyboard: ["kb-1.5", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-125x80",
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: PORTS_2026_GAMING,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "arvane", "Vesper Strike 18", {
    body: "blade",
    layout: "a",
    size: [399, 294, 24],
    price: 3499,
    parts: {
      processor: "ryzen9-9955hx3d",
      graphics: "rtx-5080-laptop",
      memory: ["ddr5-5600-sodimm", { capacity: 32, slots: 2 }],
      storage: ["m2-2280-g5", "m2-2280-g4"],
      display: ["2026-18-2560x1600-ips", { refresh: 240 }],
      battery: ["li-po-pouch", { wh: 90, thickness: "standard" }],
      cooling: "vapour-chamber",
      wireless: "wifi-7",
      keyboard: ["kb-1.5", { cols: 19, light: "rgb-per-key" }],
      trackpad: "pad-145x90",
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: PORTS_2026_GAMING_AMD,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2026, "ecker", "Loma Go 14", {
    body: "workhorse",
    layout: "a",
    size: [320, 222, 17],
    price: 799,
    parts: {
      processor: "core5-120u",
      memory: ["ddr5-5600-sodimm", { capacity: 8, slots: 1 }],
      storage: ["m2-2242-g4", { capacity: 512 }],
      display: "2026-14-1920x1200-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-6e",
      keyboard: "kb-1.0",
      trackpad: "pad-110x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2026",
    },
    ports: PORTS_2026_BUDGET,
  }),
  rival(2026, "ecker", "Loma Play 15", {
    body: "workhorse",
    layout: "a",
    size: [360, 255, 23],
    price: 1299,
    parts: {
      processor: "ryzen-ai5-340",
      graphics: "rtx-5050-laptop",
      memory: ["ddr5-5600-sodimm", { capacity: 16, slots: 2 }],
      storage: ["m2-2280-g4", { capacity: 512 }],
      display: ["2026-15.6-1920x1080-ips", { refresh: 144 }],
      battery: ["li-po-pouch", { wh: 60, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-6e",
      keyboard: ["kb-1.5", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-110x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2026",
    },
    ports: PORTS_2026_GAMING_AMD,
  }),
  rival(2026, "ecker", "Loma 18", {
    body: "workhorse",
    layout: "a",
    size: [398, 280, 20],
    price: 799,
    parts: {
      processor: "core5-120u",
      memory: ["ddr5-5600-sodimm", { capacity: 8, slots: 1 }],
      storage: ["m2-2280-g4", { capacity: 512 }],
      display: "2026-18-2560x1600-ips",
      battery: ["li-po-pouch", { wh: 60, thickness: "standard" }],
      cooling: "one-fan",
      wireless: "wifi-6e",
      keyboard: ["kb-1.5", { cols: 19 }],
      trackpad: "pad-125x80",
      webcam: "cam-720p",
      speakers: "spk-stereo-2026",
    },
    ports: PORTS_2026_BUDGET,
  }),
  rival(2026, "ecker", "Loma 18 Pro", {
    body: "workhorse",
    layout: "a",
    size: [398, 280, 20],
    price: 1499,
    parts: {
      processor: "ryzen-ai9-hx470",
      memory: ["ddr5-5600-sodimm", { capacity: 32, slots: 2 }],
      storage: "m2-2280-g4",
      display: ["2026-18-2560x1600-ips", { refresh: 240 }],
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-7",
      keyboard: ["kb-1.5", { cols: 19, light: "white" }],
      trackpad: "pad-145x90",
      webcam: "cam-1080p",
      speakers: "spk-quad",
    },
    ports: [...PORTS_2026_BUDGET, ["ethernet-2.5g", "right"]],
  }),
];


// ------------------------------------------------------------------ 2016

const PORTS_2016: [string, Side][] = [
  ["dc-jack", "left"],
  ["hdmi-1.4", "left"],
  ["usb-a-5g", "left"],
  ["usb-c-10g", "left"],
  ["usb-a-5g", "right"],
  ["sd-reader", "right"],
  ["audio-combo", "right"],
];
const PORTS_2016_BIZ: [string, Side][] = [
  ["dc-jack", "left"],
  ["vga", "left"],
  ["usb-a-5g", "left"],
  ["mini-dp", "left"],
  ["ethernet-1g", "right"],
  ["usb-a-5g", "right"],
  ["sd-reader", "right"],
  ["audio-combo", "right"],
  ["lock-slot", "right"],
];
const PORTS_2016_THIN: [string, Side][] = [
  ["usb-c-10g", "left"],
  ["usb-a-5g", "left"],
  ["thunderbolt-3", "right"],
  ["audio-combo", "right"],
];
const PORTS_2016_GAMING: [string, Side][] = [
  ["usb-a-5g", "left"],
  ["usb-a-5g", "left"],
  ["audio-combo", "left"],
  ["dc-jack", "rear"],
  ["hdmi-1.4", "rear"],
  ["mini-dp", "rear"],
  ["ethernet-1g", "rear"],
  ["thunderbolt-3", "right"],
  ["usb-a-5g", "right"],
  ["sd-reader", "right"],
];

const R2016: Rival[] = [
  rival(2016, "tarrant", "Wardline T470", {
    body: "workhorse",
    layout: "b",
    size: [336, 232, 18],
    price: 1099,
    parts: {
      processor: "core-i5-6200u",
      memory: ["ddr4-2133-sodimm", { capacity: 8, slots: 1 }],
      storage: ["m2-2280-sata", { capacity: 256 }],
      display: "2016-14-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "standard" }],
      hotswap: "bridge-battery",
      cooling: "one-fan",
      wireless: "wifi-ac",
      keyboard: ["kb-2.0", { light: "white" }],
      trackpad: ["pad-100x56", { buttons: "separate", stick: "yes" }],
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016_BIZ,
    materials: { lid: "cfrp" },
  }),
  rival(2016, "tarrant", "Wardline X14 Carbon", {
    body: "workhorse",
    layout: "a",
    size: [333, 229, 13],
    price: 1599,
    parts: {
      processor: "core-i7-6500u",
      memory: ["lpddr3-soldered", { capacity: 8 }],
      storage: ["m2-2280-g3", { capacity: 256 }],
      display: "2016-14-2560x1440-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-ac",
      keyboard: ["kb-1.5", { light: "white" }],
      trackpad: ["pad-100x56", { buttons: "separate", stick: "yes" }],
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: [...PORTS_2016_THIN, ["hdmi-1.4", "left"], ["mini-dp", "right"]],
    materials: { floor: "magnesium", deck: "cfrp", lid: "cfrp" },
  }),
  rival(2016, "tarrant", "Wardline Y720", {
    body: "workhorse",
    layout: "a",
    size: [380, 265, 21],
    price: 1799,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-1070-laptop",
      memory: ["ddr4-2133-sodimm", { capacity: 16, slots: 2 }],
      storage: ["m2-2280-g3", { capacity: 512 }],
      display: ["2016-15.6-1920x1080-ips", { refresh: 120 }],
      battery: ["li-po-pouch", { wh: 60, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-2.0", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016-sub",
    },
    ports: PORTS_2016_GAMING,
  }),
  rival(2016, "halbrook", "Carrow 15 Stream", {
    body: "workhorse",
    layout: "b",
    size: [382, 256, 22],
    price: 599,
    parts: {
      processor: "a10-9600p",
      memory: ["ddr4-2133-sodimm", { capacity: 4, slots: 1 }],
      storage: ["hdd25-2016", { capacity: 500 }],
      display: "2016-15.6-1366x768-tn-led",
      battery: ["li-po-pouch", { wh: 45, thickness: "standard" }],
      cooling: "one-fan",
      optical: "dvd-rw-slim-2016",
      wireless: "wifi-ac",
      keyboard: ["kb-1.5", { cols: 19 }],
      trackpad: "pad-100x56",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: [
      ["dc-jack", "left"],
      ["hdmi-1.4", "left"],
      ["ethernet-1g", "left"],
      ["usb-a-5g", "left"],
      ["usb-a-5g", "right"],
      ["sd-reader", "right"],
      ["audio-combo", "right"],
    ],
  }),
  rival(2016, "halbrook", "Carrow Air 13", {
    body: "blade",
    layout: "a",
    size: [320, 225, 13],
    price: 1149,
    parts: {
      processor: "core-i5-6200u",
      memory: ["lpddr3-soldered", { capacity: 8 }],
      storage: ["m2-2280-sata", { capacity: 256 }],
      display: "2016-13.3-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-ac",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016_THIN,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2016, "halbrook", "Carrow Play 17", {
    body: "workhorse",
    layout: "a",
    size: [420, 290, 28],
    price: 1899,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-1070-laptop",
      memory: ["ddr4-2133-sodimm", { capacity: 16, slots: 2 }],
      storage: [
        ["m2-2280-g3", { capacity: 256 }],
        ["hdd25-2016", { capacity: 1000 }],
      ],
      display: ["2016-17.3-1920x1080-ips", { refresh: 120 }],
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-2.0", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016-sub",
    },
    ports: PORTS_2016_GAMING,
  }),
  rival(2016, "denholm", "Aurel 13 Plus", {
    body: "workhorse",
    layout: "a",
    size: [310, 215, 14],
    price: 1099,
    parts: {
      processor: "core-i7-7500u",
      graphics: "geforce-940mx",
      memory: ["lpddr3-soldered", { capacity: 8 }],
      storage: ["m2-2280-sata", { capacity: 256 }],
      display: "2016-13.3-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-ac",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016_THIN,
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2016, "denholm", "Aurel 15 Studio", {
    body: "workhorse",
    layout: "a",
    size: [357, 235, 17],
    price: 1649,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-960m",
      memory: ["ddr4-2133-sodimm", { capacity: 16, slots: 2 }],
      storage: ["m2-2280-g3", { capacity: 512 }],
      display: "2016-15.6-3840x2160-ips",
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-1.5", { light: "white" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016,
    materials: { floor: "aluminium", deck: "cfrp", lid: "aluminium" },
  }),
  rival(2016, "denholm", "Aurel Blaze 17", {
    body: "workhorse",
    layout: "a",
    size: [424, 310, 30],
    price: 2799,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-1080-laptop",
      memory: ["ddr4-2133-sodimm", { capacity: 32, slots: 2 }],
      storage: [
        ["m2-2280-g3", { capacity: 1024 }],
        ["m2-2280-sata", { capacity: 1024 }],
      ],
      display: "2016-17.3-3840x2160-ips",
      battery: ["li-po-pouch", { wh: 90, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-2.0", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016-sub",
    },
    ports: PORTS_2016_GAMING,
    materials: { floor: "magnesium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2016, "quince", "Pomella Pro 15", {
    body: "workhorse",
    layout: "a",
    size: [349, 241, 12],
    price: 2399,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "radeon-r7-m460",
      memory: ["ddr4-2133-sodimm", { capacity: 16, slots: 2 }],
      storage: ["m2-2280-g3", { capacity: 512 }],
      display: "2016-15.4-2880x1800-ips",
      battery: ["li-po-pouch", { wh: 75, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: "pad-130x80",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: [
      ["thunderbolt-3", "left"],
      ["thunderbolt-3", "left"],
      ["thunderbolt-3", "right"],
      ["thunderbolt-3", "right"],
      ["audio-combo", "right"],
    ],
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2016, "quince", "Pomella 13", {
    body: "workhorse",
    layout: "a",
    size: [304, 212, 12],
    price: 1499,
    parts: {
      processor: "core-i5-6200u",
      memory: ["lpddr3-soldered", { capacity: 8 }],
      storage: ["m2-2280-g3", { capacity: 256 }],
      display: "2016-13.3-2560x1600-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "slim" }],
      cooling: "one-fan",
      wireless: "wifi-ac",
      keyboard: ["kb-1.0", { light: "white" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: [
      ["thunderbolt-3", "left"],
      ["thunderbolt-3", "left"],
      ["audio-combo", "right"],
    ],
    materials: { floor: "aluminium", deck: "aluminium", lid: "aluminium" },
  }),
  rival(2016, "arvane", "Vesper Zephyr 14", {
    body: "blade",
    layout: "a",
    size: [345, 235, 15],
    price: 1999,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-1060-laptop",
      memory: ["ddr4-2133-sodimm", { capacity: 16, slots: 1 }],
      storage: ["m2-2280-g3", { capacity: 256 }],
      display: "2016-14-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "slim" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-1.0", { light: "rgb-zones" }],
      trackpad: "pad-100x56",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016_THIN,
    materials: { floor: "magnesium", deck: "magnesium", lid: "magnesium" },
    spend: {
      material: 1,
      packing: 1,
      graphics: 1,
      processor: 1,
      cooling: 1,
      battery: 1,
      keyboard: 1,
      speakers: 1,
    },
  }),
  rival(2016, "arvane", "Vesper Strike 15", {
    body: "blade",
    layout: "a",
    size: [383, 262, 25],
    price: 1599,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-1060-laptop",
      memory: ["ddr4-2133-sodimm", { capacity: 16, slots: 2 }],
      storage: [
        ["m2-2280-sata", { capacity: 256 }],
        ["hdd25-2016", { capacity: 1000 }],
      ],
      display: "2016-15.6-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 60, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-2.0", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016-sub",
    },
    ports: PORTS_2016_GAMING,
  }),
  rival(2016, "ecker", "Loma 17 E", {
    body: "workhorse",
    layout: "c",
    size: [418, 285, 25],
    price: 599,
    parts: {
      processor: "a10-9600p",
      memory: ["ddr4-2133-sodimm", { capacity: 4, slots: 1 }],
      storage: ["hdd25-2016", { capacity: 1000 }],
      display: "2016-17.3-1600x900-tn-led",
      battery: ["li-po-pouch", { wh: 45, thickness: "standard" }],
      cooling: "one-fan",
      optical: "dvd-rw-slim-2016",
      wireless: "wifi-ac",
      keyboard: ["kb-1.5", { cols: 19 }],
      trackpad: "pad-100x56",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: [
      ["dc-jack", "left"],
      ["vga", "left"],
      ["hdmi-1.4", "left"],
      ["ethernet-1g", "left"],
      ["usb-a-5g", "left"],
      ["usb-a-5g", "right"],
      ["sd-reader", "right"],
      ["audio-combo", "right"],
    ],
  }),
  rival(2016, "ecker", "Loma 17 V", {
    body: "workhorse",
    layout: "c",
    size: [418, 285, 25],
    price: 1049,
    parts: {
      processor: "core-i7-7500u",
      graphics: "geforce-940mx",
      memory: ["ddr4-2133-sodimm", { capacity: 8, slots: 2 }],
      storage: ["hdd25-2016", { capacity: 1000 }],
      display: "2016-17.3-1920x1080-ips",
      battery: ["li-po-pouch", { wh: 45, thickness: "standard" }],
      cooling: "one-fan",
      optical: "dvd-rw-slim-2016",
      wireless: "wifi-ac",
      keyboard: ["kb-1.5", { cols: 19, light: "white" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016,
  }),
  rival(2016, "ecker", "Loma Nitro 15", {
    body: "workhorse",
    layout: "a",
    size: [390, 266, 26],
    price: 1299,
    parts: {
      processor: "core-i7-6700hq",
      graphics: "geforce-gtx-1060-laptop",
      memory: ["ddr4-2133-sodimm", { capacity: 8, slots: 1 }],
      storage: ["hdd25-2016", { capacity: 1000 }],
      display: "2016-15.6-1920x1080-tn-led",
      battery: ["li-po-pouch", { wh: 45, thickness: "standard" }],
      cooling: "two-fans",
      wireless: "wifi-ac",
      keyboard: ["kb-1.5", { cols: 19, light: "rgb-zones" }],
      trackpad: "pad-105x70",
      webcam: "cam-720p",
      speakers: "spk-stereo-2016",
    },
    ports: PORTS_2016_GAMING,
  }),
];

// ------------------------------------------------------------------ trims

// Further configurations of the chassis above, so the common classes of each
// year (body, performance and budget) have at least two rivals to compare.

const pick = (list: Rival[], name: string): Rival => {
  const r = list.find((x) => x.name === name);
  if (!r) throw new Error(`no rival ${name}`);
  return r;
};

const T2006: Rival[] = (() => {
  const b = (n: string) => pick(R2006, n);
  const gtx = "geforce-go-7900-gtx";
  return [
    trim(b("Wardline X62s"), "Wardline X61", 1449),
    trim(b("Aurel S1310"), "Aurel S1300", 1299, {
      parts: { graphics: null, processor: "core-duo-u2500" },
    }),
    trim(b("Vesper W6"), "Vesper W4", 1899, {
      parts: { graphics: null, processor: "core-duo-t2500" },
    }),
    trim(b("Aurel S1310"), "Aurel S1315", 1549, {
      parts: { graphics: "radeon-x1600" },
    }),
    trim(b("Vesper W6"), "Vesper W5", 1499, {
      parts: { graphics: "geforce-go-7600", processor: "core-duo-t2500" },
    }),
    trim(b("Wardline X62s"), "Wardline X62 Media", 1899, {
      parts: { graphics: "radeon-x1600" },
    }),
    trim(b("Aurel S1310"), "Aurel S1390", 2499, {
      parts: { graphics: gtx, processor: "core2-duo-t7600" },
    }),
    trim(b("Pomella 13"), "Pomella 13 Lite", 849, {
      parts: { processor: "celeron-m-430" },
    }),
    trim(b("Loma 1410"), "Loma 1420", 1049, {
      parts: { processor: "core-duo-t2500" },
    }),
    trim(b("Pomella 13"), "Pomella 13 Pro", 1649, {
      parts: { processor: "core2-duo-t5500" },
      materials: { lid: "aluminium" },
    }),
    trim(b("Pomella 13"), "Pomella 13 Plus", 1399, {
      parts: { graphics: "radeon-x1600" },
    }),
    trim(b("Aurel E1540"), "Aurel E1520", 1449, {
      parts: { processor: "core2-duo-t5500" },
    }),
    trim(b("Wardline T62"), "Wardline T62p", 2199, {
      parts: { graphics: "radeon-x1600", processor: "core2-duo-t7600" },
    }),
    trim(b("Aurel E1540"), "Aurel E1560", 1549, {
      parts: { graphics: gtx, processor: "core2-duo-t5500", cooling: "two-fans" },
    }),
    trim(b("Pomella 13"), "Pomella Play 15", 1499, {
      parts: { graphics: gtx, cooling: "two-fans" },
    }),
    trim(b("Aurel E1540"), "Aurel E1580", 1999, {
      parts: { graphics: gtx, cooling: "two-fans" },
    }),
    trim(b("Aurel E1540"), "Vesper G5", 2099, {
      maker: "arvane",
      parts: { graphics: gtx, cooling: "two-fans" },
      materials: { lid: "magnesium" },
    }),
    trim(b("Aurel S1310"), "Aurel S1370", 1549, {
      parts: { graphics: gtx, processor: "core2-duo-t5500" },
    }),
    trim(b("Vesper W6"), "Vesper W6 Plus", 2399, {
      parts: { battery: ["li-ion-18650", { cells: 6 }] },
    }),
    trim(b("Vesper W6"), "Vesper W3 Play", 1549, {
      parts: {
        processor: "core2-duo-t5500",
        battery: ["li-ion-18650", { cells: 6 }],
      },
    }),
    trim(b("Vesper W6"), "Vesper W6 Studio", 1699, {
      parts: { graphics: "geforce-go-7600" },
    }),
    trim(b("Loma 9800"), "Loma 9810", 1099, {
      parts: { processor: "core2-duo-t5500" },
    }),
    trim(b("Carrow 720"), "Carrow 740", 1399, {
      parts: { graphics: "radeon-x1600" },
    }),
    trim(b("Loma 9920 Media"), "Loma 9950 Studio", 1799, {
      parts: { processor: "core2-duo-t7600" },
    }),
    trim(b("Carrow 790 Play"), "Carrow 780 Play", 1549, {
      parts: { processor: "core2-duo-t5500" },
    }),
    trim(b("Loma 9920 Media"), "Loma 9930 Play", 1499, {
      parts: { graphics: gtx, cooling: "two-fans" },
    }),
  ];
})();

const T2016: Rival[] = (() => {
  const b = (n: string) => pick(R2016, n);
  return [
    trim(b("Wardline X14 Carbon"), "Wardline X14", 1149, {
      parts: { processor: "core-i5-6200u" },
    }),
    trim(b("Carrow Air 13"), "Carrow Air 13 Plus", 1099, {
      parts: { graphics: "geforce-940mx" },
    }),
    trim(b("Aurel 13 Plus"), "Aurel 13 Pro", 1399, {
      parts: { processor: "core-i7-7500u" },
    }),
    trim(b("Pomella 13"), "Pomella 13 Graphic", 1599, {
      parts: { graphics: "geforce-940mx" },
    }),
    trim(b("Vesper Zephyr 14"), "Aurel Blade 14", 2199, {
      maker: "denholm",
      parts: { graphics: "geforce-gtx-970m" },
    }),
    trim(b("Wardline T470"), "Wardline E470", 579, {
      parts: { processor: "core-i5-6200u" },
    }),
    trim(b("Wardline T470"), "Wardline T470p", 999, {
      parts: { graphics: "geforce-940mx" },
    }),
    trim(b("Carrow 15 Stream"), "Carrow 15 Plus", 799, {
      parts: { processor: "core-i5-6200u" },
    }),
    trim(b("Wardline T470"), "Wardline T470s", 1399, {
      parts: { processor: "core-i7-7500u" },
    }),
    trim(b("Pomella Pro 15"), "Pomella 15", 1299, {
      parts: { graphics: null, processor: "core-i7-7500u" },
    }),
    trim(b("Aurel 15 Studio"), "Aurel 15", 1099, {
      parts: { graphics: "geforce-940mx" },
    }),
    trim(b("Carrow 15 Stream"), "Carrow 15 Home", 849, {
      parts: { processor: "core-i5-6200u", graphics: "radeon-r7-m460" },
    }),
    trim(b("Vesper Strike 15"), "Vesper Strike 15 Lite", 1149, {
      parts: { graphics: "geforce-gtx-970m" },
    }),
    trim(b("Wardline Y720"), "Wardline Y520", 1099, {
      parts: { graphics: "geforce-gtx-970m" },
    }),
    trim(b("Carrow Play 17"), "Carrow 17", 579, {
      parts: { graphics: null, processor: "core-i5-6200u" },
    }),
    trim(b("Loma 17 E"), "Loma 17 E Plus", 749, {
      parts: { processor: "core-i7-7500u" },
    }),
    trim(b("Carrow Play 17"), "Carrow 17 Plus", 899, {
      parts: { graphics: null, processor: "core-i7-6500u" },
    }),
    trim(b("Carrow Play 17"), "Carrow 17 Media", 999, {
      parts: { graphics: "geforce-940mx", processor: "core-i5-6200u" },
    }),
    trim(b("Aurel Blaze 17"), "Aurel 17 Studio", 1599, {
      parts: { graphics: "geforce-940mx" },
    }),
    trim(b("Loma 17 V"), "Loma 17 VX", 1249, {
      parts: { processor: "core-i7-6700hq" },
    }),
    trim(b("Loma Nitro 15"), "Loma Nitro 15 Lite", 1149),
    trim(b("Carrow Play 17"), "Carrow Play 17 Lite", 1149, {
      parts: { graphics: "geforce-gtx-970m" },
    }),
  ];
})();

const T2026: Rival[] = (() => {
  const b = (n: string) => pick(R2026, n);
  return [
    trim(b("Wardline X14 Carbon"), "Wardline X14", 1299, {
      parts: {
        processor: "core5-120u",
        memory: ["lpddr5x-soldered", { capacity: 16 }],
      },
    }),
    trim(b("Carrow Air 14"), "Carrow Air 14 Pro", 1599, {
      parts: { processor: "core-ultra7-258v", memory: "lpddr5x-on-package" },
    }),
    trim(b("Vesper Neo 14"), "Vesper Neo 14 Core", 1399),
    trim(b("Aurel 14 Studio"), "Aurel 14 Studio RTX", 2499, {
      parts: { graphics: "rtx-5060-laptop" },
    }),
    trim(b("Wardline E16"), "Wardline E16 Pro", 1599, {
      parts: { processor: "core-ultra7-258v", memory: "lpddr5x-on-package" },
    }),
    trim(b("Pomella 15"), "Pomella 15 Pro", 1699, {
      parts: { storage: "m2-2280-g5" },
    }),
    trim(b("Aurel 16 Plus"), "Aurel 16", 1299),
    trim(b("Wardline P16"), "Wardline P16 Core", 1399),
    trim(b("Carrow Play 16"), "Carrow Play 16 Lite", 1349, {
      parts: { graphics: "rtx-5050-laptop" },
    }),
    trim(b("Loma 18"), "Carrow 17", 779, {
      maker: "halbrook",
      parts: { processor: "ryzen-ai5-340" },
    }),
    trim(b("Loma 18"), "Loma 18 Plus", 999, {
      parts: { processor: "ryzen-ai5-340" },
    }),
    trim(b("Loma 18 Pro"), "Loma 18 Business", 1199, {
      parts: { processor: "core-ultra7-258v", memory: "lpddr5x-on-package" },
    }),
    trim(b("Loma 18 Pro"), "Carrow 18", 1399, {
      maker: "halbrook",
      parts: { processor: "core-ultra-x9-388h", memory: ["lpddr5x-soldered", { capacity: 32 }] },
    }),
    trim(b("Loma 18 Pro"), "Loma 18 Studio", 1699, {
      parts: { processor: "core-ultra-x9-388h", memory: ["lpddr5x-soldered", { capacity: 32 }] },
    }),
    trim(b("Aurel Forge 18"), "Aurel 18 Studio", 2299, {
      parts: { graphics: null, processor: "core-ultra-x9-388h", memory: ["lpddr5x-soldered", { capacity: 32 }] },
    }),
    trim(b("Loma 18 Pro"), "Loma 18 Play", 1399, {
      parts: { graphics: "rtx-5050-laptop" },
    }),
    trim(b("Vesper Strike 18"), "Vesper Strike 18 Core", 1449, {
      parts: { graphics: "rtx-5060-laptop" },
    }),
  ];
})();

export const RIVALS: Rival[] = [
  ...R2006,
  ...T2006,
  ...R2016,
  ...T2016,
  ...R2026,
  ...T2026,
];

export function rivalsFor(year: number): Rival[] {
  return RIVALS.filter((r) => r.build.year === year);
}
