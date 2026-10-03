import type { CSSProperties } from "react";
import { useMemo } from "react";
import { type CampaignState, type Quarter, segmentsOf } from "../engine/campaign";
import { pct } from "../foundry/Finance";
import { countShort, segmentName, STAT_NAME } from "./data";

// The Market screen's Buyers tab: every segment in the quarter, most buyers
// first: what it wants, how many bought, the share the company won, each of
// the company's models as a heat block, and the company's reach and rep there.

/** Won from this share up reads as a strong position. */
const STRONG = 0.15;

export function BuyersTab({ campaign, quarter, hidden }: { campaign: CampaignState; quarter: Quarter; hidden: Set<string> }) {
  const { rows, models } = useMemo(() => segmentsOf(campaign, quarter, hidden), [campaign, quarter, hidden]);
  const hottest = Math.max(1, ...rows.flatMap((r) => Object.values(r.models)));
  const grid: CSSProperties = {
    gridTemplateColumns: [
      "calc(150 * var(--u))",
      "calc(240 * var(--u))",
      "calc(70 * var(--u))",
      "calc(170 * var(--u))",
      ...models.map(() => "minmax(0, calc(72 * var(--u)))"),
      "minmax(0, 1fr)",
      "calc(140 * var(--u))",
      "calc(46 * var(--u))",
    ].join(" "),
  };
  return (
    <div className="mb">
      <div className="mb-row mb-head" style={grid}>
        <span />
        <span>Wants</span>
        <span className="num">Buyers</span>
        <span>Won</span>
        {models.map((m) => (
          <span key={m.id} className="mb-model">
            <b>{m.name}</b>
            <small>{countShort(m.units)}</small>
          </span>
        ))}
        <span />
        <span>Reach</span>
        <span className="num">Rep</span>
      </div>
      <div className="mb-body">
        {rows.map((r) => {
          const sold = Object.values(r.models).some((u) => u > 0);
          const rep = Math.round(r.perception);
          return (
            <div key={r.segment} className="mb-row" style={grid}>
              <b className={sold ? undefined : "off"}>{segmentName(r.segment)}</b>
              <span className="mb-wants">
                {r.wants.map((k) => (
                  <i key={k}>{STAT_NAME[k]}</i>
                ))}
              </span>
              <b className="num">{countShort(r.buyers)}</b>
              <span className="mb-won">
                <i>
                  <i className={r.won >= STRONG ? "on" : undefined} style={{ width: `${Math.min(1, r.won / 0.3) * 100}%` }} />
                </i>
                <em className={r.won >= STRONG ? "up" : undefined}>{pct(r.won)}</em>
              </span>
              {models.map((m) => {
                const u = r.models[m.id] ?? 0;
                const heat = u / hottest;
                return (
                  <span key={m.id} className="mb-heat">
                    {u > 0 && (
                      <i
                        className={heat > 0.6 ? "hot" : undefined}
                        style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(18 + 82 * heat)}%, transparent)` }}
                      >
                        {countShort(u)}
                      </i>
                    )}
                  </span>
                );
              })}
              <span />
              <span className="mb-reach">
                <i>
                  <i style={{ width: `${r.reach * 100}%` }} />
                </i>
                <b>{`${Math.round(r.reach * 100)}%`}</b>
              </span>
              <b className={`num ${rep > 0 ? "up" : rep < 0 ? "short" : "zero"}`}>{rep > 0 ? `+${rep}` : String(rep)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
