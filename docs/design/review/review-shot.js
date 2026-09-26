import * as THREE from 'https://esm.sh/three@0.170.0';
import { RoundedBoxGeometry } from 'https://esm.sh/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';
import { buildShot, VIEWING_GRID } from './review-scenes.js';
import { buildFan, buildFin } from './repo-parts.js';

// Reference renderer for the review sets. The laptop, its internals and its screen images
// here are stand ins for the game's own; only review-scenes.js is the deliverable.

const D2R = Math.PI / 180;
const OW = 1280, OH = 720;
const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
R.setPixelRatio(1); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NoToneMapping;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap;
const ENV = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;

export function standInSize(w, era) {
  return { w, d: Math.round(w * (era === 2006 ? 0.73 : 0.685)), h: era === 2006 ? 34 : era === 2016 ? 19.5 : 15.5, t: era === 2006 ? 8 : era === 2016 ? 6 : 5 };
}
const LOOK = {
  2006: { body: [0xb3b6b9, 0.5, 0.12], inner: 0x2e2f31, keys: 0x17181a, gap: 0.1, pad: [0.26, 0.19], buttons: true, aspect: 16 / 10, sw: 0.86, r: 3.5, board: 0x1d5a35, battery: 0x2b2d30 },
  2016: { body: [0xc5c7ca, 0.34, 0.85], inner: 0xaeb1b5, keys: 0x1c1d20, gap: 0.2, pad: [0.36, 0.28], aspect: 16 / 9, sw: 0.9, r: 5, board: 0x1b2a38, battery: 0x2a2c30 },
  2026: { body: [0x3b3d41, 0.42, 0.72], inner: 0x2c2e31, keys: 0x0f1012, gap: 0.2, pad: [0.46, 0.32], aspect: 16 / 10, sw: 0.95, r: 5, board: 0x141618, battery: 0x222428 },
};
const PT = { usbA: [12, 4.6], usbC: [8.6, 2.8, 'pill'], hdmi: [15, 5.6], vga: [16.5, 8], rj45: [15, 12], jack: [6, 6, 'round'], dc: [5.5, 5.5, 'round'], sd: [24, 2.6], exp: [34, 5], opt: [126, 11, 'opt'], mag: [16, 4.5, 'pill'] };
const PORTS = {
  2006: { left: [['rj45', 0.18], ['vga', 0.33], ['usbA', 0.47], ['usbA', 0.56], ['exp', 0.72], ['jack', 0.88], ['jack', 0.94]], right: [['opt', 0.45], ['usbA', 0.86]], rear: [['dc', 0.12]], front: [] },
  2016: { left: [['mag', 0.12], ['usbA', 0.3], ['hdmi', 0.42], ['usbC', 0.53], ['jack', 0.86]], right: [['usbA', 0.35], ['usbA', 0.48], ['sd', 0.7]], rear: [], front: [] },
  2026: { left: [['usbC', 0.14], ['usbC', 0.24], ['hdmi', 0.38]], right: [['usbC', 0.2], ['jack', 0.82]], rear: [], front: [] },
};
const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const cs = (m) => { m.castShadow = m.receiveShadow = true; return m; };
function slab(p, x0, x1, y0, y1, z0, z1, mat) { const m = cs(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); p.add(m); return m; }
function flat(p, w, d, mat, x, y, z, down = false) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; p.add(m); return m; }
function pill(w, h) { const s = new THREE.Shape(), r = h / 2, x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); s.lineTo(x + r, y + h); s.absarc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); return new THREE.ShapeGeometry(s, 8); }
function instFlat(p, list, sw, sd, mat, y, down) {
  const g = new THREE.PlaneGeometry(sw, sd); g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  const im = new THREE.InstancedMesh(g, mat, list.length), m4 = new THREE.Matrix4();
  list.forEach(([x, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); }); p.add(im); return im;
}

