import type { Part, PowerSpec, Size } from "../types";

// Power: range, default sustained and boost limits (boost is the dynamic
// boost a gaming load gets), rated power (sizes the power stage), idle power.
// Scores are Time Spy graphics points at a board power. 2006 parts never ran
// Time Spy: their figures are scaled from shader throughput.

function pw(
  arch: string,
  range: [number, number],
  sustained: number,
  boost: number,
  idle: number,
  points: [number, number][],
): PowerSpec {
  return {
    arch,
    range,
    sustained,
    boost,
    rated: sustained,
    idle,
    points: points.map(([watts, score]) => ({ watts, score })),
  };
}

// Discrete graphics only. Integrated graphics comes with the processor.
// The board block includes the memory around the chip. MXM modules are
// mounted long side along x and stand 5 mm taller for their connector.

function gpu(
  id: string,
  name: string,
  from: number,
  until: number,
  size: Size,
  power: PowerSpec,
  info: Record<string, string | number>,
): Part {
  return {
    id,
    name,
    category: "graphics",
    from,
    until,
    shape: { kind: "block", role: "gpu", size, row: 1, hot: true },
    compact: ["x", "y"],
    power,
    needs: ["dgpu"],
    info,
  };
}

export const GRAPHICS: Part[] = [
  gpu(
    "geforce-go-7400",
    "NVIDIA GeForce Go 7400",
    2006,
    2008,
    { x: 45, y: 45, z: 2 },
    pw("curie", [5, 15], 15, 15, 2, [[15, 30]]),
    { memory: "128 MB", mount: "soldered" },
  ),
  gpu(
    "radeon-x1400",
    "ATI Mobility Radeon X1400",
    2006,
    2008,
    { x: 45, y: 45, z: 2 },
    pw("r500", [5, 15], 15, 15, 2, [[15, 32]]),
    { memory: "128 MB", mount: "soldered" },
  ),
  gpu(
    "geforce-go-7600",
    "NVIDIA GeForce Go 7600",
    2006,
    2008,
    { x: 78, y: 73, z: 7 },
    pw("curie", [7, 20], 20, 20, 4, [[20, 60]]),
    { memory: "256 MB", mount: "MXM-II" },
  ),
  gpu(
    "radeon-x1600",
    "ATI Mobility Radeon X1600",
    2006,
    2008,
    { x: 78, y: 73, z: 7 },
    pw("r500", [7, 20], 20, 20, 4, [[20, 65]]),
    { memory: "256 MB", mount: "MXM-II" },
  ),
  gpu(
    "geforce-go-7900-gtx",
    "NVIDIA GeForce Go 7900 GTX",
    2006,
    2008,
    { x: 100, y: 82, z: 7 },
    pw("curie", [15, 45], 45, 45, 8, [[45, 150]]),
    { memory: "512 MB", mount: "MXM-III" },
  ),
  gpu(
    "rtx-5050-laptop",
    "NVIDIA GeForce RTX 5050 Laptop",
    2025,
    2030,
    { x: 55, y: 45, z: 2 },
    pw("blackwell", [35, 115], 100, 115, 0.3, [[100, 9500]]),
    { memory: "8 GB" },
  ),
  gpu(
    "rtx-5060-laptop",
    "NVIDIA GeForce RTX 5060 Laptop",
    2025,
    2030,
    { x: 55, y: 45, z: 2 },
    pw("blackwell", [35, 130], 115, 130, 0.3, [[115, 11000]]),
    { memory: "8 GB" },
  ),
  gpu(
    "rtx-5070-laptop",
    "NVIDIA GeForce RTX 5070 Laptop",
    2025,
    2030,
    { x: 55, y: 45, z: 2 },
    pw("blackwell", [35, 115], 100, 115, 0.3, [[100, 12000]]),
    { memory: "8 GB" },
  ),
  gpu(
    "rtx-5070ti-laptop",
    "NVIDIA GeForce RTX 5070 Ti Laptop",
    2025,
    2030,
    { x: 60, y: 55, z: 2 },
    pw("blackwell", [50, 140], 115, 140, 0.3, [[115, 15000]]),
    { memory: "12 GB" },
  ),
  gpu(
    "rtx-5080-laptop",
    "NVIDIA GeForce RTX 5080 Laptop",
    2025,
    2030,
    { x: 70, y: 65, z: 2 },
    pw("blackwell", [60, 175], 150, 175, 0.3, [[150, 19500]]),
    { memory: "16 GB" },
  ),
  gpu(
    "rtx-5090-laptop",
    "NVIDIA GeForce RTX 5090 Laptop",
    2025,
    2030,
    { x: 75, y: 70, z: 2 },
    pw("blackwell", [80, 175], 150, 175, 0.3, [[95, 17500], [150, 22000]]),
    { memory: "24 GB" },
  ),
];
