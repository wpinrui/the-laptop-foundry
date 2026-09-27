import { type CampaignState, costsOf, quarterLabel } from "../engine/campaign";
import { Column, Entry } from "./Menus";
import { usd } from "./Release";
import "./campaign.css";

/** Money in a few characters: $1.24M, $450k, $900. */
export function usdShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** Quarters shown in the finance table, newest first. */
const ROWS = 4;

// The company's books: the latest quarters' revenue, costs, profit and cash.
export function FinancePanel({ campaign }: { campaign: CampaignState }) {
  const rows = campaign.ledger.slice(-ROWS).reverse();
  if (rows.length === 0) return null;
  return (
    <table className="fd-finance fd-in">
      <thead>
        <tr>
          <th />
          <th>Revenue</th>
          <th>Costs</th>
          <th>Profit</th>
          <th>Cash</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={`${e.quarter.year}-${e.quarter.quarter}`}>
            <th>{quarterLabel(e.quarter)}</th>
            <td>{usdShort(e.revenue)}</td>
            <td>{usdShort(costsOf(e))}</td>
            <td className={e.profit < 0 ? "short" : undefined}>
              {usdShort(e.profit)}
            </td>
            <td className={e.cash < 0 ? "short" : undefined}>
              {usdShort(e.cash)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A bankrupt campaign's end: the company, the quarter it went bust in, its cash. */
export function Bankrupt({
  name,
  campaign,
  onMenu,
}: {
  name: string;
  campaign: CampaignState;
  onMenu: () => void;
}) {
  return (
    <Column onBack={onMenu}>
      <div className="fd-bust">
        <h1>{name}</h1>
        <b>{quarterLabel(campaign.now)}</b>
        <span className="short">{usd(campaign.cash)}</span>
      </div>
      <Entry onClick={onMenu}>Menu</Entry>
    </Column>
  );
}
