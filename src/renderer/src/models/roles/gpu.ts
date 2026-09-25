import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION DISCRETE GRAPHICS: the graphics chip with its memory around it.
//
// By ctx.part (src/renderer/src/engine/content/graphics.ts):
//   geforce-go-7600, radeon-x1600, geforce-go-7900-gtx: MXM modules. The
//       block stands 5 mm taller for the connector: a plastic MXM connector
//       on the mainboard along the -x end, the module board (body) plugged
//       into it by its gold fingers and held up at the far end on two metal
//       standoffs with screws; the chip and memory ride on the module.
//   Everything else is soldered: the package and memory straight on the
//       mainboard, 2 mm tall.
// The chip: a package substrate (plastic) with the die on it, glass in 2026
// and metal in 2006 (as in cpu.ts), and a few capacitors beside the die.
// Memory: plastic chips placed round the package, left and right first, then
// behind and in front, as many as the part's memory takes, sized to fit.
// Anchor: die, at the top centre of the graphics die.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

const MXM = new Set(["geforce-go-7600", "radeon-x1600", "geforce-go-7900-gtx"]);

// Memory chips per part.
const CHIPS: Record<string, number> = {
  "geforce-go-7400": 4,
  "radeon-x1400": 4,
  "geforce-go-7600": 4,
  "radeon-x1600": 4,
  "geforce-go-7900-gtx": 8,
  "rtx-5050-laptop": 4,
  "rtx-5060-laptop": 4,
  "rtx-5070-laptop": 4,
  "rtx-5070ti-laptop": 6,
  "rtx-5080-laptop": 8,
  "rtx-5090-laptop": 8,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

/** Merged boxes, one mesh per material. */
class Buf {
  geos: THREE.BufferGeometry[] = [];
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.geos.push(g);
  }
  add(g: THREE.BufferGeometry): void {
    this.geos.push(g.index ? g : g);
  }
  mesh(mat: THREE.Material, name: string): THREE.Mesh | undefined {
    if (this.geos.length === 0) return undefined;
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    for (const g of this.geos) {
      const base = pos.length / 3;
      const p = g.getAttribute("position").array;
      const n = g.getAttribute("normal").array;
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      for (let i = 0; i < n.length; i++) nor.push(n[i]);
      if (g.index) {
        const ix = g.index.array;
        for (let i = 0; i < ix.length; i++) idx.push(base + ix[i]);
      } else for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    const m = new THREE.Mesh(out, mat);
    m.name = name;
    return m;
  }
}

interface Bufs {
  board: Buf;
  plastic: Buf;
  metal: Buf;
  die: Buf;
}

/**
 * Chip and memory on a surface at y0, within the plan area x0..x1, z0..z1.
 * Returns the die's top centre.
 */
function chipAndMemory(
  b: Bufs,
  x0: number, x1: number, z0: number, z1: number,
  y0: number, yTop: number, chips: number, old: boolean,
): [number, number, number] {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const aw = x1 - x0, ad = z1 - z0;
  const h = yTop - y0;
  // Package and die.
  const P = clamp(0.42 * Math.min(aw, ad), 12, 31);
  const subT = Math.min(0.9, 0.45 * h);
  b.plastic.box(cx - P / 2, cx + P / 2, y0, y0 + subT, cz - P / 2, cz + P / 2);
  const dw = 0.46 * P;
  b.die.box(cx - dw / 2, cx + dw / 2, y0 + subT, yTop, cz - dw / 2, cz + dw / 2);
  // Capacitors at the die's corners.
  const capH = Math.min(0.3, 0.6 * (yTop - y0 - subT));
  const co = dw / 2 + 1.1;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    b.metal.box(cx + sx * co - 0.4, cx + sx * co + 0.4, y0 + subT, y0 + subT + capH, cz + sz * co - 0.3, cz + sz * co + 0.3);

  // Memory round the package.
  const gap = 1.5, m = 1.2;
  const memT = Math.min(1.2, 0.6 * h);
  const sideW = (aw - P) / 2 - gap - m; // room left and right
  const endD = (ad - P) / 2 - gap - m; // room behind and in front
  const cw = Math.min(12, sideW), cd = Math.min(14, (P - 1) / 2); // side chips: w along x, d along z
  const ew = Math.min(14, (P - 1) / 2), ed = Math.min(12, endD); // end chips
  const slots: [number, number, number, number][] = [];
  if (cw >= 4 && cd >= 4)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) slots.push([cx + sx * (P / 2 + gap + cw / 2), cz + sz * (cd / 2 + 0.5), cw, cd]);
  if (ew >= 4 && ed >= 4)
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) slots.push([cx + sx * (ew / 2 + 0.5), cz + sz * (P / 2 + gap + ed / 2), ew, ed]);
  for (const [x, z, w, d] of slots.slice(0, chips))
    b.plastic.box(x - w / 2, x + w / 2, y0, y0 + memT, z - d / 2, z + d / 2);

  void old;
  return [cx, yTop, cz];
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const old = ctx.year < 2015;
  const W = box.width, H = box.height, D = box.depth;
  const x1 = W / 2, z1 = D / 2, yBot = -H / 2, yTop = H / 2;
  const part = ctx.part ?? (old ? "geforce-go-7400" : "rtx-5070-laptop");
  const chips = CHIPS[part] ?? 4;
  const b: Bufs = { board: new Buf(), plastic: new Buf(), metal: new Buf(), die: new Buf() };
  const gpu = new THREE.Group();
  gpu.name = "gpu";
  let at: [number, number, number];

  if (MXM.has(part) && H >= 4.5) {
    // Connector on the mainboard along the -x end.
    const cxw = Math.min(5.5, 0.08 * W);
    const boardT = Math.min(1.2, 0.18 * H);
    const yB0 = yTop - Math.min(2, 0.3 * H) - boardT; // module board underside
    const yB1 = yB0 + boardT;
    const cz0 = -z1 + 0.08 * D, cz1 = z1 - 0.08 * D;
    b.plastic.box(-x1, -x1 + cxw, yBot, yB1 + 0.6 > yTop ? yB1 : yB1 + 0.6, cz0, cz1);
    // Module board: its fingers run into the connector; gold fingers on its edge.
    const bx0 = -x1 + cxw * 0.35;
    b.board.box(bx0, x1, yB0, yB1, -z1, z1);
    const fingers = 16;
    for (let i = 0; i < fingers; i++) {
      const z = cz0 + ((i + 0.5) * (cz1 - cz0)) / fingers;
      b.metal.box(-x1 + cxw + 0.1, -x1 + cxw + 1.4, yB1, yB1 + 0.04, z - 0.35 * ((cz1 - cz0) / fingers), z + 0.35 * ((cz1 - cz0) / fingers));
    }
    // Standoffs and screws at the far end.
    for (const sz of [-1, 1]) {
      const sx = x1 - 3.5, zz = sz * (z1 - 3.5);
      const post = new THREE.CylinderGeometry(1.4, 1.4, yB0 - yBot, 6);
      post.translate(sx, (yBot + yB0) / 2, zz);
      b.metal.add(post);
      const head = new THREE.CylinderGeometry(1.8, 1.8, Math.min(0.5, yTop - yB1), 12);
      head.translate(sx, yB1 + Math.min(0.5, yTop - yB1) / 2, zz);
      b.metal.add(head);
    }
    at = chipAndMemory(b, -x1 + cxw + 2, x1 - 7, -z1 + 1, z1 - 1, yB1, yTop, chips, old);
  } else {
    at = chipAndMemory(b, -x1, x1, -z1, z1, yBot, yTop, chips, old);
  }

  const add = (mesh: THREE.Mesh | undefined) => mesh && gpu.add(mesh);
  add(b.board.mesh(m.body, "module"));
  add(b.plastic.mesh(m.plastic, "packages"));
  add(b.metal.mesh(m.metal, "metal"));
  add(b.die.mesh(old ? m.metal : m.glass, "die"));
  gpu.add(anchor("die", at[0], at[1], at[2]));
  return gpu;
}

export const model: ModelModule = { key: "gpu", build };
