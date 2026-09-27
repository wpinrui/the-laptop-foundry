import type { Body, Range, Size } from "../types";

// New bodies only. Append these to BODIES in bodies.ts (same LIMITS, START, s() and base).
// Perimeter bodies need the BodyStyle additions in README.md.

const LIMITS: { x: Range; y: Range; z: Range } = { x: [240, 450], y: [160, 330], z: [8, 55] };
const START: Size = { x: 340, y: 240, z: 22 };
const s = (k: number | [number, number], of: "x" | "y" | "z" | "short", min: number, max: number) => ({ k, of, min, max });
const base = { size: { ...START }, limits: LIMITS, wedge: 0 } as const;

export const NEW_BODIES: Body[] = [
  {
    // Straight wedge: one flat underside plane from thick rear to thin front.
    id: "wedge", name: "Wedge", from: 2003, until: 2016, ...base,
    style: { edge: "square", corner: s(0.008, "short", 2, 4), profile: 0, taper: { front: [0.7, 0.4], minFront: 6, run: 0.85, linear: true }, wedge: 0, hinge: "full", latch: false, signature: "taper" },
    hinge: { x: 30, y: 20, z: 5 }, layouts: ["b", "c"],
  },
  // Perimeter bodies: one edge profile (top + bottom treatment) swept round the plan.
  // The insets scale per side (build.sides[body] overrides perim.sides, 0–1.5).
  {
    // Front and rear faces raked back underneath; sides square.
    id: "slant", name: "Slant", from: 2009, until: 2099, ...base,
    style: { edge: "perim", corner: s(0.012, "short", 2, 6), profile: 0, perim: { top: { kind: "round", h: s(0.05, "z", 0.5, 1.2), d: "h" }, bot: { kind: "linear", h: "full", d: s([0.25, 1.0], "z", 2, 24) }, sides: { f: 1, s: 0, r: 1 } }, wedge: 0, hinge: "drop", latch: false, signature: "slant" },
    hinge: { x: 32, y: 15, z: 4 }, layouts: ["a", "b", "c"],
  },
  {
    // Ends roll over top and bottom, up to a full half-round.
    id: "capsule", name: "Capsule", from: 2012, until: 2099, ...base,
    style: { edge: "perim", corner: s(0.03, "short", 5, 12), profile: 0, perim: { top: { kind: "round", h: s([0.22, 0.5], "z", 1.5, 27), d: "h" }, bot: { kind: "round", h: s([0.22, 0.5], "z", 1.5, 27), d: "h" }, sides: { f: 1, s: 0.3, r: 1 } }, wedge: 0, hinge: "full", latch: false, signature: "round" },
    hinge: { x: 30, y: 18, z: 5 }, layouts: ["a", "b", "c"],
  },
  {
    // Early thin-and-light: convex curved underside to a thin edge all round.
    id: "teardrop", name: "Teardrop", from: 2006, until: 2017, ...base,
    style: { edge: "perim", corner: s(0.045, "short", 8, 16), profile: 0, perim: { top: { kind: "round", h: 0.8, d: 0.8 }, bot: { kind: "curve", h: "edge", d: s([0.1, 0.28], "y", 12, 80) }, edge: { k: 0.3, min: 4 }, sides: { f: 1.3, s: 1, r: 0.35 } }, wedge: 0, hinge: "drop", latch: false, signature: "wrap" },
    hinge: { x: 28, y: 14, z: 4 }, layouts: ["b", "c"],
  },
  {
    // Ultrabook: straight bevel under every edge.
    id: "ultra", name: "Ultra", from: 2015, until: 2099, ...base,
    style: { edge: "perim", corner: s(0.02, "short", 3, 8), profile: 0, perim: { top: { kind: "round", h: 1, d: 1 }, bot: { kind: "linear", h: "edge", d: s([0.05, 0.16], "y", 6, 45) }, edge: { k: 0.42, min: 4 }, sides: { f: 1, s: 1, r: 0.6 } }, wedge: 0, hinge: "drop", latch: false, signature: "wrap" },
    hinge: { x: 30, y: 14, z: 4 }, layouts: ["a", "b", "c"],
  },
  {
    // Double bevel: top chamfer + long lower bevel meet at a sharp edge line.
    id: "knife", name: "Knife", from: 2018, until: 2099, ...base,
    style: { edge: "perim", corner: s(0.012, "short", 2, 5), profile: 0, perim: { top: { kind: "chamfer", h: s(0.16, "z", 1, 3.5), d: s(0.3, "z", 1.5, 6) }, bot: { kind: "linear", h: "edge", d: s([0.06, 0.18], "y", 8, 50) }, edge: { k: 0.45, min: 4.2 }, sides: { f: 1, s: 1, r: 1 } }, wedge: 0, hinge: "drop", latch: false, signature: "wrap" },
    hinge: { x: 30, y: 14, z: 4 }, layouts: ["a", "b", "c"],
  },
  {
    // Gem cut: chamfered plan corners + bevel under every edge.
    id: "facet", name: "Facet", from: 2019, until: 2099, ...base,
    style: { edge: "perim", cornerKind: "chamfer", corner: s([0.03, 0.1], "short", 6, 28), profile: 0, perim: { top: { kind: "chamfer", h: 1.2, d: 1.2 }, bot: { kind: "linear", h: "edge", d: s(0.1, "y", 8, 30) }, edge: { k: 0.45, min: 4 }, sides: { f: 0.8, s: 1, r: 1 } }, wedge: 0, hinge: "drop", latch: false, signature: "facet" },
    hinge: { x: 30, y: 14, z: 4 }, layouts: ["a", "b", "c"],
  },
  {
    // Modern flat ultralight: uniform, big plan corners, crisp top, softer base radius.
    id: "aero", name: "Aero", from: 2021, until: 2099, ...base,
    style: { edge: "perim", corner: s(0.05, "short", 10, 18), profile: 0, perim: { top: { kind: "round", h: s(0.08, "z", 0.8, 1.6), d: "h" }, bot: { kind: "round", h: s([0.15, 0.45], "z", 1.5, 7), d: "h" }, sides: { f: 1, s: 1, r: 1 } }, wedge: 0, hinge: "drop", latch: false, signature: "edge" },
    hinge: { x: 30, y: 14, z: 4 }, layouts: ["a", "b", "c"],
  },
];
