import { useEffect, useRef } from "react";
import type { SavedModel } from "../../../preload/store";
import {
  AWARD_NAMES,
  type CampaignState,
  type LedgerEntry,
  type Quarter,
  quarterLabel,
  quarterSummary,
  type WorldMarket,
  type WorldSeller,
} from "../engine/campaign";
import { laptopName, points } from "../world/data";
import { pct } from "./Finance";
import { count, usd, usdShort } from "./Release";
import "./campaign.css";

/** What a resolved quarter showed the player. */
export interface QuarterReport {
  quarter: Quarter;
  entry: LedgerEntry;
  sales: { name: string; sold: number; demand: number }[];
  reviews: { name: string; score: number }[];
  awards: string[];
  /** The market's best seller, the player's share and its change in points. */
  best: WorldSeller | null;
  share: number;
  change: number | null;
}

const same = (a: Quarter, b: Quarter) => a.year === b.year && a.quarter === b.quarter;

/** The report on the quarter a resolved state has just settled, or null before any quarter has. */
export function reportOf(state: CampaignState, models: SavedModel[], market: WorldMarket): QuarterReport | null {
  const entry = state.ledger[state.ledger.length - 1];
  if (!entry) return null;
  const q = entry.quarter;
  const name = (id: string) => models.find((m) => m.id === id)?.name ?? "";
  const record = state.sales.find((r) => same(r.quarter, q));
  const sales = record
    ? Object.entries(record.units).map(([id, sold]) => ({ name: name(id), sold, demand: record.demand[id] ?? sold }))
    : [];
  const reviews = Object.entries(state.reviews)
    .filter(([id, r]) => same(r.quarter, q) && models.some((m) => m.id === id))
    .map(([id, r]) => ({ name: name(id), score: r.score }));
  const awards =
    q.quarter === 4
      ? state.awards.filter((a) => a.year === q.year && a.maker === null).map((a) => AWARD_NAMES[a.award])
      : [];
  const summary = quarterSummary(state, market, q, 1);
  return {
    quarter: q,
    entry,
    sales,
    reviews,
    awards,
    best: summary.best[0] ?? null,
    share: summary.player.share,
    change: summary.player.change,
  };
}

const LINES: [string, (e: LedgerEntry) => number][] = [
  ["Revenue", (e) => e.revenue],
  ["Retailers", (e) => -e.retail],
  ["Production", (e) => -e.production],
  ["Setup", (e) => -e.setup],
  ["Marketing", (e) => -e.marketing],
  ["Overhead", (e) => -e.overhead],
  ["Holding", (e) => -e.holding],
];

// The quarter report: the quarter, its profit and cash, where the money went,
// sales against demand, reviews published and awards won, then Continue.
export function ReportModal({
  report,
  company,
  onClose,
  onMarket,
}: {
  report: QuarterReport;
  company: string;
  onClose: () => void;
  onMarket?: () => void;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Escape or Enter continues, before either reaches the laptop list.
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  const { entry } = report;
  const cells = [
    ...report.sales.map((s) => (
      <div key={`s-${s.name}`}>
        <span>{s.name} sold</span>
        <b>{count(s.sold)}</b>
        {s.demand > s.sold && <em className="short">{count(s.demand)} wanted</em>}
      </div>
    )),
    ...report.reviews.map((r) => (
      <div key={`r-${r.name}`}>
        <span>{r.name} reviewed</span>
        <b className="up">{r.score.toFixed(1)}</b>
      </div>
    )),
    ...report.awards.map((a) => (
      <div key={`a-${a}`}>
        <span>Award</span>
        <b className="up award">{a}</b>
      </div>
    )),
    <div key="share">
      <span>Share</span>
      <b>{pct(report.share)}</b>
      {report.change !== null && <em className={report.change < 0 ? "short" : "up"}>{points(report.change)}</em>}
    </div>,
    ...(report.best
      ? [
          <div key="best">
            <span>Best seller</span>
            <b className={`award${report.best.own ? " up" : ""}`}>{laptopName(report.best, company)}</b>
            <em>{count(report.best.units)}</em>
          </div>,
        ]
      : []),
  ];
  return (
    <div className="qr-back">
      <div className="qr fd-in" role="dialog" aria-label={quarterLabel(report.quarter)}>
        <header>
          <b>{quarterLabel(report.quarter)}</b>
          <div>
            <span>
              <small>Profit</small>
              <b className={entry.profit < 0 ? "short" : "up"}>{usdShort(entry.profit)}</b>
            </span>
            <span>
              <small>Cash</small>
              <b className={entry.cash < 0 ? "short" : undefined}>{usd(entry.cash)}</b>
            </span>
          </div>
        </header>
        <div className="qr-lines">
          {LINES.map(([label, of]) => (
            <span key={label}>
              <small>{label}</small>
              <b>{usdShort(of(entry))}</b>
            </span>
          ))}
        </div>
        {cells.length > 0 && <div className="qr-cells">{cells}</div>}
        <footer>
          {onMarket && (
            <button type="button" className="fd-text qr-market" onClick={onMarket}>
              Market
            </button>
          )}
          <button type="button" className="fd-primary" onClick={onClose}>
            Continue
          </button>
        </footer>
      </div>
    </div>
  );
}
