import type { Part, PowerSpec, Size } from "../types";

// Power: range, default sustained and boost limits (typical for the part's
// class of machine), rated power (sizes the power stage), idle package power.
// Scores are Cinebench R23 points (multi-core at a package power, single-core
// at full boost) and integrated graphics in Time Spy graphics points. 2006
// parts never ran R23: their figures are scaled from Cinebench R15 by about 10
// (multi) and 6 (single), and their graphics are scaled from shader throughput.

/** [min, max], sustained, boost, rated, idle, multi points, single, igpu. */
function pw(
  arch: string,
  range: [number, number],
  sustained: number,
  boost: number,
  rated: number,
  idle: number,
  points: [number, number][],
  single: number,
  igpu: [number, number],
): PowerSpec {
  return {
    arch,
    range,
    sustained,
    boost,
    rated,
    idle,
    points: points.map(([watts, score]) => ({ watts, score })),
    single,
    igpu: { watts: igpu[0], score: igpu[1] },
  };
}

// Features that benchmark and game editions check. Yonah is 32-bit only.
const YONAH = ["sse3"];
const MEROM = ["sse3", "ssse3", "x64"];
const K8 = ["sse3", "x64"];
const X86_2026 = ["sse3", "ssse3", "x64", "sse4", "avx2"];
// Snapdragon runs x86 code through emulation, AVX2 included.
const ARM_2026 = [...X86_2026, "arm64"];
const DX9 = ["dx9"];
const DX12 = ["dx9", "dx9c", "dx10", "dx11", "dx12"];
const DX12U = [...DX12, "dx12u", "rt"];

const FEATURES: Record<string, [string[], string[]]> = {
  "celeron-m-430": [YONAH, DX9],
  "core-duo-u2500": [YONAH, DX9],
  "core-duo-t2500": [YONAH, DX9],
  "core2-duo-t5500": [MEROM, DX9],
  "core2-duo-t7600": [MEROM, DX9],
  "turion64-x2-tl60": [K8, DX9],
  "core5-120u": [X86_2026, DX12],
  "snapdragon-x2e-88-100": [ARM_2026, [...DX12, "dx12u"]],
};

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
  power: PowerSpec,
  provides: string[],
  info: Record<string, string | number>,
  chipset?: Size,
): Part {
  const f = FEATURES[id] ?? [X86_2026, DX12U];
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
    power,
    features: f[0],
    igpuFeatures: f[1],
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
    pw("yonah", [10, 27], 27, 27, 27, 6, [[27, 260]], 260, [27, 8]),
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
    pw("yonah", [4, 9], 9, 9, 9, 0.8, [[9, 360]], 190, [9, 8]),
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
    pw("yonah", [10, 31], 31, 31, 31, 1, [[31, 590]], 310, [31, 8]),
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
    pw("merom", [10, 34], 34, 34, 34, 1.5, [[34, 570]], 300, [34, 8]),
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
    pw("merom", [10, 34], 34, 34, 34, 1.5, [[34, 800]], 420, [34, 8]),
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
    pw("k8", [10, 35], 35, 35, 35, 2.5, [[35, 540]], 280, [35, 7]),
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
    pw("raptor-lake-u", [8, 55], 25, 45, 15, 0.6, [[25, 8500]], 1750, [25, 1600]),
    ["platform:intel", "mem:ddr5-sodimm", "mem:lpddr5x-soldered", "dgpu"],
    { platform: "Raptor Lake-U", igpu: "Intel Graphics" },
  ),
  cpu(
    "core-ultra7-258v",
    "Intel Core Ultra 7 258V",
    2024,
    2030,
    { x: 27.5, y: 27, z: 1.5 },
    pw("lunar-lake", [8, 37], 25, 37, 17, 0.4, [[17, 8000], [30, 10300]], 1850, [30, 4000]),
    ["platform:intel", "mem:on-package", "dgpu"],
    { platform: "Lunar Lake", igpu: "Arc 140V", onPackageGb: 32 },
  ),
  cpu(
    "core-ultra-x9-388h",
    "Intel Core Ultra X9 388H",
    2026,
    2030,
    { x: 50, y: 25, z: 1.5 },
    pw("panther-lake", [15, 80], 45, 65, 25, 0.6, [[50, 19000]], 2150, [45, 6500]),
    ["platform:intel", "mem:lpddr5x-soldered", "mem:lpcamm2", "dgpu"],
    { platform: "Panther Lake", igpu: "Arc B390" },
  ),
  cpu(
    "core-ultra9-275hx",
    "Intel Core Ultra 9 275HX",
    2025,
    2030,
    { x: 37.5, y: 45, z: 2 },
    pw("arrow-lake-hx", [45, 160], 125, 160, 55, 2, [[55, 26000], [140, 36000]], 2250, [55, 1000]),
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
    pw("zen5-mobile", [15, 54], 28, 40, 28, 0.7, [[28, 10500]], 1850, [28, 2700]),
    ["platform:amd", "mem:lpddr5x-soldered", "mem:ddr5-sodimm", "dgpu"],
    { platform: "Krackan Point", igpu: "Radeon 840M" },
  ),
  cpu(
    "ryzen-ai9-hx470",
    "AMD Ryzen AI 9 HX 470",
    2026,
    2030,
    { x: 25, y: 40, z: 1.5 },
    pw("zen5-mobile", [15, 54], 45, 54, 28, 0.8, [[28, 16000], [54, 20000]], 2050, [45, 4000]),
    ["platform:amd", "mem:lpddr5x-soldered", "mem:ddr5-sodimm", "dgpu"],
    { platform: "Gorgon Point", igpu: "Radeon 890M" },
  ),
  cpu(
    "ryzen-ai-max-395",
    "AMD Ryzen AI Max+ 395",
    2025,
    2030,
    { x: 37.5, y: 52.5, z: 2 },
    pw("strix-halo", [45, 120], 80, 120, 55, 2.5, [[80, 33000]], 2000, [100, 10500]),
    ["platform:amd", "mem:lpddr5x-soldered", "mem:128gb", "dgpu"],
    { platform: "Strix Halo", igpu: "Radeon 8060S" },
  ),
  cpu(
    "ryzen9-9955hx3d",
    "AMD Ryzen 9 9955HX3D",
    2025,
    2030,
    { x: 40, y: 40, z: 2 },
    pw("fire-range", [55, 160], 125, 160, 55, 4, [[55, 28000], [140, 38000]], 2150, [55, 600]),
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
    pw("oryon", [15, 80], 45, 65, 23, 0.5, [[50, 28000]], 2300, [45, 4500]),
    ["platform:qualcomm", "mem:lpddr5x-soldered"],
    { platform: "Snapdragon X2", igpu: "Adreno X2-90" },
  ),
];
