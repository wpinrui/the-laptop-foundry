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

// ---------------------------------------------------------------- segments

export type SegmentId =
  | "corporate"
  | "businessProfessional"
  | "student"
  | "creativeProfessional"
  | "gamer"
  | "techEnthusiast"
  | "generalConsumer"
  | "budgetBuyer"
  | "developer"
  | "educationK12"
  | "videoEditor"
  | "threeDArtist"
  | "musicProducer"
  | "esportsPro"
  | "streamer"
  | "digitalNomad"
  | "fieldWorker"
  | "writer"
  | "dayTrader"
  | "desktopReplacement";

/** Laptop Tycoon's stats, kept verbatim so the remap can be revisited. */
export interface TycoonStatWeights {
  performance: number;
  gamingPerformance: number;
  batteryLife: number;
  display: number;
  connectivity: number;
  speakers: number;
  webcam: number;
  design: number;
  buildQuality: number;
  keyboard: number;
  trackpad: number;
  weight: number;
  thinness: number;
  thermals: number;
}

/** Full marks inside [min, max] inches; each inch outside costs `penaltyPerInch` of the fit, floored. */
export interface ScreenPreference {
  min: number;
  max: number;
  penaltyPerInch: number;
}

export interface Segment {
  id: SegmentId;
  name: string;
  shortName: string;
  tier: "generalist" | "niche";
  description: string;
  /** Tycoon's weights as they are: the stats plus its price weight sum to 1. */
  tycoon: { stats: TycoonStatWeights; price: number };
  /** The same weights remapped onto the headline stats. Sum to 1. */
  weights: StatWeights;
  /** How open the segment is to a new brand's marketing, 0 to 1. */
  permeability: number;
  screen: ScreenPreference;
  /** Highest price the segment pays, in year-2000 dollars. See priceCeiling. */
  priceCeiling: number;
  /** Buyers in 2000, before growth. See population. */
  population: number;
  /** Years between purchases. */
  replacementYears: number;
  /** Share of the year's buyers in each quarter. Sums to 1. */
  seasonal: [q1: number, q2: number, q3: number, q4: number];
  /** How fast a laptop goes stale for the segment. 1 is the baseline. */
  freshnessDecay: number;
}

/** Population multipliers against the 2000 pool. */
export interface GrowthAnchor {
  year: number;
  multipliers: Record<SegmentId, number>;
}

/** Two segments that talk to each other, and how strongly (0 to 1). Symmetric. */
export type Adjacency = [a: SegmentId, b: SegmentId, weight: number];
