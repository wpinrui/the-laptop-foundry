import { type Content, CONTENT } from "./content";
import { activeArea } from "./content/display";
import { eraFor } from "./content/eras";
import type { Build, PanelOption, Problem, ScreenKind, ScreenSpec } from "./types";

// The free-form screen. The player sets diagonal, ratio, resolution, refresh,
// panel type, brightness, gamut and bezel. A spec that matches a panel sold
// that year IS that panel (same id, so its lab figures stay put). Any other
// spec the year's technology allows becomes a custom panel: it takes its
// lab behaviour from the nearest real panel of its kind and costs a premium.
// Brightness and gamut default to that panel's and cost more past it. Only
// what no maker could build that year in that technology is blocked.

export const SCREEN_KINDS: ScreenKind[] = ["ips", "oled", "mini-led", "tn"];

/**
 * Years each panel technology can be had: OLED from the ThinkPad X1 Yoga and
 * Alienware 13 of 2016, Mini-LED from the MSI Creator 17 of 2020.
 */
export const KIND_YEARS: Record<ScreenKind, [number, number]> = {
  tn: [1995, 2020],
  ips: [2004, 2099],
  oled: [2016, 2099],
  "mini-led": [2020, 2099],
};

export const KIND_NAME: Record<ScreenKind, string> = {
  ips: "IPS",
  oled: "OLED",
  "mini-led": "Mini LED",
  tn: "TN",
};

/** From the 7 inch netbooks of 2007 to the 20 and 21 inch desktop replacements of 2006 and 2016. */
export const DIAG: [number, number] = [7, 21];

/** Gamut tiers a panel can be ordered at, narrowest first. */
export const GAMUTS = ["45% sRGB", "60% sRGB", "100% sRGB", "100% DCI-P3"] as const;

/**
 * What a technology could do by a year. Rows are step-wise: each row changes
 * only what it names, from its year on.
 */
interface Tech {
  year: number;
  /** Densest panel, ppi. */
  ppi?: number;
  /** Fastest refresh, Hz. */
  hz?: number;
  /** Brightest full-screen white, cd/m2. */
  nits?: number;
  /** HDR peak on a small window, cd/m2; absent means none past the full-screen white. */
  peak?: number;
  /** Widest and narrowest gamut tier, as indexes into GAMUTS. */
  gamut?: number;
  floor?: number;
}

// Laptop panels only. References: ThinkPad X60 Tablet 12.1 inch SXGA+ IPS (2006,
// 145 ppi); VAIO Z 13.1 inch 1080p TN (2010, 168 ppi); 120 Hz 3D TN (2010);
// Toughbook CF-30 (2007, 1000 nits) and CF-31 (2010, 1200 nits); HP
// DreamColor wide gamut IPS (2008); RGB LED TN (2009); Retina MacBook Pro
// (2012, 227 ppi); 13.3 inch 3200 by 1800 (2013, 276 ppi); 15.6 inch 4K
// (2014, 282 ppi); 13.3 inch 4K (2018, 331 ppi); 13.4 inch 3840 by 2400
// (2020, 338 ppi); IPS at 120 Hz (2016), 144 Hz (2018), 240 Hz (2019), 300 Hz
// (2020), 360 Hz (2021), 480 Hz (2024); Latitude 7330 Rugged (2022, 1400
// nits). OLED: X1 Yoga (2016, 14 inch 2560 by 1440), 15.6 inch 4K (2019), 90
// Hz (2021), 120 Hz (2022), XPS 13 Plus 3.5K (2022, 304 ppi), 240 Hz (2024),
// tandem OLED (2024, 500 nits, 1000 nit HDR). Mini-LED: MSI Creator 17
// (2020, 1000 nit HDR), MacBook Pro (2021, 120 Hz, 1600 nit HDR; 2024, 1000
// nits SDR), 165 Hz (2022), 240 Hz (2023).
const TECH: Record<ScreenKind, Tech[]> = {
  tn: [
    { year: 1995, ppi: 150, hz: 60, nits: 1000, gamut: 1, floor: 0 },
    { year: 2009, gamut: 2 },
    { year: 2010, ppi: 170, hz: 120 },
    { year: 2017, hz: 144 },
  ],
  ips: [
    { year: 2004, ppi: 145, hz: 60, nits: 400, gamut: 1, floor: 0 },
    { year: 2008, gamut: 3 },
    { year: 2011, ppi: 170, nits: 1000 },
    { year: 2012, ppi: 230 },
    { year: 2013, ppi: 280 },
    { year: 2014, ppi: 285 },
    { year: 2016, hz: 120 },
    { year: 2018, ppi: 335, hz: 144 },
    { year: 2019, hz: 240 },
    { year: 2020, ppi: 340, hz: 300 },
    { year: 2021, hz: 360 },
    { year: 2022, nits: 1400 },
    { year: 2024, hz: 480 },
  ],
  oled: [
    { year: 2016, ppi: 225, hz: 60, nits: 350, peak: 400, gamut: 3, floor: 3 },
    { year: 2019, ppi: 285, nits: 400, peak: 500 },
    { year: 2021, hz: 90 },
    { year: 2022, ppi: 305, hz: 120, peak: 600 },
    { year: 2024, hz: 240, nits: 500, peak: 1000 },
  ],
  "mini-led": [
    { year: 2020, ppi: 260, hz: 60, nits: 700, peak: 1000, gamut: 3, floor: 3 },
    { year: 2021, hz: 120, peak: 1600 },
    { year: 2022, hz: 165 },
    { year: 2023, hz: 240 },
    { year: 2024, nits: 1000 },
  ],
};

