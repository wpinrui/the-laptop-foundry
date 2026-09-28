import type { Era } from "../review/Charts";

/**
 * The in-game retailer, per era. Real names are used privately until the
 * game is public; change them here and nowhere else.
 */
export const STORE: Record<Era, { name: string; domain: string }> = {
  2006: { name: "Courts", domain: "http://www.courts.com.sg" },
  2016: { name: "Courts", domain: "www.courts.com.sg" },
  2026: { name: "Courts", domain: "courts.com.sg" },
};
