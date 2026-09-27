import type { Adjacency, GrowthAnchor, Segment, SegmentId, StatWeights, TycoonStatWeights } from "./types";

// Buyer segments, ported from Laptop Tycoon (GDD, Version 0.2, "Market
// score"): its 20 demographics with their weights, price ceilings, screen
// preferences, permeability, population and growth, replacement cycles,
// seasonal curves, freshness decay and social adjacency. Nothing reads this
// yet: the market score and the sales simulation will.
//
// Stat remap, Tycoon to headline stats:
//   performance            -> app
//   gamingPerformance      -> games
//   batteryLife            -> battery
//   weight + thinness      -> portability (the GDD's weight and thickness)
//   display                -> display
//   design + buildQuality  -> chassis (looks and build are one stat here)
//   keyboard               -> keyboard
//   trackpad               -> trackpad
//   connectivity           -> connectivity
//   thermals               -> thermals (thermals and noise)
//   speakers               -> audio
//   priceWeight            -> price
//   webcam                 -> dropped: the market score has no camera stat.
// Tycoon's stats plus its price weight sum to 1. Dropping webcam leaves
// 1 - webcam, and every remaining weight is divided by that, so the ratios
// between them are Tycoon's exactly. The streamer loses the most (0.16).
//
// Years: Tycoon starts in 2000, the game in 2006. Its numbers are kept as they
// are, 2000 base year included; 2006 reads between the 2005 and 2010 anchors.
// Growth stops at the last anchor, 2025, so 2026 equals 2025.

type Row = [
  performance: number,
  gamingPerformance: number,
  batteryLife: number,
  display: number,
  connectivity: number,
  speakers: number,
  webcam: number,
  design: number,
  buildQuality: number,
  keyboard: number,
  trackpad: number,
  weight: number,
  thinness: number,
  thermals: number,
];

function stats(r: Row): TycoonStatWeights {
  const [performance, gamingPerformance, batteryLife, display, connectivity, speakers, webcam, design, buildQuality, keyboard, trackpad, weight, thinness, thermals] = r;
  return { performance, gamingPerformance, batteryLife, display, connectivity, speakers, webcam, design, buildQuality, keyboard, trackpad, weight, thinness, thermals };
}

/** Tycoon's weights onto the headline stats, per the block above. */
export function remap(s: TycoonStatWeights, price: number): StatWeights {
  const keep = 1 - s.webcam;
  return {
    app: s.performance / keep,
    games: s.gamingPerformance / keep,
    battery: s.batteryLife / keep,
    portability: (s.weight + s.thinness) / keep,
    display: s.display / keep,
    chassis: (s.design + s.buildQuality) / keep,
    keyboard: s.keyboard / keep,
    trackpad: s.trackpad / keep,
    connectivity: s.connectivity / keep,
    thermals: s.thermals / keep,
    audio: s.speakers / keep,
    price: price / keep,
  };
}

type Q = Segment["seasonal"];
// Tycoon's seasonal curves: back to school, holidays, business budgets, flat creative, gaming holidays.
const STUDENT: Q = [0.15, 0.15, 0.55, 0.15];
const CONSUMER: Q = [0.15, 0.15, 0.25, 0.45];
const BUSINESS: Q = [0.3, 0.3, 0.25, 0.15];
const CREATIVE: Q = [0.28, 0.27, 0.27, 0.18];
const GAMING: Q = [0.12, 0.22, 0.22, 0.44];

interface Def {
  id: SegmentId;
  name: string;
  shortName: string;
  tier: Segment["tier"];
  description: string;
  stats: Row;
  price: number;
  permeability: number;
  screen: [min: number, max: number, penaltyPerInch: number];
  priceCeiling: number;
  population: number;
  replacementYears: number;
  seasonal: Q;
  freshnessDecay: number;
}

function segment(d: Def): Segment {
  const s = stats(d.stats);
  return {
    id: d.id,
    name: d.name,
    shortName: d.shortName,
    tier: d.tier,
    description: d.description,
    tycoon: { stats: s, price: d.price },
    weights: remap(s, d.price),
    permeability: d.permeability,
    screen: { min: d.screen[0], max: d.screen[1], penaltyPerInch: d.screen[2] },
    priceCeiling: d.priceCeiling,
    population: d.population,
    replacementYears: d.replacementYears,
    seasonal: d.seasonal,
    freshnessDecay: d.freshnessDecay,
  };
}

