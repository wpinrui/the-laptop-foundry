import { type Board, buildBoard } from "./board";
import { checkCompat } from "./compat";
import { CONTENT, type Content, eraFor, indexContent } from "./content";
import { fanSizeOf } from "./fan";
import { grillBevel, grillCutouts, grillOf } from "./grill";
import { speakerGrillFit } from "./speakerGrill";
import {
  alongAxis,
  deal,
  fanSideFor,
  isOpeningZone,
  measure,
  type PlacedUnit,
  type PlanCtx,
  type PlanSolve,
  place,
  placeUnits,
  zonesOf,
} from "./plan";
import {
  baseOffsets,
  cornerKeepOut,
  deckLoss,
  faceFloor,
  hingeAxis,
  lidSideOffset,
  perimZones,
  outerSection,
  profileLift,
  profileTop,
  rearInset,
  resolveStyle,
  scaleWalls,
  sideMult,
  spanBand,
  taperLeft,
} from "./shell";
import type {
  Anchor,
  ResolvedStyle,
  ZoneNode,
  Axis,
  Box,
  Build,
  Era,
  Fit,
  Opening,
  Piece,
  PlaceReport,
  SpkRow,
  Problem,
  Range,
  Role,
  Route,
  Side,
  Size,
  Tune,
  Vec3,
} from "./types";
import { isZone } from "./types";
import { bezelUnits, emit, spendOf, type Unit } from "./units";
import { panelOf } from "./screen";

const AXES: Axis[] = ["x", "y", "z"];
const BLOCK_ROLES = new Set([
  "cpu",
  "gpu",
  "vrm",
  "chipset",
  "mem",
  "m2",
  "wlan",
  "bt",
  "tb",
]);
const EPS = 1e-9;
/** Floor a vapour chamber's plate takes between the chips and the fans, mm. */
const CHAMBER_PLATE = 10;
/** How close the least thickness search gets, mm. */
const Z_TOL = 1e-7;
/**
 * A size within this of its minimum fits: the shape follows the size, so a
 * size set to its own minimum solves back to it only to the last few bits.
 */
const FIT_TOL = 1e-6;

function tune(t: Tune, spend: number): number {
  return t[0] + (t[1] - t[0]) * spend;
}

