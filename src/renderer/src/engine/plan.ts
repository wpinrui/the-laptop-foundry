import type { Era, Node, PlanAxis, Side, Size, Vec3, ZoneNode } from "./types";
import { isZone } from "./types";
import type { Unit } from "./units";
import { OPENING_ROLES } from "./units";

// Plans are split trees. Bottom-up: each zone packs its units, splits sum
// along their axis and take the largest across it. Top-down: each axis on its
// own, slack goes to children by grow weight, children stretch across.

export interface PlanCtx {
  gap: number;
  /** Keep-out at each end of an opening strip, clear of rounded plan corners. */
  ko: number;
  /** Units in opening zones sit this far up, clear of the bottom edge profile. */
  lift: number;
  /** Bottom wall: a skin unit sits this far below the inner floor, on the outer bottom. */
  bottom: number;
  era: Era;
  finDepth: number;
  /** Sustained chip heat each fan carries, W: a fan grows only as far as that needs. */
  fanWatts?: number;
}

/**
 * Fan side, mm, that carries `watts` at full speed with the sink 40 K over the
 * room and three quarters to spare: the cooling model's airflow term solved for size.
 */
export function fanSideFor(watts: number, thickness: number): number {
  const need = (watts * 1.75) / 40;
  return 50 * (need / (0.7 * (thickness / 10) ** 0.8)) ** (1 / 1.2);
}

export interface ZoneFill {
  node: ZoneNode;
  units: Unit[];
  min: Size | null;
  /**
   * Corner keep-out at the low and high end of an opening zone along its edge.
   * Only an end that reaches the corner of the face needs it.
   */
  koLo: number;
  koHi: number;
  /** Plan rect after placement. */
  at?: { x: number; y: number };
  size?: { x: number; y: number };
}

export interface PlacedUnit extends Unit {
  at: Vec3;
  zone: string;
}

