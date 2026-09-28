import { type CampaignState, quarterLabel } from "../engine/campaign";
import { Column } from "./Menus";
import { usd } from "./Release";
import "./ending.css";

// A campaign's end, which only bankruptcy brings: the company, its final cash
// and three stats: models released, units sold, awards won.

function unitsOf(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString("en-US");
}

function statsOf(c: CampaignState) {
  const releases = Object.values(c.releases);
  return {
    models: releases.length,
    units: releases.reduce((sum, r) => sum + Math.max(0, r.made - r.stock), 0),
    awards: c.awards.filter((a) => a.maker === null).length,
  };
}

export function Ending({
  name,
  campaign,
  onMenu,
}: {
  name: string;
  campaign: CampaignState;
  onMenu: () => void;
}) {
  const s = statsOf(campaign);
  const when = campaign.ledger.at(-1)?.quarter ?? campaign.now;
  return (
    <Column onBack={onMenu}>
      <div className="fd-end bust">
        <span className="when">Bust in {quarterLabel(when)}</span>
        <h1>{name}</h1>
        <b className="cash">{usd(campaign.cash)}</b>
        <div className="stats">
          <span>
            <b>{s.models.toLocaleString("en-US")}</b>
            <small>{s.models === 1 ? "Model" : "Models"}</small>
          </span>
          <span>
            <b>{unitsOf(s.units)}</b>
            <small>Units</small>
          </span>
          <span>
            <b className="won">{s.awards}</b>
            <small>{s.awards === 1 ? "Award" : "Awards"}</small>
          </span>
        </div>
        <div className="fd-actions">
          <button type="button" data-nav className="fd-primary" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </Column>
  );
}
