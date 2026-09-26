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
  Problem,
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
    const units = placeUnits(fill, floorCtx, floorZ0, room);
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
      if (u.spacer) continue;
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

  return {
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
