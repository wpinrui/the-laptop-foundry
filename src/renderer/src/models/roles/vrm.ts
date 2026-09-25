import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION POWER STAGE: the voltage regulator strip beside a CPU or GPU.
//
// Phases run along the long (depth, z) axis, one choke per phase, their count
// growing with the strip's length. Across the width:
//   narrow strips (under 7 mm): a single row of small square chokes filling
//       the width, a capacitor pair in each gap between them;
//   wider strips: the chokes along the -x side, each phase's MOSFET (or DrMOS
//       package) beside its choke, and a column of capacitors along the +x
//       edge where there is room.
// 2006: taller ferrite chokes (plastic) with metal terminals at their ends.
// 2026: low moulded chokes (metal); integrated power stages.
// All boxes, merged into one mesh per material, sitting on the board.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merged boxes, one mesh per material. */
class Buf {
  geos: THREE.BufferGeometry[] = [];
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
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
  const mats = ctx.materials;
  const old = ctx.year < 2015;
  const W = box.width, H = box.height, D = box.depth;
  const x0 = -W / 2, x1 = W / 2, yBot = -H / 2, yTop = H / 2;

  const chokes = new Buf();
  const fets = new Buf();
  const metal = new Buf();

  const narrow = W < 7;
  const maxChoke = old ? 10 : 6.5;
  const c = narrow ? W - 0.3 : Math.min(maxChoke, 0.55 * W);
  const gap = Math.max(0.8, 0.22 * c);
  const n = clamp(Math.floor((D - 1 + gap) / (c + gap)), 1, 16);
  const pitch = (D - 1) / n;
  const chokeH = H;
  const fw = narrow ? 0 : Math.min(W - c - 1.2, 0.75 * c);
  // On wide strips, centre the choke, MOSFET and capacitor columns across the width.
  const used = c + 0.5 + fw + 0.5 + 1.2;
  const cx0 = narrow ? -c / 2 : x0 + 0.2 + Math.max(0, (W - 0.4 - used) / 2);
  const capH = Math.min(0.8, 0.4 * H);
  const fetH = Math.min(old ? 1 : 0.8, 0.45 * H);
  const fx0 = cx0 + c + 0.5;
  const capCol = !narrow && x1 - (fx0 + fw) > 1.4;

  for (let i = 0; i < n; i++) {
    const zc = -D / 2 + 0.5 + (i + 0.5) * pitch;
    const z0 = zc - c / 2, z1 = zc + c / 2;
    chokes.box(cx0, cx0 + c, yBot, yTop - (old ? 0 : 0.02), z0, z1);
    if (old) {
      // Terminals at both ends of each ferrite choke.
      const t = Math.min(0.35, 0.1 * c);
      const tw = 0.6 * c;
      metal.box(cx0 + (c - tw) / 2, cx0 + (c + tw) / 2, yBot, yBot + 0.5 * chokeH, z0 - t, z0);
      metal.box(cx0 + (c - tw) / 2, cx0 + (c + tw) / 2, yBot, yBot + 0.5 * chokeH, z1, z1 + t);
    }
    if (narrow) {
      // A capacitor pair in the gap after each choke.
      if (i < n - 1 && pitch - c > 0.9) {
        const zg = zc + pitch / 2;
        const cw = Math.min(0.9, 0.3 * c);
        metal.box(-cw - 0.1, -0.1, yBot, yBot + capH, zg - 0.3, zg + 0.3);
        metal.box(0.1, cw + 0.1, yBot, yBot + capH, zg - 0.3, zg + 0.3);
      }
    } else {
      // The phase's MOSFET (or power stage) beside its choke.
      const fd = Math.min(0.8 * c, pitch - 0.8);
      fets.box(fx0, fx0 + fw, yBot, yBot + fetH, zc - fd / 2, zc + fd / 2);
      if (capCol) {
        const kx0 = fx0 + fw + 0.5, kx1 = Math.min(x1 - 0.2, kx0 + 1.2);
        for (const f of [-0.25, 0.25]) metal.box(kx0, kx1, yBot, yBot + capH, zc + f * pitch - 0.35, zc + f * pitch + 0.35);
      }
    }
  }

  const vrm = new THREE.Group();
  vrm.name = "vrm";
  const add = (mesh: THREE.Mesh | undefined) => mesh && vrm.add(mesh);
  add(chokes.mesh(old ? mats.plastic : mats.metal, "chokes"));
  add(fets.mesh(mats.plastic, "mosfets"));
  add(metal.mesh(mats.metal, "caps"));
  return vrm;
}

export const model: ModelModule = { key: "vrm", build };