function wallFor(era: Era, material: string, spend: number): number {
  const t = era.wall[material];
  if (t) return tune(t, spend);
  // Unavailable material (flagged by compat): use the thickest wall of the era.
  return Math.max(...Object.values(era.wall).map((w) => w[0]));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Floor roles auto placement may turn a quarter or move to another zone the layout allows. */
const MOVABLE = new Set<Role>(["drive", "battery", "spk", "odd"]);
/** The least gap between the keyboard's rear edge and the rear inner wall. */
const KB_REAR_GAP = 4;
/** Movable roles that never turn: an optical tray must face its side wall. */
const UPRIGHT = new Set<Role>(["odd"]);

/**
 * Stacking. A drive or an optical drive may sit over the board or a battery
 * instead of beside it, where the chassis is thick enough for both. Over the
 * board it keeps clear of the hot chips and their heat pipes; nothing ever sits
 * over a fan, a fin stack, a hinge or a port. An optical drive still loads from
 * its side wall, so it stacks only flush against that wall.
 */
const STACKERS = new Set<Role>(["drive", "odd"]);
const HOSTS: Role[] = ["board", "battery"];
const HOST_NAMES: Record<string, string> = {
  board: "Over board",
  battery: "Over battery",
};
/** Floor roles a stacked part may reach over besides its host. */
const UNDER_OK = new Set<string>(["board", "battery", "drive", "spk"]);
/** Air between a stacked part and what it sits over, mm. */
const STACK_GAP = 1.5;
/** A port needs its flat band of wall this much taller than itself, mm. */
const PORT_BAND = 0.6;
/** Room kept round a hot chip and its heat pipe, mm. */
const HOT_MARGIN = 6;
const OVER = "over:";
/** A speaker pin that follows the battery: the speaker ends of the battery's row. */
const BESIDE = "beside-battery";

/** A movable part's place: a zone by name (absent: where its role goes) and a quarter turn. */
interface Choice {
  zone?: string;
  turn: boolean;
  /** Speakers: the axis their units line up along, absent the zone's own. */
  row?: SpkRow;
}
/** Rows auto placement tries: a speaker set may line up either way. */
const rowsOf = (role: Role): (SpkRow | undefined)[] =>
  role === "spk" ? [undefined, "x", "y", "bunch"] : [undefined];
type Arrangement = Record<string, Choice>;
type Slot = {
  role: Role;
  zones: ZoneNode[];
  stacks: string[];
  pin: Partial<Choice>;
};

/** Each unit id's slot, worked out once. */
const SLOT_OF = new Map<string, string>();

/** The build slot a unit came from: "storage:1" for the second drive. */
function slotOf(u: Unit): string {
  let slot = SLOT_OF.get(u.id);
  if (slot === undefined) {
    const [cat, n] = u.id.split(":");
    slot = `${cat}:${n}`;
    SLOT_OF.set(u.id, slot);
  }
  return slot;
}

/** Parts that open through their zone's outer face. */
const onFace = (role: Role) =>
  role === "fin" || role === "odd" || role.startsWith("port:");

const sameChoice = (a: Choice, b: Choice) =>
  a.zone === b.zone && a.turn === b.turn && a.row === b.row;

/**
 * Solve a build into an assembly. Pure and deterministic: the same build
 * always gives the same fit. No rendering dependency. Movable floor parts the
 * player left on auto are turned or moved where that needs a smaller base;
 * `auto: false` leaves them where the layout puts them.
 */
export function solve(
  build: Build,
  content: Content = CONTENT,
  opts: { auto?: boolean } = {},
): Fit {
  const fit = solveFit(build, content, opts);
  // The speaker grill is only drawn, so it is laid out once on the settled fit.
  const sg = speakerGrillFit(build, fit.shell.style, fit.shell.outer, fit.boxes, fit.shell.cutouts);
  return sg ? { ...fit, shell: { ...fit.shell, speakerGrill: sg } } : fit;
}

function solveFit(
  build: Build,
  content: Content,
  opts: { auto?: boolean },
): Fit {
  const fixed = opts.auto === false ? "base" : null;
  const shared: Shared = {};
  const fit = solveAt(build, content, fixed, shared);
  const size = fit.shell.outer;
  const short = AXES.filter((a) => fit.frame[a] > size[a] + FIT_TOL);
  if (short.length === 0) return fit;
  // Short axes lay out at their minimum. The body's shape follows the size, so
  // the parts are laid out again in the frame, in the same places, with the
  // shape resolved there: at the drawn size a spine or a lift chamfer is sized
  // for a smaller base than the parts are laid out in.
  const again = solveAt(
    { ...build, size: { ...fit.frame } },
    content,
    arrangementOf.get(fit) ?? fixed ?? "base",
    shared,
  );
  // The minimum is where the frame settled; what is short or too big is
  // measured against the player's size, and the rest stands as solved there.
  const min: Size = { ...again.min };
  for (const a of short) min[a] = again.frame[a];
  const lim = content.bodies.find((b) => b.id === build.body)?.limits;
  const problems: Problem[] = fit.problems.filter((p) => p.kind !== "geometry");
  for (const a of AXES)
    if (lim && min[a] > lim[a][1] + FIT_TOL)
      problems.push({ kind: "geometry", code: "too-big", axis: a, by: min[a] - lim[a][1] });
  for (const a of AXES)
    if (size[a] < min[a] - FIT_TOL)
      problems.push({ kind: "geometry", code: "short", axis: a, by: min[a] - size[a] });
  return { ...again, min, problems, shell: { ...again.shell, outer: size } };
}

/** The arrangement each solved fit was laid out with. */
const arrangementOf = new WeakMap<Fit, Arrangement>();

/**
 * What every layout of one build shares: its compatibility problems, which
 * do not depend on the size or the arrangement.
 */
interface Shared {
  compat?: Problem[];
}

/**
 * A plan's minimum and problems so far, before the rest is laid out: false
 * when that already rules the plan out, so the rest need not be.
 */
type Gate = (min: Size, problems: Problem[]) => boolean;

function solveAt(build: Build, content: Content, fixed: Arrangement | "base" | null, shared: Shared): Fit;
function solveAt(
  build: Build,
  content: Content,
  fixed: Arrangement | "base" | null,
  shared: Shared,
  gate: Gate,
): Fit | null;
function solveAt(
  build: Build,
  content: Content,
  fixed: Arrangement | "base" | null,
  shared: Shared,
  gate?: Gate,
): Fit | null {
  const idx = indexContent(content);
  const body = idx.bodies.get(build.body);
  const layout = idx.layouts.get(build.layout);
  if (!body) throw new Error(`Unknown body: ${build.body}`);
  if (!layout) throw new Error(`Unknown layout: ${build.layout}`);
  const deckPlan = idx.plans.get(layout.deck);
  const lidPlan = idx.plans.get(layout.lid);
  if (!deckPlan || !lidPlan)
    throw new Error(`Layout ${layout.id} references a missing plan`);
  const era = eraFor(build.year, content.eras);
  shared.compat ??= checkCompat(build, idx, era, body, layout);
  const problems: Problem[] = [...shared.compat];
  const lim = body.limits;
  const size: Size = {
    x: clamp(build.size.x, lim.x[0], lim.x[1]),
    y: clamp(build.size.y, lim.y[0], lim.y[1]),
    z: clamp(build.size.z, lim.z[0], lim.z[1]),
  };
  // The body's shape at the drawn size and the player's signature setting.
  const style = resolveStyle(
    body.style,
    size,
    build.shape?.[body.id],
    Infinity,
    build.sides?.[body.id],
    !!build.curve?.[body.id],
  );

  // Walls, gaps and styling allowance.
  const matSpend = spendOf(build, "material");
  const gap = tune(era.gap, spendOf(build, "packing"));
  const wf = wallFor(era, build.materials.floor, matSpend);
  const wd = wallFor(era, build.materials.deck, matSpend);
  const wl = wallFor(era, build.materials.lid, matSpend);
  // A panel under cover glass is the lid's front face: no front wall over it.
  const panel = panelOf(build, content);
  const coverGlass = !!(panel && idx.panelTypes.get(panel.type)?.coverGlass);
  const walls = scaleWalls(style, {
    bottom: wf,
    top: wd,
    side: Math.max(wf, wd),
    lid: wl,
    lidFront: coverGlass ? 0 : wl,
  });
  const off = baseOffsets(style, walls);
  const sl = lidSideOffset(style, walls.lid);
  // The floor's plan ends this far in from the rear face (the spine rounds it off).
  const offRear = rearInset(style, off, walls.bottom);

  // Units and the derived mainboard.
  const em = emit(build, idx, era, body);
  // A perimeter body's underside curves up at its edges: a removable pack cannot
  // form it, so the pack goes inside on the floor like any other.
  if (style.pm) for (const u of em.floor) delete u.skin;
  // The player's trackpad size, within reach of the part's own.
  const player = build.place ?? {};
  const report: PlaceReport = { ports: build.ports.map(() => null) };
  const padUnit = em.deck.find((u) => u.role === "pad");
  const padW0: Range = padUnit
    ? [Math.round(padUnit.size.x * 0.6), Math.round(padUnit.size.x * 1.4)]
    : [0, 0];
  const padD0: Range = padUnit
    ? [Math.round(padUnit.size.y * 0.6), Math.round(padUnit.size.y * 1.4)]
    : [0, 0];
  if (padUnit) {
    if (player.pad?.w) padUnit.size.x = clamp(player.pad.w, padW0[0], padW0[1]);
    if (player.pad?.d) padUnit.size.y = clamp(player.pad.d, padD0[0], padD0[1]);
  }
  const cooler =
    em.fans === 0
      ? era.spreader
      : em.chamber
        ? (era.vapourChamber ?? era.heatPipe)
        : era.heatPipe;
  const board = buildBoard(em.blocks, era, gap, cooler);
  const hasCpu = em.blocks.some((b) => b.role === "cpu");
  const floorUnits: Unit[] = [...em.floor];
  if (em.blocks.length > 0 || hasCpu)
    floorUnits.push({ id: "board", role: "board", size: { ...board.size } });
  const lidUnits: Unit[] = [...bezelUnits(era, sl, panel?.bezel), ...em.lid];
  const lidInnerZ = lidUnits.reduce((m, u) => Math.max(m, u.size.z), 0);
  const lidZ = lidInnerZ + walls.lid + walls.lidFront;
  // A shelf rises no more than the lid is thick.
  style.R = Math.min(style.R, lidZ);
  // A grill wrapped under the rear cuts a bevel along the rear bottom edge.
  const grill = grillOf(build);
  const ventSides = em.fans > 0 ? zonesOf(layout.floor).flatMap((z) => (z.takes.includes("fin") && z.edge ? [z.edge] : [])) : [];
  style.bevel = grillBevel(grill, style, size, ventSides);
  // Depth the deck and the lid give up at the rear: to a spine, or to a shelf behind an inset hinge.
  const deckCut = deckLoss(style, lidZ);
  const lidCut = size.y - Math.min(size.y, hingeAxis(style, size, lidZ).y);
  // The least outer size each plan needs, from its plan minimum.
  const needX = (f: number, d: number, l: number) =>
    Math.max(f + 2 * off.side, d + 2 * off.side, l + 2 * sl);
  const needY = (f: number, d: number, l: number) =>
    Math.max(
      f + off.side + offRear,
      d + 2 * off.side + deckCut,
      l + 2 * sl + lidCut,
    );

  // The keyboard and trackpad sit in wells in the top case, flush with the top
  // surface, on the deck structure. Over them the floor runs up to that layer;
  // elsewhere it runs up to the top wall. The top wall does not add over a well.
  // Corner bumpers stand proud of the top surface by q: the surface is that far down.
  const deckLayer = (u: Unit) =>
    u.spacer ? 0 : u.size.z + era.deckExtra + style.q;
  const DB = em.deck.reduce((m, u) => Math.max(m, deckLayer(u)), 0);
  const pTop = profileTop(style);

  // Sustained chip heat, shared over the fans.
  const sustained = (cat: "processor" | "graphics") => {
    const part = idx.parts.get(build.parts[cat]?.[0]?.part ?? "");
    const own =
      build.power?.high?.[cat === "processor" ? "cpu" : "gpu"]?.sustained;
    return part?.power ? Math.max(part.power.sustained, own ?? 0) : 0;
  };
  const chipWatts = sustained("processor") + sustained("graphics");
  // Each fan is sized for the whole chip heat, as one fan would be: a second
  // fan adds its airflow on top, so two fans take about twice one's floor.
  const fanWatts = em.fans > 0 && chipWatts > 0 ? chipWatts : undefined;
  const lift = profileLift(style, off.bottom);
  // On a perimeter body each side's wall stands vertical at its own height.
  const liftOn = (side: Side | false | undefined) => (side ? profileLift(style, off.bottom, side) : 0);
  const topOn = (side: Side | false | undefined) => (side ? profileTop(style, side) : 0);
  const liftBy: Partial<Record<Side, number>> = {};
  if (style.pm) for (const sd of ["left", "right", "front", "rear"] as Side[]) liftBy[sd] = liftOn(sd);
  // Cooling takes floor: the fans and fin stacks reserve the size that heat
  // needs at the height the fans get under the top case at the player's
  // thickness (thinner needs wider), up to the middle of the era's fan range.
  // Past that a fan only grows into free room.
  const fanUnit = em.floor.find((u) => u.role === "fan");
  let fanSide: number | undefined;
  // The player's fan size holds each fan at that diameter, room or not.
  const fanFixed = fanUnit ? fanSizeOf(build) : undefined;
  if (fanFixed !== undefined) {
    fanSide = fanFixed;
    for (const u of em.floor)
      if (u.role === "fan") u.size = { ...u.size, x: fanFixed, y: fanFixed };
  } else if (fanUnit && fanWatts !== undefined) {
    const band =
      clamp(build.size.z, body.limits.z[0], body.limits.z[1]) -
      off.bottom -
      Math.max(DB, off.top) -
      lift;
    const fz = clamp(band, fanUnit.size.z, era.fan.max.z);
    fanSide = clamp(
      fanSideFor(fanWatts, fz),
      era.fan.min.x,
      (era.fan.min.x + era.fan.max.x) / 2,
    );
  }
  const floorCtx: PlanCtx = {
    gap,
    ko: cornerKeepOut(style, off.side),
    lift,
    liftBy,
    liftAbs: !!style.pm,
    // A removable pack forms the underside in place of the bottom wall, flush
    // with the outer bottom, which bumpers stand proud of.
    bottom: walls.bottom,
    era,
    finDepth: em.finDepth,
    fanWatts,
    fanSide,
    fanFixed,
    // A vapour chamber's plate reaches in from the fans to the chips.
    plate: em.chamber ? CHAMBER_PLATE : 0,
    // Ports sit a fixed finger's width apart: roomier on older machines.
    portGap: build.year < 2012 ? 6 : build.year < 2020 ? 5 : 4,
  };
  const flatCtx: PlanCtx = {
    gap: 0,
    ko: 0,
    lift: 0,
    bottom: 0,
    era,
    finDepth: em.finDepth,
  };

  // The player moves the keyboard forward or back from its place by the hinge and sets the
  // trackpad's gap in front of it. Both stay centred left to right.
  const seatDeck = (placed: PlacedUnit[], deckFootY: number) => {
    const K = placed.find((u) => u.role === "keys");
    const P = placed.find((u) => u.role === "pad");
    if (!K) return undefined;
    const MIN_GAP = 2;
    const front = off.side + 2;
    // It may also move back over the hinge strip, up to a small gap from the rear wall.
    const rear = off.side + deckFootY;
    const kbMin = -Math.max(0, rear - KB_REAR_GAP - (K.at.y + K.size.y));
    const kbMax = Math.max(0, K.at.y - front - (P ? P.size.y + MIN_GAP : 0));
    const ky = clamp(player.kb?.y ?? 0, kbMin, kbMax);
    const autoGap = P ? K.at.y - (P.at.y + P.size.y) : 0;
    K.at.y -= ky;
    const kb = {
      y: ky,
      range: [kbMin, kbMax] as Range,
      hinge: rear - (K.at.y + K.size.y),
    };
    if (!P) return { kb };
    // The gap never pushes the pad past the front wall, even on a palm rest only the pad deep.
    const gLo = Math.min(MIN_GAP, Math.max(0, K.at.y - off.side - P.size.y));
    const gMax = Math.max(gLo, K.at.y - front - P.size.y);
    const g = clamp(player.pad?.y ?? autoGap, gLo, gMax);
    P.at.y = K.at.y - g - P.size.y;
    return {
      kb,
      pad: {
        w: P.size.x,
        d: P.size.y,
        y: g,
        w0: padW0,
        d0: padD0,
        range: [gLo, gMax] as Range,
      },
    };
  };
  /** What the player won back by moving the keyboard over the strip behind it. */
  const kbBackOf = (stripY: number) =>
    Math.min(
      Math.max(0, -(player.kb?.y ?? 0)),
      Math.max(0, stripY - KB_REAR_GAP),
    );

  // Movable floor parts, by slot, with the zones each may sit in and the player's pins.
  const floorZones = zonesOf(layout.floor);
  // The speaker zone at the ends of the row (a front-to-rear band of the floor) holding a zone.
  const rows = isZone(layout.floor) ? [layout.floor] : layout.floor.children;
  const spkBeside = (zone: string): string | undefined => {
    const row = rows.find((r) => zonesOf(r).some((z) => z.zone === zone));
    return row
      ? zonesOf(row).find(
          (z) => z.name && (z.takes.includes("spk") || z.may?.includes("spk")),
        )?.zone
      : undefined;
  };
  const batteryZones = floorZones.filter(
    (z) => z.takes.includes("battery") || z.may?.includes("battery"),
  );
  const besideOk = batteryZones.some((z) => spkBeside(z.zone) !== undefined);
  const slots = new Map<string, Slot>();
  for (const u of floorUnits) {
    if (!MOVABLE.has(u.role) || !u.part) continue;
    const key = slotOf(u);
    if (slots.has(key)) continue;
    // Zones sharing a name are one place, known by the first of them.
    const zones = floorZones.filter(
      (z, i) =>
        z.name &&
        (z.takes.includes(u.role) || z.may?.includes(u.role)) &&
        !floorZones
          .slice(0, i)
          .some(
            (z2) =>
              z2.name === z.name &&
              (z2.takes.includes(u.role) || z2.may?.includes(u.role)),
          ),
    );
    const pinned = player.parts?.[key];
    const pin: Partial<Choice> = {};
    if (UPRIGHT.has(u.role)) pin.turn = false;
    // Older saves may hold a turn this no longer knows: that is auto.
    else if (typeof pinned?.turn === "boolean") pin.turn = pinned.turn;
    if (u.role === "spk" && (pinned?.row === "x" || pinned?.row === "y" || pinned?.row === "bunch"))
      pin.row = pinned.row;
    const stacks = STACKERS.has(u.role)
      ? HOSTS.filter((h) => floorUnits.some((f) => f.role === h)).map(
          (h) => OVER + h,
        )
      : [];
    const pz = zones.find((z) => z.zone === pinned?.zone);
    if (pz) pin.zone = pz.zone;
    else if (pinned?.zone && stacks.includes(pinned.zone))
      pin.zone = pinned.zone;
    else if (pinned?.zone === BESIDE && u.role === "spk" && besideOk)
      pin.zone = BESIDE;
    slots.set(key, { role: u.role, zones, stacks, pin });
  }
  const base: Arrangement = {};
  for (const [key, sl0] of slots)
    base[key] = {
      zone: sl0.pin.zone,
      turn: sl0.pin.turn ?? false,
      ...(sl0.pin.row ? { row: sl0.pin.row } : {}),
    };
  const batteryKey = [...slots].find(([, s]) => s.role === "battery")?.[0];
  const arranged = (arr: Arrangement): Unit[] =>
    floorUnits.map((u) => {
      let c = MOVABLE.has(u.role) && u.part ? arr[slotOf(u)] : undefined;
      // Beside the battery: wherever the battery sits in this plan.
      if (c?.zone === BESIDE) {
        const bz =
          (batteryKey ? arr[batteryKey]?.zone : undefined) ??
          batteryZones.find((z) => z.takes.includes("battery"))?.zone;
        c = { ...c, zone: bz ? spkBeside(bz) : undefined };
      }
      if (!c || (!c.zone && !c.turn && !c.row)) return u;
      const over = c.zone?.startsWith(OVER)
        ? (c.zone.slice(OVER.length) as Role)
        : undefined;
      return {
        ...u,
        size: c.turn
          ? { x: u.size.y, y: u.size.x, z: u.size.z }
          : { ...u.size },
        ...(c.zone && !over ? { to: c.zone } : {}),
        ...(over ? { over } : {}),
        ...(c.turn ? { turn: true } : {}),
        ...(c.row ? { row: c.row } : {}),
      };
    });
  const oddSide =
    zonesOf(layout.floor).find(
      (z) => z.edge && (z.takes.includes("odd") || z.may?.includes("odd")),
    )?.edge ?? "right";

  // Plans auto placement found that need a smaller base, checked in full at the end.
  let choice: Arrangement[] = [];
  if (fixed === null) {
    const lmin = measure(
      lidPlan.root,
      deal(lidPlan.root, lidUnits).fills,
      flatCtx,
    ).mins.get(lidPlan.root) ?? { x: 0, y: 0 };
    const room = size;
    // On a tapered body where each part sits along the depth sets the
    // thickness, so auto placement weighs that too.
    const tp = style.taper;
    /**
     * Least thickness at which something needing `h` mm on a flat body (walls,
     * part and cover) fits at depth y0 of a base Y deep: the taper lifts the
     * floor there by its drop times how far the taper has yet to run.
     */
    const taperZ = (y0: number, h: number, Y: number): number => {
      if (!tp) return h;
      const g = taperLeft(tp, Math.max(y0, off.side) / (tp.run * Y));
      const mf = tp.minFront;
      if (h <= mf) return h;
      const zb = mf / tp.front;
      if (h <= zb * (1 - g) + g * mf) return (h - g * mf) / (1 - g);
      return h / (1 - g * (1 - tp.front));
    };
    const decks = new Map<number, PlanSolve>();
    const planMin = (arr: Arrangement, bar?: number) => {
      // The plan minimum alone: floor and deck, the deck's hinge strip behind a rear battery.
      const all = arranged(arr);
      const ups = all.filter((u) => u.over);
      const d = deal(
        layout.floor,
        ups.length > 0 ? all.filter((u) => !u.over) : all,
      );
      const fl = measure(layout.floor, d.fills, floorCtx);
      let strip = 0;
      for (const f of fl.fills.values())
        if (f.min && f.node.edge === "rear" && f.node.takes.includes("battery"))
          strip = Math.max(strip, f.min.y);
      const fmin = fl.mins.get(fl.root) ?? { x: 0, y: 0 };
      // The deck only changes with the strip behind a rear battery.
      let dk = decks.get(strip);
      if (!dk) {
        const deckUnits = em.deck.map((u) =>
          u.role === "hinge-strip"
            ? { ...u, size: { ...u.size, y: Math.max(u.size.y, strip) } }
            : u,
        );
        dk = measure(
          deckPlan.root,
          deal(deckPlan.root, deckUnits).fills,
          flatCtx,
        );
        decks.set(strip, dk);
      }
      const dmin = dk.mins.get(deckPlan.root) ?? { x: 0, y: 0 };
      const kbBackHere = kbBackOf(
        Math.max(
          em.deck.find((u) => u.role === "hinge-strip")?.size.y ?? 0,
          strip,
        ),
      );
      const m = {
        x: needX(fmin.x, dmin.x, lmin.x),
        y: needY(fmin.y, dmin.y - kbBackHere, lmin.y),
        z: undefined as number | undefined,
        lost: d.unplaced.length,
      };
      if (ups.length === 0 && !tp) return m;
      // Before laying anything out: a stack that cannot beat the bar, or
      // could not fit under the player's thickness even over the lowest host,
      // is out. A removable pack starts on the outer bottom.
      const low = (h: Role | undefined) =>
        h === "board"
          ? off.bottom + board.size.z
          : Math.min(
              ...floorUnits
                .filter((f) => f.role === h)
                .map(
                  (f) =>
                    (f.skin ? off.bottom - walls.bottom : off.bottom) +
                    f.size.z,
                ),
            );
      if (
        bar !== undefined &&
        (m.x <= room.x + 1e-6 && m.y <= room.y + 1e-6 ? 0 : 1e9) + m.x * m.y >=
          bar
      ) {
        m.lost = Infinity;
        return m;
      }
      if (
        !tp &&
        ups.some(
          (u) => low(u.over) + STACK_GAP + u.size.z + off.top > room.z + 1e-6,
        )
      ) {
        m.z = Infinity;
        return m;
      }
      // A stack: lay the floor out at its tightest, where a stack has least room,
      // then find each stacked part its place and the thickness it needs there.
      // A taper: lay it out at the player's size, where the depth of each part counts.
      const Y = tp ? Math.max(room.y, m.y) : m.y;
      const X = tp ? Math.max(room.x, m.x) : m.x;
      const foot = { x: X - 2 * off.side, y: Y - off.side - offRear };
      const at0 = { x: off.side, y: off.side };
      place(fl, at0, foot);
      place(dk, at0, { x: foot.x, y: Y - 2 * off.side - deckCut });
      const top: PlacedUnit[] = [];
      for (const f of dk.fills.values())
        top.push(...placeUnits(f, flatCtx, 0, 0));
      if (tp) seatDeck(top, Y - 2 * off.side - deckCut);
      // The thickness the rest of the floor needs once the stacked parts leave it.
      let z = off.bottom + off.top;
      for (const u of top)
        if (!u.spacer)
          z = Math.max(
            z,
            taperZ(u.at.y, off.bottom + Math.max(deckLayer(u), off.top), Y),
          );
      const laid: PlacedUnit[] = [];
      for (const f of fl.fills.values()) {
        const opening = isOpeningZone(f);
        for (const u of placeUnits(f, floorCtx, off.bottom, 0)) {
          laid.push(u);
          z = Math.max(
            z,
            taperZ(
              u.at.y,
              u.at.z +
                u.size.z +
                Math.max(
                  coverIn(top, u.at, u.size, deckLayer),
                  off.top,
                  opening ? pTop : 0,
                ),
              Y,
            ),
          );
        }
      }
      const ground = stackGround(laid, board, em.chamber);
      const inner = {
        x0: off.side,
        y0: off.side,
        x1: off.side + foot.x,
        y1: off.side + foot.y,
      };
      for (const u of ups) {
        const at = stackAt(
          u,
          ground,
          inner,
          u.role === "odd" ? oddSide : undefined,
          off.bottom,
          floorCtx.ko,
        );
        if (!at) {
          m.lost++;
          continue;
        }
        ground.push({
          x0: at.x,
          y0: at.y,
          x1: at.x + u.size.x,
          y1: at.y + u.size.y,
          top: Infinity,
          host: undefined,
        });
        z = Math.max(
          z,
          taperZ(
            at.y,
            at.z +
              u.size.z +
              Math.max(
                coverIn(top, at, u.size, deckLayer),
                off.top,
                u.role === "odd" ? pTop : 0,
              ),
            Y,
          ),
        );
      }
      m.z = z;
      return m;
    };
    // The search meets many plans more than once: each is laid out once.
    const seen = new Map<string, ReturnType<typeof planMin>>();
    const keys = [...slots.keys()];
    choice = arrange(slots, base, room, !!tp, (arr, bar) => {
      let key = bar === undefined ? "" : String(bar);
      for (const k of keys) {
        const c = arr[k];
        key += `\u0001${c.zone ?? "\u0002"}\u0003${c.turn}\u0003${c.row ?? ""}`;
      }
      let m = seen.get(key);
      if (!m) {
        m = planMin(arr, bar);
        seen.set(key, m);
      }
      return m;
    });
  }
  const arr = fixed === null || fixed === "base" ? base : fixed;
  const floorArranged = arranged(arr);
  floorUnits.length = 0;
  floorUnits.push(...floorArranged.filter((u) => !u.over));
  // Parts stacked over another: placed once the floor under them is laid out.
  const stacked = floorArranged.filter((u) => u.over);

  const floorDeal = deal(layout.floor, floorUnits);
  report.parts = {};
  for (const [key, sl0] of slots) {
    let at: string | undefined;
    for (const f of floorDeal.fills.values())
      if (
        !at &&
        f.units.some((u) => u.part && MOVABLE.has(u.role) && slotOf(u) === key)
      )
        at = f.node.zone;
    const up = stacked.find((u) => u.part && slotOf(u) === key);
    if (up?.over) at = OVER + up.over;
    const head = sl0.zones.find(
      (z) => z.name && z.name === floorZones.find((f) => f.zone === at)?.name,
    );
    if (head) at = head.zone;
    report.parts[key] = {
      zone: at ?? "",
      turn: arr[key]?.turn ?? false,
      turns: !UPRIGHT.has(sl0.role),
      ...(arr[key]?.row ? { row: arr[key].row } : {}),
      rows: sl0.role === "spk",
      zones: [
        ...sl0.zones.map((z) => ({ id: z.zone, name: z.name ?? z.zone })),
        ...sl0.stacks.map((id) => ({
          id,
          name: HOST_NAMES[id.slice(OVER.length)] ?? id,
        })),
        ...(sl0.role === "spk" && besideOk
          ? [{ id: BESIDE, name: "Beside battery" }]
          : []),
      ],
    };
  }
  const deckDeal = deal(deckPlan.root, em.deck);
  const lidDeal = deal(lidPlan.root, lidUnits);
  const seenNoRoom = new Set<string>();
  for (const u of [
    ...floorDeal.unplaced,
    ...deckDeal.unplaced,
    ...lidDeal.unplaced,
  ]) {
    const key = `${u.part ?? u.id}|${u.role}`;
    if (seenNoRoom.has(key)) continue;
    seenNoRoom.add(key);
    problems.push({
      kind: "compat",
      code: "no-room",
      part: u.part ?? u.id,
      role: u.role,
    });
  }

  const floor = measure(layout.floor, floorDeal.fills, floorCtx);
  // Where the battery sits on the rear edge, the keyboard sits in front of it, not over it.
  for (const f of floor.fills.values()) {
    if (f.min && f.node.edge === "rear" && f.node.takes.includes("battery"))
      for (const u of em.deck)
        if (u.role === "hinge-strip") u.size.y = Math.max(u.size.y, f.min.y);
  }
  const deck = measure(deckPlan.root, deckDeal.fills, flatCtx);
  const lid = measure(lidPlan.root, lidDeal.fills, flatCtx);
  const m2 = (ps: PlanSolve) => ps.mins.get(ps.root) ?? { x: 0, y: 0 };
  const fm = m2(floor);
  // The deck's own minimum, less what the player won back by moving the
  // keyboard over the strip behind it (the hinge strip or a rear battery).
  const dm0 = m2(deck);
  const stripY = em.deck.find((u) => u.role === "hinge-strip")?.size.y ?? 0;
  const kbBack = kbBackOf(stripY);
  const dm = { x: dm0.x, y: dm0.y - kbBack };
  const lm = m2(lid);

  // x and y first: placement in plan does not depend on z.
  const minX = needX(fm.x, dm.x, lm.x);
  const minY = needY(fm.y, dm.y, lm.y);
  // Ports that need more wall than the player's size gives: without that
  // wall's ports the floor would fit, so they are what does not.
  for (const side of new Set(build.ports.map((p) => p.side))) {
    const role = `port:${side}`;
    const e = alongAxis(side);
    const need = e === "x" ? minX : minY;
    if (size[e] >= need - 0.01) continue;
    const rest = floorUnits.filter((u) => u.role !== role);
    const wm = m2(
      measure(layout.floor, deal(layout.floor, rest).fills, floorCtx),
    );
    const without =
      e === "x" ? needX(wm.x, dm.x, lm.x) : needY(wm.y, dm.y, lm.y);
    if (without >= need - 0.01) continue;
    for (const u of floorUnits) {
      if (u.role !== role || !u.part || seenNoRoom.has(`${u.part}|${u.role}`))
        continue;
      seenNoRoom.add(`${u.part}|${u.role}`);
      problems.push({
        kind: "compat",
        code: "no-room",
        part: u.part,
        role: u.role,
      });
    }
  }
  const FX = Math.max(size.x, minX);
  const FY = Math.max(size.y, minY);
  const innerFoot = { x: FX - 2 * off.side, y: FY - off.side - offRear };
  const deckFoot = { x: FX - 2 * off.side, y: FY - 2 * off.side - deckCut };
  // The lid ends at the hinge axis: short of the rear on a spine or an inset hinge.
  const LY = FY - lidCut;
  place(floor, { x: off.side, y: off.side }, innerFoot);
  place(deck, { x: off.side, y: off.side }, deckFoot);
  // Lid frame: y = 0 at the hinge. Placed in lid-local coordinates, mapped to the closed position below.
  place(lid, { x: sl, y: sl }, { x: FX - 2 * sl, y: LY - 2 * sl });

  // Deck units in plan, then the deck layer over each floor zone.
  const deckPlaced: PlacedUnit[] = [];
  for (const zone of zonesOf(deckPlan.root)) {
    const fill = deck.fills.get(zone);
    if (fill?.min && fill.at && fill.size)
      deckPlaced.push(...placeUnits(fill, flatCtx, 0, 0));
  }
  const seated = seatDeck(deckPlaced, deckFoot.y);
  if (seated) {
    report.kb = seated.kb;
    if (seated.pad) report.pad = seated.pad;
  }
  const coverOver = (
    at: { x: number; y: number },
    sz: { x: number; y: number },
  ) => coverIn(deckPlaced, at, sz, deckLayer);
  // Minimum z at this footprint. Each floor part needs its own height plus
  // whatever sits over it: the deck layer where a keyboard or trackpad covers
  // that part, else the top wall; openings also stay clear of the top edge
  // profile. Parts are laid out in plan first, at their thinnest (fans unfilled).
  // The body's shape sets the room at each depth: a taper lifts the floor toward
  // the front, a spine drops it at the rear, a shelf raises the top behind the
  // hinge, bumpers and an undercut take height. Most of the shape follows the
  // thickness, so the least thickness is searched with the shape resolved at
  // each thickness tried; the plan stays as laid out at the drawn size.
  const bandAt = (y0: number, y1: number, Z: number, x0?: number, x1?: number) =>
    spanBand(style, { x: FX, y: FY, z: Z }, off, walls.bottom, y0, y1, x0, x1);
  const shapes = new Map<number, { s: ResolvedStyle; o: typeof off }>();
  const shapeAt = (Z: number) => {
    let r = shapes.get(Z);
    if (!r) {
      const s = resolveStyle(
        body.style,
        { ...size, z: Z },
        build.shape?.[body.id],
        lidZ,
        build.sides?.[body.id],
        !!build.curve?.[body.id],
      );
      s.bevel = grillBevel(grill, s, { ...size, z: Z }, ventSides);
      const o = baseOffsets(s, walls);
      r = { s, o };
      shapes.set(Z, r);
    }
    return r;
  };
  /**
   * Least thickness at which `slack` (room to spare at a thickness) is not
   * negative, or `fallback` where no thickness gives room. Only the greatest
   * need counts: a part that fits the thickness found so far needs no search.
   * Otherwise the room grows about as fast as the thickness, so the search
   * steps along the line through the bracket's ends (Illinois false
   * position), halving where that stalls. It ends on a thickness that fits.
   */
  const leastZ = (slack: (Z: number) => number, fallback: () => number): number => {
    let lo = minZ;
    let fLo = slack(lo);
    if (fLo >= 0) return lo;
    let hi = 2 * lim.z[1];
    let fHi = slack(hi);
    if (fHi < 0) return fallback();
    let side = 0;
    for (let i = 0; i < 40 && hi - lo > Z_TOL && fHi > Z_TOL; i++) {
      let c = hi - (fHi * (hi - lo)) / (fHi - fLo);
      if (!(c > lo + Z_TOL / 4 && c < hi - Z_TOL / 4) || i % 6 === 5)
        c = (lo + hi) / 2;
      const fc = slack(c);
      if (fc >= 0) {
        hi = c;
        fHi = fc;
        if (side === 1) fLo /= 2;
        side = 1;
      } else {
        lo = c;
        fLo = fc;
        if (side === -1) fHi /= 2;
        side = -1;
      }
    }
    return hi;
  };
  /**
   * Least thickness at which a part `stack` mm tall over the floor (an
   * opening's lift aside), with `cover` mm of deck layer over it, fits over
   * this footprint. `opening` is the side the part opens out of, if any;
   * `face` when the part opens through that side's face.
   */
  const zFor = (
    y0: number,
    y1: number,
    stack: number,
    cover: number,
    opening: Side | false | undefined,
    x0?: number,
    x1?: number,
    face?: boolean,
    port?: number,
  ): number =>
    leastZ(
      (Z) => {
        const { s, o } = shapeAt(Z);
        const outer = { x: FX, y: FY, z: Z };
        const b = spanBand(s, outer, o, walls.bottom, y0, y1, x0, x1);
        if (!b) return -1;
        const top = Math.max(cover, o.top, opening ? profileTop(s, opening) : 0);
        const lift = opening ? profileLift(s, o.bottom, opening) : 0;
        // On a perimeter body an opening sits in its side's flat band, however far the floor rises under the edge.
        let base = s.pm ? Math.max(b[0], o.bottom + lift) : b[0] + lift;
        // A part that opens through its face also stays on that face's flat.
        if (face && opening) base = Math.max(base, faceFloor(s, outer, opening, y0, y1));
        const fits = b[1] + o.top - (base + stack + top);
        if (port === undefined || !opening || !s.pm) return fits;
        // A port needs its side's flat band of wall, between the edge zones, to stand in with room to spare.
        const zs = perimZones(s.pm, sideMult(s.pm, opening));
        return Math.min(fits, Z - zs.hB - zs.hT - (port + PORT_BAND));
      },
      () => off.bottom + stack + liftOn(opening) + Math.max(cover, off.top, topOn(opening)),
    );
  /**
   * Least thickness for a part stacked at `at` over the parts laid out under
   * it, as the final layout seats it: on the tallest of them, each on the
   * floor under its own span as the body's shape leaves it.
   */
  const zForStack = (
    at: Vec3,
    u: Unit,
    under: PlacedUnit[],
    cover: number,
    opening: Side | false | undefined,
  ): number => {
    const x0 = at.x;
    const x1 = at.x + u.size.x;
    const y0 = at.y;
    const y1 = at.y + u.size.y;
    return leastZ(
      (Z) => {
        const { s, o } = shapeAt(Z);
        const outer = { x: FX, y: FY, z: Z };
        const b = spanBand(s, outer, o, walls.bottom, y0, y1, x0, x1);
        if (!b) return -1;
        let base = b[0];
        for (const g of under) {
          const gb = spanBand(s, outer, o, walls.bottom, g.at.y, g.at.y + g.size.y, g.at.x, g.at.x + g.size.x);
          if (!gb) return -1;
          base = Math.max(base, gb[0] + g.at.z - off.bottom + g.size.z);
        }
        base += STACK_GAP;
        if (opening) base = Math.max(base, faceFloor(s, outer, opening, y0, y1));
        const top = Math.max(cover, o.top, opening ? profileTop(s, opening) : 0);
        return b[1] + o.top - (base + u.size.z + top);
      },
      () => at.z + u.size.z + liftOn(opening) + Math.max(cover, off.top, topOn(opening)),
    );
  };
  let minZ = off.bottom + off.top;
  const cover = new Map<unknown, number>();
  const laid: PlacedUnit[] = [];
  // What each part needs, tallest first, so most need no search.
  const needs: Parameters<typeof zFor>[] = [];
  for (const f of floor.fills.values()) {
    if (!f.min || !f.at || !f.size) continue;
    const opening = isOpeningZone(f) && f.node.edge;
    let zoneCover = 0;
    for (const u of placeUnits(f, floorCtx, off.bottom, 0)) {
      laid.push(u);
      const c = coverOver(u.at, u.size);
      zoneCover = Math.max(zoneCover, c);
      const stack = u.at.z - off.bottom - liftOn(opening) + u.size.z;
      needs.push([
        u.at.y,
        u.at.y + u.size.y,
        stack,
        c,
        opening,
        u.at.x,
        u.at.x + u.size.x,
        onFace(u.role),
        u.role.startsWith("port:") ? u.size.z : undefined,
      ]);
    }
    cover.set(f.node, zoneCover);
  }
  for (const u of deckPlaced)
    if (!u.spacer)
      needs.push([u.at.y, u.at.y + u.size.y, 0, deckLayer(u), false, u.at.x, u.at.x + u.size.x]);
  needs.sort((a, b) => b[2] + b[3] - (a[2] + a[3]));
  for (const n of needs) minZ = Math.max(minZ, zFor(...n));

  // Stacked parts: each over its host, as low as what lies under it allows.
  const placedStack: PlacedUnit[] = [];
  const inner = {
    x0: off.side,
    y0: off.side,
    x1: off.side + innerFoot.x,
    y1: off.side + innerFoot.y,
  };
  const under = stackGround(laid, board, em.chamber);
  for (const u of stacked) {
    const at = stackAt(
      u,
      under,
      inner,
      u.role === "odd" ? oddSide : undefined,
      off.bottom,
      floorCtx.ko,
    );
    if (!at) {
      if (u.part && !seenNoRoom.has(`${u.part}|${u.role}`)) {
        seenNoRoom.add(`${u.part}|${u.role}`);
        problems.push({
          kind: "compat",
          code: "no-room",
          part: u.part,
          role: u.role,
        });
      }
      continue;
    }
    const p: PlacedUnit = {
      ...u,
      at,
      size: { ...u.size },
      zone: `${OVER}${u.over}:${u.id}`,
    };
    placedStack.push(p);
    // Nothing else stacks on a stacked part.
    under.push({
      x0: at.x,
      y0: at.y,
      x1: at.x + u.size.x,
      y1: at.y + u.size.y,
      top: Infinity,
      host: undefined,
    });
    const opening = u.role === "odd" && oddSide;
    // What it sits over, as the final layout finds it.
    const below = [...laid, ...placedStack.slice(0, -1)].filter(
      (g) =>
        !g.spacer &&
        g.at.x < at.x + u.size.x - EPS &&
        at.x < g.at.x + g.size.x - EPS &&
        g.at.y < at.y + u.size.y - EPS &&
        at.y < g.at.y + g.size.y - EPS,
    );
    minZ = Math.max(
      minZ,
      zForStack(at, u, below, coverOver(at, u.size), opening),
    );
  }

  const min: Size = { x: minX, y: minY, z: minZ };
  for (const a of AXES) {
    if (min[a] > lim[a][1] + FIT_TOL)
      problems.push({
        kind: "geometry",
        code: "too-big",
        axis: a,
        by: min[a] - lim[a][1],
      });
  }
  for (const a of AXES) {
    if (size[a] < min[a] - FIT_TOL)
      problems.push({
        kind: "geometry",
        code: "short",
        axis: a,
        by: min[a] - size[a],
      });
  }

  // Problems only grow from here, and the minimum is settled.
  if (gate && !gate(min, problems)) return null;

  // Short axes lay out at their minimum; the shell is still drawn at the player's size.
  const F: Size = { x: FX, y: FY, z: Math.max(size.z, min.z) };
  const floorZ0 = off.bottom;
  const topWall = F.z - off.top;
  const hatches: { at: Vec3; size: Size }[] = [];
  const wells: { at: Vec3; size: Size }[] = [];

  const boxes: Box[] = [];
  const openings: Opening[] = [];
  const anchors: Anchor[] = [];
  const placedFloor: PlacedUnit[] = [];
  const moved = new Set<string>();

  // Floor.
  for (const zone of zonesOf(layout.floor)) {
    const fill = floor.fills.get(zone);
    if (!fill?.min || !fill.at || !fill.size) continue;
    const opening = isOpeningZone(fill);
    // The zone's floor and top surface over its depth, as the body's shape leaves them.
    const zb = bandAt(fill.at.y, fill.at.y + fill.size.y, F.z, fill.at.x, fill.at.x + fill.size.x);
    const z0 = zb ? zb[0] : floorZ0;
    const surface = zb ? zb[1] + off.top : F.z;
    // Room above this zone's floor: up to the deck layer over it, and below the top edge profile for openings.
    let room = surface - Math.max(cover.get(zone) ?? 0, off.top) - z0;
    if (opening) room = Math.min(room, surface - (zone.edge ? topOn(zone.edge) : pTop) - z0);
    boxes.push({
      id: `zone:floor:${zone.zone}`,
      role: zone.takes[0],
      piece: "floor",
      kind: "zone",
      zone: zone.zone,
      at: { ...fill.at, z: z0 },
      size: { ...fill.size, z: room },
    });
    const units = placeUnits(fill, floorCtx, z0, room);
    // Each part sits on the floor under its own depth span, which may lie lower than the zone's highest.
    const own = new Map<PlacedUnit, [number, number]>();
    for (const u of units) {
      const ub = bandAt(u.at.y, u.at.y + u.size.y, F.z, u.at.x, u.at.x + u.size.x) ?? [
        z0,
        surface - off.top,
      ];
      own.set(u, ub);
      if (zone.pack !== "z") u.at.z += Math.min(0, ub[0] - z0);
      // A removable pack is the underside: flat, it meets the outer bottom
      // where that is highest over the pack, and clears it everywhere else.
      if (u.skin) {
        let lo = -Infinity;
        for (let i = 0; i <= 16; i++) {
          const sec = outerSection(style, F, u.at.y + (u.size.y * i) / 16);
          if (sec) lo = Math.max(lo, sec[0]);
        }
        if (lo > -Infinity) u.at.z = lo;
      }
      // An opening stays on its face's flat, which the body's shape may raise at the face.
      if (opening && zone.edge && onFace(u.role)) {
        u.at.z = Math.max(
          u.at.z,
          faceFloor(style, F, zone.edge, u.at.y, u.at.y + u.size.y),
        );
        // A fin stack filled to the fans' height gives back what that took off its top.
        const top =
          ub[1] + off.top - Math.max(coverOver(u.at, u.size), off.top, topOn(zone.edge));
        if (u.role === "fin" && u.at.z + u.size.z > top)
          u.size = { ...u.size, z: Math.max(0, top - u.at.z) };
      }
    }
    // Ports pack along their wall in list order; each sits centred up and down
    // the outer side wall, on a perimeter body on its flat band.
    for (const u of units) {
      if (!u.role.startsWith("port:") || u.src === undefined || !zone.edge)
        continue;
      const side = zone.edge;
      const e = alongAxis(side);
      const [ulo, uhi] = own.get(u) ?? [z0, surface - off.top];
      // Centred on the outer side wall, from the bottom of the D panel to the top
      // of the C panel, kept inside the walls and under any keyboard or trackpad over it.
      const zLo = style.pm
        ? Math.max(ulo, off.bottom + liftOn(side))
        : Math.max(
            ulo + liftOn(side),
            faceFloor(style, F, side, u.at.y, u.at.y + u.size.y),
          );
      const zHi = uhi + off.top - Math.max(coverOver(u.at, u.size), off.top) - u.size.z;
      const zs = style.pm ? perimZones(style.pm, sideMult(style.pm, side)) : null;
      const mid = zs ? (zs.hB + uhi + off.top - zs.hT) / 2 : (ulo - off.bottom + uhi + off.top) / 2;
      u.at.z = Math.min(Math.max(zLo, mid - u.size.z / 2), Math.max(zLo, zHi));
      if (report.ports[u.src]) continue;
      // along is to the connector's centre: from the rear on side walls, from the left otherwise.
      const c = u.at[e] + u.size[e] / 2;
      const fromRear = side === "left" || side === "right";
      report.ports[u.src] = {
        along: fromRear ? F.y - c : c,
        height: u.at.z,
        box: `floor:${u.id}`,
      };
    }
    for (const u of units) {
      // A hinge mount hangs under the top wall at the rear, where the lid
      // pivots, not on the floor. Its own span sets the floor and the top wall
      // it hangs between: a spine rounds both off behind the zone's front.
      if (u.role === "hinge") {
        const [ulo, uhi] = own.get(u) ?? [z0, surface - off.top];
        const top = uhi + off.top - Math.max(coverOver(u.at, u.size), off.top);
        u.at.z = Math.max(ulo, top - u.size.z);
      }
      placedFloor.push(u);
      boxes.push(unitBox(u, "floor", zone.edge));
      if (u.skin)
        hatches.push({
          at: { ...u.at },
          size: { x: u.size.x, y: u.size.y, z: walls.bottom },
        });
      if (u.role === "board") {
        for (const b of board.blocks) {
          const bx = (u.size.x - board.size.x) / 2;
          boxes.push({
            id: `block:${b.id}`,
            role: b.role,
            piece: "floor",
            kind: "unit",
            zone: zone.zone,
            part: b.part,
            ...(b.opts ? { opts: b.opts } : {}),
            at: {
              x: u.at.x + bx + b.at.x,
              y: u.at.y + b.at.y,
              z: u.at.z + b.at.z,
            },
            size: { ...b.size },
          });
        }
      }
      if (
        opening &&
        zone.edge &&
        (u.role === "fin" || u.role === "odd" || u.role.startsWith("port:"))
      ) {
        const side = zone.edge;
        const e = alongAxis(side);
        const o: Opening = {
          id: `opening:${u.id}`,
          kind: u.role === "fin" ? "vent" : u.role === "odd" ? "bay" : "port",
          side,
          part: u.part,
          u: [u.at[e], u.at[e] + u.size[e]],
          z: [u.at.z, u.at.z + u.size.z],
        };
        openings.push(o);
        const at: Vec3 = { x: 0, y: 0, z: (o.z[0] + o.z[1]) / 2 };
        at[e] = (o.u[0] + o.u[1]) / 2;
        if (side === "left") at.x = 0;
        else if (side === "right") at.x = F.x;
        else if (side === "front") at.y = 0;
        else at.y = F.y;
        anchors.push({ kind: "opening", at, opening: o });
      }
    }
  }

  for (const u of placedStack) {
    const edge = u.role === "odd" ? oddSide : undefined;
    // On what now lies under it, as the body's shape leaves the floor there.
    let base = bandAt(u.at.y, u.at.y + u.size.y, F.z, u.at.x, u.at.x + u.size.x)?.[0] ?? floorZ0;
    for (const b of placedFloor)
      if (
        !b.spacer &&
        b.at.x < u.at.x + u.size.x - EPS &&
        u.at.x < b.at.x + b.size.x - EPS &&
        b.at.y < u.at.y + u.size.y - EPS &&
        u.at.y < b.at.y + b.size.y - EPS
      )
        base = Math.max(base, b.at.z + b.size.z);
    u.at.z = base + STACK_GAP;
    if (edge)
      u.at.z = Math.max(
        u.at.z,
        faceFloor(style, F, edge, u.at.y, u.at.y + u.size.y),
      );
    placedFloor.push(u);
    boxes.push(unitBox(u, "floor", edge));
    if (!edge) continue;
    const e = alongAxis(edge);
    const o: Opening = {
      id: `opening:${u.id}`,
      kind: "bay",
      side: edge,
      part: u.part,
      u: [u.at[e], u.at[e] + u.size[e]],
      z: [u.at.z, u.at.z + u.size.z],
    };
    openings.push(o);
    const at: Vec3 = { x: 0, y: 0, z: (o.z[0] + o.z[1]) / 2 };
    at[e] = (o.u[0] + o.u[1]) / 2;
    if (edge === "left") at.x = 0;
    else if (edge === "right") at.x = F.x;
    else if (edge === "front") at.y = 0;
    else at.y = F.y;
    anchors.push({ kind: "opening", at, opening: o });
  }

  // Deck: parts hang from the deck structure under the top wall.
  for (const zone of zonesOf(deckPlan.root)) {
    const fill = deck.fills.get(zone);
    if (!fill?.min || !fill.at || !fill.size) continue;
    const units = deckPlaced.filter((u) => u.zone === zone.zone && !u.spacer);
    const layer = units.reduce((m, u) => Math.max(m, deckLayer(u)), 0);
    boxes.push({
      id: `zone:deck:${zone.zone}`,
      role: zone.takes[0],
      piece: "deck",
      kind: "zone",
      zone: zone.zone,
      at: { ...fill.at, z: F.z - layer },
      size: { ...fill.size, z: layer },
    });
    for (const u of units) {
      boxes.push(
        unitBox({ ...u, at: { ...u.at, z: F.z - style.q - u.size.z } }, "deck"),
      );
      wells.push({
        at: { x: u.at.x, y: u.at.y, z: topWall },
        size: { x: u.size.x, y: u.size.y, z: off.top },
      });
    }
  }

  // Lid, closed: lid-local y runs from the hinge, so it maps to base y reversed. The panel faces down.
  // It rests on the layout frame, so on a short z it floats above the drawn base: it cannot close.
  const lidZ0 = F.z;
  const lidInnerZ0 = lidZ0 + walls.lidFront;
  const flipY = (y: number, h: number) => LY - y - h;
  // The player's display position: its top edge's distance below the lid's top
  // edge, keeping the era's least bezel above and below. The panel row, the chin
  // under it and the top bezel over it follow. Lid-local y runs from the hinge.
  const lidFills = [...lid.fills.values()];
  const panelFill = lidFills.find((f) => f.node.zone === "panel");
  const panelUnit = panelFill?.units.find((u) => u.role === "panel");
  const bands: { fill: (typeof lidFills)[number]; band: "top" | "chin" }[] = [];
  if (panelFill?.at && panelFill.size && panelUnit) {
    const h = panelUnit.size.y;
    const autoY = panelFill.at.y + (panelFill.size.y - h) / 2;
    const auto = LY - autoY - h;
    const lo = era.bezel.top;
    const hi = Math.max(lo, LY - h - era.bezel.chin);
    const top = player.panel ? clamp(player.panel.y, lo, hi) : auto;
    report.panel = { y: top, range: [Math.min(lo, top), Math.max(hi, top)] };
    const y0 = LY - top - h;
    const y1 = y0 + h;
    for (const f of lidFills) {
      if (!f.at || !f.size) continue;
      if (f.node.zone === "chin") {
        bands.push({ fill: f, band: "chin" });
        if (player.panel) f.size = { ...f.size, y: Math.max(0, y0 - f.at.y) };
      } else if (f.node.zone === "top-bezel") {
        bands.push({ fill: f, band: "top" });
        if (player.panel) {
          const end = f.at.y + f.size.y;
          f.at = { ...f.at, y: Math.min(y1, end) };
          f.size = { ...f.size, y: Math.max(0, end - y1) };
        }
      } else if (
        player.panel &&
        (f.node.zone === "panel" || f.node.zone.startsWith("bezel-"))
      ) {
        f.at = { ...f.at, y: y0 };
        f.size = { ...f.size, y: h };
      }
    }
  }
  const bandOf = (fill: (typeof lidFills)[number]) =>
    bands.find((b) => b.fill === fill)?.band;
  const seenBand = new Set<string>();
  for (const zone of zonesOf(lidPlan.root)) {
    const fill = lid.fills.get(zone);
    if (!fill?.min || !fill.at || !fill.size) continue;
    boxes.push({
      id: `zone:lid:${zone.zone}`,
      role: zone.takes[0],
      piece: "lid",
      kind: "zone",
      zone: zone.zone,
      at: { x: fill.at.x, y: flipY(fill.at.y, fill.size.y), z: lidInnerZ0 },
      size: { ...fill.size, z: lidInnerZ },
    });
    for (const u of placeUnits(fill, flatCtx, lidInnerZ0, lidInnerZ)) {
      if (u.role === "webcam") {
        // The player slides the webcam along the top bezel, off the lid's centre line.
        const lo = fill.at.x;
        const hi = Math.max(lo, fill.at.x + fill.size.x - u.size.x);
        const mid = F.x / 2 - u.size.x / 2;
        const range: Range = [lo - mid, hi - mid];
        const x = clamp(player.cam?.x ?? u.at.x - mid, range[0], range[1]);
        u.at.x = mid + x;
        report.cam = { x, range };
        if (player.cam) moved.add(`lid:${u.id}`);
        // Keep the module against the screen side and clear of the lid's back,
        // so its back never lies in the lid's outer face and shows through it.
        const d = Math.min(u.size.z, Math.max(0.5, lidInnerZ - 0.6));
        u.at.z = lidInnerZ0;
        u.size.z = d;
      }
      if (u.spacer) continue;
      // A part in the top bezel or the chin must fit its band: height between
      // the panel and the lid's inner edge, depth inside the lid, and the lid's width.
      const band = bandOf(fill);
      if (band) {
        const fits =
          u.size.y <= fill.size.y + 0.05 &&
          u.size.z <= lidInnerZ + 0.05 &&
          u.at.x >= sl - 0.05 &&
          u.at.x + u.size.x <= F.x - sl + 0.05;
        const key = `${u.role}|${band}`;
        if (!fits && !seenBand.has(key)) {
          seenBand.add(key);
          problems.push({
            kind: "compat",
            code: "bezel-fit",
            part: u.part ?? u.id,
            role: u.role,
            band,
          });
        }
      }
      boxes.push(
        unitBox({ ...u, at: { ...u.at, y: flipY(u.at.y, u.size.y) } }, "lid"),
      );
    }
  }

  // Hinge axis: the lid's rotation axis, across the hinge mounts, where the
  // body puts it (hingeAxis). Pivoting there, the closed lid (which lies wholly
  // in front of and above the axis) never enters the base at any angle up to
  // fully flat.
  const hinges = placedFloor.filter((u) => u.role === "hinge");
  if (hinges.length >= 2) {
    const [h0, h1] = [hinges[0], hinges[hinges.length - 1]];
    const axis = hingeAxis(style, F, lidZ);
    anchors.push({
      kind: "hinge",
      from: { x: h0.at.x + h0.size.x / 2, y: axis.y, z: axis.z },
      to: { x: h1.at.x + h1.size.x / 2, y: axis.y, z: axis.z },
    });
  }

  // Heat sources on the hot chips, sinks at the fin stacks, and routes between them.
  const routes: Route[] = [];
  const hot = boxes.filter(
    (b) => b.kind === "unit" && (b.role === "cpu" || b.role === "gpu"),
  );
  const fins = boxes.filter((b) => b.kind === "unit" && b.role === "fin");
  const centreTop = (b: Box): Vec3 => ({
    x: b.at.x + b.size.x / 2,
    y: b.at.y + b.size.y / 2,
    z: b.at.z + b.size.z,
  });
  const centre = (b: Box): Vec3 => ({
    x: b.at.x + b.size.x / 2,
    y: b.at.y + b.size.y / 2,
    z: b.at.z + b.size.z / 2,
  });
  for (const h of hot) {
    const block = board.blocks.find((b) => `block:${b.id}` === h.id);
    anchors.push({
      kind: "heat-source",
      at: centreTop(h),
      box: h.id,
      watts: block?.watts ?? 0,
    });
  }
  for (const f of fins)
    anchors.push({ kind: "heat-sink", at: centre(f), box: f.id });
  const pipeZ = (h: Box) => h.at.z + h.size.z + cooler / 2;
  if (em.chamber && hot.length > 0) {
    routes.push({
      kind: "vapour-chamber",
      points: hot.map((h) => ({ ...centreTop(h), z: pipeZ(h) })),
      width: Math.max(...hot.map((h) => h.size.x)),
    });
  }
  for (const h of hot) {
    for (const f of fins) {
      const s = { ...centreTop(h), z: pipeZ(h) };
      const d = centre(f);
      routes.push({
        kind: "heat-pipe",
        points: [s, { x: d.x, y: s.y, z: s.z }, { ...d, z: s.z }],
        width: 6,
      });
    }
  }
  const boardBox = boxes.find((b) => b.kind === "unit" && b.role === "board");
  const hingeAnchor = anchors.find((a) => a.kind === "hinge");
  const panelBox = boxes.find((b) => b.kind === "unit" && b.role === "panel");
  if (boardBox && hingeAnchor?.kind === "hinge" && panelBox) {
    const mid = {
      x: (hingeAnchor.from.x + hingeAnchor.to.x) / 2,
      y: hingeAnchor.from.y,
      z: hingeAnchor.from.z,
    };
    routes.push({
      kind: "display-cable",
      points: [
        centreTop(boardBox),
        mid,
        {
          x: panelBox.at.x + panelBox.size.x / 2,
          y: panelBox.at.y + panelBox.size.y,
          z: panelBox.at.z,
        },
      ],
      width: 4,
    });
  }

  // A part the player moved must not run into another.
  const hits = new Set<string>();
  const hitAt = (part: string, what: string) => {
    const k = `${part}|${what}`;
    if (hits.has(k)) return;
    hits.add(k);
    problems.push({ kind: "compat", code: "overlap", part, with: what });
  };
  const solid = boxes.filter(
    (b) => b.kind === "unit" && !BLOCK_ROLES.has(String(b.role)),
  );
  for (const id of moved) {
    const a = solid.find((b) => b.id === id);
    if (!a) continue;
    const hit = solid.find(
      (b) =>
        b !== a &&
        b.piece === a.piece &&
        a.at.x < b.at.x + b.size.x - 0.05 &&
        b.at.x < a.at.x + a.size.x - 0.05 &&
        a.at.y < b.at.y + b.size.y - 0.05 &&
        b.at.y < a.at.y + a.size.y - 0.05 &&
        a.at.z < b.at.z + b.size.z - 0.05 &&
        b.at.z < a.at.z + a.size.z - 0.05,
    );
    if (hit) hitAt(a.part ?? a.id, String(hit.role));
  }
  // Floor ports against the keyboard and trackpad hanging from the top case.
  for (const id of moved) {
    const a = solid.find((b) => b.id === id && b.piece === "floor");
    if (!a) continue;
    const hit = solid.find(
      (b) =>
        b.piece === "deck" &&
        a.at.x < b.at.x + b.size.x &&
        b.at.x < a.at.x + a.size.x &&
        a.at.y < b.at.y + b.size.y &&
        b.at.y < a.at.y + a.size.y &&
        a.at.z + a.size.z > b.at.z - era.deckExtra,
    );
    if (hit) hitAt(a.part ?? a.id, String(hit.role));
  }

  const vents = grillCutouts(openings, grill, size, style, build.year);
  const fit: Fit = {
    place: report,
    min,
    frame: F,
    lidZ,
    shell: {
      outer: size,
      inner: {
        at: { x: off.side, y: off.side, z: off.bottom },
        size: {
          x: size.x - 2 * off.side,
          y: size.y - off.side - offRear,
          z: size.z - off.bottom - off.top,
        },
      },
      walls,
      offsets: {
        side: off.side,
        bottom: off.bottom,
        top: off.top,
        lidSide: sl,
      },
      style,
      lid: {
        at: { x: 0, y: 0, z: lidZ0 },
        size: { x: size.x, y: size.y - lidCut, z: lidZ },
        inner: {
          at: { x: sl, y: sl, z: lidInnerZ0 },
          size: {
            x: size.x - 2 * sl,
            y: size.y - lidCut - 2 * sl,
            z: lidInnerZ,
          },
        },
      },
      bands: { floor: [floorZ0, topWall], deck: [F.z - DB, F.z] },
      cutouts: vents.cutouts,
      ...(em.fans > 0 ? { grill: vents.fit } : {}),
      hatches,
      wells,
    },
    boxes,
    anchors,
    routes,
    problems,
  };
  arrangementOf.set(fit, arr);
  // A better plan must need no more room across the base and bring no more
  // problems than the layout's own; it may need more thickness, up to the player's.
  // One that fits the chassis beats one that does not, as auto placement ranks them.
  const inside = (m: Size) => m.x <= size.x + 0.01 && m.y <= size.y + 0.01;
  // Nor may it leave out a part the layout's own has room for.
  const lost = (ps: Problem[]) =>
    ps
      .filter((p) => p.kind === "compat" && p.code === "no-room")
      .map((p) => JSON.stringify(p));
  // On a taper it must rank ahead of the layout's own as solved in full.
  const thick = !!style.taper || !!style.pm;
  const own = lost(fit.problems);
  const better: Gate = (min, ps) =>
    (thick
      ? compareRank(rankOf(min, size, true), rankOf(fit.min, size, true)) < 0
      : ((min.x <= fit.min.x + 0.01 && min.y <= fit.min.y + 0.01) ||
          (!inside(fit.min) && inside(min))) &&
        min.z <= Math.max(fit.min.z, size.z) + EPS) &&
    ps.length <= fit.problems.length &&
    lost(ps).every((p) => own.includes(p));
  // Each is checked once its minimum is known, and laid out in full only if it may win.
  for (const arr of choice) {
    const f = solveAt(build, content, arr, shared, better);
    if (f && better(f.min, f.problems)) return f;
  }
  return fit;
}

function unitBox(u: PlacedUnit, piece: Piece, edge?: Side): Box {
  return {
    id: `${piece}:${u.id}`,
    role: u.role as Role,
    piece,
    kind: "unit",
    zone: u.zone,
    part: u.part,
    at: { ...u.at },
    size: { ...u.size },
    ...(u.skin ? { skin: true } : {}),
    ...(u.opts ? { opts: u.opts } : {}),
    ...(edge ? { edge } : {}),
    ...(u.turn ? { turn: true } : {}),
    ...(u.over ? { over: u.over } : {}),
  };
}

/** The deck layer over a plan rect: the deepest keyboard or trackpad well that covers it. */
function coverIn(
  deck: PlacedUnit[],
  at: { x: number; y: number },
  sz: { x: number; y: number },
  layer: (u: Unit) => number,
): number {
  let c = 0;
  for (const u of deck) {
    if (u.spacer) continue;
    const hit =
      u.at.x < at.x + sz.x - EPS &&
      at.x < u.at.x + u.size.x - EPS &&
      u.at.y < at.y + sz.y - EPS &&
      at.y < u.at.y + u.size.y - EPS;
    if (hit) c = Math.max(c, layer(u));
  }
  return c;
}

/** A patch of floor seen from above: how high it reaches (Infinity: nothing may sit over it) and the host it belongs to. */
interface Ground {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  top: number;
  host: Role | undefined;
}

/**
 * What a stacked part could sit over: every floor part's height, the board's
 * own chips, and keep-outs over the fans, the hot chips and their heat pipes.
 * The fans are laid out at their thinnest, so at their widest.
 */
function stackGround(
  laid: PlacedUnit[],
  board: Board,
  chamber: boolean,
): Ground[] {
  const out: Ground[] = [];
  const no = (x0: number, y0: number, x1: number, y1: number) =>
    out.push({ x0, y0, x1, y1, top: Infinity, host: undefined });
  const hot: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const u of laid) {
    if (u.spacer) continue;
    const r = {
      x0: u.at.x,
      y0: u.at.y,
      x1: u.at.x + u.size.x,
      y1: u.at.y + u.size.y,
    };
    if (u.role === "board") {
      // Over the board a part clears its tallest component, cooler included.
      out.push({ ...r, top: u.at.z + u.size.z, host: "board" });
      const bx = (u.size.x - board.size.x) / 2;
      for (const b of board.blocks) {
        if (!b.hot) continue;
        const x0 = u.at.x + bx + b.at.x;
        const y0 = u.at.y + b.at.y;
        hot.push({ x0, y0, x1: x0 + b.size.x, y1: y0 + b.size.y });
      }
    } else if (UNDER_OK.has(u.role)) {
      out.push({
        ...r,
        top: u.at.z + u.size.z,
        host: u.role === "battery" ? "battery" : undefined,
      });
    } else no(r.x0, r.y0, r.x1, r.y1);
  }
  const m = HOT_MARGIN;
  for (const h of hot) no(h.x0 - m, h.y0 - m, h.x1 + m, h.y1 + m);
  if (chamber && hot.length > 0)
    no(
      Math.min(...hot.map((h) => h.x0)) - m,
      Math.min(...hot.map((h) => h.y0)) - m,
      Math.max(...hot.map((h) => h.x1)) + m,
      Math.max(...hot.map((h) => h.y1)) + m,
    );
  // Heat pipes run from each hot chip along x, then along y, to each fin stack.
  const w = 3 + m;
  for (const h of hot) {
    const sx = (h.x0 + h.x1) / 2;
    const sy = (h.y0 + h.y1) / 2;
    for (const f of laid) {
      if (f.role !== "fin") continue;
      const dx = f.at.x + f.size.x / 2;
      const dy = f.at.y + f.size.y / 2;
      no(Math.min(sx, dx) - w, sy - w, Math.max(sx, dx) + w, sy + w);
      no(dx - w, Math.min(sy, dy) - w, dx + w, Math.max(sy, dy) + w);
    }
  }
  return out;
}

