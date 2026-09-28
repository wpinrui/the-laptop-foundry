import { type ReactNode, useMemo, useState } from "react";
import logo from "../assets/store/courts-logo.png";
import { colourHex } from "../engine";
import { type CampaignState, contestOf, type Quarter, type StoreItem, storeListing, type WorldMarket, yearListing } from "../engine/campaign";
import type { Rival } from "../engine/market/field";
import type { BodyClass, Budget, PerfClass } from "../engine/price";
import { factsOf, reviewOf } from "../engine/review";
import type { Era } from "../review/Charts";
import { cap, makerName } from "../world/data";
import { usePhotos } from "../viewer/Photos";
import { STORE } from "./name";
import "./store.css";

// Courts, the in-game retailer: every laptop on sale, the class matrix as
// filters, and a product page. One brand in three eras: a 2006 portal, a
// 2016 shop and a 2026 storefront. The data comes from storeListing in a
// campaign, or yearListing for a sandbox company's own year; this file only
// lays it out.

/** Where the listing comes from: a campaign's kept quarter, or a sandbox laptop's own generated year. */
export type StoreSource = { kind: "quarter"; state: CampaignState; market: WorldMarket; quarter: Quarter } | { kind: "year"; rivals: Rival[]; year: number };

type Sort = "units" | "price";

const SORTS: [Sort, string][] = [
  ["units", "Best selling"],
  ["price", "Price"],
];

const BUDGETS: Budget[] = ["low", "midrange", "premium"];
const BODIES: BodyClass[] = ["thin and light", "medium", "large"];
const PERFS: PerfClass[] = ["office", "mixed-use", "gaming"];

/** Stock under this reads as running low. */
const LOW_STOCK = 500;

interface Filters {
  budget: string[];
  body: string[];
  performance: string[];
  screen: string[];
  brand: string[];
}

const NO_FILTERS: Filters = { budget: [], body: [], performance: [], screen: [], brand: [] };

/** A laptop as the store shows it: the listing entry plus its sales rank, stock and short specs. */
interface Product extends StoreItem {
  /** Its unit rank this quarter, 1 for the best seller; null when nothing sold. */
  rank: number | null;
  /** Units in stock, or null for a rival, which is always in stock. */
  stock: number | null;
  brand: string;
  screen: string;
  specs: Spec;
}

export interface Spec {
  cpu: string;
  gpu: string;
  memory: string;
  storage: string;
  display: string;
  battery: string;
  wireless: string;
  table: [string, string][];
}

const specCache = new Map<string, Spec>();

