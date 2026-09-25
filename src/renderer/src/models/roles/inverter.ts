import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION BACKLIGHT INVERTER: the 2006 CCFL inverter board in the lid's chin.
//
// A lid part: +z is the screen side, +y runs up the screen. The board lies in
// the x-y plane against the back of the box (-z), its parts standing toward +z:
//   - the PCB (body), long and thin;
//   - the step-up transformer near the lamp end: a ferrite core (plastic)
//     either side of its taped winding (rubber);
//   - high-voltage ceramic capacitors (metal) at the transformer's output;
//   - the controller chip and two MOSFETs (plastic);
//   - two electrolytic capacitors (metal cylinders);
//   - connectors at each end: the power input header at -x (6 pins), the
//     lamp lead connector at +x (2 pins).
// Merged into one mesh per material, for the 800-triangle budget.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

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
  _ctx: ModelContext,
): THREE.Object3D {
  const mats = _ctx.materials;
  const W = box.width, H = box.height, D = box.depth;
  const x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2, zB = -D / 2, zF = D / 2;
  const s = W / 100; // everything along x scales with the board length

  const pcb = new Buf();
  const plastic = new Buf();
  const metal = new Buf();
  const tape = new Buf();

  const pcbT = Math.min(0.8, 0.2 * D);
  const zS = zB + pcbT; // component side of the board
  const hMax = zF - zS; // tallest a part may stand
  const yM = 0.1 * H; // parts sit a little above the centre line
  pcb.box(x0, x1, y0, y1, zB, zS);

  // Transformer near the lamp end: core halves either side of the winding.
  const tx = x1 - 30 * s;
  const tw = 16 * s, th = Math.min(7, 0.7 * H);
  const tH = Math.min(3.8, hMax - 0.05);
  plastic.box(tx - tw / 2, tx - tw / 2 + 3 * s, yM - th / 2, yM + th / 2, zS, zS + tH);
  plastic.box(tx + tw / 2 - 3 * s, tx + tw / 2, yM - th / 2, yM + th / 2, zS, zS + tH);
  tape.box(tx - tw / 2 + 3 * s, tx + tw / 2 - 3 * s, yM - th / 2 + 0.4, yM + th / 2 - 0.4, zS, zS + tH - 0.3);
  // High-voltage ceramic capacitors at its output.
  for (let i = 0; i < 2; i++) {
    const cx = tx + tw / 2 + (2.5 + i * 3) * s;
    metal.box(cx - 1, cx + 1, yM - 1.5, yM + 1.5, zS, zS + Math.min(1.6, hMax));
  }

  // Controller and two MOSFETs.
  const cx0 = x0 + 30 * s;
  plastic.box(cx0 - 3 * s, cx0 + 3 * s, yM - 2, yM + 2, zS, zS + Math.min(1.5, hMax));
  for (const f of [12, 18]) {
    const mx = cx0 + f * s;
    plastic.box(mx - 1.6 * s, mx + 1.6 * s, yM - 1.6, yM + 1.6, zS, zS + Math.min(1.1, hMax));
  }
  // Small caps and resistors along the lower edge.
  for (let i = 0; i < 6; i++) {
    const rx = cx0 - 6 * s + i * 5.5 * s;
    metal.box(rx - 0.8, rx + 0.8, y0 + 1, y0 + 1.8, zS, zS + Math.min(0.5, hMax));
  }

  // Two electrolytic capacitors standing on the board.
  const er = Math.min(1.8, 0.2 * H, 0.9 * hMax);
  for (const f of [-32, 6]) {
    const g = new THREE.CylinderGeometry(er, er, Math.min(3.8, hMax - 0.05), 12);
    g.rotateX(Math.PI / 2);
    g.translate(f * s, yM, zS + Math.min(3.8, hMax - 0.05) / 2);
    metal.add(g);
  }

  // Connectors: 6-pin power input at -x, 2-pin lamp lead at +x.
  const connH = Math.min(3.2, hMax - 0.05);
  const pin = (x: number) => metal.box(x - 0.3, x + 0.3, yM - 0.3, yM + 0.3, zS + connH - 0.6, zS + connH + 0.02 > zF ? zF : zS + connH + 0.02);
  const pw = 11 * s;
  plastic.box(x0 + 1, x0 + 1 + pw, yM - 2.5, yM + 2.5, zS, zS + connH - 0.6);
  for (let i = 0; i < 6; i++) pin(x0 + 1 + (i + 0.5) * (pw / 6));
  const lw = 7 * s;
  plastic.box(x1 - 1 - lw, x1 - 1, yM - 2.5, yM + 2.5, zS, zS + connH - 0.6);
  for (let i = 0; i < 2; i++) pin(x1 - 1 - lw + (i + 0.5) * (lw / 2));

  const inv = new THREE.Group();
  inv.name = "inverter";
  const add = (mesh: THREE.Mesh | undefined) => mesh && inv.add(mesh);
  add(pcb.mesh(mats.body, "pcb"));
  add(plastic.mesh(mats.plastic, "parts"));
  add(tape.mesh(mats.rubber, "winding"));
  add(metal.mesh(mats.metal, "metal"));
  return inv;
}

export const model: ModelModule = { key: "inverter", build };
