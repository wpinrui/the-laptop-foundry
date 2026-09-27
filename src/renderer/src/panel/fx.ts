import type { ResolvedPanel } from "../engine/screen";
import { panelLab } from "../engine/content/display";
import {
  ANGLE,
  BLUR_MIN,
  BLUR_PER_PIXEL,
  BRIGHTNESS_RANGE,
  CAST_PER_DE,
  GLARE_PER_LUX,
  HALO,
  HAZE_COLOUR,
  HAZE_SHOWN,
  REFLECTANCE,
  ROOM_LUX,
  ROOM_WHITE,
  type Room,
  SAT_FLOOR,
  SAT_P3,
} from "./tuning";

// How a panel shows its page in a room: what holds whatever the angle
// (brightness, blacks, colour, sharpness), and what the angle adds.

export type Family = "tn" | "ips" | "ips-type" | "oled" | "mini-led";

export interface PanelFx {
  family: Family;
  glossy: boolean;
  /** brightness() for the panel's white against the room. */
  brightness: number;
  saturate: number;
  /** blur() radius, CSS px. */
  blur: number;
  /** Black haze (panel black plus room reflection) as an overlay opacity. */
  haze: number;
  hazeColour: string;
  /** Cool cast overlay opacity. */
  cast: number;
  glare: number;
  /** The panel's white, cd/m2, for the glow it casts. */
  nits: number;
  /** Halo opacity per 100 cd/m2 of average luminance, for the room. */
  halo: number;
}

/** Where the viewer is: degrees above (+) or below (-) the screen's normal, right (+) or left (-), and half the screen's height as an angle. */
export interface View {
  v: number;
  h: number;
  half: number;
}

export const toEncoded = (lin: number) => (lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const clamp01 = (x: number) => clamp(x, 0, 1);

function familyOf(type: string): Family {
  if (type.startsWith("tn")) return "tn";
  if (type === "ips-type") return "ips-type";
  if (type === "oled" || type === "mini-led") return type;
  return "ips";
}

/** The page's CSS pixels per panel pixel, from the Windows scaling the page is laid out at. */
export function panelFx(panel: ResolvedPanel, cssPerPixel: number, room: Room): PanelFx {
  const lab = panelLab(panel);
  const family = familyOf(panel.type);
  const glossy = panel.type.includes("glossy") || family === "oled" || family === "mini-led";
  const nits = lab.centre;
  const lux = ROOM_LUX[room];
  const [lo, hi] = BRIGHTNESS_RANGE;
  // brightness() scales the encoded value; the eye's adapted white sets the reference.
  const brightness = clamp((nits / ROOM_WHITE[room]) ** (1 / 2.2), lo, hi);
  const reflected = ((glossy ? REFLECTANCE.glossy : REFLECTANCE.matte) * lux) / Math.PI;
  const black = Number.isFinite(lab.contrast) ? nits / lab.contrast : 0;
  const haze = toEncoded((black + reflected) / (nits + reflected)) * HAZE_SHOWN;
  const saturate = lab.coverage.p3 >= 95 ? SAT_P3 : SAT_FLOOR + (1 - SAT_FLOOR) * clamp01(lab.coverage.srgb / 100);
  const blurPx = BLUR_PER_PIXEL * cssPerPixel;
  return {
    family,
    glossy,
    brightness,
    saturate,
    blur: blurPx < BLUR_MIN ? 0 : blurPx,
    haze,
    hazeColour: HAZE_COLOUR[family === "ips-type" ? "ips" : family],
    cast: Math.max(0, lab.deltaE.avg - 4) * CAST_PER_DE,
    glare: glossy ? GLARE_PER_LUX * lux : 0,
    nits,
    halo: HALO[room],
  };
}

export interface ViewFx {
  filter: string;
  /** Extra white wash over the black haze, opacity. */
  wash: number;
  /** Edge overlays: darkening at the top, washing at the bottom (TN across its own height). */
  top: number;
  bottom: number;
  /** Corner glow opacity (IPS family). */
  glow: number;
  /** Off-axis tint opacity (OLED). */
  tint: number;
}

interface Angular {
  dim: number;
  contrast: number;
  invert: number;
  wash: number;
  sat: number;
  hue: number;
  glow: number;
  tint: number;
}

function angular(fx: PanelFx, v: number, h: number): Angular {
  const a: Angular = { dim: 1, contrast: 1, invert: 0, wash: 0, sat: 1, hue: 0, glow: 0, tint: 0 };
  const off = Math.hypot(v, h);
  if (fx.family === "tn") {
    const t = ANGLE.tn;
    const below = clamp01(-v / t.below);
    const above = clamp01(v / t.above);
    const side = clamp01(Math.abs(h) / t.side);
    a.dim = 1 - t.belowDim * below;
    a.contrast = (1 - t.belowContrast * below) * (1 - t.aboveContrast * above) * (1 - t.sideContrast * side);
    a.invert = t.belowInvert * below ** 1.6;
    a.wash = t.aboveWash * above ** 1.3;
    a.sat = (1 - t.aboveSat * above) * (1 - t.sideSat * side);
    a.hue = Math.sign(h) * t.sideHue * side;
  } else if (fx.family === "oled") {
    const t = ANGLE.oled;
    const k = clamp01((off - t.from) / (t.reach - t.from));
    a.dim = 1 - t.dim * k;
    a.hue = t.hue * k;
    a.tint = t.tint * k;
  } else {
    const t = fx.family === "ips-type" ? { ...ANGLE.ips, ...ANGLE.ipsType } : ANGLE.ips;
    const k = clamp01(off / ANGLE.ips.reach) ** 1.4;
    a.contrast = 1 - t.contrast * k;
    a.sat = 1 - t.sat * k;
    a.glow = t.glow * k;
    if (fx.family === "mini-led") a.wash = ANGLE.mini.bloom + ANGLE.mini.bloomAngle * k;
  }
  return a;
}

const f2 = (x: number) => x.toFixed(3);

export function viewFx(fx: PanelFx, view: View): ViewFx {
  const c = angular(fx, view.v, view.h);
  const parts = [`brightness(${f2(fx.brightness * c.dim)})`];
  if (c.contrast !== 1) parts.push(`contrast(${f2(c.contrast)})`);
  if (c.invert > 0.002) parts.push(`invert(${f2(c.invert)})`);
  parts.push(`saturate(${f2(fx.saturate * c.sat)})`);
  if (Math.abs(c.hue) > 0.05) parts.push(`hue-rotate(${c.hue.toFixed(1)}deg)`);
  if (fx.blur > 0) parts.push(`blur(${f2(fx.blur)}px)`);
  let top = 0;
  let bottom = 0;
  if (fx.family === "tn") {
    // Across its own height a TN panel is seen from below at the top and from above at the bottom.
    const hi = angular(fx, view.v - view.half, view.h);
    const lo = angular(fx, view.v + view.half, view.h);
    top = clamp01(1 - hi.dim / c.dim + (hi.invert - c.invert));
    bottom = clamp01(lo.wash - c.wash);
  }
  return { filter: parts.join(" "), wash: c.wash, top, bottom, glow: c.glow, tint: c.tint };
}

export const VIEW_EVENT = "panelview";
export { VIEW_STEP } from "./tuning";
