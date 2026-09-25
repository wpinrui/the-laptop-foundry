import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION MEMORY: memory on the mainboard.
//
// Sticks lie long side along z (src/renderer/src/engine/content/memory.ts), so
// in model space a SO-DIMM's gold edge runs along z at the -x end.
//   ddr2-667-sodimm, ddr4-2133-sodimm, ddr5-5600-sodimm: one level per slot (option slots, 1 or 2;
//       the block height is per slot times slots), stacked one above the other.
//       Each level: a plastic slot along the -x end, the stick (body PCB)
//       plugged into it with its gold fingers showing either side of the key
//       notch, memory chips on both faces, and two metal retaining clips along
//       the z ends hooking over the stick's far edge. DDR5 adds its PMIC.
//       (Chips and the PMIC are plastic; the stick PCB is body.)
//   lpcamm2: a flat module screwed down onto the board: a compression
//       connector along the -x side, the module over it, a metal stiffener bar
//       with three screws over the connector, and a row of LPDDR5X packages.
//   lpddr3-soldered, lpddr5x-soldered: bare memory packages straight on the board in a 2 by 2
//       grid with their decoupling capacitors; no module, no slot.
// capacity has no visual effect.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merged boxes (and other indexed geometry), one mesh per material. */
class Buf {
  geos: THREE.BufferGeometry[] = [];
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.geos.push(g);
  }
  add(g: THREE.BufferGeometry): void {
    this.geos.push(g);
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
  pcb: Buf;
  plastic: Buf;
  metal: Buf;
}

/** One SO-DIMM level, from y0 to y1. */
function soDimm(b: Bufs, W: number, D: number, y0: number, y1: number, ddr5: boolean): void {
  const x0 = -W / 2, x1 = W / 2, z1 = D / 2;
  const h = y1 - y0;
  // Slot along the -x end.
  const slotW = clamp(0.17 * W, 4, 5.5);
  const slotH = Math.min(0.8 * h, 3.6);
  b.plastic.box(x0, x0 + slotW, y0, y0 + slotH, -z1 + 0.3, z1 - 0.3);
  // The stick, plugged into the slot at mid-height.
  const pcbT = Math.min(1.0, 0.22 * h);
  const yS0 = y0 + 0.45 * h - pcbT / 2, yS1 = yS0 + pcbT;
  const clipW = 1.1;
  const sz = z1 - clipW - 0.2;
  b.pcb.box(x0 + 0.35 * slotW, x1 - 0.4, yS0, yS1, -sz, sz);
  // Gold fingers either side of the key notch, top and bottom.
  const key = 0.12 * D;
  const fx0 = x0 + slotW, fx1 = fx0 + Math.min(1.4, 0.05 * W);
  for (const [za, zb] of [[-sz + 1, key - 1], [key + 1, sz - 1]]) {
    b.metal.box(fx0, fx1, yS1, yS1 + 0.04, za, zb);
    b.metal.box(fx0, fx1, yS0 - 0.04, yS0, za, zb);
  }
  // Memory chips on both faces.
  const chipT = Math.min(0.8, 0.9 * (yS0 - y0), 0.9 * (y1 - yS1));
  const cx0 = fx1 + 1.5, cx1 = Math.min(x1 - 2.5, cx0 + 11);
  const n = 4;
  const pitch = (2 * sz - 4) / n;
  const cd = 0.78 * pitch;
  for (let i = 0; i < n; i++) {
    const cz = -sz + 2 + (i + 0.5) * pitch;
    b.plastic.box(cx0, cx1, yS1, yS1 + chipT, cz - cd / 2, cz + cd / 2);
    b.plastic.box(cx0, cx1, yS0 - chipT, yS0, cz - cd / 2, cz + cd / 2);
  }
  if (ddr5) {
    // PMIC beyond the chips, toward the far edge.
    if (x1 - 1.5 - (cx1 + 1.5) > 1.5) b.plastic.box(cx1 + 1.5, Math.min(x1 - 1.5, cx1 + 5.5), yS1, yS1 + chipT * 0.7, -3, 3);
  }
  // Retaining clips along the z ends, hooking over the far edge.
  const armT = Math.min(0.5, 0.12 * h);
  for (const s of [-1, 1]) {
    const za = s > 0 ? z1 - clipW : -z1, zb = s > 0 ? z1 : -z1 + clipW;
    b.metal.box(x0 + slotW, x1, yS0 - armT, yS0, za, zb);
    b.metal.box(x1 - 1.2, x1, yS0 - armT, Math.min(y1, yS1 + 0.5), za, zb);
    b.metal.box(x1 - 2.4, x1, Math.min(y1, yS1 + 0.5) - 0.3, Math.min(y1, yS1 + 0.5), s > 0 ? za - 0.8 : za, s > 0 ? zb : zb + 0.8);
  }
}

