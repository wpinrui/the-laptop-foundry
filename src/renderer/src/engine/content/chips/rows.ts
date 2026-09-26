// Raw spec rows for processors and discrete graphics, as the makers published
// them. Everything the engine derives (scores, power curves, board blocks) is
// computed from these in cpus.ts and gpus.ts.

/** Instruction set features a processor has. */
export type Isa = "x64" | "sse3" | "ssse3" | "sse4" | "avx" | "avx2" | "avx512" | "arm64";

/** Highest DirectX level the graphics supports. */
export type Dx = "dx9" | "dx9c" | "dx10" | "dx10.1" | "dx11" | "dx12" | "dx12u";

/** Memory types a processor's controller takes. */
export type MemType =
  | "ddr2"
  | "ddr3"
  | "ddr3l"
  | "lpddr3"
  | "ddr4"
  | "lpddr4"
  | "lpddr4x"
  | "ddr5"
  | "lpddr5"
  | "lpddr5x"
  | "on-package";

export interface CpuRow {
  /** Kebab-case id, e.g. "core-i7-2630qm". */
  id: string;
  /** Full marketing name with the maker, e.g. "Intel Core i7-2630QM". */
  name: string;
  /** Generation id from GENERATIONS. */
  gen: string;
  /**
   * Segment within the generation, the maker's suffix class: "Y", "U", "P",
   * "H", "HS", "HX", "HK", "QM", "M", "LV", "ULV", "V", "N" (Atom, Celeron N,
   * Pentium N and netbook parts), "E" (AMD E and C-series), "X" (Snapdragon).
   */
  seg: string;
  /** Launch year and quarter. */
  launch: [year: number, quarter: 1 | 2 | 3 | 4];
  /** Performance, efficient and low-power efficient cores. Non-hybrid chips: [n, 0, 0]. */
  cores: [p: number, e: number, lpe: number];
  threads: number;
  /** Base clock, GHz (performance cores). Absent where the maker publishes none. */
  base?: number;
  /** Highest single-core clock, GHz. Equals base on chips without turbo. */
  boost: number;
  /** Efficient-core top clock on hybrid chips, GHz. */
  eBoost?: number;
  /** All-core turbo, GHz, only where the maker publishes it. */
  allCore?: number;
  /** TDP, processor base power or default TDP, W. */
  tdp: number;
  /** Configurable power: [cTDP down or minimum assured, maximum turbo power or cTDP up], W. */
  power?: [min: number, max: number];
  /** Last-level cache, MB. */
  cacheMb?: number;
  /** Process node as the maker names it, e.g. "65 nm", "Intel 7", "TSMC N3B". */
  process: string;
  /** Integrated graphics name, absent when the chipset carries the graphics or there is none. */
  igpu?: string;
  /** Integrated graphics clocks, MHz: [base or null, max]. */
  igpuMhz?: [base: number | null, max: number];
  /** DirectX level of the graphics the platform gives (on-die or in the chipset). */
  igpuDx: Dx;
  /** Integrated graphics in the chipset (pre-2010 platforms): its name. */
  chipsetGpu?: string;
  isa: Isa[];
  mem: MemType[];
  /** Highest memory transfer rate, MT/s. */
  memSpeed?: number;
  /** Memory on the package, GB (Lunar Lake). */
  onPackageGb?: number;
  /** Package: "Socket P", "BGA1364", "FP6" and so on. */
  pkg: string;
  /** Takes a discrete graphics part. Defaults true. */
  dgpu?: boolean;
  /** Recommended customer or 1k tray price, USD, where published. */
  price?: number;
  /** Cinebench R23 [multi, single] from reviews, when confidently known. */
  r23?: [multi: number, single: number];
}

export interface GpuRow {
  /** Kebab-case id, e.g. "geforce-gtx-660m". */
  id: string;
  /** Full marketing name with the maker, e.g. "NVIDIA GeForce GTX 660M". */
  name: string;
  /** Generation id from GENERATIONS. */
  gen: string;
  launch: [year: number, quarter: 1 | 2 | 3 | 4];
  /** Shader units: CUDA cores, stream processors, or Xe vector engines times 16. */
  shaders: number;
  /** Core clocks, MHz. Base absent where only one clock is published. */
  base?: number;
  boost: number;
  memGb: number;
  /** "GDDR3", "GDDR5", "GDDR6", "DDR2" and so on. */
  memType: string;
  busBits: number;
  /** Board power as laptops shipped it: [lowest, highest], W. */
  tgp: [min: number, max: number];
  /** "soldered", "MXM-II", "MXM-III", "MXM-HE", "MXM-A", "MXM-B". */
  mount: string;
  dx: Dx;
  /** Hardware ray tracing. */
  rt?: boolean;
  /** Maker's AI upscaling (DLSS, FSR 4 on hardware, XeSS XMX). */
  upscaling?: boolean;
  /** FP32 GFLOPS at boost. */
  gflops: number;
  /** 3DMark Time Spy graphics score, typical laptop, when confidently known. */
  timeSpy?: number;
  process: string;
}
