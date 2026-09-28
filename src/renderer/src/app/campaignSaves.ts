import type { SavedCampaign } from "../../../preload/store";

// Campaign saves run one at a time in the background. A change made while one
// is on its way waits, and only the newest waiting state per company is
// written, so rapid clicks are all kept and the last one wins.

const waiting = new Map<string, SavedCampaign>();
let running: Promise<void> | null = null;

/** Queues the company's campaign to be saved, replacing any of its state still waiting. */
export function queueCampaignSave(company: string, campaign: SavedCampaign): Promise<void> {
  waiting.set(company, campaign);
  return pump();
}

/** Resolves once every queued campaign save has landed. */
export function campaignSaved(): Promise<void> {
  return running ?? Promise.resolve();
}

function pump(): Promise<void> {
  if (running) return running;
  if (waiting.size === 0) return Promise.resolve();
  running = (async () => {
    for (let next = waiting.entries().next(); !next.done; next = waiting.entries().next()) {
      const [company, campaign] = next.value;
      waiting.delete(company);
      try {
        await window.api.store.saveCampaign(company, campaign);
      } catch (e) {
        console.error("campaign could not be saved", e);
      }
    }
    running = null;
  })();
  return running;
}
