import { type Content, CONTENT } from "./content";
import type { Build } from "./types";
import { PIECES } from "./types";

// Colours are free: any hex on any piece, in any year. Older saves named a
// colour from the stock list; those names still read as their hex.

export const isHexColour = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export function colourHex(c: string, content: Content = CONTENT): string {
  if (isHexColour(c)) return c;
  return content.colours.find((x) => x.id === c)?.hex ?? "#3d3f43";
}

/** Stock colour names become their hex, so the builder edits hex only. */
export function migrateColours(b: Build, content: Content = CONTENT): Build {
  if (PIECES.every((p) => isHexColour(b.finish[p].colour))) return b;
  const finish = { ...b.finish };
  for (const p of PIECES) finish[p] = { ...finish[p], colour: colourHex(finish[p].colour, content).toUpperCase() };
  return { ...b, finish };
}

/**
 * Saves from before the body types: a build without `shape` is one. The Blade
 * was a wedge whose thickness was the front, 6 mm under the rear; it is now a
 * taper whose thickness is the rear, so its thickness grows by that 6 mm.
 */
export function migrateBody(b: Build): Build {
  if (b.shape) return b;
  const size = b.body === "blade" ? { ...b.size, z: Math.min(55, b.size.z + 6) } : b.size;
  return { ...b, size, shape: {} };
}

/** Everything the Model draws from the build beyond the fit: bezel colour and marks. */
export interface Decor {
  bezel?: string;
  marks?: Build["marks"];
}

export function decorOf(b: Build): Decor {
  return { bezel: b.bezel, marks: b.marks };
}