type TechNow = Required<Omit<Tech, "peak">> & { peak?: number };

/** A technology's limits in a year: every row up to it, the latest winning. Before its first row, its first row. */
export function techOf(kind: ScreenKind, year: number): TechNow {
  const rows = TECH[kind];
  let t = { ...rows[0] } as TechNow;
  for (const r of rows.slice(1)) if (r.year <= year) t = { ...t, ...r };
  return t;
}

/**
 * Pixels a second a laptop panel link carried, millions: 1920 by 1200 at 60 Hz
 * in 2006, 1080p at 120 Hz in 2010, the Retina panels of 2012, 4K at 60 Hz in
 * 2014, 1080p at 300 Hz in 2019, 4K at 120 Hz in 2020, 2560 by 1600 at 240 Hz
 * and 1200p at 480 Hz in 2023, 18 inch 3840 by 2400 at 240 Hz in 2025.
 */
const RATE: [year: number, mpx: number][] = [
  [2006, 140],
  [2010, 250],
  [2012, 320],
  [2014, 500],
  [2019, 650],
  [2020, 1000],
  [2023, 1200],
  [2025, 2300],
];

/** Most pixels a second any panel could run in the year, millions. */
export function maxPixelRate(year: number): number {
  let r = RATE[0][1];
  for (const [y, v] of RATE) if (y <= year) r = v;
  return r;
}

/** Pixels a second, millions. */
export function pixelRate(res: [number, number], hz: number): number {
  return (res[0] * res[1] * hz) / 1e6;
}

/** A resolved screen: the panel row the rest of the engine reads, plus what the spec added. */
export interface ResolvedPanel extends PanelOption {
  custom: boolean;
  /** Extra cost of a custom panel, nominal dollars. */
  premium: number;
  /** Cost of brightness and gamut past the panel's own, nominal dollars; negative below it. */
  upgrade: number;
  bezel: number;
  /** The refresh rate the spec runs at. */
  hz: number;
}

export function kindAvailable(kind: ScreenKind, year: number): boolean {
  const [a, b] = KIND_YEARS[kind];
  return a <= year && year <= b;
}

/** The engine's panel type (thickness, backlight, lab profile) for a kind in a year. CCFL to 2010, as the panel rows. */
export function panelTypeOf(kind: ScreenKind, year: number, surface?: "matte" | "glossy"): string {
  if (kind === "tn") return year < 2011 ? (surface === "glossy" ? "tn-glossy" : "tn-matte") : "tn-led";
  if (kind === "ips") return year < 2011 ? "ips-type" : "ips";
  return kind;
}

function kindOfType(type: string): { kind: ScreenKind; surface?: "matte" | "glossy" } {
  if (type === "tn-matte") return { kind: "tn", surface: "matte" };
  if (type === "tn-glossy") return { kind: "tn", surface: "glossy" };
  if (type === "tn-led") return { kind: "tn" };
  if (type === "ips-type" || type === "ips") return { kind: "ips" };
  return { kind: type as ScreenKind };
}

function eraYear(year: number): number {
  return year < 2011 ? 2006 : year < 2021 ? 2016 : 2026;
}

