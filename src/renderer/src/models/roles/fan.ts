import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION FAN: a laptop centrifugal blower.
//
// Built in a canonical frame with the outlet at -z (back), then turned about y
// so the outlet faces ctx.edge. Plan layout, seen from above:
//   - a volute (scroll) wall that grows from the tongue, around the rotor, to
//     the straight channel that runs out of the open outlet side;
//   - top plate over the volute with a round intake over the rotor;
//   - bottom plate under it, and three screw ears in the corners the scroll
//     leaves free;
//   - a rotor: hub with a cap, a base disc, and curved forward-swept blades;
//   - the motor lead: a flat four-wire cable running to a small connector.
// 2006: 9 to 13 thick blades, bare metal top plate, rubber grommets on the ears.
// 2026: 30+ thin blades tied by a tip ring, dark plastic housing and top plate.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number]; // (x, z) in plan

const TONGUE = -0.35 * Math.PI; // where the scroll starts, around the rotor centre
const SPIRAL_END = Math.PI; // where it meets the straight channel wall (-x side)
const SPIRAL_SEGS = 40;

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

/** Offset an open plan polyline to its right-hand side (n = (tz, -tx)) with mitred joints. */
function offset(pts: P2[], d: number): P2[] {
  const n = pts.length;
  const segN: P2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const tx = pts[i + 1][0] - pts[i][0];
    const tz = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(tx, tz) || 1;
    segN.push([tz / l, -tx / l]);
  }
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = segN[Math.max(0, i - 1)];
    const b = segN[Math.min(n - 2, i)];
    let mx = a[0] + b[0];
    let mz = a[1] + b[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const k = Math.min(3, 1 / Math.max(0.2, mx * b[0] + mz * b[1]));
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  return out;
}

/** Slide an end point along its segment direction until it sits on z = zLine. */
function slideTo(p: P2, dir: P2, zLine: number): P2 {
  if (Math.abs(dir[1]) < 1e-6) return p;
  const t = (zLine - p[1]) / dir[1];
  return [p[0] + dir[0] * t, zLine];
}

/** Plan outline (x, z) to a Shape. Shape y is world -z once the extrusion is turned up. */
function shapeOf(pts: P2[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  s.closePath();
  return s;
}

/** Extrude a plan shape up the y axis, from y0 to y0 + height. */
function slab(
  shape: THREE.Shape,
  height: number,
  y0: number,
  mat: THREE.Material,
  curveSegments = 12,
): THREE.Mesh {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments,
  });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y0;
  return m;
}

/** A rectangular-section ring about the y axis. Profile runs anticlockwise in (r, y), so it faces out. */
function ring(
  rIn: number,
  rOut: number,
  y0: number,
  y1: number,
  segs: number,
): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(rIn, y0),
      new THREE.Vector2(rOut, y0),
      new THREE.Vector2(rOut, y1),
      new THREE.Vector2(rIn, y1),
      new THREE.Vector2(rIn, y0),
    ],
    segs,
  );
}