function portMesh(kind, black) {
  const [a, b, shape] = PT[kind];
  if (shape === 'round') return new THREE.Mesh(new THREE.CircleGeometry(a / 2, 24), black);
  if (shape === 'pill') return new THREE.Mesh(pill(a, b), black);
  if (shape === 'opt') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(a, b), std(0x1f2022, 0.5)));
    const line = new THREE.Mesh(new THREE.PlaneGeometry(a * 0.94, 0.8), black); line.position.z = 0.05; g.add(line);
    const btn = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), std(0x3a3b3e, 0.5)); btn.position.set(a * 0.36, -b * 0.28, 0.05); g.add(btn);
    return g;
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(a, b), black);
}
function ports(g, s, era, black) {
  const { w, d, h } = s, L = PORTS[era];
  const place = (side, list) => list.forEach(([kind, u]) => {
    const m = portMesh(kind, black);
    if (side === 'left') { m.position.set(-w / 2 - 0.2, h / 2, -d / 2 + u * d); m.rotation.y = -Math.PI / 2; }
    if (side === 'right') { m.position.set(w / 2 + 0.2, h / 2, -d / 2 + u * d); m.rotation.y = Math.PI / 2; }
    if (side === 'rear') { m.position.set(-w / 2 + u * w, h / 2, -d / 2 - 0.2); m.rotation.y = Math.PI; }
    if (side === 'front') m.position.set(-w / 2 + u * w, h / 2, d / 2 + 0.2);
    g.add(m);
  });
  Object.entries(L).forEach(([side, list]) => place(side, list));
  const vg = new THREE.PlaneGeometry(2.4, h * 0.34), vm = new THREE.InstancedMesh(vg, black, 40), m4 = new THREE.Matrix4().makeRotationY(Math.PI);
  for (let i = 0; i < 40; i++) { const x = (era === 2006 ? 0.12 : -0.3) * w + i * 5; const t = new THREE.Matrix4().makeTranslation(x, h / 2, -d / 2 - 0.2).multiply(m4); vm.setMatrixAt(i, t); }
  g.add(vm);
}
function bottom(g, s, era, black) {
  const { w, d } = s, rubber = std(0x101011, 0.9);
  if (era === 2026) for (const z of [-1, 1]) { const m = new THREE.Mesh(pill(w * 0.78, 7), rubber); m.rotation.x = Math.PI / 2; m.position.set(0, -0.15, z * (d / 2 - 18)); g.add(m); }
  else for (const x of [-1, 1]) for (const z of [-1, 1]) { const m = new THREE.Mesh(new THREE.CircleGeometry(era === 2006 ? 7 : 9, 24), rubber); m.rotation.x = Math.PI / 2; m.position.set(x * (w / 2 - 22), -0.15, z * (d / 2 - 20)); g.add(m); }
  const slots = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 14; c++) slots.push([-w * 0.42 + c * 5.2, -d * 0.4 + r * 18]);
  if (era === 2026) for (let r = 0; r < 6; r++) for (let c = 0; c < 14; c++) slots.push([w * 0.42 - 68 + c * 5.2, -d * 0.4 + r * 18]);
  instFlat(g, slots, 2.2, 14, black, -0.2, true);
  if (era === 2006) flat(g, w * 0.6, 0.8, black, 0, -0.2, -d * 0.36, true);
}
function internals(g, s, era, L) {
  const { w, d, h } = s, by = Math.max(6, h * 0.55), lo = 1.8, X = (f) => f * w, Z = (f) => f * d;
  const pcb = std(L.board, 0.6, 0.1), chip = std(0x0e0f10, 0.5, 0.2), copper = std(0xb8733a, 0.32, 0.9), fanM = std(0x1b1c1f, 0.6, 0.2), bat = std(L.battery, 0.55, 0.1), steel = std(0xaeb2b6, 0.35, 0.85), ram = std(0x1f6a3c, 0.6, 0.1);
  slab(g, X(-0.46), X(0.46), by, by + 1.2, Z(-0.47), Z(-0.02), pcb);
  [[-0.2, -0.4, 14, 10], [0.12, -0.1, 10, 10], [-0.1, -0.08, 18, 8], [0.36, -0.08, 12, 6], [-0.42, -0.1, 8, 14], [0.22, -0.1, 16, 6]].forEach(([fx, fz, a, b]) => slab(g, X(fx) - a / 2, X(fx) + a / 2, by - 1, by, Z(fz) - b / 2, Z(fz) + b / 2, chip));
  // Fans and fin stacks are the game's own models (repo-parts.js), turned so intakes and pipes face the cover.
  const fanH = by - 0.4 - lo, fy = (lo + by - 0.4) / 2, fs = era === 2006 ? 60 : era === 2016 ? 55 : 50, finL = 7.5;
  const pm = { plastic: std(era === 2006 ? 0x2a2b2e : 0x16171a, 0.6), metal: std(0xa9adb2, 0.35, 0.85), body: std(0x232427, 0.55), rubber: std(0x101011, 0.9), copper };
  const fz0 = -d / 2 + 1.6, fz1 = fz0 + finL, finC = (fz0 + fz1) / 2, fanZ = fz1 + fs / 2 + 0.3;
  const fans = era === 2026 ? [-0.34, 0.34] : [-0.34], cpu = [X(0.02), Z(-0.24)], n = era === 2006 ? 1 : 2;
  let pipe = { y: 0, h: 2, d: 5 };
  fans.forEach((fx) => {
    const f = buildFan({ width: fs, depth: fs, height: fanH }, { year: era, edge: 'back', materials: pm });
    f.rotation.z = Math.PI; f.position.set(X(fx), fy, fanZ); g.add(f);
    const fin = buildFin({ width: fs, depth: finL, height: fanH }, { year: era, edge: 'back', materials: pm });
    fin.rotation.z = Math.PI; fin.position.set(X(fx), fy, finC); g.add(fin);
    const P = fin.userData.pipe; pipe = { y: fy - P.y, h: P.h, d: P.d };
    f.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); fin.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  });
  const py0 = pipe.y - pipe.h / 2, py1 = pipe.y + pipe.h / 2, pd = pipe.d;
  slab(g, cpu[0] - 16, cpu[0] + 16, py1, by - 1.2, cpu[1] - 16, cpu[1] + 16, copper);
  // Each pipe runs back from the CPU beside it, then along the rear strip behind the fan into its fin stack.
  // The outer pipe turns first, so no two pipes cross and none passes over a fan.
  fans.forEach((fx) => {
    const side = Math.sign(fx), xf = X(fx);
    for (let i = 0; i < n; i++) {
      const xi = cpu[0] + side * (pd / 2 + 2 + i * (pd + 1)), zi = finC - ((n - 1) / 2 - i) * (pd + 0.3);
      slab(g, xi - pd / 2, xi + pd / 2, py0, py1, zi - pd / 2, cpu[1] + 10, copper);
      slab(g, Math.min(xi, xf) - (side > 0 ? pd / 2 : 0), Math.max(xi, xf) + (side < 0 ? pd / 2 : 0), py0, py1, zi - pd / 2, zi + pd / 2, copper);
    }
  });
  if (era !== 2026) for (let i = 0; i < 2; i++) { const z0 = Z(-0.42) + i * 34; slab(g, X(0.2), X(0.2) + 67.6, by - 3.8, by - 2.6, z0, z0 + 30, ram); for (let j = 0; j < 4; j++) slab(g, X(0.2) + 5 + j * 15, X(0.2) + 16 + j * 15, by - 4.6, by - 3.8, z0 + 8, z0 + 22, chip); }
  if (era !== 2006) for (let i = 0; i < (era === 2026 ? 2 : 1); i++) { const x0 = i ? X(0.1) : X(-0.24); slab(g, x0, x0 + 80, by - 2.2, by - 1.2, Z(-0.08) - 11, Z(-0.08) + 11, chip); slab(g, x0 + 10, x0 + 30, by - 2.8, by - 2.2, Z(-0.08) - 8, Z(-0.08) + 8, std(0x2a2b2e, 0.4)); }
  if (era === 2026) for (let i = 0; i < 4; i++) slab(g, X(-0.22) + i * 14, X(-0.22) + i * 14 + 10, by - 1.2, by, Z(-0.42), Z(-0.42) + 16, chip);
  if (era === 2006) {
    slab(g, X(-0.44), X(-0.44) + 100, lo, lo + 9.5, Z(0.06), Z(0.06) + 70, steel);
    const sp = new THREE.Mesh(new THREE.CircleGeometry(14, 32), std(0x8d9196, 0.3, 0.9)); sp.rotation.x = Math.PI / 2; sp.position.set(X(-0.44) + 62, lo - 0.05, Z(0.06) + 35); g.add(sp);
    slab(g, X(0.08), X(0.46), lo, h - 4, Z(0.03), Z(0.46), std(0x1d1e20, 0.5, 0.4));
    slab(g, X(-0.1), X(-0.1) + 30, by - 2, by - 1, Z(0.1), Z(0.1) + 50, std(0x2f5f3c, 0.6));
    slab(g, X(0.1), X(0.46), lo, h - 3, Z(-0.495), Z(-0.475), bat);
  } else if (era === 2016) {
    slab(g, X(-0.44), X(0.12), lo, h - 3, Z(0.03), Z(0.45), bat);
    slab(g, X(0.16), X(0.16) + 100, lo, lo + 7, Z(0.06), Z(0.06) + 70, std(0x7d8186, 0.4, 0.7));
  } else {
    slab(g, X(-0.44), X(0.44), lo, h - 3, Z(0.03), Z(0.46), bat);
    for (const f of [-0.15, 0.15]) slab(g, X(f) - 0.6, X(f) + 0.6, lo - 0.1, lo, Z(0.03), Z(0.46), chip);
  }
}
function coverPlate(s, era, L, body) {
  const { w, d } = s, g = new THREE.Group(), black = std(0x050505, 1);
  slab(g, -w / 2, w / 2, 0, 1.4, -d / 2, d / 2, body);
  flat(g, w - 6, d - 6, std(L.inner, 0.6, era === 2016 ? 0.8 : 0.1), 0, 1.42, 0);
  const slots = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 14; c++) slots.push([-w * 0.42 + c * 5.2, -d * 0.4 + r * 18]);
  instFlat(g, slots, 2.2, 14, black, 1.46);
  flat(g, w * 0.5, d * 0.3, std(0x111112, 0.95), -w * 0.1, 1.48, d * 0.24);
  const holes = []; for (let i = 0; i < 8; i++) holes.push([-w * 0.45 + (i % 4) * w * 0.3, i < 4 ? -d * 0.44 : d * 0.44]);
  instFlat(g, holes, 4, 4, black, 1.47);
  return g;
}

