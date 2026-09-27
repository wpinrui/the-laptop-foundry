import type { Part, Size } from "../types";

// Optical, wireless, keyboard, trackpad, webcam, speakers.

// Optical drives slide in from the side: the 126 mm depth runs along x.
function odd(
  id: string,
  name: string,
  from: number,
  until: number,
  z: number,
): Part {
  return {
    id,
    name,
    category: "optical",
    from,
    until,
    shape: {
      kind: "box",
      units: [{ role: "odd", size: { x: 126, y: 128, z } }],
    },
    compact: [],
  };
}

export const OPTICAL: Part[] = [
  odd("combo", "DVD-ROM/CD-RW combo", 2002, 2009, 12.7),
  odd("dvd-rw-dl", "DVD±RW dual layer", 2005, 2010, 12.7),
  odd("dvd-rw-slim-2006", "DVD±RW slim", 2005, 2010, 9.5),
  odd("bd-writer", "Blu-ray writer", 2006, 2010, 12.7),
  odd("hd-dvd", "HD DVD reader", 2006, 2008, 12.7),
  odd("bd-combo", "Blu-ray reader, DVD±RW", 2007, 2010, 12.7),
  odd("dvd-rw-2011", "DVD±RW dual layer", 2011, 2015, 12.7),
  odd("bd-writer-slim-2010", "Blu-ray writer slim", 2010, 2019, 9.5),
  odd("dvd-rw-slim-2016", "DVD±RW slim", 2011, 2019, 9.5),
  odd("bd-combo-slim", "Blu-ray reader, DVD±RW slim", 2011, 2019, 9.5),
  odd("dvd-rw-slim", "DVD±RW slim", 2020, 2030, 9.5),
  odd("bd-writer-slim", "Blu-ray writer slim", 2020, 2030, 9.5),
];

export const WIRELESS: Part[] = [
  // Bluetooth 2.0 is an optional add-on module in 2006.
  {
    id: "wifi-bg",
    name: "802.11b/g",
    category: "wireless",
    from: 2003,
    until: 2009,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 30, y: 51, z: 4 },
      row: 2,
    },
    options: { bluetooth: ["none", "2.0"] },
    compact: [],
  },
  {
    id: "wifi-abg",
    name: "802.11a/b/g",
    category: "wireless",
    from: 2004,
    until: 2009,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 30, y: 51, z: 4 },
      row: 2,
    },
    options: { bluetooth: ["none", "2.0"] },
    compact: [],
  },
  {
    id: "wifi-n-draft",
    name: "802.11a/g/n draft",
    category: "wireless",
    from: 2007,
    until: 2009,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 30, y: 51, z: 4 },
      row: 2,
    },
    options: { bluetooth: ["none", "2.0"] },
    compact: [],
  },
  {
    id: "wifi-n-bt3",
    name: "802.11n + Bluetooth 3.0",
    category: "wireless",
    from: 2010,
    until: 2012,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 30, y: 27, z: 3.5 },
      row: 2,
    },
    compact: [],
  },
  {
    id: "wifi-n-bt4",
    name: "802.11n + Bluetooth 4.0",
    category: "wireless",
    from: 2012,
    until: 2016,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 30, y: 27, z: 3.5 },
      row: 2,
    },
    compact: [],
  },
  {
    id: "wifi-ac",
    name: "802.11ac + Bluetooth 4.1",
    category: "wireless",
    from: 2013,
    until: 2022,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 22, y: 30, z: 3 },
      row: 2,
    },
    compact: [],
  },
  {
    id: "wifi-6",
    name: "Wi-Fi 6 + Bluetooth 5.1",
    category: "wireless",
    from: 2019,
    until: 2026,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 22, y: 30, z: 3 },
      row: 2,
    },
    compact: [],
  },
  {
    id: "wifi-6e",
    name: "Wi-Fi 6E + Bluetooth 5.3",
    category: "wireless",
    from: 2021,
    until: 2030,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 22, y: 30, z: 3 },
      row: 2,
    },
    compact: [],
  },
  {
    id: "wifi-7",
    name: "Wi-Fi 7 + Bluetooth 5.4",
    category: "wireless",
    from: 2024,
    until: 2030,
    shape: {
      kind: "block",
      role: "wlan",
      size: { x: 22, y: 30, z: 3 },
      row: 2,
    },
    compact: [],
  },
];
export const BLUETOOTH_2006: Size = { x: 15, y: 20, z: 3 };

