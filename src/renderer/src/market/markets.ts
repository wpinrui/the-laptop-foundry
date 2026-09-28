import { useEffect, useSyncExternalStore } from "react";
import type { SavedCompany } from "../../../preload/store";
import {
  addMarket,
  hasMarket,
  loadMarkets,
  marketOwner,
  marketVersion,
  type SavedMarket,
  savedMarketOf,
  subscribeMarkets,
} from "../engine/market/field";
import { generateYear, hashOf } from "../engine/market/generate";
import { withProfiles } from "../engine/market/profile";
import MarketWorker from "./market.worker?worker&inline";

// The open company's markets: loaded from the save, and generated the first
// time a year is opened, in a worker, then saved with the company.

export const FIRST_MARKET_YEAR = 2006;

/** A market year: whole, and no earlier than the first. Campaigns run on past 2026 with no last year. */
function marketYear(year: number): number {
  return Math.max(FIRST_MARKET_YEAR, Math.round(year));
}

const pending = new Map<string, Promise<void>>();
let saving: Promise<unknown> = Promise.resolve();

/** Loads the company's saved markets. Call whenever the open company changes or reloads. */
export function openMarkets(c: SavedCompany): void {
  loadMarkets(c.id, c.markets);
}

function inWorker(year: number, seed: number): Promise<SavedMarket> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new MarketWorker();
    } catch (e) {
      reject(e);
      return;
    }
    w.onmessage = (
      e: MessageEvent<{ ok: boolean; market?: SavedMarket; error?: string }>,
    ) => {
      w.terminate();
      if (e.data.ok && e.data.market) resolve(e.data.market);
      else reject(new Error(e.data.error ?? "market worker failed"));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(e);
    };
    w.postMessage({ year, seed });
  });
}

/** Seed of a company's year: the same company and year always generate the same market. */
export function seedOf(company: string, year: number): number {
  return hashOf("market", company, year);
}

/** Makes sure the open company has the year's market, generating and saving it the first time. */
export function ensureMarket(year: number): Promise<void> {
  const company = marketOwner();
  const y = marketYear(year);
  if (!company || hasMarket(y)) return Promise.resolve();
  const key = `${company}:${y}`;
  const hit = pending.get(key);
  if (hit) return hit;
  const seed = seedOf(company, y);
  const run = inWorker(y, seed)
    .catch((e) => {
      console.warn("market worker failed, generating on the main thread", e);
      return withProfiles(savedMarketOf(generateYear(y, seed)));
    })
    .then((m) => {
      addMarket(company, m);
      // One save at a time, so two years opened together never overwrite each other.
      saving = saving
        .catch(() => {})
        .then(() => window.api?.store.saveMarket(company, y, m))
        .catch((e) => console.error(`market ${y} could not be saved`, e));
    })
    .finally(() => pending.delete(key));
  pending.set(key, run);
  return run;
}

/** Re-renders when the loaded markets change. */
export function useMarkets(): number {
  return useSyncExternalStore(subscribeMarkets, marketVersion);
}

/** Opens the years' markets and reports whether they are all loaded. */
export function useMarket(...years: number[]): boolean {
  useMarkets();
  const key = years.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the years
  useEffect(() => {
    for (const y of years) void ensureMarket(y);
  }, [key]);
  return years.every((y) => hasMarket(marketYear(y)));
}
