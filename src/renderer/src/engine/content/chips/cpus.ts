import type { Arch } from "../../sim/curves";
import type { Part, PowerSpec, Size } from "../../types";
import { AMD_2006_2016 } from "./amd-2006-2016";
import { AMD_2017_2026 } from "./amd-2017-2026";
import { GENERATIONS, offeredGenerations } from "./gens";
import { INTEL_2006_2010 } from "./intel-2006-2010";
import { INTEL_2011_2015 } from "./intel-2011-2015";
import { INTEL_2015_2020 } from "./intel-2015-2020";
import { INTEL_2021_2026 } from "./intel-2021-2026";
import { QUALCOMM } from "./qualcomm";
import type { CpuRow, Dx, MemType } from "./rows";

// Processors built from the makers' spec rows. The hand-calibrated parts in
// processors.ts are the anchors; everything here is derived the same way so
// scores line up with them across the years.
//
// Single-core: points per GHz of the core design times the top boost clock.
// Multi-core at the default sustained power: each core type's count times its
// sustained clock times its points per GHz (with a gain for two threads per
// core), then the era factor. The 2006 anchors were scaled from Cinebench R15
// by about 10, which runs 1.4 times real R23 for chips from 2011 to 2019; the
// factor carries that and fades to real R23 by 2024, where the 2026 anchors
// sit. Sustained clock: base plus a share of the way to the all-core boost,
// the share set by the class of machine the part goes in.

export const CPU_ROWS: CpuRow[] = [
  ...INTEL_2006_2010,
  ...INTEL_2011_2015,
  ...INTEL_2015_2020,
  ...INTEL_2021_2026,
  ...AMD_2006_2016,
  ...AMD_2017_2026,
  ...QUALCOMM,
];

// ------------------------------------------------------------------ core designs

interface Core {
  /** Single-core points per GHz. */
  ipc: number;
  /** Multi-core throughput per core per GHz without a second thread, as a share of ipc. */
  mt: number;
  /** Gain from a second thread per core. */
  smt: number;
  /** Codename for the platform line. */
  code: string;
  /** Efficient cores that go with it on hybrid parts. */
  e?: string;
}

const C = (ipc: number, code: string, e?: string, mt = 0.95, smt = 1.22): Core => ({ ipc, mt, smt, code, e });

const CORES: Record<string, Core> = {
  yonah: C(155, "Yonah"),
  merom: C(180, "Merom"),
  penryn: C(190, "Penryn"),
  bonnell: C(75, "Diamondville", undefined, 0.95, 1.3),
  pineview: C(75, "Pineview", undefined, 0.95, 1.3),
  saltwell: C(80, "Cedarview", undefined, 0.95, 1.3),
  nehalem: C(205, "Arrandale"),
  clarksfield: C(200, "Clarksfield"),
  sandy: C(235, "Sandy Bridge"),
  ivy: C(245, "Ivy Bridge"),
  haswell: C(265, "Haswell"),
  broadwell: C(275, "Broadwell"),
  skylake: C(295, "Skylake"),
  kaby: C(300, "Kaby Lake"),
  coffee: C(270, "Coffee Lake"),
  comet: C(250, "Comet Lake"),
  silvermont: C(120, "Bay Trail"),
  airmont: C(125, "Braswell"),
  goldmont: C(150, "Apollo Lake"),
  "goldmont-plus": C(170, "Gemini Lake"),
  tremont: C(205, "Jasper Lake"),
  gracemont: C(245, "Alder Lake-N"),
  crestmont: C(270, "Meteor Lake"),
  skymont: C(340, "Skymont"),
  darkmont: C(350, "Darkmont"),
  "sunny-cove": C(330, "Ice Lake"),
  lakefield: C(330, "Lakefield", "tremont"),
  "willow-cove": C(340, "Tiger Lake"),
  "golden-cove": C(370, "Alder Lake", "gracemont"),
  "raptor-cove": C(360, "Raptor Lake", "gracemont"),
  "redwood-cove": C(365, "Meteor Lake", "crestmont"),
  "lion-cove-lnl": C(385, "Lunar Lake", "skymont"),
  "lion-cove": C(410, "Arrow Lake", "skymont"),
  "cougar-cove": C(421, "Panther Lake", "darkmont"),
  "cougar-cove-wcl": C(421, "Wildcat Lake", "darkmont"),
  k8: C(140, "Turion 64 X2"),
  griffin: C(145, "Puma"),
  k10: C(150, "Caspian"),
  husky: C(155, "Llano"),
  bobcat: C(100, "Brazos"),
  jaguar: C(120, "Kabini"),
  "puma-plus": C(125, "Beema"),
  piledriver: C(150, "Trinity", undefined, 0.8),
  "piledriver-r": C(155, "Richland", undefined, 0.8),
  steamroller: C(160, "Kaveri", undefined, 0.8),
  excavator: C(167, "Carrizo", undefined, 0.8),
  "excavator-b": C(167, "Bristol Ridge", undefined, 0.8),
  "excavator-s": C(167, "Stoney Ridge", undefined, 0.8),
  zen: C(215, "Raven Ridge", undefined, 0.95, 1.25),
  "zen-plus": C(225, "Picasso", undefined, 0.95, 1.25),
  "zen-dali": C(215, "Dali", undefined, 0.95, 1.25),
  zen2: C(280, "Renoir"),
  "zen2-lucienne": C(280, "Lucienne"),
  "zen2-mendocino": C(280, "Mendocino"),
  zen3: C(325, "Cezanne"),
  "zen3-barcelo": C(325, "Barcelo"),
  "zen3-plus": C(330, "Rembrandt"),
  zen4: C(350, "Phoenix", "zen4c"),
  "zen4-dragon": C(360, "Dragon Range"),
  "zen4-hawk": C(350, "Hawk Point", "zen4c"),
  zen4c: C(350, "Zen 4c"),
  zen5: C(390, "Strix Point", "zen5c"),
  "zen5-krackan": C(390, "Krackan Point", "zen5c"),
  "zen5-halo": C(390, "Strix Halo"),
  "zen5-fire": C(398, "Fire Range"),
  "zen5-gorgon": C(395, "Gorgon Point", "zen5c"),
  zen5c: C(390, "Zen 5c"),
  oryon: C(420, "Snapdragon X", "oryon"),
  "oryon-2": C(489, "Snapdragon X2", "oryon-2"),
};

