// @ts-nocheck
// Ported from the design handoff's review-scenes.js; kept line for line so it can be diffed against it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js';

// Review photo sets for The Laptop Foundry. Units are mm, y up. The laptop is the game's
// Model as placed by viewer/space.ts: base centred on the origin, bottom at y 0, facing +z,
// user's left on -x. buildShot() returns the set, lights and a framed camera; parent the
// laptop under laptopRoot (and the removed bottom cover under coverRoot for the teardown).
// Nothing here is random, so the same laptop always gives the same photo.

const D2R = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const dirOf = (az, el) => V(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(az * D2R) * Math.cos(el * D2R));
export const eraOf = (year) => (year < 2011 ? 2006 : year < 2021 ? 2016 : 2026);
export const lidThickness = (s) => s.t ?? Math.max(4.5, s.h * 0.3);
export const screenNormal = (lid) => V(0, -Math.cos(lid * D2R), Math.sin(lid * D2R));
const hash = (i) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

const std = (color, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function slab(parent, x0, x1, y0, y1, z0, z1, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function rod(parent, r, len, mat, x, y, z, axis = 'y', seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function ground(parent, size, y, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; parent.add(m); return m;
}
// Many thin boxes in one draw: each entry is [x0, x1, y0, y1, z0, z1].
function boxes(parent, list, mat, cast = false) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  list.forEach((b, i) => { m4.compose(V((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2), q, V(b[1] - b[0], b[3] - b[2], b[5] - b[4])); im.setMatrixAt(i, m4); });
  im.castShadow = cast; im.receiveShadow = true; parent.add(im); return im;
}
function hemi(parent, sky, gnd, i) { parent.add(new THREE.HemisphereLight(sky, gnd, i)); }
// Directional light aimed at the origin from (az, el). radius null = no shadow.
function sun(parent, color, intensity, az, el, reach, radius = null) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(dirOf(az, el).multiplyScalar(reach * 4));
  parent.add(l); parent.add(l.target);
  if (radius !== null) {
    l.castShadow = true; l.shadow.mapSize.set(2048, 2048);
    const c = l.shadow.camera; c.left = c.bottom = -reach; c.right = c.top = reach; c.near = reach; c.far = reach * 8;
    l.shadow.bias = -0.0003; l.shadow.normalBias = (reach / 1024) * 1.5; l.shadow.radius = radius;
  }
  return l;
}
// Floor, cove and wall in one surface, facing the laptop.
function sweepGeometry(width, front, back, radius, height, seg = 28) {
  const prof = [[front, 0], [-back + radius, 0]];
  for (let i = 1; i <= seg; i++) { const a = (i / seg) * Math.PI / 2; prof.push([-back + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]); }
  prof.push([-back, height]);
  const pos = [], idx = [];
  prof.forEach(([z, y]) => pos.push(-width / 2, y, z, width / 2, y, z));
  for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function skyDome(parent, horizon, zenith, R = 20000) {
  const g = new THREE.SphereGeometry(R, 40, 20), p = g.attributes.position, a = new THREE.Color(horizon), b = new THREE.Color(zenith), t = new THREE.Color(), col = [];
  for (let i = 0; i < p.count; i++) { t.copy(a).lerp(b, Math.pow(Math.max(0, p.getY(i) / R), 0.55)); col.push(t.r, t.g, t.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  parent.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
}

// Bounds of the laptop for framing. part: all, base, screen, left, right, rear, front.
export function laptopPoints(size, lid, part = 'all') {
  const { w, d, h } = size, t = lidThickness(size), a = lid * D2R, p = [];
  const top = lid < 5 ? h + t : h;
  const hinge = V(0, h, -d / 2), along = V(0, Math.sin(a), Math.cos(a)), out = V(0, Math.cos(a), -Math.sin(a));
  if (part === 'screen') {
    const c = hinge.clone().addScaledVector(along, d * 0.5);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) p.push(c.clone().add(V(sx * w * 0.47, 0, 0)).addScaledVector(along, sy * d * 0.44));
    return p;
  }
  const face = { left: [[-w / 2], [-d / 2, d / 2]], right: [[w / 2], [-d / 2, d / 2]], rear: [[-w / 2, w / 2], [-d / 2]], front: [[-w / 2, w / 2], [d / 2]] }[part];
  if (face) { for (const x of face[0]) for (const z of face[1]) for (const y of [0, top]) p.push(V(x, y, z)); return p; }
  for (const x of [-w / 2, w / 2]) for (const y of [0, top]) for (const z of [-d / 2, d / 2]) p.push(V(x, y, z));
  if (part === 'all' && lid >= 5) for (const x of [-w / 2, w / 2]) {
    const tip = hinge.clone().addScaledVector(along, d).setX(x);
    p.push(V(x, h, -d / 2).addScaledVector(out, t), tip, tip.clone().addScaledVector(out, t));
  }
  return p;
}

// Places the camera on dir (from target toward camera) and solves aim and distance so every
// point sits inside `fill` of the frame. Deterministic: no search, fixed iterations.
export function frame(cam, points, dir, { fill = 0.86, up = V(0, 1, 0) } = {}) {
  const back = dir.clone().normalize(), f = back.clone().negate();
  const upv = Math.abs(f.dot(up)) > 0.999 ? V(0, 0, -1) : up.clone();
  const r = V().crossVectors(f, upv).normalize(), u = V().crossVectors(r, f);
  const tv = Math.tan((cam.fov * D2R) / 2), th = tv * cam.aspect, q = V(), T = V();
  points.forEach((p) => T.add(p)); T.multiplyScalar(1 / points.length);
  const solve = () => { let D = 0; for (const p of points) { q.subVectors(p, T); const z = q.dot(f); D = Math.max(D, Math.abs(q.dot(r)) / (fill * th) - z, Math.abs(q.dot(u)) / (fill * tv) - z); } return D; };
  let D = solve();
  for (let i = 0; i < 4; i++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) { q.subVectors(p, T); const z = D + q.dot(f), sx = q.dot(r) / z, sy = q.dot(u) / z; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    T.addScaledVector(r, ((x0 + x1) / 2) * D).addScaledVector(u, ((y0 + y1) / 2) * D);
    D = solve();
  }
  cam.up.copy(upv); cam.position.copy(T).addScaledVector(back, D); cam.lookAt(T);
  cam.near = D / 25; cam.far = D * 120; cam.updateProjectionMatrix();
  return { target: T, distance: D };
}

// 1 Studio. Lights are [colour, intensity, azimuth relative to the camera, elevation, shadow radius].
const STUDIO = {
  2006: { bg: 0xf1f1ef, paper: 0xf1f1ef, rough: 0.95, hemi: [0xffffff, 0xd8d8d6, 0.85], env: 0.25,
    lights: [[0xffffff, 2.7, -38, 52, 1.5], [0xffffff, 0.35, 70, 20, null]] },
  2016: { bg: 0xe7e9ec, paper: 0x9ea2a8, rough: 0.9, hemi: [0xffffff, 0xd9dce0, 0.9], env: 0.45,
    lights: [[0xffffff, 2.1, -35, 48, 9], [0xffffff, 0.55, 65, 22, null], [0xffffff, 0.8, 180, 55, null]] },
  2026: { bg: 0x2b2927, paper: 0x2e2c2a, rough: 0.55, hemi: [0x6a645e, 0x1a1918, 0.55], env: 0.32,
    lights: [[0xfff3e6, 2.5, -28, 58, 14], [0xdfe8ff, 2.4, -145, 22, null], [0xffe0c4, 1.7, 140, 28, null]] },
};
const PORT_LIGHTS = [[0xffffff, 2.4, 28, 32, 2], [0xffffff, 0.9, 180, 65, null]];
function studioSet(c, lights, ambient) {
  const E = STUDIO[c.era], k = c.k;
  c.scene.background = new THREE.Color(E.bg);
  c.scene.fog = new THREE.Fog(E.bg, 2600 * k, 7000 * k);
  const sw = new THREE.Mesh(sweepGeometry(24000 * k, 8000 * k, 1300 * k, 1000 * k, 3600 * k), std(E.paper, E.rough));
  sw.receiveShadow = true; c.set.add(sw);
  hemi(c.set, E.hemi[0], E.hemi[1], E.hemi[2] * ambient);
  lights.forEach(([col, i, rel, el, rad]) => sun(c.set, col, i, (c.shot.az ?? 0) + rel, el, 500 * k, rad));
  return { env: E.env * ambient };
}

// 3 Teardown. Real mm; the props do not scale with the laptop.
const TEAR = {
  2006: { bench: 0xc9a878, benchR: 0.6, mat: 0x56666d, matR: 0.92, light: 0xfff0dc, driver: { handle: 0xe7b416, hl: 100, hr: 14, sl: 90, sr: 3, band: 0x151515, metal: 0, rough: 0.45 }, screw: 3 },
  2016: { bench: 0xe8e6e1, benchR: 0.5, mat: 0x2e6a50, matR: 0.75, grid: [20, 0x4a8a6b, 100, 0x9cc7b0], light: 0xffffff, driver: { handle: 0xc8352d, hl: 95, hr: 10, sl: 60, sr: 2, band: 0x141414, metal: 0, rough: 0.4 }, screw: 2.4 },
  2026: { bench: 0x4a3526, benchR: 0.55, mat: 0x3a3f45, matR: 0.8, grid: [25, 0x454b52, 25, 0x454b52], lip: true, light: 0xfaf8f4, driver: { handle: 0xb9bcbf, hl: 110, hr: 7, sl: 60, sr: 2, band: 0x1a1a1c, metal: 0.9, rough: 0.35 }, screw: 2 },
};
function driver(parent, D, x, z, turn) {
  const g = new THREE.Group(), steel = std(0xc9ccd0, 0.3, 0.9);
  const hdl = new THREE.Mesh(new THREE.CylinderGeometry(D.hr * 0.9, D.hr, D.hl, 28), std(D.handle, D.rough, D.metal));
  hdl.rotation.z = Math.PI / 2; hdl.position.set(D.hl / 2, D.hr, 0); hdl.castShadow = true; g.add(hdl);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(D.hr * 1.02, D.hr * 1.02, D.hl * 0.16, 28), std(D.band, 0.6));
  band.rotation.z = Math.PI / 2; band.position.set(D.hl * 0.14, D.hr, 0); g.add(band);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(D.sr, D.sr, D.sl, 14), steel);
  sh.rotation.z = Math.PI / 2; sh.position.set(D.hl + D.sl / 2, D.hr, 0); sh.castShadow = true; g.add(sh);
  g.position.set(x, 0, z); g.rotation.y = turn; parent.add(g);
  const c = Math.cos(turn), s = Math.sin(turn), L = D.hl + D.sl;
  return [V(x, 0, z - D.hr), V(x, 0, z + D.hr), V(x + L * c, 0, z - L * s - D.hr), V(x + L * c, 0, z - L * s + D.hr)];
}
function screw(parent, r, x, z, mat, slot) {
  rod(parent, r, r * 0.55, mat, x, r * 0.28, z, 'y', 18);
  slab(parent, x - r * 0.7, x + r * 0.7, r * 0.5, r * 0.58, z - r * 0.12, z + r * 0.12, slot, false);
  slab(parent, x - r * 0.12, x + r * 0.12, r * 0.5, r * 0.58, z - r * 0.7, z + r * 0.7, slot, false);
}

// Public assets, all CC0 from Poly Haven. The game ships copies; setAssetResolver points at them.
// There is no default: nothing here ever reaches the network.
export const ASSETS = {
  studio_small_09: { kind: 'hdri', name: 'Studio Small 09', by: 'Sergej Majboroda' },
  greenwich_park: { kind: 'hdri', name: 'Greenwich Park', by: 'Andreas Mischok' },
  balcony: { kind: 'hdri', name: 'Balcony', by: 'Greg Zaal' },
  roof_garden: { kind: 'hdri', name: 'Roof Garden', by: 'Andreas Mischok' },
  wooden_picnic_table: { kind: 'model', name: 'Wooden Picnic Table', by: 'Ulan Cabanilla' },
  outdoor_table_chair_set_01: { kind: 'model', name: 'Outdoor Table Chair Set 01', by: 'James Ray Cock' },
  potted_plant_01: { kind: 'model', name: 'Potted Plant 01', by: 'Rico Cilliers' },
  potted_plant_02: { kind: 'model', name: 'Potted Plant 02', by: 'Rico Cilliers' },
  potted_plant_04: { kind: 'model', name: 'Potted Plant 04', by: 'James Ray Cock' },
  ceramic_vase_04: { kind: 'model', name: 'Ceramic Vase 04', by: 'James Ray Cock' },
  oak_veneer_01: { kind: 'texture', name: 'Oak Veneer 01', by: 'Jenelle van Heerden' },
  desk_lamp_arm_01: { kind: 'model', name: 'Desk Lamp Arm 01', by: 'Yann Kervran, Kuutti Siitonen' },
};
export type AssetKind = 'hdri' | 'model' | 'texture';
export type AssetResolver = (id: string, kind: AssetKind, res: string) => Promise<{ url?: string; include?: Record<string, string>; maps?: { map: string; rough: string; nor: string } }>;
let resolver: AssetResolver = async (id) => { throw new Error('no asset resolver for ' + id); };
export function setAssetResolver(fn: AssetResolver) { resolver = fn; }
const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
export function loadModel(id) {
  return once('m' + id, async () => {
    const r = await resolver(id, 'model', '1k'), mgr = new THREE.LoadingManager();
    if (r.include) mgr.setURLModifier((u) => { for (const [k, v] of Object.entries(r.include)) if (u.endsWith(k)) return v; return u; });
    const g = await new GLTFLoader(mgr).loadAsync(r.url);
    // Cached and cloned into every set: marked so a set's teardown never disposes it.
    g.scene.traverse((o) => { o.userData.keep = true; if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    return g.scene;
  });
}
// The sun's direction is read from the brightest texel, so light and shadow match the sky.
export function loadHdri(id, res = '2k') {
  return once('h' + id + res, async () => {
    const r = await resolver(id, 'hdri', res);
    const t = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(r.url);
    t.mapping = THREE.EquirectangularReflectionMapping;
    const { data, width: W, height: H } = t.image; let best = -1, bi = 0;
    for (let i = 0; i < W * H; i++) { const l = data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722; if (l > best) { best = l; bi = i; } }
    const u = ((bi % W) + 0.5) / W, v = 1 - (Math.floor(bi / W) + 0.5) / H, phi = (u - 0.5) * 2 * Math.PI, el = (v - 0.5) * Math.PI;
    return { tex: t, sunAz: Math.atan2(Math.cos(el) * Math.cos(phi), Math.cos(el) * Math.sin(phi)) / D2R, sunEl: el / D2R };
  });
}
// Model in metres to the set in mm, bottom centre on (x, y, z).
function place(parent, src, { x = 0, y = 0, z = 0, ry = 0 } = {}) {
  const g = new THREE.Group(), o = src.clone(true);
  o.scale.setScalar(1000); o.rotation.y = ry * D2R; g.add(o); o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.position.set(x, y, z); parent.add(g); return g;
}
// Height of a table top under the laptop: highest hit on a small grid, so plank gaps do not matter.
function topOf(g) {
  g.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), down = V(0, -1, 0); let top = -Infinity;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    rc.set(V(i * 40, 5000, j * 40), down);
    const h = rc.intersectObject(g, true)[0]; if (h) top = Math.max(top, h.point.y);
  }
  return top;
}

// Oak desk top from a Poly Haven texture set; falls back to flat oak if it cannot load.
function woodMat() {
  return once('woodMat', async () => {
    try {
      const { maps } = await resolver('oak_veneer_01', 'texture', '1k'), tl = new THREE.TextureLoader();
      const [map, rough, nor] = await Promise.all([maps.map, maps.rough, maps.nor].map((u) => tl.loadAsync(u)));
      map.colorSpace = THREE.SRGBColorSpace;
      for (const t of [map, rough, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); t.anisotropy = 8; }
      const m = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, normalMap: nor, roughness: 1 });
      m.userData.keep = true;
      return m;
    } catch (e) { return null; }
  });
}
// 1 Studio: a modern workspace. Real mm; props sit a fixed gap from the laptop's edges.
// The whole set turns with the camera, so the wall is always behind the laptop.
async function workspace(c) {
  const s = c.set, sc = c.scene, { w, d } = c.size, az = c.shot.az ?? 0;
  const [hd, plant, vase, lamp, floorPlant] = await Promise.all([loadHdri('studio_small_09', '1k'), loadModel('potted_plant_04'), loadModel('ceramic_vase_04'), loadModel('desk_lamp_arm_01'), loadModel('potted_plant_01')]);
  s.rotation.y = az * D2R;
  sc.background = new THREE.Color(0xcfc6b9);
  sc.environment = hd.tex; sc.environmentRotation.y = az * D2R;
  const oak = (await woodMat()) || std(0xb98d60, 0.48), steel = std(0x1d1e20, 0.45, 0.7);
  slab(s, -1000, 1000, -32, 0, -640, d / 2 + 170, oak);
  slab(s, -1000, 1000, -33, -32, -640, d / 2 + 170, std(0x6b5238, 0.6), false);
  for (const x of [-900, 880]) { slab(s, x, x + 20, -760, -33, -560, -540, steel); slab(s, x, x + 20, -760, -33, d / 2 + 70, d / 2 + 90, steel); slab(s, x, x + 20, -60, -33, -560, d / 2 + 90, steel); }
  slab(s, -5000, 5000, -760, 2600, -1060, -1040, std(0xcfc6b9, 0.95), false);
  slab(s, -5000, 5000, -760, -660, -1040, -1030, std(0xe2dcd2, 0.8), false);
  ground(s, 14000, -760, std(0x8f8779, 0.75));
  place(s, plant, { x: -(w / 2 + 230), z: -d / 2 - 170, ry: 25 });
  place(s, vase, { x: w / 2 + 250, z: -d / 2 - 260, ry: -30 });
  place(s, lamp, { x: w / 2 + 520, z: -d / 2 - 380, ry: -150 });
  place(s, floorPlant, { x: -1300, y: -760, z: -800, ry: 40 });
  const bk = new THREE.Group(); bk.position.set(w / 2 + 210, 0, d / 2 - 10); bk.rotation.y = 8 * D2R; s.add(bk);
  [[0x7f8f78, 150, 210, 24], [0xd9ccb4, 140, 200, 20], [0x2f3336, 132, 190, 26]].reduce((y, [col, bw, bd, bh], i) => { slab(bk, -bw / 2 + i * 4, bw / 2 + i * 4, y, y + bh, -bd / 2, bd / 2, std(col, 0.8)); return y + bh; }, 0);
  const cup = std(0xeeebe4, 0.35), mx = -(w / 2 + 190), mz = d / 2 - 20;
  rod(s, 42, 96, cup, mx, 48, mz, 'y', 40);
  rod(s, 37, 1, std(0x3b2417, 0.3), mx, 90, mz, 'y', 40);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(24, 6, 12, 32), cup); handle.position.set(mx + 50, 50, mz); handle.castShadow = true; s.add(handle);
  sun(s, 0xfff4e8, 3.0, az - 50, 42, 1300, 7);
  sun(s, 0xe9f0ff, 0.45, az + 70, 20, 1300);
  return { env: 0.45, tone: THREE.ACESFilmicToneMapping, exposure: 1.0 };
}

