import type { Part } from "../../types";

// Apple silicon, M1 to M5. Rivals only: the player never gets these, so every
// part carries `rivalOnly` and the builder's lists leave them out. Memory is
// unified on the package (see "apple-unified" in memory.ts).
//
// Scores sit on the game's scales. Multi-core is native Cinebench R23 times
// the era factor the other chips of the launch year carry (1.3 in 2020, 1.2
// in 2021, 1.12 in 2022, 1.05 in 2023, 1 from 2024), single-core is native R23
// as it is. The GPU has no native Time Spy: its figure is the Time Spy
// graphics score of the discrete or integrated part it matches in games and
// cross-platform graphics tests (M1 near a GTX 1650 Max-Q, M3 Max near a
// laptop RTX 4070, M4 Max near a laptop RTX 4080).

interface AppleRow {
  id: string;
  name: string;
  launch: number;
  /** Performance and efficiency cores. */
  cores: [p: number, e: number];
  gpuCores: number;
  /** Package power: [floor, top], sustained multi-core load, rated. */
  power: [lo: number, hi: number, sustained: number, rated: number];
  /** Native R23 multi at the sustained power, single. */
  r23: [multi: number, single: number];
  /** Integrated graphics, Time Spy graphics points at the package power. */
  gpu: [watts: number, score: number];
  /** Performance core top clock, GHz; GPU clock, MHz. */
  clocks: [cpu: number, gpu: number];
  /** Default unified memory, GB. */
  memory: number;
  process: string;
  /** Hardware ray tracing (M3 on). */
  rt?: boolean;
}

const ROWS: AppleRow[] = [
  { id: "apple-m1", name: "Apple M1", launch: 2020, cores: [4, 4], gpuCores: 8, power: [4, 25, 20, 15], r23: [7700, 1500], gpu: [20, 1900], clocks: [3.2, 1278], memory: 8, process: "TSMC N5" },
  { id: "apple-m1-pro", name: "Apple M1 Pro", launch: 2021, cores: [8, 2], gpuCores: 16, power: [6, 60, 33, 30], r23: [12300, 1530], gpu: [45, 3800], clocks: [3.2, 1296], memory: 16, process: "TSMC N5" },
  { id: "apple-m1-max", name: "Apple M1 Max", launch: 2021, cores: [8, 2], gpuCores: 32, power: [8, 95, 34, 30], r23: [12400, 1530], gpu: [70, 7000], clocks: [3.2, 1296], memory: 32, process: "TSMC N5" },
  { id: "apple-m2", name: "Apple M2", launch: 2022, cores: [4, 4], gpuCores: 10, power: [4, 25, 20, 15], r23: [8700, 1590], gpu: [20, 2500], clocks: [3.49, 1398], memory: 8, process: "TSMC N5P" },
  { id: "apple-m2-pro", name: "Apple M2 Pro", launch: 2023, cores: [8, 4], gpuCores: 19, power: [6, 65, 36, 30], r23: [14500, 1640], gpu: [45, 4700], clocks: [3.5, 1398], memory: 16, process: "TSMC N5P" },
  { id: "apple-m2-max", name: "Apple M2 Max", launch: 2023, cores: [8, 4], gpuCores: 38, power: [8, 100, 37, 30], r23: [14800, 1640], gpu: [75, 8800], clocks: [3.5, 1398], memory: 32, process: "TSMC N5P" },
  { id: "apple-m3", name: "Apple M3", launch: 2023, cores: [4, 4], gpuCores: 10, power: [4, 25, 21, 15], r23: [10300, 1910], gpu: [22, 3200], clocks: [4.05, 1380], memory: 8, process: "TSMC N3B", rt: true },
  { id: "apple-m3-pro", name: "Apple M3 Pro", launch: 2023, cores: [6, 6], gpuCores: 18, power: [6, 60, 30, 30], r23: [15000, 1910], gpu: [40, 5200], clocks: [4.05, 1380], memory: 18, process: "TSMC N3B", rt: true },
  { id: "apple-m3-max", name: "Apple M3 Max", launch: 2023, cores: [12, 4], gpuCores: 40, power: [8, 110, 55, 45], r23: [24000, 1960], gpu: [80, 11000], clocks: [4.05, 1380], memory: 36, process: "TSMC N3B", rt: true },
  { id: "apple-m4", name: "Apple M4", launch: 2024, cores: [4, 6], gpuCores: 10, power: [4, 30, 24, 18], r23: [14500, 2180], gpu: [22, 3700], clocks: [4.4, 1470], memory: 16, process: "TSMC N3E", rt: true },
  { id: "apple-m4-pro", name: "Apple M4 Pro", launch: 2024, cores: [10, 4], gpuCores: 20, power: [6, 70, 45, 40], r23: [22500, 2250], gpu: [45, 6800], clocks: [4.5, 1470], memory: 24, process: "TSMC N3E", rt: true },
  { id: "apple-m4-max", name: "Apple M4 Max", launch: 2024, cores: [12, 4], gpuCores: 40, power: [8, 120, 60, 50], r23: [27000, 2250], gpu: [85, 13500], clocks: [4.5, 1470], memory: 36, process: "TSMC N3E", rt: true },
  { id: "apple-m5", name: "Apple M5", launch: 2025, cores: [4, 6], gpuCores: 10, power: [4, 30, 25, 18], r23: [17000, 2450], gpu: [24, 5000], clocks: [4.6, 1580], memory: 16, process: "TSMC N3P", rt: true },
  { id: "apple-m5-pro", name: "Apple M5 Pro", launch: 2026, cores: [10, 4], gpuCores: 20, power: [6, 75, 48, 40], r23: [26000, 2500], gpu: [48, 9000], clocks: [4.6, 1580], memory: 24, process: "TSMC N3P", rt: true },
  { id: "apple-m5-max", name: "Apple M5 Max", launch: 2026, cores: [12, 4], gpuCores: 40, power: [8, 125, 62, 50], r23: [32000, 2500], gpu: [90, 17000], clocks: [4.6, 1580], memory: 36, process: "TSMC N3P", rt: true },
];

