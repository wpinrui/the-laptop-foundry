import type { SavedModel } from "../../../preload/store";
import { type CampaignState, quarterLabel, shareOf } from "../engine/campaign";
import "./campaign.css";

/** Quarters shown in the sales table, newest first. */
const ROWS = 4;

const units = (n: number) => Math.round(n).toLocaleString("en-US");

/** A share in a few characters: 0.042%, 1.3%. */
export function pct(share: number): string {
  const p = share * 100;
  return `${p >= 1 ? p.toFixed(1) : p >= 0.1 ? p.toFixed(2) : p.toFixed(3)}%`;
}

// The company's sales: last quarter's units per model, then units and market
// share per quarter.
export function SalesPanel({ campaign, models }: { campaign: CampaignState; models: SavedModel[] }) {
  const rows = campaign.sales.slice(-ROWS).reverse();
  if (rows.length === 0) return null;
  const last = rows[0];
  const sold = Object.entries(last.units);
  return (
    <table className="fd-finance fd-in">
      <tbody>
        {sold.map(([id, n]) => (
          <tr key={id}>
            <th>{models.find((m) => m.id === id)?.name ?? ""}</th>
            <td>{units(n)}</td>
            <td className={(last.demand[id] ?? 0) > n ? "short" : undefined}>{units(last.demand[id] ?? n)}</td>
          </tr>
        ))}
      </tbody>
      <tbody>
        <tr>
          <th />
          <th>Units</th>
          <th>Share</th>
        </tr>
        {rows.map((r) => {
          const own = Object.values(r.units).reduce((a, b) => a + b, 0);
          return (
            <tr key={`${r.quarter.year}-${r.quarter.quarter}`}>
              <th>{quarterLabel(r.quarter)}</th>
              <td>{units(own)}</td>
              <td>{pct(shareOf(r))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
