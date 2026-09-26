// Fit engine data shapes. Millimetres throughout.
// x is width, y is depth (front to back), z is thickness.
// Origin is the base's outer front-left-bottom corner.

export type Mm = number;
export type Axis = "x" | "y" | "z";
export type PlanAxis = "x" | "y";
export interface Size {
  x: Mm;
  y: Mm;
  z: Mm;
}
export type Vec3 = Size;
/** Limits: [min, max]. */
export type Range = [min: number, max: number];
/** A value that engineering spend moves: [at spend 0, at spend 1]. */
export type Tune = [atZero: Mm, atOne: Mm];
export type Side = "left" | "right" | "rear" | "front";
export type Piece = "floor" | "deck" | "lid";

export const SIDES: Side[] = ["left", "right", "rear", "front"];
export const PIECES: Piece[] = ["floor", "deck", "lid"];

/** Everything in content is dated. 0.1 only asks "is it available in this year". */
export interface Dated {
  id: string;
  name: string;
  from: number;
  until: number;
}

// ---------------------------------------------------------------- eras

/** Era rows are looked up step-wise: the latest era at or before the year. */
export interface Era {
  year: number;
  /** Wall thickness per material, default to minimum (material spend 0 to 1). */
  wall: Record<string, Tune>;
  /** Where each material may go this era. A material missing here is unavailable. */
  pieces: Record<string, Piece[]>;
  /** Gap between floor zones and between units in a floor zone (packing spend). */
  gap: Tune;
  /** Active-area edge to outer shell. */
  bezel: { side: Mm; top: Mm; chin: Mm };
  /** Casing around a removable battery pack, each face. */
  packCasing: Mm;
  pcb: Mm;
  heatPipe: Mm;
  vapourChamber?: Mm;
  /** Heat spreader over the chips when there is no fan. */
  spreader: Mm;
  /** Deck structure under the keyboard or trackpad stack, which sit flush in wells in the top case. */
  deckExtra: Mm;

  /** Routing margin between the two mainboard rows. */
  boardMargin: Mm;
  vrmMm2PerWatt: number;
  vrmHeight: Mm;
  fan: { min: Size; max: Size };
  finDepth: Mm;
}

// ---------------------------------------------------------------- finish

export interface Material extends Dated {
  density: number;
  /** Resistance to drops, dents and flex, 0 to 1. Material spend raises it. */
  durability: number;
  finishes: string[];
}
export type Colour = Dated & { hex: string };
export type Finish = Dated;

// ---------------------------------------------------------------- bodies

export interface BodyStyle {
  edge: "square" | "rounded" | "chamfer";
  /** Plan corner radius of the footprint. */
  corner: Mm;
  /** Profile size of the top and bottom perimeter edges: radius when rounded, leg when chamfered. */
  profile: Mm;
  /**
   * Cosmetic wedge: the rear is this much thicker than the front. Built outward,
   * below the base, tapering to nothing at the front edge, so it never cuts into
   * a part. The player's thickness is the front thickness.
   */
  wedge: Mm;
  hinge: "barrel" | "full" | "drop";
  latch: boolean;
}

export interface Body extends Dated {
  /** Default outer base size. */
  size: Size;
  limits: { x: Range; y: Range; z: Range };
  style: BodyStyle;
  /** Each of the two hinge mounts. */
  hinge: Size;
  layouts: string[];
}

// ---------------------------------------------------------------- layouts

export type Role =
  | "board"
  | "battery"
  | "fan"
  | "fin"
  | "drive"
  | "odd"
  | "spk"
  | "hinge"
  | "port:left"
  | "port:right"
  | "port:rear"
  | "port:front"
  | "keys"
  | "pad"
  | "hinge-strip"
  | "panel"
  | "inverter"
  | "webcam"
  | "kblight"
  | "bezel-side"
  | "bezel-top"
  | "bezel-chin";

export type BlockRole =
  | "cpu"
  | "gpu"
  | "vrm"
  | "chipset"
  | "mem"
  | "m2"
  | "wlan"
  | "bt"
  | "tb";

export interface SplitNode {
  split: PlanAxis;
  children: Node[];
}

export interface ZoneNode {
  zone: string;
  takes: Role[];
  pack: Axis;
  grow: number;
  edge?: Side;
  align?: "start" | "centre" | "end";
  /** Which end the first unit goes at along the pack axis. Side port strips pack from the rear. */
  packFrom?: "start" | "end";
  /** Most units this zone holds. Extra units go to the next zone that takes the role. */
  capacity?: number;
  /** Keeps its share of the slack when empty, so its neighbours stay put. */
  keep?: boolean;
}

export type Node = SplitNode | ZoneNode;

export interface Plan {
  id: string;
  root: Node;
}

export interface Layout extends Dated {
  floor: Node;
  deck: string;
  lid: string;
  /** Sides that have a port strip. Derived for the UI; validated against the tree. */
  portSides: Side[];
}

// ---------------------------------------------------------------- parts

