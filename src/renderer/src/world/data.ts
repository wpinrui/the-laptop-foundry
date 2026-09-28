import { useMemo } from "react";
import type { SavedModel } from "../../../preload/store";
import type { WorldLaptop, WorldMarket } from "../engine/campaign";
import { allRivals } from "../engine/market/field";
import { MAKERS } from "../engine/market/makers";
import { SEGMENTS } from "../engine/market/segments";
import type { HeadlineStat, SegmentId } from "../engine/market/types";
import { useMarkets } from "../market/markets";

// The market views' data layer: the world the selectors read, and the labels
// the views print. Components stay thin: they take these values and lay them out.

/** The loaded rivals and the player's models, refreshed as markets load. */
export function useWorldMarket(models: SavedModel[]): WorldMarket {
  const version = useMarkets();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the loaded markets change with their version
  return useMemo(() => ({ rivals: allRivals(), models }), [models, version]);
}

export const STAT_LABEL: Record<HeadlineStat, string> = {
  app: "Apps",
  games: "Games",
  battery: "Battery",
  portability: "Portability",
  display: "Display",
  chassis: "Chassis",
  keyboard: "Keyboard",
  trackpad: "Trackpad",
  connectivity: "Ports",
  thermals: "Thermals",
  audio: "Audio",
  price: "Price",
};

export function segmentName(id: SegmentId): string {
  return SEGMENTS.find((s) => s.id === id)?.shortName ?? id;
}

/** A maker's name; the player's company for null. */
export function makerName(maker: string | null, company: string): string {
  if (maker === null) return company;
  return MAKERS.find((m) => m.id === maker)?.name ?? maker;
}

/** A laptop's full name, maker first. */
export function laptopName(l: Pick<WorldLaptop, "maker" | "name">, company: string): string {
  return `${makerName(l.maker, company)} ${l.name}`.trim();
}

/** A change in share points: +1.2 pts, -0.4 pts. */
export function points(change: number | null): string {
  if (change === null) return "";
  const r = Math.round(change * 10) / 10;
  return `${r > 0 ? "+" : ""}${r.toFixed(1)} pts`;
}

/** Inches as a size label: 15.6". */
export const inchesLabel = (n: number) => (n > 0 ? `${Math.round(n * 10) / 10}"` : "");

/** A class word with a capital. */
export const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
