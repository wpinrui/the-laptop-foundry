import type { Part } from "../types";

// Board blocks. Sticks (SO-DIMM, LPCAMM2) stand long side along y so a row
// stays narrow. SO-DIMM slots stack: z is per slot, times the "slots" option.
// Capacities in GB, total.

export const MEMORY: Part[] = [
  {
    id: "ddr2-667-sodimm",
    name: "DDR2-667 SO-DIMM",
    category: "memory",
    from: 2005,
    until: 2009,
    shape: {
      kind: "block",
      role: "mem",
      size: { x: 30, y: 67.6, z: 4.6 },
      row: 2,
      stack: "slots",
    },
    options: { capacity: [1, 0.5, 2, 4], slots: [2, 1] },
    compact: [],
    needs: ["mem:ddr2-sodimm"],
    info: { note: "4 GB installed shows about 3 GB usable" },
  },
  {
    id: "ddr4-2133-sodimm",
    name: "DDR4-2133 SO-DIMM",
    category: "memory",
    from: 2015,
    until: 2021,
    shape: {
      kind: "block",
      role: "mem",
      size: { x: 30, y: 69.6, z: 4.6 },
      row: 2,
      stack: "slots",
    },
    options: { capacity: [8, 4, 16, 32], slots: [2, 1] },
    compact: [],
    needs: ["mem:ddr4-sodimm"],
  },
  {
    id: "lpddr3-soldered",
    name: "Soldered LPDDR3",
    category: "memory",
    from: 2013,
    until: 2019,
    shape: {
      kind: "block",
      role: "mem",
      size: { x: 40, y: 30, z: 1.2 },
      row: 2,
    },
    options: { capacity: [8, 4, 16] },
    compact: ["x", "y"],
    needs: ["mem:lpddr3-soldered"],
  },
  {
    id: "ddr5-5600-sodimm",
    name: "DDR5-5600 SO-DIMM",
    category: "memory",
    from: 2022,
    until: 2030,
    shape: {
      kind: "block",
      role: "mem",
      size: { x: 30, y: 69.6, z: 4.6 },
      row: 2,
      stack: "slots",
    },
    options: { capacity: [16, 8, 32, 64, 96], slots: [2, 1] },
    compact: [],
    needs: ["mem:ddr5-sodimm"],
  },
  {
    id: "lpcamm2",
    name: "LPCAMM2",
    category: "memory",
    from: 2024,
    until: 2030,
    shape: {
      kind: "block",
      role: "mem",
      size: { x: 23, y: 78, z: 3.5 },
      row: 2,
    },
    options: { capacity: [32, 64] },
    compact: [],
    needs: ["mem:lpcamm2"],
  },
  {
    id: "lpddr5x-soldered",
    name: "Soldered LPDDR5X",
    category: "memory",
    from: 2023,
    until: 2030,
    shape: {
      kind: "block",
      role: "mem",
      size: { x: 40, y: 30, z: 1.2 },
      row: 2,
    },
    options: { capacity: [16, 32, 64, 128] },
    compact: ["x", "y"],
    needs: ["mem:lpddr5x-soldered"],
    optionNeeds: { capacity: { "128": ["mem:128gb"] } },
  },
  {
    id: "lpddr5x-on-package",
    name: "On-package LPDDR5X",
    category: "memory",
    from: 2024,
    until: 2030,
    // No board area: it sits on the processor package. Capacity is fixed by the processor.
    shape: { kind: "none" },
    compact: [],
    needs: ["mem:on-package"],
  },
];

// ---------------------------------------------------------------- lab figures

/**
 * Memory timing per part. Transfer rate in MT/s; width of one channel in
 * bits; whether the part is always dual channel (soldered and LPCAMM2 run a
 * 128-bit bus); measured read over theoretical peak; latency in ns.
 */
export const MEMORY_LAB: Record<
  string,
  { mts: number; bits: number; fixedDual: boolean; efficiency: number; latency: number }
> = {
  "ddr2-667-sodimm": { mts: 667, bits: 64, fixedDual: false, efficiency: 0.55, latency: 95 },
  "ddr4-2133-sodimm": { mts: 2133, bits: 64, fixedDual: false, efficiency: 0.8, latency: 85 },
  "lpddr3-soldered": { mts: 1866, bits: 64, fixedDual: true, efficiency: 0.75, latency: 110 },
  "ddr5-5600-sodimm": { mts: 5600, bits: 64, fixedDual: false, efficiency: 0.75, latency: 100 },
  lpcamm2: { mts: 7500, bits: 64, fixedDual: true, efficiency: 0.7, latency: 120 },
  "lpddr5x-soldered": { mts: 7500, bits: 64, fixedDual: true, efficiency: 0.7, latency: 125 },
  "lpddr5x-on-package": { mts: 8533, bits: 64, fixedDual: true, efficiency: 0.72, latency: 100 },
};
