import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION OPTICAL BAY: an optical drive lying flat, or the bay battery.
//
// Built like the fan: in a canonical frame with the outside face at -z (back),
// then turned about y so that face lands on ctx.edge (back 0, left +90, right
// -90, front 180 degrees). In the canonical frame x runs along the bezel and z
// is the reach into the laptop. The bay is 126 by 128 in model space whichever
// way it faces; on a left or right edge the bezel runs along the box's depth
// and the drive reaches in along its width, on a back or front edge the other
// way round.
//
// Drives (combo, dvd-rw-dl, dvd-rw-slim-2006, bd-writer, hd-dvd, dvd-rw-slim,
// bd-writer-slim): a metal body with a stamped top cover (a raised ring over
// the spindle and cover screws), the interface connector at the inner end,
// and a plastic bezel on the outside face with the tray slot, a small eject
// button, an emergency-eject pinhole and an activity light (glow).
// Bay battery: a battery in the same shape: a plastic casing with ribs over
// its cell rows, a plain bezel with a release slider and no slot, and a blade
// connector at the inner end.
// Height (9.5 or 12.7 mm) scales the slot, bezel details and cover features.
// Anchor: slot, at the centre of the tray slot on the ctx.edge face (for the
// bay battery, the centre of the bezel).
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

function rect(cx: number, cy: number, w: number, h: number): P2[] {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

/** Front-view (x, y) outline to a Shape or Path. */
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
  /** Extrude a front-view shape along z from z0 to z1. */
  prism(mat: THREE.Material, s: THREE.Shape, z0: number, z1: number, segs: number, name = "part"): void {
    if (z1 - z0 < 1e-3) return;
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: segs });
    g.translate(0, 0, z0);
    this.add(g, mat, name);
  }
  /** Flat ring about a vertical axis, from y0 to y1. */
  annulus(mat: THREE.Material, rIn: number, rOut: number, x: number, z: number, y0: number, y1: number, segs: number, name = "ring"): void {
    const g = new THREE.LatheGeometry(
      [
        new THREE.Vector2(rIn, y0),
        new THREE.Vector2(rOut, y0),
        new THREE.Vector2(rOut, y1),
        new THREE.Vector2(rIn, y1),
        new THREE.Vector2(rIn, y0),
      ],
      segs,
    );
    g.translate(x, 0, z);
    this.add(g, mat, name);
  }
  post(mat: THREE.Material, r: number, x: number, z: number, y0: number, y1: number, segs: number, name = "post"): void {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, segs);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(g, mat, name);
  }
}

interface Mats {
  body: THREE.Material;
  metal: THREE.Material;
  plastic: THREE.Material;
  rubber: THREE.Material;
  glow: THREE.Material;
}

/** Contacts sticking out of a plastic block at the inner (+z) end. */
function rearConnector(k: Kit, m: Mats, x0: number, x1: number, y0: number, y1: number, zEnd: number, pins: number, blades: boolean): void {
  const len = Math.min(4, 0.04 * (x1 - x0) + 3);
  k.box(m.plastic, x0, x1, y0, y1, zEnd - len, zEnd - 0.8, "connector");
  const pitch = (x1 - x0) / pins;
  const h = y1 - y0;
  for (let i = 0; i < pins; i++) {
    const x = x0 + (i + 0.5) * pitch;
    if (blades) k.box(m.metal, x - 0.15, x + 0.15, y0 + 0.2 * h, y1 - 0.2 * h, zEnd - 1.5, zEnd, "blade");
    else k.box(m.metal, x - 0.2, x + 0.2, y0 + h / 2 - 0.2, y0 + h / 2 + 0.2, zEnd - 1.5, zEnd, "pin");
  }
}

// ------------------------------------------------------------------ builders