export function zonesOf(root: Node): ZoneNode[] {
  const out: ZoneNode[] = [];
  const walk = (n: Node) => {
    if (isZone(n)) out.push(n);
    else for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Deal units to zones by role, round-robin in tree order, skipping full zones. */
export function deal(
  root: Node,
  units: Unit[],
): { fills: Map<ZoneNode, ZoneFill>; unplaced: Unit[] } {
  const zones = zonesOf(root);
  const fills = new Map<ZoneNode, ZoneFill>();
  for (const z of zones)
    fills.set(z, { node: z, units: [], min: null, koLo: 0, koHi: 0 });
  const cursor = new Map<string, number>();
  const unplaced: Unit[] = [];
  for (const u of units) {
    const takers = zones.filter((z) => z.takes.includes(u.role));
    let start = cursor.get(u.role) ?? 0;
    let placed = false;
    for (let k = 0; k < takers.length; k++) {
      const z = takers[(start + k) % takers.length];
      const fill = fills.get(z) as ZoneFill;
      if (z.capacity !== undefined && fill.units.length >= z.capacity) continue;
      fill.units.push(u);
      start = (start + k + 1) % takers.length;
      placed = true;
      break;
    }
    cursor.set(u.role, start);
    if (!placed) unplaced.push(u);
  }
  return { fills, unplaced };
}

export function edgeAxis(side: Side): PlanAxis {
  return side === "left" || side === "right" ? "x" : "y";
}
export function alongAxis(side: Side): PlanAxis {
  return side === "left" || side === "right" ? "y" : "x";
}
function other(a: PlanAxis): PlanAxis {
  return a === "x" ? "y" : "x";
}

export function isFanZone(z: ZoneNode): boolean {
  return z.takes.includes("fan");
}

export function isOpeningZone(fill: ZoneFill): boolean {
  return !!fill.node.edge && fill.units.some((u) => OPENING_ROLES.has(u.role));
}

function zoneMin(fill: ZoneFill, ctx: PlanCtx): Size | null {
  const { node, units } = fill;
  if (units.length === 0) return null;
  const opening = isOpeningZone(fill);
  const lift = opening ? ctx.lift : 0;
  if (isFanZone(node) && node.edge) {
    const k = units.filter((u) => u.role === "fan").length;
    const e = alongAxis(node.edge);
    const fan = ctx.era.fan.min;
    // The thinnest fan this build allows (cooling spend thins it); fans only grow into slack.
    const fanZ = units.find((u) => u.role === "fan")?.size.z ?? fan.z;
    const size: Size = { x: 0, y: 0, z: fanZ + lift };
    size[e] = k * fan.x + Math.max(0, k - 1) * ctx.gap + fill.koLo + fill.koHi;
    size[other(e)] = fan.x + ctx.finDepth;
    return size;
  }
  const p = node.pack;
  const size: Size = { x: 0, y: 0, z: 0 };
  for (const u of units) {
    // A skin sits on the outer bottom, so only its height above the inner floor counts.
    const h = u.skin ? Math.max(0, u.size.z - ctx.bottom) : u.size.z;
    for (const a of ["x", "y", "z"] as const) {
      const v = a === "z" ? h : u.size[a];
      size[a] = a === p ? size[a] + v : Math.max(size[a], v);
    }
  }
  if (p !== "z") size[p] += Math.max(0, units.length - 1) * ctx.gap;
  if (opening && node.edge) size[alongAxis(node.edge)] += fill.koLo + fill.koHi;
  size.z += lift;
  return size;
}

export interface PlanSolve {
  fills: Map<ZoneNode, ZoneFill>;
  mins: Map<Node, { x: number; y: number } | null>;
  root: Node;
  ctx: PlanCtx;
}

export function measure(
  root: Node,
  fills: Map<ZoneNode, ZoneFill>,
  ctx: PlanCtx,
): PlanSolve {
  // Corner keep-out: an opening zone's end needs clearance only as far as it
  // sits inside the rounded corner, i.e. by ctx.ko less its distance from the
  // inner edge. That distance is at least the sum of what precedes it, measured
  // first without any keep-out (a lower bound, so the clearance is conservative).
  for (const f of fills.values()) {
    f.koLo = 0;
    f.koHi = 0;
  }
  const mins = new Map<Node, { x: number; y: number } | null>();
  const walk = (n: Node): { x: number; y: number } | null => {
    let m: { x: number; y: number } | null = null;
    if (isZone(n)) {
      const fill = fills.get(n) as ZoneFill;
      fill.min = zoneMin(fill, ctx);
      m = fill.min
        ? { x: fill.min.x, y: fill.min.y }
        : n.keep
          ? { x: 0, y: 0 }
          : null;
    } else {
      const a = n.split;
      const c = other(a);
      let count = 0;
      const acc = { x: 0, y: 0 };
      for (const child of n.children) {
        const cm = walk(child);
        if (!cm) continue;
        acc[a] += cm[a];
        acc[c] = Math.max(acc[c], cm[c]);
        count++;
      }
      if (count > 0) {
        acc[a] += (count - 1) * ctx.gap;
        m = acc;
      }
    }
    mins.set(n, m);
    return m;
  };
  walk(root);
  if (ctx.ko > 0) {
    type Dist = { x: number; y: number };
    const lead = (n: Node, lo: Dist, hi: Dist) => {
      if (isZone(n)) {
        const fill = fills.get(n) as ZoneFill;
        if (n.edge && isOpeningZone(fill)) {
          const a = alongAxis(n.edge);
          fill.koLo = Math.max(0, ctx.ko - lo[a]);
          fill.koHi = Math.max(0, ctx.ko - hi[a]);
        }
        return;
      }
      const a = n.split;
      const kids = n.children.filter((c) => mins.get(c));
      kids.forEach((c, i) => {
        const before = kids
          .slice(0, i)
          .reduce((s2, k2) => s2 + (mins.get(k2) as Dist)[a] + ctx.gap, 0);
        const after = kids
          .slice(i + 1)
          .reduce((s2, k2) => s2 + (mins.get(k2) as Dist)[a] + ctx.gap, 0);
        lead(c, { ...lo, [a]: lo[a] + before }, { ...hi, [a]: hi[a] + after });
      });
    };
    lead(root, { x: 0, y: 0 }, { x: 0, y: 0 });
    walk(root);
  }
  return { fills, mins, root, ctx };
}

/** Grow weight of a node along an axis: a same-axis split sums, a cross split takes its largest. */
function weight(n: Node, a: PlanAxis, mins: PlanSolve["mins"]): number {
  if (!mins.get(n)) return 0;
  if (isZone(n)) return n.grow;
  const ws = n.children.map((c) => weight(c, a, mins));
  return n.split === a ? ws.reduce((s, w) => s + w, 0) : Math.max(0, ...ws);
}

/** Top-down placement in a rect. A rect smaller than the minimum is raised to it by the caller. */
export function place(
  ps: PlanSolve,
  at: { x: number; y: number },
  size: { x: number; y: number },
): void {
  const walk = (
    n: Node,
    pos: { x: number; y: number },
    sz: { x: number; y: number },
  ) => {
    if (isZone(n)) {
      const fill = ps.fills.get(n) as ZoneFill;
      fill.at = { ...pos };
      fill.size = { ...sz };
      if (n.edge && isOpeningZone(fill) && ps.ctx.ko > 0) {
        const a = alongAxis(n.edge);
        fill.koLo = Math.max(0, ps.ctx.ko - (pos[a] - at[a]));
        fill.koHi = Math.max(
          0,
          ps.ctx.ko - (at[a] + size[a] - (pos[a] + sz[a])),
        );
      }
      return;
    }
    const a = n.split;
    const kids = n.children.filter((c) => ps.mins.get(c));
    if (kids.length === 0) return;
    const used =
      kids.reduce(
        (s, c) => s + (ps.mins.get(c) as { x: number; y: number })[a],
        0,
      ) +
      (kids.length - 1) * ps.ctx.gap;
    const slack = Math.max(0, sz[a] - used);
    const ws = kids.map((c) => weight(c, a, ps.mins));
    const total = ws.reduce((s, w) => s + w, 0);
    let cursor = pos[a];
    kids.forEach((c, i) => {
      const extra =
        slack === 0
          ? 0
          : total > 0
            ? (slack * ws[i]) / total
            : slack / kids.length;
      const len = (ps.mins.get(c) as { x: number; y: number })[a] + extra;
      const cpos = { ...pos };
      cpos[a] = cursor;
      const csz = { ...sz };
      csz[a] = len;
      walk(c, cpos, csz);
      cursor += len + ps.ctx.gap;
    });
  };
  walk(ps.root, at, size);
}

/**
 * Place a zone's units inside its rect. z0 is the bottom of the zone's band and
 * bandH its height (the floor band grows with the player's z; fans fill it).
 */
export function placeUnits(
  fill: ZoneFill,
  ctx: PlanCtx,
  z0: number,
  bandH: number,
): PlacedUnit[] {
  const { node, units } = fill;
  if (!fill.at || !fill.size || units.length === 0) return [];
  const at = fill.at;
  const sz = fill.size;
  const opening = isOpeningZone(fill);
  const lift = opening ? ctx.lift : 0;
  const zBase = z0 + lift;
  const out: PlacedUnit[] = [];

  if (isFanZone(node) && node.edge) {
    const fans = units.filter((u) => u.role === "fan");
    const fins = units.filter((u) => u.role === "fin");
    const k = fans.length;
    const e = alongAxis(node.edge);
    const n = edgeAxis(node.edge);
    const lim = ctx.era.fan;
    const alongRoom =
      (sz[e] - fill.koLo - fill.koHi - Math.max(0, k - 1) * ctx.gap) /
      Math.max(1, k);
    const fz = Math.min(
      lim.max.z,
      Math.max(fans[0]?.size.z ?? lim.min.z, bandH - lift),
    );
    const needed = ctx.fanWatts === undefined ? Infinity : fanSideFor(ctx.fanWatts, fz);
    const side = Math.min(
      lim.max.x,
      Math.max(lim.min.x, Math.min(alongRoom, sz[n] - ctx.finDepth, needed)),
    );
    const group = k * side + Math.max(0, k - 1) * ctx.gap;
    let u0 = at[e] + fill.koLo + (sz[e] - fill.koLo - fill.koHi - group) / 2;
    const atEnd = node.edge === "right" || node.edge === "rear";
    const finN = atEnd ? at[n] + sz[n] - ctx.finDepth : at[n];
    const fanN = atEnd ? finN - side : at[n] + ctx.finDepth;
    for (let i = 0; i < k; i++) {
      const fanAt: Vec3 = { x: 0, y: 0, z: zBase };
      fanAt[e] = u0;
      fanAt[n] = fanN;
      const fanSize: Size = { x: side, y: side, z: fz };
      out.push({ ...fans[i], at: fanAt, size: fanSize, zone: node.zone });
      if (fins[i]) {
        const finAt: Vec3 = { x: 0, y: 0, z: zBase };
        finAt[e] = u0;
        finAt[n] = finN;
        const finSize: Size = { x: 0, y: 0, z: fz };
        finSize[e] = side;
        finSize[n] = ctx.finDepth;
        out.push({ ...fins[i], at: finAt, size: finSize, zone: node.zone });
      }
      u0 += side + ctx.gap;
    }
    return out;
  }

  const p = node.pack;
  const edgeA = node.edge ? edgeAxis(node.edge) : undefined;
  const alongA = opening && node.edge ? alongAxis(node.edge) : undefined;
  const range = (a: PlanAxis): [number, number] => {
    const lo = a === alongA ? fill.koLo : 0;
    const hi = a === alongA ? fill.koHi : 0;
    return [at[a] + lo, at[a] + sz[a] - hi];
  };
  const alignOf = (a: PlanAxis): "start" | "centre" | "end" => {
    if (a === edgeA)
      return node.edge === "left" || node.edge === "front" ? "start" : "end";
    if (a === p) return node.align ?? "start";
    return "centre";
  };
  const put = (
    lo: number,
    hi: number,
    len: number,
    al: "start" | "centre" | "end",
  ) =>
    al === "start" ? lo : al === "end" ? hi - len : lo + (hi - lo - len) / 2;

  let cursor = 0;
  let total = 0;
  if (p !== "z")
    total =
      units.reduce((s, u) => s + u.size[p], 0) +
      Math.max(0, units.length - 1) * ctx.gap;
  if (p !== "z") {
    const [lo, hi] = range(p);
    cursor = put(lo, hi, total, alignOf(p));
  }
  let zc = zBase;
  // Packing from the end: the first unit sits at the high end of the group.
  const ordered =
    node.packFrom === "end" && p !== "z" ? [...units].reverse() : units;
  for (const u of ordered) {
    const pos: Vec3 = { x: 0, y: 0, z: zBase };
    for (const a of ["x", "y"] as const) {
      if (a === p) {
        pos[a] = cursor;
      } else {
        const [lo, hi] = range(a);
        pos[a] = put(lo, hi, u.size[a], alignOf(a));
      }
    }
    if (u.skin) pos.z = z0 - ctx.bottom;
    if (p === "z") {
      pos.z = zc;
      zc += u.skin ? Math.max(0, u.size.z - ctx.bottom) : u.size.z;
    } else {
      cursor += u.size[p] + ctx.gap;
    }
    out.push({ ...u, at: pos, size: { ...u.size }, zone: node.zone });
  }
  return out;
}
