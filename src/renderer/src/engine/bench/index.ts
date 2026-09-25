import { type Content, CONTENT } from "../content";
import type { Measurements } from "../sim";
import { singleAt } from "../sim/curves";
import type { Build, PanelOption, Part } from "../types";

// Kilnbench, the processor benchmark, and three fictional games. Every
// result comes from the simulation's sustained figures. An edition that needs
// a feature the hardware lacks refuses to run.

// ------------------------------------------------------------------ Kilnbench

export interface BenchEdition {
  year: number;
  needs: string[];
  /** Kilnbench points per internal (Cinebench R23 scale) point. */
  scale: number;
}

export const KILNBENCH: BenchEdition[] = [
  { year: 2006, needs: ["sse3"], scale: 0.1 },
  { year: 2016, needs: ["x64", "sse4"], scale: 0.4 },
  { year: 2026, needs: ["x64", "avx2"], scale: 1 / 16 },
];

export interface BenchResult {
  name: string;
  year: number;
  /** Null when the edition refuses to run. */
  single: number | null;
  multi: number | null;
}

// ------------------------------------------------------------------ games

export type Preset = "low" | "medium" | "high" | "ultra";
export const PRESETS: Preset[] = ["low", "medium", "high", "ultra"];

export interface Game {
  id: string;
  name: string;
  /** Graphics cost per megapixel-ish frame, per preset, for the 2005 edition. */
  cost: Record<Preset, number>;
  /** Frames per second one single-core point buys, 2005 edition. */
  cpu: number;
  /** Features each edition needs, keyed by the first edition year that needs them. */
  needs: [year: number, features: string[]][];
}

const DEMANDING: Record<Preset, number> = {
  low: 1.2,
  medium: 2,
  high: 2.8,
  ultra: 3.35,
};
const scaled = (f: number): Record<Preset, number> => ({
  low: DEMANDING.low * f,
  medium: DEMANDING.medium * f,
  high: DEMANDING.high * f,
  ultra: DEMANDING.ultra * f,
});

export const GAMES: Game[] = [
  {
    id: "tavern-tiles",
    name: "Tavern Tiles",
    cost: scaled(0.2),
    cpu: 0.64,
    needs: [
      [2005, ["dx9"]],
      [2017, ["dx11"]],
    ],
  },
  {
    id: "coastline-rally",
    name: "Coastline Rally",
    cost: scaled(0.6),
    cpu: 0.34,
    needs: [
      [2005, ["dx9c"]],
      [2008, ["dx10"]],
      [2014, ["dx11"]],
      [2020, ["dx12"]],
    ],
  },
  {
    id: "ashfall",
    name: "Ashfall",
    cost: DEMANDING,
    cpu: 0.214,
    needs: [
      [2005, ["dx9c"]],
      [2008, ["dx10"]],
      [2011, ["dx11"]],
      [2017, ["dx12"]],
      [2023, ["dx12u", "rt"]],
    ],
  },
];

/** Games re-release every three years from 2005. */
export function gameEdition(year: number): number {
  return 2005 + 3 * Math.max(0, Math.floor((year - 2005) / 3));
}

/** Graphics cost grows about 18 percent a year; processor demand about 5.7 percent. */
const GPU_GROWTH = 1.182;
const CPU_GROWTH = 1 / 0.946;

function resolutions(edition: number): Record<Preset, [number, number]> {
  if (edition < 2010)
    return {
      low: [800, 600],
      medium: [1024, 768],
      high: [1024, 768],
      ultra: [1280, 1024],
    };
  if (edition < 2019)
    return {
      low: [1024, 768],
      medium: [1366, 768],
      high: [1920, 1080],
      ultra: [1920, 1080],
    };
  return {
    low: [1280, 720],
    medium: [1920, 1080],
    high: [1920, 1080],
    ultra: [1920, 1080],
  };
}

export interface GameRun {
  preset: Preset;
  /** A run at the panel's own resolution. */
  native: boolean;
  res: [number, number];
  fps: number;
}

export interface GameResult {
  id: string;
  name: string;
  edition: number;
  /** Null when the edition refuses to run. */
  runs: GameRun[] | null;
}

export interface Results {
  bench: BenchResult;
  games: GameResult[];
}

// ------------------------------------------------------------------ running

function has(features: string[], needs: string[]): boolean {
  return needs.every((n) => features.includes(n));
}

function needsFor(game: Game, edition: number): string[] {
  let out: string[] = [];
  for (const [y, f] of game.needs) if (y <= edition) out = f;
  return out;
}

/**
 * Benchmark and game results for a build, with the editions of `year`
 * (the model's own year by default). Null until the cooling results exist.
 */
export function results(
  build: Build,
  m: Measurements,
  year: number = build.year,
  content: Content = CONTENT,
): Results | null {
  const c = m.cooling;
  const perf = m.performance;
  if (!c || !perf) return null;
  const part = (cat: "processor" | "graphics"): Part | undefined => {
    const id = build.parts[cat]?.[0]?.part;
    return id ? content.parts.find((p) => p.id === id) : undefined;
  };
  const cpu = part("processor");
  const gpu = part("graphics");
  const cpuFeatures = cpu?.features ?? [];
  const gpuFeatures = gpu ? (gpu.features ?? []) : (cpu?.igpuFeatures ?? []);

  let edition = KILNBENCH[0];
  for (const e of KILNBENCH) if (e.year <= year) edition = e;
  const runs = has(cpuFeatures, edition.needs);
  // Single-core holds its boost unless the sustained power is too low for one core.
  const single =
    cpu?.power ? singleAt(cpu.power, c.cpuWatts.sustained) : perf.single;
  const bench: BenchResult = {
    name: `Kilnbench ${edition.year}`,
    year: edition.year,
    single: runs ? single * edition.scale : null,
    multi: runs ? c.sustained * edition.scale : null,
  };

  const displayId = build.parts.display?.[0]?.part;
  const panel: PanelOption | undefined = content.panels.find(
    (p) => p.id === displayId,
  );
  const ed = gameEdition(year);
  const res = resolutions(ed);
  const gpuScore = c.graphics.sustained;
  const games = GAMES.map((g): GameResult => {
    const name = `${g.name} ${ed}`;
    if (!has(gpuFeatures, needsFor(g, ed)))
      return { id: g.id, name, edition: ed, runs: null };
    const gGrow = GPU_GROWTH ** (ed - 2005);
    const cpuCap = (perf.single * g.cpu) / CPU_GROWTH ** (ed - 2005);
    const fps = (preset: Preset, [w, h]: [number, number]) => {
      const mp = ((w * h) / 1e6) ** 0.9;
      const gpuFps = gpuScore / (g.cost[preset] * gGrow * mp);
      // A soft minimum of the graphics and processor limits.
      return (gpuFps ** -3 + cpuCap ** -3) ** (-1 / 3);
    };
    const list: GameRun[] = PRESETS.map((preset) => ({
      preset,
      native: false,
      res: res[preset],
      fps: fps(preset, res[preset]),
    }));
    if (panel && panel.res[0] * panel.res[1] > 1920 * 1080)
      list.push({
        preset: "ultra",
        native: true,
        res: panel.res,
        fps: fps("ultra", panel.res),
      });
    return { id: g.id, name, edition: ed, runs: list };
  });
  return { bench, games };
}
