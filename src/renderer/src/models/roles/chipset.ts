import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION CHIPSET: the chipset on the mainboard.
//
// 2006 (i945 and RS485 platforms): two packages side by side along x: the
//   larger northbridge (-x) with its exposed metal die and a few capacitors
//   beside it, and the smaller southbridge (+x), a plain moulded package.
// 2026 (HM870): one small square substrate with a glass die (as in cpu.ts)
//   and a few capacitors.
// Boxes only, merged into one mesh per material, for the 600-triangle budget.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

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
  const x0 = -W / 2, x1 = W / 2, z1 = D / 2, yBot = -H / 2, yTop = H / 2;

  const substrate = new Buf();
  const moulded = new Buf();
  const die = new Buf();
  const caps = new Buf();
  const subT = Math.min(1.1, 0.55 * H);
  const capH = Math.min(0.3, 0.5 * (H - subT));

  if (old) {
    // Northbridge: square, the larger; southbridge: smaller, in the rest of the width.
    const gap = Math.min(4, 0.07 * W);
    const nb = Math.min(D, 0.55 * (W - gap));
    const sb = Math.min(0.8 * D, W - gap - nb);
    const nx = x0 + nb / 2;
    substrate.box(x0, x0 + nb, yBot, yBot + subT, -nb / 2, nb / 2);
    const dw = 0.36 * nb, dd = 0.3 * nb;
    die.box(nx - dw / 2, nx + dw / 2, yBot + subT, yTop, -dd / 2, dd / 2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = nx + sx * (dw / 2 + 1.2), cz = sz * (dd / 2 + 1);
      caps.box(cx - 0.5, cx + 0.5, yBot + subT, yBot + subT + capH, cz - 0.3, cz + 0.3);
    }
    const sx0 = x1 - sb;
    moulded.box(sx0, x1, yBot, yBot + Math.min(1.6, 0.8 * H), -sb / 2, sb / 2);
  } else {
    // HM870: one square substrate with its die.
    const s = Math.min(W, D, 25);
    substrate.box(-s / 2, s / 2, yBot, yBot + subT, -s / 2, s / 2);
    const dw = 0.4 * s, dd = 0.34 * s;
    die.box(-dw / 2, dw / 2, yBot + subT, yTop, -dd / 2, dd / 2);
    for (const sx of [-1, 1]) {
      const cx = sx * (dw / 2 + 1.1);
      for (const f of [-0.25, 0.25]) caps.box(cx - 0.3, cx + 0.3, yBot + subT, yBot + subT + capH, f * dd - 0.5, f * dd + 0.5);
    }
  }
  void z1;

  const chipset = new THREE.Group();
  chipset.name = "chipset";
  const add = (mesh: THREE.Mesh | undefined) => mesh && chipset.add(mesh);
  add(substrate.mesh(mats.body, "substrate"));
  add(moulded.mesh(mats.plastic, "southbridge"));
  add(die.mesh(old ? mats.metal : mats.glass, "die"));
  add(caps.mesh(mats.metal, "caps"));
  return chipset;
}

export const model: ModelModule = { key: "chipset", build };