/**
 * Where a stacked part sits: its centre over its host, over nothing that must
 * stay clear, inside the walls and, for an optical drive, flush with the wall
 * it loads from. The lowest such place wins, then the one most over its host.
 */
function stackAt(
  u: Unit,
  ground: Ground[],
  inner: { x0: number; y0: number; x1: number; y1: number },
  side: Side | undefined,
  floorZ0: number,
  ko = 0,
): Vec3 | null {
  const w = u.size.x;
  const d = u.size.y;
  const hosts = ground.filter((g) => g.host === u.over && g.top !== Infinity);
  if (hosts.length === 0) return null;
  const cands = (
    a0: "x0" | "y0",
    a1: "x1" | "y1",
    len: number,
    lo: number,
    hi: number,
    fixed?: number,
  ) => {
    if (fixed !== undefined) return [fixed];
    const set = new Set<number>([lo, hi - len]);
    // Flush against the host's edges, or against something that must stay clear.
    for (const g of ground) {
      if (g.top !== Infinity && g.host !== u.over) continue;
      set.add(g[a0]);
      set.add(g[a1]);
      set.add(g[a0] - len);
      set.add(g[a1] - len);
    }
    return [...set].filter(
      (v) =>
        v >= lo - EPS &&
        v + len <= hi + EPS &&
        hosts.some((h) => v + len / 2 > h[a0] && v + len / 2 < h[a1]),
    );
  };
  const xs = cands(
    "x0",
    "x1",
    w,
    // An opening on the front or rear wall keeps clear of the rounded corners.
    inner.x0 + (side === "front" || side === "rear" ? ko : 0),
    inner.x1 - (side === "front" || side === "rear" ? ko : 0),
    side === "right" ? inner.x1 - w : side === "left" ? inner.x0 : undefined,
  );
  const ys = cands(
    "y0",
    "y1",
    d,
    // An opening on a side wall keeps clear of the rounded corners.
    inner.y0 + (side === "left" || side === "right" ? ko : 0),
    inner.y1 - (side === "left" || side === "right" ? ko : 0),
    side === "rear" ? inner.y1 - d : side === "front" ? inner.y0 : undefined,
  );
  // Keep-outs first, so most places fail on the first few.
  const order = [...ground].sort(
    (p, q) => (q.top === Infinity ? 1 : 0) - (p.top === Infinity ? 1 : 0),
  );
  let best: { at: Vec3; on: number } | null = null;
  for (const x of xs) {
    // Only what overlaps this column can touch a place in it.
    const column = order.filter((g) => Math.min(x + w, g.x1) - Math.max(x, g.x0) > EPS);
    for (const y of ys) {
      const cx = x + w / 2;
      const cy = y + d / 2;
      if (!hosts.some((h) => cx > h.x0 && cx < h.x1 && cy > h.y0 && cy < h.y1))
        continue;
      let top = floorZ0;
      let on = 0;
      let ok = true;
      for (const g of column) {
        const ox = Math.min(x + w, g.x1) - Math.max(x, g.x0);
        const oy = Math.min(y + d, g.y1) - Math.max(y, g.y0);
        if (oy <= EPS) continue;
        if (g.top === Infinity) {
          ok = false;
          break;
        }
        top = Math.max(top, g.top);
        if (g.host === u.over) on += ox * oy;
      }
      if (!ok) continue;
      const z = top + STACK_GAP;
      if (
        !best ||
        z < best.at.z - EPS ||
        (Math.abs(z - best.at.z) <= EPS && on > best.on + EPS)
      )
        best = { at: { x, y, z }, on };
    }
  }
  return best?.at ?? null;
}