const heatMat = (s) => new THREE.ShaderMaterial({
  uniforms: { uS: { value: new THREE.Vector3(s.w, s.d, s.h) } },
  vertexShader: `varying vec3 vW; void main(){ vec4 p = vec4(position,1.0);
    #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    #endif
    vec4 w = modelMatrix * p; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uS; varying vec3 vW;
    vec3 iron(float t){ t = clamp(t,0.,1.);
      vec3 a=vec3(.02,0.,.08), b=vec3(.3,0.,.5), c=vec3(.74,.06,.42), d=vec3(.96,.38,.05), e=vec3(1.,.82,.18), f=vec3(1.,1.,.92);
      if(t<.2) return mix(a,b,t/.2); if(t<.4) return mix(b,c,(t-.2)/.2); if(t<.65) return mix(c,d,(t-.4)/.25); if(t<.85) return mix(d,e,(t-.65)/.2); return mix(e,f,(t-.85)/.15); }
    void main(){ float x = vW.x/uS.x, z = vW.z/uS.y;
      float spot = exp(-(pow(x+.08,2.)+pow(z+.2,2.))/.035), fan = exp(-(pow(x+.34,2.)+pow(z+.3,2.))/.02);
      float t = .16 + .62*spot + .16*fan + .1*clamp(.5-z,0.,1.);
      if (vW.y < 1.) t += .08;
      if (vW.y > uS.z + 4.) t = .1 + .08*spot;
      gl_FragColor = vec4(iron(t), 1.); }`,
});