/** Canonical drive: bezel along x (length Lb) on the -z face, reaching R along z. Returns the slot centre. */
function drive(k: Kit, m: Mats, Lb: number, H: number, R: number): [number, number, number] {
  const x1 = Lb / 2, yBot = -H / 2, yTop = H / 2;
  const zOut = -R / 2, zIn = R / 2;
  const bezelT = clamp(0.12 * H, 1.2, 1.6);
  const zb = zOut + bezelT;

  // Bezel: tray slot across most of it, eject button and pinhole at one end, light beside them.
  const slotW = 0.72 * Lb;
  const slotH = clamp(0.1 * H, 0.9, 1.3);
  const slotX = -0.06 * Lb;
  const slotY = -0.08 * H;
  const btnW = clamp(0.1 * Lb, 9, 13), btnH = clamp(0.28 * H, 2.4, 3.4);
  const btnX = x1 - 3 - btnW / 2, btnY = slotY;
  const pinR = 0.35;
  const pinX = btnX - btnW / 2 - 3;
  const ledW = 1.6, ledH = 0.8;
  const ledX = pinX - 3.2, ledY = slotY;
  const bezel = shapeOf(rect(0, 0, Lb, H));
  bezel.holes.push(pathOf(rect(slotX, slotY, slotW, slotH)));
  bezel.holes.push(pathOf(rect(btnX, btnY, btnW, btnH)));
  bezel.holes.push(circlePath(pinX, btnY, pinR));
  bezel.holes.push(pathOf(rect(ledX, ledY, ledW, ledH)));
  k.prism(m.plastic, bezel, zOut, zb, 6, "bezel");
  // Slot floor, set back behind the bezel; button and light just behind the face.
  k.box(m.rubber, slotX - slotW / 2, slotX + slotW / 2, slotY - slotH / 2, slotY + slotH / 2, zb, zb + 0.3, "slot");
  k.box(m.plastic, btnX - btnW / 2 + 0.15, btnX + btnW / 2 - 0.15, btnY - btnH / 2 + 0.15, btnY + btnH / 2 - 0.15, zOut + 0.2, zb + 0.4, "eject");
  k.box(m.glow, ledX - ledW / 2 + 0.02, ledX + ledW / 2 - 0.02, ledY - ledH / 2 + 0.02, ledY + ledH / 2 - 0.02, zOut + 0.15, zb, "light");
  k.box(m.rubber, pinX - pinR, pinX + pinR, btnY - pinR, btnY + pinR, zb, zb + 0.2, "pinhole");

  // Metal body behind the bezel, the stamped top cover over it.
  const coverT = Math.min(0.25, 0.03 * H);
  const bw = x1 - 0.4;
  k.box(m.metal, -bw, bw, yBot, yTop - coverT, zb, zIn, "body");
  const zc = zb + 0.52 * (zIn - zb);
  const rr = 0.36 * Math.min(Lb, zIn - zb);
  k.annulus(m.metal, rr - 1.4, rr, 0.04 * Lb, zc, yTop - coverT - 0.01, yTop, 40, "cover");
  k.annulus(m.metal, 3, 6.5, 0.04 * Lb, zc, yTop - coverT - 0.01, yTop, 20, "cover");
  for (const [sx, sz] of [[-1, zb + 5], [1, zb + 5], [-1, zIn - 5], [1, zIn - 5]] as P2[])
    k.post(m.metal, 0.9, sx * (bw - 4), sz, yTop - coverT - 0.01, yTop, 8, "screw");
  // Interface connector at the inner end, low down to one side.
  const ch = Math.min(3, 0.3 * H);
  rearConnector(k, m, x1 - 32, x1 - 8, yBot + 0.6, yBot + 0.6 + ch, zIn, 13, false);

  return [slotX, slotY, zOut];
}

/** Canonical bay battery: plain bezel on the -z face, cell-row ribs on top. Returns the bezel centre. */
function bayBattery(k: Kit, m: Mats, Lb: number, H: number, R: number): [number, number, number] {
  const x1 = Lb / 2, yBot = -H / 2, yTop = H / 2;
  const zOut = -R / 2, zIn = R / 2;
  const bezelT = clamp(0.14 * H, 1.4, 2);
  const zb = zOut + bezelT;
  // Plain bezel with a release slider in a short channel near one end.
  const chW = clamp(0.1 * Lb, 9, 13), chH = clamp(0.25 * H, 2.2, 3);
  const chX = x1 - 4 - chW / 2;
  const bezel = shapeOf(rect(0, 0, Lb, H));
  bezel.holes.push(pathOf(rect(chX, 0, chW, chH)));
  k.prism(m.body, bezel, zOut, zb, 2, "bezel");
  k.box(m.rubber, chX - chW / 2, chX + chW / 2, -chH / 2, chH / 2, zb, zb + 0.3, "channel");
  const sw = 0.4 * chW;
  k.box(m.plastic, chX - chW / 2 + 0.3, chX - chW / 2 + 0.3 + sw, -chH / 2 + 0.2, chH / 2 - 0.2, zOut + 0.25, zb + 0.3, "release");

  // Plastic casing; ribs over the cell rows along the reach.
  const ribH = Math.min(0.5, 0.05 * H);
  const bw = x1 - 0.4;
  k.box(m.plastic, -bw, bw, yBot, yTop - ribH, zb, zIn, "casing");
  const rows = 3;
  for (let i = 0; i < rows; i++) {
    const x = -bw + ((i + 0.5) * 2 * bw) / rows;
    const rw = 0.2 * ((2 * bw) / rows);
    k.box(m.plastic, x - rw / 2, x + rw / 2, yTop - ribH - 0.05, yTop, zb + 6, zIn - 6, "rib");
  }
  // A seam groove round the casing, a third of the way up.
  const gy = yBot + 0.35 * H;
  k.box(m.rubber, -bw - 0.2, bw + 0.2, gy - 0.15, gy + 0.15, zb + 0.5, zIn - 0.5, "seam");
  // Blade connector at the inner end.
  const ch = Math.min(4, 0.4 * H);
  rearConnector(k, m, x1 - 30, x1 - 12, yBot + 0.8, yBot + 0.8 + ch, zIn, 5, true);
  return [0, 0, zOut];
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const c = ctx.materials;
  const m: Mats = { body: c.body, metal: c.metal, plastic: c.plastic, rubber: c.rubber, glow: c.glow };
  const edge = ctx.edge ?? "left";
  const side = edge === "left" || edge === "right";
  // Canonical frame: bezel along x, reach along z, outside face at -z.
  const Lb = side ? box.depth : box.width;
  const R = side ? box.width : box.depth;
  const H = box.height;

  const k = new Kit();
  const at = ctx.part === "bay-battery" ? bayBattery(k, m, Lb, H, R) : drive(k, m, Lb, H, R);
  const body = k.group;
  body.add(anchor("slot", at[0], at[1], at[2]));

  // Turn the canonical (outside face at back) bay to face ctx.edge.
  body.rotation.y = { back: 0, left: Math.PI / 2, right: -Math.PI / 2, front: Math.PI }[edge];

  const odd = new THREE.Group();
  odd.name = "odd";
  odd.add(body);
  return odd;
}

export const model: ModelModule = { key: "odd", build };