export type Category =
  | "processor"
  | "graphics"
  | "memory"
  | "storage"
  | "display"
  | "battery"
  | "hotswap"
  | "cooling"
  | "optical"
  | "wireless"
  | "keyboard"
  | "trackpad"
  | "webcam"
  | "speakers";

export const CATEGORIES: Category[] = [
  "processor",
  "graphics",
  "memory",
  "storage",
  "display",
  "battery",
  "hotswap",
  "cooling",
  "optical",
  "wireless",
  "keyboard",
  "trackpad",
  "webcam",
  "speakers",
];

export type PortGroup =
  | "power"
  | "video"
  | "network"
  | "usb"
  | "cards"
  | "audio"
  | "other";

export type Shape =
  /** Loose units that go into zones by role. */
  | { kind: "box"; units: { role: Role; size: Size; count?: number }[] }
  /** A block on the derived mainboard. `stack` multiplies z by the named option. */
  | {
      kind: "block";
      role: BlockRole;
      size: Size;
      row: 1 | 2;
      hot?: boolean;
      stack?: string;
    }
  /** Cylindrical cells. Count is the "cells" option. */
  | {
      kind: "cells";
      perRow: Record<string, number>;
      diameter: Mm;
      length: Mm;
      height: Mm;
    }
  /** Pouch or prismatic pack. Wh is the "wh" option; thickness keyed by the "thickness" option. */
  | {
      kind: "pouch";
      whPerLitre: number;
      depth: Mm;
      thickness: Record<string, Mm>;
    }
  /** Stack height at keyboard spend 0 and 1. */
  | { kind: "keys"; rows: number; stack: Tune }
  | { kind: "pad"; x: Mm; y: Mm }
  /** Fans fill their zone within the era's fan limits. */
  | { kind: "fan"; count: number; chamber?: boolean }
  | {
      kind: "port";
      width: Mm;
      height: Mm;
      depth: Mm;
      group: PortGroup;
      count?: number;
      charges?: boolean;
      /** Board block needed per two ports of this kind. */
      controller?: Size;
    }
  | { kind: "none" };

export type OptionValue = string | number;

export interface Part extends Dated {
  category: Category | "port";
  shape: Shape | Shape[];
  /** First value of each list is the default. */
  options?: Record<string, OptionValue[]>;
  /** Axes that compactness spend may shrink. Empty for standard form factors. */
  compact: Axis[];
  provides?: string[];
  /** Each must be provided by some chosen part. */
  needs?: string[];
  /** Needs that only apply when an option has a given value. */
  optionNeeds?: Record<string, Record<string, string[]>>;
  /** Default power range. The top of it sizes the power stage. Processors and graphics use `power` instead. */
  watts?: Range;
  /** Power range, default limits and performance curve data for processors and graphics. */
  power?: PowerSpec;
  /** Hardware features benchmark and game editions check: instruction sets, graphics API levels. */
  features?: string[];
  /** Features of the processor's integrated graphics. */
  igpuFeatures?: string[];
  /** Hot-swap in 2026: the main pack moves into a removable casing of this thickness. */
  packCasing?: Mm;
  /** Descriptive facts for the review and the UI. Never read by the solver. */
  info?: Record<string, OptionValue>;
}

/** Display is chosen from allowed combinations only. */
export interface PanelOption extends Dated {
  inches: number;
  aspect: [number, number];
  res: [number, number];
  type: string;
  refresh: number[];
  nits: number;
  gamut: string;
}

export interface PanelType extends Dated {
  /** Thickness including cover glass; for CCFL, [at 12.1", at 17"] interpolated by size. */
  thickness: Mm | [Mm, Mm];
  inverter?: Size;
  /** Cover glass is the lid's front face, so the lid has no front wall over the panel. */
  coverGlass?: boolean;
}

// ---------------------------------------------------------------- power

/** A curated real measurement: a score at a known package power. */
export interface PowerPoint {
  watts: number;
  score: number;
}

export interface PowerSpec {
  /** Architecture key into the simulation's curve table. */
  arch: string;
  /** Lowest and highest power the part can be set to. */
  range: Range;
  /** Default sustained and short-boost limits. */
  sustained: number;
  boost: number;
  /** Rated power. Sizes the power stage in the fit engine. */
  rated: number;
  /** Package power at idle. */
  idle: number;
  /** Multi-core points (processors) or graphics points (graphics). */
  points: PowerPoint[];
  /** Single-core score with one core at full boost. Processors only. */
  single?: number;
  /** Integrated graphics score at a package power. Processors only. */
  igpu?: PowerPoint;
}

export type ProfileId = "high" | "medium" | "low";
export const PROFILES: ProfileId[] = ["high", "medium", "low"];

export interface Limits {
  sustained: number;
  boost: number;
}

export interface Profile {
  enabled: boolean;
  cpu: Limits;
  /** Discrete graphics limits. Ignored without a discrete part. */
  gpu: Limits;
  /** Highest fan speed allowed, 0 to 1. */
  fan: number;
}

