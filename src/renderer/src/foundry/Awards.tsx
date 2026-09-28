import type { SavedModel } from "../../../preload/store";
import { AWARD_IDS, AWARD_NAMES, type Award, type CampaignState } from "../engine/campaign";
import { MAKERS } from "../engine/market/makers";
import "./campaign.css";

// The Awards tab: each year, newest first, its six awards and their winners,
// the player's in accent. The year in play stays blank until its Q4 resolves.
export function AwardsTab({ campaign, models }: { campaign: CampaignState; models: SavedModel[] }) {
  const years = [...new Set(campaign.awards.map((a) => a.year))].sort((a, b) => b - a);
  const { now } = campaign;
  // Right after a Q4 the year just judged leads; otherwise the year in play does, blank.
  const pending = !campaign.over && !(now.quarter === 1 && years[0] === now.year - 1) && !years.includes(now.year);
  const shown = pending ? [now.year, ...years] : years;
  const winner = (a: Award | undefined) => {
    if (!a) return "";
    if (a.maker === null) return models.find((m) => m.id === a.id)?.name ?? a.name;
    const maker = MAKERS.find((m) => m.id === a.maker)?.name ?? a.maker;
    return `${maker} ${a.name}`;
  };
  return (
    <>
      {shown.map((y) => (
        <section key={y} className="cr-awards">
          <div className="cr-awards-head">
            <b>{y}</b>
            {pending && y === now.year && <span>End of Q4</span>}
          </div>
          {AWARD_IDS.map((id) => {
            const a = campaign.awards.find((x) => x.year === y && x.award === id);
            return (
              <div key={id} className="cr-award">
                <span>{AWARD_NAMES[id]}</span>
                <b className={a?.maker === null ? "mine" : undefined}>{winner(a)}</b>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
