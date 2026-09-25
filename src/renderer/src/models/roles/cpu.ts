import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION PROCESSOR PACKAGE: the CPU on the mainboard.
//
// By ctx.part (src/renderer/src/engine/content/processors.ts):
//   2006 socketed (celeron-m-430, core-duo-t2500, core2-duo-t5500,
//   core2-duo-t7600, turion64-x2-tl60): a plastic socket over the whole
//       footprint, its raised cam actuator and metal cam screw along the back
//       edge, and the square package seated on it: substrate, bare die, and
//       four capacitors beside the die. 2006 dies are metal (glass is the 2026 cue).
//   2006 soldered (core-duo-u2500): no socket; the substrate stands straight on
//       the board on a visible row of solder balls round its edge.
//   2026: bare dies on a thin substrate: one monolithic die, or the tiles or
//       chiplets of that part laid out on it (on-package memory in plastic),
//       with a few capacitors beside the main die.
// 2026 dies are glass, 2006 dies metal; substrate body; socket and underfill plastic; contacts metal.
// Anchor: die, at the top centre of the main die, where the heat leaves.
// Kept to boxes and one low cylinder for the 800-triangle budget.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type Die = [cx: number, cz: number, w: number, d: number, memory?: boolean]; // fractions of the substrate

const DIES: Record<string, Die[]> = {
  // 2016: U and Y carry the processor die and the chipset die side by side; HQ and AMD are one die.
  "core-m3-6y30": [[-0.18, 0, 0.44, 0.6], [0.3, 0, 0.26, 0.5]],
  "core-i5-6200u": [[-0.22, 0, 0.3, 0.5], [0.22, 0, 0.26, 0.44]],
  "core-i7-6500u": [[-0.22, 0, 0.3, 0.5], [0.22, 0, 0.26, 0.44]],
  "core-i7-7500u": [[-0.22, 0, 0.3, 0.5], [0.22, 0, 0.26, 0.44]],
  "core-i7-6700hq": [[0, 0, 0.42, 0.42]],
  "core-i7-7700hq": [[0, 0, 0.42, 0.42]],
  "a10-9600p": [[0, 0, 0.46, 0.4]],
  "core5-120u": [[-0.12, 0, 0.42, 0.55], [0.3, 0, 0.18, 0.4]],
  "core-ultra7-258v": [[-0.12, -0.12, 0.5, 0.42], [-0.12, 0.24, 0.5, 0.2], [0.32, -0.2, 0.24, 0.36, true], [0.32, 0.2, 0.24, 0.36, true]],
  "core-ultra-x9-388h": [[-0.16, 0, 0.3, 0.6], [0.12, 0, 0.2, 0.6], [0.32, 0, 0.13, 0.5]],
  "core-ultra9-275hx": [[-0.1, -0.12, 0.36, 0.3], [0.2, -0.12, 0.16, 0.3], [0, 0.14, 0.56, 0.16], [0, 0.29, 0.4, 0.08]],
  "ryzen-ai5-340": [[0, 0, 0.56, 0.42]],
  "ryzen-ai9-hx470": [[0, 0, 0.56, 0.42]],
  "ryzen-ai-max-395": [[0, 0.12, 0.6, 0.34], [-0.17, -0.22, 0.28, 0.2], [0.17, -0.22, 0.28, 0.2]],
  "ryzen9-9955hx3d": [[0, 0.18, 0.56, 0.3], [-0.15, -0.18, 0.25, 0.26], [0.15, -0.18, 0.25, 0.26]],
  "snapdragon-x2e-88-100": [[0, 0, 0.46, 0.46]],
};

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
  /** Concatenate into one indexed geometry. */
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
  const old = ctx.year < 2015;
  const W = box.width, H = box.height, D = box.depth;
  const x1 = W / 2, z1 = D / 2, yBot = -H / 2, yTop = H / 2;
  const part = ctx.part ?? (old ? "core-duo-t2500" : "ryzen-ai9-hx470");

  const plastic = new Buf();
  const substrate = new Buf();
  const dies = new Buf();
  const metal = new Buf();
  const metalDie = new Buf();
  const cpu = new THREE.Group();
  cpu.name = "cpu";
  let at: [number, number, number];

  if (old) {
    const socketed = part !== "core-duo-u2500";
    let ySub: number;
    let side: number;
    let pcz = 0;
    if (socketed) {
      // Socket over the footprint, its cam actuator along the back edge.
      const ySock = yBot + 0.48 * H;
      plastic.box(-x1, x1, yBot, ySock, -z1, z1);
      const camD = Math.min(4, 0.12 * D);
      const camH = Math.min(0.8, 0.5 * (yTop - ySock));
      plastic.box(-0.28 * W, 0.28 * W, ySock, ySock + camH, -z1 + 0.6, -z1 + 0.6 + camD);
      const screwR = Math.min(1.3, 0.4 * camD);
      const screw = new THREE.CylinderGeometry(screwR, screwR, 0.2, 8);
      screw.translate(0, ySock + camH + 0.1, -z1 + 0.6 + camD / 2);
      const sm = new THREE.Mesh(screw, m.metal);
      sm.name = "cam-screw";
      cpu.add(sm);
      side = Math.min(0.94 * W, D - 2 * (camD + 1));
      pcz = (camD + 1) / 2;
      ySub = ySock;
    } else {
      // Soldered: the substrate stands on a visible row of solder balls round its edge.
      const ball = Math.min(0.45, 0.22 * H);
      side = Math.min(0.96 * W, 0.96 * D);
      const n = 8;
      const bs = Math.min(0.7, (side - 2) / (n * 2));
      const e = side / 2 - 0.6 - bs / 2;
      const spots: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const t = -e + (i * 2 * e) / (n - 1);
        spots.push([t, -e], [t, e]);
        if (i > 0 && i < n - 1) spots.push([-e, t], [e, t]);
      }
      for (const [bx, bz] of spots)
        metal.box(bx - bs / 2, bx + bs / 2, yBot, yBot + ball, pcz + bz - bs / 2, pcz + bz + bs / 2);
      ySub = yBot + ball;
    }
    const subT = Math.min(1.1, 0.55 * (yTop - ySub));
    substrate.box(-side / 2, side / 2, ySub, ySub + subT, pcz - side / 2, pcz + side / 2);
    // Bare flip-chip die (metal: glass dies are the 2026 cue), on an underfill fillet.
    const dw = 0.34 * side, dd = 0.28 * side;
    const fil = Math.min(0.15, 0.2 * (yTop - ySub - subT));
    plastic.box(-dw / 2 - 0.5, dw / 2 + 0.5, ySub + subT, ySub + subT + fil, pcz - dd / 2 - 0.5, pcz + dd / 2 + 0.5);
    metalDie.box(-dw / 2, dw / 2, ySub + subT, yTop, pcz - dd / 2, pcz + dd / 2);
    // Four capacitors beside the die.
    const capH = Math.min(0.35, 0.6 * (yTop - ySub - subT));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      metal.box(sx * (dw / 2 + 1.2) - 0.5, sx * (dw / 2 + 1.2) + 0.5, ySub + subT, ySub + subT + capH, pcz + sz * (dd / 2 + 1) - 0.3, pcz + sz * (dd / 2 + 1) + 0.3);
    at = [0, yTop, pcz];
  } else {
    // Thin substrate over the whole footprint, dies on top.
    const subT = Math.min(1.0, 0.55 * H);
    const ySub = yBot + subT;
    substrate.box(-x1, x1, yBot, ySub, -z1, z1);
    const list = DIES[part] ?? [[0, 0, 0.5, 0.5]];
    let first: [number, number] | undefined;
    for (const [fx, fz, fw, fd, mem] of list) {
      const cx = fx * W, cz = fz * D, w = fw * W, d = fd * D;
      (mem ? plastic : dies).box(cx - w / 2, cx + w / 2, ySub, mem ? yTop - 0.1 : yTop, cz - d / 2, cz + d / 2);
      if (!first) first = [cx, cz];
    }
    const [cx, cz] = first ?? [0, 0];
    const [, , fw, fd] = list[0];
    const w0 = fw * W, d0 = fd * D;
    // A few capacitors beside the main die.
    const capH = Math.min(0.3, 0.5 * (yTop - ySub));
    const cxs = [cx - w0 / 2 - 1.2, cx + w0 / 2 + 1.2];
    for (const x of cxs)
      if (Math.abs(x) < x1 - 1)
        for (const f of [-0.25, 0.25])
          metal.box(x - 0.3, x + 0.3, ySub, ySub + capH, cz + f * d0 - 0.5, cz + f * d0 + 0.5);
    at = [cx, yTop, cz];
  }

  const add = (mesh: THREE.Mesh | undefined) => mesh && cpu.add(mesh);
  add(plastic.mesh(m.plastic, old ? "socket" : "memory"));
  add(substrate.mesh(m.body, "substrate"));
  add(dies.mesh(m.glass, "die"));
  add(metal.mesh(m.metal, "contacts"));
  add(metalDie.mesh(m.metal, "die"));
  cpu.add(anchor("die", at[0], at[1], at[2]));
  return cpu;
}

export const model: ModelModule = { key: "cpu", build };