/**
 * Wi-Fi throughput in Mbit/s, iperf at 1 m from the era's reference router.
 * 2006 cards against an 802.11g router; 2016 a 2x2 802.11ac router; 2026 a
 * 6 GHz router at the widest channel the card supports.
 */
export const WIFI_LAB: Record<string, { send: number; receive: number }> = {
  "wifi-bg": { send: 21, receive: 23 },
  "wifi-abg": { send: 23, receive: 25 },
  "wifi-n-draft": { send: 85, receive: 100 },
  "wifi-n-bt3": { send: 150, receive: 180 },
  "wifi-n-bt4": { send: 190, receive: 230 },
  "wifi-ac": { send: 580, receive: 640 },
  "wifi-6": { send: 900, receive: 1100 },
  "wifi-6e": { send: 1450, receive: 1650 },
  "wifi-7": { send: 1950, receive: 2350 },
};

// Footprint = (cols - 0.5) x pitch + 4 by rows x pitch + 4. Stack is the height at that travel,
// at keyboard spend 0 and 1. Full Compact thins caps, scissors and plate, but
// never below the travel plus about 1.2 mm of cap, membrane and backplate.
// Zoned RGB from the Alienware M17x (2009), per-key RGB from the Razer Blade's Chroma (2016).
const LIGHT_YEARS: Record<string, [number, number]> = {
  "rgb-zones": [2009, 2099],
  "rgb-per-key": [2016, 2099],
};

export const KEYBOARDS: Part[] = [
  {
    id: "kb-2.5",
    name: "2.5 mm travel",
    category: "keyboard",
    from: 1995,
    until: 2012,
    shape: { kind: "keys", rows: 6, stack: [6.0, 3.7] },
    options: {
      cols: [15, 19],
      pitch: [19, 17],
      light: ["none", "lid-light", "backlit"],
    },
    compact: [],
  },
  {
    id: "kb-3.0",
    name: "3.0 mm travel",
    category: "keyboard",
    from: 1995,
    until: 2010,
    shape: { kind: "keys", rows: 6, stack: [6.5, 4.2] },
    options: {
      cols: [15, 19],
      pitch: [19, 17],
      light: ["none", "lid-light", "backlit"],
    },
    compact: [],
  },
  {
    // Island keyboards with about 2 mm of travel from 2006 (VAIO, MacBook).
    id: "kb-2.0",
    name: "2.0 mm travel",
    category: "keyboard",
    from: 2006,
    until: 2019,
    shape: { kind: "keys", rows: 6, stack: [4.2, 3.2] },
    options: {
      cols: [15, 19],
      pitch: [19, 18],
      light: ["none", "white", "rgb-zones"],
    },
    compact: [],
  },
  {
    id: "kb-1.0",
    name: "1.0 mm travel",
    category: "keyboard",
    from: 2015,
    until: 2030,
    shape: { kind: "keys", rows: 6, stack: [2.6, 2.2] },
    options: {
      cols: [15, 19],
      pitch: [19, 18],
      light: ["none", "white", "rgb-zones", "rgb-per-key"],
    },
    compact: [],
  },
  {
    id: "kb-1.5",
    name: "1.5 mm travel",
    category: "keyboard",
    from: 2012,
    until: 2030,
    shape: { kind: "keys", rows: 6, stack: [3.3, 2.7] },
    options: {
      cols: [15, 19],
      pitch: [19, 18],
      light: ["none", "white", "rgb-zones", "rgb-per-key"],
    },
    compact: [],
  },
  {
    // Full-height Cherry MX switches in the MSI GT80 and GT83 Titan.
    id: "kb-mech-3.5",
    name: "Mechanical, 3.5 mm travel",
    category: "keyboard",
    from: 2015,
    until: 2019,
    shape: { kind: "keys", rows: 6, stack: [11.0, 9.5] },
    options: {
      cols: [19, 15],
      pitch: [19],
      light: ["none", "white", "rgb-zones", "rgb-per-key"],
    },
    compact: [],
  },
  {
    id: "kb-mech-1.8",
    name: "Low-profile mechanical, 1.8 mm travel",
    category: "keyboard",
    from: 2019,
    until: 2030,
    shape: { kind: "keys", rows: 6, stack: [5.0, 3.8] },
    options: {
      cols: [15, 19],
      pitch: [19, 18],
      light: ["none", "white", "rgb-zones", "rgb-per-key"],
    },
    compact: [],
  },
];
for (const k of KEYBOARDS)
  if (k.options?.light?.some((v) => String(v) in LIGHT_YEARS)) k.optionYears = { light: LIGHT_YEARS };

