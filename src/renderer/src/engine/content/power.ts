import type { Part } from "../types";

// Battery, hot-swap and cooling.

export const BATTERIES: Part[] = [
  {
    // 18.4 mm cells, 65 mm long, laid along x. Rows are 3 cells wide (2 for 4-cell).
    // Pack is perRow x 65 + 10 wide, rows x 18.4 + 3.2 deep, 19 tall, before casing
    // (calibrated: 18.4 mm cells in a 0.3 mm holder, 1 mm removable casing each side).
    id: "li-ion-18650",
    name: "Li-ion 18650 cells",
    category: "battery",
    from: 1998,
    until: 2015,
    shape: {
      kind: "cells",
      perRow: { "4": 2, "6": 3, "9": 3, "12": 3 },
      diameter: 18.4,
      length: 65,
      height: 19,
    },
    options: { cells: [6, 4, 9, 12] },
    compact: [],
    info: { wh4: 32, wh6: 48, wh9: 72, wh12: 96 },
  },
  {
    id: "slim-li-po-2006",
    name: "Slim Li-polymer pack",
    category: "battery",
    from: 2004,
    until: 2012,
    shape: {
      kind: "pouch",
      whPerLitre: 350,
      depth: 80,
      thickness: { standard: 6 },
      wh: 40,
      limits: { x: [80, 320], y: [50, 110], z: [5, 12] },
    },
    // Sized by the player; the Compact slider packs the cells denser.
    compact: [],
  },
  {
    // The first thin-and-light pouches: less dense than today's.
    id: "li-po-pouch-2012",
    name: "Li-polymer pouch",
    category: "battery",
    from: 2010,
    until: 2016,
    shape: {
      kind: "pouch",
      whPerLitre: 450,
      depth: 80,
      thickness: { slim: 5, standard: 7 },
      wh: 50,
      limits: { x: [60, 360], y: [40, 120], z: [3.5, 10] },
    },
    compact: [],
  },
  {
    // Sized by the player; capacity follows the volume.
    id: "li-po-pouch",
    name: "Li-polymer pouch",
    category: "battery",
    from: 2015,
    until: 2030,
    shape: {
      kind: "pouch",
      whPerLitre: 600,
      depth: 85,
      // Slim first: the default suits an ultrabook; standard is the thick gaming pack.
      thickness: { slim: 4.5, standard: 6.5 },
      wh: 60,
      limits: { x: [60, 360], y: [40, 140], z: [3, 10] },
    },
    compact: [],
  },
];

export const HOTSWAP: Part[] = [
  {
    // A second battery shaped like an optical drive, in the optical bay.
    // Only a layout with an optical bay takes it, and it displaces the optical drive.
    id: "bay-battery",
    name: "Bay battery",
    category: "hotswap",
    from: 2003,
    until: 2014,
    shape: {
      kind: "box",
      units: [{ role: "odd", size: { x: 126, y: 128, z: 12.7 } }],
    },
    compact: [],
    info: { wh: 48 },
  },
  {
    // Small internal bridge cell (ThinkPad Power Bridge from 2013); the main pack moves into a 2 mm external casing.
    id: "bridge-battery",
    name: "Bridge battery",
    category: "hotswap",
    from: 2013,
    until: 2030,
    shape: {
      kind: "box",
      units: [{ role: "battery", size: { x: 60, y: 40, z: 5 } }],
    },
    compact: ["x", "y"],
    packCasing: 2,
  },
];

export const COOLING: Part[] = [
  {
    id: "fanless",
    name: "No fan",
    category: "cooling",
    from: 1990,
    until: 2099,
    shape: { kind: "fan", count: 0 },
    compact: [],
  },
  {
    id: "one-fan",
    name: "One fan",
    category: "cooling",
    from: 1990,
    until: 2099,
    shape: { kind: "fan", count: 1 },
    compact: ["y"],
  },
  {
    id: "two-fans",
    name: "Two fans",
    category: "cooling",
    from: 1995,
    until: 2099,
    shape: { kind: "fan", count: 2 },
    compact: ["y"],
  },
  // Two fans on a vapour chamber, which replaces the heat pipes over the chips.
  {
    id: "vapour-chamber",
    name: "Vapour chamber",
    category: "cooling",
    from: 2018,
    until: 2099,
    shape: { kind: "fan", count: 2, chamber: true },
    compact: ["y"],
  },
];
