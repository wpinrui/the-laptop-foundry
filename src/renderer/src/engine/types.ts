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

/**
 * A length that follows the body's size: k times the axis ("short" is the
 * shorter of x and y), clamped to [min, max]. A [k0, k1] pair is the range the
 * player's signature slider moves it through, so the slider means the same on
 * every size.
 */
export type Scaled = Mm | { k: number | [number, number]; of: Axis | "short"; min: Mm; max: Mm };

export type HingeStyle = "full" | "barrel" | "drop" | "spine" | "inset" | "lift";
/** The shape parameter a body's signature slider moves. */
export type Signature =
  | "corner"
  | "profile"
  | "drop"
  | "bumper"
  | "taper"
  | "undercut"
  | "shelf"
  | "lip"
  | "slant"
  | "round"
  | "wrap"
  | "edge"
  | "facet";

/** How a perimeter edge zone runs: straight, a quarter round, or a convex curve that meets the flat face tangentially. */
export type EdgeKind = "linear" | "chamfer" | "round" | "curve";

/** Inset multipliers for the front, the two sides and the rear, 0 to 1.5. */
export interface PerimSides {
  f: number;
  s: number;
  r: number;
}

/**
 * One edge profile swept round the plan: a top zone `h` tall that runs `d`
 * in from the outline at the top face, and a bottom zone likewise at the
 * bottom face. Each side scales its zones by its multiplier: the run by the
 * multiplier, the height by it up to 1. `bot.h` "edge" leaves a vertical edge
 * band of max(min, k Z) on a side at 1; "full" rakes the whole height below
 * the top zone. `d` "h" is the zone's own height.
 */
export interface Perim {
  top: { kind: EdgeKind; h: Scaled; d: Scaled | "h" };
  bot: { kind: EdgeKind; h: Scaled | "edge" | "full"; d: Scaled | "h" };
  edge?: { k: number; min: Mm };
  sides: PerimSides;
  /** The player sets each side's multiplier. */
  tune?: boolean;
}

export interface BodyStyle {
  edge: "square" | "rounded" | "chamfer" | "perim";
  /** Plan corner radius of the footprint; the leg of the cut when the corners are chamfered. */
  corner: Scaled;
  /** Plan corners rounded (the default) or cut flat. */
  cornerKind?: "round" | "chamfer";
  /** Profile size of the top and bottom perimeter edges: radius when rounded, leg when chamfered. */
  profile: Scaled;
  hinge: HingeStyle;
  latch: boolean;
  signature: Signature;
  /**
   * A true taper: the bottom rises toward the front. `front` is the front
   * thickness as a share of Z over the slider, never under `minFront`; `run`
   * is the share of the depth the rise spans. The player's Z is the rear.
   * `linear` rises in a straight line instead of easing in and out.
   */
  taper?: { front: [number, number]; minFront: Mm; run: number; linear?: boolean; curve?: boolean };
  /** A perimeter edge profile, on edge "perim". */
  perim?: Perim;
  /** The lower half tucks in all round under a cove. */
  undercut?: { inset: Scaled; height: Scaled };
  /** A cylindrical rear spine that hangs `drop` below the base and carries the hinge. */
  spine?: { drop: Scaled };
  /** A raised rear shelf behind the hinge, `depth` deep, rising `rise` over the deck. */
  shelf?: { depth: Scaled; rise: Scaled };
  /** A lifting hinge: the lid's lower edge swings down behind the rear, which is chamfered under it. */
  lift?: { lip: Scaled };
  /** Corner bumpers, proud of the top and bottom by a quarter of this. */
  bumper?: Scaled;
  /** Walls are the era's times this. */
  wallScale?: number;
  /** Lid dome, built outward only. */
  crown?: Scaled;
}