function standIn(size, era, lid, { screen, teardown, heat }) {
  const L = LOOK[era], { w, d, h, t } = size, g = new THREE.Group(), black = std(0x050505, 1);
  const body = std(L.body[0], L.body[1], L.body[2]);
  let cover = null;
  if (!teardown) {
    const base = cs(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(L.r, h / 2.4)), body)); base.position.y = h / 2; g.add(base);
    const KW = w * 0.9, KD = d * 0.42, cols = 15, rows = 6, kw = KW / cols, kd = KD / rows;
    flat(g, KW, KD, std(0x0b0c0d, 0.9), 0, h + 0.08, -d * 0.1);
    const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(kw * (1 - L.gap), 0.9, kd * (1 - L.gap)), std(L.keys, 0.55), cols * rows), m4 = new THREE.Matrix4();
    let i = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { m4.makeTranslation(-KW / 2 + kw * (c + 0.5), h + 0.45, -d * 0.1 - KD / 2 + kd * (r + 0.5)); keys.setMatrixAt(i++, m4); }
    keys.castShadow = true; g.add(keys);
    const padMat = std(new THREE.Color(L.body[0]).multiplyScalar(era === 2006 ? 0.55 : 0.9), Math.min(1, L.body[1] + 0.15), L.body[2] * 0.6);
    flat(g, w * L.pad[0], d * L.pad[1], padMat, 0, h + 0.1, d * (L.buttons ? 0.27 : 0.3));
    if (L.buttons) for (const sx of [-1, 1]) flat(g, w * L.pad[0] * 0.48, d * 0.05, std(0x2a2b2d, 0.5), sx * w * L.pad[0] * 0.25, h + 0.1, d * 0.42);
    ports(g, size, era, black); bottom(g, size, era, black);
  } else {
    slab(g, -w / 2, w / 2, h - 2, h, -d / 2, d / 2, body);
    slab(g, -w / 2, -w / 2 + 1.6, 0, h - 2, -d / 2, d / 2, body); slab(g, w / 2 - 1.6, w / 2, 0, h - 2, -d / 2, d / 2, body);
    slab(g, -w / 2, w / 2, 0, h - 2, -d / 2, -d / 2 + 1.6, body); slab(g, -w / 2, w / 2, 0, h - 2, d / 2 - 1.6, d / 2, body);
    flat(g, w - 3.2, d - 3.2, std(0x1a1b1d, 0.8), 0, h - 2.05, 0, true);
    internals(g, size, era, L);
    cover = coverPlate(size, era, L, body);
  }
  const hinge = new THREE.Group(); hinge.position.set(0, h, -d / 2); hinge.rotation.x = -(lid - 90) * D2R;
  const lidM = cs(new THREE.Mesh(new RoundedBoxGeometry(w, d, t, 3, t / 2.3), body)); lidM.position.set(0, d / 2, -t / 2); hinge.add(lidM);
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.985, d * 0.975), std(0x07080a, 0.25, 0.3)); bezel.position.set(0, d / 2, 0.2); hinge.add(bezel);
  const sw = w * L.sw, sh = Math.min(sw / L.aspect, d * 0.88);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screen, color: screen ? 0xffffff : 0x050607, toneMapped: false }));
  scr.position.set(0, d / 2 + d * 0.02, 0.4); hinge.add(scr); g.add(hinge);
  if (heat) { const hm = heatMat(size); g.traverse((o) => { if (o.isMesh) o.material = hm; }); }
  return { group: g, cover };
}

