import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION MAINBOARD: the bare PCB.
//
// A slab at the bottom of the box, 1.6 mm thick in 2006 and 1.0 mm in 2026, in
// the body slot (the engine colours it: green in 2006, dark in 2026), with
// rounded corners and plated mounting holes. The rest of the box belongs to the
// chips, memory, drives and cards the engine sets on top.
//
// The model is not told where those blocks sit (src/renderer/src/engine/board.ts
// packs two rows of varying widths and depths, centred, so any part of the top
// can be under a block). Surface detail is therefore copper-thin only: routed
// buses of parallel traces with 45 degree jogs, a via at each trace end, and
// plated rings round the mounting holes, all within 0.1 mm of the PCB top.
// Blocks sit on it exactly as real parts sit on their copper; nothing rises
// into their space. Routing uses ctx.random, so each board is its own but the
// same inputs give the same board.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number]; // (x, z) in plan

// Copper heights above the PCB top. Far enough apart to hold in a 24-bit depth
// buffer at whole-laptop viewing distances, still well under the 1 mm limit.
const TRACE_Y = 0.06;
const RING_Y = 0.08;
const VIA_Y = 0.1;

/** Merged, indexed triangle buffer; every face here points up. */
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number): number {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }
  /** Wind a triangle so its normal points up (+y). */
  tri(a: number, b: number, c: number): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const wx = p[c * 3] - p[a * 3], wz = p[c * 3 + 2] - p[a * 3 + 2];
    // y of (u x w) = uz * wx - ux * wz
    if (uz * wx - ux * wz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  mesh(mat: THREE.Material, name: string): THREE.Mesh | undefined {
    if (this.idx.length === 0) return undefined;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    return m;
  }
}

/** Offset an open plan polyline to its right-hand side (n = (tz, -tx)) with mitred joints. */
function offset(pts: P2[], d: number): P2[] {
  const n = pts.length;
  const segN: P2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const tx = pts[i + 1][0] - pts[i][0];
    const tz = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(tx, tz) || 1;
    segN.push([tz / l, -tx / l]);
  }
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = segN[Math.max(0, i - 1)];
    const b = segN[Math.min(n - 2, i)];
    let mx = a[0] + b[0];
    let mz = a[1] + b[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const k = Math.min(3, 1 / Math.max(0.2, mx * b[0] + mz * b[1]));
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  return out;
}

/** Distance from point p to segment ab, in plan. */
function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

