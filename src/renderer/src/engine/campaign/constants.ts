import type { SegmentId } from "../market/types";
import type { AwardId } from "./awards";

// Campaign constants. Money is in nominal US dollars.

/**
 * The earliest and latest year a campaign can start in. A campaign has no
 * last year: past 2026 the content holds at its last year and the clock runs on.
 */
export const FIRST_START = 2006;
export const LAST_START = 2025;

/**
 * Cash a campaign starts with. A modest first run is about 5,000 midrange
 * laptops at a bill of materials near $600, so $3M of parts, plus roughly
 * $1M of tooling for a new chassis and $1M to carry the company through the
 * quarters before the first sales land. Tight enough that a bad first
 * model hurts, loose enough that a sensible one can be made at all.
 */
export const STARTING_CASH = 5_000_000;

// ------------------------------------------------------------------ releases

/** The smallest production run. There is no largest. */
export const MIN_RUN = 100;

/** The run size the picker starts on: the scale reference, a sensible first order. */
export const DEFAULT_RUN = 5_000;

/**
 * Run size against the parts and assembly cost of a unit, on
 * x = log10(units / SCALE_REFERENCE); see scaleFactor in release.ts. A run of
 * 5,000 pays the build's full cost. Smaller runs pay more, 1 - SCALE_SMALL_SLOPE * x:
 * suppliers charge small orders a premium and the line setup spreads over
 * fewer units, about +16% at 1,000 and +39% at 100. Larger runs pay less,
 * 1 / (1 + SCALE_SLOPE * x): about -11% at 10,000 and -29% at 50,000. Past
 * about 56,000 units SCALE_FLOOR holds: parts have a price below which no
 * supplier goes.
 */
export const SCALE_REFERENCE = 5_000;
export const SCALE_SLOPE = 0.4;
export const SCALE_SMALL_SLOPE = 0.23;
export const SCALE_FLOOR = 0.7;

/**
 * Design, engineering and certification (FCC, CE, safety) for a model, paid
 * once at release. A new chassis needs a design team for months; a refresh
 * on a released model's body only revalidates the new internals.
 */
export const DESIGN_COST = { new: 300_000, refresh: 75_000 };

/**
 * Chassis tooling paid once at release: the moulds, dies and CNC fixtures for
 * the shell. A refresh keeps the body, so it only pays for adjusted fixtures.
 * A new chassis at $1M in all, design and tooling, matches the starting cash
 * reasoning above.
 */
export const TOOLING_COST = { new: 700_000, refresh: 50_000 };

// ------------------------------------------------------------------ finances

/**
 * The retailers' share of each sale's retail price. Laptop margins at big box
 * stores and e-tailers ran near 15 to 25%; a new brand gets no better than
 * the middle of that.
 */
export const RETAILER_CUT = 0.2;

/**
 * Fixed overhead per quarter: a small team of about 15 engineers, buyers and
 * support staff at around $10k a quarter each, loaded. Doing nothing costs
 * $600k a year, so sitting on the starting cash is no strategy.
 */
export const OVERHEAD_BASE = 150_000;

/**
 * Overhead per quarter for each line on the market (a released model with
 * stock): its product manager, channel support, spares and warranty desk.
 */
export const OVERHEAD_PER_LINE = 40_000;

/**
 * Holding cost per quarter as a share of the stock's production cost:
 * warehousing, insurance and the cash tied up. Around 16% a year, the low
 * end of the usual 15 to 30%, since laptops are small and dense.
 */
export const HOLDING_RATE = 0.04;

// ------------------------------------------------------------------ brand
// Ported from Laptop Tycoon's brand progression and marketing channels. Reach
// is a share of a segment's buyers who know the company, 0 to 1 (Tycoon keeps
// it in percent). Perception is the segment's opinion of the company.

/** Reach a new company starts with in every segment, as in Tycoon: it sells nothing until it markets. */
export const STARTING_REACH = 0;

/** Reach never decays below this share of the highest reach the company has held in a segment. */
export const REACH_PEAK_FLOOR = 0.5;

/** The share of a quarter's laptop units, all segments, the company must win for Courts to list its models. */
export const COURTS_LISTING_SHARE = 0.01;

/** The same share for the Courts site in every laptop's OS, which lists the company's models sooner than the store. */
export const COURTS_SITE_SHARE = 0.001;

/**
 * Cost per quarter of each campaign tier in 2000 dollars, Tycoon's numbers.
 * Index 0 is no campaign; 1 to 5 are grassroots, targeted digital,
 * professional, mass market and cultural omnipresence. Tier 5 at $3M a
 * quarter is a national TV push; tier 1 is a founder posting in forums.
 */