// Stats rows in Tycoon's order: performance, gaming, battery, display,
// connectivity, speakers, webcam, design, build, keyboard, trackpad, weight,
// thinness, thermals.
export const SEGMENTS: Segment[] = [
  // ------------------------------------------------------------ generalists
  segment({
    id: "corporate",
    name: "Corporate / Enterprise",
    shortName: "Corporate",
    tier: "generalist",
    description: "IT departments buying in bulk. Value reliability, support, and keyboards. Steady presence throughout.",
    stats: [0.06, 0.0, 0.09, 0.04, 0.09, 0.01, 0.02, 0.03, 0.21, 0.17, 0.06, 0.03, 0.02, 0.12],
    price: 0.05,
    permeability: 0.1,
    screen: [14, 15, 0.15],
    priceCeiling: 1800,
    population: 120000,
    replacementYears: 4,
    seasonal: BUSINESS,
    freshnessDecay: 0.7,
  }),
  segment({
    id: "businessProfessional",
    name: "Business Professional",
    shortName: "Biz Pro",
    tier: "generalist",
    description: "Road warriors who need portability, good keyboards, and a professional look. Growing segment.",
    stats: [0.09, 0.0, 0.11, 0.05, 0.05, 0.02, 0.02, 0.11, 0.08, 0.1, 0.05, 0.09, 0.06, 0.02],
    price: 0.15,
    permeability: 0.15,
    screen: [13, 14, 0.18],
    priceCeiling: 1500,
    population: 60000,
    replacementYears: 3,
    seasonal: BUSINESS,
    freshnessDecay: 0.7,
  }),
  segment({
    id: "student",
    name: "Student",
    shortName: "Student",
    tier: "generalist",
    description: "Price-conscious buyers who need something portable that lasts through lectures. Huge population.",
    stats: [0.07, 0.02, 0.12, 0.04, 0.04, 0.02, 0.01, 0.06, 0.04, 0.06, 0.03, 0.12, 0.04, 0.03],
    price: 0.3,
    permeability: 0.2,
    screen: [13, 15, 0.12],
    priceCeiling: 800,
    population: 80000,
    replacementYears: 3,
    seasonal: STUDENT,
    freshnessDecay: 1.2,
  }),
  segment({
    id: "creativeProfessional",
    name: "Creative Professional",
    shortName: "Creative",
    tier: "generalist",
    description: "Designers, photographers, video editors. Will pay a premium for display and performance. Small but growing.",
    stats: [0.15, 0.02, 0.05, 0.25, 0.05, 0.03, 0.01, 0.12, 0.09, 0.05, 0.04, 0.03, 0.03, 0.03],
    price: 0.05,
    permeability: 0.4,
    screen: [15, 17, 0.15],
    priceCeiling: 2500,
    population: 15000,
    replacementYears: 3,
    seasonal: CREATIVE,
    freshnessDecay: 0.8,
  }),
  segment({
    id: "gamer",
    name: "Gamer",
    shortName: "Gamer",
    tier: "generalist",
    description: "All about gaming performance, display, and thermals. Tiny segment pre-2005, explodes after.",
    stats: [0.07, 0.27, 0.02, 0.13, 0.03, 0.04, 0.0, 0.04, 0.04, 0.06, 0.02, 0.01, 0.01, 0.11],
    price: 0.15,
    permeability: 0.7,
    screen: [15, 17, 0.18],
    priceCeiling: 2000,
    population: 5000,
    replacementYears: 3,
    seasonal: GAMING,
    freshnessDecay: 1.3,
  }),
  segment({
    id: "techEnthusiast",
    name: "Tech Enthusiast",
    shortName: "Tech Enth.",
    tier: "generalist",
    description: "Tastemakers. Care about performance, value, connectivity, and thermals. Small but outsized brand influence.",
    stats: [0.17, 0.04, 0.05, 0.07, 0.14, 0.03, 0.02, 0.03, 0.08, 0.07, 0.03, 0.02, 0.02, 0.08],
    price: 0.15,
    permeability: 0.8,
    screen: [13, 15, 0.1],
    priceCeiling: 1500,
    population: 20000,
    replacementYears: 2,
    seasonal: CONSUMER,
    freshnessDecay: 1.0,
  }),
  segment({
    id: "generalConsumer",
    name: "General Consumer",
    shortName: "Consumer",
    tier: "generalist",
    description: "Largest group. Buys based on price, brand recognition, and looks. Heavily influenced by marketing.",
    stats: [0.06, 0.02, 0.09, 0.06, 0.03, 0.03, 0.02, 0.15, 0.07, 0.04, 0.03, 0.07, 0.05, 0.03],
    price: 0.25,
    permeability: 0.1,
    screen: [14, 16, 0.12],
    priceCeiling: 1000,
    population: 150000,
    replacementYears: 3,
    seasonal: CONSUMER,
    freshnessDecay: 1.0,
  }),
  segment({
    id: "budgetBuyer",
    name: "Budget Buyer",
    shortName: "Budget",
    tier: "generalist",
    description: "Price above all else. Tolerates bad everything if cheap. No brand loyalty.",
    stats: [0.1, 0.01, 0.11, 0.05, 0.03, 0.02, 0.01, 0.03, 0.04, 0.05, 0.02, 0.05, 0.03, 0.05],
    price: 0.4,
    permeability: 0.15,
    screen: [14, 16, 0.08],
    priceCeiling: 600,
    population: 50000,
    replacementYears: 5,
    seasonal: CONSUMER,
    freshnessDecay: 1.0,
  }),
  segment({
    id: "developer",
    name: "Developer",
    shortName: "Developer",
    tier: "generalist",
    description: "Performance and keyboard obsessed. Need fast compiles, many ports, and all-day battery. RAM-hungry.",
    stats: [0.18, 0.02, 0.06, 0.08, 0.12, 0.01, 0.01, 0.03, 0.08, 0.14, 0.04, 0.03, 0.02, 0.08],
    price: 0.1,
    permeability: 0.65,
    screen: [13, 15, 0.12],
    priceCeiling: 2000,
    population: 15000,
    replacementYears: 2,
    seasonal: BUSINESS,
    freshnessDecay: 0.7,
  }),
  segment({
    id: "educationK12",
    name: "Education (K-12)",
    shortName: "K-12",
    tier: "generalist",
    description: "Schools buying durable, cheap laptops for classrooms. Price-sensitive with emphasis on build quality and battery.",
    stats: [0.04, 0.0, 0.12, 0.03, 0.03, 0.02, 0.06, 0.02, 0.18, 0.05, 0.02, 0.04, 0.01, 0.03],
    price: 0.35,
    permeability: 0.1,
    screen: [11, 14, 0.15],
    priceCeiling: 500,
    population: 30000,
    replacementYears: 4,
    seasonal: STUDENT,
    freshnessDecay: 1.2,
  }),

  // ------------------------------------------------------------ niches
  segment({
    id: "videoEditor",
    name: "Video Editor",
    shortName: "Video Ed.",
    tier: "niche",
    description: "CPU-bound sustained workloads. Need top-tier performance, fast storage, big displays, and good thermals.",
    stats: [0.22, 0.03, 0.03, 0.2, 0.06, 0.04, 0.01, 0.06, 0.08, 0.05, 0.04, 0.02, 0.02, 0.09],
    price: 0.05,
    permeability: 0.45,
    screen: [15, 17, 0.15],
    priceCeiling: 2500,
    population: 8000,
    replacementYears: 3,
    seasonal: CREATIVE,
    freshnessDecay: 0.8,
  }),
  segment({
    id: "threeDArtist",
    name: "3D Artist / Architect",
    shortName: "3D Artist",
    tier: "niche",
    description: "GPU-bound workstation users. Rendering, CAD, and 3D modelling demand GPU power, display accuracy, and cooling.",
    stats: [0.12, 0.2, 0.02, 0.18, 0.05, 0.01, 0.01, 0.05, 0.07, 0.04, 0.03, 0.02, 0.02, 0.13],
    price: 0.05,
    permeability: 0.4,
    screen: [15, 17, 0.15],
    priceCeiling: 3000,
    population: 5000,
    replacementYears: 3,
    seasonal: CREATIVE,
    freshnessDecay: 0.8,
  }),
  segment({
    id: "musicProducer",
    name: "Music Producer",
    shortName: "Music Prod.",
    tier: "niche",
    description: "Only demographic that heavily weights audio output. Need great speakers, many ports for audio interfaces, and low-latency performance.",
    stats: [0.14, 0.01, 0.05, 0.05, 0.16, 0.2, 0.01, 0.04, 0.06, 0.06, 0.03, 0.03, 0.02, 0.04],
    price: 0.1,
    permeability: 0.35,
    screen: [13, 15, 0.12],
    priceCeiling: 2000,
    population: 3000,
    replacementYears: 3,
    seasonal: CREATIVE,
    freshnessDecay: 0.8,
  }),
  segment({
    id: "esportsPro",
    name: "Esports Pro",
    shortName: "Esports",
    tier: "niche",
    description: "Gamer pushed to extremes. Maximum gaming performance, display refresh, keyboard response, and thermals. Near-zero price sensitivity.",
    stats: [0.08, 0.3, 0.01, 0.16, 0.03, 0.03, 0.01, 0.03, 0.05, 0.12, 0.02, 0.01, 0.01, 0.12],
    price: 0.02,
    permeability: 0.75,
    screen: [15, 17, 0.18],
    priceCeiling: 3500,
    population: 1000,
    replacementYears: 2,
    seasonal: GAMING,
    freshnessDecay: 1.3,
  }),
  segment({
    id: "streamer",
    name: "Streamer",
    shortName: "Streamer",
    tier: "niche",
    description: "Only demographic that heavily weights webcam. Need great camera, speakers, connectivity for capture cards, and raw performance.",
    stats: [0.14, 0.08, 0.02, 0.1, 0.14, 0.12, 0.16, 0.03, 0.03, 0.03, 0.02, 0.01, 0.01, 0.03],
    price: 0.08,
    permeability: 0.7,
    screen: [15, 17, 0.15],
    priceCeiling: 2500,
    population: 500,
    replacementYears: 2,
    seasonal: GAMING,
    freshnessDecay: 1.3,
  }),
  segment({
    id: "digitalNomad",
    name: "Digital Nomad",
    shortName: "Nomad",
    tier: "niche",
    description: "Extreme portability above all. Battery life, weight, thinness, and connectivity for working anywhere in the world.",
    stats: [0.06, 0.0, 0.2, 0.05, 0.12, 0.02, 0.03, 0.06, 0.06, 0.05, 0.03, 0.12, 0.08, 0.02],
    price: 0.1,
    permeability: 0.45,
    screen: [12, 14, 0.2],
    priceCeiling: 2000,
    population: 5000,
    replacementYears: 3,
    seasonal: BUSINESS,
    freshnessDecay: 0.7,
  }),
  segment({
    id: "fieldWorker",
    name: "Field Worker",
    shortName: "Field",
    tier: "niche",
    description: "Rugged use cases: construction, logistics, inspections. Only demographic prioritising build quality (durability) above all else.",
    stats: [0.06, 0.0, 0.16, 0.04, 0.08, 0.02, 0.03, 0.02, 0.25, 0.06, 0.02, 0.05, 0.01, 0.1],
    price: 0.1,
    permeability: 0.15,
    screen: [14, 15, 0.15],
    priceCeiling: 2500,
    population: 15000,
    replacementYears: 4,
    seasonal: BUSINESS,
    freshnessDecay: 0.7,
  }),
  segment({
    id: "writer",
    name: "Writer",
    shortName: "Writer",
    tier: "niche",
    description: "Keyboard-first profile. Great typing experience, long battery, light weight, and a good display for reading. Unique input emphasis.",
    stats: [0.04, 0.0, 0.16, 0.12, 0.03, 0.02, 0.01, 0.06, 0.06, 0.2, 0.04, 0.08, 0.02, 0.01],
    price: 0.15,
    permeability: 0.2,
    screen: [13, 14, 0.18],
    priceCeiling: 1200,
    population: 10000,
    replacementYears: 4,
    seasonal: CREATIVE,
    freshnessDecay: 0.8,
  }),
  segment({
    id: "dayTrader",
    name: "Day Trader",
    shortName: "Trader",
    tier: "niche",
    description: "Multi-monitor, ports-heavy workstation profile. Need great display, many connectivity options, and fast performance.",
    stats: [0.16, 0.02, 0.02, 0.22, 0.18, 0.02, 0.03, 0.04, 0.06, 0.07, 0.03, 0.02, 0.02, 0.06],
    price: 0.05,
    permeability: 0.3,
    screen: [15, 17, 0.15],
    priceCeiling: 3000,
    population: 5000,
    replacementYears: 3,
    seasonal: BUSINESS,
    freshnessDecay: 0.7,
  }),
  segment({
    id: "desktopReplacement",
    name: "Desktop Replacement",
    shortName: "Desktop Rep.",
    tier: "niche",
    description: "Opposite of portable: weight doesn't matter, power does. Biggest screens, maximum performance, and serious thermals.",
    stats: [0.18, 0.12, 0.01, 0.15, 0.08, 0.06, 0.02, 0.04, 0.05, 0.06, 0.03, 0.0, 0.0, 0.1],
    price: 0.1,
    permeability: 0.3,
    screen: [17, 18, 0.2],
    priceCeiling: 2500,
    population: 20000,
    replacementYears: 4,
    seasonal: GAMING,
    freshnessDecay: 1.3,
  }),
];