// ---------------------------------------------------------------- build

export interface BuildPart {
  part: string;
  opts?: Record<string, OptionValue>;
}

export type SpendKey = Category | "packing" | "material";

export interface Build {
  year: number;
  body: string;
  layout: string;
  /** Outer base size as the player set it. */
  size: Size;
  parts: Partial<Record<Category, BuildPart[]>>;
  ports: { part: string; side: Side }[];
  materials: Record<Piece, string>;
  finish: Record<Piece, { colour: string; texture: string }>;
  spend: Partial<Record<SpendKey, number>>;
  /** Power profiles as the player set them. Absent means the part defaults. */
  power?: Record<ProfileId, Profile>;
  /** Retail price in the year's nominal US dollars, as the player set it. */
  price?: number;
}

// ---------------------------------------------------------------- fit

export interface Box {
  id: string;
  role: Role | BlockRole;
  piece: Piece;
  kind: "zone" | "unit";
  at: Vec3;
  size: Size;
  /** The zone this unit sits in, or the zone id itself. */
  zone: string;
  part?: string;
  /** A removable pack whose casing forms the underside in place of the bottom wall. */
  skin?: boolean;
  /** The part's options, defaults filled in. */
  opts?: Record<string, OptionValue>;
  /** The outer edge the unit's zone sits on (vents, ports, bays). */
  edge?: Side;
}

export interface Opening {
  id: string;
  kind: "port" | "vent" | "bay";
  side: Side;
  part?: string;
  /** Span along the side: x on front and rear, y on left and right. */
  u: [Mm, Mm];
  z: [Mm, Mm];
}

export type Anchor =
  | { kind: "hinge"; from: Vec3; to: Vec3 }
  | { kind: "opening"; at: Vec3; opening: Opening }
  | { kind: "heat-source"; at: Vec3; box: string; watts: number }
  | { kind: "heat-sink"; at: Vec3; box: string };

export interface Route {
  kind: "heat-pipe" | "vapour-chamber" | "display-cable";
  points: Vec3[];
  width: Mm;
}

export interface Shell {
  /** Outer base as drawn: the player's size, clamped to the body's limits. */
  outer: Size;
  /** Inner base box. Contents are laid out from its origin. */
  inner: { at: Vec3; size: Size };
  /** lidFront is 0 when the panel's cover glass forms the lid's front face. */
  walls: { bottom: Mm; top: Mm; side: Mm; lid: Mm; lidFront: Mm };
  /** Inner box inset from the outer faces, after styling allowance. */
  offsets: { side: Mm; bottom: Mm; top: Mm; lidSide: Mm };
  style: BodyStyle;
  /** Lid in the closed position, in base coordinates. */
  lid: { at: Vec3; size: Size; inner: { at: Vec3; size: Size } };
  /** Floor: inner bottom to the top wall. Deck: the thickest deck layer, down from the top surface. */
  bands: { floor: [Mm, Mm]; deck: [Mm, Mm] };
  cutouts: Opening[];
  /** Holes in the bottom wall where a removable pack forms the underside. */
  hatches: { at: Vec3; size: Size }[];
  /** Openings in the top wall where the keyboard and trackpad sit flush with the top surface. */
  wells: { at: Vec3; size: Size }[];
}

export type Problem =
  | { kind: "geometry"; code: "short"; axis: Axis; by: Mm }
  | { kind: "geometry"; code: "too-big"; axis: Axis; by: Mm }
  | { kind: "compat"; code: "needs"; part: string; needs: string }
  | { kind: "compat"; code: "no-room"; part: string; role: Role }
  | { kind: "compat"; code: "missing"; category: Category }
  | { kind: "compat"; code: "too-many"; category: Category; max: number }
  | {
      kind: "compat";
      code: "bad-option";
      part: string;
      option: string;
      value: OptionValue;
    }
  | { kind: "compat"; code: "no-charging" }
  | { kind: "compat"; code: "wrong-piece"; piece: Piece; material: string }
  | { kind: "compat"; code: "wrong-finish"; piece: Piece; finish: string }
  | { kind: "compat"; code: "layout-not-on-body"; layout: string }
  | { kind: "compat"; code: "port-side"; part: string; side: Side }
  | { kind: "compat"; code: "unknown"; ref: string }
  | {
      kind: "year";
      code: "unavailable";
      what:
        | "part"
        | "body"
        | "layout"
        | "material"
        | "colour"
        | "finish"
        | "panel";
      ref: string;
    };

export interface Fit {
  /** Smallest outer base that fits. */
  min: Size;
  /** Frame the contents are laid out in: per axis the larger of the drawn size and the minimum. */
  frame: Size;
  lidZ: Mm;
  shell: Shell;
  boxes: Box[];
  anchors: Anchor[];
  routes: Route[];
  problems: Problem[];
}

export function isZone(n: Node): n is ZoneNode {
  return (n as ZoneNode).zone !== undefined;
}
