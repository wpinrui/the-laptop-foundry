import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import type { SavedModel } from "../../../preload/store";
import {
  type CampaignState,
  type LedgerEntry,
  marketingCost,
  quarterLabel,
  STARTING_CASH,
  shareOf,
} from "../engine/campaign";
import { count, usdShort } from "./Release";
import "./campaign.css";

export { usdShort };

/** A share in a few characters: 0.042%, 1.3%. */
export function pct(share: number): string {
  if (share <= 0) return "0%";
  const p = share * 100;
  return `${p >= 1 ? p.toFixed(1) : p >= 0.1 ? p.toFixed(2) : p.toFixed(3)}%`;
}

export type StatementTab = "statement" | "sales";

const warn = (bad: boolean) => (bad ? "short" : undefined);
const key = (e: { quarter: { year: number; quarter: number } }) => `${e.quarter.year}-${e.quarter.quarter}`;

/** The ledger's cash moves that its lines do not explain, per entry; 0 where they add up. */
function gaps(campaign: CampaignState): number[] {
  const { ledger } = campaign;
  const first = ledger[0];
  const opening =
    first && first.quarter.year === campaign.start && first.quarter.quarter === 1 ? STARTING_CASH : null;
  return ledger.map((e, i) => {
    const before = i === 0 ? opening : ledger[i - 1].cash;
    if (before === null) return 0;
    const gap = e.cash - before - e.profit;
    return Math.abs(gap) >= 1 ? gap : 0;
  });
}

type Line = { label: string; short: string; of: (e: LedgerEntry) => number; cost?: boolean };

/** Every line of a quarter's books, in statement order. */
const LINES: Line[] = [
  { label: "Revenue", short: "Revenue", of: (e) => e.revenue },
  { label: "Retailers", short: "Retailers", of: (e) => e.retail, cost: true },
  { label: "Design and tooling", short: "Setup", of: (e) => e.setup, cost: true },
  { label: "Production", short: "Production", of: (e) => e.production, cost: true },
  { label: "Marketing", short: "Marketing", of: (e) => e.marketing, cost: true },
  { label: "Overhead", short: "Overhead", of: (e) => e.overhead, cost: true },
  { label: "Holding", short: "Holding", of: (e) => e.holding, cost: true },
];

