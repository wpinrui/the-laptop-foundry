import type { BodyClass, Budget, PerfClass } from "../price";

// Types for the 0.2 market: makers, their lines, and the market score's
// headline stats. See GDD.md, Version 0.2.

/** The market score's headline stats (GDD "Market score"). */
export type HeadlineStat =
  | "app"
  | "games"
  | "battery"
  /** Weight and thickness. */
  | "portability"
  | "display"
  /** Chassis and build. */
  | "chassis"
  | "keyboard"
  | "trackpad"
  | "connectivity"
  /** Thermals and noise. */
  | "thermals"
  | "audio"
  | "price";

export const HEADLINE_STATS: HeadlineStat[] = [
  "app",
  "games",
  "battery",
  "portability",
  "display",
  "chassis",
  "keyboard",
  "trackpad",
  "connectivity",
  "thermals",
  "audio",
  "price",
];

/** A weighting over the headline stats. Every weight is 0 to 1 and they sum to 1. */
export type StatWeights = Record<HeadlineStat, number>;

/** One cell of the GDD class matrix. */
export interface ClassCell {
  budget: Budget;
  body: BodyClass;
  performance: PerfClass;
}

export type CpuVendor = "intel" | "amd" | "apple" | "qualcomm";

/** An inclusive run of calendar years. */
export type YearSpan = [from: number, until: number];

/** A typical launch price range in the year's nominal US dollars. Between waypoints it moves in a straight line. */
export interface PriceWaypoint {
  year: number;
  low: number;
  high: number;
}

/**
 * What the line builds from a year on, until the next shape takes over.
 * Everything a rival generator needs to pick the body and panel.
 */
export interface LineShape {
  from: number;
  class: ClassCell;
  /** Body ids from content/bodies.ts, most typical first. The generator keeps those available that year. */
  bodies: string[];
  /** Panel diagonal range, inches. */
  screen: [min: number, max: number];
  /** Processor makers the line bought from, most typical first. */
  cpu: CpuVendor[];
}

/** The name the line sold under from a year on, when it changed. */
export interface LineName {
  from: number;
  name: string;
}

export interface Line {
  id: string;
  maker: string;
  /** The line's name as the plan knows it. */
  name: string;
  /** Other names it sold under, by year. Absent when the name never changed. */
  names?: LineName[];
  /**
   * Calendar years a model of the line was on sale, 2006 to 2026. A year
   * without a real refresh carries the model over. Gaps are separate spans.
   */
  years: YearSpan[];
  /** First shape starts at or before the first year. Sorted by `from`. */
  shapes: LineShape[];
  price: PriceWaypoint[];
  /** What the line prioritises, over the headline stats. */
  priorities: StatWeights;
  /** From this year the line may use rivalOnly parts (Apple silicon). */
  rivalOnlyFrom?: number;
  /** Why the years or shapes are what they are, where it is a judgement call. */
  note?: string;
}

export interface Maker {
  id: string;
  name: string;
}