/** The 2006 keyboard light sits in the top bezel beside the webcam. */
export const LID_LIGHT: Size = { x: 12, y: 5, z: 4 };

// Mechanism sets the stack (at trackpad spend 0 and 1); separate buttons add a 12 mm row; a pointing stick adds its own 12 mm button row.
export const PAD_STACK: Record<string, [number, number]> = {
  mechanical: [4.5, 3.5],
  haptic: [3.5, 2.5],
};
export const PAD_BUTTON_ROW = 12;

/** Older size parts: kept for rival builds, never offered. Player saves migrate to the technologies (engine/pad.ts). */
function legacyPad(
  id: string,
  from: number,
  until: number,
  x: number,
  y: number,
  y2026: boolean | "clickpad",
): Part {
  return {
    id,
    name: `${x} by ${y} mm`,
    category: "trackpad",
    from,
    until,
    rivalOnly: true,
    shape: { kind: "pad", x, y },
    options:
      y2026 === "clickpad"
        ? {
            mechanism: ["mechanical"],
            buttons: ["clickpad", "separate"],
            stick: ["no", "yes"],
          }
        : y2026
      ? {
          mechanism: ["haptic", "mechanical"],
          buttons: ["clickpad", "separate"],
          stick: ["no", "yes"],
        }
      : {
          mechanism: ["mechanical"],
          buttons: ["separate"],
          stick: ["no", "yes"],
        },
    compact: [],
  };
}

// The trackpad is chosen by technology; its size is the player's, within the
// year's limits (engine/pad.ts). Clickpads from the unibody MacBook (2008) and
// the Synaptics ClickPad (2009), in Mylar or glass. Haptic pads from Force
// Touch (2015).
export const TRACKPADS: Part[] = [
  {
    id: "pad-buttons",
    name: "Touchpad with buttons",
    category: "trackpad",
    from: 1995,
    until: 2030,
    shape: { kind: "pad", x: 80, y: 50, buttons: true, mechanism: "mechanical" },
    options: { surface: ["mylar"], stick: ["no", "yes"] },
    compact: [],
  },
  {
    id: "pad-clickpad",
    name: "Clickpad",
    category: "trackpad",
    from: 2008,
    until: 2030,
    shape: { kind: "pad", x: 105, y: 70, buttons: false, mechanism: "mechanical" },
    options: { surface: ["mylar", "glass"], stick: ["no", "yes"] },
    compact: [],
  },
  {
    id: "pad-haptic",
    name: "Haptic clickpad",
    category: "trackpad",
    from: 2015,
    until: 2030,
    shape: { kind: "pad", x: 125, y: 80, buttons: false, mechanism: "haptic" },
    options: { surface: ["glass"], stick: ["no", "yes"] },
    compact: [],
  },
  legacyPad("pad-65x40", 2000, 2011, 65, 40, false),
  legacyPad("pad-75x45", 2000, 2012, 75, 45, false),
  legacyPad("pad-85x50", 2003, 2012, 85, 50, false),
  legacyPad("pad-100x56", 2011, 2019, 100, 56, "clickpad"),
  legacyPad("pad-105x70", 2012, 2019, 105, 70, "clickpad"),
  legacyPad("pad-130x80", 2015, 2019, 130, 80, "clickpad"),
  legacyPad("pad-110x70", 2018, 2030, 110, 70, true),
  legacyPad("pad-125x80", 2018, 2030, 125, 80, true),
  legacyPad("pad-145x90", 2020, 2030, 145, 90, true),
  legacyPad("pad-160x100", 2022, 2030, 160, 100, true),
];