function lpcamm(b: Bufs, W: number, H: number, D: number): void {
  const x0 = -W / 2, x1 = W / 2, z1 = D / 2, yBot = -H / 2, yTop = H / 2;
  const connW = clamp(0.38 * W, 6, 9.5);
  const connH = Math.min(1.4, 0.4 * H);
  const pcbT = Math.min(0.8, 0.22 * H);
  const yP0 = yBot + connH, yP1 = yP0 + pcbT;
  b.plastic.box(x0 + 0.8, x0 + 0.8 + connW, yBot, yP0, -z1 + 2, z1 - 2);
  b.pcb.box(x0, x1, yP0, yP1, -z1, z1);
  // Stiffener bar with three screws over the connector.
  const barT = Math.min(0.6, 0.4 * (yTop - yP1));
  b.metal.box(x0 + 0.5, x0 + 1.1 + connW, yP1, yP1 + barT, -z1 + 1, z1 - 1);
  for (const f of [-0.42, 0, 0.42]) {
    const head = new THREE.CylinderGeometry(1.5, 1.5, yTop - yP1 - barT, 12);
    head.translate(x0 + 0.8 + connW / 2, yP1 + barT + (yTop - yP1 - barT) / 2, f * D);
    b.metal.add(head);
  }
  // A row of LPDDR5X packages beside the bar.
  const cx0 = x0 + connW + 2, cx1 = x1 - 1;
  const n = 4;
  const pitch = (D - 6) / n;
  const cd = Math.min(0.8 * pitch, cx1 - cx0 + 2);
  const chipT = Math.min(0.9, yTop - yP1);
  for (let i = 0; i < n; i++) {
    const cz = -z1 + 3 + (i + 0.5) * pitch;
    b.plastic.box(cx0, cx1, yP1, yP1 + chipT, cz - cd / 2, cz + cd / 2);
  }
}

function soldered(b: Bufs, W: number, H: number, D: number): void {
  const yBot = -H / 2, yTop = H / 2;
  // 2 by 2 packages with a gap for routing between them.
  const gap = clamp(0.08 * Math.min(W, D), 1.2, 3);
  const cw = (W - 3 * gap) / 2, cd = (D - 3 * gap) / 2;
  const capH = Math.min(0.35, 0.4 * H);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * (gap / 2 + cw / 2), cz = sz * (gap / 2 + cd / 2);
      b.plastic.box(cx - cw / 2, cx + cw / 2, yBot, yTop, cz - cd / 2, cz + cd / 2);
      // Decoupling caps along the outer edge of each package.
      const ex = cx + sx * (cw / 2 + gap / 2);
      for (const f of [-0.25, 0.25])
        b.metal.box(ex - 0.3, ex + 0.3, yBot, yBot + capH, cz + f * cd - 0.5, cz + f * cd + 0.5);
    }
}

function build(
  box: ModelBox,
  options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const W = box.width, H = box.height, D = box.depth;
  const part = ctx.part ?? (ctx.year < 2015 ? "ddr2-667-sodimm" : "ddr5-5600-sodimm");
  const b: Bufs = { pcb: new Buf(), plastic: new Buf(), metal: new Buf() };
  if (part.endsWith("sodimm")) {
    const slots = Number(options.slots) === 2 ? 2 : 1;
    const h = H / slots;
    for (let i = 0; i < slots; i++) soDimm(b, W, D, -H / 2 + i * h, -H / 2 + (i + 1) * h, part.startsWith("ddr5"));
  } else if (part === "lpcamm2") lpcamm(b, W, H, D);
  else soldered(b, W, H, D);

  const mem = new THREE.Group();
  mem.name = "mem";
  const add = (mesh: THREE.Mesh | undefined) => mesh && mem.add(mesh);
  add(b.pcb.mesh(m.body, "module"));
  add(b.plastic.mesh(m.plastic, "chips"));
  add(b.metal.mesh(m.metal, "contacts"));
  return mem;
}

export const model: ModelModule = { key: "mem", build };
