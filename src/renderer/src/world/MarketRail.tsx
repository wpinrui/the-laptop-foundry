import { useMemo } from "react";
import type { SavedModel } from "../../../preload/store";
import { type CampaignState, quarterLabel, quarterSummary, worldQuarters } from "../engine/campaign";
import { pct } from "../foundry/Finance";
import { count } from "../foundry/Release";
import { laptopName, makerName, points, useWorldMarket } from "./data";
import type { MarketTab } from "./MarketView";
import "./world.css";

// The Market tab on the rail: the last quarter at a glance, and the way into
// the market view's tabs.
export function MarketRail({
  campaign,
  models,
  company,
  onOpen,
}: {
  campaign: CampaignState;
  models: SavedModel[];
  company: string;
  onOpen: (tab: MarketTab) => void;
}) {
  const market = useWorldMarket(models);
  const last = worldQuarters(campaign)[0];
  const s = useMemo(() => (last ? quarterSummary(campaign, market, last, 5) : null), [campaign, market, last]);
  const links: [MarketTab, string][] = [
    ["quarter", "Quarter"],
    ["competitors", "Competitors"],
    ["buyers", "Buyers"],
  ];
  return (
    <>
      <div className="cr-links">
        {links.map(([t, label]) => (
          <button key={t} type="button" className="fd-text" onClick={() => onOpen(t)}>
            {label}
          </button>
        ))}
      </div>
      {s && (
        <>
          <span className="cr-label">{quarterLabel(s.quarter)}</span>
          <div className="cr-cells">
            <div>
              <span>Market</span>
              <b>{count(s.total)}</b>
            </div>
            <div>
              <span>Share</span>
              <b>{pct(s.player.share)}</b>
            </div>
            <div>
              <span>Change</span>
              <b className={s.player.change !== null && s.player.change < 0 ? "short" : undefined}>{points(s.player.change)}</b>
            </div>
          </div>
          <span className="cr-label">Best sellers</span>
          <div className="cr-market-top">
            {s.best.map((b) => (
              <div key={b.id} className="cr-market-row">
                <span className={b.own ? "mine" : undefined}>{laptopName(b, company)}</span>
                <b>{count(b.units)}</b>
              </div>
            ))}
          </div>
          <span className="cr-label">Makers</span>
          <div className="cr-market-top">
            {s.makers.slice(0, 6).map((m) => (
              <div key={m.maker ?? "own"} className="cr-market-row">
                <span className={m.maker === null ? "mine" : undefined}>{makerName(m.maker, company)}</span>
                <b>{pct(m.share)}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