/** How a plan ranks: out of the chassis in plan, then (on a taper) how far over its thickness, then area, then thickness. */
interface Rank {
  out: number;
  over: number;
  area: number;
  z: number;
}

function rankOf(
  m: { x: number; y: number; z?: number },
  room: { x: number; y: number; z: number },
  thick: boolean,
): Rank {
  const z = thick ? (m.z ?? 0) : 0;
  return {
    out: m.x <= room.x + 1e-6 && m.y <= room.y + 1e-6 ? 0 : 1,
    over: thick ? Math.max(0, z - room.z) : 0,
    area: m.x * m.y,
    z,
  };
}

/** Negative when `a` ranks ahead of `b`, zero when neither does by enough to count. */
function compareRank(a: Rank, b: Rank): number {
  if (a.out !== b.out) return a.out - b.out;
  if (Math.abs(a.over - b.over) > 0.05) return a.over - b.over;
  if (Math.abs(a.area - b.area) > 1) return a.area - b.area;
  if (Math.abs(a.z - b.z) > 0.1) return a.z - b.z;
  return 0;
}

/**
 * Plans that rank ahead of the layout's own, best first: each slot left on
 * auto tries every zone it may sit in, turned and not, one slot at a time from
 * the best so far, twice over. A plan must lose no more parts than the
 * layout's own. The ranking: fitting the chassis in plan comes first; on a
 * tapered body, then how far the thickness it needs runs over the player's;
 * then the smallest area; then, on a taper, the least thickness. Off a taper a
 * plan must also need no more room on either axis than the layout's own,
 * unless that overflows the chassis and the plan fits it; on a taper it may
 * take more, within the chassis.
 */
