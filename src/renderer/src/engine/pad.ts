import { type Content, CONTENT } from "./content";
import { PAD_BUTTON_ROW } from "./content/peripherals";
import type { Build, BuildPart, OptionValue, Part, Range, Shape } from "./types";

// Trackpads. The part is the technology (touchpad with buttons, clickpad,
// haptic); the size is the player's, within what the year's palm rests took.
// Older saves chose a size part (pad-105x70); they migrate to the technology
// with that size.

type PadShape = Extract<Shape, { kind: "pad" }>;

/**
 * Largest touch surface by year, mm: the 17 inch MacBook Pro's pad (2006),
 * the unibody glass clickpad (2008), the Force Touch pads (2015), the 15 inch
 * MacBook Pro's 160 by 100 (2016), and the large Windows pads of 2020 on.
 */
const PAD_MAX: [year: number, w: number, d: number][] = [
  [1995, 105, 65],
  [2008, 115, 80],
  [2015, 140, 90],
  [2016, 165, 105],
  [2020, 175, 115],
];
const PAD_MIN = { w: 50, d: 30 };

/** Touch surface limits for a year, mm. */
export function padLimits(year: number): { w: Range; d: Range } {
  let row = PAD_MAX[0];
  for (const r of PAD_MAX) if (r[0] <= year) row = r;
  return { w: [PAD_MIN.w, row[1]], d: [PAD_MIN.d, row[2]] };
}

export function padShapeOf(part: Part | undefined): PadShape | undefined {
  if (!part) return undefined;
  const shapes = Array.isArray(part.shape) ? part.shape : [part.shape];
  return shapes.find((s): s is PadShape => s.kind === "pad");
}

function optOf(part: Part, bp: BuildPart | undefined, key: string): OptionValue | undefined {
  const given = bp?.opts?.[key];
  const list = part.options?.[key];
  if (given !== undefined && (!list || list.some((v) => String(v) === String(given)))) return given;
  return list?.[0];
}

/** Separate buttons under the pad, from the shape or an older part's option. */
export function padButtons(part: Part, bp?: BuildPart): boolean {
  const s = padShapeOf(part);
  if (s?.buttons !== undefined) return s.buttons;
  return optOf(part, bp, "buttons") === "separate";
}

/** Button rows the pad unit carries: separate buttons, and the pointing stick's own row. */
export function padRows(part: Part, bp?: BuildPart): number {
  return (padButtons(part, bp) ? 1 : 0) + (optOf(part, bp, "stick") === "yes" ? 1 : 0);
}

export function padMechanism(part: Part, bp?: BuildPart): "mechanical" | "haptic" {
  const s = padShapeOf(part);
  if (s?.mechanism) return s.mechanism;
  return optOf(part, bp, "mechanism") === "haptic" ? "haptic" : "mechanical";
}

/** The touch surface: the part's option, else glass from 2015 and Mylar before, as the older parts were drawn. */
export function padSurface(part: Part, bp: BuildPart | undefined, year: number): "mylar" | "glass" {
  const v = optOf(part, bp, "surface");
  if (v === "glass" || v === "mylar") return v;
  return year >= 2015 ? "glass" : "mylar";
}

/** The pad's touch surface as built, mm: the player's size within the year's limits, else the part's own. */
export function padSize(build: Build, content: Content = CONTENT): { w: number; d: number } | undefined {
  const bp = build.parts.trackpad?.[0];
  const part = bp && content.parts.find((p) => p.id === bp.part);
  const shape = padShapeOf(part);
  if (!part || !shape) return undefined;
  const rows = padRows(part, bp) * PAD_BUTTON_ROW;
  const lim = padLimits(build.year);
  const clamp = (v: number, [a, b]: Range) => Math.min(b, Math.max(a, v));
  const w = clamp(build.place?.pad?.w ?? shape.x, lim.w);
  // The player's depth is the whole unit, button rows and all.
  const d = clamp((build.place?.pad?.d ?? shape.y + rows) - rows, lim.d);
  return { w, d };
}

/** Older size parts and what they become. */
const LEGACY = /^pad-(\d+)x(\d+)$/;

/** Saves from before the trackpad technologies: a size part becomes its technology at that size. */
export function migratePad(build: Build, content: Content = CONTENT): Build {
  const bp = build.parts.trackpad?.[0];
  const m = bp && LEGACY.exec(bp.part);
  const part = bp && content.parts.find((p) => p.id === bp.part);
  if (!bp || !m || !part) return build;
  const x = Number(m[1]);
  const y = Number(m[2]);
  const oldRows = padRows(part, bp);
  const haptic = padMechanism(part, bp) === "haptic";
  const buttons = padButtons(part, bp);
  const id = buttons ? "pad-buttons" : haptic && build.year >= 2015 ? "pad-haptic" : build.year >= 2008 ? "pad-clickpad" : "pad-buttons";
  const opts: Record<string, OptionValue> = {};
  if (optOf(part, bp, "stick") === "yes") opts.stick = "yes";
  if (id === "pad-clickpad") {
    const fin = build.pad?.finish;
    opts.surface = fin === "glass" ? "glass" : fin === "matte" ? "mylar" : build.year >= 2015 ? "glass" : "mylar";
  }
  const next = content.parts.find((p) => p.id === id);
  const newRows = next ? padRows(next, { part: id, opts }) : oldRows;
  const pad = build.place?.pad ?? {};
  const place = {
    ...build.place,
    pad: {
      ...pad,
      w: pad.w ?? x,
      // Keep the touch surface's depth: the unit's depth follows its button rows.
      d: (pad.d ?? y + oldRows * PAD_BUTTON_ROW) + (newRows - oldRows) * PAD_BUTTON_ROW,
    },
  };
  const list = [...(build.parts.trackpad ?? [])];
  list[0] = Object.keys(opts).length > 0 ? { part: id, opts } : { part: id };
  return { ...build, parts: { ...build.parts, trackpad: list }, place };
}
