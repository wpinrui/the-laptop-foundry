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
