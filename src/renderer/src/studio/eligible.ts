import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import type { Build, Subject } from "../engine";
import type { CampaignState } from "../engine/campaign";

// Which laptops can have a commercial made: one each, ever. In a campaign,
// the company's released models; in a sandbox, any working saved model.

export function eligibleModels(company: SavedCompany, campaign: CampaignState | null): SavedModel[] {
  const done = new Set((company.commercials ?? []).map((c) => c.model));
  if (campaign) for (const id of campaign.advertised) done.add(id);
  return [...company.models]
    .sort((a, b) => b.created - a.created)
    .filter((m) => !done.has(m.id) && !buildBlock(m.build) && (!campaign || !!campaign.releases[m.id]));
}

/** A model as its commercial shows it: in a campaign, at its release price. */
export function adSubject(m: SavedModel, company: string, campaign: CampaignState | null): Subject {
  const build = m.build as Build;
  const r = campaign?.releases[m.id];
  return { id: m.id, name: m.name, company, build: r ? { ...build, price: r.price } : build };
}