// Stand in screen images. The game supplies the real ones.
const texCache = new Map();
function canvasTex(key, aspect, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 / aspect);
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}
function wallpaper(g, W, H, era) {
  const cols = { 2006: ['#5d8fd0', '#1f4f96'], 2016: ['#1f6f86', '#0c1f33'], 2026: ['#7e5bb5', '#1d2b53'] }[era];
  const r = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.95); r.addColorStop(0, cols[0]); r.addColorStop(1, cols[1]);
  g.fillStyle = r; g.fillRect(0, 0, W, H);
  g.fillStyle = era === 2006 ? '#c9ccd2' : '#10131a'; g.fillRect(0, H - (era === 2006 ? 30 : 40), W, 40);
}
function screenTex(kind, era, aspect) {
  if (!kind) return null;
  return canvasTex(kind + era + aspect.toFixed(2), aspect, (g, W, H) => {
    if (kind === 'wallpaper') return wallpaper(g, W, H, era);
    if (kind === 'test') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].forEach((c, i) => { g.fillStyle = c; g.fillRect((i * W) / 7, 0, W / 7 + 1, H * 0.6); });
      for (let i = 0; i < 11; i++) { const v = Math.round((i / 10) * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect((i * W) / 11, H * 0.62, W / 11 + 1, H * 0.16); }
      ['#e8b89a', '#c68a67', '#8d5a3f', '#5a8f3c', '#3f6fb0', '#e0c040', '#ffffff', '#101010'].forEach((c, i) => { g.fillStyle = c; g.fillRect((i * W) / 8 + 6, H * 0.82, W / 8 - 12, H * 0.14); });
      return;
    }
    if (kind === 'bench') {
      const s = g.createLinearGradient(0, 0, 0, H * 0.62); s.addColorStop(0, '#1c2240'); s.addColorStop(1, '#e0784a'); g.fillStyle = s; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffd38a'; g.beginPath(); g.arc(W * 0.62, H * 0.5, H * 0.08, 0, Math.PI * 2); g.fill();
      [['#3a2a48', 0.46, 0.18], ['#241b33', 0.54, 0.12]].forEach(([c, y, amp], j) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 32) g.lineTo(x, H * y + Math.sin(x * 0.011 + j * 2) * H * amp * 0.5 + Math.sin(x * 0.031) * H * 0.03); g.lineTo(W, H); g.fill(); });
      g.fillStyle = '#121019'; g.fillRect(0, H * 0.62, W, H * 0.38);
      g.strokeStyle = '#e0c070'; g.lineWidth = 3; for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(W / 2, H * 0.62); g.lineTo(W / 2 + i * W * 0.2, H); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(W * 0.03, H * 0.05, W * 0.16, 8); g.fillStyle = '#58c26b'; g.fillRect(W * 0.03, H * 0.05, W * 0.11, 8);
      return;
    }
    if (kind === 'sysinfo') {
      wallpaper(g, W, H, era);
      const dark = era === 2026, x = W * 0.12, y = H * 0.08, ww = W * 0.76, hh = H * 0.76;
      g.fillStyle = dark ? '#202225' : '#f0f0f0'; g.fillRect(x, y, ww, hh);
      g.fillStyle = era === 2006 ? '#2a5bd0' : dark ? '#2b2e33' : '#ffffff'; g.fillRect(x, y, ww, 34);
      g.fillStyle = dark ? '#5b6068' : '#9a9da3';
      for (let i = 0; i < 12; i++) g.fillRect(x + 28, y + 64 + i * 28, 120 + ((i * 53) % 140), 10);
      for (let i = 0; i < 8; i++) { g.fillStyle = dark ? '#3a3f46' : '#d8dadd'; g.fillRect(x + ww * 0.5, y + 70 + i * 40, ww * 0.44, 18); g.fillStyle = '#4c8ed8'; g.fillRect(x + ww * 0.5, y + 70 + i * 40, ww * 0.44 * (0.25 + ((i * 37) % 70) / 100), 18); }
    }
  });
}