const ERA: Record<number, number> = { 2020: 1.3, 2021: 1.2, 2022: 1.12, 2023: 1.05 };

// Rosetta 2 runs x86 code, AVX2 included from macOS 15.
const ISA = ["sse3", "ssse3", "x64", "sse4", "avx2", "arm64"];
const DX = ["dx9", "dx9c", "dx10", "dx11", "dx12"];

function part(r: AppleRow): Part {
  const [lo, hi, sustained, rated] = r.power;
  const big = r.cores[0] >= 8;
  const size = r.gpuCores >= 30 ? { x: 42, y: 36, z: 1.8 } : big ? { x: 36, y: 30, z: 1.6 } : { x: 25, y: 25, z: 1.4 };
  return {
    id: r.id,
    name: r.name,
    category: "processor",
    from: r.launch,
    until: r.launch + 3,
    rivalOnly: true,
    shape: [{ kind: "block", role: "cpu", size, row: 1, hot: true }],
    compact: ["x"],
    power: {
      arch: "apple-m",
      range: [lo, hi],
      sustained,
      boost: hi,
      rated,
      idle: big ? 0.5 : 0.3,
      points: [{ watts: sustained, score: Math.round((r.r23[0] * (ERA[r.launch] ?? 1)) / 10) * 10 }],
      single: r.r23[1],
      igpu: { watts: r.gpu[0], score: r.gpu[1] },
      clock: { single: r.clocks[0], allCore: r1(r.clocks[0] * 0.95), sustained: r1(r.clocks[0] * 0.92) },
      gpuClock: { boost: r.clocks[1] },
    },
    features: ISA,
    igpuFeatures: r.rt ? [...DX, "dx12u", "rt"] : DX,
    provides: ["platform:apple", "mem:apple-unified"],
    info: {
      platform: r.name.replace("Apple ", ""),
      igpu: `${r.gpuCores}-core GPU`,
      cores: r.cores[0] + r.cores[1],
      threads: r.cores[0] + r.cores[1],
      process: r.process,
      memory: r.memory,
    },
  };
}

function r1(v: number): number {
  return Math.round(v * 100) / 100;
}

export const APPLE_CPUS: Part[] = ROWS.map(part);
