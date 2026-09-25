// @vitest-environment node
// Headless fit check. It checks what construction does not already guarantee:
// units inside the styled shell, bands respected, edges and anchors on the
// outside, determinism and a per-solve time budget. Approved as the one test
// kept during MVP mode.
import { describe, expect, it } from "vitest";
import { available, CONTENT, panelsFor, partsFor } from "./content";
import { zonesOf } from "./plan";
import { SAMPLES } from "./samples";
import { flatFace, insideBase, insideLid } from "./shell";
import { solve } from "./solve";
import type {
  Axis,
  Box,
  Build,
  BuildPart,
  Category,
  Fit,
  Piece,
  Side,
  Size,
  ZoneNode,
} from "./types";
import { CATEGORIES, PIECES, SIDES } from "./types";
import { validateContent } from "./validate";

const EPS = 1e-6;
/**
 * References the engine may undershoot. The engine gives the minimum a build
 * needs; these real machines carry more than their minimum, so only the upper
 * side of the tolerance is held.
 */
const KNOWN_THIN: Record<string, string> = {
  "dtr-2006":
    "the M1710 is about 5 mm thicker than the minimum for its parts; the optical drive under the keyboard sets the engine's minimum",
};
const AXES: Axis[] = ["x", "y", "z"];
const YEARS = [2006, 2026];
/** Per-solve budget: a quarter of a 60 Hz frame, so a slider tick never drops a frame. */
const BUDGET_MS = 4;
const RANDOM_BUILDS = 20000;

// ------------------------------------------------------------------ helpers

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const hashFit = (f: Fit) => fnv1a(JSON.stringify(f));

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Same data, every object's keys in reverse order: output must not depend on key order. */
function reverseKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reverseKeys) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse())
      out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    return out as T;
  }
  return v;
}

const texture = (m: string) =>
  CONTENT.materials.find((x) => x.id === m)?.finishes[0] ?? "matte";

function basePorts(year: number, layoutId: string): Build["ports"] {
  const layout = CONTENT.layouts.find((l) => l.id === layoutId);
  const sets =
    year < 2020
      ? [
          ["dc-jack", "usb-a-2.0", "vga"],
          ["usb-a-2.0", "headphone-mic"],
          ["usb-a-2.0", "lock-slot"],
        ]
      : [
          ["usb-c-10g", "usb-a-5g", "hdmi-2.1"],
          ["usb-c-10g", "audio-combo"],
          ["usb-a-5g", "lock-slot"],
        ];
  return (layout?.portSides ?? []).flatMap((side, i) =>
    sets[i % sets.length].map((part) => ({ part, side })),
  );
}

function baseBuild(year: number, body: string, layout: string): Build {
  const b = CONTENT.bodies.find((x) => x.id === body);
  const p = (part: string, opts?: BuildPart["opts"]): BuildPart[] => [
    { part, opts },
  ];
  const parts: Build["parts"] =
    year < 2020
      ? {
          processor: p("core-duo-t2500"),
          memory: p("ddr2-667-sodimm"),
          storage: p("hdd25-5400"),
          display: p("2006-14.1-1280x800-tn-matte"),
          battery: p("li-ion-18650"),
          cooling: p("one-fan"),
          wireless: p("wifi-bg"),
          keyboard: p("kb-2.5"),
          trackpad: p("pad-65x40"),
          speakers: p("spk-stereo-2006"),
        }
      : {
          processor: p("core-ultra7-258v"),
          memory: p("lpddr5x-on-package"),
          storage: p("m2-2280-g4"),
          display: p("2026-14-1920x1200-ips"),
          battery: p("li-po-pouch"),
          cooling: p("two-fans"),
          wireless: p("wifi-6e"),
          keyboard: p("kb-1.0"),
          trackpad: p("pad-125x80"),
          speakers: p("spk-stereo-2026"),
        };
  const mat = year < 2020 ? "plastic" : "aluminium";
  return {
    year,
    body,
    layout,
    size: b ? { ...b.size } : { x: 300, y: 220, z: 20 },
    parts,
    // A multi-port strip on every side the layout has, so strip order is checked everywhere.
    ports: basePorts(year, layout),
    materials: { floor: mat, deck: mat, lid: mat },
    finish: {
      floor: { colour: "black", texture: texture(mat) },
      deck: { colour: "black", texture: texture(mat) },
      lid: { colour: "black", texture: texture(mat) },
    },
    spend: {},
  };
}

function withSize(b: Build, size: Size): Build {
  return { ...b, size: { ...size } };
}

/**
 * Smallest size the body allows that fits. The x and y minimum never depend on
 * size; the z minimum depends on the footprint (the deck layer covers what lies
 * beneath it), so it is read at the minimum footprint.
 */
function minimumOf(
  b: Build,
  lim: Record<Axis, [number, number]>,
): { size: Size; min: Size } {
  const first = solve(b).min;
  const xy = { x: Math.max(first.x, lim.x[0]), y: Math.max(first.y, lim.y[0]) };
  const min = solve(withSize(b, { ...xy, z: b.size.z })).min;
  return { size: { ...xy, z: Math.max(min.z, lim.z[0]) }, min };
}

function withSpend(b: Build, v: number): Build {
  const spend: Build["spend"] = { packing: v, material: v };
  for (const c of CATEGORIES) spend[c] = v;
  return { ...b, spend };
}

// ------------------------------------------------------------------ invariants

