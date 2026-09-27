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
