import type {
  Body,
  Category,
  Colour,
  Dated,
  Era,
  Finish,
  Layout,
  Material,
  PanelOption,
  PanelType,
  Part,
  Plan,
} from "../types";
import { BODIES } from "./bodies";
import { GENERATIONS, generationOf, offeredGenerationIds } from "./chips/gens";
import { PANEL_TYPES, PANELS } from "./display";
import { ERAS, eraFor } from "./eras";
import { COLOURS, FINISHES, MATERIALS } from "./finish";
import { GRAPHICS } from "./graphics";
import { LAYOUTS, PLANS } from "./layouts";
import { MEMORY } from "./memory";
import {
  KEYBOARDS,
  OPTICAL,
  SPEAKERS,
  TRACKPADS,
  WEBCAMS,
  WIRELESS,
} from "./peripherals";
import { PORTS } from "./ports";
import { BATTERIES, COOLING, HOTSWAP } from "./power";
import { PROCESSORS } from "./processors";
import { STORAGE } from "./storage";

export interface Content {
  eras: Era[];
  materials: Material[];
  colours: Colour[];
  finishes: Finish[];
  bodies: Body[];
  layouts: Layout[];
  plans: Plan[];
  panels: PanelOption[];
  panelTypes: PanelType[];
  /** Every part except display panels, which are PanelOption rows. */
  parts: Part[];
}

export const CONTENT: Content = {
  eras: ERAS,
  materials: MATERIALS,
  colours: COLOURS,
  finishes: FINISHES,
  bodies: BODIES,
  layouts: LAYOUTS,
  plans: PLANS,
  panels: PANELS,
  panelTypes: PANEL_TYPES,
  parts: [
    ...PROCESSORS,
    ...GRAPHICS,
    ...MEMORY,
    ...STORAGE,
    ...BATTERIES,
    ...HOTSWAP,
    ...COOLING,
    ...OPTICAL,
    ...WIRELESS,
    ...KEYBOARDS,
    ...TRACKPADS,
    ...WEBCAMS,
    ...SPEAKERS,
    ...PORTS,
  ],
};

export function available(d: Dated, year: number): boolean {
  return d.from <= year && year <= d.until;
}

/** Index by id for constant-time lookups inside the solver. */
export interface Index {
  content: Content;
  parts: Map<string, Part>;
  panels: Map<string, PanelOption>;
  panelTypes: Map<string, PanelType>;
  bodies: Map<string, Body>;
  layouts: Map<string, Layout>;
  plans: Map<string, Plan>;
  materials: Map<string, Material>;
  colours: Map<string, Colour>;
  finishes: Map<string, Finish>;
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

const cache = new WeakMap<Content, Index>();

export function indexContent(content: Content = CONTENT): Index {
  const hit = cache.get(content);
  if (hit) return hit;
  const idx: Index = {
    content,
    parts: byId(content.parts),
    panels: byId(content.panels),
    panelTypes: byId(content.panelTypes),
    bodies: byId(content.bodies),
    layouts: byId(content.layouts),
    plans: byId(content.plans),
    materials: byId(content.materials),
    colours: byId(content.colours),
    finishes: byId(content.finishes),
  };
  cache.set(content, idx);
  return idx;
}

/** Parts of a category available in a year, for pickers. */
export function partsFor(
  category: Category | "port",
  year: number,
  content: Content = CONTENT,
): Part[] {
  return content.parts.filter(
    (p) => p.category === category && available(p, year),
  );
}

/**
 * Parts the builder offers in a year: the year's parts, with processors and
 * graphics cut to each maker's two newest generations.
 */
export function offeredFor(
  category: Category | "port",
  year: number,
  content: Content = CONTENT,
): Part[] {
  const gens = offeredGenerationIds(year);
  const list = partsFor(category, year, content).filter((p) => !p.gen || gens.has(p.gen));
  if (!list.some((p) => p.gen)) return list;
  // Maker by maker, newest generation first, then by name.
  const vendors = [...new Set(GENERATIONS.map((g) => g.vendor))];
  const key = (p: Part) => {
    const g = generationOf(p.gen);
    return g ? [vendors.indexOf(g.vendor), -g.rank] : [vendors.length, 0];
  };
  return [...list].sort((a, b) => {
    const [va, ra] = key(a);
    const [vb, rb] = key(b);
    return va - vb || ra - rb || a.name.localeCompare(b.name, "en", { numeric: true });
  });
}

export function panelsFor(
  year: number,
  content: Content = CONTENT,
): PanelOption[] {
  return content.panels.filter((p) => available(p, year));
}

export { eraFor };
export {
  GENERATIONS,
  type Generation,
  generationOf,
  offeredGenerations,
  type Vendor,
} from "./chips/gens";

/** First and last year a build can be set in. */
export const FIRST_YEAR = 2006;
export const LAST_YEAR = 2026;
export const YEARS: number[] = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