// 5 Outdoor. Real mm, table top at y 0. The HDRI is the world: projected onto a ground dome,
// and the laptop and table turn so the HDRI's own sun sits just behind the camera.
const OUTDOOR = {
  2006: { hdri: 'greenwich_park', table: 'wooden_picnic_table', ry: 90 },
  2016: { hdri: 'balcony', table: 'outdoor_table_chair_set_01', ry: 90 },
  2026: { hdri: 'roof_garden', table: null, plant: 'potted_plant_02' },
};
async function outdoor(c) {
  const E = OUTDOOR[c.era], s = c.set, sc = c.scene;
  const hd = await loadHdri(E.hdri, '2k');
  let T = 740;
  if (E.table) { const g = place(s, await loadModel(E.table), { ry: E.ry }); T = topOf(g); g.position.y = -T; }
  else {
    slab(s, -400, 400, -12, 0, -400, 400, std(0xb9b2a7, 0.6));
    const steel = std(0x1c1d1f, 0.5, 0.6);
    for (const x of [-380, 355]) for (const z of [-380, 355]) slab(s, x, x + 25, -T, -12, z, z + 25, steel);
  }
  if (E.plant) place(s, await loadModel(E.plant), { x: 750, y: -T, z: -500 });
  const psi = hd.sunAz + 12 - c.shot.az;
  s.rotation.y = psi * D2R; c.laptopRoot.rotation.y = psi * D2R;
  const sky = new GroundedSkybox(hd.tex, 1600, 60000); sky.position.y = -T + 1600; sc.add(sky);
  sc.environment = hd.tex;
  ground(sc, 60000, -T + 1, new THREE.ShadowMaterial({ opacity: 0.42 }));
  const l = new THREE.DirectionalLight(0xfff4e2, 3.2), reach = 1600;
  l.position.copy(dirOf(hd.sunAz, Math.max(hd.sunEl, 12)).multiplyScalar(reach * 4)); sc.add(l, l.target);
  l.castShadow = true; l.shadow.mapSize.set(2048, 2048);
  const cc = l.shadow.camera; cc.left = cc.bottom = -reach; cc.right = cc.top = reach; cc.near = reach; cc.far = reach * 8;
  l.shadow.bias = -0.0003; l.shadow.normalBias = 2.5; l.shadow.radius = 2;
  return { env: 1, tone: THREE.ACESFilmicToneMapping, exposure: 1.0, camAz: psi + c.shot.az, screen: 'test' };
}

