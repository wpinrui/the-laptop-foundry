import * as THREE from 'https://esm.sh/three@0.170.0';

// Plain JS ports of the game's own part models, for the stand in teardown only:
// src/renderer/src/models/roles/fan.ts and fin.ts in wpinrui/the-laptop-foundry.
// In the game, use the real modules. Box is { width, depth, height } in mm; ctx is
// { year, edge, materials: { plastic, metal, body, rubber, copper } }.

const TONGUE = -0.35 * Math.PI, SPIRAL_END = Math.PI, SPIRAL_SEGS = 40;

function offset(pts, d) {
  const n = pts.length, segN = [];
  for (let i = 0; i < n - 1; i++) { const tx = pts[i + 1][0] - pts[i][0], tz = pts[i + 1][1] - pts[i][1], l = Math.hypot(tx, tz) || 1; segN.push([tz / l, -tx / l]); }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(n - 2, i)];
    let mx = a[0] + b[0], mz = a[1] + b[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = Math.min(3, 1 / Math.max(0.2, mx * b[0] + mz * b[1]));
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  return out;
}
function slideTo(p, dir, zLine) { if (Math.abs(dir[1]) < 1e-6) return p; const t = (zLine - p[1]) / dir[1]; return [p[0] + dir[0] * t, zLine]; }
function shapeOf(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]); s.closePath(); return s; }
function extrude(shape, height, y0, mat, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments }); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.y = y0; return m;
}
function ring(rIn, rOut, y0, y1, segs) {
  return new THREE.LatheGeometry([new THREE.Vector2(rIn, y0), new THREE.Vector2(rOut, y0), new THREE.Vector2(rOut, y1), new THREE.Vector2(rIn, y1), new THREE.Vector2(rIn, y0)], segs);
}
function blades(count, cx, cz, rIn, rTip, y0, y1, thick, sweep, segs) {
  const pos = [], idx = [];
  const v = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const quad = (a, b, c, d, ex, ey, ez) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az, wx = pos[c * 3] - ax, wy = pos[c * 3 + 1] - ay, wz = pos[c * 3 + 2] - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * ex + ny * ey + nz * ez >= 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let i = 0; i < count; i++) {
    const phi0 = (i / count) * Math.PI * 2, plus = [], minus = [], top = [], sections = [];
    for (let k = 0; k <= segs; k++) {
      const f = k / segs, r = rIn + (rTip - rIn) * f, phi = phi0 + sweep * f ** 1.4;
      const f2 = k < segs ? (k + 1) / segs : (k - 1) / segs, r2 = rIn + (rTip - rIn) * f2, p2 = phi0 + sweep * f2 ** 1.4;
      const x = cx + r * Math.cos(phi), z = cz + r * Math.sin(phi);
      let tx = cx + r2 * Math.cos(p2) - x, tz = cz + r2 * Math.sin(p2) - z;
      if (k === segs) { tx = -tx; tz = -tz; }
      const tl = Math.hypot(tx, tz) || 1;
      sections.push({ x, z, nx: tz / tl, nz: -tx / tl, h: (thick * (1 - 0.35 * f)) / 2 });
    }
    for (const s of sections) {
      const px = s.x + s.nx * s.h, pz = s.z + s.nz * s.h, mx = s.x - s.nx * s.h, mz = s.z - s.nz * s.h;
      plus.push([v(px, y1, pz), v(px, y0, pz)]); minus.push([v(mx, y1, mz), v(mx, y0, mz)]); top.push([v(px, y1, pz), v(mx, y1, mz)]);
    }
    for (let k = 0; k < segs; k++) {
      const s = sections[k];
      quad(plus[k][0], plus[k + 1][0], plus[k + 1][1], plus[k][1], s.nx, 0, s.nz);
      quad(minus[k][0], minus[k + 1][0], minus[k + 1][1], minus[k][1], -s.nx, 0, -s.nz);
      quad(top[k][0], top[k + 1][0], top[k + 1][1], top[k][1], 0, 1, 0);
    }
    const e = sections[segs], a = sections[segs - 1], ox = e.x - a.x, oz = e.z - a.z;
    quad(v(e.x + e.nx * e.h, y1, e.z + e.nz * e.h), v(e.x - e.nx * e.h, y1, e.z - e.nz * e.h), v(e.x - e.nx * e.h, y0, e.z - e.nz * e.h), v(e.x + e.nx * e.h, y0, e.z + e.nz * e.h), ox, 0, oz);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function buildFan(box3, ctx) {
  const modern = ctx.year >= 2015, m = ctx.materials, s = Math.min(box3.width, box3.depth), h = box3.height, half = s / 2, outletEdge = ctx.edge ?? 'back';
  const housing = m.plastic, topMat = modern ? m.plastic : m.metal, baseMat = m.metal, rotorMat = m.body;
  const plate = Math.min(0.55, Math.max(0.3, 0.25 + 0.025 * h)), wall = modern ? 0.7 : 1.0, yBot = -h / 2, yTop = h / 2;
  const rTip = 0.34 * s, r0 = rTip + 0.05 * s, r1 = 0.5 * s - wall;
  const radius = (th) => r0 + (r1 - r0) * ((th - TONGUE) / (SPIRAL_END - TONGUE));
  const spiral = [];
  for (let i = 0; i <= SPIRAL_SEGS; i++) { const th = TONGUE + ((SPIRAL_END - TONGUE) * i) / SPIRAL_SEGS, r = radius(th); spiral.push([r * Math.cos(th), r * Math.sin(th)]); }
  const spiralOut = offset(spiral, wall); let maxZ = -Infinity; for (const p of spiralOut) maxZ = Math.max(maxZ, p[1]);
  const cx = -half + r1 + wall, cz = half - maxZ - 0.02;
  const tongue = [cx + spiral[0][0], cz + spiral[0][1]], tongueLean = Math.tan((25 * Math.PI) / 180);
  const mouthR = [tongue[0] + (tongue[1] + half) * tongueLean, -half];
  const q = [mouthR]; for (const p of spiral) q.push([cx + p[0], cz + p[1]]); q.push([cx - r1, -half]);
  const outer = offset(q, wall);
  outer[0] = slideTo(outer[0], [q[1][0] - q[0][0], q[1][1] - q[0][1]], -half);
  outer[outer.length - 1] = [-half, -half];
  outer[0][0] = Math.min(outer[0][0], half);
  const fan = new THREE.Group(), body = new THREE.Group(); fan.add(body);
  body.add(extrude(shapeOf([...q, ...outer.slice().reverse()]), h - 2 * plate, yBot + plate, housing));
  const rIntake = rTip * (modern ? 0.93 : 0.86), topShape = shapeOf(outer), intake = new THREE.Path();
  intake.absarc(cx, -cz, rIntake, 0, Math.PI * 2, true); topShape.holes.push(intake);
  body.add(extrude(topShape, plate, yTop - plate, topMat, 48));
  body.add(extrude(shapeOf(outer), plate, yBot, baseMat));
  const re = Math.min(4.2, Math.max(2.8, 0.06 * s)), rHole = re * 0.45, inset = re + 0.25, earThick = plate - 0.04;
  const earGeo = (() => {
    const len = 0.3 * s, sh = new THREE.Shape();
    sh.moveTo(len, -re); sh.lineTo(0, -re); sh.absarc(0, 0, re, -Math.PI / 2, Math.PI / 2, true); sh.lineTo(len, re); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, rHole, 0, Math.PI * 2, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: earThick, bevelEnabled: false, curveSegments: 10 }); g.rotateX(-Math.PI / 2); return g;
  })();
  const gromH = Math.min(1.2, 0.3 * h), gromGeo = modern ? undefined : ring(rHole, re * 0.8, 0, gromH, 16);
  for (const [ex, ez] of [[-half + inset, half - inset], [half - inset, half - inset], [half - inset, -half + inset]]) {
    const g = earGeo.clone(); g.rotateY(Math.atan2(-(cz - ez), cx - ex)); g.translate(ex, yBot + 0.02, ez);
    body.add(new THREE.Mesh(g, baseMat));
    if (gromGeo) { const grom = new THREE.Mesh(gromGeo, m.rubber); grom.position.set(ex, yBot + 0.02 + earThick, ez); body.add(grom); }
  }
  earGeo.dispose();
  const clear = 0.15, rY0 = yBot + plate + clear, rY1 = yTop - plate - clear, rHub = rTip * (modern ? 0.45 : 0.42), discH = Math.min(0.3, 0.12 * (rY1 - rY0));
  const dr = rHub + 0.55 * (rTip - rHub), disc = new THREE.Mesh(new THREE.CylinderGeometry(dr, dr, discH, 40), rotorMat);
  disc.position.set(cx, rY0 + discH / 2, cz); body.add(disc);
  const count = modern ? 34 + Math.round((s - 50) * 0.3) : Math.min(13, Math.max(9, 9 + 2 * Math.round((s - 50) / 10)));
  body.add(new THREE.Mesh(blades(count, cx, cz, rHub - 0.05, rTip, rY0 + discH * 0.5, modern ? rY1 - 0.25 : rY1, modern ? 0.3 : 1.0, modern ? 0.4 : 0.55, modern ? 3 : 6), rotorMat));
  if (modern) { const tip = new THREE.Mesh(ring(rTip - 0.7, rTip, rY1 - 0.25, rY1, 48), rotorMat); tip.position.set(cx, 0, cz); body.add(tip); }
  const hubTop = yTop - plate / 2, capH = Math.min(0.3, 0.1 * h), hubH = hubTop - capH * 0.5 - rY0;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rHub, rHub, hubH, 32), rotorMat); hub.position.set(cx, rY0 + hubH / 2, cz); body.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(rHub * 0.82, rHub * 0.82, capH, 32), baseMat); cap.position.set(cx, hubTop - capH / 2, cz); body.add(cap);
  const zA = cz + 0.04 * s, zB = cz - 0.2 * s, zC = cz - 0.28 * s; let wallX = -Infinity;
  for (const p of outer) if (p[1] > zC - 1 && p[1] < zA + 1) wallX = Math.max(wallX, p[0]);
  const x0 = wallX + 0.15, x1 = half - 0.1, wire = Math.min(0.55, (x1 - x0) / 4.4), wireH = Math.min(wire, h - 0.2);
  if (wire >= 0.3) {
    const wx = (x0 + x1) / 2, wireGeo = new THREE.BoxGeometry(wire * 0.9, wireH, zA - zB);
    for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(wireGeo, m.rubber); w.position.set(wx + (i - 1.5) * wire, yBot + wireH / 2, (zA + zB) / 2); body.add(w); }
    const connH = Math.min(1.4, h - 0.2), conn = new THREE.Mesh(new THREE.BoxGeometry(Math.min(x1 - x0, wire * 5), connH, zB - zC), m.body);
    conn.position.set(wx, yBot + connH / 2, (zB + zC) / 2); body.add(conn);
  }
  body.rotation.y = { back: 0, left: Math.PI / 2, right: -Math.PI / 2, front: Math.PI }[outletEdge];
  return fan;
}