export const TIER_COST = [0, 2_000, 50_000, 200_000, 750_000, 3_000_000];

/** The top campaign tier. */
export const TOP_TIER = 5;

/** Marketing costs rise 3% a year from 2000, as in Tycoon, so a 2006 tier costs 1.19 times its base. */
export const MARKETING_INFLATION = 1.03;
export const MARKETING_BASE_YEAR = 2000;

/**
 * Buyers a tier wins over per quarter, Tycoon's numbers. Reach grows by these
 * over the segment's population that year, so a tier moves a small niche
 * fast and a mass segment slowly.
 */
export const TIER_ACQUISITIONS = [0, 100, 500, 2_000, 7_500, 25_000];

/**
 * Reach ceiling of each tier before the segment's permeability rescales it.
 * A campaign grows reach up to its ceiling and no further.
 */
export const TIER_CEILING = [0, 0.15, 0.3, 0.5, 0.75, 0.95];

/** No campaign takes a segment past this reach. */
export const MAX_REACH = 0.95;

/**
 * The top tier a segment can take, by its permeability, Tycoon's cut-offs,
 * checked in order. A permeable segment (gamers, tech fans) is reached
 * through a few channels, so tier 2 already hits the ceiling; a closed one
 * (corporate, consumers) needs tier 5. Ceilings are rescaled so a segment's
 * top tier reaches MAX_REACH.
 */
export const TIER_CUTOFFS: [minPermeability: number, maxTier: number][] = [
  [0.65, 2],
  [0.35, 3],
  [0.2, 4],
  [0, 5],
];

/**
 * Share of a campaign's buyers that spill to each neighbouring segment,
 * times the adjacency weight. Gamers at tier 2 win 500 gamers and
 * 500 * 0.8 * 0.15 = 60 esports players.
 */
export const SPILLOVER = 0.15;

/**
 * Reach lost per quarter with no campaign, times 1 + permeability. A closed
 * segment keeps 95% a quarter, about 81% after a year; a permeable one
 * forgets faster, about 91% a quarter. Above a campaign's ceiling reach sinks
 * back toward it at the same rate.
 */
export const REACH_DECAY = 0.05;

/** Perception a new company starts with: neutral. */
export const STARTING_PERCEPTION = 0;

/**
 * Perception bounds, Tycoon's. The brand factor multiplies by
 * 1 + perception / 100, so a brand shifts sales by half at most either way.
 */
export const PERCEPTION_MIN = -50;
export const PERCEPTION_MAX = 50;

/** Weight of the newest quarter in perception's exponential smoothing, Tycoon's alpha. */
export const PERCEPTION_ALPHA = 0.25;

/**
 * Turns a buyer's experience gap into a perception target, Tycoon's scale: a
 * laptop 30% better than the market maps to 15.
 */
export const PERCEPTION_SCALE = 50;

/** A bad experience weighs this much more than a good one, Tycoon's negativity bias. */
export const NEGATIVITY = 1.5;

/**
 * How a buyer's experience is built, from gaps to par that each run about
 * -0.5 to 0.5. Value for money leads, as in Tycoon, whose experience is its
 * value gap alone; the market score and the critics add the rest.
 */
export const EXPERIENCE_WEIGHTS = { value: 0.5, market: 0.3, review: 0.2 };

/** A market score of 5.5 is par, a laptop at the market average; 1 to 10 maps to gaps of -0.5 to 0.5. */
export const MARKET_PAR = 5.5;
export const MARKET_SPAN = 9;

/** A review score of 65 out of 100 is par; 30 and 100 are gaps of -0.5 and 0.5. */
export const REVIEW_PAR = 65;
export const REVIEW_SPAN = 70;

// ------------------------------------------------------------------ critics

/**
 * Quarters from a laptop going on sale to its review in print. Critics need
 * a unit, a few weeks of testing and an editor, so a launch is reviewed the
 * quarter after. Until then buyers read the critics as neutral.
 */
export const CRITICS_DELAY = 1;

// ------------------------------------------------------------------ awards

/**
 * The segments each award speaks to. Primary segments read it as a reason to
 * buy; secondary ones notice it, at AWARD_SECONDARY of the effect. Laptop
 * Tycoon's outlet affinities, spread over its six awards.
 */
