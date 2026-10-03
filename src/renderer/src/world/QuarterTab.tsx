import { useMemo } from "react";
import { AWARD_NAMES, type CampaignState, type Quarter, quarterSummary, type WorldMarket } from "../engine/campaign";
import { pct } from "../foundry/Finance";
import { usd } from "../foundry/Release";
import { Short } from "../ui/Short";
import { makerName, ordinal } from "./data";

// The Market screen's Quarter tab: how the company did in the quarter, then
// every maker's share, the quarter's launches and its best sellers, with the
// year's awards under them in a Q4.

/** A share movement in points, as an arrow and a figure; nothing when it did not move. */
export function Move({ change }: { change: number | null }) {
  if (change === null || Math.abs(change) < 0.05) return null;
  const up = change > 0;
  return (
    <em className={`mq-move ${up ? "up" : "short"}`}>
      <i className={up ? "tri-up" : "tri-down"} />
      {Math.abs(change).toFixed(1)}
    </em>
  );
}

/** A review score in its cell: accent from 85, warning under 75, blank before publication. */
export function Score({ score }: { score: number | null }) {
  if (score === null) return <b className="mq-score none" />;
  const tone = score >= 85 ? "up" : score < 75 ? "short" : undefined;
  return <b className={`mq-score${tone ? ` ${tone}` : ""}`}>{Math.round(score)}</b>;
}

export function QuarterTab({
  campaign,
  market,
  quarter,
  company,
}: {
  campaign: CampaignState;
  market: WorldMarket;
  quarter: Quarter;
  company: string;
}) {
  const s = useMemo(() => quarterSummary(campaign, market, quarter, Number.POSITIVE_INFINITY), [campaign, market, quarter]);
  const p = s.player;
  const makers = s.makers.some((m) => m.maker === null)
    ? s.makers
    : [...s.makers, { maker: null, units: 0, share: 0, change: null }];
  const rank = makers.findIndex((m) => m.maker === null) + 1;
  const lead = Math.max(1e-9, ...makers.map((m) => m.share));
  const q4 = quarter.quarter === 4;
  const top = s.best.slice(0, q4 ? 6 : 10);
  const most = Math.max(1, top[0]?.units ?? 1);
  const behind = s.best
    .map((b, i) => ({ ...b, rank: i + 1 }))
    .filter((b) => b.own && b.rank > top.length)
    .slice(0, 3);
  const launches = [...s.launches].sort((a, b) => b.price - a.price);
  const entry = p.entry;
  return (
    <div className="mq">
      <div className="mq-hero">
        <h2>{company}</h2>
        <div>
          <span>Units</span>
          <b><Short value={p.units} /></b>
        </div>
        <div>
          <span>Revenue</span>
          <b>{entry ? <Short value={entry.revenue} money /> : "$0"}</b>
        </div>
        <div>
          <span>Profit</span>
          <b className={entry && entry.profit < 0 ? "short" : "up"}>{entry ? <Short value={entry.profit} money /> : "$0"}</b>
        </div>
        <div>
          <span>Share</span>
          <b>
            {pct(p.share)}
            <Move change={p.change} />
          </b>
        </div>
        <div>
          <span>Rank</span>
          <b>{ordinal(rank)}</b>
        </div>
        <div className="mq-market">
          <span>Market</span>
          <b><Short value={s.total} /></b>
        </div>
      </div>
      <div className="mq-cols">
        <section>
          <header className="mq-head">
            <span>Share</span>
          </header>
          <div className="mq-share">
            {makers.map((m) => (
              <div key={m.maker ?? "own"} className={m.maker === null ? "mine" : undefined}>
                <span>{makerName(m.maker, company)}</span>
                <i>
                  <i style={{ width: `${(m.share / lead) * 100}%` }} />
                </i>
                <b>{pct(m.share)}</b>
                <Move change={m.change} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <header className="mq-head">
            <span>Launches</span>
            <b>{launches.length}</b>
          </header>
          <div className="mq-launches">
            {launches.map((l) => (
              <div key={l.id} className={l.own ? "mine" : undefined}>
                <span>
                  <small>{makerName(l.maker, company)}</small>
                  <b>{l.name}</b>
                </span>
                <em>{usd(l.price)}</em>
                <Score score={l.review} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <header className="mq-head">
            <span>Best sellers</span>
          </header>
          <div className="mq-best">
            {top.map((b, i) => (
              <div key={b.id} className={b.own ? "mine" : undefined}>
                <em>{i + 1}</em>
                <span>
                  <small>{makerName(b.maker, company)}</small>
                  {b.name}
                </span>
                <b><Short value={b.units} /></b>
                <i>
                  <i style={{ width: `${(b.units / most) * 100}%` }} />
                </i>
              </div>
            ))}
          </div>
          {behind.length > 0 && (
            <div className="mq-best mq-behind">
              {behind.map((b) => (
                <div key={b.id} className="mine">
                  <em>{b.rank}</em>
                  <span>{b.name}</span>
                  <b><Short value={b.units} /></b>
                </div>
              ))}
            </div>
          )}
          {q4 && s.awards.length > 0 && (
            <>
              <header className="mq-head mq-awards-head">
                <span>Awards</span>
                <b>{quarter.year}</b>
              </header>
              <div className="mq-awards">
                {s.awards.map((a) => (
                  <div key={a.award} className={a.maker === null ? "mine" : undefined}>
                    <span>{AWARD_NAMES[a.award]}</span>
                    <b>{`${makerName(a.maker, company)} ${a.name}`}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