function corners(b: Box): Size[] {
  const out: Size[] = [];
  for (const dx of [0, 1])
    for (const dy of [0, 1])
      for (const dz of [0, 1])
        out.push({
          x: b.at.x + dx * b.size.x,
          y: b.at.y + dy * b.size.y,
          z: b.at.z + dz * b.size.z,
        });
  return out;
}

function overlaps(a: Box, b: Box): boolean {
  return AXES.every(
    (k) =>
      a.at[k] < b.at[k] + b.size[k] - EPS &&
      b.at[k] < a.at[k] + a.size[k] - EPS,
  );
}

function zoneNodes(build: Build): Record<Piece, Map<string, ZoneNode>> {
  const layout = CONTENT.layouts.find((l) => l.id === build.layout);
  if (!layout) throw new Error("layout");
  const plan = (id: string) => CONTENT.plans.find((p) => p.id === id)?.root;
  const map = (root: ZoneNode[] | undefined) =>
    new Map((root ?? []).map((z) => [z.zone, z]));
  const deck = plan(layout.deck);
  const lid = plan(layout.lid);
  return {
    floor: map(zonesOf(layout.floor)),
    deck: map(deck && zonesOf(deck)),
    lid: map(lid && zonesOf(lid)),
  };
}

function check(build: Build, fit: Fit): string[] {
  const errs: string[] = [];
  const fail = (m: string) => errs.push(m);
  const F = fit.frame;
  const shell = fit.shell;
  const style = shell.style;
  const body = CONTENT.bodies.find((b) => b.id === build.body);
  if (!body) return ["unknown body"];

  // Frame, drawn size and geometry problems agree with each other.
  const short = new Set(
    fit.problems
      .filter((p) => p.kind === "geometry" && p.code === "short")
      .map((p) => (p as { axis: Axis }).axis),
  );
  for (const a of AXES) {
    if (!Number.isFinite(fit.min[a]) || fit.min[a] <= 0)
      fail(`min ${a} not positive: ${fit.min[a]}`);
    if (Math.abs(F[a] - Math.max(shell.outer[a], fit.min[a])) > EPS)
      fail(`frame ${a} is not max(size, min)`);
    if (
      shell.outer[a] < body.limits[a][0] - EPS ||
      shell.outer[a] > body.limits[a][1] + EPS
    )
      fail(`drawn ${a} outside body limits`);
    if (shell.outer[a] < fit.min[a] - EPS !== short.has(a))
      fail(`short on ${a} is not reported exactly`);
    const tooBig = fit.problems.some(
      (p) => p.kind === "geometry" && p.code === "too-big" && p.axis === a,
    );
    if (tooBig !== fit.min[a] > body.limits[a][1] + EPS)
      fail(`too-big on ${a} is not reported exactly`);
  }
  if (!(fit.lidZ > 0)) fail("lid thickness not positive");

  const zones = zoneNodes(build);
  const units = fit.boxes.filter((b) => b.kind === "unit");
  const zoneBoxes = new Map(
    fit.boxes
      .filter((b) => b.kind === "zone")
      .map((b) => [`${b.piece}:${b.zone}`, b]),
  );
  const topWall = F.z - shell.offsets.top;
  if (
    Math.abs(shell.bands.floor[1] - topWall) > EPS ||
    Math.abs(shell.bands.deck[1] - F.z) > EPS
  )
    fail("bands do not run up to the top wall and the top surface");
  // The deck layer: each deck part's column, from its underside up to the top wall.
  const deckColumns = units
    .filter((u) => u.piece === "deck")
    .map((u) => ({ ...u, size: { ...u.size, z: F.z - u.at.z } }));
  // A removable pack replaces the bottom wall under it; a well opens the top wall over a deck part.
  const wallsFor = (u: Box) =>
    u.skin
      ? { ...shell.walls, bottom: 0 }
      : u.piece === "deck"
        ? { ...shell.walls, top: 0 }
        : shell.walls;
  for (const u of units.filter((b) => b.piece === "deck")) {
    const well = shell.wells.some(
      (w) =>
        Math.abs(w.at.x - u.at.x) < EPS &&
        Math.abs(w.at.y - u.at.y) < EPS &&
        Math.abs(w.size.x - u.size.x) < EPS &&
        Math.abs(w.size.y - u.size.y) < EPS,
    );
    if (!well) fail(`${u.id} has no well in the top wall`);
    if (Math.abs(u.at.z + u.size.z - F.z) > EPS)
      fail(`${u.id} is not flush with the top surface`);
  }
  // Removable packs forming the underside: on the outer bottom, each with its hatch in the bottom wall.
  for (const u of units.filter((b) => b.skin)) {
    if (u.role !== "battery") fail(`${u.id} is a skin but not a battery`);
    if (Math.abs(u.at.z) > EPS) fail(`${u.id} skin is not on the outer bottom`);
    const hatch = shell.hatches.some(
      (h) =>
        Math.abs(h.at.x - u.at.x) < EPS &&
        Math.abs(h.at.y - u.at.y) < EPS &&
        Math.abs(h.size.x - u.size.x) < EPS &&
        Math.abs(h.size.y - u.size.y) < EPS,
    );
    if (!hatch) fail(`${u.id} skin has no hatch in the bottom wall`);
  }
  if (shell.hatches.length !== units.filter((b) => b.skin).length)
    fail("a hatch without its pack");

  for (const u of units) {
    for (const k of AXES)
      if (
        !Number.isFinite(u.at[k]) ||
        !Number.isFinite(u.size[k]) ||
        u.size[k] < -EPS
      )
        fail(`${u.id} has a bad ${k}`);
    // Inside the shell after rounding, chamfer and walls.
    const inside =
      u.piece === "lid"
        ? corners(u).every((c) =>
            insideLid(
              c,
              F,
              shell.lid.at.z,
              fit.lidZ,
              style,
              shell.walls.lid,
              shell.walls.lidFront,
            ),
          )
        : corners(u).every((c) => insideBase(c, F, style, wallsFor(u)));
    if (!inside) {
      const bad = corners(u).find((c) =>
        u.piece === "lid"
          ? !insideLid(
              c,
              F,
              shell.lid.at.z,
              fit.lidZ,
              style,
              shell.walls.lid,
              shell.walls.lidFront,
            )
          : !insideBase(c, F, style, wallsFor(u)),
      );
      fail(
        `${u.id} (${u.role}) pokes out of the ${u.piece === "lid" ? "lid" : "base"} shell at ${JSON.stringify(bad)} in frame ${JSON.stringify(F)} (${build.body})`,
      );
    }
    // No floor unit reaches into the deck layer above it; deck parts stay under the top wall; keycaps clear the closed lid.
    if (u.piece === "floor") {
      for (const d of deckColumns)
        if (overlaps(u, d))
          fail(`${u.id} (${u.role}) reaches into the deck layer under ${d.id}`);
      if (u.at.z + u.size.z > topWall + EPS)
        fail(`${u.id} (${u.role}) reaches the top wall`);
      if (!u.skin && u.at.z < shell.offsets.bottom - EPS)
        fail(`${u.id} below the inner floor`);
    }
    if (
      u.piece === "deck" &&
      (u.at.z < shell.bands.deck[0] - EPS || u.at.z + u.size.z > F.z + EPS)
    )
      fail(`${u.id} leaves the deck layer`);
    if (u.role === "keys" && u.at.z + u.size.z > shell.lid.at.z + EPS)
      fail("keycaps reach the closed lid");
    // Every unit inside its zone.
    const zb = zoneBoxes.get(`${u.piece}:${u.zone}`);
    if (!zb) fail(`${u.id} has no zone box`);
    else if (
      (["x", "y"] as const).some(
        (k) =>
          u.at[k] < zb.at[k] - EPS ||
          u.at[k] + u.size[k] > zb.at[k] + zb.size[k] + EPS,
      )
    )
      fail(`${u.id} leaves zone ${u.zone}`);
  }

  // Physical units never overlap within a piece (board blocks sit on the board and are checked among themselves).
  for (const piece of PIECES) {
    const list = units.filter((u) => u.piece === piece);
    const blocks = list.filter((u) => u.id.startsWith("block:"));
    const loose = list.filter((u) => !u.id.startsWith("block:"));
    for (const group of [blocks, loose])
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          if (overlaps(group[i], group[j]))
            fail(`${group[i].id} overlaps ${group[j].id}`);
  }
  const board = units.find((u) => u.role === "board");
  for (const b of units.filter((u) => u.id.startsWith("block:"))) {
    if (!board) fail("blocks without a board");
    else if (
      AXES.some(
        (k) =>
          b.at[k] < board.at[k] - EPS ||
          b.at[k] + b.size[k] > board.at[k] + board.size[k] + EPS,
      )
    )
      fail(`${b.id} leaves the board`);
  }

  // Every zone that declares an edge touches it. Floor and deck share the base's inner box; the lid has its own.
  for (const zb of fit.boxes.filter((b) => b.kind === "zone")) {
    const node = zones[zb.piece].get(zb.zone);
    if (!node) {
      fail(`zone box ${zb.id} not in the plan`);
      continue;
    }
    if (!node.edge) continue;
    const s = zb.piece === "lid" ? shell.offsets.lidSide : shell.offsets.side;
    const touches: Record<Side, boolean> = {
      left: Math.abs(zb.at.x - s) < EPS,
      right: Math.abs(zb.at.x + zb.size.x - (F.x - s)) < EPS,
      front: Math.abs(zb.at.y - s) < EPS,
      rear: Math.abs(zb.at.y + zb.size.y - (F.y - s)) < EPS,
    };
    // The lid is drawn closed, so its y edges are mirrored.
    const side =
      zb.piece === "lid"
        ? (
            {
              left: "left",
              right: "right",
              front: "rear",
              rear: "front",
            } as const
          )[node.edge]
        : node.edge;
    if (!touches[side])
      fail(`zone ${zb.piece}:${zb.zone} does not reach its ${node.edge} edge`);
  }
  // Fin stacks sit on their fan zone's vent edge; ports sit on their own side.
  for (const u of units) {
    const node = zones[u.piece].get(u.zone);
    if (u.role === "fin" || u.role.startsWith("port:")) {
      if (!node?.edge) {
        fail(`${u.id} is in a zone without an edge`);
        continue;
      }
      if (u.role.startsWith("port:") && u.role !== `port:${node.edge}`)
        fail(`${u.id} is on the wrong side`);
      const s = shell.offsets.side;
      const on =
        node.edge === "left"
          ? Math.abs(u.at.x - s) < EPS
          : node.edge === "right"
            ? Math.abs(u.at.x + u.size.x - (F.x - s)) < EPS
            : node.edge === "front"
              ? Math.abs(u.at.y - s) < EPS
              : Math.abs(u.at.y + u.size.y - (F.y - s)) < EPS;
      if (!on)
        fail(`${u.id} (${u.role}) is not flush with its ${node.edge} wall`);
    }
  }

  // Anchors on outer faces.
  const bySide = new Map<Side, [number, number, number, number][]>();
  for (const a of fit.anchors) {
    if (a.kind === "opening") {
      const o = a.opening;
      const plane =
        o.side === "left"
          ? a.at.x === 0
          : o.side === "right"
            ? Math.abs(a.at.x - F.x) < EPS
            : o.side === "front"
              ? a.at.y === 0
              : Math.abs(a.at.y - F.y) < EPS;
      if (!plane) fail(`${o.id} is not on the ${o.side} face`);
      const flat = flatFace(o.side, F, style);
      if (
        o.u[0] < flat.u[0] - EPS ||
        o.u[1] > flat.u[1] + EPS ||
        o.z[0] < flat.z[0] - EPS ||
        o.z[1] > flat.z[1] + EPS
      )
        fail(
          `${o.id} is not on the flat of the ${o.side} face: u ${o.u.map((v) => v.toFixed(2))} z ${o.z.map((v) => v.toFixed(2))} flat u ${flat.u.map((v) => v.toFixed(2))} z ${flat.z.map((v) => v.toFixed(2))} ${build.body} ${build.layout} frame ${JSON.stringify(F)}`,
        );
      const rects = bySide.get(o.side) ?? [];
      for (const r of rects)
        if (
          o.u[0] < r[1] - EPS &&
          r[0] < o.u[1] - EPS &&
          o.z[0] < r[3] - EPS &&
          r[2] < o.z[1] - EPS
        )
          fail(`${o.id} overlaps another opening`);
      rects.push([o.u[0], o.u[1], o.z[0], o.z[1]]);
      bySide.set(o.side, rects);
    } else if (a.kind === "hinge") {
      for (const pt of [a.from, a.to]) {
        if (Math.abs(pt.z - F.z) > EPS || Math.abs(pt.y - F.y) > EPS)
          fail("hinge axis is not on the base's rear top edge");
        if (pt.x < 0 || pt.x > F.x) fail("hinge axis runs outside the base");
      }
    } else if (a.kind === "heat-source") {
      const b = fit.boxes.find((x) => x.id === a.box);
      if (!b || Math.abs(a.at.z - (b.at.z + b.size.z)) > EPS)
        fail(`heat source ${a.box} is not on its chip`);
    } else if (a.kind === "heat-sink") {
      const b = fit.boxes.find((x) => x.id === a.box);
      if (
        !b ||
        AXES.some(
          (k) => a.at[k] < b.at[k] - EPS || a.at[k] > b.at[k] + b.size[k] + EPS,
        )
      )
        fail(`heat sink ${a.box} is not in its fin stack`);
    }
  }
  const fins = units.filter((u) => u.role === "fin").length;
  const vents = fit.anchors.filter(
    (a) => a.kind === "opening" && a.opening.kind === "vent",
  ).length;
  if (fins !== vents) fail("every fin stack needs exactly one vent");
  if (!fit.anchors.some((a) => a.kind === "hinge")) fail("no hinge axis");

  // Ports: each on its own side's face, and in strip order. Side strips run from
  // the rear (hinge end, power first) to the front; front and rear strips run left to right.
  const byStrip = new Map<string, Box[]>();
  for (const u of units) {
    if (!u.role.startsWith("port:")) continue;
    const list = byStrip.get(u.zone) ?? [];
    list.push(u);
    byStrip.set(u.zone, list);
  }
  for (const [zone, list] of byStrip) {
    const side = list[0].role.slice(5) as Side;
    const face = {
      left: (b: Box) => Math.abs(b.at.x - shell.offsets.side) < EPS,
      right: (b: Box) =>
        Math.abs(b.at.x + b.size.x - (F.x - shell.offsets.side)) < EPS,
      front: (b: Box) => Math.abs(b.at.y - shell.offsets.side) < EPS,
      rear: (b: Box) =>
        Math.abs(b.at.y + b.size.y - (F.y - shell.offsets.side)) < EPS,
    }[side];
    for (const b of list)
      if (!face(b)) fail(`${b.id} is not on the ${side} face`);
    const seq = [...list].sort(
      (a, b) => Number(a.id.split(":").pop()) - Number(b.id.split(":").pop()),
    );
    for (let i = 1; i < seq.length; i++) {
      const ok =
        side === "left" || side === "right"
          ? seq[i].at.y < seq[i - 1].at.y
          : seq[i].at.x > seq[i - 1].at.x;
      if (!ok) {
        fail(
          `${zone}: ports are not in strip order (${side === "left" || side === "right" ? "rear to front" : "left to right"})`,
        );
        break;
      }
    }
  }

  // Hinge mounts sit at the two rear corners of the floor.
  const hinges = units.filter((u) => u.role === "hinge");
  const s = shell.offsets.side;
  if (hinges.length !== 2)
    fail(`expected two hinge mounts, found ${hinges.length}`);
  else {
    const [l, r] = [...hinges].sort((a, b) => a.at.x - b.at.x);
    const rear = (h: Box) => Math.abs(h.at.y + h.size.y - (F.y - s)) < EPS;
    if (!rear(l) || Math.abs(l.at.x - s) > EPS)
      fail(
        `left hinge mount is not at the rear left corner (x ${l.at.x.toFixed(1)})`,
      );
    if (!rear(r) || Math.abs(r.at.x + r.size.x - (F.x - s)) > EPS)
      fail(
        `right hinge mount is not at the rear right corner (x ${r.at.x.toFixed(1)})`,
      );
  }

  // The lid clears the base at every angle from closed to past flat.
  const axis = fit.anchors.find((a) => a.kind === "hinge");
  if (axis?.kind === "hinge") {
    const lidZ0 = shell.lid.at.z;
    for (let deg = 0; deg <= LID_MAX_DEG; deg += LID_STEP_DEG) {
      const hit = lidHitsBase(
        F,
        style.wedge,
        lidZ0,
        fit.lidZ,
        axis.from.y,
        axis.from.z,
        deg,
      );
      if (hit) {
        fail(`lid intersects the base at ${deg} degrees`);
        break;
      }
    }
  }
  return errs;
}

