import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION TRACKPAD: the pad surface plus any button rows.
//
// The box is the engine's footprint: pad x by (pad y + rows x 12) mm, and the
// stack height. Along depth, back (-z) to front (+z):
//   stick: "yes"        a 12 mm row of three buttons (left, narrow middle, right);
//   the pad zone        the rest of the depth;
//   buttons: "separate" a 12 mm row of two buttons.
// 2006: a small matte plastic pad set 0.6 mm down inside a rim flush with the
//       box top, and chunky, well-rounded buttons with a deep top chamfer.
// 2026: a large glass clickpad flush with the box top, rounded corners and a
//       fine edge chamfer; any buttons are flat, thin and tightly gapped.
// mechanism has no visible effect. A metal carrier plate sits under it all.
//
// All geometry is merged into a few meshes, built at identity in model space:
// centred, x width, y up out of the deck, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number];

const ROW = 12; // engine PAD_BUTTON_ROW

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merged, indexed triangle buffer. Faces are wound to point along a given direction. */
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number): number {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }
  private normalOf(a: number, b: number, c: number): [number, number, number] {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const wx = p[c * 3] - ax, wy = p[c * 3 + 1] - ay, wz = p[c * 3 + 2] - az;
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  }
  tri(a: number, b: number, c: number, ex: number, ey: number, ez: number): void {
    const n = this.normalOf(a, b, c);
    if (n[0] * ex + n[1] * ey + n[2] * ez >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }
  quad(a: number, b: number, c: number, d: number, ex: number, ey: number, ez: number): void {
    let n = this.normalOf(a, b, c);
    if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-9) n = this.normalOf(a, c, d);
    if (n[0] * ex + n[1] * ey + n[2] * ez >= 0) this.idx.push(a, b, c, a, c, d);
    else this.idx.push(a, c, b, a, d, c);
  }
  /** Axis-aligned box without a bottom face. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    const c = [
      this.v(x0, y0, z0), this.v(x1, y0, z0), this.v(x1, y0, z1), this.v(x0, y0, z1),
      this.v(x0, y1, z0), this.v(x1, y1, z0), this.v(x1, y1, z1), this.v(x0, y1, z1),
    ];
    this.quad(c[4], c[5], c[6], c[7], 0, 1, 0);
    this.quad(c[3], c[2], c[6], c[7], 0, 0, 1);
    this.quad(c[0], c[1], c[5], c[4], 0, 0, -1);
    this.quad(c[1], c[2], c[6], c[5], 1, 0, 0);
    this.quad(c[0], c[3], c[7], c[4], -1, 0, 0);
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

/** Rounded-rectangle outline in plan, anticlockwise from the +x side. Same count for the same cs. */
function roundRect(cx: number, cz: number, hw: number, hd: number, r: number, cs: number): P2[] {
  const rr = Math.max(0.05, Math.min(r, hw - 0.01, hd - 0.01));
  const out: P2[] = [];
  const corners: [number, number, number][] = [
    [1, 1, 0],
    [-1, 1, Math.PI / 2],
    [-1, -1, Math.PI],
    [1, -1, 1.5 * Math.PI],
  ];
  for (const [sx, sz, a0] of corners)
    for (let i = 0; i <= cs; i++) {
      const a = a0 + (i / cs) * (Math.PI / 2);
      out.push([cx + sx * (hw - rr) + rr * Math.cos(a), cz + sz * (hd - rr) + rr * Math.sin(a)]);
    }
  return out;
}

function ringAt(b: Buf, pts: P2[], y: number): number[] {
  return pts.map(([x, z]) => b.v(x, y, z));
}

/** Side band between two matching rings; out = +1 faces away from (cx, cz), -1 toward it. */
function band(b: Buf, lo: number[], hi: number[], pts: P2[], cx: number, cz: number, out = 1): void {
  const n = lo.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = ((pts[i][0] + pts[j][0]) / 2 - cx) * out;
    const ez = ((pts[i][1] + pts[j][1]) / 2 - cz) * out;
    b.quad(lo[i], lo[j], hi[j], hi[i], ex, 0, ez);
  }
}

/** Flat cap over a ring, fanned from its centre, facing +y. */
function cap(b: Buf, ring: number[], cx: number, y: number, cz: number): void {
  const c = b.v(cx, y, cz);
  for (let i = 0; i < ring.length; i++) b.tri(ring[i], ring[(i + 1) % ring.length], c, 0, 1, 0);
}

/** A rounded slab from y0 to y1 with a chamfer ch round its top edge. */
function slab(
  b: Buf,
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  r: number,
  y0: number,
  y1: number,
  ch: number,
  cs: number,
): void {
  const c = Math.max(0.02, Math.min(ch, 0.45 * (y1 - y0), 0.3 * Math.min(hw, hd)));
  const side = roundRect(cx, cz, hw, hd, r, cs);
  const top = roundRect(cx, cz, hw - c, hd - c, r - c * 0.6, cs);
  const B = ringAt(b, side, y0);
  const M = ringAt(b, side, y1 - c);
  const T = ringAt(b, top, y1);
  band(b, B, M, side, cx, cz);
  band(b, M, T, top, cx, cz);
  cap(b, ringAt(b, top, y1), cx, y1, cz);
}

