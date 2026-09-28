// The years the content covers. A campaign runs on past the last one; every
// part, line and table then reads the last year, so nothing new appears and
// nothing disappears.

/** First and last year a build can be set in. */
export const FIRST_YEAR = 2006;
export const LAST_YEAR = 2026;

/** The year to look content up in: past LAST_YEAR, LAST_YEAR. */
export function contentYear(year: number): number {
  return Math.min(year, LAST_YEAR);
}
