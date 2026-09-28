import { useMemo } from "react";
import type { SavedModel } from "../../../preload/store";
import { type CampaignState, type ContestLaptop, contestOf, type Quarter, type WorldMarket } from "../engine/campaign";
import { HEADLINE_STATS, type HeadlineStat } from "../engine/market/types";
import { usd } from "../foundry/Release";
import { countShort, makerName, STAT_NAME } from "./data";
import { Score } from "./QuarterTab";

// The Market screen's Rivals tab: a model's chips, the rivals it competes with
// most by units won, and a stat matrix of the lot, each stat an index on the
// market's par of 100, with how much the model's buyers weight it.

/** The index a bar fills at. */
const BAR_TOP = 160;

function Pips({ weight }: { weight: number }) {
  const lit = Math.round(weight * 5);
  return (
    <span className="mr-pips">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={i < lit ? "on" : undefined} />
      ))}
    </span>
  );
}

/** One laptop's stat in the matrix: its index over a bar ticked at par, or its price. */
function StatCell({ l, k, tone, cheapest }: { l: ContestLaptop; k: HeadlineStat; tone?: string; cheapest: number }) {
  const cls = ["mr-cell", l.own ? "own" : "", tone ?? ""].filter(Boolean).join(" ");
  if (k === "price")
    return (
      <div className={cls}>
        <b>{usd(l.price)}</b>
        <i className="mr-bar">
          <i style={{ width: `${l.price > 0 ? (cheapest / l.price) * 100 : 0}%` }} />
        </i>
      </div>
    );
  const v = l.index?.[k];
  return (
    <div className={cls}>
      <b>{v === undefined ? "" : Math.round(v)}</b>
      <i className="mr-bar">
        <i style={{ width: `${v === undefined ? 0 : Math.min(100, (v / BAR_TOP) * 100)}%` }} />
        <u style={{ left: `${(100 / BAR_TOP) * 100}%` }} />
      </i>
    </div>
  );
}

export function RivalsTab({
  campaign,
  market,
  quarter,
  models,
  model,
  company,
}: {
  campaign: CampaignState;
  market: WorldMarket;
  quarter: Quarter;
  models: SavedModel[];
  /** The picked model's id, or "" when the player has none. */
  model: string;
  company: string;
}) {
  const c = useMemo(() => contestOf(campaign, market, model || null, quarter), [campaign, market, model, quarter]);
  const list = c.laptops;
  const cols = c.model ? [c.model, ...list.filter((l) => l.id !== c.model?.id)] : list;
  const mostWon = Math.max(1, ...list.map((l) => l.won));
  const cheapest = Math.min(...cols.map((l) => (l.price > 0 ? l.price : Number.POSITIVE_INFINITY)));
  const scores = cols.map((l) => Math.round(l.score ?? Number.NEGATIVE_INFINITY));
  const topScore = Math.max(...scores) > Math.min(...scores) ? Math.max(...scores) : null;
  const hasModel = !!c.model && models.length > 0;
  // Per stat, the best laptop and whether the player's is the worst.
  const toneOf = (k: HeadlineStat, l: ContestLaptop): string | undefined => {
    const val = (x: ContestLaptop) => (k === "price" ? -x.price : (x.index?.[k] ?? Number.NEGATIVE_INFINITY));
    const vals = cols.map(val);
    const v = val(l);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    // A row where every laptop stands level has no best and no worst.
    if (hi === lo) return undefined;
    if (v === hi) return "best";
    if (l.own && v === lo) return "short";
    return undefined;
  };
  return (
    <div className="mr">
      <section className="mr-list">
        <div className={`mr-row mr-head${hasModel ? "" : " no-overlap"}`}>
          <span />
          <span />
          <span>Price</span>
          <span>Score</span>
          {hasModel && <span>Overlap</span>}
          <span>Won</span>
        </div>
        {list.map((l, i) => (
          <div key={l.id} className={`mr-row${l.own ? " own" : ""}${hasModel ? "" : " no-overlap"}`}>
            <em className={l.own && i === 0 ? "up" : undefined}>{i + 1}</em>
            <span>
              <small>{makerName(l.maker, company)}</small>
              <b>{l.name}</b>
            </span>
            <strong>{usd(l.price)}</strong>
            <Score score={l.review} />
            {hasModel && <u>{l.overlap === null ? "" : `${Math.round(l.overlap * 100)}%`}</u>}
            <div className="mr-won">
              <b>{countShort(l.won)}</b>
              <i>
                <i style={{ width: `${(l.won / mostWon) * 100}%` }} />
              </i>
            </div>
          </div>
        ))}
      </section>
      <section className="mr-matrix" style={{ gridTemplateColumns: `calc(118 * var(--u)) calc(46 * var(--u)) repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span />
        <span />
        {cols.map((l) => (
          <div key={l.id} className={`mr-name${l.own ? " own" : ""}`}>
            <small>{makerName(l.maker, company)}</small>
            <b>{l.name}</b>
          </div>
        ))}
        {HEADLINE_STATS.map((k) => (
          <div key={k} className="mr-line">
            <span className={c.weights[k] >= 0.5 ? "mr-label strong" : "mr-label"}>{STAT_NAME[k]}</span>
            <Pips weight={c.weights[k]} />
            {cols.map((l) => (
              <StatCell key={l.id} l={l} k={k} tone={toneOf(k, l)} cheapest={cheapest} />
            ))}
          </div>
        ))}
        <div className="mr-line mr-total">
          <span className="mr-label strong">Score</span>
          <span />
          {cols.map((l) => (
            <b key={l.id} className={`mr-cell${l.own ? " own" : ""}${l.score !== null && Math.round(l.score) === topScore ? " best" : ""}`}>
              {l.score === null ? "" : Math.round(l.score)}
            </b>
          ))}
        </div>
      </section>
    </div>
  );
}
