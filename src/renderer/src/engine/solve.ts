import { buildBoard } from "./board";
import { checkCompat } from "./compat";
import { CONTENT, type Content, eraFor, indexContent } from "./content";
import {
  alongAxis,
  deal,
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
  lidSideOffset,
  profileLift,
  profileTop,
} from "./shell";
import type {
  Anchor,
  Axis,
  Box,
  Build,
  Era,
  Fit,
  Opening,
  Piece,
  PlaceReport,
  Problem,
  Range,
  Role,
  Route,
  Side,
  Size,
  Tune,
  Vec3,
} from "./types";
import { bezelUnits, emit, spendOf, type Unit } from "./units";
import { panelOf } from "./screen";

const AXES: Axis[] = ["x", "y", "z"];
const BLOCK_ROLES = new Set(["cpu", "gpu", "vrm", "chipset", "mem", "m2", "wlan", "bt", "tb"]);
const EPS = 1e-9;

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

/**
 * Solve a build into an assembly. Pure and deterministic: the same build
 * always gives the same fit. No rendering dependency.
 */
export function solve(build: Build, content: Content = CONTENT): Fit {
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
  const problems: Problem[] = checkCompat(build, idx, era, body, layout);
  const style = body.style;

  // Walls, gaps and styling allowance.
  const matSpend = spendOf(build, "material");
  const gap = tune(era.gap, spendOf(build, "packing"));
  const wf = wallFor(era, build.materials.floor, matSpend);
  const wd = wallFor(era, build.materials.deck, matSpend);
  const wl = wallFor(era, build.materials.lid, matSpend);
  // A panel under cover glass is the lid's front face: no front wall over it.
  const panel = panelOf(build, content);
  const coverGlass = !!(panel && idx.panelTypes.get(panel.type)?.coverGlass);
  const walls = {
    bottom: wf,
    top: wd,
    side: Math.max(wf, wd),
    lid: wl,
    lidFront: coverGlass ? 0 : wl,
  };
  const off = baseOffsets(style, walls);
  const sl = lidSideOffset(style, wl);

  // Units and the derived mainboard.
  const em = emit(build, idx, era, body);
  // The player's trackpad size, within reach of the part's own.
  const player = build.place ?? {};
  const report: PlaceReport = { ports: build.ports.map(() => null) };
  const padUnit = em.deck.find((u) => u.role === "pad");
  const padW0: Range = padUnit ? [Math.round(padUnit.size.x * 0.6), Math.round(padUnit.size.x * 1.4)] : [0, 0];
  const padD0: Range = padUnit ? [Math.round(padUnit.size.y * 0.6), Math.round(padUnit.size.y * 1.4)] : [0, 0];
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

  // The keyboard and trackpad sit in wells in the top case, flush with the top
  // surface, on the deck structure. Over them the floor runs up to that layer;
  // elsewhere it runs up to the top wall. The top wall does not add over a well.
  const deckLayer = (u: Unit) => (u.spacer ? 0 : u.size.z + era.deckExtra);
  const DB = em.deck.reduce((m, u) => Math.max(m, deckLayer(u)), 0);
  const pTop = profileTop(style);

  // Sustained chip heat, shared over the fans.
  const sustained = (cat: "processor" | "graphics") => {
    const part = idx.parts.get(build.parts[cat]?.[0]?.part ?? "");
    const own = build.power?.high?.[cat === "processor" ? "cpu" : "gpu"]?.sustained;
    return part?.power ? Math.max(part.power.sustained, own ?? 0) : 0;
  };
  const chipWatts = sustained("processor") + sustained("graphics");
  const floorCtx: PlanCtx = {
    gap,
    ko: cornerKeepOut(style, off.side),
    lift: profileLift(style, off.bottom),
    bottom: off.bottom,
    era,
    finDepth: em.finDepth,
    fanWatts: em.fans > 0 && chipWatts > 0 ? chipWatts / em.fans : undefined,
  };
  const flatCtx: PlanCtx = {
    gap: 0,
    ko: 0,
    lift: 0,
    bottom: 0,
    era,
    finDepth: em.finDepth,
  };

  const floorDeal = deal(layout.floor, floorUnits);
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
  const dm = m2(deck);
  const lm = m2(lid);

  const lidInnerZ = lidUnits.reduce((m, u) => Math.max(m, u.size.z), 0);
  const lidZ = lidInnerZ + wl + walls.lidFront;

  const lim = body.limits;
  const size: Size = {
    x: clamp(build.size.x, lim.x[0], lim.x[1]),
    y: clamp(build.size.y, lim.y[0], lim.y[1]),
    z: clamp(build.size.z, lim.z[0], lim.z[1]),
  };

  // x and y first: placement in plan does not depend on z.
  const minX = Math.max(
    fm.x + 2 * off.side,
    dm.x + 2 * off.side,
    lm.x + 2 * sl,
  );
  const minY = Math.max(
    fm.y + 2 * off.side,
    dm.y + 2 * off.side,
    lm.y + 2 * sl,
  );
  const FX = Math.max(size.x, minX);
  const FY = Math.max(size.y, minY);
  const innerFoot = { x: FX - 2 * off.side, y: FY - 2 * off.side };
  place(floor, { x: off.side, y: off.side }, innerFoot);
  place(deck, { x: off.side, y: off.side }, innerFoot);
  // Lid frame: y = 0 at the hinge. Placed in lid-local coordinates, mapped to the closed position below.
  place(lid, { x: sl, y: sl }, { x: FX - 2 * sl, y: FY - 2 * sl });

  // Deck units in plan, then the deck layer over each floor zone.
  const deckPlaced: PlacedUnit[] = [];
  for (const zone of zonesOf(deckPlan.root)) {
    const fill = deck.fills.get(zone);
    if (fill?.min && fill.at && fill.size)
      deckPlaced.push(...placeUnits(fill, flatCtx, 0, 0));
  }
  // The player moves the keyboard forward from the hinge and sets the
  // trackpad's gap in front of it. Both stay centred left to right.
  const K = deckPlaced.find((u) => u.role === "keys");
  const P = deckPlaced.find((u) => u.role === "pad");
  if (K) {
    const MIN_GAP = 2;
    const front = off.side + 2;
    const kbMax = Math.max(0, K.at.y - front - (P ? P.size.y + MIN_GAP : 0));
    const ky = clamp(player.kb?.y ?? 0, 0, kbMax);
    const autoGap = P ? K.at.y - (P.at.y + P.size.y) : 0;
    K.at.y -= ky;
    report.kb = { y: ky, range: [0, kbMax] };
    if (P) {
      const gMax = Math.max(MIN_GAP, K.at.y - front - P.size.y);
      const g = clamp(player.pad?.y ?? autoGap, MIN_GAP, gMax);
      P.at.y = K.at.y - g - P.size.y;
      report.pad = { w: P.size.x, d: P.size.y, y: g, w0: padW0, d0: padD0, range: [MIN_GAP, gMax] };
    }
  }
  const coverOver = (
    at: { x: number; y: number },
    sz: { x: number; y: number },
  ) => {
    let c = 0;
    for (const u of deckPlaced) {
      if (u.spacer) continue;
      const hit =
        u.at.x < at.x + sz.x - EPS &&
        at.x < u.at.x + u.size.x - EPS &&
        u.at.y < at.y + sz.y - EPS &&
        at.y < u.at.y + u.size.y - EPS;
      if (hit) c = Math.max(c, deckLayer(u));
    }
    return c;
  };
  // Minimum z at this footprint. Each floor part needs its own height plus
  // whatever sits over it: the deck layer where a keyboard or trackpad covers
  // that part, else the top wall; openings also stay clear of the top edge
  // profile. Parts are laid out in plan first, at their thinnest (fans unfilled).
  let minZ = off.bottom + off.top;
  const cover = new Map<unknown, number>();
  for (const f of floor.fills.values()) {
    if (!f.min || !f.at || !f.size) continue;
    const opening = isOpeningZone(f);
    let zoneCover = 0;
    for (const u of placeUnits(f, floorCtx, off.bottom, 0)) {
      const c = coverOver(u.at, u.size);
      zoneCover = Math.max(zoneCover, c);
      minZ = Math.max(
        minZ,
        u.at.z + u.size.z + Math.max(c, off.top, opening ? pTop : 0),
      );
    }
    cover.set(f.node, zoneCover);
  }
  for (const u of deckPlaced)
    minZ = Math.max(minZ, off.bottom + Math.max(deckLayer(u), off.top));

  const min: Size = { x: minX, y: minY, z: minZ };
  for (const a of AXES) {
    if (min[a] > lim[a][1])
      problems.push({
        kind: "geometry",
        code: "too-big",
        axis: a,
        by: min[a] - lim[a][1],
      });
  }
  for (const a of AXES) {
    if (size[a] < min[a])
      problems.push({
        kind: "geometry",
        code: "short",
        axis: a,
        by: min[a] - size[a],
      });
  }

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
    // Room above this zone's floor: up to the deck layer over it, and below the top edge profile for openings.
    let room = F.z - Math.max(cover.get(zone) ?? 0, off.top) - floorZ0;
    if (opening) room = Math.min(room, F.z - pTop - floorZ0);
    boxes.push({
      id: `zone:floor:${zone.zone}`,
      role: zone.takes[0],
      piece: "floor",
      kind: "zone",
      zone: zone.zone,
      at: { ...fill.at, z: floorZ0 },
      size: { ...fill.size, z: room },
    });
    // A port the player moved leaves its slot: the rest repack without it,
    // and it sits only where the player put it (measured from its own slot).
    const isMoved = (u: Unit) => {
      if (!u.role.startsWith("port:") || u.src === undefined || !zone.edge) return false;
      const bp = build.ports[u.src];
      return bp?.along !== undefined || bp?.height !== undefined;
    };
    const all = placeUnits(fill, floorCtx, floorZ0, room);
    let units = all;
    if (fill.units.some(isMoved)) {
      const rest = new Map(
        placeUnits({ ...fill, units: fill.units.filter((u) => !isMoved(u)) }, floorCtx, floorZ0, room).map((u) => [u.id, u]),
      );
      units = all.map((u) => (isMoved(u) ? u : (rest.get(u.id) ?? u)));
    }
    // The player's port placement: anywhere along its wall, up and down as far as the shells allow.
    const shifted = new Map<number, { du: number; dz: number }>();
    for (const u of units) {
      if (!u.role.startsWith("port:") || u.src === undefined || !zone.edge) continue;
      const bp = build.ports[u.src];
      const side = zone.edge;
      const e = alongAxis(side);
      const len = u.size[e];
      const lo = off.side + floorCtx.ko;
      const hi = F[e] - off.side - floorCtx.ko;
      const fromRear = side === "left" || side === "right";
      // along is to the connector's centre: from the rear on side walls, from the left otherwise.
      const toAlong = (c: number) => (fromRear ? F.y - c : c);
      const cRange: Range = [lo + len / 2, Math.max(lo + len / 2, hi - len / 2)];
      const aRange: Range = fromRear ? [toAlong(cRange[1]), toAlong(cRange[0])] : cRange;
      const zLo = floorZ0 + floorCtx.lift;
      const zHi = F.z - Math.max(off.top, pTop) - u.size.z;
      const hRange: Range | null = zHi > zLo + 0.05 ? [zLo, zHi] : null;
      const prev = shifted.get(u.src);
      if (prev) {
        u.at[e] += prev.du;
        u.at.z += prev.dz;
        if (isMoved(u)) moved.add(`floor:${u.id}`);
        continue;
      }
      const c0 = u.at[e] + len / 2;
      let c = c0;
      if (bp?.along !== undefined) c = clamp(fromRear ? F.y - bp.along : bp.along, cRange[0], cRange[1]);
      const z0 = u.at.z;
      let z = z0;
      if (bp?.height !== undefined && hRange) z = clamp(bp.height, hRange[0], hRange[1]);
      u.at[e] = c - len / 2;
      u.at.z = z;
      shifted.set(u.src, { du: c - c0, dz: z - z0 });
      report.ports[u.src] = { along: toAlong(c), height: z, alongRange: aRange, heightRange: hRange, box: `floor:${u.id}` };
      if (bp?.along !== undefined || bp?.height !== undefined) moved.add(`floor:${u.id}`);
    }
    for (const u of units) {
      // A hinge mount hangs under the top wall at the rear, where the lid
      // pivots, not on the floor. The zone's room already clears its height.
      if (u.role === "hinge") u.at.z = Math.max(floorZ0, floorZ0 + room - u.size.z);
      placedFloor.push(u);
      boxes.push(unitBox(u, "floor", zone.edge));
      if (u.skin)
        hatches.push({
          at: { ...u.at },
          size: { x: u.size.x, y: u.size.y, z: off.bottom },
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
      boxes.push(unitBox({ ...u, at: { ...u.at, z: F.z - u.size.z } }, "deck"));
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
  const flipY = (y: number, h: number) => F.y - y - h;
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
    const auto = F.y - autoY - h;
    const lo = era.bezel.top;
    const hi = Math.max(lo, F.y - h - era.bezel.chin);
    const top = player.panel ? clamp(player.panel.y, lo, hi) : auto;
    report.panel = { y: top, range: [Math.min(lo, top), Math.max(hi, top)] };
    const y0 = F.y - top - h;
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
      } else if (player.panel && (f.node.zone === "panel" || f.node.zone.startsWith("bezel-"))) {
        f.at = { ...f.at, y: y0 };
        f.size = { ...f.size, y: h };
      }
    }
  }
  const bandOf = (fill: (typeof lidFills)[number]) => bands.find((b) => b.fill === fill)?.band;
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
          problems.push({ kind: "compat", code: "bezel-fit", part: u.part ?? u.id, role: u.role, band });
        }
      }
      boxes.push(
        unitBox({ ...u, at: { ...u.at, y: flipY(u.at.y, u.size.y) } }, "lid"),
      );
    }
  }

  // Hinge axis: the lid's rotation axis, across the hinge mounts, on the base's
  // rear top edge. Pivoting there, the closed lid (which lies wholly in front of
  // and above that edge) only ever moves up and back as it opens, so it never
  // enters the base at any angle up to fully flat.
  const hinges = placedFloor.filter((u) => u.role === "hinge");
  if (hinges.length >= 2) {
    const [h0, h1] = [hinges[0], hinges[hinges.length - 1]];
    anchors.push({
      kind: "hinge",
      from: { x: h0.at.x + h0.size.x / 2, y: F.y, z: F.z },
      to: { x: h1.at.x + h1.size.x / 2, y: F.y, z: F.z },
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
  const solid = boxes.filter((b) => b.kind === "unit" && !BLOCK_ROLES.has(String(b.role)));
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
        a.at.z + a.size.z > F.z - b.size.z - era.deckExtra,
    );
    if (hit) hitAt(a.part ?? a.id, String(hit.role));
  }

  return {
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
          y: size.y - 2 * off.side,
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
        size: { x: size.x, y: size.y, z: lidZ },
        inner: {
          at: { x: sl, y: sl, z: lidInnerZ0 },
          size: { x: size.x - 2 * sl, y: size.y - 2 * sl, z: lidInnerZ },
        },
      },
      bands: { floor: [floorZ0, topWall], deck: [F.z - DB, F.z] },
      cutouts: openings,
      hatches,
      wells,
    },
    boxes,
    anchors,
    routes,
    problems,
  };
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
  };
}
