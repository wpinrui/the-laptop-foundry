import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION WEBCAM: the camera module in the lid's top bezel.
//
// A lid part: +z is the screen side, toward the user with the lid open, so the
// lens faces +z; +y runs up the screen. Back (-z) to front (+z):
//   - a flex connector on the back of the board;
//   - the module board;
//   - the lens barrel, a dark pupil, and glass over it;
//   - a black front mask, flush with the front face, with windows for the
//     lens, the status light (glow) and any IR emitters.
// cam-1080p-ir and cam-5mp-ir: an IR emitter each side of the lens (a metal
// ring round a dark window), the status light beyond them.
// shutter: "yes": the engine adds 10 mm of width (src/renderer/src/engine/
// units.ts, SHUTTER_WIDTH, shrunk with the rest by spend). That strip, on the
// +x side of the module, carries a slide track with the shutter slider parked
// open, with grip ridges; the lens (with its emitters) moves up against the
// strip so the slider sits right beside it, and the light moves to the far side.
// The catalogue size (src/renderer/src/engine/content/peripherals.ts, WEBCAMS)
// gives the scale the engine shrank by, so the shutter strip is found from
// the box however it was sized.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.
// Geometry is baked in place; no mesh transforms.

type P2 = [number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Catalogue heights (engine y), for the spend scale.
const CAT_H: Record<string, number> = {
  "cam-0.3mp": 6,
  "cam-1.3mp": 7,
  "cam-720p": 4,
  "cam-1080p": 4.5,
  "cam-1080p-ir": 4.5,
  "cam-5mp-ir": 5,
};
const SHUTTER_WIDTH = 10;

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

function rectPts(cx: number, cy: number, w: number, h: number): P2[] {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

function shapeOf(pts: P2[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function pathOf(pts: P2[]): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

function circlePath(cx: number, cy: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

class Kit {
  group = new THREE.Group();
  add(g: THREE.BufferGeometry, mat: THREE.Material, name: string): void {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    this.group.add(mesh);
  }
  box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, name = "part"): void {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat, name);
  }
  prism(mat: THREE.Material, s: THREE.Shape, z0: number, z1: number, segs: number, name = "part"): void {
    if (z1 - z0 < 1e-3) return;
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: segs });
    g.translate(0, 0, z0);
    this.add(g, mat, name);
  }
  /** Cylinder along z. */
  rod(mat: THREE.Material, r: number, x: number, y: number, z0: number, z1: number, segs: number, name = "rod"): void {
    if (z1 - z0 < 1e-3) return;
    const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, (z0 + z1) / 2);
    this.add(g, mat, name);
  }
  /** Tube along z, rIn to rOut. */
  tube(mat: THREE.Material, rIn: number, rOut: number, x: number, y: number, z0: number, z1: number, segs: number, name = "tube"): void {
    const g = new THREE.LatheGeometry(
      [
        new THREE.Vector2(rIn, z0),
        new THREE.Vector2(rOut, z0),
        new THREE.Vector2(rOut, z1),
        new THREE.Vector2(rIn, z1),
        new THREE.Vector2(rIn, z0),
      ],
      segs,
    );
    g.rotateX(Math.PI / 2); // lathe y -> z
    g.translate(x, y, 0);
    this.add(g, mat, name);
  }
}

