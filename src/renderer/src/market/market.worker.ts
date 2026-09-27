import { savedMarketOf } from "../engine/market/field";
import { generateYear } from "../engine/market/generate";
import { withProfiles } from "../engine/market/profile";

// Generates a year's market off the main thread.

self.onmessage = (e: MessageEvent<{ year: number; seed: number }>) => {
  const { year, seed } = e.data;
  try {
    self.postMessage({
      ok: true,
      market: withProfiles(savedMarketOf(generateYear(year, seed))),
    });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
