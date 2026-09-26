import type { PanelOption, PanelType } from "../types";

// Every allowed combination of size, resolution and type is its own row, with
// its own brightness and colour, so no impossible panel can be specified.
// Refresh rates are the rates that row may run at. Active area comes from
// diagonal and aspect.

export const PANEL_TYPES: PanelType[] = [
  // CCFL backlight, about 5.5 mm at 12.1 inch to 6.5 mm at 17 inch, inverter in the chin.
  {
    id: "tn-matte",
    name: "TN matte",
    from: 1995,
    until: 2010,
    thickness: [5.5, 6.5],
    inverter: { x: 100, y: 10, z: 5 },
  },
  {
    id: "tn-glossy",
    name: "TN glossy",
    from: 2003,
    until: 2010,
    thickness: [5.5, 6.5],
    inverter: { x: 100, y: 10, z: 5 },
  },
  {
    id: "ips-type",
    name: "IPS-type",
    from: 2004,
    until: 2010,
    thickness: [5.5, 6.5],
    inverter: { x: 100, y: 10, z: 5 },
  },
  // LED-backlit TN: no inverter, no cover glass.
  {
    id: "tn-led",
    name: "TN",
    from: 2010,
    until: 2020,
    thickness: 3.2,
  },
  // Including cover glass.
  {
    id: "ips",
    name: "IPS",
    from: 2012,
    until: 2099,
    thickness: 3.5,
    coverGlass: true,
  },
  {
    id: "oled",
    name: "OLED",
    from: 2019,
    until: 2099,
    thickness: 2.1,
    coverGlass: true,
  },
  {
    id: "mini-led",
    name: "Mini-LED",
    from: 2021,
    until: 2099,
    thickness: 5.0,
    coverGlass: true,
  },
];

const W: [number, number] = [16, 10];
const XGA: [number, number] = [4, 3];

type Row = [
  inches: number,
  aspect: [number, number],
  res: [number, number],
  type: string,
  refresh: number[],
  nits: number,
  gamut: string,
];

function rows(from: number, until: number, list: Row[]): PanelOption[] {
  return list.map(([inches, aspect, res, type, refresh, nits, gamut]) => ({
    id: `${from}-${inches}-${res[0]}x${res[1]}-${type}`,
    name: `${inches} inch ${res[0]} by ${res[1]} ${type}`,
    from,
    until,
    inches,
    aspect,
    res,
    type,
    refresh,
    nits,
    gamut,
  }));
}

const TN = "45% sRGB";
const IPSTYPE = "60% sRGB";
const SRGB = "100% sRGB";
const P3 = "100% DCI-P3";

