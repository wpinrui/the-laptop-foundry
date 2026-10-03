import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import type { Build, Subject } from "../engine";
import { type CampaignState, hasSold } from "../engine/campaign";

// Which laptops can have a commercial made: one each, ever, filmed while the
// laptop works and before it has sold a unit, released or not. Nothing sells
// in a sandbox, so there any working laptop qualifies.

export function eligibleModels(company: SavedCompany, campaign: CampaignState | null): SavedModel[] {
  const done = new Set((company.commercials ?? []).map((c) => c.model));
  if (campaign) for (const id of campaign.advertised) done.add(id);
  return [...company.models]
    .sort((a, b) => b.created - a.created)
    .filter((m) => !m.archived && !done.has(m.id) && !buildBlock(m.build) && (!campaign || !hasSold(campaign, m.id)));
}

/** A model as its commercial shows it: in a campaign, at its release price. */
export function adSubject(m: SavedModel, company: string, campaign: CampaignState | null): Subject {
  const build = m.build as Build;
  const r = campaign?.releases[m.id];
  return { id: m.id, name: m.name, company, build: r ? { ...build, price: r.price } : build };
}
