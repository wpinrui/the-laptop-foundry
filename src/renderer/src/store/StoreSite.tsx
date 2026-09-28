import { useMemo, useState } from "react";
import {
  type CampaignState,
  type Quarter,
  quarterLabel,
  type StoreFilters,
  type StoreItem,
  storeFacets,
  storeListing,
  type WorldMarket,
} from "../engine/campaign";
import type { BodyClass, Budget, PerfClass } from "../engine/price";
import { reviewOf } from "../engine/review";
import type { SegmentId } from "../engine/market/types";
import type { Era } from "../review/Charts";
import { count, usd } from "../foundry/Release";
import { cap, inchesLabel, makerName, segmentName } from "../world/data";
import { STORE } from "./name";
import "./store.css";

// The in-game retailer's website: every laptop on sale in a quarter, with
// filters, and a product page. Its look follows the era like the review
// site's: a 2006 portal, a 2016 flat shop, a 2026 editorial page. The data
// comes from storeListing; this file only lays it out.

const PRICE_BANDS: [string, number | undefined, number | undefined][] = [
  ["Under $500", undefined, 499.99],
  ["$500 to $999", 500, 999.99],
  ["$1,000 to $1,499", 1000, 1499.99],
  ["$1,500 to $1,999", 1500, 1999.99],
  ["$2,000 and up", 2000, undefined],
];

const SIZE_BANDS: [string, number | undefined, number | undefined][] = [
  ['Under 13"', undefined, 12.99],
  ['13" to 14"', 13, 14.99],
  ['15" to 16"', 15, 16.99],
  ['17" and up', 17, undefined],
];

const BODIES: BodyClass[] = ["thin and light", "medium", "large"];
const PERFS: PerfClass[] = ["office", "mixed-use", "gaming"];
const BUDGETS: Budget[] = ["low", "midrange", "premium"];
const SORTS: [NonNullable<StoreFilters["sort"]>, string][] = [
  ["units", "Best selling"],
  ["price", "Price"],
  ["review", "Rating"],
  ["name", "Name"],
];

