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

// Footprint = cols x pitch + 8 by rows x pitch + 4. Stack is the height at that travel.
export const KEYBOARDS: Part[] = [
  {
    id: "kb-2.5",
    name: "2.5 mm travel",
    category: "keyboard",
    from: 1995,
    until: 2010,
    shape: { kind: "keys", rows: 6, stack: 6.5 },
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
    shape: { kind: "keys", rows: 6, stack: 7.0 },
    options: {
      cols: [15, 19],
      pitch: [19, 17],
      light: ["none", "lid-light", "backlit"],
    },
    compact: [],
  },
  {
    id: "kb-1.0",
    name: "1.0 mm travel",
    category: "keyboard",
    from: 2015,
    until: 2030,
    shape: { kind: "keys", rows: 6, stack: 3.0 },
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
    from: 2015,
    until: 2030,
    shape: { kind: "keys", rows: 6, stack: 3.8 },
    options: {
      cols: [15, 19],
      pitch: [19, 18],
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
    shape: { kind: "keys", rows: 6, stack: 5.5 },
    options: {
      cols: [15, 19],
      pitch: [19, 18],
      light: ["none", "white", "rgb-zones", "rgb-per-key"],
    },
    compact: [],
  },
];
/** The 2006 keyboard light sits in the top bezel beside the webcam. */
export const LID_LIGHT: Size = { x: 12, y: 5, z: 4 };

// Mechanism sets the stack; separate buttons add a 12 mm row; a pointing stick adds its own 12 mm button row.
export const PAD_STACK: Record<string, number> = {
  mechanical: 4.5,
  haptic: 3.5,
};
export const PAD_BUTTON_ROW = 12;

function pad(
  id: string,
  from: number,
  until: number,
  x: number,
  y: number,
  y2026: boolean,
): Part {
  return {
    id,
    name: `${x} by ${y} mm`,
    category: "trackpad",
    from,
    until,
    shape: { kind: "pad", x, y },
    options: y2026
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

export const TRACKPADS: Part[] = [
  pad("pad-65x40", 2000, 2010, 65, 40, false),
  pad("pad-75x45", 2000, 2010, 75, 45, false),
  pad("pad-85x50", 2003, 2010, 85, 50, false),
  pad("pad-110x70", 2018, 2030, 110, 70, true),
  pad("pad-125x80", 2018, 2030, 125, 80, true),
  pad("pad-145x90", 2020, 2030, 145, 90, true),
  pad("pad-160x100", 2022, 2030, 160, 100, true),
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
  cam("cam-1.3mp", "1.3 MP", 2006, 2011, { x: 30, y: 7, z: 4.5 }, false),
  cam("cam-720p", "720p", 2015, 2030, { x: 20, y: 4, z: 2.8 }, true),
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
