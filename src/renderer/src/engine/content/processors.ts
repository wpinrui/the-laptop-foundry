import type { Part, Size } from "../types";

// Package footprint as mounted (x by y), height over the PCB. Sockets stand
// taller than BGA packages. Platforms with a separate chipset add its block
// to the board's second row. Integrated graphics belongs to the platform.

const socket2006 = 4;
const bga2006 = 2;

function cpu(
  id: string,
  name: string,
  from: number,
  until: number,
  size: Size,
  watts: number,
  provides: string[],
  info: Record<string, string | number>,
  chipset?: Size,
): Part {
  const shape: Part["shape"] = [
    { kind: "block", role: "cpu", size, row: 1, hot: true },
  ];
  if (chipset)
    shape.push({ kind: "block", role: "chipset", size: chipset, row: 2 });
  return {
    id,
    name,
    category: "processor",
    from,
    until,
    shape,
    compact: ["x"],
    watts: [watts, watts],
    provides,
    info,
  };
}

const i945: Size = { x: 70, y: 35, z: 2 };
const rs485: Size = { x: 65, y: 35, z: 2 };
const hm870: Size = { x: 25, y: 25, z: 2 };

const intel2006 = ["platform:intel", "mem:ddr2-sodimm", "dgpu"];
const amd2006 = ["platform:amd", "mem:ddr2-sodimm", "dgpu"];
const gma = { platform: "Intel 945", igpu: "GMA 950 (chipset)" };

export const PROCESSORS: Part[] = [
  cpu(
    "celeron-m-430",
    "Intel Celeron M 430",
    2006,
    2008,
    { x: 35, y: 35, z: socket2006 },
    27,
    intel2006,
    gma,
    i945,
  ),
  cpu(
    "core-duo-u2500",
    "Intel Core Duo U2500",
    2006,
    2008,
    { x: 35, y: 35, z: bga2006 },
    9,
    intel2006,
    gma,
    i945,
  ),
  cpu(
    "core-duo-t2500",
    "Intel Core Duo T2500",
    2006,
    2008,
    { x: 35, y: 35, z: socket2006 },
    31,
    intel2006,
    gma,
    i945,
  ),
  cpu(
    "core2-duo-t5500",
    "Intel Core 2 Duo T5500",
    2006,
    2008,
    { x: 35, y: 35, z: socket2006 },
    34,
    intel2006,
    gma,
    i945,
  ),
  cpu(
    "core2-duo-t7600",
    "Intel Core 2 Duo T7600",
    2006,
    2008,
    { x: 35, y: 35, z: socket2006 },
    34,
    intel2006,
    gma,
    i945,
  ),
  cpu(
    "turion64-x2-tl60",
    "AMD Turion 64 X2 TL-60",
    2006,
    2008,
    { x: 35, y: 35, z: socket2006 },
    35,
    amd2006,
    { platform: "ATI RS485", igpu: "Radeon Xpress 1150 (chipset)" },
    rs485,
  ),

  // Raptor Lake-U takes soldered LPDDR5; it is modelled with the soldered LPDDR5X row.
  cpu(
    "core5-120u",
    "Intel Core 5 120U",
    2024,
    2030,
    { x: 50, y: 25, z: 1.5 },
    15,
    ["platform:intel", "mem:ddr5-sodimm", "mem:lpddr5x-soldered", "dgpu"],
    { platform: "Raptor Lake-U", igpu: "Intel Graphics" },
  ),
  cpu(
    "core-ultra7-258v",
    "Intel Core Ultra 7 258V",
    2024,
    2030,
    { x: 27.5, y: 27, z: 1.5 },
    17,
    ["platform:intel", "mem:on-package", "dgpu"],
    { platform: "Lunar Lake", igpu: "Arc 140V", onPackageGb: 32 },
  ),
  cpu(
    "core-ultra-x9-388h",
    "Intel Core Ultra X9 388H",
    2026,
    2030,
    { x: 50, y: 25, z: 1.5 },
    25,
    ["platform:intel", "mem:lpddr5x-soldered", "mem:lpcamm2", "dgpu"],
    { platform: "Panther Lake", igpu: "Arc B390" },
  ),
  cpu(
    "core-ultra9-275hx",
    "Intel Core Ultra 9 275HX",
    2025,
    2030,
    { x: 37.5, y: 45, z: 2 },
    55,
    ["platform:intel", "mem:ddr5-sodimm", "dgpu"],
    { platform: "Arrow Lake-HX", igpu: "Intel graphics (4 Xe cores)" },
    hm870,
  ),
  cpu(
    "ryzen-ai5-340",
    "AMD Ryzen AI 5 340",
    2025,
    2030,
    { x: 25, y: 40, z: 1.5 },
    28,
    ["platform:amd", "mem:lpddr5x-soldered", "mem:ddr5-sodimm", "dgpu"],
    { platform: "Krackan Point", igpu: "Radeon 840M" },
  ),
  cpu(
    "ryzen-ai9-hx470",
    "AMD Ryzen AI 9 HX 470",
    2026,
    2030,
    { x: 25, y: 40, z: 1.5 },
    28,
    ["platform:amd", "mem:lpddr5x-soldered", "mem:ddr5-sodimm", "dgpu"],
    { platform: "Gorgon Point", igpu: "Radeon 890M" },
  ),
  cpu(
    "ryzen-ai-max-395",
    "AMD Ryzen AI Max+ 395",
    2025,
    2030,
    { x: 37.5, y: 52.5, z: 2 },
    55,
    ["platform:amd", "mem:lpddr5x-soldered", "mem:128gb", "dgpu"],
    { platform: "Strix Halo", igpu: "Radeon 8060S" },
  ),
  cpu(
    "ryzen9-9955hx3d",
    "AMD Ryzen 9 9955HX3D",
    2025,
    2030,
    { x: 40, y: 40, z: 2 },
    55,
    ["platform:amd", "mem:ddr5-sodimm", "dgpu"],
    { platform: "Fire Range", igpu: "Radeon 610M" },
  ),
  // Snapdragon provides no "dgpu": it takes no discrete graphics.
  cpu(
    "snapdragon-x2e-88-100",
    "Qualcomm Snapdragon X2 Elite X2E-88-100",
    2026,
    2030,
    { x: 36, y: 36, z: 1.5 },
    23,
    ["platform:qualcomm", "mem:lpddr5x-soldered"],
    { platform: "Snapdragon X2", igpu: "Adreno X2-90" },
  ),
];
