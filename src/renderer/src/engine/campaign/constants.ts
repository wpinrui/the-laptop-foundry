// Campaign constants. Money is in nominal US dollars.

/** The earliest and latest year a campaign can start in. */
export const FIRST_START = 2006;
export const LAST_START = 2025;

/** A campaign ends after the fourth quarter of this year. */
export const END_YEAR = 2026;

/**
 * Cash a campaign starts with. A modest first run is about 5,000 midrange
 * laptops at a bill of materials near $600, so $3M of parts, plus roughly
 * $1M of tooling for a new chassis and $1M to carry the company through the
 * quarters before the first sales land. Tight enough that a bad first
 * model hurts, loose enough that a sensible one can be made at all.
 */
export const STARTING_CASH = 5_000_000;

// ------------------------------------------------------------------ releases

/**
 * Production run sizes the player steps through. A small maker's first order
 * with a contract manufacturer is a few thousand units; 100,000 is a hit
 * mainstream model's run for a quarter.
 */
export const RUN_SIZES = [1_000, 2_000, 3_000, 5_000, 10_000, 20_000, 50_000, 100_000];

/** The run size the picker starts on: the scale reference, a sensible first order. */
export const DEFAULT_RUN = 5_000;

/**
 * Economies of scale on the parts and assembly cost of a run:
 * 1 / (1 + SCALE_SLOPE * log10(units / SCALE_REFERENCE)), clamped to
 * SCALE_FLOOR..1. At 5,000 units and below a unit pays the build's full
 * cost; 50,000 units cost about 71% each, as suppliers discount volume and
 * the line setup spreads thinner. Past about 56,000 units the floor holds:
 * parts have a price below which no supplier goes.
 */
export const SCALE_REFERENCE = 5_000;
export const SCALE_SLOPE = 0.4;
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
