import { type CampaignState, marketingCost, maxTier, tierCost } from "../engine/campaign";
import { SEGMENTS } from "../engine/market/segments";
import type { SegmentId } from "../engine/market/types";
import { full } from "../ui/number";
import { Short } from "../ui/Short";
import { Tooltip } from "../ui/Tooltip";
import "./campaign.css";

// The Brand tab: the campaigns' cost per quarter, then per segment its reach
// as a bar, its reputation, and its campaign tier as pips between - and +.

export function BrandTab({
  campaign,
  onTier,
}: {
  campaign: CampaignState;
  onTier: (segment: SegmentId, tier: number) => void;
}) {
  const { brand } = campaign;
  const year = campaign.now.year;
  const cost = marketingCost(brand, year);
  return (
    <>
      <div className="cr-line cr-brand-cost">
        <span>Per quarter</span>
        <b className={cost > campaign.cash ? "short" : undefined}>
          <Short value={cost} money />
        </b>
      </div>
      <div className="cr-brand">
        <div className="cr-brand-head">
          <span />
          <span>Reach</span>
          <span>Rep</span>
          <span>Tier</span>
        </div>
        {SEGMENTS.map((s) => {
          const reach = brand.reach[s.id];
          const rep = Math.round(brand.perception[s.id]);
          const tier: number = brand.campaigns[s.id] ?? 0;
          const top = maxTier(s.id);
          return (
            <div key={s.id} className="cr-brand-row">
              <span className={tier ? undefined : "off"}>{s.shortName}</span>
              <span className="reach">
                <i style={{ width: `${reach * 100}%` }} />
                <span>{Math.round(reach * 100)}%</span>
              </span>
              <b className={rep < 0 ? "short" : rep > 0 ? "up" : "zero"}>{rep > 0 ? `+${rep}` : rep}</b>
              <span className="tier">
                <button
                  type="button"
                  disabled={campaign.over || tier <= 0}
                  aria-label={`${s.shortName} tier down`}
                  onClick={() => onTier(s.id, tier - 1)}
                >
                  -
                </button>
                <span>
                  {Array.from({ length: top }, (_, i) => (
                    <Tooltip
                      // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
                      key={i}
                      tip={full(tierCost((i + 1) as 1 | 2 | 3 | 4 | 5, year), true)}
                    >
                      <i className={i < tier ? "on" : undefined} />
                    </Tooltip>
                  ))}
                </span>
                <button
                  type="button"
                  disabled={campaign.over || tier >= top}
                  aria-label={`${s.shortName} tier up`}
                  onClick={() => onTier(s.id, tier + 1)}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
