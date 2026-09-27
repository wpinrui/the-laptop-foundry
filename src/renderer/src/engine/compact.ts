import type { Part } from "./types";

// Compact spend makes a part smaller: shrinks its compactable axes, thins its
// stack, packs its cells denser or thins its fans. Standard form factors (bay
// drives, SO-DIMMs, M.2 cards, optical drives, 18650 cells) have nothing to
// compact, so they neither show the slider nor charge for it.

/** Whether Compact spend changes anything on the part. */
export function compactable(part: Part | undefined): boolean {
  if (!part) return false;
  if (part.compact.length > 0 || part.compactZ) return true;
  const shapes = Array.isArray(part.shape) ? part.shape : [part.shape];
  return shapes.some(
    (s) => s.kind === "keys" || s.kind === "pad" || s.kind === "pouch" || (s.kind === "fan" && s.count > 0),
  );
}
