import type { Build, Fit, Mark } from "../types";
import type { Line } from "./types";

// Real brand logos on rival laptops: the lid logo, and the small one under the
// screen where the brand put one. A mark's image is `logo:<id>`, which the
// viewer resolves to the picture in assets/logos (see SOURCES.md there), so a
// saved market never holds an asset URL.

/** Each logo's width over its height. */
const ASPECT: Record<string, number> = {
  apple: 0.8135,
  "lenovo-2003": 6.0672,
  "lenovo-2015": 4.8302,
  thinkpad: 2.9008,
  legion: 5.303,
  "dell-2010": 1,
  "dell-2016": 1,
  hp: 1,
  asus: 4.7189,
  "acer-2001": 3.8642,
  "acer-2011": 4.1457,
  msi: 3.4362,
  toshiba: 6.5641,
  vaio: 4.3574,
  alienware: 0.7206,
  samsung: 6.481,
  rog: 1.6926,
  microsoft: 1,
  omen: 1,
  razer: 0.9961,
  predator: 0.7662,
};

export const LOGO_PREFIX = "logo:";

interface Badge {
  /** The lid logo. */
  lid: string;
  /** Where on the lid: the centre, or a corner away from the hinge. */
  corner?: boolean;
  /** The logo under the screen, if the brand put one there. */
  chin?: string;
  /** Text under the screen instead, as Apple's model name. */
  chinText?: string;
  /** A fixed logo colour, as Razer's green snake. */
  colour?: string;
}

function badgeOf(line: Line, year: number): Badge {
  const lenovo = year < 2015 ? "lenovo-2003" : "lenovo-2015";
  const dell = year < 2016 ? "dell-2010" : "dell-2016";
  const acer = year < 2012 ? "acer-2001" : "acer-2011";
  switch (line.id) {
    case "apple-macbook":
      return { lid: "apple", chinText: year < 2015 ? "MacBook" : undefined };
    case "apple-macbook-air":
      return { lid: "apple", chinText: year < 2021 ? "MacBook Air" : undefined };
    case "apple-macbook-pro":
      return { lid: "apple", chinText: year < 2021 ? "MacBook Pro" : undefined };
    case "lenovo-thinkpad":
      return { lid: "thinkpad", corner: true, chin: lenovo };
    case "lenovo-legion":
      return { lid: "legion", corner: true, chin: lenovo };
    case "dell-alienware":
      return { lid: "alienware" };
    case "dell-xps":
      return { lid: dell };
    case "hp-omen":
      return { lid: "omen" };
    case "asus-rog":
      return { lid: "rog" };
    case "acer-predator":
      return { lid: "predator" };
    case "razer-blade":
      return { lid: "razer", colour: "#44D62C" };
    case "microsoft-surface-laptop":
      return { lid: "microsoft" };
  }
  switch (line.maker) {
    case "lenovo":
      return { lid: lenovo, corner: true, chin: lenovo };
    case "dell":
      return { lid: dell, chin: dell };
    case "hp":
      return { lid: "hp", chin: "hp" };
    case "asus":
      return { lid: "asus", chin: "asus" };
    case "acer":
      return { lid: acer, chin: acer };
    case "msi":
      return { lid: "msi", chin: "msi" };
    case "samsung":
      return { lid: "samsung", chin: "samsung" };
    case "toshiba":
      return { lid: "toshiba", chin: "toshiba" };
    case "sony":
      return { lid: "vaio", chinText: "SONY" };
    default:
      return { lid: "" };
  }
}

function light(hex: string): boolean {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return false;
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 140;
}

function mark(id: string, surface: Mark["surface"], logo: string, size: number, x: number, y: number, colour: string): Mark {
  return {
    id,
    surface,
    kind: "image",
    text: logo,
    image: LOGO_PREFIX + logo,
    aspect: ASPECT[logo],
    font: "IBM Plex Sans",
    size: Math.round(size * 10) / 10,
    tracking: 0,
    weight: 500,
    colour,
    process: "printed",
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}

/** The line's logos on the build: lid, and under the screen where the brand put one. */
export function logoMarks(line: Line, year: number, build: Build, fit: Fit): Mark[] {
  const badge = badgeOf(line, year);
  const aspect = ASPECT[badge.lid];
  if (!aspect) return [];
  const w = fit.shell.outer.x;
  const h = fit.shell.lid.size.y;
  const lid = build.finish.lid.colour;
  const apple = line.maker === "apple";
  const colour = badge.colour ?? (apple ? (light(lid) ? "#8E9095" : "#B9BBBF") : light(lid) ? "#6F7176" : "#C9CBCE");
  // Emblems by the lid's height, wordmarks by its width.
  const emblem = aspect < 1.8;
  const size = emblem ? h * (apple ? 0.15 : 0.13) : Math.min(h * 0.055, (w * (badge.corner ? 0.16 : 0.22)) / aspect);
  const lw = size * aspect;
  const x = badge.corner ? w / 2 - lw / 2 - Math.max(14, w * 0.05) : 0;
  const y = badge.corner ? h / 2 - size / 2 - Math.max(14, h * 0.07) : 0;
  const out = [mark("logo-lid", "lid", badge.lid, size, x, y, colour)];
  const chin = fit.boxes.find((b) => b.zone === "chin" && b.kind === "zone");
  if (!chin || chin.size.y < 7) return out;
  const cy = h / 2 - (chin.at.y + chin.size.y / 2);
  const tone = light(build.bezel ?? lid) ? "#6F7176" : "#B8BABE";
  const ch = Math.min(chin.size.y * 0.4, 6);
  if (badge.chinText)
    out.push({
      id: "logo-chin",
      surface: "bezel",
      kind: "text",
      text: badge.chinText,
      font: badge.chinText === "SONY" ? "Playfair Display" : "Inter",
      size: Math.round(Math.min(ch, 3.2) * 10) / 10,
      tracking: badge.chinText === "SONY" ? 120 : 20,
      weight: badge.chinText === "SONY" ? 700 : 400,
      colour: tone,
      process: "printed",
      x: 0,
      y: Math.round(cy * 10) / 10,
    });
  else if (badge.chin) {
    const a = ASPECT[badge.chin];
    out.push(mark("logo-chin", "bezel", badge.chin, Math.min(ch, 36 / a), 0, cy, tone));
  }
  return out;
}