export const PANELS: PanelOption[] = [
  ...rows(2006, 2008, [
    [12.1, W, [1280, 800], "tn-matte", [60], 180, TN],
    [12.1, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [12.1, XGA, [1024, 768], "tn-matte", [60], 150, TN],
    [12.1, XGA, [1400, 1050], "ips-type", [60], 180, IPSTYPE],
    [13.3, W, [1280, 800], "tn-matte", [60], 170, TN],
    [13.3, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [14.1, W, [1280, 800], "tn-matte", [60], 170, TN],
    [14.1, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [14.1, W, [1440, 900], "tn-glossy", [60], 200, TN],
    [14.1, XGA, [1024, 768], "tn-matte", [60], 150, TN],
    [14.1, XGA, [1400, 1050], "tn-matte", [60], 170, TN],
    [14.1, XGA, [1400, 1050], "ips-type", [60], 180, IPSTYPE],
    [15, XGA, [1024, 768], "tn-matte", [60], 150, TN],
    [15, XGA, [1400, 1050], "tn-matte", [60], 170, TN],
    [15, XGA, [1600, 1200], "ips-type", [60], 180, IPSTYPE],
    [15.4, W, [1280, 800], "tn-matte", [60], 170, TN],
    [15.4, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [15.4, W, [1440, 900], "tn-glossy", [60], 200, TN],
    [15.4, W, [1680, 1050], "tn-matte", [60], 180, TN],
    [15.4, W, [1680, 1050], "tn-glossy", [60], 200, TN],
    [15.4, W, [1920, 1200], "tn-matte", [60], 180, TN],
    [17, W, [1440, 900], "tn-glossy", [60], 200, TN],
    [17, W, [1680, 1050], "tn-glossy", [60], 200, TN],
    [17, W, [1920, 1200], "tn-matte", [60], 180, TN],
    [17, W, [1920, 1200], "tn-glossy", [60], 200, TN],
  ]),
  ...rows(2016, 2019, [
    [12.5, [16, 9], [1366, 768], "tn-led", [60], 220, "55% sRGB"],
    [12.5, [16, 9], [1920, 1080], "ips", [60], 300, "70% sRGB"],
    [13.3, [16, 9], [1920, 1080], "ips", [60], 300, "90% sRGB"],
    [13.3, [16, 9], [3200, 1800], "ips", [60], 350, "95% sRGB"],
    [13.3, W, [2560, 1600], "ips", [60], 500, P3],
    [14, [16, 9], [1366, 768], "tn-led", [60], 220, "55% sRGB"],
    [14, [16, 9], [1920, 1080], "ips", [60], 300, "90% sRGB"],
    [14, [16, 9], [2560, 1440], "ips", [60], 300, "95% sRGB"],
    [15.6, [16, 9], [1366, 768], "tn-led", [60], 220, "55% sRGB"],
    [15.6, [16, 9], [1920, 1080], "tn-led", [60], 250, "60% sRGB"],
    [15.6, [16, 9], [1920, 1080], "ips", [60, 120], 300, "90% sRGB"],
    [15.6, [16, 9], [3840, 2160], "ips", [60], 350, SRGB],
    [15.4, W, [2880, 1800], "ips", [60], 500, P3],
    [17.3, [16, 9], [1600, 900], "tn-led", [60], 220, "55% sRGB"],
    [17.3, [16, 9], [1920, 1080], "ips", [60, 120], 300, "90% sRGB"],
    [17.3, [16, 9], [3840, 2160], "ips", [60], 350, SRGB],
  ]),
  ...rows(2026, 2030, [
    [13.3, W, [1920, 1200], "ips", [60], 400, SRGB],
    [13.3, W, [2880, 1800], "oled", [60, 120], 400, P3],
    [13.5, [3, 2], [2256, 1504], "ips", [60, 120], 400, SRGB],
    [14, W, [1920, 1200], "ips", [60], 300, SRGB],
    [14, W, [2560, 1600], "ips", [120, 165], 500, SRGB],
    [14, W, [2880, 1800], "oled", [60, 120], 400, P3],
    [15.6, [16, 9], [1920, 1080], "ips", [60, 144], 300, SRGB],
    [15.6, [16, 9], [2560, 1440], "ips", [165, 240], 350, SRGB],
    [16, W, [1920, 1200], "ips", [60, 165], 300, SRGB],
    [16, W, [2560, 1600], "ips", [165, 240], 500, SRGB],
    [16, W, [2880, 1800], "oled", [120, 240], 400, P3],
    [16, W, [3200, 2000], "mini-led", [165], 600, P3],
    [16, W, [3840, 2400], "oled", [60, 120], 400, P3],
    [18, W, [2560, 1600], "ips", [240], 500, SRGB],
    [18, W, [3840, 2400], "mini-led", [120, 240], 600, P3],
  ]),
];

/** Active area in mm, from the diagonal and aspect. */
export function activeArea(p: PanelOption): { x: number; y: number } {
  const [a, b] = p.aspect;
  const d = p.inches * 25.4;
  const h = Math.hypot(a, b);
  return { x: (d * a) / h, y: (d * b) / h };
}

export function panelThickness(t: PanelType, inches: number): number {
  if (typeof t.thickness === "number") return t.thickness;
  const [lo, hi] = t.thickness;
  const f = Math.min(1, Math.max(0, (inches - 12.1) / (17 - 12.1)));
  return lo + (hi - lo) * f;
}

// ---------------------------------------------------------------- lab figures

/** What a review lab measures on a panel at its native settings. */
export interface PanelLab {
  /** Centre brightness at maximum, cd/m2. */
  centre: number;
  /** Nine zones, row by row from the top left, cd/m2. */
  distribution: number[];
  /** Mean of the nine zones, cd/m2. */
  average: number;
  /** Dimmest zone over brightest, %. */
  uniformity: number;
  /** Centre brightness over black level; Infinity on OLED. */
  contrast: number;
  /** Black level at maximum brightness, cd/m2. 0 on OLED. */
  black: number;
  /** ColorChecker DeltaE 2000, uncalibrated. */
  deltaE: { avg: number; max: number };
  /** Gamut coverage, %. */
  coverage: { srgb: number; p3: number };
  /** Response times, ms. */
  response: { blackWhite: number; greyGrey: number };
  /** Backlight flicker: frequency in Hz and the brightness level (%) at and below which it flickers. Null when flicker-free. */
  pwm: { hz: number; below: number } | null;
  /** Local dimming zones on Mini-LED; null otherwise. */
  dimmingZones: number | null;
}

type Range = [number, number];

interface LabProfile {
  /** Null means infinite (self-emissive). */
  contrast: Range | null;
  deltaE: Range;
  /** Max DeltaE as a multiple of the average. */
  spread: Range;
  uniformity: Range;
  blackWhite: Range;
  greyGrey: Range;
  /** Chance the panel flickers, the frequency range and the level at and below which it does. */
  pwm: { chance: number; hz: Range; below: Range };
  /** Measured centre over the listed brightness. */
  centre: Range;
}

const CCFL_PWM = { chance: 0.4, hz: [2000, 25000] as Range, below: [60, 90] as Range };

// Keyed by era and panel type; each panel picks deterministically within the ranges.
const LAB: Record<string, LabProfile> = {
  // CCFL: the inverter dims at a high frequency, if at all.
  "2006:tn-matte": { contrast: [300, 450], deltaE: [8, 11], spread: [1.6, 2], uniformity: [70, 82], blackWhite: [8, 16], greyGrey: [25, 40], pwm: CCFL_PWM, centre: [0.95, 1.05] },
  "2006:tn-glossy": { contrast: [350, 500], deltaE: [9, 12], spread: [1.6, 2], uniformity: [70, 82], blackWhite: [8, 16], greyGrey: [25, 40], pwm: CCFL_PWM, centre: [0.95, 1.05] },
  "2006:ips-type": { contrast: [400, 600], deltaE: [6, 8], spread: [1.5, 1.9], uniformity: [78, 88], blackWhite: [20, 30], greyGrey: [35, 50], pwm: CCFL_PWM, centre: [0.95, 1.05] },
  // Cheap LED-backlit TN flickers at a low frequency.
  "2016:tn-led": { contrast: [300, 500], deltaE: [8, 11], spread: [1.6, 2.1], uniformity: [75, 85], blackWhite: [10, 16], greyGrey: [20, 35], pwm: { chance: 0.7, hz: [200, 250], below: [80, 99] }, centre: [0.95, 1.05] },
  "2016:ips": { contrast: [800, 1200], deltaE: [4, 6], spread: [1.8, 2.3], uniformity: [80, 88], blackWhite: [22, 32], greyGrey: [32, 45], pwm: { chance: 0.35, hz: [200, 1200], below: [20, 50] }, centre: [0.97, 1.07] },
  "2026:ips": { contrast: [1000, 1600], deltaE: [2, 3.5], spread: [1.8, 2.4], uniformity: [85, 92], blackWhite: [15, 25], greyGrey: [20, 32], pwm: { chance: 0.15, hz: [10000, 30000], below: [20, 40] }, centre: [0.98, 1.08] },
  // OLED: true black, near-instant pixels, low-frequency PWM short of full brightness.
  "2026:oled": { contrast: null, deltaE: [1.2, 2.5], spread: [1.8, 2.4], uniformity: [93, 98], blackWhite: [0.5, 1], greyGrey: [0.5, 1], pwm: { chance: 1, hz: [240, 480], below: [99, 100] }, centre: [0.97, 1.05] },
  // Mini-LED: local dimming for deep blacks, slower pixels, high-frequency PWM.
  "2026:mini-led": { contrast: [20000, 50000], deltaE: [1.5, 3], spread: [1.8, 2.3], uniformity: [90, 96], blackWhite: [8, 15], greyGrey: [10, 20], pwm: { chance: 1, hz: [5000, 15000], below: [99, 100] }, centre: [1, 1.1] },
};

function seeded(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function eraOf(year: number): number {
  return year < 2011 ? 2006 : year < 2021 ? 2016 : 2026;
}

/** Coverage from the listed gamut, e.g. "90% sRGB" or "100% DCI-P3". */
function coverageOf(gamut: string): { srgb: number; p3: number } {
  const pct = Number(/([\d.]+)%/.exec(gamut)?.[1] ?? 60);
  if (/P3/i.test(gamut)) return { srgb: 100, p3: Math.round(pct * 0.99) };
  // An sRGB-bound panel covers about 72% of its sRGB coverage in DCI-P3.
  return { srgb: pct, p3: Math.round(pct * 0.72) };
}

/** Lab figures for a panel. Deterministic per panel id. */
export function panelLab(p: PanelOption): PanelLab {
  const type = p.type;
  const era = eraOf(p.from);
  const prof = LAB[`${era}:${type}`] ?? LAB["2026:ips"];
  const rnd = seeded(`lab:${p.id}`);
  const pick = ([lo, hi]: Range) => lo + (hi - lo) * rnd();
  const coverage = coverageOf(p.gamut);
  // In 2016, full-sRGB and wider panels are the better-tuned ones of their kind.
  const wide = era === 2016 && coverage.srgb >= 95;
  const topHz = Math.max(...p.refresh);

  const centre = Math.round(p.nits * pick(prof.centre));
  const uniformity = Math.round(pick(prof.uniformity));
  // The centre is brightest; one edge or corner zone is dimmest.
  const lowZone = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(rnd() * 8)];
  const u = uniformity / 100;
  const distribution = Array.from({ length: 9 }, (_, i) => {
    if (i === 4) return centre;
    if (i === lowZone) return Math.round(centre * u);
    return Math.round(centre * (u + (1 - u) * (0.25 + 0.7 * rnd())));
  });
  const average = Math.round(distribution.reduce((s, v) => s + v, 0) / 9);

  const contrast = prof.contrast
    ? Math.round((pick(prof.contrast) * (wide ? 1.1 : 1)) / 10) * 10
    : Infinity;
  const black = prof.contrast ? r2(centre / contrast) : 0;

  const avg = r2(pick(prof.deltaE) * (wide ? 0.75 : 1));
  const deltaE = { avg, max: r2(avg * pick(prof.spread)) };

  let blackWhite = pick(prof.blackWhite);
  let greyGrey = pick(prof.greyGrey);
  if (topHz >= 120 && type !== "oled" && type !== "mini-led") {
    // Overdrive on high-refresh LCDs; Mini-LED ranges already assume it.
    const f = topHz >= 165 ? 0.3 : 0.45;
    blackWhite *= f;
    greyGrey *= f * 0.8;
  }

  const pwm =
    rnd() < prof.pwm.chance
      ? {
          hz: Math.round(pick(prof.pwm.hz) / 10) * 10,
          below: Math.round(pick(prof.pwm.below)),
        }
      : null;

  const dimmingZones =
    type === "mini-led" ? Math.round((p.inches * p.inches * 5.5) / 100) * 100 : null;

  return {
    centre,
    distribution,
    average,
    uniformity,
    contrast,
    black,
    deltaE,
    coverage,
    response: { blackWhite: r1(blackWhite), greyGrey: r1(greyGrey) },
    pwm,
    dimmingZones,
  };
}