class Buf {
  constructor() { this.pos = []; this.idx = []; }
  v(x, y, z) { this.pos.push(x, y, z); return this.pos.length / 3 - 1; }
  quad(a, b, c, d, ex, ey, ez) {
    const p = this.pos, ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], wx = p[c * 3] - p[a * 3], wy = p[c * 3 + 1] - p[a * 3 + 1], wz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * ex + ny * ey + nz * ez >= 0) this.idx.push(a, b, c, a, c, d); else this.idx.push(a, c, b, a, d, c);
  }
  box(x0, x1, y0, y1, z0, z1, caps = true) {
    const q = (pts, ex, ey, ez) => this.quad(this.v(...pts[0]), this.v(...pts[1]), this.v(...pts[2]), this.v(...pts[3]), ex, ey, ez);
    q([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 1, 0, 0);
    q([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], -1, 0, 0);
    q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1);
    q([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0, 0, -1);
    if (caps) { q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0, 1, 0); q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0); }
  }
  mesh(mat) {
    if (!this.idx.length) return undefined;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setIndex(this.idx); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

// Returns the stack and the pipe's centre height and section, for joining heat pipes to it.
export function buildFin(box, ctx) {
  const old = ctx.year < 2015, copper = ctx.materials.copper ?? ctx.materials.metal, finMat = old ? copper : ctx.materials.metal, edge = ctx.edge ?? 'back';
  const side = edge === 'left' || edge === 'right', W = side ? box.depth : box.width, L = side ? box.width : box.depth, H = box.height;
  const x1 = W / 2, z0 = -L / 2, z1 = L / 2, yBot = -H / 2, yTop = H / 2;
  const skin = Math.min(old ? 0.3 : 0.2, 0.05 * H), pipeH = Math.min(3, Math.max(0.8, 0.25 * H)), pipeD = Math.min(0.7 * L, Math.max(2.4, 2.2 * pipeH));
  const yFin0 = yBot + skin, yFin1 = yTop - pipeH - skin, yPipe0 = yTop - pipeH;
  const fins = new Buf(), frame = new Buf();
  frame.box(-x1, x1, yBot, yFin0, z0, z1); frame.box(-x1, x1, yFin1, yPipe0, z0, z1);
  const endT = Math.min(old ? 0.6 : 0.4, 0.1 * W);
  frame.box(-x1, -x1 + endT, yFin0, yFin1, z0, z1, false); frame.box(x1 - endT, x1, yFin0, yFin1, z0, z1, false);
  const pitch = old ? 1.6 : 1.0, ft = old ? 0.35 : 0.12, n = Math.max(0, Math.floor((W - 2 * endT - ft) / pitch)), start = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) { const x = start + i * pitch; fins.box(x - ft / 2, x + ft / 2, yFin0, yFin1, z0, z1, false); }
  const stack = new THREE.Group(), body = new THREE.Group(); stack.add(body);
  for (const m of [fins.mesh(finMat), frame.mesh(finMat)]) if (m) body.add(m);
  const pipe = new THREE.CylinderGeometry(pipeD / 2, pipeD / 2, W - 0.02, 16);
  pipe.rotateZ(Math.PI / 2); pipe.scale(1, pipeH / pipeD, 1); pipe.translate(0, yPipe0 + pipeH / 2, 0);
  body.add(new THREE.Mesh(pipe, copper));
  body.rotation.y = { back: 0, left: Math.PI / 2, right: -Math.PI / 2, front: Math.PI }[edge];
  stack.userData.pipe = { y: yPipe0 + pipeH / 2, h: pipeH, d: pipeD };
  return stack;
}