function dispose(root) {
  root.traverse((o) => { o.geometry?.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); o.shadow?.dispose?.(); });
}
async function shoot(sceneId, shotId, era, w, W, H, ctx, dx, dy, dw, dh) {
  const size = standInSize(w, era), s = await buildShot(sceneId, shotId, { era, size, aspect: W / H });
  const L = LOOK[era];
  const lap = standIn(size, era, s.lid, { screen: screenTex(s.screen, era, L.aspect), teardown: sceneId === 'teardown', heat: s.thermal });
  s.laptopRoot.add(lap.group); if (s.coverRoot && lap.cover) s.coverRoot.add(lap.cover);
  s.scene.environment = ENV; s.scene.environmentIntensity = s.env;
  R.toneMapping = s.toneMapping; R.toneMappingExposure = s.exposure;
  R.setSize(W, H, false); R.render(s.scene, s.camera);
  ctx.drawImage(R.domElement, 0, 0, W, H, dx, dy, dw, dh);
  dispose(s.scene);
}

function enqueue(el) { el.gen = (el.gen || 0) + 1; const g = el.gen; requestAnimationFrame(() => el.isConnected && g === el.gen && el.paint().catch((e) => console.error(e))); }

class ReviewShot extends HTMLElement {
  static get observedAttributes() { return ['scene', 'shot', 'era', 'w']; }
  connectedCallback() {
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = OW; this.cv.height = OH; this.cv.style.cssText = 'display:block;width:100%;height:100%'; this.appendChild(this.cv); }
    enqueue(this);
  }
  attributeChangedCallback() { if (this.cv) enqueue(this); }
  async paint() {
    const sc = this.getAttribute('scene') || 'studio', sh = this.getAttribute('shot') || 'hero';
    const era = +(this.getAttribute('era') || 2016) || 2016, w = +(this.getAttribute('w') || 340) || 340, g = this.cv.getContext('2d');
    if (sc === 'viewing' && sh === 'grid') {
      const G = VIEWING_GRID, gut = G.gutterPx, cw = (OW - gut * 2) / 3, ch = (OH - gut * 2) / 3;
      g.fillStyle = G.fill; g.fillRect(0, 0, OW, OH);
      for (const [id, [cx, cy]] of Object.entries(G.cells)) await shoot(sc, id, era, w, 640, 360, g, cx * (cw + gut), cy * (ch + gut), cw, ch);
    } else await shoot(sc, sh, era, w, OW, OH, g, 0, 0, OW, OH);
  }
}
customElements.define('review-shot', ReviewShot);