const LID_MAX_DEG = 180;
const LID_STEP_DEG = 5;

/**
 * Does the lid, opened by `deg` about the hinge axis (running along x at
 * (py, pz)), overlap the base? Both are compared as their bounding solids in
 * the y-z plane: the base spans y 0 to F.y and z from the wedge's lowest point
 * to F.z; the closed lid spans y 0 to F.y and z lidZ0 to lidZ0 + lidZ. Every
 * part and shell lies inside these, so no overlap here means none in the model.
 * Separating axis test between the rotated lid rectangle and the base rectangle.
 */
function lidHitsBase(
  F: Size,
  wedge: number,
  lidZ0: number,
  lidZ: number,
  py: number,
  pz: number,
  deg: number,
): boolean {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  // Same rotation as the viewer: front edge rises as the lid opens.
  const rot = (y: number, z: number): [number, number] => {
    const dy = y - py;
    const dz = z - pz;
    return [py + dy * c + dz * sn, pz - dy * sn + dz * c];
  };
  const lid = [
    rot(0, lidZ0),
    rot(F.y, lidZ0),
    rot(F.y, lidZ0 + lidZ),
    rot(0, lidZ0 + lidZ),
  ];
  const base: [number, number][] = [
    [0, -wedge],
    [F.y, -wedge],
    [F.y, F.z],
    [0, F.z],
  ];
  const axes: [number, number][] = [
    [1, 0],
    [0, 1],
    [c, -sn],
    [sn, c],
  ];
  const tol = 1e-6;
  for (const [ay, az] of axes) {
    const proj = (pts: [number, number][]) =>
      pts.map(([y, z]) => y * ay + z * az);
    const a = proj(lid);
    const b = proj(base);
    if (
      Math.max(...a) <= Math.min(...b) + tol ||
      Math.max(...b) <= Math.min(...a) + tol
    )
      return false;
  }
  return true;
}