// ------------------------------------------------------------ market constants

/** Price ceilings are in year-2000 dollars and grow by this much a year. */
export const PRICE_INFLATION = 1.03;
export const PRICE_BASE_YEAR = 2000;

/** The screen fit never falls below this, so no size is shut out entirely. */
export const SCREEN_FIT_FLOOR = 0.05;

/** A laptop's pull at launch, and how it fades per quarter before freshnessDecay scales it. */
export const NOVELTY_LAUNCH_BONUS = 1.3;
export const NOVELTY_DECAY_BASE = 0.85;

/** Population multipliers against each segment's 2000 pool, interpolated in a straight line. */
export const GROWTH_ANCHORS: GrowthAnchor[] = [
  {
    year: 2000,
    multipliers: {
      corporate: 1.0,
      businessProfessional: 1.0,
      student: 1.0,
      creativeProfessional: 1.0,
      gamer: 1.0,
      techEnthusiast: 1.0,
      generalConsumer: 1.0,
      budgetBuyer: 1.0,
      developer: 1.0,
      educationK12: 1.0,
      videoEditor: 1.0,
      threeDArtist: 1.0,
      musicProducer: 1.0,
      esportsPro: 1.0,
      streamer: 1.0,
      digitalNomad: 1.0,
      fieldWorker: 1.0,
      writer: 1.0,
      dayTrader: 1.0,
      desktopReplacement: 1.0,
    },
  },
  {
    year: 2005,
    multipliers: {
      corporate: 1.3,
      businessProfessional: 1.5,
      student: 1.4,
      creativeProfessional: 1.6,
      gamer: 3.0,
      techEnthusiast: 1.4,
      generalConsumer: 1.8,
      budgetBuyer: 1.6,
      developer: 1.5,
      educationK12: 1.3,
      videoEditor: 1.8,
      threeDArtist: 1.6,
      musicProducer: 1.4,
      esportsPro: 4.0,
      streamer: 5.0,
      digitalNomad: 2.0,
      fieldWorker: 1.2,
      writer: 1.3,
      dayTrader: 2.5,
      desktopReplacement: 1.5,
    },
  },
  {
    year: 2010,
    multipliers: {
      corporate: 1.8,
      businessProfessional: 2.5,
      student: 2.5,
      creativeProfessional: 3.0,
      gamer: 6.0,
      techEnthusiast: 2.0,
      generalConsumer: 3.5,
      budgetBuyer: 3.0,
      developer: 2.5,
      educationK12: 2.0,
      videoEditor: 3.5,
      threeDArtist: 3.0,
      musicProducer: 2.5,
      esportsPro: 10.0,
      streamer: 15.0,
      digitalNomad: 4.0,
      fieldWorker: 1.5,
      writer: 1.8,
      dayTrader: 5.0,
      desktopReplacement: 2.5,
    },
  },
  {
    year: 2015,
    multipliers: {
      corporate: 2.2,
      businessProfessional: 3.5,
      student: 4.0,
      creativeProfessional: 5.0,
      gamer: 10.0,
      techEnthusiast: 2.5,
      generalConsumer: 5.0,
      budgetBuyer: 4.5,
      developer: 4.0,
      educationK12: 3.5,
      videoEditor: 6.0,
      threeDArtist: 5.0,
      musicProducer: 4.0,
      esportsPro: 20.0,
      streamer: 40.0,
      digitalNomad: 8.0,
      fieldWorker: 2.0,
      writer: 2.5,
      dayTrader: 8.0,
      desktopReplacement: 3.5,
    },
  },
  {
    year: 2020,
    multipliers: {
      corporate: 2.5,
      businessProfessional: 4.5,
      student: 6.0,
      creativeProfessional: 7.0,
      gamer: 15.0,
      techEnthusiast: 3.0,
      generalConsumer: 6.5,
      budgetBuyer: 6.0,
      developer: 6.0,
      educationK12: 5.0,
      videoEditor: 8.0,
      threeDArtist: 7.0,
      musicProducer: 5.5,
      esportsPro: 30.0,
      streamer: 80.0,
      digitalNomad: 15.0,
      fieldWorker: 2.5,
      writer: 3.5,
      dayTrader: 12.0,
      desktopReplacement: 4.0,
    },
  },
  {
    year: 2025,
    multipliers: {
      corporate: 2.8,
      businessProfessional: 5.0,
      student: 7.0,
      creativeProfessional: 8.0,
      gamer: 18.0,
      techEnthusiast: 3.5,
      generalConsumer: 7.5,
      budgetBuyer: 7.0,
      developer: 8.0,
      educationK12: 6.0,
      videoEditor: 12.0,
      threeDArtist: 9.0,
      musicProducer: 7.0,
      esportsPro: 40.0,
      streamer: 150.0,
      digitalNomad: 25.0,
      fieldWorker: 3.0,
      writer: 4.0,
      dayTrader: 18.0,
      desktopReplacement: 5.5,
    },
  },
];

