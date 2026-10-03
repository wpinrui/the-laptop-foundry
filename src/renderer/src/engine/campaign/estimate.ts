import { market } from "./brand";
import { SALES_NOISE } from "./constants";
import { publishReviews } from "./critics";
import type { CampaignState, QuarterContext } from "./index";
import { launchRivals } from "./rivals";
import { quarterSplit, type Seller } from "./sales";

// The desk's estimate of a model's sales in the quarter being played, the
// next one the player will see resolved. It runs the steps that come before
// the sales (rivals launching, critics publishing, campaigns buying reach)
// and then the sales split itself, on copies: no RNG is drawn and the state
// passed in is left as it is.

/** A model's estimated sales: units its buyers would take, and those after the stock. */
export interface SalesEstimate {
  /** Units wanted, before stock, at the noise's low and high end. */
  want: { low: number; high: number };
  /** Units sold after the stock caps them. */
  low: number;
  high: number;
}

/**
 * The model's sales range for the quarter being played, or null when it is
 * not on sale then. The model's noise runs at its low and high end; the
 * rivals' and the player's other models' noise sits at neutral, since in the
 * share split each one's luck moves everyone else's units too.
 */
export function estimateSales(state: CampaignState, ctx: QuarterContext, id: string): SalesEstimate | null {
  const r = state.releases[id];
  if (state.over || !r) return null;
  // What the quarter's earlier steps would do first, all deterministic.
  const ready = market(publishReviews(launchRivals(state, ctx), ctx));
  // The model's stock lifted so the split reports what its buyers want; its stock caps it after.
  const unlimited = (sellers: Seller[]) =>
    sellers.map((x) => (x.id === id ? { ...x, stock: Number.POSITIVE_INFINITY } : x));
  const at = (luck: number) => {
    const { sellers, res } = quarterSplit(ready, ctx, unlimited, (x) => (x.id === id ? luck : 1));
    return sellers.some((x) => x.id === id) ? (res.sold[id] ?? 0) : null;
  };
  const low = at(1 - SALES_NOISE);
  const high = at(1 + SALES_NOISE);
  if (low === null || high === null) return null;
  const stock = Math.max(0, Math.floor(r.stock));
  return { want: { low, high }, low: Math.min(low, stock), high: Math.min(high, stock) };
}