export function ppiOf(diag: number, res: [number, number]): number {
  return Math.round(Math.hypot(res[0], res[1]) / Math.max(1, diag));
}

/** Highest refresh a maker shipped in a technology by the year. */
export function maxHz(year: number, kind: ScreenKind = "ips"): number {
  return techOf(kind, year).hz;
}

/** Densest panel a technology could make in the year, ppi. */
export function maxPpi(year: number, kind: ScreenKind = "ips"): number {
  return techOf(kind, year).ppi;
}

/** Brightest full-screen white a technology could make in the year, cd/m2. */
export function maxNits(year: number, kind: ScreenKind): number {
  return techOf(kind, year).nits;
}

/** Dimmest full-screen white the builder offers, cd/m2. */
export const MIN_NITS = 150;

/** Gamut tiers a technology could be ordered at in the year. */
export function gamutsFor(year: number, kind: ScreenKind): string[] {
  const t = techOf(kind, year);
  return GAMUTS.slice(t.floor, t.gamut + 1);
}

/** Panel rows sold in the year; before any were, the latest ones sold before it. */
function yearRows(year: number, content: Content): PanelOption[] {
  const sold = content.panels.filter((p) => p.from <= year && year <= p.until);
  if (sold.length > 0) return sold;
  const past = content.panels.filter((p) => p.from <= year);
  const latest = Math.max(...past.map((p) => p.from));
  return past.filter((p) => p.from === latest);
}

/** Refresh rates the year's panels commonly ran at. */
export function commonHz(year: number, content: Content = CONTENT): number[] {
  const set = new Set<number>([60]);
  for (const p of yearRows(year, content)) for (const h of p.refresh) set.add(h);
  return [...set].sort((a, b) => a - b);
}

export const RATIOS: [number, number][] = [
  [16, 9],
  [16, 10],
  [3, 2],
  [4, 3],
];

const STANDARD: Record<string, [number, number][]> = {
  "16:9": [
    [1366, 768],
    [1600, 900],
    [1920, 1080],
    [2560, 1440],
    [3200, 1800],
    [3840, 2160],
  ],
  "16:10": [
    [1280, 800],
    [1440, 900],
    [1680, 1050],
    [1920, 1200],
    [2560, 1600],
    [2880, 1800],
    [3200, 2000],
    [3840, 2400],
  ],
  "3:2": [
    [2256, 1504],
    [2880, 1920],
    [3000, 2000],
  ],
  "4:3": [
    [1024, 768],
    [1400, 1050],
    [1600, 1200],
  ],
};

/** Standard resolutions for a ratio that the year could make at this diagonal in a technology. */
export function standardResolutions(
  ratio: [number, number],
  diag: number,
  year: number,
  kind: ScreenKind = "ips",
): [number, number][] {
  const cap = maxPpi(year, kind);
  return (STANDARD[`${ratio[0]}:${ratio[1]}`] ?? []).filter((r) => ppiOf(diag, r) <= cap);
}

/** Real panel rows of a kind, nearest the year first. */
function rowsOfKind(kind: ScreenKind, year: number, content: Content): PanelOption[] {
  return content.panels
    .filter((p) => kindOfType(p.type).kind === kind)
    .sort((a, b) => Math.abs(eraYear(a.from) - eraYear(year)) - Math.abs(eraYear(b.from) - eraYear(year)));
}

/** The real panel this spec is, when a maker sold it that year. */
export function madeRow(spec: ScreenSpec, year: number, content: Content = CONTENT): PanelOption | undefined {
  const type = panelTypeOf(spec.panel, year, spec.surface);
  return content.panels.find(
    (p) =>
      p.type === type &&
      p.from <= year &&
      year <= p.until &&
      Math.abs(p.inches - spec.diag) < 0.051 &&
      p.res[0] === spec.res[0] &&
      p.res[1] === spec.res[1] &&
      p.refresh.includes(spec.hz),
  );
}

