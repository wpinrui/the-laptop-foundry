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
    features: id.startsWith("rtx")
      ? ["dx9", "dx9c", "dx10", "dx11", "dx12", "dx12u", "rt", "upscaling"]
      : from >= 2012
        ? ["dx9", "dx9c", "dx10", "dx11", "dx12"]
        : ["dx9", "dx9c"],
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
    "geforce-940mx",
    "NVIDIA GeForce 940MX",
    2016,
    2018,
    { x: 40, y: 40, z: 2 },
    pw("maxwell", [15, 25], 23, 23, 0.3, [[23, 1050]]),
    { memory: "2 GB" },
  ),
  gpu(
    "radeon-r7-m460",
    "AMD Radeon R7 M460",
    2016,
    2018,
    { x: 40, y: 40, z: 2 },
    pw("gcn", [15, 25], 25, 25, 0.5, [[25, 900]]),
    { memory: "2 GB" },
  ),
  gpu(
    "geforce-gtx-960m",
    "NVIDIA GeForce GTX 960M",
    2015,
    2017,
    { x: 55, y: 45, z: 2 },
    pw("maxwell", [40, 65], 60, 65, 0.3, [[60, 2400]]),
    { memory: "4 GB" },
  ),
  gpu(
    "geforce-gtx-970m",
    "NVIDIA GeForce GTX 970M",
    2014,
    2017,
    { x: 55, y: 45, z: 2 },
    pw("maxwell", [50, 85], 75, 85, 0.3, [[75, 3700]]),
    { memory: "6 GB" },
  ),
  gpu(
    "geforce-gtx-1060-laptop",
    "NVIDIA GeForce GTX 1060 (laptop)",
    2016,
    2019,
    { x: 55, y: 45, z: 2 },
    pw("pascal", [60, 90], 80, 90, 0.3, [[80, 3900]]),
    { memory: "6 GB" },
  ),
  gpu(
    "geforce-gtx-1070-laptop",
    "NVIDIA GeForce GTX 1070 (laptop)",
    2016,
    2019,
    { x: 60, y: 55, z: 2 },
    pw("pascal", [80, 125], 115, 125, 0.3, [[115, 5800]]),
    { memory: "8 GB" },
  ),
  gpu(
    "geforce-gtx-1080-laptop",
    "NVIDIA GeForce GTX 1080 (laptop)",
    2016,
    2019,
    { x: 70, y: 65, z: 2 },
    pw("pascal", [110, 165], 150, 165, 0.3, [[150, 7000]]),
    { memory: "8 GB" },
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
