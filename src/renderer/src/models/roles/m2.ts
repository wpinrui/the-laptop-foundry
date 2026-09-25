import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION M.2 DRIVE: an M.2 SSD lying flat in its slot on the mainboard.
//
// The stick's length runs along z (src/renderer/src/engine/content/storage.ts:
// 22 by 30, 42 or 80): the slot at the back (-z) end, the retaining screw on
// its standoff at the front (+z) end, in the stick's half-moon notch.
//   - plastic slot; the stick (body PCB) plugged into it, raised to slot
//     height, its gold fingers either side of the M-key notch;
//   - bare sticks: a controller near the slot, flash packages along the rest
//     (two on a 2280, one on shorter sticks), and a DRAM chip where it fits;
//   - m2-2280-g5: a finned metal heat spreader over the chips on a thermal pad.
// capacity has no visual effect.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merged indexed geometry, one mesh per material. */
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
      const ix = g.index ? g.index.array : [];
      for (let i = 0; i < ix.length; i++) idx.push(base + ix[i]);
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

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const W = box.width, H = box.height, L = box.depth;
  const x1 = W / 2, zB = -L / 2, zF = L / 2, yBot = -H / 2, yTop = H / 2;
  const spreader = ctx.part === "m2-2280-g5";

  const pcb = new Buf();
  const plastic = new Buf();
  const metal = new Buf();
  const pad = new Buf();

  // Slot at the back end.
  const slotD = Math.min(3.5, 0.12 * L);
  const slotH = Math.min(2.2, 0.7 * H);
  plastic.box(-x1, x1, yBot, yBot + slotH, zB, zB + slotD);

  // The stick, raised to the slot's mid-height, with the half-moon notch at the far end.
  const pcbT = 0.8;
  const yS0 = yBot + Math.min(0.6, 0.25 * H), yS1 = yS0 + pcbT;
  const sx = x1 - 0.2;
  const notchR = Math.min(1.75, 0.08 * L + 0.5);
  const zN = zF - 0.3 - notchR; // notch centre
  pcb.box(-sx, sx, yS0, yS1, zB + 1.2, zN);
  pcb.box(-sx, -notchR, yS0, yS1, zN, zF - 0.3);
  pcb.box(notchR, sx, yS0, yS1, zN, zF - 0.3);

  // Gold fingers either side of the M-key notch.
  const fz0 = zB + slotD, fz1 = fz0 + Math.min(1, 0.04 * L);
  const keyX = 0.25 * W;
  metal.box(-sx + 0.5, keyX - 0.6, yS1, yS1 + 0.04, fz0, fz1);
  metal.box(keyX + 0.6, sx - 0.5, yS1, yS1 + 0.04, fz0, fz1);

  // Standoff under the notch and the screw over it.
  const standoff = new THREE.CylinderGeometry(notchR * 0.9, notchR * 0.9, yS0 - yBot, 12);
  standoff.translate(0, (yBot + yS0) / 2, zN);
  metal.add(standoff);
  const headH = Math.min(0.6, yTop - yS1);
  const headR = Math.min(2.2, zF - zN);
  const head = new THREE.CylinderGeometry(headR, headR, headH, 16);
  head.translate(0, yS1 + headH / 2, zN);
  metal.add(head);

  // Chips: controller near the slot, then flash (and DRAM where it fits).
  const chipT = Math.min(1.0, yTop - yS1 - 0.02);
  const zA = fz1 + 1.2; // first chip starts here
  const zZ = zN - notchR - 1.2; // last chip ends here
  const run = zZ - zA;
  const ctrl = Math.min(8.5, 0.3 * run);
  plastic.box(-ctrl / 2, ctrl / 2, yS1, yS1 + chipT, zA, zA + ctrl);
  let z = zA + ctrl + 1.2;
  const flashN = run > 50 ? 2 : 1;
  const flashD = clamp((zZ - z - (flashN - 1) * 1.2) / flashN, 4, 14);
  const flashW = Math.min(14.5, W - 3);
  if (run > 40 && zZ - z - flashN * flashD - flashN * 1.2 > 4) {
    // DRAM beside the controller on long sticks.
    plastic.box(ctrl / 2 + 1, Math.min(sx - 0.8, ctrl / 2 + 7), yS1, yS1 + chipT * 0.85, zA + 0.5, zA + ctrl - 0.5);
  }
  for (let i = 0; i < flashN && z + flashD <= zZ + 1e-6; i++) {
    plastic.box(-flashW / 2, flashW / 2, yS1, yS1 + chipT, z, z + flashD);
    z += flashD + 1.2;
  }

  if (spreader) {
    // Thermal pad and a finned metal spreader over the chips.
    const sz0 = zA - 0.5, sz1 = zZ + 0.5;
    const hw = x1 - 0.8;
    const padT = Math.min(0.2, 0.2 * chipT);
    const yBase = yS1 + chipT + padT;
    pad.box(-hw + 0.3, hw - 0.3, yS1 + chipT, yBase, sz0 + 0.3, sz1 - 0.3);
    const baseT = Math.min(0.5, 0.5 * (yTop - yBase));
    metal.box(-hw, hw, yBase, yBase + baseT, sz0, sz1);
    // Skirt down to the stick at the ends, so it reads as a cover.
    metal.box(-hw, hw, yS1, yBase, sz0, sz0 + 0.4);
    metal.box(-hw, hw, yS1, yBase, sz1 - 0.4, sz1);
    const fins = 7;
    const fw = (2 * hw) / (fins * 2 - 1);
    for (let i = 0; i < fins; i++) {
      const fx = -hw + i * 2 * fw;
      metal.box(fx, fx + fw, yBase + baseT, yTop, sz0 + 0.8, sz1 - 0.8);
    }
  }

  const m2 = new THREE.Group();
  m2.name = "m2";
  const add = (mesh: THREE.Mesh | undefined) => mesh && m2.add(mesh);
  add(pcb.mesh(m.body, "stick"));
  add(plastic.mesh(m.plastic, "chips"));
  add(metal.mesh(m.metal, "metal"));
  add(pad.mesh(m.rubber, "pad"));
  return m2;
}

export const model: ModelModule = { key: "m2", build };