/** A body's style resolved at one size and signature: every length in mm. */
export interface ResolvedStyle {
  edge: BodyStyle["edge"];
  cornerKind: "round" | "chamfer";
  hinge: HingeStyle;
  latch: boolean;
  signature: Signature;
  /** The signature slider, 0 to 1. */
  sig: number;
  /** The value the signature slider shows, mm. */
  sigMm: Mm;
  corner: Mm;
  profile: Mm;
  /**
   * Front thickness share of Z, least front thickness, run share of Y, and
   * whether it rises straight, or `curved`: flat toward the rear and rising in
   * a quarter round to the front. Null without a taper.
   */
  taper: { front: number; minFront: Mm; run: number; linear: boolean; curved: boolean } | null;
  /** The perimeter edge profile in mm, with each side's multiplier. Null on other bodies. */
  pm: ResolvedPerim | null;
  /** Undercut inset and height. */
  ui: Mm;
  uh: Mm;
  /** Spine drop below the base, and its diameter (Z + drop). */
  drop: Mm;
  D: Mm;
  /** Shelf depth, and its rise over the deck. */
  Sd: Mm;
  R: Mm;
  /** Lift lip. */
  lip: Mm;
  /** A bevel along the rear bottom edge for a wrapped fan grill: its rise up the rear and its run under the base. Null without one. */
  bevel: { rise: Mm; run: Mm } | null;
  /** Bumper size, and the quarter of it the shell sits inside at the top and the bottom. */
  bumper: Mm;
  q: Mm;
  wallScale: number;
  crown: Mm;
}

/** A perimeter profile at one size: each zone's kind, height and run before the side multipliers. */
export interface ResolvedPerim {
  tk: EdgeKind;
  hT: Mm;
  dT: Mm;
  bk: EdgeKind;
  hB: Mm;
  dB: Mm;
  m: PerimSides;
  tune: boolean;
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
  /** Roles that may be moved here, by auto placement or the player, besides those it takes. */
  may?: Role[];
  /** Short name for the builder's placement control, on zones a movable part can sit in. */
  name?: string;
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
  /**
   * Pouch or prismatic pack sized by the player: the "length" (x), "depth" (y)
   * and "thick" (z) options in mm. Capacity follows from the volume. Older saves
   * gave "wh" and a "thickness" key instead; see engine/battery.ts.
   */
  | {
      kind: "pouch";
      /** Energy density in the part's first year; it rises a little each year after. */
      whPerLitre: number;
      /** Default depth, and the depth of older saves. */
      depth: Mm;
      /** Thickness per older-save key; the first is the default. */
      thickness: Record<string, Mm>;
      /** Default capacity, and the capacity of older saves that gave none. */
      wh: number;
      /** Player limits per axis. */
      limits: Record<Axis, [Mm, Mm]>;
    }
  /** Stack height at keyboard spend 0 and 1. */
  | { kind: "keys"; rows: number; stack: Tune }
  /**
   * A trackpad at its default size. `buttons` adds a row of separate buttons;
   * `mechanism` is how it clicks. Older parts carry both as options instead.
   */
  | { kind: "pad"; x: Mm; y: Mm; buttons?: boolean; mechanism?: "mechanical" | "haptic" }
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
  /** Years an option value can be had, where narrower than the part's own: option, value, [from, until]. */
  optionYears?: Record<string, Record<string, [number, number]>>;
  /** Axes that compactness spend may shrink. Empty for standard form factors. */
  compact: Axis[];
  /** How much of its height full Compact spend takes off, when more than the usual 15 percent. */
  compactZ?: number;
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
  /** Processor and graphics generation, from the generations table. The builder offers a maker's two newest. */
  gen?: string;
  /** Only rivals may use it: never listed or offered to the player. */
  rivalOnly?: boolean;
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
  /** Display quality spend, 0 to 1: factory calibration and uniformity binning. Set on a build's screen. */
  quality?: number;
  /** HDR peak on a small window, cd/m2, where the panel has one. Set on a resolved screen. */
  peak?: number;
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
  /** Real processor clocks. Processors only; hybrid chips give the performance cores. */
  clock?: CpuClock;
  /** Real graphics core clocks: the discrete part's, or a processor's integrated graphics. */
  gpuClock?: GpuClock;
}

