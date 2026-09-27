import {
  type CampaignState,
  marketingCost,
  maxTier,
  type Tier,
} from "../engine/campaign";
import { SEGMENTS } from "../engine/market/segments";
import type { SegmentId } from "../engine/market/types";
import { usdShort } from "./Finance";
import "./campaign.css";

// The company's marketing: per segment its reach as a bar, its perception,
// and the campaign tier that runs from the next quarter end.

export function MarketingPanel({
  campaign,
  open,
  onToggle,
  onTier,
}: {
  campaign: CampaignState;
  open: boolean;
  onToggle: () => void;
  onTier: (segment: SegmentId, tier: number) => void;
}) {
  const { brand } = campaign;
  const cost = marketingCost(brand, campaign.now.year);
  const short = cost > campaign.cash;
  return (
    <section className="fd-marketing fd-in">
      <button type="button" className="fd-marketing-head" aria-expanded={open} onClick={onToggle}>
        <span>Marketing</span>
        <b className={short ? "short" : undefined}>{usdShort(cost)}</b>
      </button>
      {open && (
        <table>
          <thead>
            <tr>
              <th />
              <th>Reach</th>
              <th>Rep</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((s) => {
              const reach = brand.reach[s.id];
              const rep = Math.round(brand.perception[s.id]);
              const tier: number = brand.campaigns[s.id] ?? 0;
              const top: Tier = maxTier(s.id);
              return (
                <tr key={s.id}>
                  <th>{s.shortName}</th>
                  <td className="fd-marketing-reach">
                    <i style={{ width: `${reach * 100}%` }} />
                    <span>{Math.round(reach * 100)}%</span>
                  </td>
                  <td className={rep < 0 ? "short" : rep > 0 ? "up" : undefined}>
                    {rep > 0 ? `+${rep}` : rep}
                  </td>
                  <td className="fd-marketing-tier">
                    <button
                      type="button"
                      className="fd-text"
                      disabled={campaign.over || tier <= 0}
                      onClick={() => onTier(s.id, tier - 1)}
                    >
                      -
                    </button>
                    <b className={tier ? "on" : undefined}>
                      {tier}/{top}
                    </b>
                    <button
                      type="button"
                      className="fd-text"
                      disabled={campaign.over || tier >= top}
                      onClick={() => onTier(s.id, tier + 1)}
                    >
                      +
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
