import { type CampaignState, quarterLabel } from "../engine/campaign";
import { Column } from "./Menus";
import { Short } from "../ui/Short";
import "./ending.css";

// A campaign's end, which only bankruptcy brings: the company, its final cash
// and three stats: models released, units sold, awards won.

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
        <b className="cash">
          <Short value={campaign.cash} money />
        </b>
        <div className="stats">
          <span>
            <b>
              <Short value={s.models} />
            </b>
            <small>{s.models === 1 ? "Model" : "Models"}</small>
          </span>
          <span>
            <b>
              <Short value={s.units} />
            </b>
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
