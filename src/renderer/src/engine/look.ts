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

/** Everything the Model draws from the build beyond the fit: bezel colour and marks. */
export interface Decor {
  bezel?: string;
  marks?: Build["marks"];
}

export function decorOf(b: Build): Decor {
  return { bezel: b.bezel, marks: b.marks };
}
