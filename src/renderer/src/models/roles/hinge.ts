import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION HINGE MOUNT: one of the two mounts at the rear corners of the base.
//
// The pivot runs along x at the rear (-z) of the box. Everything forward of it
// stays low so the lid, turning about the pivot, clears the base at any angle.
// The look follows ctx.hinge:
//   full:   the base end of a full-width barrel: a steel block at the rear and
//           a screwed bracket forward of it. The barrel runs the whole rear
//           edge on the lid's axis, so the viewer draws it, not this mount.
//   barrel: a round barrel of two knuckles with a split between them (base half
//           and lid half), on a neck and a screwed leaf plate.
//   drop:   a low bracket: a base plate with two gusseted cheeks rising at the
//           rear to a small pin, pivot well below the top edge.
// 2006: chunky: barrel radius at half the height, 1.2 mm plates, all metal.
// 2026: slim: smaller radii, 0.6 mm plates, body-colour barrel.
//
// The lid side of each hinge (the barrel's lid knuckle and leaf, the drop
// hinge's arm and boss) is drawn in the closed pose and sits in
// a group named LID_GROUP whose origin is the pivot, so the viewer turns it
// with the lid: rotation.x = -lid angle.
//
// Model space: centred, x width, y up out of the keyboard, z depth with the
// front at +z, 1 unit = 1 mm. Geometry is baked in place; the lid group's
// pivot is the only transform.

/** The group of lid-side parts, turned about its origin (the pivot) with the lid. */
export const LID_GROUP = "hinge:lid";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A cylinder along x, from x0 to x1, centred at (y, z). */
function rod(r: number, x0: number, x1: number, y: number, z: number, segs: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, segs);
  g.rotateZ(Math.PI / 2);
  g.translate((x0 + x1) / 2, y, z);
  return g;
}

/** A screw head standing on y0. */
function screw(r: number, h: number, x: number, y0: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 0.92, h, 12);
  g.translate(x, y0 + h / 2, z);
  return g;
}