// The Books tab: the last quarter's lines as bars, its profit, then every
// quarter's revenue, profit, cash, units and share.
export function BooksTab({ campaign, onOpen }: { campaign: CampaignState; onOpen: (tab: StatementTab) => void }) {
  const { ledger } = campaign;
  const last = ledger[ledger.length - 1];
  const gap = gaps(campaign);
  const lastGap = gap[gap.length - 1] ?? 0;
  const sales = new Map(campaign.sales.map((r) => [key(r), r]));
  const top = last ? Math.max(1, ...LINES.map((l) => l.of(last))) : 1;
  return (
    <>
      <div className="cr-links">
        <button type="button" className="fd-text" onClick={() => onOpen("statement")}>
          Statement
        </button>
        <button type="button" className="fd-text" onClick={() => onOpen("sales")}>
          Sales
        </button>
      </div>
      {last && (
        <>
          <span className="cr-label">{quarterLabel(last.quarter)}</span>
          <div className="cr-bars">
            {LINES.map((l) => {
              const v = l.of(last);
              return (
                <div key={l.label} className={l.cost ? "cost" : undefined}>
                  <span>{l.short}</span>
                  <span className="bar">
                    <i style={{ width: `${(v / top) * 100}%` }} />
                  </span>
                  <b>{l.cost ? (v ? usdShort(-v) : "$0") : `+${usdShort(v)}`}</b>
                </div>
              );
            })}
            {lastGap !== 0 && (
              <div className="cost">
                <span className="short">Unexplained</span>
                <span />
                <b className="short">{usdShort(lastGap)}</b>
              </div>
            )}
            <div className="profit">
              <b>Profit</b>
              <span />
              <b className={warn(last.profit < 0)}>{usdShort(last.profit)}</b>
            </div>
          </div>
          <div className="cr-rule" />
          <div className="cr-history">
            <span />
            <span>Revenue</span>
            <span>Profit</span>
            <span>Cash</span>
            <span>Units</span>
            <span>Share</span>
            {[...ledger].reverse().map((e) => {
              const r = sales.get(key(e));
              return (
                <Fragment key={key(e)}>
                  <span className="q">{quarterLabel(e.quarter)}</span>
                  <b>{usdShort(e.revenue)}</b>
                  <b className={warn(e.profit < 0)}>{usdShort(e.profit)}</b>
                  <b className={warn(e.cash < 0)}>{usdShort(e.cash)}</b>
                  <b>{r ? count(Object.values(r.units).reduce((a, b) => a + b, 0)) : ""}</b>
                  <b>{r ? pct(shareOf(r)) : ""}</b>
                </Fragment>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** A scroll box that starts at its right end, where the latest quarter is. */
function useScrolledRight() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, []);
  return ref;
}

function Statement({ campaign }: { campaign: CampaignState }) {
  const { ledger, spent } = campaign;
  const gap = gaps(campaign);
  const anyGap = gap.some((g) => g !== 0);
  const open = !campaign.over;
  // The quarter being played: what is paid so far, and the campaigns due at its end.
  const nowCell = (l: Line): number => {
    if (l.label === "Production") return spent.production;
    if (l.label === "Design and tooling") return spent.setup;
    if (l.label === "Marketing") return spent.marketing + marketingCost(campaign.brand, campaign.now.year);
    return 0;
  };
  const total = (l: Line) => ledger.reduce((s, e) => s + l.of(e), 0);
  const profit = ledger.reduce((s, e) => s + e.profit, 0);
  const scroller = useScrolledRight();
  const cell = (v: number, cost?: boolean) => (v === 0 ? "" : usdShort(cost ? -v : v));
  return (
    <div className="fd-books-scroll" ref={scroller}>
      <table className="fd-books-table">
        <thead>
          <tr>
            <th />
            {ledger.map((e) => (
              <th key={key(e)}>{quarterLabel(e.quarter)}</th>
            ))}
            {open && <th className="now">{quarterLabel(campaign.now)}</th>}
            <th className="sum">Total</th>
          </tr>
        </thead>
        <tbody>
          {LINES.map((l) => (
            <tr key={l.label}>
              <th>{l.label}</th>
              {ledger.map((e) => (
                <td key={key(e)}>{cell(l.of(e), l.cost)}</td>
              ))}
              {open && <td className="now">{cell(nowCell(l), l.cost)}</td>}
              <td className="sum">{usdShort(l.cost ? -total(l) : total(l))}</td>
            </tr>
          ))}
          <tr className="strong">
            <th>Profit</th>
            {ledger.map((e) => (
              <td key={key(e)} className={warn(e.profit < 0)}>
                {usdShort(e.profit)}
              </td>
            ))}
            {open && <td className="now" />}
            <td className={`sum${profit < 0 ? " short" : ""}`}>{usdShort(profit)}</td>
          </tr>
          {anyGap && (
            <tr>
              <th className="short">Unexplained</th>
              {gap.map((g, i) => (
                <td key={key(ledger[i])} className="short">
                  {g === 0 ? "" : usdShort(g)}
                </td>
              ))}
              {open && <td className="now" />}
              <td className="sum short">{usdShort(gap.reduce((a, b) => a + b, 0))}</td>
            </tr>
          )}
          <tr className="strong">
            <th>Cash</th>
            {ledger.map((e) => (
              <td key={key(e)} className={warn(e.cash < 0)}>
                {usdShort(e.cash)}
              </td>
            ))}
            {open && <td className={`now${campaign.cash < 0 ? " short" : ""}`}>{usdShort(campaign.cash)}</td>}
            <td className="sum" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SalesTable({ campaign, models }: { campaign: CampaignState; models: SavedModel[] }) {
  const rows = campaign.sales;
  const ids = [...new Set(rows.flatMap((r) => Object.keys(r.units)))];
  const scroller = useScrolledRight();
  const name = (id: string) => models.find((m) => m.id === id)?.name ?? "";
  const price = (id: string) => campaign.releases[id]?.price ?? 0;
  const q = (r: (typeof rows)[number]) => quarterLabel(r.quarter);
  return (
    <div className="fd-books-scroll" ref={scroller}>
      <table className="fd-books-table">
        <thead>
          <tr>
            <th />
            {rows.map((r) => (
              <th key={q(r)}>{q(r)}</th>
            ))}
            <th className="sum">Stock</th>
          </tr>
        </thead>
        {ids.map((id) => {
          const lost = rows.some((r) => (r.demand[id] ?? 0) > (r.units[id] ?? 0));
          const stock = campaign.releases[id]?.stock;
          return (
            <tbody key={id}>
              <tr className="group">
                <th>{name(id)}</th>
                {rows.map((r) => (
                  <td key={q(r)} />
                ))}
                <td className={`sum${stock === 0 ? " short" : ""}`}>{stock === undefined ? "" : count(stock)}</td>
              </tr>
              <tr>
                <th>Sold</th>
                {rows.map((r) => (
                  <td key={q(r)}>{r.units[id] === undefined ? "" : count(r.units[id])}</td>
                ))}
                <td className="sum" />
              </tr>
              <tr>
                <th>Wanted</th>
                {rows.map((r) => {
                  const d = r.demand[id];
                  return (
                    <td key={q(r)} className={warn(d !== undefined && d > (r.units[id] ?? 0))}>
                      {d === undefined ? "" : count(d)}
                    </td>
                  );
                })}
                <td className="sum" />
              </tr>
              {lost && (
                <tr>
                  <th>Lost</th>
                  {rows.map((r) => {
                    const l = (r.demand[id] ?? 0) - (r.units[id] ?? 0);
                    return (
                      <td key={q(r)} className="short">
                        {l > 0 ? count(l) : ""}
                      </td>
                    );
                  })}
                  <td className="sum" />
                </tr>
              )}
              <tr>
                <th>Revenue</th>
                {rows.map((r) => (
                  <td key={q(r)}>{r.units[id] ? usdShort(r.units[id] * price(id)) : ""}</td>
                ))}
                <td className="sum" />
              </tr>
            </tbody>
          );
        })}
        <tbody>
          <tr className="group">
            <th>Market</th>
            {rows.map((r) => (
              <td key={q(r)} />
            ))}
            <td className="sum" />
          </tr>
          <tr>
            <th>Units</th>
            {rows.map((r) => (
              <td key={q(r)}>{count(Object.values(r.units).reduce((a, b) => a + b, 0))}</td>
            ))}
            <td className="sum" />
          </tr>
          <tr>
            <th>Share</th>
            {rows.map((r) => (
              <td key={q(r)}>{pct(shareOf(r))}</td>
            ))}
            <td className="sum" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// The books in their own view between the rails: the statement for every
// quarter so far, or sales against demand per model.
export function StatementView({
  campaign,
  models,
  tab,
  onTab,
  onClose,
}: {
  campaign: CampaignState;
  models: SavedModel[];
  tab: StatementTab;
  onTab: (tab: StatementTab) => void;
  onClose: () => void;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Escape closes the view before it reaches the laptop list.
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  const tabs: [StatementTab, string][] = [
    ["statement", "Statement"],
    ["sales", "Sales"],
  ];
  return (
    <section className="fd-books fd-in">
      <header>
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`fd-text${tab === t ? " on" : ""}`}
            aria-pressed={tab === t}
            onClick={() => onTab(t)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="fd-text fd-books-close" onClick={onClose}>
          Close
        </button>
      </header>
      {tab === "statement" ? (
        <Statement key="statement" campaign={campaign} />
      ) : (
        <SalesTable key="sales" campaign={campaign} models={models} />
      )}
    </section>
  );
}
