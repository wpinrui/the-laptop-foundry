import type { Body, Range, Scaled, Size } from "../types";

// Bodies are shapes, not size classes. Every body scales over the same range,
// from a 10 mm 11 inch ultrabook to a 50 mm 18 inch desktop replacement, and
// starts at the same size. Each shape parameter is a rule of the size (Scaled),
// so every body resolves to a valid shell anywhere in LIMITS; resolveStyle in
// shell.ts turns the rules into millimetres, and nothing downstream reads a rule.

const LIMITS: { x: Range; y: Range; z: Range } = {
  x: [240, 450],
  y: [160, 330],
  z: [8, 55],
};
const START: Size = { x: 340, y: 240, z: 22 };

/** k times the axis ("short" is the shorter of x and y), clamped. A [k0, k1] pair is the signature slider's range. */
const s = (k: number | [number, number], of: "x" | "y" | "z" | "short", min: number, max: number): Scaled => ({ k, of, min, max });

const base = { limits: LIMITS };

export const BODIES: Body[] = [
  {
    // Square business slab: the reference inner box.
    id: "workhorse",
    name: "Workhorse",
    from: 2000,
    until: 2099,
    ...base,
    size: { ...START },
    style: { edge: "square", corner: s([0.002, 0.01], "short", 1, 5), profile: 0, hinge: "full", latch: false, signature: "corner" },
    hinge: { x: 30, y: 20, z: 5 },
    layouts: ["a", "b", "c"],
  },
  {
    // Soft consumer body: big corners, a deep round edge, a domed lid, barrel hinges and a latch.
    id: "pillow",
    name: "Pillow",
    from: 2000,
    until: 2012,
    ...base,
    size: { ...START },
    style: {
      edge: "rounded",
      corner: s(0.07, "short", 10, 22),
      profile: s([0.2, 0.4], "z", 2, 10),
      crown: s(0.06, "z", 0.8, 2.5),
      hinge: "barrel",
      latch: true,
      signature: "profile",
    },
    hinge: { x: 25, y: 20, z: 6 },
    layouts: ["a", "b", "c"],
  },
  {
    // A cylindrical rear spine that carries the hinge and hangs below the base.
    id: "spine",
    name: "Spine",
    from: 2000,
    until: 2011,
    ...base,
    size: { ...START },
    style: {
      edge: "rounded",
      corner: s(0.025, "short", 5, 9),
      profile: s(0.12, "z", 1.5, 4),
      spine: { drop: s([0.25, 0.65], "z", 4, 18) },
      hinge: "spine",
      latch: false,
      signature: "drop",
    },
    hinge: { x: 28, y: 12, z: 4 },
    layouts: ["b", "c"],
  },
  {
    // Rugged: thick walls, corner bumpers proud of the top and bottom, a latched lid.
    id: "field",
    name: "Field",
    from: 2000,
    until: 2099,
    ...base,
    size: { ...START },
    style: {
      edge: "rounded",
      corner: s(0.03, "short", 6, 12),
      profile: s(0.08, "z", 1.5, 4),
      bumper: s([0.12, 0.3], "z", 1.5, 10),
      wallScale: 1.7,
      hinge: "full",
      latch: true,
      signature: "bumper",
    },
    hinge: { x: 34, y: 22, z: 6 },
    layouts: ["a", "b", "c"],
  },
  {
    // A true taper to a thin chamfered front. The thickness the player sets is the rear.
    id: "blade",
    name: "Blade",
    from: 2008,
    until: 2099,
    ...base,
    size: { ...START },
    style: {
      edge: "chamfer",
      corner: s(0.012, "short", 2, 6),
      profile: s(0.08, "z", 0.6, 2),
      taper: { front: [0.75, 0.38], minFront: 5, run: 0.7 },
      hinge: "drop",
      latch: false,
      signature: "taper",
    },
    hinge: { x: 35, y: 15, z: 4 },
    layouts: ["a", "b", "c"],
  },
  {
    // A deep undercut all round: the lower half tucks in under a cove.
    id: "float",
    name: "Float",
    from: 2013,
    until: 2099,
    ...base,
    size: { ...START },
    style: {
      edge: "rounded",
      corner: s(0.035, "short", 6, 14),
      profile: s(0.05, "z", 0.6, 1.5),
      undercut: { inset: s([0.012, 0.032], "short", 2.5, 10), height: s(0.45, "z", 3, 14) },
      hinge: "drop",
      latch: false,
      signature: "undercut",
    },
    hinge: { x: 32, y: 15, z: 4 },
    layouts: ["a", "b", "c"],
  },
  {
    // The hinge set forward of a raised rear shelf that holds the exhaust and rear ports.
    id: "shelf",
    name: "Shelf",
    from: 2014,
    until: 2099,
    ...base,
    size: { ...START },
    style: {
      edge: "chamfer",
      corner: s(0.01, "short", 2, 5),
      profile: s(0.08, "z", 1, 3),
      shelf: { depth: s([0.08, 0.2], "y", 16, 60), rise: s(0.2, "z", 2, 8) },
      hinge: "inset",
      latch: false,
      signature: "shelf",
    },
    hinge: { x: 36, y: 18, z: 6 },
    layouts: ["a", "c"],
  },
  {
    // A lifting hinge: the lid's lower edge swings down behind the rear, over a chamfered rear edge.
    id: "lift",
    name: "Lift",
    from: 2019,
    until: 2099,
    ...base,
    size: { ...START },
    style: {
      edge: "rounded",
      corner: s(0.022, "short", 4, 9),
      profile: s(0.06, "z", 0.8, 2),
      lift: { lip: s([0.25, 0.55], "z", 2.5, 9) },
      hinge: "lift",
      latch: false,
      signature: "lip",
    },
    hinge: { x: 30, y: 14, z: 4 },
    layouts: ["b", "c"],
  },
];