export function specOf(item: StoreItem, company: string): Spec {
  const key = `${item.id}:${item.price}`;
  const hit = specCache.get(key);
  if (hit) return hit;
  const none: Spec = { cpu: "", gpu: "", memory: "", storage: "", display: "", battery: "", wireless: "", table: [] };
  if (!item.build) return none;
  try {
    const subject = { id: item.id, name: item.name, company: makerName(item.maker, company), build: { ...item.build, price: item.price } };
    const table = reviewOf(subject).specs.filter(([, v]) => v !== "");
    const f = factsOf(subject);
    const get = (k: string) => table.find(([x]) => x === k)?.[1] ?? "";
    const first = (s: string) => s.split(",")[0].trim();
    // "2 GB DDR2-800 SO-DIMM" to "2 GB DDR2"; "0.5 GB" to "512 MB".
    const memory = (m: string) => {
      const hit = /^([\d.]+)\s*GB\s+(\S+?)(?:-\d+)?(?:\s|$)/.exec(m);
      if (!hit) return first(m);
      const gb = Number.parseFloat(hit[1]);
      return `${gb < 1 ? `${Math.round(gb * 1024)} MB` : `${hit[1]} GB`} ${hit[2]}`;
    };
    // "100 GB 2.5 inch HDD 9.5 mm, 7200 rpm" to "100 GB HDD".
    const storage = (t: string) => {
      const size = /^([\d.]+\s*[GT]B)/.exec(t)?.[1];
      const kind = /\b(SSD|HDD|eMMC|NVMe|SATA|Flash)\b/.exec(t)?.[1];
      return size ? `${size} ${kind === "NVMe" || kind === "SATA" ? "SSD" : (kind ?? "")}`.trim() : first(t);
    };
    const s: Spec = {
      cpu: first(get("Processor")),
      gpu: first(get("Graphics")),
      memory: memory(get("Memory")),
      storage: storage(get("Storage")),
      display: f.panel ? `${f.panel.inches}" ${f.panel.res[0]}x${f.panel.res[1]}` : "",
      battery: get("Battery"),
      wireless: get("Wireless"),
      table,
    };
    specCache.set(key, s);
    return s;
  } catch {
    return none;
  }
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A product's page in the store's address. */
const pageOf = (p: Product) => slug(`${p.brand} ${p.name}`);

/** The product's studio photo once taken, the drawing until then. */
function Render({ p, era, company }: { p: Product; era: Era; company: string }) {
  const subject = useMemo(
    () => (p.build ? { id: `store:${p.id}`, name: p.name, company: makerName(p.maker, company), build: { ...p.build, price: p.price } } : null),
    [p, company],
  );
  const { photos, shoot } = usePhotos(subject);
  const hero = photos?.["studio/hero"];
  return (
    <div className="ct-shot">
      {hero ? <img src={hero} alt={`${p.brand} ${p.name}`} draggable={false} /> : <LaptopArt item={p} era={era} />}
      {shoot}
    </div>
  );
}

/** A drawing of the laptop in its own finish, the screen lit in the era's desktop colours. */
function LaptopArt({ item, era }: { item: StoreItem; era: Era }) {
  const lid = item.build ? safeHex(item.build.finish.lid.colour) : undefined;
  const deck = item.build ? safeHex(item.build.finish.deck.colour) : undefined;
  const id = `ct-scr-${era}`;
  return (
    <svg className="ct-art" viewBox="0 0 200 124" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ct-scr-a" />
          <stop offset="1" className="ct-scr-b" />
        </linearGradient>
      </defs>
      <rect x="34" y="4" width="132" height="92" rx="4" className="ct-lid" style={lid ? { fill: lid } : undefined} />
      <rect x="41" y="10" width="118" height="80" fill={`url(#${id})`} />
      <path d="M22 98 H178 L196 116 H4 Z" className="ct-deck" style={deck ? { fill: deck } : undefined} />
    </svg>
  );
}

function safeHex(c: string): string | undefined {
  try {
    return colourHex(c);
  } catch {
    return undefined;
  }
}

/** The stock line: out of stock, only N left, or in stock. */
function stockLine(p: Product): { text: string; tone: "in" | "low" | "out" } {
  if (p.stock === null) return { text: "In Stock", tone: "in" };
  if (p.stock <= 0) return { text: "Out of stock", tone: "out" };
  if (p.stock < LOW_STOCK) return { text: `Only ${p.stock.toLocaleString("en-US")} left`, tone: "low" };
  return { text: "In Stock", tone: "in" };
}

function inGroup(values: string[], v: string): boolean {
  return values.length === 0 || values.includes(v);
}

/** The listing, the filters and the product's similar laptops, from whichever source. */
function useCourts(source: StoreSource, company: string) {
  const items = useMemo((): Product[] => {
    const list = source.kind === "quarter" ? storeListing(source.state, source.market, source.quarter) : yearListing(source.rivals);
    const ranked = [...list].filter((x) => x.units > 0).sort((a, b) => b.units - a.units || a.id.localeCompare(b.id));
    return list.map((x) => {
      const r = ranked.indexOf(x);
      const own = x.own && source.kind === "quarter" ? (source.state.releases[x.id]?.stock ?? 0) : null;
      return {
        ...x,
        rank: r >= 0 ? r + 1 : null,
        stock: own,
        brand: makerName(x.maker, company),
        screen: x.inches > 0 ? `${Math.floor(x.inches)}"` : "",
        specs: specOf(x, company),
      };
    });
  }, [source, company]);
  const similar = (p: Product, n: number): Product[] => {
    if (source.kind === "quarter") {
      const c = contestOf(source.state, source.market, p.id, source.quarter, n);
      return c.laptops.filter((l) => l.id !== p.id).flatMap((l) => items.find((x) => x.id === l.id) ?? []).slice(0, n);
    }
    return items
      .filter((x) => x.id !== p.id && x.price > 0 && p.price > 0)
      .sort((a, b) => Math.abs(Math.log(a.price / p.price)) - Math.abs(Math.log(b.price / p.price)))
      .slice(0, n);
  };
  return { items, similar };
}

function filtered(items: Product[], f: Filters, sort: Sort): Product[] {
  const shown = items.filter(
    (x) =>
      inGroup(f.budget, x.budget ?? "") &&
      inGroup(f.body, x.body ?? "") &&
      inGroup(f.performance, x.performance ?? "") &&
      inGroup(f.screen, x.screen) &&
      inGroup(f.brand, x.brand),
  );
  const by: Record<Sort, (a: Product, b: Product) => number> = {
    units: (a, b) => b.units - a.units,
    price: (a, b) => a.price - b.price,
  };
  return shown.sort((a, b) => by[sort](a, b) || a.id.localeCompare(b.id));
}

type Group = { key: keyof Filters; label: string; options: [string, string][] };

function groupsOf(items: Product[]): Group[] {
  const screens = [...new Set(items.map((x) => x.screen).filter(Boolean))].sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b));
  const brands = [...new Set(items.map((x) => x.brand))].sort((a, b) => a.localeCompare(b));
  return [
    { key: "budget", label: "Budget", options: BUDGETS.map((b) => [b, cap(b)]) },
    { key: "body", label: "Body", options: BODIES.map((b) => [b, cap(b)]) },
    { key: "performance", label: "Performance", options: PERFS.map((b) => [b, cap(b)]) },
    { key: "screen", label: "Screen", options: screens.map((s) => [s, s]) },
    { key: "brand", label: "Brand", options: brands.map((b) => [b, b]) },
  ];
}