// 7 Screen in use. Real mm, desk top at y 0.
const DESK = {
  2006: { top: 0xc9ba9b, rough: 0.6, wall: 0xe3dccb, floor: 0x5e5a55, hemi: [0xfffaf0, 0x6d6558, 0.75], key: [0xf2f6ea, 1.9, -10, 68, 6], fill: [0xffe7c8, 0.7, -75, 25], mouse: 0xd8d5cb, pad: 0x2b3550, cable: true },
  2016: { top: 0xebe9e5, rough: 0.45, wall: 0xc8cbcd, floor: 0x9a8f82, hemi: [0xffffff, 0x8a8480, 0.7], key: [0xffffff, 1.6, -70, 35, 8], fill: [0xffffff, 0.5, 40, 50], mouse: 0xf3f3f1 },
  2026: { top: 0x5b3b28, rough: 0.5, wall: 0x3f4741, floor: 0x2a2622, hemi: [0x6a6660, 0x1c1a18, 0.7], key: [0xffc98f, 1.6, 55, 40, 10], fill: [0xcfe0ff, 0.35, -60, 30], mouse: 0x2b2c2f, mat: 0x35383c },
};
function desk(c) {
  const E = DESK[c.era], s = c.set, { w, d } = c.size;
  c.scene.background = new THREE.Color(E.wall);
  slab(s, -800, 800, -25, 0, -560, d / 2 + 130, std(E.top, E.rough));
  slab(s, -4000, 4000, -760, 2400, -600, -560, std(E.wall, 0.95), false);
  ground(s, 12000, -760, std(E.floor, 0.9));
  for (const x of [-800, 776]) slab(s, x, x + 24, -760, -25, -540, d / 2 + 100, std(E.top, E.rough));
  const mx = w / 2 + 170;
  if (E.pad) slab(s, mx - 115, mx + 115, 0, 3, -60, 130, std(E.pad, 0.9), false);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), std(E.mouse, 0.4));
  mouse.scale.set(31, 17, 56); mouse.position.set(mx, E.pad ? 13 : 10, 30); mouse.castShadow = true; s.add(mouse);
  if (E.cable) rod(s, 2, 520, std(0x9b988f, 0.6), mx, 5, -250, 'z', 10);
  if (E.mat) { slab(s, -450, 450, 0, 2.5, -210, d / 2 + 70, std(E.mat, 1), false); c.laptopRoot.position.y = 2.5; }
  hemi(s, ...E.hemi);
  sun(s, E.key[0], E.key[1], E.key[2], E.key[3], 900, E.key[4]);
  sun(s, E.fill[0], E.fill[1], E.fill[2], E.fill[3], 900);
  return { env: 0.3, screen: c.shotId === 'screen' ? 'sysinfo' : 'bench' };
}

