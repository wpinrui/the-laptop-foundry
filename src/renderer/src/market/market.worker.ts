import { savedMarketOf } from "../engine/market/field";
import { generateYear } from "../engine/market/generate";

// Generates a year's market off the main thread.

self.onmessage = (e: MessageEvent<{ year: number; seed: number }>) => {
  const { year, seed } = e.data;
  try {
    self.postMessage({
      ok: true,
      market: savedMarketOf(generateYear(year, seed)),
    });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