const countIn = (items: Product[], key: keyof Filters, v: string) =>
  items.filter((x) => (key === "screen" ? x.screen : key === "brand" ? x.brand : (x[key] ?? "")) === v).length;

/** The retailer's site for a campaign's quarter or a sandbox year. The product page is controlled when `page` is passed. */
export function StoreSite({
  source,
  company,
  era,
  page,
  onPage,
}: {
  source: StoreSource;
  company: string;
  era: Era;
  page?: string | null;
  onPage?: (id: string | null) => void;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const open = page === undefined ? own : page;
  const go = onPage ?? setOwn;
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>("units");
  const { items, similar } = useCourts(source, company);
  const shown = useMemo(() => filtered(items, f, sort), [items, f, sort]);
  const groups = useMemo(() => groupsOf(items), [items]);
  const product = open ? items.find((x) => x.id === open || slug(`${x.brand} ${x.name}`) === open) : undefined;
  const toggle = (key: keyof Filters, v: string) =>
    setF((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }));
  const view: ViewProps = { era, company, items, shown, groups, f, toggle, sort, setSort, go, similar };
  return (
    <div className={`ct ct-${era}`}>
      {era === 2006 ? <Page06 {...view} product={product} /> : era === 2016 ? <Page16 {...view} product={product} /> : <Page26 {...view} product={product} />}
    </div>
  );
}

