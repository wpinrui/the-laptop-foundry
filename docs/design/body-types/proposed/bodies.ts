import type { Body, Range, Size } from "../types";

// Bodies are shapes, not size classes. Every body scales over the same range
// and starts at the same size. Each shape parameter is a rule of the size
// (see Scaled in types.ts), so every body resolves to a valid shell anywhere
// in LIMITS. resolveStyle(style, size, shape) in shell.ts turns the rules into
// millimetres; nothing downstream reads a raw rule.

const LIMITS: { x: Range; y: Range; z: Range } = {
  x: [240, 450],
  y: [160, 330],
  z: [8, 55],
};
const START: Size = { x: 340, y: 240, z: 22 };

/** k × the axis ("short" = the shorter of x and y), clamped to [min, max]. A [k0, k1] pair is the signature slider's range. */
const s = (k: number | [number, number], of: "x" | "y" | "z" | "short", min: number, max: number) => ({ k, of, min, max });

const base = { size: { ...START }, limits: LIMITS, wedge: 0 } as const;

export const BODIES: Body[] = [
  {
    // Square business slab: the reference inner box.
    id: "workhorse", name: "Workhorse", from: 2000, until: 2099, ...base,
    style: { edge: "square", corner: s([0.003, 0.014], "short", 1, 5), profile: 0, wedge: 0, hinge: "full", latch: false, signature: "corner" },
    hinge: { x: 30, y: 20, z: 5 }, layouts: ["a", "b", "c"],
  },
  {
    // Soft 2006 consumer body: big corners, deep round edge, domed lid, barrels, latch.
    id: "pillow", name: "Pillow", from: 2000, until: 2012, ...base,
    style: { edge: "rounded", corner: s(0.07, "short", 10, 22), profile: s([0.2, 0.4], "z", 2, 10), crown: s(0.06, "z", 0.8, 2.5), wedge: 0, hinge: "barrel", latch: true, signature: "profile" },
    hinge: { x: 25, y: 20, z: 6 }, layouts: ["a", "b", "c"],
  },
  {
    // Cylindrical rear spine holding the hinge and cells, hanging below the base.
    id: "spine", name: "Spine", from: 2000, until: 2011, ...base,
    style: { edge: "rounded", corner: s(0.025, "short", 5, 9), profile: s(0.12, "z", 1.5, 4), spine: { drop: s([0.25, 0.65], "z", 4, 18) }, wedge: 0, hinge: "spine", latch: false, signature: "drop" },
    hinge: { x: 28, y: 0, z: 0 }, layouts: ["b", "c"],
  },
  {
    // Rugged: thick walls, corner bumpers proud of top and bottom, latched lid.
    id: "field", name: "Field", from: 2000, until: 2099, ...base,
    style: { edge: "rounded", corner: s(0.03, "short", 6, 12), profile: s(0.08, "z", 1.5, 4), bumper: s([0.12, 0.3], "z", 1.5, 10), wallScale: 1.7, wedge: 0, hinge: "full", latch: true, signature: "bumper" },
    hinge: { x: 34, y: 22, z: 6 }, layouts: ["a", "b", "c"],
  },
  {
    // True taper: bottom rises to a thin chamfered front. Replaces the old cosmetic wedge.
    id: "blade", name: "Blade", from: 2008, until: 2099, ...base,
    style: { edge: "chamfer", corner: s(0.012, "short", 2, 6), profile: s(0.08, "z", 0.6, 2), taper: { front: [0.75, 0.38], minFront: 5, run: 0.7 }, wedge: 0, hinge: "drop", latch: false, signature: "taper" },
    hinge: { x: 35, y: 15, z: 4 }, layouts: ["a", "b", "c"],
  },
  {
    // Deep undercut all round: the lower half tucks in under a cove.
    id: "float", name: "Float", from: 2013, until: 2099, ...base,
    style: { edge: "rounded", corner: s(0.035, "short", 6, 14), profile: s(0.05, "z", 0.6, 1.5), undercut: { inset: s([0.012, 0.032], "short", 2.5, 10), height: s(0.45, "z", 3, 14) }, wedge: 0, hinge: "drop", latch: false, signature: "undercut" },
    hinge: { x: 32, y: 15, z: 4 }, layouts: ["a", "b", "c"],
  },
  {
    // Hinge set forward of a raised rear shelf for exhaust and rear ports.
    id: "shelf", name: "Shelf", from: 2014, until: 2099, ...base,
    style: { edge: "chamfer", corner: s(0.01, "short", 2, 5), profile: s(0.08, "z", 1, 3), shelf: { depth: s([0.08, 0.2], "y", 16, 60), rise: s(0.2, "z", 2, 8) }, wedge: 0, hinge: "inset", latch: false, signature: "shelf" },
    hinge: { x: 36, y: 18, z: 6 }, layouts: ["a", "c"],
  },
  {
    // Lifting hinge: the lid's lower edge swings under the rear. Rear wall hidden.
    id: "lift", name: "Lift", from: 2019, until: 2099, ...base,
    style: { edge: "rounded", corner: s(0.022, "short", 4, 9), profile: s(0.06, "z", 0.8, 2), lift: { lip: s([0.25, 0.55], "z", 2.5, 9) }, wedge: 0, hinge: "lift", latch: false, signature: "lip" },
    hinge: { x: 30, y: 14, z: 4 }, layouts: ["b", "c"],
  },
];