function cam(
  id: string,
  name: string,
  from: number,
  until: number,
  size: Size,
  shutter: boolean,
): Part {
  return {
    id,
    name,
    category: "webcam",
    from,
    until,
    shape: { kind: "box", units: [{ role: "webcam", size }] },
    options: shutter ? { shutter: ["no", "yes"] } : undefined,
    compact: ["x", "y", "z"],
  };
}

// No webcam is an empty webcam list. A privacy shutter adds 10 mm of width.
export const WEBCAMS: Part[] = [
  cam("cam-0.3mp", "0.3 MP", 2004, 2009, { x: 25, y: 6, z: 3.5 }, false),
  cam("cam-1.3mp", "1.3 MP", 2006, 2012, { x: 30, y: 7, z: 4.5 }, false),
  // HD webcams from 2009; Windows Hello IR cameras from 2015 (Surface Pro 4).
  cam("cam-720p", "720p", 2009, 2030, { x: 20, y: 4, z: 2.8 }, true),
  cam("cam-720p-ir", "720p with IR", 2015, 2030, { x: 36, y: 4, z: 3 }, true),
  cam("cam-1080p", "1080p", 2020, 2030, { x: 22, y: 4.5, z: 3 }, true),
  cam(
    "cam-1080p-ir",
    "1080p with IR",
    2020,
    2030,
    { x: 40, y: 4.5, z: 3.2 },
    true,
  ),
  cam("cam-5mp-ir", "5 MP with IR", 2023, 2030, { x: 45, y: 5, z: 3.5 }, true),
];
export const SHUTTER_WIDTH = 10;

// Speaker units are dealt between the two speaker zones in turn.
// 2026 drivers stand long side along y so they sit beside the battery.
const spk06: Size = { x: 30, y: 15, z: 8 };
const sub06: Size = { x: 45, y: 40, z: 14 };
const tw26: Size = { x: 12, y: 35, z: 4.5 };
const wf26: Size = { x: 20, y: 60, z: 9 };
const fc26: Size = { x: 18, y: 45, z: 8 };

function spk(
  id: string,
  name: string,
  from: number,
  until: number,
  units: { size: Size; count: number }[],
): Part {
  return {
    id,
    name,
    category: "speakers",
    from,
    until,
    shape: {
      kind: "box",
      units: units.map((u) => ({
        role: "spk" as const,
        size: u.size,
        count: u.count,
      })),
    },
    compact: ["x", "y", "z"],
    // Thin speaker boxes cost more, so Compact can take off more than half the height.
    compactZ: 0.55,
  };
}

export const SPEAKERS: Part[] = [
  spk("spk-mono", "Mono, 1 x 1 W", 1995, 2010, [{ size: spk06, count: 1 }]),
  spk("spk-stereo-2006", "Stereo, 2 x 1 W", 1995, 2010, [
    { size: spk06, count: 2 },
  ]),
  spk("spk-stereo-sub", "Stereo plus subwoofer", 2005, 2010, [
    { size: spk06, count: 2 },
    { size: sub06, count: 1 },
  ]),
  spk("spk-stereo-2016", "Stereo, 2 x 2 W", 2011, 2019, [
    { size: { x: 25, y: 12, z: 6 }, count: 2 },
  ]),
  spk("spk-stereo-2016-sub", "Stereo plus subwoofer", 2011, 2019, [
    { size: { x: 25, y: 12, z: 6 }, count: 2 },
    { size: { x: 35, y: 30, z: 10 }, count: 1 },
  ]),
  spk("spk-stereo-2026", "Stereo, 2 x 2 W", 2018, 2030, [
    { size: tw26, count: 2 },
  ]),
  spk("spk-quad", "Quad, 2 tweeters + 2 woofers", 2018, 2030, [
    { size: tw26, count: 2 },
    { size: wf26, count: 2 },
  ]),
  spk("spk-six", "Six, 2 tweeters + 4 force-cancelling woofers", 2020, 2030, [
    { size: tw26, count: 2 },
    { size: fc26, count: 4 },
  ]),
];
