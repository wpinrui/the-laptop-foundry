import type { SavedModel } from "../../../preload/store";
import { AWARD_NAMES, type CampaignState } from "../engine/campaign";
import "./campaign.css";

// The company's awards, newest first.
export function AwardsPanel({ campaign, models }: { campaign: CampaignState; models: SavedModel[] }) {
  const won = campaign.awards.filter((a) => a.maker === null).reverse();
  if (won.length === 0) return null;
  return (
    <table className="fd-finance fd-awards fd-in">
      <tbody>
        {won.map((a) => (
          <tr key={`${a.year}-${a.award}`}>
            <th>{a.year}</th>
            <td>{AWARD_NAMES[a.award]}</td>
            <th>{models.find((m) => m.id === a.id)?.name ?? a.name}</th>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