const has = (r: CpuRow, re: RegExp) => re.test(r.name);

/** The core design of a row, from its generation and name. */
function coreOf(r: CpuRow): string {
  const small = has(r, /Atom|Celeron N|Pentium N|Pentium Silver|Pentium J|Processor N|Core i3-N|Core 3 N|Intel N\d/);
  switch (r.gen) {
    case "intel-yonah":
      return "yonah";
    case "intel-merom":
      return "merom";
    case "intel-penryn":
      return small ? "bonnell" : "penryn";
    case "intel-core-1":
      return small ? "pineview" : r.cores[0] >= 4 ? "clarksfield" : "nehalem";
    case "intel-sandy-bridge":
      return small ? "saltwell" : "sandy";
    case "intel-ivy-bridge":
      return "ivy";
    case "intel-haswell":
      return small ? "silvermont" : "haswell";
    case "intel-broadwell":
      return small ? "airmont" : "broadwell";
    case "intel-skylake":
      return "skylake";
    case "intel-kaby-lake":
      return small ? "goldmont" : "kaby";
    case "intel-coffee-lake":
      return small ? "goldmont-plus" : "coffee";
    case "intel-core-10":
      if (small) return "goldmont-plus";
      if (has(r, /-L1\dG/)) return "lakefield";
      return has(r, /\d{4}N?G\d/) ? "sunny-cove" : "comet";
    case "intel-tiger-lake":
      return small ? "tremont" : "willow-cove";
    case "intel-alder-lake":
      return small ? "gracemont" : "golden-cove";
    case "intel-raptor-lake":
      return small || r.cores[0] === 0 ? "gracemont" : "raptor-cove";
    case "intel-core-ultra-1":
      return has(r, /Ultra/) ? "redwood-cove" : "raptor-cove";
    case "intel-arrow-lake":
      if (small) return "gracemont";
      return has(r, /Ultra/) ? "lion-cove" : "raptor-cove";
    case "intel-lunar-lake":
      return "lion-cove-lnl";
    case "intel-panther-lake":
      return has(r, /Ultra/) ? "cougar-cove" : "cougar-cove-wcl";
    case "amd-k8":
      return "k8";
    case "amd-puma":
      return "griffin";
    case "amd-tigris":
    case "amd-danube":
      return "k10";
    case "amd-2011":
      return r.seg === "E" || has(r, / [CE]-\d|E[12]-/) ? "bobcat" : "husky";
    case "amd-2012":
      return r.seg === "E" || has(r, /E[12]-\d/) ? "bobcat" : "piledriver";
    case "amd-2013":
      return r.seg === "E" || has(r, /E[12]-\d|A4-[15]\d{3}\b|A6-[15]\d{3}\b/) ? "jaguar" : "piledriver-r";
    case "amd-2014":
      return r.seg === "E" || has(r, /E[12]-6|Micro|A[468]-6\d{3}/) ? "puma-plus" : "steamroller";
    case "amd-2015":
      return r.seg === "E" || has(r, /-7\d{3}\b/) ? "puma-plus" : "excavator";
    case "amd-2016":
      return r.cores[0] <= 2 ? "excavator-s" : "excavator-b";
    case "amd-ryzen-2000":
      return "zen";
    case "amd-ryzen-3000":
      return has(r, /3020e|3050|3150|3250/) ? "zen-dali" : "zen-plus";
    case "amd-ryzen-4000":
      return "zen2";
    case "amd-ryzen-5000":
      if (has(r, /5[357]00U/)) return "zen2-lucienne";
      return has(r, /\d25U/) ? "zen3-barcelo" : "zen3";
    case "amd-ryzen-6000":
      return "zen3-plus";
    case "amd-ryzen-7000":
      if (has(r, /7\d45HX/)) return "zen4-dragon";
      if (has(r, /7\d[45]0?[UH]|7\d4[05]/)) return "zen4";
      if (has(r, /7\d35|7736/)) return "zen3-plus";
      if (has(r, /7\d30U/)) return "zen3-barcelo";
      return "zen2-mendocino";
    case "amd-ryzen-8040":
      return has(r, /\d{4}HX/) ? "zen4-dragon" : "zen4-hawk";
    case "amd-ryzen-ai-300":
      if (has(r, /Max/)) return "zen5-halo";
      if (has(r, /\d{4}HX/)) return "zen5-fire";
      if (has(r, /AI [57] 3[34]0|AI 7 350/)) return "zen5-krackan";
      return "zen5";
    case "amd-ryzen-ai-400":
      return has(r, /Max/) ? "zen5-halo" : "zen5-gorgon";
    case "qualcomm-x1":
      return "oryon";
    case "qualcomm-x2":
      return "oryon-2";
    default:
      return "skylake";
  }
}

