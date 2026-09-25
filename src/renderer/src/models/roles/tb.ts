import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION THUNDERBOLT CONTROLLER: the 2026 Thunderbolt 5 controller.
//
// A soldered BGA package on the mainboard: a square substrate (body) with the
// die (glass, as in cpu.ts) in its middle and a row of small metal
// capacitors along two edges of the substrate. Boxes only, merged into one
// mesh per material.
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
  const m = ctx.materials;
  const W = box.width, H = box.height, D = box.depth;
  const yB = -H / 2, yT = H / 2;
  const s = Math.min(W, D);

  const substrate = new Buf();
  const die = new Buf();
  const caps = new Buf();

  const subT = Math.min(0.8, 0.55 * H);
  const ySub = yB + subT;
  substrate.box(-s / 2, s / 2, yB, ySub, -s / 2, s / 2);
  const dw = 0.38 * s;
  die.box(-dw / 2, dw / 2, ySub, yT, -dw / 2, dw / 2);

  // Capacitors along the +x and +z edges of the substrate.
  const capH = Math.min(0.3, 0.5 * (yT - ySub));
  const e = s / 2 - 1.2;
  for (let i = 0; i < 5; i++) {
    const t = -0.3 * s + i * 0.15 * s;
    caps.box(e - 0.3, e + 0.3, ySub, ySub + capH, t - 0.5, t + 0.5);
    caps.box(t - 0.5, t + 0.5, ySub, ySub + capH, e - 0.3, e + 0.3);
  }

  const tb = new THREE.Group();
  tb.name = "tb";
  const add = (mesh: THREE.Mesh | undefined) => mesh && tb.add(mesh);
  add(substrate.mesh(m.body, "substrate"));
  add(die.mesh(m.glass, "die"));
  add(caps.mesh(m.metal, "caps"));
  return tb;
}

export const model: ModelModule = { key: "tb", build };