interface ViewProps {
  era: Era;
  company: string;
  items: Product[];
  shown: Product[];
  groups: Group[];
  f: Filters;
  toggle: (key: keyof Filters, v: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  go: (id: string | null) => void;
  similar: (p: Product, n: number) => Product[];
}

const Logo = ({ onHome }: { onHome: () => void }) => (
  <button type="button" className="ct-logo" onClick={onHome}>
    <img src={logo} alt={STORE[2026].name} draggable={false} />
  </button>
);

function Badge({ p, era }: { p: Product; era: Era }) {
  if (p.rank !== null && p.rank <= 3) return <i className="ct-badge best">{`#${p.rank} Best Seller`}</i>;
  if (p.isNew) return <i className="ct-badge new">New</i>;
  return era === 2006 ? null : <i className="ct-badge none" />;
}

/** Specs as a product page lists them. */
function bullets(p: Product): string[] {
  const s = p.specs;
  return [
    s.cpu && `${s.cpu} processor`,
    s.display && `${s.display} display`,
    s.memory && `${s.memory} memory`,
    s.storage && `${s.storage} storage`,
    s.gpu && `${s.gpu} graphics`,
    s.battery && `${s.battery} battery`,
    p.kg !== null && `${p.kg.toFixed(1)} kg`,
  ].filter((x): x is string => !!x);
}

function details(p: Product): [string, string][] {
  return [
    ...p.specs.table,
    ...(p.kg !== null ? ([["Weight", `${p.kg.toFixed(2)} kg`]] as [string, string][]) : []),
    ...(p.rank !== null ? ([["Sales Rank", `#${p.rank} in Laptops`]] as [string, string][]) : []),
  ];
}

// ------------------------------------------------------------------ 2006

function Chrome06({ go, children }: { go: (id: string | null) => void; children: ReactNode }) {
  return (
    <div className="ct-page">
      <header className="ct-head">
        <Logo onHome={() => go(null)} />
        <nav className="ct-links">
          <u>Your Account</u>
          <u>Cart</u>
          <u>Help</u>
        </nav>
      </header>
      <nav className="ct-store-tabs">
        {["Books", "Music", "DVD", "Electronics", "Computers", "Toys", "Home and Garden"].map((t) => (
          <span key={t} className={t === "Computers" ? "on" : undefined}>
            {t}
          </span>
        ))}
      </nav>
      <nav className="ct-dept">
        {["Laptops", "Desktops", "Monitors", "Printers", "Software", "Accessories"].map((t) => (
          <button key={t} type="button" className={t === "Laptops" ? "on" : undefined} onClick={t === "Laptops" ? () => go(null) : undefined}>
            {t}
          </button>
        ))}
      </nav>
      <div className="ct-search">
        <b>Search</b>
        <span className="ct-select">Computers</span>
        <span className="ct-input" />
        <span className="ct-go">GO</span>
      </div>
      {children}
    </div>
  );
}

function Page06(v: ViewProps & { product?: Product }) {
  const { product: p, go } = v;
  if (p) {
    const st = stockLine(p);
    return (
      <Chrome06 go={go}>
        <div className="ct-product">
          <Render p={p} era={v.era} company={v.company} />
          <div className="ct-about">
            <h1>{`${p.brand} ${p.name}`}</h1>
            <u className="ct-by">{p.brand}</u>
            <div className="ct-price-line">
              <span>Price</span>
              <b className="ct-price">{money(p.price)}</b>
            </div>
            <b className={`ct-stock ${st.tone}`}>{st.text}</b>
            <ul>
              {bullets(p).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="ct-buy">
            <span className="ct-qty">
              Quantity <span className="ct-select">1</span>
            </span>
            <span className={`ct-cart${p.stock === 0 ? " off" : ""}`}>Add to Shopping Cart</span>
            <span className="ct-wish">Add to Wish List</span>
          </div>
        </div>
        <Also p={p} v={v} title="Customers also bought" />
        <Details p={p} />
      </Chrome06>
    );
  }
  return (
    <Chrome06 go={go}>
      <div className="ct-shop">
        <Filters06 v={v} />
        <section className="ct-list">
          <ListHead v={v} />
          {v.shown.map((x) => {
            const st = stockLine(x);
            return (
              <div key={x.id} className="ct-row">
                <button type="button" className="ct-shot" onClick={() => go(pageOf(x))}>
                  <LaptopArt item={x} era={v.era} />
                </button>
                <div className="ct-row-main">
                  <Badge p={x} era={v.era} />
                  <button type="button" className="ct-title" onClick={() => go(pageOf(x))}>
                    {`${x.brand} ${x.name}`}
                  </button>
                  <span>{x.specs.cpu}</span>
                  <span>{x.specs.display}</span>
                  <span>{[x.specs.memory, x.specs.storage].filter(Boolean).join("   ")}</span>
                </div>
                <div className="ct-row-buy">
                  <b className="ct-price">{money(x.price)}</b>
                  <b className={`ct-stock ${st.tone}`}>{st.text}</b>
                  <span className="ct-ship">Free Shipping</span>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </Chrome06>
  );
}

function Filters06({ v }: { v: ViewProps }) {
  return (
    <aside className="ct-side">
      {v.groups.map((g) => (
        <div key={g.key} className="ct-group">
          <b>{g.label}</b>
          {g.options.map(([val, label]) => (
            <button key={val} type="button" className={v.f[g.key].includes(val) ? "on" : undefined} onClick={() => v.toggle(g.key, val)}>
              <u>{label}</u>
              <small>{`(${countIn(v.items, g.key, val)})`}</small>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

function ListHead({ v }: { v: ViewProps }) {
  return (
    <div className="ct-list-head">
      <h1>Laptops</h1>
      <span className="ct-count">{v.era === 2026 ? v.shown.length : `${v.shown.length} results`}</span>
      {v.era === 2006 && (
        <span className="ct-sort">
          Sort by
          {SORTS.map(([s, label]) => (
            <button key={s} type="button" className={v.sort === s ? "on" : undefined} onClick={() => v.setSort(s)}>
              {label}
            </button>
          ))}
        </span>
      )}
      {v.era === 2016 && (
        <button
          type="button"
          className="ct-sort"
          onClick={() => v.setSort(SORTS[(SORTS.findIndex(([s]) => s === v.sort) + 1) % SORTS.length][0])}
        >
          Sort by <b>{SORTS.find(([s]) => s === v.sort)?.[1]}</b>
          <i className="ct-caret" />
        </button>
      )}
      {v.era === 2026 && (
        <span className="ct-sort">
          {SORTS.map(([s, label]) => (
            <button key={s} type="button" className={v.sort === s ? "on" : undefined} onClick={() => v.setSort(s)}>
              {label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function Also({ p, v, title }: { p: Product; v: ViewProps; title: string }) {
  const also = v.similar(p, v.era === 2016 ? 5 : 4);
  if (also.length === 0) return null;
  return (
    <section className="ct-also">
      <h2>{title}</h2>
      <div>
        {also.map((x) => (
          <div key={x.id} className="ct-also-item">
            <button type="button" className="ct-shot" onClick={() => v.go(pageOf(x))}>
              <LaptopArt item={x} era={v.era} />
            </button>
            <button type="button" className="ct-title" onClick={() => v.go(pageOf(x))}>
              {`${x.brand} ${x.name}`}
            </button>
            <b className="ct-price">{v.era === 2006 ? money(x.price) : dollars(x.price)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function Details({ p }: { p: Product }) {
  const rows = details(p);
  if (rows.length === 0) return null;
  return (
    <section className="ct-details">
      <h2>Product Details</h2>
      <table>
        <tbody>
          {rows.map(([k, val]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ------------------------------------------------------------------ 2016

function Chrome16({ go, children }: { go: (id: string | null) => void; children: ReactNode }) {
  return (
    <div className="ct-page">
      <header className="ct-head">
        <Logo onHome={() => go(null)} />
        <span className="ct-searchbar">
          <span className="ct-select">Computers</span>
          <span className="ct-input" />
          <span className="ct-go">
            <i className="ct-lens" />
          </span>
        </span>
        <nav className="ct-links">
          <u>Account</u>
          <u>Orders</u>
          <u>Cart</u>
        </nav>
      </header>
      <nav className="ct-dept">
        {["Departments", "Deals", "Laptops", "Tablets", "Monitors", "Gaming"].map((t) => (
          <button key={t} type="button" className={t === "Laptops" ? "on" : t === "Departments" ? "first" : undefined} onClick={t === "Laptops" ? () => go(null) : undefined}>
            {t}
          </button>
        ))}
      </nav>
      {children}
    </div>
  );
}

function Price16({ price }: { price: number }) {
  const whole = Math.floor(price);
  const cents = Math.round((price - whole) * 100);
  return (
    <span className="ct-price16">
      <sup>$</sup>
      {whole.toLocaleString("en-US")}
      <sup>{String(cents).padStart(2, "0")}</sup>
    </span>
  );
}

function Page16(v: ViewProps & { product?: Product }) {
  const { product: p, go } = v;
  if (p) {
    const st = stockLine(p);
    return (
      <Chrome16 go={go}>
        <div className="ct-product">
          <Render p={p} era={v.era} company={v.company} />
          <div className="ct-about">
            <h1>{`${p.brand} ${p.name}`}</h1>
            <u className="ct-by">{p.brand}</u>
            {p.rank !== null && p.rank <= 3 && <i className="ct-rank">{`#${p.rank} Best Seller in Laptops`}</i>}
            <div className="ct-price-line">
              <span>Price</span>
              <b className="ct-price">{money(p.price)}</b>
            </div>
            <h3>About this item</h3>
            <ul>
              {bullets(p).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="ct-buy">
            <b className="ct-price">{money(p.price)}</b>
            <span className="ct-ship">FREE Shipping</span>
            <b className={`ct-stock ${st.tone}`}>{st.text}</b>
            <span className="ct-select">Qty 1</span>
            <span className={`ct-cart${p.stock === 0 ? " off" : ""}`}>Add to Cart</span>
            <span className={`ct-now${p.stock === 0 ? " off" : ""}`}>Buy Now</span>
          </div>
        </div>
        <Also p={p} v={v} title="Customers also bought" />
        <Details p={p} />
      </Chrome16>
    );
  }
  return (
    <Chrome16 go={go}>
      <div className="ct-shop">
        <aside className="ct-side">
          {v.groups.map((g) => (
            <div key={g.key} className="ct-group">
              <b>{g.label}</b>
              {g.options.map(([val, label]) => (
                <label key={val} className="ct-check">
                  <input type="checkbox" checked={v.f[g.key].includes(val)} onChange={() => v.toggle(g.key, val)} />
                  <span>{label}</span>
                  <small>{countIn(v.items, g.key, val)}</small>
                </label>
              ))}
            </div>
          ))}
        </aside>
        <section className="ct-list">
          <ListHead v={v} />
          <div className="ct-grid">
            {v.shown.map((x) => {
              const st = stockLine(x);
              return (
                <button key={x.id} type="button" className="ct-card" onClick={() => go(pageOf(x))}>
                  <Badge p={x} era={v.era} />
                  <span className="ct-shot">
                    <LaptopArt item={x} era={v.era} />
                  </span>
                  <span className="ct-title">{`${x.brand} ${x.name}`}</span>
                  <Price16 price={x.price} />
                  <span className={`ct-stock ${st.tone}`}>{st.tone === "in" ? "FREE Shipping" : st.text}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Chrome16>
  );
}

// ------------------------------------------------------------------ 2026

function Chrome26({ go, children }: { go: (id: string | null) => void; children: ReactNode }) {
  return (
    <div className="ct-page">
      <header className="ct-head">
        <Logo onHome={() => go(null)} />
        <span className="ct-searchbar">
          <span className="ct-go">
            <i className="ct-lens" />
          </span>
        </span>
        <span className="ct-icons">
          <i className="ct-user" />
          <i className="ct-bag" />
        </span>
      </header>
      <nav className="ct-dept">
        {["Deals", "Laptops", "Phones", "Tablets", "Monitors", "Gaming", "Audio"].map((t) => (
          <button key={t} type="button" className={t === "Laptops" ? "on" : undefined} onClick={t === "Laptops" ? () => go(null) : undefined}>
            {t}
          </button>
        ))}
      </nav>
      <div className="ct-body">{children}</div>
    </div>
  );
}

function Page26(v: ViewProps & { product?: Product }) {
  const { product: p, go } = v;
  if (p) {
    const st = stockLine(p);
    const cards: [string, string][] = [
      ["Processor", p.specs.cpu],
      ["Graphics", p.specs.gpu],
      ["Memory", p.specs.memory],
      ["Storage", p.specs.storage],
      ["Display", p.specs.display],
      ["Battery", p.specs.battery],
      ["Weight", p.kg === null ? "" : `${p.kg.toFixed(2)} kg`],
      ["Wireless", p.specs.wireless],
    ];
    const compare = [p, ...v.similar(p, 3)];
    return (
      <Chrome26 go={go}>
        <div className="ct-product">
          <Render p={p} era={v.era} company={v.company} />
          <div className="ct-about">
            <u className="ct-by">{p.brand}</u>
            <h1>{p.name}</h1>
            {p.rank !== null && p.rank <= 3 && <i className="ct-rank">{`#${p.rank} Best Seller in Laptops`}</i>}
            <div className="ct-cards">
              {cards
                .filter(([, val]) => val)
                .map(([k, val]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <b>{val}</b>
                  </div>
                ))}
            </div>
          </div>
          <div className="ct-buy">
            <b className="ct-price">{dollars(p.price)}</b>
            <span className="ct-ship">Free delivery tomorrow</span>
            <b className={`ct-stock ${st.tone}`}>{st.tone === "in" ? "In stock" : st.text}</b>
            <span className="ct-qty">
              <i>-</i>1<i>+</i>
            </span>
            <span className={`ct-cart${p.stock === 0 ? " off" : ""}`}>Add to cart</span>
            <span className={`ct-now${p.stock === 0 ? " off" : ""}`}>Buy now</span>
          </div>
        </div>
        {compare.length > 1 && (
          <section className="ct-compare">
            <h2>Compare similar</h2>
            <table>
              <thead>
                <tr>
                  <th />
                  {compare.map((x) => (
                    <th key={x.id} className={x.id === p.id ? "this" : undefined}>
                      <button type="button" onClick={() => go(pageOf(x))}>
                        <LaptopArt item={x} era={v.era} />
                        <small>{x.brand}</small>
                        <b>{x.name}</b>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Price", (x: Product) => dollars(x.price)],
                    ["Processor", (x: Product) => x.specs.cpu],
                    ["Display", (x: Product) => x.specs.display],
                    ["Memory", (x: Product) => x.specs.memory],
                    ["Storage", (x: Product) => x.specs.storage],
                    ["Weight", (x: Product) => (x.kg === null ? "" : `${x.kg.toFixed(2)} kg`)],
                  ] as [string, (x: Product) => string][]
                ).map(([k, of]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    {compare.map((x) => (
                      <td key={x.id} className={x.id === p.id ? "this" : undefined}>
                        {of(x)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </Chrome26>
    );
  }
  return (
    <Chrome26 go={go}>
      <ListHead v={v} />
      <div className="ct-shop">
        <aside className="ct-side">
          {v.groups.map((g) => (
            <div key={g.key} className="ct-group">
              <b>{g.label}</b>
              <div>
                {g.options.map(([val, label]) => (
                  <button key={val} type="button" className={v.f[g.key].includes(val) ? "on" : undefined} onClick={() => v.toggle(g.key, val)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
        <section className="ct-grid">
          {v.shown.map((x) => {
            const st = stockLine(x);
            return (
              <button key={x.id} type="button" className="ct-card" onClick={() => go(pageOf(x))}>
                <span className="ct-shot">
                  <Badge p={x} era={v.era} />
                  <LaptopArt item={x} era={v.era} />
                </span>
                <small>{x.brand}</small>
                <span className="ct-title">{x.name}</span>
                <b className="ct-price">{dollars(x.price)}</b>
                <span className={`ct-stock ${st.tone}`}>{st.tone === "in" ? "Free delivery tomorrow" : st.text}</span>
              </button>
            );
          })}
        </section>
      </div>
    </Chrome26>
  );
}

/** The store's address for a page, as the browser shows it. */
export function storeUrl(era: Era, page: string | null): string {
  return `${STORE[era].domain}/laptops${page ? `/${page}` : ""}`;
}