function arrange(
  slots: Map<string, Slot>,
  base: Arrangement,
  room: { x: number; y: number; z: number },
  thick: boolean,
  planMin: (
    arr: Arrangement,
    bar?: number,
  ) => { x: number; y: number; z?: number; lost: number },
): Arrangement[] {
  const free = [...slots].filter(
    ([, s]) =>
      s.pin.zone === undefined ||
      s.pin.turn === undefined ||
      (s.role === "spk" && s.pin.row === undefined),
  );
  if (free.length === 0) return [];
  const own = planMin(base);
  const inRoom = (m: { x: number; y: number }) =>
    m.x <= room.x + 1e-6 && m.y <= room.y + 1e-6;
  const rank = (m: { x: number; y: number; z?: number }) =>
    rankOf(m, room, thick);
  const area = (m: { x: number; y: number }) =>
    (inRoom(m) ? 0 : 1e9) + m.x * m.y;
  // On a taper a plan may take more of the chassis than the layout's own, as long as it fits.
  const fitsPlan = (m: { x: number; y: number; lost: number }) =>
    m.lost <= own.lost &&
    ((m.x <= own.x + 1e-6 && m.y <= own.y + 1e-6) ||
      ((thick || !inRoom(own)) && inRoom(m)));
  // A stack must also fit under the player's thickness; on a taper the thickness is ranked instead.
  const fits = (m: { x: number; y: number; z?: number; lost: number }) =>
    fitsPlan(m) && (thick || m.z === undefined || m.z <= room.z + 1e-6);
  const found: { arr: Arrangement; rank: Rank; moves: number }[] = [];
  const movesOf = (arr: Arrangement) =>
    Object.keys(arr).filter((k) => !sameChoice(arr[k], base[k])).length;
  const ownRank = rank(own);
  const keep = (arr: Arrangement, r: Rank) => {
    if (
      compareRank(r, ownRank) < 0 &&
      !found.some((f) =>
        Object.keys(arr).every((k) => sameChoice(f.arr[k], arr[k])),
      )
    )
      found.push({ arr, rank: r, moves: movesOf(arr) });
  };
  let best = base;
  let bestRank = ownRank;
  for (let pass = 0; pass < 2; pass++) {
    const start = best;
    for (const [key, s] of free) {
      const zones: (string | undefined)[] =
        s.pin.zone !== undefined
          ? [s.pin.zone]
          : [
              undefined,
              ...s.zones
                .filter((z) => !z.takes.includes(s.role))
                .map((z) => z.zone),
            ];
      const turns = s.pin.turn !== undefined ? [s.pin.turn] : [false, true];
      const rows = s.pin.row !== undefined ? [s.pin.row] : rowsOf(s.role);
      let next: Arrangement | undefined;
      let nextRank = bestRank;
      // On a taper, a move to another zone that costs nothing may open the way
      // for the next: the speakers leaving the front row before the battery goes back.
      let level: Arrangement | undefined;
      for (const zone of zones)
        for (const turn of turns)
        for (const row of rows) {
          const c: Choice = { zone, turn, ...(row ? { row } : {}) };
          if (sameChoice(c, best[key])) continue;
          const arr = { ...best, [key]: c };
          const m = planMin(arr);
          if (!fits(m)) continue;
          const r = rank(m);
          keep(arr, r);
          if (compareRank(r, nextRank) < 0) {
            nextRank = r;
            next = arr;
          } else if (
            thick &&
            !level &&
            zone !== best[key].zone &&
            compareRank(r, bestRank) === 0
          )
            level = arr;
        }
      if (next) {
        best = next;
        bestRank = nextRank;
      } else if (level) best = level;
    }
    if (best === start) break;
  }
  // Then stacking, part by part from the best plan: a part left on auto may
  // go over each host, turned or not, where the chassis is thick enough. One
  // too thick for the player still leads on when nothing better does: stacking
  // another part next can bring the whole back under.
  // The best plan that fits the player's thickness, beside the path taken.
  let anchor = best;
  for (let pass = 0; pass < 2; pass++) {
    const start = best;
    for (const [key, s] of free) {
      if (s.pin.zone !== undefined || s.stacks.length === 0) continue;
      const turns = s.pin.turn !== undefined ? [s.pin.turn] : [false, true];
      let next: Arrangement | undefined;
      let step: Arrangement | undefined;
      let stepArea = bestRank.out * 1e9 + bestRank.area - 1;
      for (const from of best === anchor ? [best] : [best, anchor])
        for (const zone of s.stacks)
          for (const turn of turns) {
            const c: Choice = { zone, turn };
            if (sameChoice(c, from[key])) continue;
            const arr = { ...from, [key]: c };
            // Only a stack that would beat the best so far is worth laying out.
            // On a taper a larger plan may still win on thickness.
            const m = planMin(
              arr,
              thick ? undefined : bestRank.out * 1e9 + bestRank.area - 1,
            );
            if (!fitsPlan(m)) continue;
            const a = area(m);
            if (!fits(m)) {
              // A step only where the stack itself could fit under the player's thickness.
              if (m.z !== Infinity && a < stepArea) {
                stepArea = a;
                step = arr;
              }
              continue;
            }
            const r = rank(m);
            keep(arr, r);
            if (compareRank(r, bestRank) < 0) {
              bestRank = r;
              next = arr;
            }
          }
      if (next) best = anchor = next;
      else if (step) best = step;
    }
    if (best === start) break;
  }
  found.sort(
    (p, q) =>
      (thick
        ? compareRank(p.rank, q.rank)
        : p.rank.out - q.rank.out || p.rank.area - q.rank.area) ||
      p.moves - q.moves,
  );
  return found.slice(0, 3).map((f) => f.arr);
}
