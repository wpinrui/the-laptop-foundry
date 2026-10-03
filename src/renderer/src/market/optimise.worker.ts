import type { Rival } from "../engine/market/field";
import { optimiseFor } from "../engine/market/optimise";
import type { SegmentId } from "../engine/market/types";

// Finds the most profitable build and price for a segment off the main thread.

self.onmessage = (e: MessageEvent<{ segment: SegmentId; year: number; rivals: Rival[] }>) => {
  const { segment, year, rivals } = e.data;
  try {
    self.postMessage({ ok: true, result: optimiseFor(segment, year, rivals) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