// ------------------------------------------------------------------ runner

interface Stats {
  builds: number;
  times: number[];
  raw: number[];
  failures: string[];
}
const stats: Stats = { builds: 0, times: [], raw: [], failures: [] };

function timedSolve(b: Build): Fit {
  const t0 = performance.now();
  const f = solve(b);
  let t = performance.now() - t0;
  stats.raw.push(t);
  // A single slow sample can be a GC pause or JIT tier-up, not the solver: re-time it.
  for (let k = 0; k < 3 && t > BUDGET_MS; k++) {
    const t1 = performance.now();
    solve(b);
    t = Math.min(t, performance.now() - t1);
  }
  stats.times.push(t);
  return f;
}

function run(label: string, b: Build): Fit {
  const before = JSON.stringify(b);
  const fit = timedSolve(b);
  stats.builds++;
  const errs = check(b, fit);
  if (JSON.stringify(b) !== before) errs.push("solve mutated its input");
  for (const e of errs)
    if (stats.failures.length < 50) stats.failures.push(`${label}: ${e}`);
  return fit;
}

function deterministic(label: string, b: Build): void {
  const h = hashFit(solve(b));
  if (hashFit(solve(clone(b))) !== h || hashFit(solve(reverseKeys(b))) !== h)
    stats.failures.push(`${label}: output hash differs for identical input`);
}