export const SCENES = {
  studio: {
    name: 'Studio product shots', scale: 'real', eras: false, screen: 'wallpaper',
    shots: {
      hero: { lid: 110, az: -32, el: 22, fov: 30, fill: 0.74 },
      rear: { lid: 100, az: 148, el: 20, fov: 30, fill: 0.78 },
      left: { lid: 100, az: -90, el: 8, fov: 30, fill: 0.82 },
      right: { lid: 100, az: 90, el: 8, fov: 30, fill: 0.82 },
      top: { lid: 100, az: 0, el: 78, fov: 30, fill: 0.8, on: 'base' },
      closed: { lid: 0, az: 30, el: 28, fov: 30, fill: 0.72 },
    },
    build: workspace,
  },
  ports: {
    name: 'Port close ups', scale: 'laptop', eras: true,
    shots: {
      left: { lid: 0, az: -90, el: 5, fov: 20, fill: 0.92, on: 'left' },
      right: { lid: 0, az: 90, el: 5, fov: 20, fill: 0.92, on: 'right' },
      rear: { lid: 0, az: 180, el: 5, fov: 20, fill: 0.92, on: 'rear' },
      front: { lid: 0, az: 0, el: 5, fov: 20, fill: 0.92, on: 'front' },
    },
    build: (c) => studioSet(c, PORT_LIGHTS, 0.45),
  },
  teardown: {
    name: 'Teardown', scale: 'real', eras: true,
    shots: { top: { lid: 0, fov: 35, fill: 0.9 } },
    build(c) {
      const T = TEAR[c.era], s = c.set, { w, d, h } = c.size, t = lidThickness(c.size), gap = 60;
      c.scene.background = new THREE.Color(T.bench);
      slab(s, -1800, 1800, -42, -3, -1200, 1200, std(T.bench, T.benchR), false);
      slab(s, -600, 600, -3, 0, -380, 380, std(T.mat, T.matR), false);
      if (T.grid) {
        const [step, col, major, mcol] = T.grid, minor = [], big = [];
        for (let x = -600 + step; x < 600; x += step) (Math.round(x) % major === 0 ? big : minor).push([x - 0.4, x + 0.4, 0, 0.15, -380, 380]);
        for (let z = -380 + step; z < 380; z += step) (Math.round(z + 380) % major === 0 ? big : minor).push([-600, 600, 0, 0.15, z - 0.4, z + 0.4]);
        boxes(s, minor, std(col, T.matR)); if (big.length) boxes(s, big.map((b) => b.map((v, i) => (i === 3 ? 0.2 : v))), std(mcol, T.matR));
      }
      if (T.lip) boxes(s, [[-600, 600, 0, 5, -380, -366], [-600, 600, 0, 5, 366, 380], [-600, -586, 0, 5, -380, 380], [586, 600, 0, 5, -380, 380]], std(T.mat, T.matR), true);
      const lx = -(w + gap) / 2, cx = (w + gap) / 2;
      c.laptopRoot.position.set(lx, h + t, 0); c.laptopRoot.rotation.z = Math.PI;
      c.coverRoot.position.set(cx, 0, 0);
      const steel = std(0x3a3b3d, 0.35, 0.85), slot = std(0x0a0a0a, 1), sz = d / 2 + 34;
      for (let i = 0; i < 8; i++) screw(s, T.screw, cx - w * 0.4 + (i * w * 0.8) / 7, sz, steel, slot);
      const dv = driver(s, T.driver, lx - w * 0.3, d / 2 + 64, -6 * D2R);
      sun(s, T.light, 2.1, -15, 72, 900, 10);
      hemi(s, 0xffffff, 0x8a8580, 0.7);
      const pts = [];
      for (const x of [lx - w / 2, lx + w / 2, cx - w / 2, cx + w / 2]) for (const z of [-d / 2, d / 2]) pts.push(V(x, h + t, z));
      pts.push(V(cx - w * 0.4, 0, sz + 4), V(cx + w * 0.4, 0, sz + 4), ...dv);
      const cam = new THREE.PerspectiveCamera(35, c.aspect, 1, 1000);
      frame(cam, pts, V(0, 1, 0), { fill: 0.9 });
      return { env: 0.3, camera: cam };
    },
  },
  viewing: {
    name: 'Viewing angles', scale: 'laptop', eras: false, screen: 'test',
    shots: {
      centre: { lid: 100, daz: 0, del: 0 }, left: { lid: 100, daz: -45, del: 0 }, right: { lid: 100, daz: 45, del: 0 },
      above: { lid: 100, daz: 0, del: 40 }, below: { lid: 100, daz: 0, del: -25 },
    },
    build(c) {
      const k = c.k, s = c.set, { w, d } = c.size, P = 300 * k;
      c.scene.background = new THREE.Color(0x0a0a0b); c.scene.fog = new THREE.Fog(0x0a0a0b, 1500 * k, 4000 * k);
      slab(s, -4000 * k, 4000 * k, -P - 20, -P, -4000 * k, 4000 * k, std(0x101011, 0.95), false);
      slab(s, -0.3 * w, 0.3 * w, -P, 0, -0.32 * d, 0.28 * d, std(0x171718, 0.7));
      hemi(s, 0x8d939b, 0x0b0b0b, 0.28);
      sun(s, 0xffffff, 0.55, 0, 66, 500 * k, 8);
      const cam = new THREE.PerspectiveCamera(30, c.aspect, 1, 1000), el0 = c.shot.lid - 90;
      const f = frame(cam, laptopPoints(c.size, c.shot.lid, 'screen'), dirOf(0, el0), { fill: 0.6 });
      cam.position.copy(f.target).addScaledVector(dirOf(c.shot.daz, el0 + c.shot.del), f.distance);
      cam.up.set(0, 1, 0); cam.lookAt(f.target); cam.updateProjectionMatrix();
      return { env: 0.15, camera: cam };
    },
  },
  outdoor: {
    name: 'Outdoor', scale: 'real', eras: true, screen: 'test',
    shots: { table: { lid: 105, az: -18, el: 20, fov: 40, fill: 0.56 } },
    build: outdoor,
  },
  thermal: {
    name: 'Thermal camera', scale: 'laptop', eras: false, thermal: true,
    shots: {
      deck: { lid: 100, az: 0, el: 70, fov: 30, fill: 0.88, on: 'base' },
      bottom: { lid: 0, az: 0, el: -90, fov: 30, fill: 0.9, on: 'base' },
    },
    build(c) {
      const k = c.k, s = c.set, { w, d } = c.size, FL = 1500 * k;
      c.scene.background = new THREE.Color(0x0d0e0f);
      slab(s, -6000 * k, 6000 * k, -FL - 20, -FL, -6000 * k, 6000 * k, std(0x141516, 1), false);
      const post = std(0x222326, 0.6, 0.4), pad = std(0x0f0f10, 1);
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        const px = x * (w / 2 - 28 * k), pz = z * (d / 2 - 28 * k);
        rod(s, 4 * k, FL - 3 * k, post, px, -FL / 2 - 1.5 * k, pz, 'y', 12);
        rod(s, 9 * k, 3 * k, pad, px, -1.5 * k, pz, 'y', 20);
      }
      hemi(s, 0x8c8c8c, 0x1a1a1a, 0.35);
      sun(s, 0xffffff, 0.35, -20, 60, 500 * k);
      return { env: 0.1 };
    },
  },
  desk: {
    name: 'Screen in use', scale: 'real', eras: true,
    shots: {
      wide: { lid: 105, az: 0, el: 19, fov: 35, fill: 0.8 },
      screen: { lid: 105, az: 0, el: 15, fov: 35, fill: 0.95, on: 'screen' },
    },
    build: desk,
  },
  size: {
    name: 'Size comparison', scale: 'fixed', eras: false,
    shots: { top: { lid: 0 } },
    build(c) {
      const s = c.set, { d } = c.size;
      c.scene.background = new THREE.Color(0xd4d0ca);
      ground(s, 6000, 0, std(0xd4d0ca, 0.95));
      slab(s, 60, 270, 0, 0.3, 190 - 297, 190, std(0xe9e7e1, 0.9));
      c.laptopRoot.position.set(-175, 0, 190 - d / 2);
      hemi(s, 0xffffff, 0xb8b3ab, 0.8);
      sun(s, 0xffffff, 1.2, -25, 62, 700, 5);
      const hw = 420, hh = hw / c.aspect, cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 10, 5000);
      cam.position.set(0, 2000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
      return { env: 0.25, camera: cam };
    },
  },
};