const OWN = "__own";

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: [T, string][];
  onChange: (v: T | "") => void;
}) {
  return (
    <label className="st-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T | "")}>
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Masthead({ era, quarter, onHome }: { era: Era; quarter: Quarter; onHome: () => void }) {
  return (
    <header className="st-mast">
      <button type="button" className="st-logo" onClick={onHome}>
        {STORE[era].name}
      </button>
      <nav>
        <span className="st-on">Laptops</span>
        <span>Desktops</span>
        <span>Phones</span>
        <span>TV</span>
      </nav>
      <span className="st-when">{quarterLabel(quarter)}</span>
    </header>
  );
}

function Card({ item, company, onOpen }: { item: StoreItem; company: string; onOpen: () => void }) {
  return (
    <button type="button" className={`st-card${item.own ? " st-own" : ""}`} onClick={onOpen}>
      {item.isNew && <i className="st-new">New</i>}
      <span className="st-maker">{makerName(item.maker, company)}</span>
      <b className="st-name">{item.name}</b>
      <span className="st-meta">
        {[inchesLabel(item.inches), cap(item.body), cap(item.performance)].filter(Boolean).join(", ")}
      </span>
      <span className="st-price">{usd(item.price)}</span>
      <span className="st-stats">
        <span>
          <small>Rating</small>
          {item.review === null ? "" : `${item.review.toFixed(0)}%`}
        </span>
        <span>
          <small>Sold</small>
          {count(item.units)}
        </span>
      </span>
    </button>
  );
}

function Product({ item, company, era, onBack }: { item: StoreItem; company: string; era: Era; onBack: () => void }) {
  const specs = useMemo(() => {
    if (!item.build) return [];
    try {
      return reviewOf({ id: item.id, name: item.name, company: makerName(item.maker, company), build: { ...item.build, price: item.price } }).specs;
    } catch {
      return [];
    }
  }, [item, company]);
  return (
    <article className="st-product">
      <button type="button" className="st-crumb" onClick={onBack}>
        {`${STORE[era].name} / Laptops / ${makerName(item.maker, company)}`}
      </button>
      <div className="st-product-head">
        <div>
          <span className="st-maker">{makerName(item.maker, company)}</span>
          <h1>{item.name}</h1>
          <span className="st-meta">{[inchesLabel(item.inches), cap(item.body), cap(item.performance), cap(item.budget)].filter(Boolean).join(", ")}</span>
        </div>
        <div className="st-buy">
          <b className="st-price">{usd(item.price)}</b>
          {item.isNew && <i className="st-new">New</i>}
        </div>
      </div>
      <dl className="st-facts">
        <div>
          <dt>Rating</dt>
          <dd>{item.review === null ? "" : `${item.review.toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>Sold this quarter</dt>
          <dd>{count(item.units)}</dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>{item.kg === null ? "" : `${item.kg.toFixed(2)} kg`}</dd>
        </div>
        <div>
          <dt>Bought by</dt>
          <dd>{item.segments.map(segmentName).join(", ")}</dd>
        </div>
      </dl>
      {specs.length > 0 && (
        <table className="st-specs">
          <tbody>
            {specs.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

/** The retailer's site for the quarter. The product page is controlled when `page` is passed. */
export function StoreSite({
  state,
  market,
  quarter,
  company,
  era,
  page,
  onPage,
}: {
  state: CampaignState;
  market: WorldMarket;
  quarter: Quarter;
  company: string;
  era: Era;
  page?: string | null;
  onPage?: (id: string | null) => void;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const open = page === undefined ? own : page;
  const go = onPage ?? setOwn;
  const [filters, setFilters] = useState<StoreFilters>({});
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [maker, setMaker] = useState("");
  const all = useMemo(() => storeListing(state, market, quarter), [state, market, quarter]);
  const facets = useMemo(() => storeFacets(all), [all]);
  const band = (bands: typeof PRICE_BANDS, v: string) => bands.find(([l]) => l === v);
  const f: StoreFilters = {
    ...filters,
    minPrice: band(PRICE_BANDS, price)?.[1],
    maxPrice: band(PRICE_BANDS, price)?.[2],
    minInches: band(SIZE_BANDS, size)?.[1],
    maxInches: band(SIZE_BANDS, size)?.[2],
    maker: maker === "" ? undefined : maker === OWN ? null : maker,
  };
  const items = useMemo(() => storeListing(state, market, quarter, f), [state, market, quarter, JSON.stringify(f)]);
  const item = open ? all.find((x) => x.id === open) : undefined;
  const set = <K extends keyof StoreFilters>(k: K, v: StoreFilters[K] | "") =>
    setFilters((x) => ({ ...x, [k]: v === "" ? undefined : v }));
  const makers = facets.makers
    .map((m): [string, string] => [m === null ? OWN : m, makerName(m, company)])
    .sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <div className={`st st-${era}`}>
      <div className="st-frame">
        <Masthead era={era} quarter={quarter} onHome={() => go(null)} />
        {item ? (
          <Product item={item} company={company} era={era} onBack={() => go(null)} />
        ) : (
          <div className="st-shop">
            <aside className="st-side">
              <Select label="Price" value={price} options={PRICE_BANDS.map(([l]) => [l, l])} onChange={setPrice} />
              <Select label="Screen" value={size} options={SIZE_BANDS.map(([l]) => [l, l])} onChange={setSize} />
              <Select label="Size" value={f.body ?? ""} options={BODIES.map((b) => [b, cap(b)])} onChange={(v) => set("body", v)} />
              <Select label="Use" value={f.performance ?? ""} options={PERFS.map((b) => [b, cap(b)])} onChange={(v) => set("performance", v)} />
              <Select label="Budget" value={f.budget ?? ""} options={BUDGETS.map((b) => [b, cap(b)])} onChange={(v) => set("budget", v)} />
              <Select label="Brand" value={maker} options={makers} onChange={setMaker} />
              <Select<SegmentId>
                label="For"
                value={f.segment ?? ""}
                options={facets.segments.map((s) => [s, segmentName(s)])}
                onChange={(v) => set("segment", v)}
              />
            </aside>
            <section className="st-list">
              <div className="st-bar">
                <b>{`${items.length} laptops`}</b>
                <label className="st-filter st-sort">
                  <span>Sort</span>
                  <select value={f.sort ?? "units"} onChange={(e) => set("sort", e.target.value as StoreFilters["sort"])}>
                    {SORTS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="st-grid">
                {items.map((x) => (
                  <Card key={x.id} item={x} company={company} onOpen={() => go(x.id)} />
                ))}
              </div>
            </section>
          </div>
        )}
        <footer className="st-foot">{STORE[era].name}</footer>
      </div>
    </div>
  );
}
