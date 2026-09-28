import { useMemo } from "react";
import type { SavedCompany } from "../../../preload/store";
import type { Build } from "../engine";
import { type CampaignState, campaignOf, type StoreItem, storeListing, yearListing } from "../engine/campaign";
import { rivalsFor } from "../engine/market/field";
import { FIRST_MARKET_YEAR, useMarket } from "../market/markets";
import type { Era } from "../review/Charts";
import { eraOf } from "../review/ReviewSite";
import { type Spec, specOf } from "../store/StoreSite";
import { makerName, useWorldMarket } from "../world/data";

// What the store's tables hold: in a campaign, the last played quarter's
// shelf (every rival on sale and the player's released models with their
// stock); in a sandbox company, the generated market of the chosen year.

export interface OnSale {
  id: string;
  own: boolean;
  /** The maker's name as the store prints it; the company's for the player's own. */
  brand: string;
  name: string;
  price: number;
  review: number | null;
  units: number;
  isNew: boolean;
  /** Its unit rank, 1 for the best seller; null when nothing sold. */
  rank: number | null;
  /** Units in stock for the player's own model; null for a rival. */
  stock: number | null;
  kg: number | null;
  inches: number;
  build: Build;
  spec: Spec;
}

export interface Stock {
  year: number;
  era: Era;
  items: OnSale[];
  /** The market's years are loaded. */
  ready: boolean;
}

const NO_MODELS: SavedCompany["models"] = [];

export function useOnSale(company: SavedCompany, campaign: CampaignState | null | undefined, year: number | undefined): Stock {
  const state = useMemo(() => campaign ?? (company.campaign ? campaignOf(company.campaign) : null), [campaign, company.campaign]);
  const shelf = state?.shelf[state.shelf.length - 1];
  const at = state ? (shelf?.quarter.year ?? state.now.year) : Math.max(FIRST_MARKET_YEAR, Math.round(year ?? latestYear(company)));
  const ready = useMarket(...(at > FIRST_MARKET_YEAR ? [at - 1, at] : [at]));
  const market = useWorldMarket(company.models ?? NO_MODELS);
  const items = useMemo((): OnSale[] => {
    if (!ready) return [];
    const full = (window as unknown as { __probeFull?: number[] }).__probeFull; // PROBE
    const list: StoreItem[] = full ? full.flatMap((y) => yearListing(rivalsFor(y))) : state && shelf ? storeListing(state, market, shelf.quarter) : yearListing(rivalsFor(at)); // PROBE
    const ranked = list.filter((x) => x.units > 0).sort((a, b) => b.units - a.units || a.id.localeCompare(b.id));
    return list.flatMap((x): OnSale[] => {
      if (!x.build) return [];
      const r = ranked.indexOf(x);
      return [
        {
          id: x.id,
          own: x.own,
          brand: makerName(x.maker, company.name),
          name: x.name,
          price: x.price,
          review: x.review,
          units: x.units,
          isNew: x.isNew,
          rank: r >= 0 ? r + 1 : null,
          stock: x.own && state ? (state.releases[x.id]?.stock ?? 0) : null,
          kg: x.kg,
          inches: x.inches,
          build: { ...x.build, price: x.price },
          spec: specOf(x, company.name),
        },
      ];
    });
  }, [ready, state, shelf, market, at, company.name]);
  return { year: at, era: eraOf(at), items, ready };
}

function latestYear(c: SavedCompany): number {
  let best: number | undefined;
  let when = -1;
  for (const m of c.models ?? []) {
    const y = (m.build as Build | undefined)?.year;
    if (typeof y === "number" && m.updated > when) {
      best = y;
      when = m.updated;
    }
  }
  return best ?? FIRST_MARKET_YEAR;
}