// ------------------------------------------------------------------ classes

type Cls = "lp" | "p" | "h" | "hx";

function classOf(r: CpuRow): Cls {
  // AMD's Ryzen AI 9 HX parts are 28 to 54 W chips, not the 55 W HX class.
  if (r.seg === "HX") return r.tdp >= 50 ? "hx" : "h";
  if (r.seg === "P") return "p";
  if (["U", "Y", "N", "E", "V", "ULV", "LV"].includes(r.seg)) return "lp";
  return "h";
}

/** Share of the way from base to all-core boost a part holds at its default sustained power. */
const HOLD: Record<Cls, number> = { lp: 0.45, p: 0.55, h: 0.7, hx: 0.8 };

/** Multi-core era factor by launch year (see the header). */
function eraFactor(year: number): number {
  if (year <= 2008) return 1;
  if (year === 2009) return 1.13;
  if (year === 2010) return 1.27;
  if (year <= 2019) return 1.4;
  return [1.3, 1.2, 1.12, 1.05][year - 2020] ?? 1;
}

const vendorOf = (r: CpuRow) => (r.gen.startsWith("intel") ? "intel" : r.gen.startsWith("amd") ? "amd" : "qualcomm");

// ------------------------------------------------------------------ power

interface Power {
  range: [number, number];
  sustained: number;
  boost: number;
  rated: number;
  idle: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function powerOf(r: CpuRow, cls: Cls): Power {
  const y = r.launch[0];
  const t = r.tdp;
  const [pMin, pMax0] = r.power ?? [undefined, undefined];
  // Intel's top figure is the turbo power limit from Alder Lake on; before
  // that, and on AMD, it is the configurable TDP ceiling.
  const turboLimit = vendorOf(r) === "intel" && y >= 2022 ? pMax0 : undefined;
  const pMax = pMax0;
  const small = r.seg === "N" || r.seg === "E" || r.seg === "Y";
  let sustained = t;
  let boost = t;
  if (vendorOf(r) === "qualcomm") {
    sustained = Math.min(55, Math.max(t, 30));
    boost = Math.min(80, sustained * 1.45);
  } else if (/Ryzen AI Max/.test(r.name)) {
    sustained = 80;
    boost = pMax ?? 120;
  } else if (y >= 2020 && cls === "hx") {
    boost = turboLimit ?? Math.round(t * 2.9);
    sustained = Math.round(0.78 * boost);
  } else if (y >= 2020 && cls === "h") {
    sustained = Math.max(t, 45);
    boost = turboLimit ? Math.min(turboLimit, sustained * 1.8) : Math.max(pMax ?? 0, sustained * (vendorOf(r) === "amd" ? 1.2 : 1.6));
  } else if (y >= 2020 && small) {
    boost = turboLimit ?? Math.max(pMax ?? 0, t * 1.67);
  } else if (y >= 2020) {
    sustained = y >= 2022 ? Math.max(t, 25) : Math.max(t, 20);
    boost = turboLimit ? Math.min(turboLimit, sustained * 2) : Math.max(pMax ?? 0, sustained * (vendorOf(r) === "amd" ? 1.25 : 1.8));
  } else if (y >= 2015) {
    boost = Math.max(pMax ?? 0, r1(cls === "lp" ? t * 1.67 : t * 1.25));
  } else if (y >= 2011) {
    boost = Math.max(pMax ?? 0, r1(t * 1.25));
  }
  boost = r1(Math.max(boost, sustained));
  const lo = vendorOf(r) === "qualcomm" ? 15 : (pMin ?? (y < 2011 ? r1(t * 0.4) : r1(t * (cls === "lp" ? 0.5 : 0.78))));
  return {
    range: [Math.min(lo, sustained), Math.max(boost, pMax ?? boost)],
    sustained,
    boost,
    rated: t,
    idle: idleOf(r, cls),
  };
}

function idleOf(r: CpuRow, cls: Cls): number {
  const y = r.launch[0];
  const amd = vendorOf(r) === "amd";
  if (vendorOf(r) === "qualcomm") return 0.5;
  if (r.seg === "N" || r.seg === "Y" || r.seg === "V") return y < 2011 ? 0.5 : 0.3;
  if (y < 2009) return amd ? (cls === "lp" ? 1 : 2.5) : cls === "lp" ? 0.8 : 1.2;
  if (y < 2015) return amd ? (r.seg === "E" ? 0.8 : 1.5) : cls === "lp" ? 0.5 : cls === "h" && r.cores[0] >= 4 ? 1.5 : 1;
  if (cls === "hx") return amd ? 4 : 2;
  if (cls === "h") return amd ? 1 : y >= 2022 ? 1 : 1.5;
  return amd ? 0.7 : y >= 2022 ? 0.6 : 0.5;
}

// ------------------------------------------------------------------ scores

interface Clocks {
  base?: number;
  single: number;
  allCore: number;
  sustained: number;
}

function clocksOf(r: CpuRow, cls: Cls): Clocks {
  const turbo = r.boost > (r.base ?? r.boost) + 0.01;
  const allCore = r.allCore ?? (turbo ? r1(Math.max(r.base ?? 0, r.boost - 0.1 * Math.min(5, Math.max(0, r.cores[0] - 1)))) : r.boost);
  const base = r.base ?? r1(allCore * 0.6);
  // Fanless Y parts hold little of their turbo at 4.5 to 9 W.
  const hold = r.seg === "Y" ? 0.2 : HOLD[cls];
  const sustained = turbo ? r1(base + (allCore - base) * hold) : allCore;
  return { ...(r.base === undefined ? {} : { base: r.base }), single: r.boost, allCore, sustained };
}

function scoresOf(r: CpuRow, core: Core, clk: Clocks): { multi: number; single: number } {
  const [p, e, lp] = r.cores;
  const smt = r.threads > p + e + lp;
  const ratio = clk.sustained / clk.single;
  let raw = p * clk.sustained * core.ipc * core.mt * (smt ? core.smt : 1);
  const eCore = CORES[core.e ?? ""] ?? core;
  const eTop = r.eBoost ?? r.boost * 0.75;
  if (e > 0) raw += e * eTop * ratio * eCore.ipc * eCore.mt;
  if (lp > 0) {
    // Lunar Lake's low-power cluster runs full Skymont cores; the rest are small islands.
    const lpTop = e === 0 ? eTop : Math.min(eTop * 0.87, 3.3);
    raw += lp * lpTop * 0.9 * eCore.ipc * eCore.mt;
  }
  // Snapdragon R23 results run under x86 emulation and scatter too widely to use.
  const r23 = vendorOf(r) === "qualcomm" ? undefined : r.r23;
  const multi = (r23?.[0] ?? raw) * eraFactor(r.launch[0]);
  const single = r23?.[1] ?? core.ipc * r.boost;
  return { multi: Math.round(multi / 10) * 10, single: Math.round(single / 5) * 5 };
}

// ------------------------------------------------------------------ graphics

/** Integrated graphics in Time Spy graphics points (scaled from shader throughput before DX12). */
const IGPU: [RegExp, number][] = [
  [/GMA 950/, 8],
  [/GMA X3100/, 12],
  [/GMA 4500MHD/, 22],
  [/GMA 3150/, 6],
  [/GMA 36[05]0/, 12],
  [/Xpress 1150/, 7],
  [/X1250/, 10],
  [/HD 3200/, 18],
  [/HD 4200/, 24],
  [/HD 4250/, 26],
  [/HD Graphics 3000/, 130],
  [/HD Graphics 2000/, 70],
  [/HD Graphics 4000/, 260],
  [/HD Graphics 2500/, 150],
  [/HD Graphics 4200/, 280],
  [/HD Graphics 4400/, 380],
  [/HD Graphics 4600/, 450],
  [/HD Graphics 5000/, 450],
  [/Iris Graphics 5100/, 650],
  [/Iris Pro Graphics 5200/, 900],
  [/HD Graphics 5300/, 350],
  [/HD Graphics 5500/, 480],
  [/HD Graphics 5600/, 550],
  [/HD Graphics 6000/, 600],
  [/Iris Graphics 6100/, 750],
  [/Iris Pro Graphics 6200/, 1100],
  [/HD Graphics 500\b/, 170],
  [/HD Graphics 505/, 220],
  [/HD Graphics 510/, 350],
  [/HD Graphics 515/, 350],
  [/HD Graphics 520/, 450],
  [/HD Graphics 530/, 600],
  [/Iris Graphics 540/, 800],
  [/Iris Graphics 550/, 850],
  [/Iris Pro Graphics 580/, 1300],
  [/HD Graphics 610/, 400],
  [/HD Graphics 615/, 450],
  [/HD Graphics 620/, 550],
  [/HD Graphics 630/, 650],
  [/Iris Plus Graphics 640/, 950],
  [/Iris Plus Graphics 650/, 1000],
  [/Iris Plus Graphics 645/, 1100],
  [/Iris Plus Graphics 655/, 1150],
  [/UHD Graphics 600/, 200],
  [/UHD Graphics 605/, 260],
  [/UHD Graphics 610/, 420],
  [/UHD Graphics 61[57]/, 480],
  [/UHD Graphics 620/, 600],
  [/UHD Graphics 630/, 700],
  [/UHD Graphics G1/, 550],
  [/Iris Plus Graphics G4/, 800],
  [/Iris Plus Graphics G7/, 1200],
  [/\(16 EU\)/, 300],
  [/\(24 EU\)/, 450],
  [/\(32 EU\)/, 600],
  [/\(48 EU\)/, 850],
  [/\(64 EU\)/, 1100],
  [/\(80 EU\)/, 1500],
  [/\(96 EU\)/, 1750],
  [/Iris Xe Graphics/, 1750],
  [/140V/, 4000],
  [/130V/, 3300],
  [/140T/, 3800],
  [/130T/, 3300],
  [/B390/, 6500],
  [/B370/, 5600],
  [/Arc Graphics \(8 Xe\)/, 3400],
  [/Arc Graphics \(7 Xe\)/, 3000],
  [/HD 6250|HD 6290/, 38],
  [/HD 6310|HD 6320/, 45],
  [/HD 6380G/, 80],
  [/HD 6480G/, 90],
  [/HD 6520G/, 110],
  [/HD 6620G/, 130],
  [/HD 7290|HD 7310|HD 7340/, 50],
  [/HD 7400G|HD 7420G/, 110],
  [/HD 7500G|HD 7520G/, 150],
  [/HD 7600G|HD 7620G/, 170],
  [/HD 7640G/, 180],
  [/HD 7660G/, 210],
  [/HD 8180|HD 8210/, 70],
  [/HD 8240|HD 8250/, 85],
  [/HD 8280|HD 8330/, 110],
  [/HD 8400\b/, 120],
  [/HD 8310G|HD 8350G/, 130],
  [/HD 8410G|HD 8450G/, 150],
  [/HD 8510G|HD 8550G/, 190],
  [/HD 8610G|HD 8650G/, 230],
  [/Radeon R2\b/, 100],
  [/Radeon R3\b/, 120],
  [/Radeon R4\b/, 150],
  [/Vega 2\b/, 300],
  [/Vega 3\b/, 450],
  [/Vega 6\b/, 850],
  [/Vega 5\b/, 750],
  [/Vega 7\b/, 1150],
  [/Vega 8\b/, 1000],
  [/Vega 9\b/, 1050],
  [/Vega 10\b/, 1100],
  [/Vega 11\b/, 1200],
  [/Radeon 610M/, 600],
  [/Radeon 660M/, 1800],
  [/Radeon 680M/, 2400],
  [/Radeon 740M/, 1500],
  [/Radeon 760M/, 2300],
  [/Radeon 780M/, 2800],
  [/Radeon 820M/, 1400],
  [/Radeon 840M/, 2700],
  [/Radeon 860M/, 3300],
  [/Radeon 880M/, 3400],
  [/Radeon 890M/, 4000],
  [/8060S/, 10500],
  [/8050S/, 8800],
  [/8040S/, 6000],
  [/Adreno X1-85/, 2000],
  [/Adreno X1-45/, 1200],
  [/Adreno X2-90/, 4500],
  [/Adreno X2-85/, 3800],
  [/Adreno X2-45/, 2000],
];

/** Integrated graphics score where the name alone does not say: by generation and core count. */
function igpuScore(r: CpuRow): number {
  const name = r.igpu ?? r.chipsetGpu ?? "";
  for (const [re, v] of IGPU) if (re.test(name)) return v;
  const xe = /\((\d+) Xe\)/.exec(name);
  if (xe) {
    const n = Number(xe[1]);
    const perXe = r.gen === "intel-panther-lake" ? 620 : r.gen === "intel-arrow-lake" && r.seg === "HX" ? 250 : 460;
    return n * perXe;
  }
  // Radeon R5 to R8 names repeat across Kaveri, Carrizo and Bristol Ridge.
  const rn = /Radeon R(\d)\b/.exec(name);
  if (rn) {
    const tier = Number(rn[1]);
    const base = r.gen === "amd-2016" ? 120 : r.gen === "amd-2015" ? 110 : 90;
    return tier * base;
  }
  const bare = /^(U?HD|Intel) Graphics$/.test(name);
  if (bare) {
    const byGen: Record<string, number> = {
      "intel-core-1": 55,
      "intel-sandy-bridge": 80,
      "intel-ivy-bridge": 130,
      "intel-haswell": r.seg === "N" ? 70 : 250,
      "intel-broadwell": r.seg === "N" ? 130 : 350,
      "intel-skylake": 350,
      "intel-kaby-lake": 350,
      "intel-coffee-lake": 450,
      "intel-core-10": 600,
      "intel-tiger-lake": 850,
      "intel-alder-lake": 1000,
      "intel-raptor-lake": 1000,
      "intel-core-ultra-1": 1000,
      "intel-arrow-lake": 1000,
    };
    return byGen[r.gen] ?? 300;
  }
  return 0;
}

const DX: Record<Dx, string[]> = {
  dx9: ["dx9"],
  dx9c: ["dx9", "dx9c"],
  dx10: ["dx9", "dx9c", "dx10"],
  "dx10.1": ["dx9", "dx9c", "dx10"],
  dx11: ["dx9", "dx9c", "dx10", "dx11"],
  dx12: ["dx9", "dx9c", "dx10", "dx11", "dx12"],
  dx12u: ["dx9", "dx9c", "dx10", "dx11", "dx12", "dx12u", "rt"],
};

export const dxFeatures = (dx: Dx): string[] => DX[dx];

// ------------------------------------------------------------------ board

const MEM: Record<MemType, string[]> = {
  ddr2: ["mem:ddr2-sodimm"],
  ddr3: ["mem:ddr3-sodimm", "mem:ddr3l-sodimm"],
  ddr3l: ["mem:ddr3l-sodimm"],
  lpddr3: ["mem:lpddr3-soldered"],
  ddr4: ["mem:ddr4-sodimm"],
  lpddr4: ["mem:lpddr4x-soldered"],
  lpddr4x: ["mem:lpddr4x-soldered"],
  ddr5: ["mem:ddr5-sodimm"],
  lpddr5: ["mem:lpddr5-soldered"],
  lpddr5x: ["mem:lpddr5x-soldered", "mem:lpddr5-soldered"],
  "on-package": ["mem:on-package"],
};

function providesOf(r: CpuRow): string[] {
  const out = new Set<string>([`platform:${vendorOf(r)}`]);
  for (const m of r.mem) for (const t of MEM[m] ?? []) out.add(t);
  const max = /Ryzen AI Max/.test(r.name);
  if (r.mem.includes("lpddr5x") && r.launch[0] >= 2024 && vendorOf(r) !== "qualcomm" && !max) out.add("mem:lpcamm2");
  if (max) out.add("mem:128gb");
  // Netbook and budget N-series chips took no discrete graphics unless the row says so.
  const dgpu = r.dgpu ?? r.seg !== "N";
  if (dgpu && vendorOf(r) !== "qualcomm") out.add("dgpu");
  return [...out];
}

function packageOf(r: CpuRow, cls: Cls): Size {
  const pkg = r.pkg;
  const y = r.launch[0];
  if (/Socket|PGA|^S1|^FS1|^AM/.test(pkg)) return { x: 35, y: 35, z: 4 };
  if (/^FT1/.test(pkg)) return { x: 19, y: 19, z: 1.5 };
  if (/^FT3/.test(pkg)) return { x: 24.5, y: 24.5, z: 1.5 };
  if (/^FP[234]/.test(pkg)) return { x: 35, y: 35, z: 1.5 };
  if (/^FP11/.test(pkg)) return { x: 37.5, y: 52.5, z: 2 };
  if (/^FL1/.test(pkg)) return { x: 40, y: 40, z: 2 };
  if (/^FP\d/.test(pkg)) return { x: 25, y: 35, z: 1.5 };
  if (/^ASB/.test(pkg)) return { x: 27, y: 27, z: 1.5 };
  if (vendorOf(r) === "qualcomm") return { x: 36, y: 36, z: 1.5 };
  if (r.gen === "intel-lunar-lake") return { x: 27.5, y: 27, z: 1.5 };
  if (r.seg === "N") return y < 2011 ? { x: 22, y: 22, z: 1.5 } : { x: 25, y: 27, z: 1.2 };
  if (y < 2011) return { x: 35, y: 35, z: 2 };
  if (cls === "hx") return { x: 37.5, y: 45, z: 2 };
  if (r.seg === "Y") return y < 2020 ? { x: 20, y: 16.5, z: 1.2 } : { x: 26.5, y: 18.5, z: 1.2 };
  if (y < 2015) return cls === "lp" ? { x: 40, y: 24, z: 1.3 } : { x: 37.5, y: 32, z: 1.5 };
  if (y < 2020) return cls === "lp" ? { x: 42, y: 24, z: 1.3 } : { x: 42, y: 28, z: 1.5 };
  return { x: 50, y: 25, z: 1.5 };
}

/** The separate chipset block, where the platform had one. */
function chipsetOf(r: CpuRow, cls: Cls): Size | undefined {
  const y = r.launch[0];
  const onDie = /Atom|Celeron N|Pentium N|Pentium Silver|Processor N|Core i3-N|Core 3 N/.test(r.name) && y >= 2013;
  if (onDie) return undefined;
  if (vendorOf(r) === "intel") {
    if (y < 2010 && r.gen !== "intel-core-1") return /Atom/.test(r.name) ? { x: 40, y: 25, z: 2 } : { x: 70, y: 35, z: 2 };
    if (y < 2011 && /Atom/.test(r.name)) return { x: 20, y: 20, z: 2 };
    if (/Atom/.test(r.name)) return { x: 20, y: 20, z: 2 };
    if (y < 2013) return { x: 25, y: 25, z: 2 };
    if (y < 2015) return cls === "lp" && r.gen !== "intel-ivy-bridge" ? undefined : { x: 25, y: 25, z: 2 };
    if (cls === "hx") return { x: 25, y: 25, z: 2 };
    if (cls === "h" && y < 2022 && r.gen !== "intel-tiger-lake") return { x: 23, y: 22, z: 2 };
    if (r.gen === "intel-tiger-lake" && cls === "h" && r.tdp >= 45) return { x: 23, y: 22, z: 2 };
    return undefined;
  }
  if (vendorOf(r) === "amd") {
    if (y < 2011) return { x: 65, y: 35, z: 2 };
    if (["amd-2011", "amd-2012"].includes(r.gen)) return { x: 25, y: 25, z: 2 };
    if (r.gen === "amd-2013" && !/E[12]-|A[46]-5[0-2]\d\d\b|A[46]-1\d\d\d/.test(r.name)) return { x: 25, y: 25, z: 2 };
    if (r.gen === "amd-2014" && cls !== "lp" && !/E[12]-6|Micro|A[468]-6\d{3}/.test(r.name)) return { x: 25, y: 25, z: 2 };
  }
  return undefined;
}

// ------------------------------------------------------------------ availability

/** The last year a generation is among its maker's two newest, capped at 2030. */
function lastOffered(gen: string): number {
  const g = GENERATIONS.find((x) => x.id === gen);
  if (!g) return 2030;
  let last = g.launch;
  for (let y = g.launch; y <= 2030; y++) if (offeredGenerations(g.vendor, y).some((x) => x.id === gen)) last = y;
  return last;
}

// ------------------------------------------------------------------ build

export interface ChipDerived {
  part: Part;
  price: number | undefined;
}

function platformOf(r: CpuRow, core: Core, cls: Cls): string {
  const y = r.launch[0];
  if (y < 2010 && r.chipsetGpu) {
    const chip: Record<string, string> = {
      "GMA 950": /Atom/.test(r.name) ? "Intel 945GSE" : "Intel 945",
      "GMA X3100": "Intel GM965",
      "GMA 4500MHD": "Intel GM45",
      "Radeon Xpress 1150": "ATI RS485",
      "Radeon X1250": "AMD RS690",
      "Radeon HD 3200": "AMD RS780",
      "Radeon HD 4200": "AMD RS880",
      "Radeon HD 4250": "AMD RS880",
    };
    return chip[r.chipsetGpu] ?? core.code;
  }
  if (vendorOf(r) !== "intel" || y < 2013) return core.code;
  const suffix = cls === "hx" ? "-HX" : cls === "h" ? "-H" : r.seg === "Y" ? "-Y" : r.seg === "N" || r.seg === "V" ? "" : cls === "p" ? "-P" : "-U";
  if (/Bay Trail|Braswell|Apollo|Gemini|Jasper|Alder Lake-N|Lunar|Lakefield/.test(core.code)) return core.code;
  return `${core.code}${suffix}`;
}

export function derive(r: CpuRow): ChipDerived {
  const core = CORES[coreOf(r)];
  const cls = classOf(r);
  const pw = powerOf(r, cls);
  const clk = clocksOf(r, cls);
  const { multi, single } = scoresOf(r, core, clk);
  const igpu = igpuScore(r);
  const archKey = `${coreOf(r)}-${cls}`;
  const power: PowerSpec = {
    arch: archKey,
    range: pw.range,
    sustained: pw.sustained,
    boost: pw.boost,
    rated: pw.rated,
    idle: pw.idle,
    points: [{ watts: pw.sustained, score: multi }],
    single,
    igpu: { watts: pw.sustained, score: igpu },
    clock: clk,
    ...(r.igpuMhz ? { gpuClock: r.igpuMhz[0] === null ? { boost: r.igpuMhz[1] } : { base: r.igpuMhz[0], boost: r.igpuMhz[1] } } : {}),
  };
  const shape: Part["shape"] = [{ kind: "block", role: "cpu", size: packageOf(r, cls), row: 1, hot: true }];
  const chipset = chipsetOf(r, cls);
  if (chipset) shape.push({ kind: "block", role: "chipset", size: chipset, row: 2 });
  const isa = r.isa.includes("arm64") ? ["sse3", "ssse3", "x64", "sse4", "avx2", "arm64"] : r.isa.filter((f) => f !== "avx" && f !== "avx512");
  const info: Record<string, string | number> = {
    platform: platformOf(r, core, cls),
    igpu: r.igpu ?? (r.chipsetGpu ? `${r.chipsetGpu} (chipset)` : "None"),
    cores: r.cores[0] + r.cores[1] + r.cores[2],
    threads: r.threads,
    process: r.process,
  };
  if (r.onPackageGb) info.onPackageGb = r.onPackageGb;
  return {
    part: {
      id: r.id,
      name: r.name,
      category: "processor",
      from: r.launch[0],
      until: Math.max(r.launch[0] + 1, lastOffered(r.gen)),
      shape,
      compact: ["x"],
      power,
      features: isa,
      igpuFeatures: DX[r.igpuDx],
      provides: providesOf(r),
      info,
      gen: r.gen,
    },
    price: r.price,
  };
}

// ------------------------------------------------------------------ curves

/** Power curve per core design and class of machine. */
function archFor(core: string, cls: Cls, turbo: boolean, amd: boolean): Arch {
  const tj = amd ? 95 : 100;
  const boostSeconds = !turbo ? 0 : amd ? 60 : cls === "hx" ? 56 : 28;
  if (!turbo) return { k: 0.42, singleShare: 0.6, rDie: cls === "lp" ? 1.2 : 0.85, tj, boostSeconds, igpuK: 0 };
  switch (cls) {
    case "hx":
      return { k: 0.35, singleShare: 0.6, rDie: 0.28, tj: amd ? 95 : 100, boostSeconds, igpuK: 0.3 };
    case "h":
      return { k: 0.4, singleShare: 0.5, rDie: 0.6, tj, boostSeconds, igpuK: 0.4 };
    case "p":
      return { k: 0.42, singleShare: 0.9, rDie: 1.0, tj, boostSeconds, igpuK: 0.5 };
    default:
      return { k: 0.45, singleShare: core.startsWith("zen") ? 0.8 : 1.2, rDie: 1.4, tj, boostSeconds, igpuK: 0.5 };
  }
}

const DERIVED = CPU_ROWS.map((r) => ({ row: r, ...derive(r) }));

export const CPU_PARTS: Part[] = DERIVED.map((d) => d.part);

export const CPU_PRICES: Record<string, number> = Object.fromEntries(
  DERIVED.filter((d) => d.price !== undefined).map((d) => [d.part.id, d.price as number]),
);

export const CPU_ARCHS: Record<string, Arch> = Object.fromEntries(
  DERIVED.map((d) => {
    const cls = classOf(d.row);
    const turbo = d.row.boost > (d.row.base ?? d.row.boost) + 0.01 || d.row.launch[0] >= 2011;
    return [d.part.power?.arch ?? "", archFor(coreOf(d.row), cls, turbo, vendorOf(d.row) === "amd")];
  }),
);

/** Chips with no published price: the going rate for their performance in their launch year. */
export function estimatedPrice(part: Part): number {
  const year = part.from;
  const priced = CPU_PARTS.filter((p) => CPU_PRICES[p.id] !== undefined && Math.abs(p.from - year) <= 1);
  const perf = (p: Part) => (p.power?.points[0]?.score ?? 1) + 2 * (p.power?.single ?? 0);
  const me = perf(part);
  if (priced.length === 0) return 150;
  // Nearest priced chips by performance, their price scaled to ours.
  const near = priced
    .map((p) => ({ p, d: Math.abs(Math.log(perf(p) / me)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const est = near.reduce((s, { p }) => s + CPU_PRICES[p.id] * Math.min(1.5, Math.max(0.6, me / perf(p))), 0) / near.length;
  // AMD and Qualcomm sold for less than Intel's list at the same performance.
  const discount = part.provides?.includes("platform:intel") ? 1 : 0.8;
  return Math.round(est * discount);
}
