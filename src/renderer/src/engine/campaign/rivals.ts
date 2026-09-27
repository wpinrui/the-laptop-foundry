import type { Rival } from "../market/field";
import { hashOf } from "../market/generate";
import { LINES, onSale, shapeFor } from "../market/makers";
import { BUSINESS_LINES, LAST_MODEL_QUARTERS, LAUNCH_OVERRIDES, LAUNCH_WINDOWS, SELL_THROUGH_QUARTERS } from "./constants";
import type { Quarter, QuarterOfYear, QuarterStep } from "./index";

// Rival timing (GDD, Version 0.2, "Rival timing"): each line launches its
// yearly model in a quarter, fixed per company, line and year. A model is on
// sale from its launch until its successor launches, plus a short sell
// through. Rivals never run out of stock.

/** Quarters counted from year 0, so two quarters subtract. */
export function quarterIndex(q: Quarter): number {
  return q.year * 4 + (q.quarter - 1);
}

/** The quarters a line may launch in. */
export function launchWindow(lineId: string, year: number): readonly number[] {
  const own = LAUNCH_OVERRIDES[lineId];
  if (own) return own;
  if (BUSINESS_LINES.includes(lineId)) return LAUNCH_WINDOWS.business;
  const line = LINES.find((l) => l.id === lineId);
  if (line && shapeFor(line, year).class.performance === "gaming") return LAUNCH_WINDOWS.gaming;
  return LAUNCH_WINDOWS.consumer;
}

/** The quarter a line's model of the year launches in, the same every time for a company. */
export function launchQuarter(company: string, lineId: string, year: number): QuarterOfYear {
  const w = launchWindow(lineId, year);
  return w[hashOf("launch", company, lineId, year) % w.length] as QuarterOfYear;
}

/**
 * The first and last quarter the rival is on sale, as quarter indices. A
 * model whose predecessor's year is not among `known` stands in for it from
 * Q1, so a campaign's first year opens with a full shelf.
 */
export function saleWindow(company: string, r: Rival, known: Set<number>): [from: number, until: number] {
  const year = r.build.year;
  const line = LINES.find((l) => l.id === r.line);
  const launch = quarterIndex({ year, quarter: launchQuarter(company, r.line, year) });
  const hadPredecessor = !!line && onSale(line, year - 1) && known.has(year - 1);
  const from = hadPredecessor ? launch : quarterIndex({ year, quarter: 1 });
  if (line && onSale(line, year + 1)) {
    const next = quarterIndex({ year: year + 1, quarter: launchQuarter(company, r.line, year + 1) });
    return [from, next + SELL_THROUGH_QUARTERS - 1];
  }
  return [from, launch + LAST_MODEL_QUARTERS - 1];
}

/** The rivals on sale in the quarter, from the markets passed in: the year's and the year before's. */
export function rivalsOnSale(company: string, rivals: Rival[], now: Quarter): Rival[] {
  const known = new Set(rivals.map((r) => r.build.year));
  const at = quarterIndex(now);
  return rivals.filter((r) => {
    const [from, until] = saleWindow(company, r, known);
    return at >= from && at <= until;
  });
}

/** Rival lines that launch this quarter bring out their model for the year; every rival on sale is noted. */
export const launchRivals: QuarterStep = (state, ctx) => ({
  ...state,
  onSale: rivalsOnSale(ctx.company ?? "", ctx.rivals ?? [], state.now).map((r) => r.id),
});
