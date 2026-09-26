import { type Build, CONTENT, type Category, KIND_NAME, type Problem, solve } from "../engine";
import { panelLabel } from "./format";

// Fit problems in words, and the builder stage each one belongs to.

export const STAGES = ["year", "chassis", "screen", "inside", "surface", "keys", "finish", "marks", "price"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_NAME: Record<Stage, string> = {
  year: "Year",
  chassis: "Chassis",
  screen: "Screen",
  inside: "Inside",
  surface: "Surface",
  keys: "Keys",
  finish: "Finish",
  marks: "Marks",
  price: "Price",
};

const CAT_NAME: Record<Category, string> = {
  processor: "processor",
  graphics: "graphics",
  memory: "memory",
  storage: "storage",
  display: "display",
  battery: "battery",
  hotswap: "hot-swap battery",
  cooling: "cooling",
  optical: "optical drive",
  wireless: "wireless",
  keyboard: "keyboard",
  trackpad: "trackpad",
  webcam: "webcam",
  speakers: "speakers",
};

const SCREEN_LIMIT = {
  refresh: "Refresh too high for the year",
  density: "Resolution too dense for the year",
  size: "Screen size out of range",
  resolution: "Resolution too low",
} as const;

const ROLE_WORD: Record<string, string> = {
  keys: "keyboard",
  pad: "trackpad",
  board: "mainboard",
  battery: "battery",
  fan: "fan",
  fin: "fin stack",
  drive: "drive",
  odd: "optical drive",
  spk: "speaker",
  hinge: "hinge",
  "port:left": "next port",
  "port:right": "next port",
  "port:rear": "next port",
  "port:front": "next port",
  kblight: "keyboard light",
  webcam: "webcam",
  inverter: "inverter",
};

const AXIS_NAME = { x: "width", y: "depth", z: "height" } as const;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const SURFACE = new Set<string>(["keyboard", "trackpad", "webcam", "port"]);

const MEMORY_NEED: Record<string, string> = {
  "ddr2-sodimm": "DDR2 SO-DIMM slots",
  "ddr4-sodimm": "DDR4 SO-DIMM slots",
  "ddr5-sodimm": "DDR5 SO-DIMM slots",
  lpcamm2: "LPCAMM2 support",
  "lpddr3-soldered": "soldered LPDDR3",
  "lpddr5x-soldered": "soldered LPDDR5X",
  "on-package": "on-package memory",
};

/** A compat need in plain words: what the other part must offer. */
function needName(need: string): string {
  if (need === "dgpu") return "discrete graphics";
  if (need.startsWith("mem:")) return `a processor with ${MEMORY_NEED[need.slice(4)] ?? need.slice(4)}`;
  return need;
}

export function stageOfCategory(cat: string | undefined): Stage {
  if (!cat) return "chassis";
  if (cat === "display") return "screen";
  return SURFACE.has(cat) ? "surface" : "inside";
}

function partName(id: string): string {
  const panel = CONTENT.panels.find((p) => p.id === id);
  if (panel) return panelLabel(panel);
  return CONTENT.parts.find((p) => p.id === id)?.name ?? id;
}

function partStage(id: string): Stage {
  if (CONTENT.panels.some((p) => p.id === id) || id in KIND_NAME) return "screen";
  return stageOfCategory(CONTENT.parts.find((p) => p.id === id)?.category);
}

export function stageOf(p: Problem): Stage {
  if (p.kind === "geometry") return "chassis";
  if (p.kind === "year") {
    if (p.what === "part" || p.what === "panel") return partStage(p.ref);
    if (p.what === "body" || p.what === "layout") return "chassis";
    return "finish";
  }
  switch (p.code) {
    case "needs":
    case "no-room":
    case "bad-option":
    case "port-side":
      return partStage(p.part);
    case "missing":
    case "too-many":
      return stageOfCategory(p.category);
    case "wrong-piece":
    case "wrong-finish":
      return "finish";
    case "no-charging":
      return "surface";
    case "screen":
      return "screen";
    case "overlap":
    case "bezel-fit":
      return "surface";
    default:
      return "chassis";
  }
}

export function problemText(p: Problem): string {
  if (p.kind === "geometry")
    return p.code === "short"
      ? `${cap(AXIS_NAME[p.axis])} ${p.by.toFixed(1)} mm short`
      : `${cap(AXIS_NAME[p.axis])} ${p.by.toFixed(1)} mm over the body limit`;
  if (p.kind === "year") {
    if (p.what === "panel" && p.ref in KIND_NAME) return `${KIND_NAME[p.ref as keyof typeof KIND_NAME]} panels not made this year`;
    return `${p.what === "part" || p.what === "panel" ? partName(p.ref) : cap(p.what)} not available this year`;
  }
  switch (p.code) {
    case "needs":
      return `${partName(p.part)} needs ${needName(p.needs)}`;
    case "no-room":
      return `No room for ${partName(p.part)}`;
    case "missing":
      return `No ${CAT_NAME[p.category]}`;
    case "too-many":
      return `At most ${p.max} ${CAT_NAME[p.category]}`;
    case "bad-option":
      return `${partName(p.part)} cannot use that ${p.option}`;
    case "no-charging":
      return "No charging port";
    case "wrong-piece":
      return `Material not allowed on the ${p.piece}`;
    case "wrong-finish":
      return `Finish not allowed on the ${p.piece} material`;
    case "layout-not-on-body":
      return "Layout does not fit the body";
    case "port-side":
      return `${partName(p.part)} on a side without ports`;
    case "unknown":
      return `Unknown part ${p.ref}`;
    case "screen":
      return SCREEN_LIMIT[p.what];
    case "overlap":
      return `${partName(p.part)} runs into the ${ROLE_WORD[p.with] ?? p.with}`;
    case "bezel-fit":
      return `${cap(ROLE_WORD[p.role] ?? p.role)} does not fit the ${p.band === "top" ? "top bezel" : "chin"}`;
  }
}

/** Why a build cannot be reviewed or used, or null when it can. */
export function blockReason(problems: Problem[]): string | null {
  if (problems.length === 0) return null;
  const missing = problems.filter(
    (p) => p.kind === "compat" && p.code === "missing",
  ).length;
  const rest = problems.length - missing;
  if (rest === 0)
    return missing === 1 ? problemText(problems[0]) : `${missing} parts missing`;
  if (problems.length === 1) return problemText(problems[0]);
  return `${problems.length} problems`;
}

/** Block reason for a saved build; unreadable builds count as blocked. */
export function buildBlock(build: unknown): string | null {
  try {
    return blockReason(solve(build as Build).problems);
  } catch {
    return "Unreadable build";
  }
}
