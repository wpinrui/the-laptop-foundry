// The fonts the player can set text decals and keyboard legends in, one list
// for both, with the weights this app ships for each (styles/fonts.css).

export interface TextFont {
  family: string;
  label: string;
  weights: number[];
  group: "Sans" | "Condensed" | "Serif" | "Mono";
}

export const TEXT_FONTS: TextFont[] = [
  { family: "IBM Plex Sans", label: "IBM Plex Sans", weights: [300, 400, 500, 600, 700], group: "Sans" },
  { family: "Inter", label: "Inter", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Roboto", label: "Roboto", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Open Sans", label: "Open Sans", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Lato", label: "Lato", weights: [400, 700], group: "Sans" },
  { family: "Montserrat", label: "Montserrat", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Poppins", label: "Poppins", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Work Sans", label: "Work Sans", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "DM Sans", label: "DM Sans", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Manrope", label: "Manrope", weights: [400, 500, 600, 700], group: "Sans" },
  { family: "Rubik", label: "Rubik", weights: [400, 500, 700], group: "Sans" },
  { family: "Barlow Condensed", label: "Barlow Condensed", weights: [500, 600, 700], group: "Condensed" },
  { family: "Oswald", label: "Oswald", weights: [400, 500, 600, 700], group: "Condensed" },
  { family: "Bebas Neue", label: "Bebas Neue", weights: [400], group: "Condensed" },
  { family: "Playfair Display", label: "Playfair Display", weights: [400, 500, 600, 700], group: "Serif" },
  { family: "IBM Plex Mono", label: "IBM Plex Mono", weights: [400, 500, 600, 700], group: "Mono" },
  { family: "JetBrains Mono", label: "JetBrains Mono", weights: [400, 500, 600, 700], group: "Mono" },
  { family: "Space Mono", label: "Space Mono", weights: [400, 700], group: "Mono" },
];

export const WEIGHT_NAME: Record<number, string> = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };

/** The weights a font ships in; an unknown font (an old save) gets the usual four. */
export function weightsOf(family: string): number[] {
  return TEXT_FONTS.find((f) => f.family === family)?.weights ?? [400, 500, 600, 700];
}

/** The font's shipped weight nearest to the one asked for. */
export function snapWeight(family: string, w: number): number {
  return weightsOf(family).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
}

/** A dropdown option per font, each shown in its own face at its regular (or lightest) weight. */
export function fontOptions() {
  return TEXT_FONTS.map((f) => ({
    key: f.family,
    label: f.label,
    group: f.group,
    style: { fontFamily: `"${f.family}"`, fontWeight: f.weights.includes(400) ? 400 : f.weights[0] },
  }));
}
