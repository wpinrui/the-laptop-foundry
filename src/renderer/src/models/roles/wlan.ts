import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION WIRELESS CARD: the Wi-Fi card lying flat in its slot.
//
// The card's length runs along z: slot at the back (-z), screws at the far
// (+z) end. By year:
//   2006: a Mini PCIe card (30 by 51): plastic slot, the card (body PCB) with
//       its gold fingers either side of the key, a metal shield can, two
//       antenna connectors near the far end and screws in both far corners.
//   2026: an M.2 2230 card (22 by 30): slot, card with E-key fingers, shield,
//       two tiny antenna connectors, one screw in the half-moon notch.
// Each connector carries a short antenna lead stub (black in rubber, grey in
// plastic) that rises off it and curves away toward the far edge, all inside
// the box; the runs up to the lid are not part of this model.
// bluetooth has no visual effect (the Bluetooth module is the bt part).
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

function cyl(r: number, h: number, x: number, y0: number, z: number, segs: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, segs);
  g.translate(x, y0 + h / 2, z);
  return g;
}

/** A lead stub: rises off the connector, then curves outward and toward the far edge. */
function lead(x: number, yTopConn: number, z: number, side: number, r: number, reachX: number, zEnd: number, yRun: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(x, yTopConn, z),
    new THREE.Vector3(x, yRun, z + 0.4),
    new THREE.Vector3(x + side * reachX * 0.45, yRun, (z + zEnd) / 2 + 0.6),
    new THREE.Vector3(x + side * reachX, yRun, zEnd),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  return new THREE.TubeGeometry(curve, 10, r, 6, false);
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const old = ctx.year < 2015;
  const W = box.width, H = box.height, L = box.depth;
  const x1 = W / 2, zB = -L / 2, zF = L / 2, yBot = -H / 2, yTop = H / 2;

  const pcb = new Buf();
  const plastic = new Buf();
  const metal = new Buf();
  const black = new Buf();
  const grey = new Buf();

  // Slot at the back, card raised into it.
  const slotD = old ? 4 : 3;
  plastic.box(-x1, x1, yBot, yBot + (old ? 2.4 : 1.8), zB, zB + slotD);
  const pcbT = 0.8;
  const yS0 = yBot + (old ? 0.9 : 0.6), yS1 = yS0 + pcbT;
  const sx = x1 - 0.2;

  // Far end: Mini PCIe has a screw in each corner; M.2 one in a half-moon notch.
  const screwR = old ? 1.8 : 1.6;
  const headH = Math.min(0.5, yTop - yS1 - 0.1);
  if (old) {
    pcb.box(-sx, sx, yS0, yS1, zB + 1.5, zF - 0.3);
    for (const s of [-1, 1]) {
      const x = s * (x1 - screwR - 0.4), z = zF - screwR - 0.4;
      metal.add(cyl(screwR * 0.8, yS0 - yBot, x, yBot, z, 10));
      metal.add(cyl(screwR, headH, x, yS1, z, 14));
    }
  } else {
    const nr = 1.6;
    const zN = zF - 0.3 - nr;
    pcb.box(-sx, sx, yS0, yS1, zB + 1.2, zN);
    pcb.box(-sx, -nr, yS0, yS1, zN, zF - 0.3);
    pcb.box(nr, sx, yS0, yS1, zN, zF - 0.3);
    metal.add(cyl(nr * 0.9, yS0 - yBot, 0, yBot, zN, 10));
    metal.add(cyl(Math.min(2, zF - zN), headH, 0, yS1, zN, 14));
  }

  // Gold fingers either side of the key.
  const fz0 = zB + slotD, fz1 = fz0 + 1;
  const keyX = old ? -0.18 * W : -0.27 * W;
  metal.box(-sx + 0.5, keyX - 0.6, yS1, yS1 + 0.04, fz0, fz1);
  metal.box(keyX + 0.6, sx - 0.5, yS1, yS1 + 0.04, fz0, fz1);

  // Shield can over the radio.
  const canH = old ? 1.2 : 0.9;
  const cz0 = fz1 + (old ? 2 : 1.2), cz1 = zF - (old ? 12 : 8);
  metal.box(-(x1 - (old ? 2.5 : 1.5)), x1 - (old ? 2.5 : 1.5), yS1, yS1 + canH, cz0, cz1);

  // Antenna connectors and lead stubs.
  const cr = old ? 1.0 : 0.6;
  const ch = old ? 1.1 : 0.5;
  const lr = old ? 0.5 : 0.35;
  const acz = zF - (old ? 7.5 : 5.2);
  const ax = old ? 4 : 3.2;
  const yRun = Math.min(yTop - lr - 0.1, yS1 + ch + lr);
  const zEnd = zF - lr - 0.5;
  const reach = x1 - ax - lr - 0.8;
  [-1, 1].forEach((s, i) => {
    const x = s * ax;
    metal.add(cyl(cr, ch, x, yS1, acz, 12));
    metal.add(cyl(cr * 1.15, Math.min(0.35, yTop - yS1 - ch), x, yS1 + ch - 0.01, acz, 12));
    (i === 0 ? black : grey).add(lead(x, yS1 + ch, acz, s, lr, reach, zEnd, yRun));
  });

  const card = new THREE.Group();
  card.name = "wlan";
  const add = (mesh: THREE.Mesh | undefined) => mesh && card.add(mesh);
  add(pcb.mesh(m.body, "card"));
  add(plastic.mesh(m.plastic, "slot"));
  add(metal.mesh(m.metal, "metal"));
  add(black.mesh(m.rubber, "lead:black"));
  add(grey.mesh(m.plastic, "lead:grey"));
  return card;
}

export const model: ModelModule = { key: "wlan", build };