// Eight plan directions, even indices on the axes.
const DIRS: P2[] = [
  [1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0], [-Math.SQRT1_2, -Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2],
];

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const old = ctx.year < 2015;
  const rnd = ctx.random;
  const W = box.width;
  const D = box.depth;
  const H = box.height;
  const x1 = W / 2, z1 = D / 2;
  const yBot = -H / 2;
  const t = Math.min(old ? 1.6 : 1.0, H - 0.1);
  const yTop = yBot + t;

  // ---------------------------------------------------------------- slab
  const rc = old ? 2 : 3; // corner radius
  const holeR = old ? 1.6 : 1.2;
  const ringR = holeR + (old ? 1.6 : 1.2);
  const inset = ringR + 1;
  const holes: P2[] = [
    [-x1 + inset, -z1 + inset],
    [x1 - inset, -z1 + inset],
    [x1 - inset, z1 - inset],
    [-x1 + inset, z1 - inset],
    [0, -z1 + inset],
    [0, z1 - inset],
  ];
  const s = new THREE.Shape();
  s.moveTo(-x1 + rc, z1);
  s.lineTo(x1 - rc, z1);
  s.absarc(x1 - rc, z1 - rc, rc, Math.PI / 2, 0, true);
  s.lineTo(x1, -z1 + rc);
  s.absarc(x1 - rc, -z1 + rc, rc, 0, -Math.PI / 2, true);
  s.lineTo(-x1 + rc, -z1);
  s.absarc(-x1 + rc, -z1 + rc, rc, -Math.PI / 2, -Math.PI, true);
  s.lineTo(-x1, z1 - rc);
  s.absarc(-x1 + rc, z1 - rc, rc, Math.PI, Math.PI / 2, true);
  for (const [hx, hz] of holes) {
    const p = new THREE.Path();
    p.absarc(hx, hz, holeR, 0, Math.PI * 2, false);
    s.holes.push(p);
  }
  // The shape is drawn in (x, z); extrude along +z then turn up: shape y (= z) must map to world z.
  const slabGeo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 });
  slabGeo.rotateX(Math.PI / 2); // extrusion z -> -y, shape y -> +z
  slabGeo.translate(0, yTop, 0);

  // ---------------------------------------------------------------- copper
  const copper = new Buf();
  const rings = new Buf();
  const vias = new Buf();

  const ring = (cx: number, cz: number, rIn: number, rOut: number, segs: number, y: number, b: Buf) => {
    const inner: number[] = [];
    const outer: number[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      inner.push(b.v(cx + rIn * Math.cos(a), y, cz + rIn * Math.sin(a)));
      outer.push(b.v(cx + rOut * Math.cos(a), y, cz + rOut * Math.sin(a)));
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      b.quad(inner[i], inner[j], outer[j], outer[i]);
    }
  };
  const disc = (cx: number, cz: number, r: number, y: number, b: Buf) => {
    const c = b.v(cx, y, cz);
    const ps: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ps.push(b.v(cx + r * Math.cos(a), y, cz + r * Math.sin(a)));
    }
    for (let i = 0; i < 6; i++) b.tri(c, ps[i], ps[(i + 1) % 6]);
  };

  for (const [hx, hz] of holes) ring(hx, hz, holeR, ringR, 16, yTop + RING_Y, rings);

  // Routed buses of parallel traces.
  const tw = old ? 0.3 : 0.2; // trace width
  const pitch = old ? 0.7 : 0.45;
  const viaR = old ? 0.45 : 0.32;
  const edge = 1.5; // keep copper off the board edge
  const area = W * D;
  const buses = Math.round(Math.min(14, Math.max(6, area / 1600)));
  const span = Math.min(W, D);
  const inside = (p: P2, pad: number) =>
    Math.abs(p[0]) <= x1 - edge - pad && Math.abs(p[1]) <= z1 - edge - pad;
  const clear = (a: P2, b: P2, pad: number) =>
    holes.every((h) => segDist(h, a, b) > ringR + 1 + pad);

  for (let bi = 0; bi < buses; bi++) {
    const lines = 3 + Math.floor(rnd() * 6);
    const half = ((lines - 1) * pitch) / 2 + tw / 2 + viaR;
    // Start on a random edge, heading inward along an axis.
    const side = Math.floor(rnd() * 4);
    let d = [6, 4, 2, 0][side]; // front edge heads -z, right edge -x, back +z, left +x
    const along = rnd() * 2 - 1;
    let p: P2 =
      side === 0 ? [along * (x1 - edge - half), z1 - edge - half]
      : side === 1 ? [x1 - edge - half, along * (z1 - edge - half)]
      : side === 2 ? [along * (x1 - edge - half), -z1 + edge + half]
      : [-x1 + edge + half, along * (z1 - edge - half)];
    const path: P2[] = [p];
    for (let step = 0; step < 5; step++) {
      const axis = d % 2 === 0;
      const len = axis ? (0.12 + 0.3 * rnd()) * span : 2 + 8 * rnd();
      const next: P2 = [p[0] + DIRS[d][0] * len, p[1] + DIRS[d][1] * len];
      if (!inside(next, half) || !clear(p, next, half)) break;
      path.push(next);
      p = next;
      d = (d + (rnd() < 0.5 ? 1 : 7)) % 8; // turn 45 degrees either way
    }
    if (path.length < 2) continue;
    for (let j = 0; j < lines; j++) {
      const o = (j - (lines - 1) / 2) * pitch;
      const L = offset(path, o - tw / 2);
      const R = offset(path, o + tw / 2);
      let pl = copper.v(L[0][0], yTop + TRACE_Y, L[0][1]);
      let pr = copper.v(R[0][0], yTop + TRACE_Y, R[0][1]);
      for (let i = 1; i < path.length; i++) {
        const nl = copper.v(L[i][0], yTop + TRACE_Y, L[i][1]);
        const nr = copper.v(R[i][0], yTop + TRACE_Y, R[i][1]);
        copper.quad(pl, nl, nr, pr);
        pl = nl;
        pr = nr;
      }
      // Vias at both ends; stagger the far end so they don't touch.
      const c = offset(path, o);
      const e = c[c.length - 1];
      disc(c[0][0], c[0][1], viaR, yTop + VIA_Y, vias);
      const back = j % 2 === 0 ? 0 : viaR * 2.4;
      const dl = path.length - 1;
      const ux = path[dl][0] - path[dl - 1][0], uz = path[dl][1] - path[dl - 1][1];
      const ul = Math.hypot(ux, uz) || 1;
      disc(e[0] - (ux / ul) * back, e[1] - (uz / ul) * back, viaR, yTop + VIA_Y, vias);
    }
  }

  const board = new THREE.Group();
  board.name = "board";
  const pcb = new THREE.Mesh(slabGeo, m.body);
  pcb.name = "pcb";
  board.add(pcb);
  const add = (mesh: THREE.Mesh | undefined) => mesh && board.add(mesh);
  add(copper.mesh(m.metal, "traces"));
  add(vias.mesh(m.metal, "vias"));
  add(rings.mesh(m.metal, "mounting"));
  return board;
}

export const model: ModelModule = { key: "board", build };