// Size comparison anchor for rival outlines: same scale, centre x and front edge for everyone.
export const SIZE_FRAME = { widthMm: 840, laptopCentreX: -175, frontEdgeZ: 190, a4: { x0: 60, x1: 270, z0: -107, z1: 190 } };
// Viewing angle composite: 3 x 3 cross, corners left dark.
export const VIEWING_GRID = { cols: 3, rows: 3, gutterPx: 6, fill: '#0a0a0b', cells: { above: [1, 0], left: [0, 1], centre: [1, 1], right: [2, 1], below: [1, 2] } };

export async function buildShot(sceneId, shotId, { era = 2016, size, aspect = 16 / 9 } = {}) {
  const S = SCENES[sceneId], shot = S.shots[shotId];
  const scene = new THREE.Scene(), set = new THREE.Group(), laptopRoot = new THREE.Group(), coverRoot = new THREE.Group();
  set.name = 'set'; laptopRoot.name = 'laptop'; coverRoot.name = 'cover';
  scene.add(set, laptopRoot, coverRoot);
  const c = { scene, set, laptopRoot, coverRoot, size, era: eraOf(era), k: size.w / 340, shot, shotId, aspect };
  const out = (await S.build(c)) || {};
  laptopRoot.updateMatrix(); coverRoot.updateMatrix();
  let camera = out.camera;
  if (!camera) {
    camera = new THREE.PerspectiveCamera(shot.fov, aspect, 1, 1000);
    const pts = laptopPoints(size, shot.lid, shot.on || 'all').map((p) => p.applyMatrix4(laptopRoot.matrix));
    frame(camera, pts, dirOf(out.camAz ?? shot.az ?? 0, shot.el ?? 0), { fill: shot.fill });
  }
  return { scene, camera, lid: shot.lid, laptopRoot, coverRoot: sceneId === 'teardown' ? coverRoot : null, env: out.env ?? 0.3, screen: out.screen ?? S.screen ?? null, thermal: !!S.thermal, toneMapping: out.tone ?? THREE.NoToneMapping, exposure: out.exposure ?? 1 };
}
