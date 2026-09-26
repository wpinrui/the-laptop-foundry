import { type Content, CONTENT } from "./content";
import { activeArea } from "./content/display";
import { eraFor } from "./content/eras";
import type { Build, PanelOption, Problem, ScreenKind, ScreenSpec } from "./types";

// The free-form screen. The player sets diagonal, ratio, resolution, refresh,
// panel type and bezel. A spec that matches a panel sold that year IS that
// panel (same id, so its lab figures stay put). Any other spec the year's
// technology allows becomes a custom panel: it takes its brightness, gamut
// and lab behaviour from the nearest real panel of its kind and costs a
// premium. Only what no maker could build that year is blocked.

export const SCREEN_KINDS: ScreenKind[] = ["ips", "oled", "mini-led", "tn"];

/** Years each panel technology can be had. */
export const KIND_YEARS: Record<ScreenKind, [number, number]> = {
  tn: [1995, 2016],
  ips: [2004, 2099],
  oled: [2019, 2099],
  "mini-led": [2021, 2099],
};

export const KIND_NAME: Record<ScreenKind, string> = {
  ips: "IPS",
  oled: "OLED",
  "mini-led": "Mini LED",
  tn: "TN",
};

export const DIAG: [number, number] = [10, 18.4];

/** A resolved screen: the panel row the rest of the engine reads, plus what the spec added. */
export interface ResolvedPanel extends PanelOption {
  custom: boolean;
  /** Extra cost of a custom panel, nominal dollars. */
  premium: number;
  bezel: number;
  /** The refresh rate the spec runs at. */
  hz: number;
}

export function kindAvailable(kind: ScreenKind, year: number): boolean {
  const [a, b] = KIND_YEARS[kind];
  return a <= year && year <= b;
}

/** The engine's panel type (thickness, backlight, lab profile) for a kind in a year. */
export function panelTypeOf(kind: ScreenKind, year: number, surface?: "matte" | "glossy"): string {
  if (kind === "tn") return year < 2010 ? (surface === "glossy" ? "tn-glossy" : "tn-matte") : "tn-led";
  if (kind === "ips") return year < 2010 ? "ips-type" : "ips";
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

/** Highest refresh any maker shipped in the era. */
export function maxHz(year: number): number {
  const e = eraYear(year);
  return e === 2006 ? 60 : e === 2016 ? 120 : 240;
}

/** Densest panel the era could make: half again the densest one it sold. */
export function maxPpi(year: number, content: Content = CONTENT): number {
  const e = eraYear(year);
  const rows = content.panels.filter((p) => eraYear(p.from) === e);
  const top = Math.max(150, ...rows.map((p) => ppiOf(p.inches, p.res)));
  return Math.round(top * 1.5);
}

/** Refresh rates the era's panels commonly ran at. */
export function commonHz(year: number, content: Content = CONTENT): number[] {
  const e = eraYear(year);
  const set = new Set<number>([60]);
  for (const p of content.panels) if (eraYear(p.from) === e) for (const h of p.refresh) set.add(h);
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

/** Standard resolutions for a ratio that the year could make at this diagonal. */
export function standardResolutions(ratio: [number, number], diag: number, year: number): [number, number][] {
  const cap = maxPpi(year);
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

/** Resolve a spec for a year: the real row when it was sold, else a custom panel. */
export function resolveScreen(spec: ScreenSpec, year: number, content: Content = CONTENT): ResolvedPanel {
  const made = madeRow(spec, year, content);
  if (made) return { ...made, custom: false, premium: 0, bezel: spec.bezel, hz: spec.hz };
  const type = panelTypeOf(spec.panel, year, spec.surface);
  const near = nearestRow(spec, year, content);
  const id = `custom:${spec.panel}:${spec.surface ?? ""}:${spec.diag}:${spec.res[0]}x${spec.res[1]}:${spec.hz}:${year}`;
  const panel: PanelOption = {
    id,
    name: `${spec.diag} inch ${spec.res[0]} by ${spec.res[1]} ${type}`,
    from: year,
    until: year,
    inches: spec.diag,
    aspect: spec.ratio,
    res: spec.res,
    type,
    refresh: [spec.hz],
    nits: near?.nits ?? 300,
    gamut: near?.gamut ?? "60% sRGB",
  };
  const base = panelBaseCost(panel, spec.hz);
  const topHz = Math.max(60, ...(near?.refresh ?? [60]));
  const nearPpi = near ? ppiOf(near.inches, near.res) : 100;
  const premium = Math.round(
    40 +
      0.4 * base +
      Math.max(0, (spec.hz - topHz) / 60) * 35 +
      Math.max(0, (ppiOf(spec.diag, spec.res) - nearPpi) / 50) * 25,
  );
  return { ...panel, custom: true, premium, bezel: spec.bezel, hz: spec.hz };
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

/** What no maker could build in the year. */
export function screenProblems(spec: ScreenSpec, year: number, content: Content = CONTENT): Problem[] {
  const out: Problem[] = [];
  if (!kindAvailable(spec.panel, year))
    out.push({ kind: "year", code: "unavailable", what: "panel", ref: spec.panel });
  if (spec.hz > maxHz(year)) out.push({ kind: "compat", code: "screen", what: "refresh" });
  if (ppiOf(spec.diag, spec.res) > maxPpi(year, content)) out.push({ kind: "compat", code: "screen", what: "density" });
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