/** All blades in one geometry: curved strips, open at the hub and the base. */
function blades(
  count: number,
  cx: number,
  cz: number,
  rIn: number,
  rTip: number,
  y0: number,
  y1: number,
  thick: number,
  sweep: number,
  segs: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const v = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };
  // Quad with winding chosen so its normal points along (ex, ey, ez).
  const quad = (
    a: number,
    b: number,
    c: number,
    d: number,
    ex: number,
    ey: number,
    ez: number,
  ) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const wx = pos[c * 3] - ax, wy = pos[c * 3 + 1] - ay, wz = pos[c * 3 + 2] - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    if (nx * ex + ny * ey + nz * ez >= 0) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  };
  for (let i = 0; i < count; i++) {
    const phi0 = (i / count) * Math.PI * 2;
    const plus: number[][] = [];
    const minus: number[][] = [];
    const top: number[][] = [];
    const sections: { x: number; z: number; nx: number; nz: number; h: number }[] = [];
    for (let k = 0; k <= segs; k++) {
      const f = k / segs;
      const r = rIn + (rTip - rIn) * f;
      const phi = phi0 + sweep * f ** 1.4;
      // Direction along the blade, from a small step ahead (or behind at the tip).
      const f2 = k < segs ? (k + 1) / segs : (k - 1) / segs;
      const r2 = rIn + (rTip - rIn) * f2;
      const p2 = phi0 + sweep * f2 ** 1.4;
      const x = cx + r * Math.cos(phi);
      const z = cz + r * Math.sin(phi);
      let tx = cx + r2 * Math.cos(p2) - x;
      let tz = cz + r2 * Math.sin(p2) - z;
      if (k === segs) {
        tx = -tx;
        tz = -tz;
      }
      const tl = Math.hypot(tx, tz) || 1;
      const h = (thick * (1 - 0.35 * f)) / 2;
      sections.push({ x, z, nx: tz / tl, nz: -tx / tl, h });
    }
    for (const s of sections) {
      const px = s.x + s.nx * s.h, pz = s.z + s.nz * s.h;
      const mx = s.x - s.nx * s.h, mz = s.z - s.nz * s.h;
      plus.push([v(px, y1, pz), v(px, y0, pz)]);
      minus.push([v(mx, y1, mz), v(mx, y0, mz)]);
      top.push([v(px, y1, pz), v(mx, y1, mz)]);
    }
    for (let k = 0; k < segs; k++) {
      const s = sections[k];
      quad(plus[k][0], plus[k + 1][0], plus[k + 1][1], plus[k][1], s.nx, 0, s.nz);
      quad(minus[k][0], minus[k + 1][0], minus[k + 1][1], minus[k][1], -s.nx, 0, -s.nz);
      quad(top[k][0], top[k + 1][0], top[k + 1][1], top[k][1], 0, 1, 0);
    }
    // Tip cap, facing out along the blade.
    const e = sections[segs];
    const a = sections[segs - 1];
    const ox = e.x - a.x, oz = e.z - a.z;
    const pxT = e.x + e.nx * e.h, pzT = e.z + e.nz * e.h;
    const mxT = e.x - e.nx * e.h, mzT = e.z - e.nz * e.h;
    quad(v(pxT, y1, pzT), v(mxT, y1, mzT), v(mxT, y0, mzT), v(pxT, y0, pzT), ox, 0, oz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function build(
  box3: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const modern = ctx.year >= 2015;
  const m = ctx.materials;
  const s = Math.min(box3.width, box3.depth);
  const h = box3.height;
  const half = s / 2;
  const outletEdge = ctx.edge ?? "back";

  const housing = m.plastic;
  const topMat = modern ? m.plastic : m.metal;
  const baseMat = m.metal;
  const rotorMat = m.body;

  // Thicknesses, scaled for 3 to 12 mm tall fans.
  const plate = Math.min(0.55, Math.max(0.3, 0.25 + 0.025 * h));
  const wall = modern ? 0.7 : 1.0;
  const yBot = -h / 2;
  const yTop = h / 2;

  // Scroll geometry, relative to the rotor centre.
  const rTip = 0.34 * s;
  const r0 = rTip + 0.05 * s; // tongue clearance
  const r1 = 0.5 * s - wall; // widest, where the scroll meets the channel wall
  const radius = (th: number) =>
    r0 + (r1 - r0) * ((th - TONGUE) / (SPIRAL_END - TONGUE));
  const spiral: P2[] = [];
  for (let i = 0; i <= SPIRAL_SEGS; i++) {
    const th = TONGUE + ((SPIRAL_END - TONGUE) * i) / SPIRAL_SEGS;
    const r = radius(th);
    spiral.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  // Place the rotor so the scroll touches the -x and +z sides of the box.
  const spiralOut = offset(spiral, wall);
  let maxZ = -Infinity;
  for (const p of spiralOut) maxZ = Math.max(maxZ, p[1]);
  const cx = -half + r1 + wall;
  const cz = half - maxZ - 0.02;

  // Cavity outline Q: outlet (right) up the tongue wall, round the scroll, down the channel wall.
  const tongue: P2 = [cx + spiral[0][0], cz + spiral[0][1]];
  const tongueLean = Math.tan((25 * Math.PI) / 180);
  const mouthR: P2 = [tongue[0] + (tongue[1] + half) * tongueLean, -half];
  const q: P2[] = [mouthR];
  for (const p of spiral) q.push([cx + p[0], cz + p[1]]);
  q.push([cx - r1, -half]);
  const outer = offset(q, wall);
  // Square the wall ends off on the outlet plane.
  outer[0] = slideTo(
    outer[0],
    [q[1][0] - q[0][0], q[1][1] - q[0][1]],
    -half,
  );
  outer[outer.length - 1] = [-half, -half];
  outer[0][0] = Math.min(outer[0][0], half);

  const fan = new THREE.Group();
  const body = new THREE.Group();
  fan.add(body);

  // Walls, between the plates.
  const wallShape = shapeOf([...q, ...outer.slice().reverse()]);
  body.add(slab(wallShape, h - 2 * plate, yBot + plate, housing));

  // Top plate with the intake, and the bottom plate.
  const rIntake = rTip * (modern ? 0.93 : 0.86);
  const topShape = shapeOf(outer);
  const intake = new THREE.Path();
  intake.absarc(cx, -cz, rIntake, 0, Math.PI * 2, true);
  topShape.holes.push(intake);
  body.add(slab(topShape, plate, yTop - plate, topMat, 48));
  body.add(slab(shapeOf(outer), plate, yBot, baseMat));

  // Screw ears in the three free corners; the tab runs in under the housing.
  const re = Math.min(4.2, Math.max(2.8, 0.06 * s));
  const rHole = re * 0.45;
  const inset = re + 0.25;
  const earThick = plate - 0.04;
  const earGeo = (() => {
    const len = 0.3 * s;
    const sh = new THREE.Shape();
    sh.moveTo(len, -re);
    sh.lineTo(0, -re);
    sh.absarc(0, 0, re, -Math.PI / 2, Math.PI / 2, true);
    sh.lineTo(len, re);
    sh.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: earThick,
      bevelEnabled: false,
      curveSegments: 10,
    });
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const gromH = Math.min(1.2, 0.3 * h);
  const gromGeo = modern
    ? undefined
    : ring(rHole, re * 0.8, 0, gromH, 16);
  const ears: P2[] = [
    [-half + inset, half - inset],
    [half - inset, half - inset],
    [half - inset, -half + inset],
  ];
  for (const [ex, ez] of ears) {
    // Baked into the geometry, not the mesh: a turned mesh's box would be judged by its inflated bounds.
    const g = earGeo.clone();
    g.rotateY(Math.atan2(-(cz - ez), cx - ex));
    g.translate(ex, yBot + 0.02, ez);
    body.add(new THREE.Mesh(g, baseMat));
    if (gromGeo) {
      const grom = new THREE.Mesh(gromGeo, m.rubber);
      grom.position.set(ex, yBot + 0.02 + earThick, ez);
      body.add(grom);
    }
  }

  earGeo.dispose();

  // Rotor: base disc, blades, hub and cap.
  const clear = 0.15;
  const rY0 = yBot + plate + clear;
  const rY1 = yTop - plate - clear;
  const rHub = rTip * (modern ? 0.45 : 0.42);
  const discH = Math.min(0.3, 0.12 * (rY1 - rY0));
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(rHub + 0.55 * (rTip - rHub), rHub + 0.55 * (rTip - rHub), discH, 40),
    rotorMat,
  );
  disc.position.set(cx, rY0 + discH / 2, cz);
  body.add(disc);

  const count = modern
    ? 34 + Math.round((s - 50) * 0.3)
    : Math.min(13, Math.max(9, 9 + 2 * Math.round((s - 50) / 10)));
  const bladeThick = modern ? 0.3 : 1.0;
  const bladeTop = modern ? rY1 - 0.25 : rY1;
  body.add(
    new THREE.Mesh(
      blades(
        count,
        cx,
        cz,
        rHub - 0.05,
        rTip,
        rY0 + discH * 0.5,
        bladeTop,
        bladeThick,
        modern ? 0.4 : 0.55,
        modern ? 3 : 6,
      ),
      rotorMat,
    ),
  );
  if (modern) {
    const tip = new THREE.Mesh(ring(rTip - 0.7, rTip, rY1 - 0.25, rY1, 48), rotorMat);
    tip.position.set(cx, 0, cz);
    body.add(tip);
  }

  const hubTop = yTop - plate / 2;
  const capH = Math.min(0.3, 0.1 * h);
  const hubH = hubTop - capH * 0.5 - rY0;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rHub, rHub, hubH, 32), rotorMat);
  hub.position.set(cx, rY0 + hubH / 2, cz);
  body.add(hub);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(rHub * 0.82, rHub * 0.82, capH, 32),
    baseMat,
  );
  cap.position.set(cx, hubTop - capH / 2, cz);
  body.add(cap);

  // Motor lead: four wires along the +x side to a connector, where the scroll leaves room.
  const zA = cz + 0.04 * s;
  const zB = cz - 0.2 * s;
  const zC = cz - 0.28 * s;
  let wallX = -Infinity;
  for (const p of outer)
    if (p[1] > zC - 1 && p[1] < zA + 1) wallX = Math.max(wallX, p[0]);
  const x0 = wallX + 0.15;
  const x1 = half - 0.1;
  const wire = Math.min(0.55, (x1 - x0) / 4.4);
  const wireH = Math.min(wire, h - 0.2);
  if (wire >= 0.3) {
    const wx = (x0 + x1) / 2;
    const wireGeo = new THREE.BoxGeometry(wire * 0.9, wireH, zA - zB);
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(wireGeo, m.rubber);
      w.position.set(wx + (i - 1.5) * wire, yBot + wireH / 2, (zA + zB) / 2);
      body.add(w);
    }
    const connH = Math.min(1.4, h - 0.2);
    const conn = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(x1 - x0, wire * 5), connH, zB - zC),
      m.body,
    );
    conn.position.set(wx, yBot + connH / 2, (zB + zC) / 2);
    body.add(conn);
  }

  // Anchors: the top of the hub, and the centre of the outlet opening.
  body.add(anchor("hub", cx, hubTop, cz));
  body.add(anchor("outlet", (cx - r1 + mouthR[0]) / 2, 0, -half));

  // Turn the canonical (outlet at back) fan to face ctx.edge.
  body.rotation.y = {
    back: 0,
    left: Math.PI / 2,
    right: -Math.PI / 2,
    front: Math.PI,
  }[outletEdge];
  return fan;
}

export const model: ModelModule = { key: "fan", build };