export const AWARD_SEGMENTS: Record<AwardId, { primary: SegmentId[]; secondary: SegmentId[] }> = {
  overall: {
    primary: ["generalConsumer", "techEnthusiast", "student", "businessProfessional"],
    secondary: ["creativeProfessional", "developer", "digitalNomad", "writer"],
  },
  value: {
    primary: ["budgetBuyer", "student", "educationK12", "generalConsumer"],
    secondary: ["fieldWorker", "writer"],
  },
  portable: {
    primary: ["digitalNomad", "businessProfessional", "student", "writer"],
    secondary: ["fieldWorker", "generalConsumer", "corporate"],
  },
  performance: {
    primary: ["techEnthusiast", "developer", "videoEditor", "threeDArtist"],
    secondary: ["creativeProfessional", "dayTrader", "musicProducer", "desktopReplacement"],
  },
  business: {
    primary: ["corporate", "businessProfessional", "fieldWorker"],
    secondary: ["dayTrader", "developer", "writer"],
  },
  gaming: {
    primary: ["gamer", "esportsPro", "streamer"],
    secondary: ["techEnthusiast", "desktopReplacement"],
  },
};

/** A secondary segment's share of an award's effect, Tycoon's 1 against 5. */
export const AWARD_SECONDARY = 0.2;

/**
 * A winner's appeal in a primary segment through the next year: 1 + this per
 * award. Small next to the market score and brand; a 10% lift wins a few
 * points of share.
 */
export const AWARD_APPEAL = 0.1;

/** Perception a player's win adds at once in a primary segment, Tycoon's 5 of 50. */
export const AWARD_PERCEPTION = 5;

// ------------------------------------------------------------------ rival timing

/**
 * Quarters a line's yearly model can launch in, by the kind of line. One is
 * picked per company, line and year, so a repeated quarter is likelier.
 * Business lines refresh early in the year with the corporate budgets and
 * Intel's January platform launches; consumer lines land for back to school
 * in Q3, a few in spring or for the holidays; gaming lines chase the fall
 * game releases and the holidays.
 */
export const LAUNCH_WINDOWS = {
  business: [1, 1, 2],
  consumer: [2, 3, 3, 3, 4],
  gaming: [3, 4, 4],
} as const;

/** Lines sold to companies, which launch in the business window. */
export const BUSINESS_LINES = ["lenovo-thinkpad", "dell-latitude", "hp-elitebook", "toshiba-portege"];

/**
 * Lines whose launches follow their own calendar: Apple at its June
 * developer conference and its autumn events, Microsoft at its spring and
 * autumn hardware events.
 */
export const LAUNCH_OVERRIDES: Record<string, readonly number[]> = {
  "apple-macbook": [2, 4],
  "apple-macbook-air": [1, 2, 4],
  "apple-macbook-pro": [2, 4],
  "microsoft-surface-laptop": [2, 4],
};

/**
 * Quarters a model stays on sale after its successor launches, clearing the
 * channel's stock: 1 means both sell in the successor's launch quarter.
 */
export const SELL_THROUGH_QUARTERS = 1;

/** Quarters a line's last model stays on sale after its launch when no successor comes. */
export const LAST_MODEL_QUARTERS = 4;

// ------------------------------------------------------------------ sales
// Ported from Laptop Tycoon's sales engine: each segment's buyers in a
// quarter split among the laptops on sale by appeal, and every buyer buys.

/**
 * Tycoon's populations are a small model world: about 520,000 laptop buyers
 * a year in 2010. The US bought about 35 to 40 million laptops a year around
 * 2010, so every segment's buyers are scaled up by this. Reach stays in
 * Tycoon's units, so word of mouth divides it back out.
 */
export const DEMAND_SCALE = 70;

/**
 * How strongly the market score drives appeal: exp(k x (score - 5.5)). At
 * 0.35 a laptop scoring 10 is 4.8 times as appealing as an average one and
 * a laptop scoring 1 a fifth as much.
 */
export const SCORE_STEEPNESS = 0.35;

/**
 * How fast appeal falls once the price passes the segment's ceiling:
 * exp(-k x (price / ceiling - 1)). At 4, 25% over the ceiling keeps 37% of
 * the buyers and 50% over keeps 14%, both against the appeal at the ceiling.
 */
export const OVER_CEILING_STEEPNESS = 4;

/**
 * Packaging's pull on appeal: the packaging index, the cube root of
 * (market kg / kg) x (market mm / mm) x (screen-to-body / market's), raised
 * to PACK_BASE + PACK_PER_WEIGHT x the segment's portability weight. A
 * laptop 20% lighter and thinner with 10 points more screen-to-body sells
 * about 20% better to a desktop replacement buyer and 110% to a nomad.
 */