function build(
  box: ModelBox,
  options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const W = box.width, H = box.height, D = box.depth;
  const x1 = W / 2, zB = -D / 2, zF = D / 2;
  const part = ctx.part ?? "cam-720p";
  const ir = part.endsWith("-ir");
  const shutter = options.shutter === "yes";
  const scale = clamp(H / (CAT_H[part] ?? H), 0.8, 1);
  const shW = shutter ? Math.min(SHUTTER_WIDTH * scale, 0.4 * W) : 0;
  const mx0 = -x1, mx1 = x1 - shW; // module strip
  const mw = mx1 - mx0;
  const r = Math.min(0.34 * H, 0.12 * mw);
  const er = Math.min(0.75, 0.17 * H);
  const eOff = r + Math.max(1.8, 0.35 * H) + er;
  const ls = Math.min(0.9, 0.2 * H);
  // Centred lens; with a shutter it moves up against the shutter strip so the slider sits right beside it.
  const lx = shutter ? mx1 - (ir ? eOff + er + 1.2 : r + 1.4) : (mx0 + mx1) / 2;
  // Status light beyond the lens (and emitters), on the side away from the shutter.
  const ledSide = shutter ? -1 : 1;
  const ledX = lx + ledSide * ((ir ? eOff + er + 1.2 : r + 1.1) + ls / 2);

  // Z stack.
  const connT = Math.min(0.5, 0.18 * D);
  const pcbT = Math.min(0.6, 0.18 * D);
  const maskT = Math.min(0.35, 0.12 * D);
  const zPcb0 = zB + connT, zPcb1 = zPcb0 + pcbT;
  const zMask = zF - maskT;

  const k = new Kit();

  // Flex connector on the back, and the board.
  k.box(m.plastic, mx0 + 1, mx0 + 1 + Math.min(6, 0.25 * mw), -0.3 * H, 0.3 * H, zB, zPcb0, "connector");
  k.box(m.plastic, mx0, mx1, -H / 2, H / 2, zPcb0, zPcb1, "board");

  // Lens: barrel, pupil, glass.
  k.tube(m.plastic, 0.72 * r, r, lx, 0, zPcb1, zF - 0.02, 20, "barrel");
  k.rod(m.rubber, 0.72 * r + 0.01, lx, 0, zPcb1, zMask - 0.25, 16, "pupil");
  k.rod(m.glass, 0.72 * r + 0.01, lx, 0, zMask - 0.25, zF - 0.05, 16, "glass");

  // Front mask with its windows.
  const mask = shapeOf(rectPts((mx0 + mx1) / 2, 0, mw, H));
  mask.holes.push(circlePath(lx, 0, r));
  if (ir)
    for (const sx of [-1, 1]) {
      const ex = lx + sx * eOff;
      mask.holes.push(circlePath(ex, 0, er));
      k.tube(m.metal, 0.6 * er, er - 0.01, ex, 0, zPcb1, zF - 0.03, 12, "ir");
      k.rod(m.rubber, 0.6 * er + 0.01, ex, 0, zPcb1, zF - 0.08, 10, "ir");
    }
  mask.holes.push(pathOf(rectPts(ledX, 0, ls, ls)));
  k.box(m.glow, ledX - ls / 2 + 0.02, ledX + ls / 2 - 0.02, -ls / 2 + 0.02, ls / 2 - 0.02, zPcb1, zF - 0.06, "light");
  k.prism(m.plastic, mask, zMask, zF, 10, "mask");
  // Fill between the board and the mask round the barrel.
  k.box(m.plastic, mx0, mx1, -H / 2, -r - 0.05, zPcb1, zMask, "housing");
  k.box(m.plastic, mx0, mx1, r + 0.05, H / 2, zPcb1, zMask, "housing");

  // Privacy shutter: a track in the extra strip, the slider parked open beside the lens.
  if (shutter) {
    const sx0 = mx1, sx1 = x1;
    const rail = Math.min(0.5, 0.12 * H);
    const zT = zF - Math.min(0.5, 0.2 * D);
    k.box(m.plastic, sx0, sx1, -H / 2, H / 2, zPcb0, zT, "track");
    k.box(m.plastic, sx0, sx1 - 0.3, H / 2 - rail, H / 2, zT, zF, "rail");
    k.box(m.plastic, sx0, sx1 - 0.3, -H / 2, -H / 2 + rail, zT, zF, "rail");
    const sw = 0.62 * (sx1 - sx0);
    const s0 = sx0 + 0.4, s1 = s0 + sw;
    const zS = zF - 0.08;
    k.box(m.body, s0, s1, -H / 2 + rail + 0.05, H / 2 - rail - 0.05, zT, zS, "slider");
    for (let i = 0; i < 3; i++) {
      const gx = s0 + ((i + 1) * sw) / 4;
      k.box(m.body, gx - 0.2, gx + 0.2, -0.28 * H, 0.28 * H, zS, zF, "grip");
    }
  }

  const cam = k.group;
  cam.name = "webcam";
  cam.add(anchor("lens", lx, 0, zF));
  return cam;
}

export const model: ModelModule = { key: "webcam", build };
