import type { Build } from "../types";
import type { GeneratedYear } from "./generate";

// The open company's markets (GDD, Rivals): one generated field of rival
// models per year, made the first time the year is opened in the company and
// saved with it. The renderer loads a company's saved markets here; the
// review, the price panel and the laptop's apps read them.

/** One rival model on sale in a year. The build carries its price. */
export interface Rival {
  id: string;
  maker: string;
  line: string;
  name: string;
  build: Build;
}

/** A year's market as saved with the company. */
export interface SavedMarket {
  year: number;
  seed: number;
  models: Rival[];
}

const markets = new Map<number, Rival[]>();
let owner: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version++;
  for (const l of listeners) l();
}

/** The generator's output, trimmed to what is saved. */
export function savedMarketOf(g: GeneratedYear): SavedMarket {
  return {
    year: g.year,
    seed: g.seed,
    models: g.models.map((m) => ({
      id: m.id,
      maker: m.maker,
      line: m.line,
      name: m.name,
      build: m.build,
    })),
  };
}

function isMarket(x: unknown): x is SavedMarket {
  const m = x as SavedMarket | null;
  return !!m && typeof m.year === "number" && Array.isArray(m.models);
}

/**
 * Loads a company's saved markets. Another company replaces what is loaded;
 * the same company only adds years it has saved since.
 */
export function loadMarkets(
  company: string,
  saved: Record<string, unknown> | undefined,
): void {
  let dirty = false;
  if (owner !== company) {
    owner = company;
    markets.clear();
    dirty = true;
  }
  for (const m of Object.values(saved ?? {})) {
    if (!isMarket(m) || markets.has(m.year)) continue;
    markets.set(m.year, m.models);
    dirty = true;
  }
  if (dirty) changed();
}

/** The company whose markets are loaded. */
export function marketOwner(): string | null {
  return owner;
}

export function addMarket(company: string, m: SavedMarket): void {
  if (company !== owner) return;
  markets.set(m.year, m.models);
  changed();
}

export function hasMarket(year: number): boolean {
  return markets.has(year);
}

/** The year's rivals in the open company; empty until the year is opened. */
export function rivalsFor(year: number): Rival[] {
  return markets.get(year) ?? [];
}

/** Every loaded rival, oldest year first. */
export function allRivals(): Rival[] {
  return [...markets.keys()]
    .sort((a, b) => a - b)
    .flatMap((y) => markets.get(y) ?? []);
}

export function rivalById(id: string): Rival | undefined {
  for (const list of markets.values()) {
    const r = list.find((x) => x.id === id);
    if (r) return r;
  }
  return undefined;
}

export function subscribeMarkets(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Bumps each time the loaded markets change. */
export function marketVersion(): number {
  return version;
}
