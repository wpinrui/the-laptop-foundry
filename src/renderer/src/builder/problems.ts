import { type Build, CONTENT, type Category, type Problem, solve } from "../engine";
import { panelLabel } from "./format";

// Fit problems in words, and the builder tab each one belongs to.

export const TABS = ["Body", "Internals", "Display and input", "Finish"] as const;
export type Tab = (typeof TABS)[number];

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

const AXIS_NAME = { x: "width", y: "depth", z: "height" } as const;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const FRONT = new Set<string>(["display", "keyboard", "trackpad", "webcam"]);

function tabOfCategory(cat: string | undefined): Tab {
  if (!cat || cat === "port") return "Body";
  return FRONT.has(cat) ? "Display and input" : "Internals";
}

function partName(id: string): string {
  const panel = CONTENT.panels.find((p) => p.id === id);
  if (panel) return panelLabel(panel);
  return CONTENT.parts.find((p) => p.id === id)?.name ?? id;
}

function partTab(id: string): Tab {
  if (CONTENT.panels.some((p) => p.id === id)) return "Display and input";
  return tabOfCategory(CONTENT.parts.find((p) => p.id === id)?.category);
}

export function tabOf(p: Problem): Tab {
  if (p.kind === "geometry") return "Body";
  if (p.kind === "year") {
    if (p.what === "part" || p.what === "panel") return partTab(p.ref);
    if (p.what === "body" || p.what === "layout") return "Body";
    return "Finish";
  }
  switch (p.code) {
    case "needs":
    case "no-room":
    case "bad-option":
    case "port-side":
      return partTab(p.part);
    case "missing":
    case "too-many":
      return tabOfCategory(p.category);
    case "wrong-piece":
    case "wrong-finish":
      return "Finish";
    default:
      return "Body";
  }
}

export function problemText(p: Problem): string {
  if (p.kind === "geometry")
    return p.code === "short"
      ? `${cap(AXIS_NAME[p.axis])} ${p.by.toFixed(1)} mm short`
      : `${cap(AXIS_NAME[p.axis])} ${p.by.toFixed(1)} mm over the body limit`;
  if (p.kind === "year")
    return `${p.what === "part" || p.what === "panel" ? partName(p.ref) : cap(p.what)} not available this year`;
  switch (p.code) {
    case "needs":
      return `${partName(p.part)} needs ${p.needs}`;
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
