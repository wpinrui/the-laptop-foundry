import type { Part, Size } from "../types";

// Bay drives are sized as installed: long side along x, so a 2.5 inch drive
// fits the depth of a battery row. M.2 drives are board blocks, long side
// along y. Capacities in GB.

const d25: Size = { x: 100, y: 69.85, z: 9.5 };
const d18: Size = { x: 78.5, y: 54, z: 5 };

function bay(
  id: string,
  name: string,
  from: number,
  until: number,
  size: Size,
  capacity: number[],
): Part {
  return {
    id,
    name,
    category: "storage",
    from,
    until,
    shape: { kind: "box", units: [{ role: "drive", size }] },
    options: { capacity },
    compact: [],
  };
}

function m2(
  id: string,
  name: string,
  from: number,
  until: number,
  size: Size,
  capacity: number[],
): Part {
  return {
    id,
    name,
    category: "storage",
    from,
    until,
    shape: { kind: "block", role: "m2", size, row: 2 },
    options: { capacity },
    compact: [],
  };
}

export const STORAGE: Part[] = [
  bay(
    "hdd25-5400",
    "2.5 inch HDD 9.5 mm, 5400 rpm",
    2000,
    2012,
    d25,
    [80, 60, 120, 160],
  ),
  bay(
    "hdd25-7200",
    "2.5 inch HDD 9.5 mm, 7200 rpm",
    2004,
    2012,
    d25,
    [80, 60, 100],
  ),
  bay(
    "hdd25-2016",
    "2.5 inch HDD 7 mm, 5400 rpm",
    2013,
    2020,
    { x: 100, y: 69.85, z: 7 },
    [1000, 500, 2000],
  ),
  bay("hdd18", "1.8 inch HDD 5 mm", 2003, 2010, d18, [60, 30]),
  bay("ssd18-pata", "1.8 inch PATA SSD", 2006, 2009, d18, [32]),
  bay(
    "ssd25-sata",
    "2.5 inch SATA SSD 7 mm",
    2010,
    2030,
    { x: 100, y: 69.85, z: 7 },
    [512, 1024, 256],
  ),
  m2(
    "m2-2280-sata",
    "M.2 2280 SATA",
    2014,
    2020,
    { x: 22, y: 80, z: 2.4 },
    [256, 128, 512, 1024],
  ),
  m2(
    "m2-2280-g3",
    "M.2 2280 NVMe PCIe 3.0",
    2015,
    2021,
    { x: 22, y: 80, z: 2.4 },
    [512, 256, 1024],
  ),
  m2(
    "m2-2280-g4",
    "M.2 2280 NVMe PCIe 4.0",
    2020,
    2030,
    { x: 22, y: 80, z: 2.4 },
    [1024, 512, 2048, 4096],
  ),
  m2(
    "m2-2280-g5",
    "M.2 2280 NVMe PCIe 5.0",
    2024,
    2030,
    { x: 22, y: 80, z: 3.5 },
    [2048, 1024, 4096],
  ),
  m2(
    "m2-2242-g4",
    "M.2 2242 NVMe PCIe 4.0",
    2020,
    2030,
    { x: 22, y: 42, z: 2.4 },
    [512, 1024],
  ),
  m2(
    "m2-2230-g4",
    "M.2 2230 NVMe PCIe 4.0",
    2020,
    2030,
    { x: 22, y: 30, z: 2.4 },
    [512, 256, 1024, 2048],
  ),
];

// ---------------------------------------------------------------- lab figures

/** What a review lab measures on a drive. Transfer rates in MB/s. */
export interface StorageLab {
  seqRead: number;
  seqWrite: number;
  /** 4K random, queue depth 1, one thread. */
  randRead: number;
  randWrite: number;
  /** Average access time, ms. */
  access: number;
  /** SSD writes past the cache; null on a hard drive. */
  sustainedWrite: { cacheGb: number; after: number } | null;
  /** NVMe read loop: first run and after 30 minutes of back-to-back runs. Null off NVMe. */
  readLoop: { first: number; sustained: number } | null;
}

interface DriveLab {
  /** Capacity the figures are quoted at, GB. */
  ref: number;
  seq: [read: number, write: number];
  rand: [read: number, write: number];
  access: number;
  hdd?: boolean;
  /** Write speed once the cache is full; cache size as a share of capacity. */
  cache?: [after: number, share: number];
  /** Sustained read in the loop, as a share of the first run. */
  loop?: number;
}

const DRIVE_LAB: Record<string, DriveLab> = {
  "hdd25-5400": { ref: 80, seq: [40, 38], rand: [0.4, 0.9], access: 17.5, hdd: true },
  "hdd25-7200": { ref: 100, seq: [55, 52], rand: [0.55, 1.1], access: 14.5, hdd: true },
  "hdd25-2016": { ref: 1000, seq: [110, 105], rand: [0.5, 1.2], access: 17, hdd: true },
  "hdd18": { ref: 60, seq: [25, 23], rand: [0.25, 0.5], access: 20, hdd: true },
  // Early flash: quick reads, dreadful small writes.
  "ssd18-pata": { ref: 32, seq: [52, 36], rand: [9, 0.1], access: 0.4, cache: [36, 1] },
  "ssd25-sata": { ref: 512, seq: [540, 500], rand: [38, 100], access: 0.08, cache: [440, 0.02] },
  "m2-2280-sata": { ref: 512, seq: [530, 480], rand: [33, 85], access: 0.08, cache: [420, 0.02] },
  "m2-2280-g3": { ref: 512, seq: [3200, 1700], rand: [50, 140], access: 0.05, cache: [600, 0.03], loop: 0.8 },
  "m2-2280-g4": { ref: 1024, seq: [7000, 6000], rand: [75, 200], access: 0.04, cache: [1500, 0.1], loop: 0.85 },
  "m2-2280-g5": { ref: 2048, seq: [12000, 11000], rand: [90, 250], access: 0.03, cache: [3000, 0.1], loop: 0.6 },
  // Short, DRAM-less drives run hotter and slower.
  "m2-2242-g4": { ref: 512, seq: [5000, 4000], rand: [60, 170], access: 0.05, cache: [900, 0.08], loop: 0.75 },
  "m2-2230-g4": { ref: 1024, seq: [5000, 4200], rand: [65, 180], access: 0.05, cache: [1000, 0.08], loop: 0.7 },
};

/** Lab figures for a drive at a capacity in GB; null for an unknown drive. */
export function storageLab(partId: string, capacity: number): StorageLab | null {
  const d = DRIVE_LAB[partId];
  if (!d) return null;
  const ratio = capacity > 0 ? capacity / d.ref : 1;
  // Denser platters read faster; fewer flash dies write slower.
  const readF = d.hdd ? ratio ** 0.2 : Math.min(1, ratio ** 0.15);
  const writeF = d.hdd ? ratio ** 0.2 : Math.min(1, ratio ** 0.35);
  const seqRead = Math.round(d.seq[0] * readF);
  const seqWrite = Math.round(d.seq[1] * writeF);
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    seqRead,
    seqWrite,
    randRead: r(d.rand[0] * (d.hdd ? 1 : readF)),
    randWrite: r(d.rand[1] * (d.hdd ? 1 : writeF)),
    access: d.access,
    sustainedWrite: d.cache
      ? {
          cacheGb: Math.max(1, Math.round(capacity * d.cache[1])),
          after: Math.min(seqWrite, Math.round(d.cache[0] * writeF)),
        }
      : null,
    readLoop: d.loop ? { first: seqRead, sustained: Math.round(seqRead * d.loop) } : null,
  };
}