export const PACK_BASE = 1;
export const PACK_PER_WEIGHT = 10;
/** The packaging index is clamped to this range before the power. */
export const PACK_MIN = 0.5;
export const PACK_MAX = 2;

/**
 * Below the ceiling appeal is full up to this share of it, then eases off
 * toward the ceiling at UNDER_CEILING_STEEPNESS, so a price at the ceiling
 * is no longer free.
 */
export const PRICE_KNEE = 0.6;

/** How fast appeal eases from the knee to the ceiling: exp(-k x (price / ceiling - knee)). At 3 the ceiling keeps 30%. */
export const UNDER_CEILING_STEEPNESS = 3;

/**
 * The critics' pull: exp(k x (review - REVIEW_PAR) / REVIEW_SPAN). At 1 a
 * review of 100 lifts appeal by 65% and a review of 30 cuts it by 40%.
 */
export const CRITICS_STRENGTH = 1;

/**
 * Uniform noise on each laptop's appeal, plus or minus this share, seeded
 * per quarter and laptop: a good quarter or a bad one, Tycoon's 10 to 15%.
 */
export const SALES_NOISE = 0.12;

/**
 * People each buyer tells: sales grow reach by WORD_OF_MOUTH x units, in
 * Tycoon's population units (units / DEMAND_SCALE), over the segment. A
 * niche that buys well hears of the company; a mass segment barely does.
 */
export const WORD_OF_MOUTH = 5;

/** Sales records kept in the save, one per quarter: five years. */
export const SALES_HISTORY = 20;

/**
 * Each rival maker's brand in each segment, on the player's brandFactor
 * scale: reach times (1 + perception / 100), so 1 is a maker every buyer
 * knows and thinks nothing special of. `base` covers segments not listed.
 * Rough reads of the 2006 to 2026 US market: Dell, Lenovo and HP own
 * corporate buyers, Apple owns creatives and the premium end but barely
 * sells to gamers, the gaming makers own gaming and little else, and
 * Samsung, Microsoft and Razer are known but narrow.
 */
export const RIVAL_BRAND: Record<string, { base: number; segments?: Partial<Record<SegmentId, number>> }> = {
  dell: {
    base: 0.9,
    segments: { corporate: 1.25, businessProfessional: 1.1, fieldWorker: 1.1, gamer: 0.9, desktopReplacement: 1.0 },
  },
  lenovo: {
    base: 0.85,
    segments: { corporate: 1.25, businessProfessional: 1.2, developer: 1.1, fieldWorker: 0.95, educationK12: 0.95 },
  },
  hp: {
    base: 0.9,
    segments: { corporate: 1.15, generalConsumer: 1.05, budgetBuyer: 1.0, student: 0.95, educationK12: 0.95 },
  },
  apple: {
    base: 0.8,
    segments: {
      creativeProfessional: 1.4,
      videoEditor: 1.4,
      musicProducer: 1.45,
      developer: 1.2,
      writer: 1.2,
      digitalNomad: 1.2,
      techEnthusiast: 1.0,
      student: 1.0,
      educationK12: 0.8,
      corporate: 0.45,
      fieldWorker: 0.3,
      budgetBuyer: 0.3,
      gamer: 0.25,
      esportsPro: 0.15,
      desktopReplacement: 0.3,
    },
  },
  asus: { base: 0.7, segments: { gamer: 1.1, esportsPro: 1.1, streamer: 1.0, budgetBuyer: 0.9, student: 0.85 } },
  acer: { base: 0.7, segments: { budgetBuyer: 1.0, educationK12: 1.0, student: 0.85, gamer: 0.8 } },
  msi: {
    base: 0.35,
    segments: { gamer: 1.1, esportsPro: 1.1, streamer: 1.0, desktopReplacement: 1.0, threeDArtist: 0.7 },
  },
  samsung: { base: 0.5, segments: { techEnthusiast: 0.6 } },
  microsoft: { base: 0.6, segments: { businessProfessional: 0.9, student: 0.8, writer: 0.85 } },
  razer: { base: 0.3, segments: { gamer: 1.0, esportsPro: 1.2, streamer: 1.1, techEnthusiast: 0.6 } },
  toshiba: { base: 0.7, segments: { budgetBuyer: 0.85, fieldWorker: 0.8, businessProfessional: 0.8 } },
  sony: { base: 0.6, segments: { generalConsumer: 0.75, creativeProfessional: 0.7, student: 0.7 } },
};

/** A maker missing from RIVAL_BRAND. */
export const RIVAL_BRAND_DEFAULT = 0.5;