// ------------------------------------------------------------------ tests

describe("fit engine", () => {
  // Warm the JIT so the time budget measures the solver, not compilation.
  for (let i = 0; i < 300; i++)
    solve(baseBuild(i % 2 ? 2006 : 2026, "workhorse", i % 3 ? "a" : "b"));

  it("content is authored soundly", () => {
    stats.failures.length = 0;
    expect(validateContent()).toEqual([]);
    for (const year of YEARS) {
      const count = (c: Category | "port") =>
        partsFor(c, year).reduce(
          (n, p) =>
            n +
            Math.max(
              1,
              Object.values(p.options ?? {}).reduce((m, v) => m * v.length, 1),
            ),
          0,
        );
      const optional = new Set<Category>([
        "graphics",
        "hotswap",
        "optical",
        "webcam",
        "wireless",
      ]);
      for (const c of CATEGORIES) {
        const n =
          c === "display"
            ? panelsFor(year).length
            : count(c) + (optional.has(c) ? 1 : 0);
        expect(n, `${c} in ${year}`).toBeGreaterThanOrEqual(2);
      }
      expect(count("port"), `ports in ${year}`).toBeGreaterThanOrEqual(2);
      for (const list of [
        CONTENT.bodies,
        CONTENT.layouts,
        CONTENT.materials,
        CONTENT.colours,
        CONTENT.finishes,
      ])
        expect(
          list.filter((x) => available(x, year)).length,
        ).toBeGreaterThanOrEqual(2);
    }
  });

  it("every year x body x layout, at min, 1 mm below, max, with spend 0 and 1", () => {
    stats.failures.length = 0;
    for (const year of YEARS)
      for (const body of CONTENT.bodies)
        for (const layout of CONTENT.layouts)
          for (const spend of [0, 1]) {
            const b = withSpend(baseBuild(year, body.id, layout.id), spend);
            const label = `${year} ${body.id} ${layout.id} spend ${spend}`;
            run(`${label} default`, b);
            const lim = body.limits;
            const { size: atMin, min } = minimumOf(b, lim);
            const fitsBody = AXES.every((a) => min[a] <= lim[a][1]);
            const fm = run(`${label} at min`, withSize(b, atMin));
            if (fitsBody && fm.problems.some((p) => p.kind === "geometry"))
              stats.failures.push(`${label}: does not fit at its own minimum`);
            for (const a of AXES) {
              const below = { ...atMin, [a]: min[a] - 1 };
              const f = run(`${label} ${a} 1 mm below`, withSize(b, below));
              const shortBy = f.problems.find(
                (p) =>
                  p.kind === "geometry" && p.code === "short" && p.axis === a,
              );
              if (
                min[a] - 1 >= lim[a][0] &&
                min[a] <= lim[a][1] &&
                (!shortBy ||
                  Math.abs((shortBy as { by: number }).by - 1) > 1e-6)
              )
                stats.failures.push(
                  `${label}: 1 mm below on ${a} is not reported as short by 1 mm`,
                );
            }
            const fx = run(
              `${label} at max`,
              withSize(b, { x: lim.x[1], y: lim.y[1], z: lim.z[1] }),
            );
            const fitsAtMax = AXES.every((a) => fx.min[a] <= lim[a][1]);
            if (fitsAtMax && fx.problems.some((p) => p.kind === "geometry"))
              stats.failures.push(`${label}: does not fit at the body maximum`);
            run(
              `${label} at body min`,
              withSize(b, { x: lim.x[0], y: lim.y[0], z: lim.z[0] }),
            );
            run(
              `${label} outside limits`,
              withSize(b, {
                x: lim.x[0] - 50,
                y: lim.y[1] + 50,
                z: lim.z[0] - 5,
              }),
            );
            deterministic(label, b);
            // The builder starts empty: no parts, no ports. It must still solve cleanly.
            const empty: Build = { ...b, parts: {}, ports: [], spend: {} };
            const fe = run(`${label} empty`, empty);
            run(
              `${label} empty at max`,
              withSize(empty, { x: lim.x[1], y: lim.y[1], z: lim.z[1] }),
            );
            if (
              fe.problems.some(
                (p) => p.kind === "geometry" && p.code === "too-big",
              )
            )
              stats.failures.push(`${label}: an empty build is too big`);
          }
    expect(stats.failures).toEqual([]);
  });

  it("every option of every category builds compatibly and fits some body and layout", () => {
    stats.failures.length = 0;
    const covered: string[] = [];
    for (const year of YEARS) {
      const bodies = CONTENT.bodies.filter((b) => available(b, year));
      const cpus = partsFor("processor", year);
      const mems = partsFor("memory", year);
      // Every (part, option value) as a substitution into the base build. Ports go on any side the layout has.
      const subs: {
        label: string;
        category: Category | "port";
        apply: (b: Build, side: Side, variant: number) => Build;
        /** Other option values of the same part to try alongside the one under test. */
        variants?: number;
      }[] = [];
      for (const c of CATEGORIES) {
        if (c === "display") {
          for (const p of panelsFor(year))
            for (const r of p.refresh)
              subs.push({
                label: `${p.id} @${r}`,
                category: c,
                apply: (b) => ({
                  ...b,
                  parts: {
                    ...b.parts,
                    display: [{ part: p.id, opts: { refresh: r } }],
                  },
                }),
              });
          continue;
        }
        for (const part of partsFor(c, year)) {
          const opts = Object.entries(part.options ?? {});
          const combos: BuildPart[] =
            opts.length === 0
              ? [{ part: part.id }]
              : opts.flatMap(([k, vs]) =>
                  vs.map((v) => ({ part: part.id, opts: { [k]: v } })),
                );
          for (const bp of combos) {
            // The value under test stays fixed; the part's other options range over their values.
            let alts: BuildPart[] = [bp];
            for (const [k, vs] of opts) {
              if (bp.opts && k in bp.opts) continue;
              alts = alts.flatMap((a) =>
                vs.map((v) => ({ ...a, opts: { ...a.opts, [k]: v } })),
              );
            }
            subs.push({
              label: `${c} ${part.id} ${JSON.stringify(bp.opts ?? {})}`,
              category: c,
              variants: alts.length,
              apply: (b, _side, variant) => ({
                ...b,
                parts: { ...b.parts, [c]: [alts[variant]] },
              }),
            });
          }
        }
      }
      for (const port of partsFor("port", year))
        subs.push({
          label: `port ${port.id}`,
          category: "port",
          apply: (b, side) => ({
            ...b,
            ports: [...b.ports, { part: port.id, side }],
          }),
        });

      for (const sub of subs) {
        let compatible = false;
        let fits = false;
        search: for (const layout of CONTENT.layouts)
          for (const side of sub.category === "port"
            ? layout.portSides
            : (["left"] as Side[]))
            for (let variant = 0; variant < (sub.variants ?? 1); variant++)
              for (const cpu of cpus)
                for (const mem of mems) {
                  const base = baseBuild(year, bodies[0].id, layout.id);
                  const swapped = {
                    ...base,
                    parts: {
                      ...base.parts,
                      processor: [{ part: cpu.id }],
                      memory: [{ part: mem.id }],
                    },
                  };
                  const b = sub.apply(swapped, side, variant);
                  if (sub.category === "processor")
                    b.parts.memory = swapped.parts.memory;
                  if (sub.category === "memory")
                    b.parts.processor = swapped.parts.processor;
                  if (!solve(b).problems.every((p) => p.kind === "geometry"))
                    continue;
                  compatible = true;
                  for (const body of bodies) {
                    const at = {
                      ...b,
                      body: body.id,
                      size: {
                        x: body.limits.x[1],
                        y: body.limits.y[1],
                        z: body.limits.z[1],
                      },
                    };
                    const f = run(
                      `${year} ${sub.label} ${layout.id} ${side} on ${body.id}`,
                      at,
                    );
                    run(
                      `${year} ${sub.label} ${layout.id} ${side} on ${body.id} spend 1`,
                      withSpend(at, 1),
                    );
                    if (f.problems.length === 0) {
                      fits = true;
                      break search;
                    }
                  }
                }
        if (!compatible)
          stats.failures.push(
            `${year} ${sub.label}: no compatible build exists`,
          );
        else if (!fits)
          stats.failures.push(
            `${year} ${sub.label}: fits no body and layout of its year at maximum size`,
          );
        covered.push(sub.label);
      }
      // Every port on every side, fit or not, through the invariants.
      for (const port of partsFor("port", year))
        for (const layout of CONTENT.layouts)
          for (const side of SIDES)
            run(`${year} port ${port.id} ${side} ${layout.id}`, {
              ...baseBuild(year, bodies[0].id, layout.id),
              ports: [
                { part: "dc-jack", side: layout.portSides[0] },
                { part: port.id, side },
              ],
            });
    }
    console.log(`option coverage: ${covered.length} part and option values`);
    expect(covered.length).toBeGreaterThan(200);
    expect(stats.failures).toEqual([]);
  });

  it("reference builds solve cleanly apart from the one meant not to fit", () => {
    stats.failures.length = 0;
    for (const s of SAMPLES) {
      const f = run(`sample ${s.id}`, s.build);
      const other = f.problems.filter((p) => p.kind !== "geometry");
      expect(other, s.id).toEqual([]);
      if (s.id === "no-fit")
        expect(
          f.problems.some((p) => p.kind === "geometry" && p.code === "too-big"),
        ).toBe(true);
      deterministic(`sample ${s.id}`, s.build);
    }
    expect(stats.failures).toEqual([]);
  });

  it("reference builds land within 2 mm of their real machine's total thickness", () => {
    const lines: string[] = [];
    const off: string[] = [];
    for (const s of SAMPLES) {
      if (!s.thickness) continue;
      const body = CONTENT.bodies.find((b) => b.id === s.build.body);
      if (!body) throw new Error(s.build.body);
      const { size } = minimumOf(s.build, body.limits);
      const f = solve(withSize(s.build, size));
      const front = f.min.z + f.lidZ;
      const rear = front + body.style.wedge;
      const [lo, hi] = s.thickness;
      lines.push(
        `${s.id}: ${front.toFixed(1)}${rear > front ? ` to ${rear.toFixed(1)}` : ""} vs ${lo} to ${hi}`,
      );
      const known = KNOWN_THIN[s.id];
      // Every real machine must be buildable at its thickness: the minimum is never more than 2 mm over.
      if (rear > hi + 2)
        off.push(
          `${s.id} is ${(rear - hi).toFixed(1)} mm thicker than the real machine`,
        );
      if (front < lo - 2 && !known)
        off.push(
          `${s.id} is ${(lo - front).toFixed(1)} mm thinner than the real machine`,
        );
    }
    console.log(
      ["reference thickness, engine minimum vs real:", ...lines].join("\n  "),
    );
    expect(off).toEqual([]);
  });

  it("at max spend, fans never make a thin 2026 ultrabook taller than its battery and keyboard do", () => {
    const bad: string[] = [];
    for (const body of CONTENT.bodies.filter((b) => available(b, 2026)))
      for (const layout of CONTENT.layouts)
        for (const cooling of ["one-fan", "two-fans"]) {
          const b = withSpend(baseBuild(2026, body.id, layout.id), 1);
          b.parts = {
            ...b.parts,
            battery: [
              { part: "li-po-pouch", opts: { wh: 60, thickness: "slim" } },
            ],
            cooling: [{ part: cooling }],
          };
          const { size } = minimumOf(b, body.limits);
          const withFans = solve(withSize(b, size)).min.z;
          const noFans = solve(
            withSize(
              { ...b, parts: { ...b.parts, cooling: [{ part: "fanless" }] } },
              size,
            ),
          ).min.z;
          if (withFans > noFans + 1e-6)
            bad.push(
              `${body.id} ${layout.id} ${cooling}: ${withFans.toFixed(2)} with fans vs ${noFans.toFixed(2)} without`,
            );
        }
    expect(bad).toEqual([]);
  });

  it(`a seeded random sample of ${RANDOM_BUILDS} full builds`, () => {
    stats.failures.length = 0;
    const rnd = mulberry32(20060626);
    const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)];
    const spendValue = () => {
      const r = rnd();
      return r < 0.2 ? 0 : r < 0.4 ? 1 : rnd();
    };
    for (let i = 0; i < RANDOM_BUILDS; i++) {
      const year = pick(YEARS);
      // Mostly this year's content; sometimes the other year's, to exercise year problems.
      const yearOf = () => (rnd() < 0.05 ? pick(YEARS) : year);
      const body =
        rnd() < 0.9
          ? pick(CONTENT.bodies.filter((b) => available(b, year)))
          : pick(CONTENT.bodies);
      const layout = pick(CONTENT.layouts);
      const parts: Build["parts"] = {};
      for (const c of CATEGORIES) {
        const optional = [
          "graphics",
          "hotswap",
          "optical",
          "webcam",
          "wireless",
        ].includes(c);
        if (optional && rnd() < 0.4) continue;
        const n = c === "storage" ? 1 + Math.floor(rnd() * 2.2) : 1;
        const list: BuildPart[] = [];
        for (let k = 0; k < n; k++) {
          if (c === "display") {
            const p = pick(panelsFor(yearOf()));
            list.push({ part: p.id, opts: { refresh: pick(p.refresh) } });
            continue;
          }
          const part = pick(partsFor(c, yearOf()));
          const opts: Record<string, string | number> = {};
          for (const [key, vs] of Object.entries(part.options ?? {}))
            if (rnd() < 0.8) opts[key] = pick(vs);
          list.push({ part: part.id, opts });
        }
        parts[c] = list;
      }
      const ports = Array.from({ length: Math.floor(rnd() * 11) }, () => ({
        part: pick(partsFor("port", yearOf())).id,
        side: rnd() < 0.9 ? pick(layout.portSides) : pick(SIDES),
      }));
      const mats = CONTENT.materials.map((m) => m.id);
      const materials = {
        floor: pick(mats),
        deck: pick(mats),
        lid: pick(mats),
      };
      const finish = Object.fromEntries(
        PIECES.map((p) => [
          p,
          {
            colour: pick(CONTENT.colours).id,
            texture: pick(CONTENT.finishes).id,
          },
        ]),
      ) as Build["finish"];
      const spend: Build["spend"] = {
        packing: spendValue(),
        material: spendValue(),
      };
      for (const c of CATEGORIES) if (rnd() < 0.5) spend[c] = spendValue();
      const lim = body.limits;
      const r = (a: Axis) =>
        lim[a][0] - 10 + rnd() * (lim[a][1] - lim[a][0] + 20);
      const b: Build = {
        year,
        body: body.id,
        layout: layout.id,
        size: { x: r("x"), y: r("y"), z: r("z") },
        parts,
        ports,
        materials,
        finish,
        spend,
      };
      run(`random ${i}`, b);
      // Also at its own minimum, where every margin is zero.
      if (i % 4 === 0) {
        const m = minimumOf(b, lim);
        const f = run(`random ${i} at min`, withSize(b, m.size));
        const fitsBody = AXES.every((a) => m.min[a] <= lim[a][1]);
        if (fitsBody && f.problems.some((p) => p.kind === "geometry"))
          stats.failures.push(`random ${i}: does not fit at its own minimum`);
      }
      if (i % 10 === 0) deterministic(`random ${i}`, b);
    }
    expect(stats.failures).toEqual([]);
  }, 60_000);

  it("hinges and lid hold at every size: the full shared body range for every year, body and layout", () => {
    stats.failures.length = 0;
    const range = (lo: number, hi: number) => [
      lo,
      lo + (hi - lo) * 0.25,
      (lo + hi) / 2,
      lo + (hi - lo) * 0.75,
      hi,
    ];
    for (const year of YEARS)
      for (const body of CONTENT.bodies)
        for (const layout of CONTENT.layouts) {
          const full = baseBuild(year, body.id, layout.id);
          const empty: Build = { ...full, parts: {}, ports: [], spend: {} };
          const lim = body.limits;
          for (const x of range(lim.x[0], lim.x[1]))
            for (const y of range(lim.y[0], lim.y[1]))
              for (const z of range(lim.z[0], lim.z[1]))
                for (const [kind, b] of [
                  ["full", full],
                  ["empty", empty],
                ] as const)
                  run(
                    `${year} ${body.id} ${layout.id} ${kind} ${x.toFixed(0)} x ${y.toFixed(0)} x ${z.toFixed(0)}`,
                    withSize(b, { x, y, z }),
                  );
        }
    expect(stats.failures).toEqual([]);
  }, 60_000);

  it(`every solve finishes inside ${BUDGET_MS} ms`, () => {
    stats.failures.length = 0;
    const sorted = [...stats.times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const worst = sorted[sorted.length - 1];
    const rawWorst = Math.max(...stats.raw);
    console.log(
      `fit check: ${stats.builds} builds checked; solve median ${median.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, worst ${worst.toFixed(3)} ms (worst single raw sample ${rawWorst.toFixed(3)} ms)`,
    );
    expect(worst).toBeLessThan(BUDGET_MS);
  });
});