function nearestRow(spec: ScreenSpec, year: number, content: Content): PanelOption | undefined {
  const rows = rowsOfKind(spec.panel, year, content);
  if (rows.length === 0) return undefined;
  const era = eraYear(rows[0].from);
  const same = rows.filter((p) => eraYear(p.from) === era);
  const ppi = ppiOf(spec.diag, spec.res);
  let best = same[0];
  let bestD = Infinity;
  for (const p of same) {
    const d = Math.abs(p.inches - spec.diag) + Math.abs(ppiOf(p.inches, p.res) - ppi) / 40;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Cost of a panel of this size, density, type and refresh, before any custom premium. */
export function panelBaseCost(p: PanelOption, hz: number): number {
  const a = activeArea(p);
  const rate = PANEL_RATE[p.type] ?? { dm2: 10, mp: 10 };
  const mp = (p.res[0] * p.res[1]) / 1e6;
  return ((a.x * a.y) / 1e4) * rate.dm2 + mp * rate.mp + Math.max(0, (hz - 60) / 60) * 15;
}

/** Dollars per square decimetre of panel and per megapixel, by panel type. */
const PANEL_RATE: Record<string, { dm2: number; mp: number }> = {
  "tn-matte": { dm2: 18, mp: 20 },
  "tn-glossy": { dm2: 19, mp: 20 },
  "tn-led": { dm2: 6, mp: 8 },
  "ips-type": { dm2: 30, mp: 25 },
  ips: { dm2: 7, mp: 8 },
  oled: { dm2: 16, mp: 8 },
  "mini-led": { dm2: 30, mp: 10 },
};

/**
 * Dollars per square decimetre for doubling the panel's own brightness, by
 * kind: more LEDs and drive for an LCD, larger or stacked emitters for OLED.
 * The cost grows faster than the ratio, so each extra nit costs more.
 */
const BRIGHT_RATE: Record<ScreenKind, number> = { tn: 4, ips: 4, oled: 10, "mini-led": 6 };

/** Dollars per square decimetre for each gamut tier on an LCD: nothing, better filters, wide LEDs, quantum dots or RGB LEDs. */
const GAMUT_RATE = [0, 0.5, 2, 5];

/** A gamut tier's index for a listed gamut: the widest tier it reaches. */
function tierOf(gamut: string): number {
  if (/P3/i.test(gamut)) return 3;
  const pct = Number(/([\d.]+)%/.exec(gamut)?.[1] ?? 60);
  return pct >= 100 ? 2 : pct >= 60 ? 1 : 0;
}

/** Resolve a spec for a year: the real row when it was sold, else a custom panel; then the player's brightness and gamut. */
export function resolveScreen(spec: ScreenSpec, year: number, content: Content = CONTENT): ResolvedPanel {
  const tech = techOf(spec.panel, year);
  const made = madeRow(spec, year, content);
  let panel: PanelOption;
  let premium = 0;
  if (made) panel = made;
  else {
    const type = panelTypeOf(spec.panel, year, spec.surface);
    const near = nearestRow(spec, year, content);
    const id = `custom:${spec.panel}:${spec.surface ?? ""}:${spec.diag}:${spec.res[0]}x${spec.res[1]}:${spec.hz}:${year}`;
    panel = {
      id,
      name: `${spec.diag} inch ${spec.res[0]} by ${spec.res[1]} ${type}`,
      from: year,
      until: year,
      inches: spec.diag,
      aspect: spec.ratio,
      res: spec.res,
      type,
      refresh: [spec.hz],
      // A nearer era's panel may be brighter than the year could make.
      nits: Math.min(near?.nits ?? 300, tech.nits),
      gamut: near?.gamut ?? "60% sRGB",
    };
    const base = panelBaseCost(panel, spec.hz);
    const topHz = Math.max(60, ...(near?.refresh ?? [60]));
    const nearPpi = near ? ppiOf(near.inches, near.res) : 100;
    premium = Math.round(
      40 +
        0.4 * base +
        Math.max(0, (spec.hz - topHz) / 60) * 35 +
        Math.max(0, (ppiOf(spec.diag, spec.res) - nearPpi) / 50) * 25,
    );
  }

  // The player's brightness and gamut, priced against the panel's own.
  const a = activeArea(panel);
  const dm2 = (a.x * a.y) / 1e4;
  const own = panel.nits;
  const nits = spec.nits !== undefined ? Math.round(spec.nits) : own;
  const r = nits / own;
  const bright = r >= 1 ? dm2 * BRIGHT_RATE[spec.panel] * (r ** 1.6 - 1) : dm2 * BRIGHT_RATE[spec.panel] * 0.25 * (r - 1);
  const gamut = spec.gamut ?? panel.gamut;
  const lcd = spec.panel === "tn" || spec.panel === "ips";
  const colour = lcd ? dm2 * (GAMUT_RATE[tierOf(gamut)] - GAMUT_RATE[tierOf(panel.gamut)]) : 0;
  // HDR on self-emissive and locally dimmed panels: a small window runs past the full-screen white.
  const peak = tech.peak !== undefined ? Math.round(Math.min(tech.peak, nits * (spec.panel === "oled" ? 1.5 : 2.5))) : undefined;
  return {
    ...panel,
    nits,
    gamut,
    ...(peak !== undefined && peak > nits ? { peak } : {}),
    custom: !made,
    premium,
    upgrade: Math.round(bright + colour),
    bezel: spec.bezel,
    hz: spec.hz,
  };
}

/** A sold panel as a spec. */
export function specOfPanel(p: PanelOption, refresh: number | undefined, year: number): ScreenSpec {
  const { kind, surface } = kindOfType(p.type);
  return {
    diag: p.inches,
    ratio: [p.aspect[0], p.aspect[1]],
    res: [p.res[0], p.res[1]],
    hz: refresh ?? p.refresh[0],
    panel: kind,
    ...(surface ? { surface } : {}),
    bezel: eraFor(year).bezel.side,
  };
}

/** The screen as a spec: the build's own, or one read from an older save's panel pick. */
export function screenOf(build: Build, content: Content = CONTENT): ScreenSpec | undefined {
  if (build.screen) return build.screen;
  const bp = build.parts.display?.[0];
  const p = bp && content.panels.find((x) => x.id === bp.part);
  if (!bp || !p) return undefined;
  const hz = bp.opts?.refresh !== undefined ? Number(bp.opts.refresh) : undefined;
  return specOfPanel(p, hz, build.year);
}

/** The build's resolved panel, or undefined with no screen chosen. */
export function panelOf(build: Build, content: Content = CONTENT): ResolvedPanel | undefined {
  const s = screenOf(build, content);
  return s ? resolveScreen(s, build.year, content) : undefined;
}

/** Older saves picked a panel row; they now carry the spec. */
export function migrateScreen(build: Build, content: Content = CONTENT): Build {
  if (build.screen || !build.parts.display) return build;
  const screen = screenOf(build, content);
  const parts = { ...build.parts };
  delete parts.display;
  return screen ? { ...build, parts, screen } : { ...build, parts };
}

/** What no maker could build in the year in that technology. */
export function screenProblems(spec: ScreenSpec, year: number, _content: Content = CONTENT): Problem[] {
  const out: Problem[] = [];
  if (!kindAvailable(spec.panel, year))
    out.push({ kind: "year", code: "unavailable", what: "panel", ref: spec.panel });
  const tech = techOf(spec.panel, year);
  if (spec.hz > tech.hz) out.push({ kind: "compat", code: "screen", what: "refresh" });
  if (ppiOf(spec.diag, spec.res) > tech.ppi) out.push({ kind: "compat", code: "screen", what: "density" });
  // Rounded so a panel sold at the cap is never flagged.
  if (Math.floor(pixelRate(spec.res, spec.hz)) > maxPixelRate(year))
    out.push({ kind: "compat", code: "screen", what: "bandwidth" });
  if (spec.nits !== undefined && (spec.nits > tech.nits || spec.nits < MIN_NITS))
    out.push({ kind: "compat", code: "screen", what: "brightness" });
  if (spec.gamut !== undefined && !gamutsFor(year, spec.panel).includes(spec.gamut))
    out.push({ kind: "compat", code: "screen", what: "gamut" });
  if (spec.diag < DIAG[0] || spec.diag > DIAG[1]) out.push({ kind: "compat", code: "screen", what: "size" });
  if (spec.res[0] < 640 || spec.res[1] < 400) out.push({ kind: "compat", code: "screen", what: "resolution" });
  return out;
}

/** A sensible first screen for a year: the most common 14 inch panel. */
export function defaultScreen(year: number): ScreenSpec {
  const era = eraFor(year);
  if (year < 2011) return { diag: 14.1, ratio: [16, 10], res: [1280, 800], hz: 60, panel: "tn", surface: "matte", bezel: era.bezel.side };
  if (year < 2021) return { diag: 14, ratio: [16, 9], res: [1920, 1080], hz: 60, panel: "ips", bezel: era.bezel.side };
  return { diag: 14, ratio: [16, 10], res: [1920, 1200], hz: 60, panel: "ips", bezel: era.bezel.side };
}