/** Axis-aligned box from its extents. */
function block(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/**
 * Extrude a side profile along x, from x0 to x1. Profile points are (z, y);
 * shape x is -z so the extrusion, turned about y, lands the right way round.
 */
function profile(shape: THREE.Shape, x0: number, x1: number, segs: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: segs });
  g.rotateY(Math.PI / 2); // shape x -> -z, extrusion z -> +x
  g.translate(x0, 0, 0);
  return g;
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const old = ctx.year < 2015;
  const W = box.width;
  const H = box.height;
  const D = box.depth;
  const x1 = W / 2, yBot = -H / 2, yTop = H / 2, zB = -D / 2, zF = D / 2;
  const t = Math.min(old ? 1.2 : 0.6, 0.25 * H); // plate thickness
  const screwR = old ? 1.6 : 1.1;
  const screwH = Math.min(old ? 0.8 : 0.4, 0.15 * H);

  const hinge = new THREE.Group();
  hinge.name = "hinge";
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    hinge.add(mesh);
  };
  // Lid-side parts: baked relative to the pivot, then the group sits at it.
  const lid = new THREE.Group();
  lid.name = LID_GROUP;
  const addLid = (g: THREE.BufferGeometry, mat: THREE.Material, name: string, yp: number, zp: number) => {
    g.translate(0, -yp, -zp);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    lid.add(mesh);
    lid.position.set(0, yp, zp);
  };
  const screws = (xs: number[], y0: number, z: number) => {
    const zs = Math.min(z, zF - 0.5 - screwR - 0.2);
    for (const x of xs) add(screw(screwR, screwH, x, y0, zs), m.metal, "screw");
  };

  const style = ctx.hinge ?? "full";

  if (style === "full") {
    // The base end of a full-width barrel. The barrel itself runs the whole
    // rear edge on the lid's axis, outside any one mount's box, so the viewer
    // draws it (HingeBarrel in Scene.tsx). Here: the steel block that carries
    // the barrel's end knuckle, at the rear under the top wall, and the
    // bracket forward from it with two screws. Nothing here turns with the lid.
    const bw = 0.8 * W;
    const zc = zB + clamp((old ? 0.45 : 0.35) * D, 2, D - 3);
    const ch = Math.min(0.6, 0.15 * H);
    const s = new THREE.Shape();
    s.moveTo(-zB, yBot + t);
    s.lineTo(-zB, yTop);
    s.lineTo(-(zc - ch), yTop);
    s.lineTo(-zc, yTop - ch);
    s.lineTo(-zc, yBot + t);
    s.closePath();
    add(profile(s, -bw / 2, bw / 2, 1), m.metal, "block");
    add(block(-bw / 2, bw / 2, yBot, yBot + t, zB, zF - 0.5), m.metal, "bracket");
    screws([-0.25 * W, 0.25 * W], yBot + t, (zc + zF) / 2);
  } else if (style === "barrel") {
    const r = old ? H / 2 : 0.4 * H;
    const zp = zB + r;
    const yp = yTop - r;
    const margin = old ? 1.5 : 2.5;
    const gap = old ? 0.8 : 0.5;
    const xa = -x1 + margin, xb = x1 - margin;
    const xm = (xa + xb) / 2;
    const segs = old ? 24 : 20;
    // Two knuckles, base half and lid half, with a split between.
    add(rod(r, xa, xm - gap / 2, yp, zp, segs), old ? m.metal : m.body, "knuckle:base");
    addLid(rod(r, xm + gap / 2, xb, yp, zp, segs), old ? m.metal : m.body, "knuckle:lid", yp, zp);
    // The lid leaf, closed: along the top from the lid knuckle, forward.
    addLid(
      block(xm + gap / 2 + 1, xb - 1, yTop - t, yTop, zp, Math.min(zF - 0.5, zp + 0.6 * D)),
      m.metal,
      "leaf:lid",
      yp,
      zp,
    );
    // Pin showing in the split.
    add(rod(0.35 * r, xm - gap / 2 - 0.01, xm + gap / 2 + 0.01, yp, zp, 10), m.metal, "pin");
    // Neck down to the leaf, under the base knuckle, and the leaf running forward.
    const neckW = 0.6 * r;
    if (yp - r > yBot + t + 0.05)
      add(block(xa + 1, xm - gap / 2 - 1, yBot + t, yp, zp - neckW, zp + neckW), m.metal, "neck");
    add(block(xa, xb, yBot, yBot + t, zp - neckW, zF - 0.5), m.metal, "leaf");
    screws([xa + 0.22 * (xb - xa), xb - 0.22 * (xb - xa)], yBot + t, (zp + r + zF) / 2);
  } else {
    // Drop hinge: low pivot at the rear, between two gusseted cheeks.
    const rp = clamp(0.16 * H, 0.5, 1.0);
    const re = rp * 1.9;
    const zp = zB + re;
    const yp = Math.min(yBot + t + re + 0.2 * H, yTop - re - 0.3); // well below the top edge
    const cheekT = old ? 1.2 : 0.8;
    const cx = 0.32 * W;
    const s = new THREE.Shape();
    const zToe = Math.min(zF - 1, zp + re + 0.35 * D);
    s.moveTo(-zB, yBot + t);
    s.lineTo(-zB, yp);
    s.absarc(-zp, yp, re, 0, Math.PI, false); // over the top, rear to front
    s.lineTo(-zToe, yBot + t);
    s.closePath();
    const eye = new THREE.Path();
    eye.absarc(-zp, yp, rp, 0, Math.PI * 2, true);
    s.holes.push(eye);
    for (const sx of [-1, 1]) {
      const xo = sx * cx;
      add(profile(s, xo - cheekT / 2, xo + cheekT / 2, 8), m.metal, "cheek");
    }
    add(rod(rp, -cx - cheekT / 2 - 0.3, cx + cheekT / 2 + 0.3, yp, zp, 14), m.metal, "pin");
    // The lid arm hangs on the pin between the cheeks. Closed, it lies
    // forward over the pivot; opening turns it up and back with the lid.
    const armT = old ? 1.2 : 0.8;
    const armTop = Math.min(yTop, yp + re);
    addLid(
      block(-cx + cheekT, cx - cheekT, armTop - armT, armTop, zp - rp, Math.min(zF - 0.5, zToe)),
      m.body,
      "arm",
      yp,
      zp,
    );
    addLid(rod(re * 0.95, -cx + cheekT, cx - cheekT, yp, zp, 16), m.body, "boss", yp, zp);
    // Base plate, and its screws forward of the cheeks.
    add(block(-x1 + 1, x1 - 1, yBot, yBot + t, zB, zF - 0.5), m.metal, "plate");
    screws([-0.3 * W, 0, 0.3 * W], yBot + t, (zToe + zF) / 2);
  }
  if (lid.children.length > 0) hinge.add(lid);
  return hinge;
}

export const model: ModelModule = { key: "hinge", build };
