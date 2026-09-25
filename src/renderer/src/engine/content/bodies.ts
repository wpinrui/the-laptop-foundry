import type { Body, Range, Size } from "../types";

// Bodies are shapes, not size classes. Every body scales over the same wide
// range, from a 10 mm 11 inch ultrabook to a 50 mm 18 inch desktop
// replacement, and starts at the same size. They differ only in shape: edge
// profile, corner radius, wedge, hinge and latch.

const LIMITS: { x: Range; y: Range; z: Range } = {
  x: [240, 450],
  y: [160, 330],
  z: [8, 55],
};
const START: Size = { x: 340, y: 240, z: 22 };

export const BODIES: Body[] = [
  {
    // A squared-off business slab: square edges, tight corners, full-width hinge.
    id: "workhorse",
    name: "Workhorse",
    from: 2000,
    until: 2099,
    size: { ...START },
    limits: LIMITS,
    style: {
      edge: "square",
      corner: 2,
      profile: 0,
      wedge: 0,
      hinge: "full",
      latch: false,
    },
    hinge: { x: 30, y: 20, z: 5 },
    layouts: ["a", "b", "c"],
  },
  {
    // A soft, rounded 2006-style body: big corner radius, rounded edges, barrel hinges, front latch.
    id: "pillow",
    name: "Pillow",
    from: 2000,
    until: 2012,
    size: { ...START },
    limits: LIMITS,
    style: {
      edge: "rounded",
      corner: 16,
      profile: 6,
      wedge: 0,
      hinge: "barrel",
      latch: true,
    },
    hinge: { x: 25, y: 20, z: 6 },
    layouts: ["a", "b", "c"],
  },
  {
    // A sharp chamfered wedge: small corners, chamfered edges, 6 mm thicker at the rear, drop hinge.
    id: "blade",
    name: "Blade",
    from: 2015,
    until: 2099,
    size: { ...START },
    limits: LIMITS,
    style: {
      edge: "chamfer",
      corner: 4,
      profile: 1.5,
      wedge: 6,
      hinge: "drop",
      latch: false,
    },
    hinge: { x: 35, y: 15, z: 4 },
    layouts: ["a", "b", "c"],
  },
];