/** A row of buttons across the full width: widths are fractions of the usable width. */
function buttonRow(
  b: Buf,
  W: number,
  z0: number,
  z1: number,
  fracs: number[],
  inset: number,
  gap: number,
  r: number,
  y0: number,
  y1: number,
  ch: number,
): void {
  const usable = W - 2 * inset - gap * (fracs.length - 1);
  const cz = (z0 + z1) / 2;
  const hd = (z1 - z0) / 2 - inset;
  let x = -W / 2 + inset;
  for (const f of fracs) {
    const w = usable * f;
    slab(b, x + w / 2, cz, w / 2, hd, r, y0, y1, ch, 3);
    x += w + gap;
  }
}

function build(
  box: ModelBox,
  options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const modern = ctx.year >= 2015;
  const W = box.width;
  const H = box.height;
  const D = box.depth;
  const yBot = -H / 2;
  const yTop = H / 2;
  const front = options.buttons === "separate" ? 1 : 0;
  const back = options.stick === "yes" ? 1 : 0;
  // Rows are 12 mm; never let them eat more than half the depth between them.
  const row = Math.min(ROW, (0.5 * D) / Math.max(1, front + back));

  const zPad0 = -D / 2 + back * row;
  const zPad1 = D / 2 - front * row;
  const pcx = 0;
  const pcz = (zPad0 + zPad1) / 2;
  const phw = W / 2;
  const phd = (zPad1 - zPad0) / 2;

  const carrier = new Buf();
  const surface = new Buf();
  const rim = new Buf();
  const buttons = new Buf();

  const plateT = Math.min(0.4, 0.12 * H);
  carrier.box(-W / 2 + 1, W / 2 - 1, yBot, yBot + plateT, -D / 2 + 1, D / 2 - 1);

  if (!modern) {
    // Rim flush with the top, the matte pad recessed inside it.
    const rimW = clamp(0.022 * W, 1.3, 1.8);
    const recess = Math.min(0.6, 0.15 * H);
    const rOut = clamp(0.06 * Math.min(W, 2 * phd), 2.5, 4);
    const rIn = rOut - rimW * 0.6;
    const ySurf = yTop - recess;
    const outer = roundRect(pcx, pcz, phw, phd, rOut, 5);
    const inner = roundRect(pcx, pcz, phw - rimW, phd - rimW, rIn, 5);
    const Ob = ringAt(rim, outer, yBot + plateT);
    const Ot = ringAt(rim, outer, yTop);
    const It = ringAt(rim, inner, yTop);
    const Ib = ringAt(rim, inner, ySurf - 0.05);
    band(rim, Ob, Ot, outer, pcx, pcz, 1);
    band(rim, Ib, It, inner, pcx, pcz, -1);
    for (let i = 0; i < Ot.length; i++) {
      const j = (i + 1) % Ot.length;
      rim.quad(Ot[i], Ot[j], It[j], It[i], 0, 1, 0);
    }
    const t = Math.min(0.9, ySurf - (yBot + plateT) - 0.05);
    slab(surface, pcx, pcz, phw - rimW - 0.02, phd - rimW - 0.02, rIn, ySurf - t, ySurf, 0.15, 5);

    // Chunky buttons: full height, deep chamfer, generous corners.
    const by0 = yBot + plateT;
    const ch = Math.min(0.9, 0.3 * H);
    if (front) buttonRow(buttons, W, zPad1, D / 2, [0.5, 0.5], 1.2, 1.6, 2.4, by0, yTop, ch);
    if (back) buttonRow(buttons, W, -D / 2, zPad0, [0.39, 0.22, 0.39], 1.2, 1.6, 2.4, by0, yTop, ch);
  } else {
    // Glass clickpad, flush with the top of the box.
    const r = clamp(0.06 * Math.min(W, 2 * phd), 4, 8);
    const t = Math.min(0.8, yTop - (yBot + plateT) - 0.05);
    slab(surface, pcx, pcz, phw, phd, r, yTop - t, yTop, 0.3, 5);
    // A support frame between the carrier and the glass, just inside its edge.
    carrier.box(-phw + 2, phw - 2, yBot + plateT, yTop - t - 0.02, zPad0 + 2, zPad1 - 2);

    // Flat, thin buttons with tight gaps, a hair below the glass.
    const by0 = yBot + plateT;
    const by1 = yTop - 0.1;
    if (front) buttonRow(buttons, W, zPad1, D / 2, [0.5, 0.5], 0.8, 0.6, 1.2, by0, by1, 0.25);
    if (back) buttonRow(buttons, W, -D / 2, zPad0, [0.4, 0.2, 0.4], 0.8, 0.6, 1.2, by0, by1, 0.25);
  }

  const pad = new THREE.Group();
  pad.name = "pad";
  const add = (mesh: THREE.Mesh | undefined) => mesh && pad.add(mesh);
  add(carrier.mesh(m.metal, "carrier"));
  add(rim.mesh(m.body, "rim"));
  add(surface.mesh(modern ? m.glass : m.plastic, "surface"));
  add(buttons.mesh(modern ? m.body : m.plastic, "buttons"));
  return pad;
}

export const model: ModelModule = { key: "pad", build };