/** Processor clocks, GHz. Base is absent where the maker publishes none. */
export interface CpuClock {
  base?: number;
  /** Highest single-core boost. */
  single: number;
  /** All-core boost with every core loaded. */
  allCore: number;
  /** Typical all-core clock at the default sustained power, from reviews. */
  sustained: number;
}

/** Graphics core clocks, MHz. Base is absent where the maker publishes none. */
export interface GpuClock {
  base?: number;
  boost: number;
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

export type ScreenKind = "tn" | "ips" | "oled" | "mini-led";

/** The screen as the player specifies it. */
export interface ScreenSpec {
  /** Diagonal, inches. */
  diag: number;
  ratio: [number, number];
  res: [number, number];
  hz: number;
  panel: ScreenKind;
  /** TN before 2010 came matte or glossy. */
  surface?: "matte" | "glossy";
  /** Side bezel, active area edge to the lid's outer edge, mm. */
  bezel: number;
  /** Full-screen white, cd/m2. Absent means the nearest sold panel's. */
  nits?: number;
  /** Gamut tier, one of GAMUTS. Absent means the nearest sold panel's. */
  gamut?: string;
}

/** A port on a wall. Its place follows from the list order; old saves may carry `along` and `height`, which are ignored. */
export interface BuildPort {
  part: string;
  side: Side;
}

/** Where the player put the keyboard, trackpad and webcam, in mm. Absent parts sit where the layout puts them. */
export interface Placement {
  /** Keyboard moved toward the front from its place by the hinge. */
  kb?: { y: number };
  /** Trackpad size, and its gap in front of the keyboard. */
  pad?: { w?: number; d?: number; y?: number };
  /** Webcam offset from the lid's centre line. */
  cam?: { x: number };
  /** Display panel: its top edge's distance below the lid's top edge (the top bezel). */
  panel?: { y: number };
  /** Floor parts the player pinned, by slot ("storage:0"): a zone and a quarter turn in plan. Absent fields are auto. */
  parts?: Record<string, PartPin>;
}

/** How a speaker set's units sit in each zone: a line across, a line along, or a bunch. */
export type SpkRow = PlanAxis | "bunch";

/** A movable floor part's pinned zone and turn. Either left out means auto. */
export interface PartPin {
  zone?: string;
  turn?: boolean;
  /** Speakers: one line along an axis, or a bunch, in place of the zone's own line. */
  row?: SpkRow;
}

/** Keycaps as the player styled them. Colours are hex. */
export interface KeySpec {
  shape: "square" | "rounded" | "round";
  colours: { letters: string; mods: string; accent: string };
  legend: {
    font: string;
    colour: string;
    align: "c" | "tl" | "bl";
    case: "as" | "upper" | "lower";
    /** Scale on the standard legend size. */
    size: number;
    weight: number;
  };
}

export type MarkSurface = "lid" | "palm" | "bottom" | "bezel";

/** A mark on the case: text, an SVG, or a raster image the player imported. Sizes in mm. */
export interface Mark {
  id: string;
  surface: MarkSurface;
  kind: "text" | "svg" | "image";
  /** The text, or the SVG's or image's name. */
  text: string;
  /** Sanitised SVG markup. */
  svg?: string;
  /** A raster mark's picture as a PNG, JPEG or WebP data URL, at most 1024 px on its longest side. */
  image?: string;
  /** A raster mark's width over its height. */
  aspect?: number;
  /** The preset decal an SVG mark came from, for its badge and glyph. */
  preset?: string;
  /** Solid, or the shape's outline drawn as a line. Absent means fill. */
  style?: "fill" | "outline";
  /** The outline's line width in mm; absent means one in proportion to the size. */
  stroke?: number;
  /** The emoji an SVG mark came from, for its card. */
  emoji?: string;
  /** Draw an SVG in its own colours instead of tinting it to the mark colour. */
  original?: boolean;
  /** A hover preview drawn faint; never saved. */
  ghost?: boolean;
  font: string;
  /** Text height, or the SVG's height. */
  size: number;
  /** Letter spacing in thousandths of the size. */
  tracking: number;
  weight: number;
  colour: string;
  process: "etched" | "printed" | "embossed";
  /** Offset of the mark's centre from the surface's centre, right and up as the surface is read. */
  x: number;
  y: number;
  /** Turn about the mark's centre in degrees, clockwise as the surface is read. Absent means 0. */
  rotation?: number;
}

export interface BuildPart {
  part: string;
  opts?: Record<string, OptionValue>;
}

export type SpendKey = Category | "packing" | "material";

/** Areas the player can spend on for quality, past what the parts give. */
export type QualityKey = "display" | "keyboard" | "trackpad" | "speakers" | "webcam";
export const QUALITY_KEYS: QualityKey[] = ["display", "keyboard", "trackpad", "speakers", "webcam"];

export type PadFinish = "glass" | "matte";

export interface Build {
  /** The builder stage the player was last on, to reopen there. */
  stage?: string;
  year: number;
  body: string;
  layout: string;
  /** Outer base size as the player set it. */
  size: Size;
  parts: Partial<Record<Category, BuildPart[]>>;
  /** Ports. On each wall they sit in this order: from the rear on a side wall, from the left on the front or rear. */
  ports: BuildPort[];
  materials: Record<Piece, string>;
  finish: Record<Piece, { colour: string; texture: string }>;
  spend: Partial<Record<SpendKey, number>>;
  /** Quality spend per area, 0 to 1. Absent means 0. */
  quality?: Partial<Record<QualityKey, number>>;
  /** Power profiles as the player set them. Absent means the part defaults. */
  power?: Record<ProfileId, Profile>;
  /** Retail price in the year's nominal US dollars, as the player set it. */
  price?: number;
  /** The screen spec. Older saves chose a row under parts.display instead. */
  screen?: ScreenSpec;
  place?: Placement;
  /** Keycap shape, colours and legends. Absent means the keyboard's stock caps. */
  keys?: KeySpec;
  /** The screen bezel's colour, hex. Absent means the lid's own. */
  bezel?: string;
  /** The trackpad's colour and surface. Absent means the stock pad (glass from 2015, matte plastic before). */
  pad?: { colour: string; finish: PadFinish };
  /** The keyboard deck (the well and key plate around the caps), hex. Absent means the stock near-black. */
  keyDeck?: string;
  marks?: Mark[];
  /**
   * The signature slider per body id, 0 to 1; 0.5 when absent. Every build made
   * since the body types carries it, so a build without it is an older save.
   */
  shape?: Partial<Record<string, number>>;
  /** Per-side inset multipliers per body id, on bodies whose sides the player sets. Absent means the body's own. */
  sides?: Partial<Record<string, Partial<PerimSides>>>;
  /** Underside curved per body id, on bodies whose taper may curve. Absent means flat. */
  curve?: Partial<Record<string, boolean>>;
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
  /** Turned a quarter in plan: size x and y are swapped from the part's own. */
  turn?: boolean;
  /** The floor role this unit is stacked over. */
  over?: Role;
}

export interface Opening {
  id: string;
  kind: "port" | "vent" | "bay";
  side: Side;
  part?: string;
  /** Span along the side: x on front and rear, y on left and right. */
  u: [Mm, Mm];
  z: [Mm, Mm];
  /** A slotted fan grill: slot width and pitch along u. Without it a vent is one open rectangle. */
  slots?: { width: Mm; pitch: Mm };
  /** A grill on the rear bevel: the outer surface it follows, as (y, z) points from under the base up to the rear face. */
  bevel?: [Mm, Mm][];
}

/** The fan grill as solved: what the player may pick here and what it does to the airflow. */
export interface GrillFit {
  style: GrillStyle;
  /** Whether the vent walls have room for a uniform grill. */
  faceOk: boolean;
  /** Whether the grill may wrap under onto a rear bevel. */
  wrapOk: boolean;
  /** Tallest grill the vent walls take, mm. */
  maxH: Mm;
  /** Effective open area over the stock vents', 0 with no grill. */
  open: number;
  /** Wrap angle from the underside when the grill wraps under, degrees; 0 when it does not. */
  angle: number;
}

export type GrillStyle = "stock" | "none" | "uniform" | "bottom";

export type SpeakerPlace = "none" | "deck" | "front";
export type SpeakerPattern = "dots" | "slots" | "bars" | "hex";

/**
 * One speaker grill panel. On the deck: centred at (cx, cy), s across x and l
 * along y, its holes on the deck's top at their own depth. On the front: on
 * the front face, centred at (cx, cz), s tall and l along x.
 */
export interface SpeakerPanel {
  surface: "deck" | "front";
  cx: Mm;
  cy: Mm;
  cz: Mm;
  s: Mm;
  l: Mm;
}

/** The speaker grill as solved: where it may go and what is drawn. */
export interface SpeakerGrillFit {
  /** Where it is drawn: the player's place where it fits, else the era's stock. */
  place: SpeakerPlace;
  fits: { deck: boolean; front: boolean };
  frontOffered: boolean;
  pattern: SpeakerPattern;
  hole: Mm;
  /** Each pattern's hole range on the drawn panels, and whether its least hole fits two across. */
  range: Record<SpeakerPattern, { min: Mm; max: Mm; ok: boolean }>;
  web: Mm;
  panels: SpeakerPanel[];
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
  style: ResolvedStyle;
  /** Lid in the closed position, in base coordinates. */
  lid: { at: Vec3; size: Size; inner: { at: Vec3; size: Size } };
  /** Floor: inner bottom to the top wall. Deck: the thickest deck layer, down from the top surface. */
  bands: { floor: [Mm, Mm]; deck: [Mm, Mm] };
  cutouts: Opening[];
  /** The fan grill, on builds with fans. */
  grill?: GrillFit;
  /** The speaker grill, on builds with speakers. Drawn only: it is not a cutout. */
  speakerGrill?: SpeakerGrillFit;
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
  | { kind: "compat"; code: "screen"; what: "refresh" | "density" | "size" | "resolution" | "bandwidth" | "brightness" | "gamut" }
  | { kind: "compat"; code: "overlap"; part: string; with: string }
  /** A lid part that does not fit its bezel band: the top bezel above the panel, or the chin below it. */
  | { kind: "compat"; code: "bezel-fit"; part: string; role: string; band: "top" | "chin" }
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
        | "panel"
        | "option";
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
  /** Where the movable parts ended up, with the range each may move in, for the builder. */
  place: PlaceReport;
}

export interface PlaceReport {
  /** `hinge`: the gap from the keyboard's rear edge to the rear inner wall. */
  kb?: { y: number; range: Range; hinge: number };
  pad?: { w: number; d: number; y: number; w0: Range; d0: Range; range: Range };
  cam?: { x: number; range: Range };
  panel?: { y: number; range: Range };
  /** Movable floor parts by slot: where each sits, and the zones it may sit in. */
  parts?: Record<string, { zone: string; turn: boolean; turns: boolean; row?: SpkRow; rows: boolean; zones: { id: string; name: string }[] }>;
  /** One per build port, in build order. Null when the port was not placed. */
  ports: ({ along: number; height: number; box: string } | null)[];
}

export function isZone(n: Node): n is ZoneNode {
  return (n as ZoneNode).zone !== undefined;
}