/** Who talks to whom: a campaign aimed at one spills over to the other. */
export const ADJACENCY: Adjacency[] = [
  ["gamer", "esportsPro", 0.8],
  ["gamer", "streamer", 0.6],
  ["esportsPro", "streamer", 0.5],
  ["developer", "techEnthusiast", 0.7],
  ["videoEditor", "creativeProfessional", 0.6],
  ["digitalNomad", "writer", 0.5],
  ["businessProfessional", "corporate", 0.4],
  ["student", "budgetBuyer", 0.3],
  ["musicProducer", "creativeProfessional", 0.4],
  ["threeDArtist", "creativeProfessional", 0.5],
];

// ------------------------------------------------------------ lookups

export function segmentById(id: SegmentId): Segment {
  const s = SEGMENTS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown segment ${id}`);
  return s;
}

/** The segment's price ceiling in the year's dollars. */
export function priceCeiling(s: Segment, year: number): number {
  return Math.round(s.priceCeiling * PRICE_INFLATION ** (year - PRICE_BASE_YEAR));
}

/** People in the segment in the year: the 2000 pool times the interpolated growth. */
export function population(s: Segment, year: number): number {
  const a = GROWTH_ANCHORS;
  if (year <= a[0].year) return Math.round(s.population * a[0].multipliers[s.id]);
  const last = a[a.length - 1];
  if (year >= last.year) return Math.round(s.population * last.multipliers[s.id]);
  const i = a.findIndex((g) => g.year > year);
  const lo = a[i - 1];
  const hi = a[i];
  const t = (year - lo.year) / (hi.year - lo.year);
  const m = lo.multipliers[s.id] + (hi.multipliers[s.id] - lo.multipliers[s.id]) * t;
  return Math.round(s.population * m);
}

/** Buyers in a quarter (1 to 4): population over the replacement cycle, on the seasonal curve. */
export function quarterlyBuyers(s: Segment, year: number, quarter: 1 | 2 | 3 | 4): number {
  return Math.round((population(s, year) / s.replacementYears) * s.seasonal[quarter - 1]);
}

/** 1 inside the preferred screen range, less per inch outside, never under the floor. */
export function screenFit(s: Segment, inches: number): number {
  const { min, max, penaltyPerInch } = s.screen;
  if (inches >= min && inches <= max) return 1;
  const off = inches < min ? min - inches : inches - max;
  return Math.max(SCREEN_FIT_FLOOR, 1 - off * penaltyPerInch);
}

/** The segments next to this one, with their weights. */
export function neighbours(id: SegmentId): { id: SegmentId; weight: number }[] {
  const out: { id: SegmentId; weight: number }[] = [];
  for (const [a, b, weight] of ADJACENCY) {
    if (a === id) out.push({ id: b, weight });
    else if (b === id) out.push({ id: a, weight });
  }
  return out;
}
