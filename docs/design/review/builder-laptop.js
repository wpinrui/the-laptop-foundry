import * as THREE from 'https://esm.sh/three@0.170.0';
import { RoundedBoxGeometry } from 'https://esm.sh/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';

// <builder-laptop>: the builder's customisable laptop on the Foundry plinth. Renders once per
// attribute change. Sizes in mm unless noted; scene units are metres.
const MAXW = 1440, MAXH = 810;
const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
R.setPixelRatio(1); R.setSize(MAXW, MAXH, false); R.outputColorSpace = THREE.SRGBColorSpace;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.setScissorTest(true);
const ENV = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;
const ACC = 0xf0913d, WARN = 0xe8c25a;
const mm = (v) => v / 1000;
const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const ROWS = [
  [['esc', 1, 'a'], ...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'.split(' ').map((k) => [k, 1, 'f']), ['del', 2, 'm']],
  [...'` 1 2 3 4 5 6 7 8 9 0 - ='.split(' ').map((k) => [k, 1]), ['back', 2, 'm']],
  [['tab', 1.5, 'm'], ...'Q W E R T Y U I O P [ ]'.split(' ').map((k) => [k, 1]), ['\\', 1.5]],
  [['caps', 1.75, 'm'], ...'A S D F G H J K L ; \''.split(' ').map((k) => [k, 1]), ['enter', 2.25, 'a']],
  [['shift', 2.25, 'm'], ...'Z X C V B N M , . /'.split(' ').map((k) => [k, 1]), ['shift', 2.75, 'm']],
  [['ctrl', 1, 'm'], ['fn', 1, 'm'], ['opt', 1, 'm'], ['alt', 1.25, 'm'], ['', 5.5, 's'], ['alt', 1.25, 'm'], ['ctrl', 1, 'm'], ['<', 1, 'm'], ['^', 1, 'm'], ['>', 1, 'm']],
];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// The review page as it appears on the laptop's own screen. state: load | rating | page.
function reviewPage(g, W, H, o) {
  const era = +o.era || 2026, st = o.state || 'page', sc = +o.score || 0;
  const tone = sc >= 90 ? '#1f8f7a' : sc >= 80 ? '#3f9d5a' : sc >= 70 ? '#d99a2b' : '#c9463d';
  const line = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const text = (t, x, y, font, c, al = 'left') => { g.font = font; g.fillStyle = c; g.textAlign = al; g.textBaseline = 'alphabetic'; g.fillText(t, x, y); };
  const para = (x, y, w, n, c, lh = 22) => { for (let i = 0; i < n; i++) line(x, y + i * lh, i === n - 1 ? w * 0.6 : w * (0.9 + ((i * 37) % 10) / 100), 8, c); };
  const photo = (x, y, w, h) => { const r = g.createLinearGradient(x, y, x + w, y + h); r.addColorStop(0, era === 2006 ? '#d8dde4' : '#d9d4cc'); r.addColorStop(1, era === 2006 ? '#9aa6b5' : '#8e8779'); g.fillStyle = r; g.fillRect(x, y, w, h); line(x + w * 0.28, y + h * 0.38, w * 0.44, h * 0.36, 'rgba(40,40,44,0.55)'); line(x + w * 0.22, y + h * 0.74, w * 0.56, h * 0.05, 'rgba(40,40,44,0.7)'); };
  const ring = (cx, cy, r, big) => {
    g.lineWidth = r * 0.16; g.strokeStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (st !== 'load') { g.strokeStyle = tone; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sc / 100); g.stroke();
      text(sc.toFixed(1), cx, cy + r * 0.18, `800 ${Math.round(r * 0.52)}px system-ui`, tone, 'center'); }
    if (big && sc >= 90 && st !== 'load') { g.save(); g.globalAlpha = 0.25; g.lineWidth = r * 0.5; g.strokeStyle = '#ffd766'; g.beginPath(); g.arc(cx, cy, r * 1.25, 0, Math.PI * 2); g.stroke(); g.restore(); }
  };
  if (era === 2006) {
    line(0, 0, W, H, '#e9edf2'); const m = g.createLinearGradient(0, 0, 0, 84); m.addColorStop(0, '#6f9fd8'); m.addColorStop(1, '#1d4f91'); g.fillStyle = m; g.fillRect(40, 10, W - 80, 84);
    text('Notebookcheck', 58, 58, 'italic 700 34px Georgia', '#fff'); for (let i = 0; i < 5; i++) line(58 + i * 104, 70, 96, 24, '#fff');
    line(40, 94, W - 80, H, '#fff'); if (st === 'load') { line(40, H - 18, (W - 80) * 0.45, 18, '#1d4f91'); return; }
    text('Review Northfold ' + (o.name || ''), 60, 140, '700 26px Verdana', '#1d4f91'); para(60, 170, 760, 6, '#b8bec8'); photo(860, 120, 340, 200);
    line(60, 320, 760, 26, '#f2f5f9'); line(60, 320, 6, 26, '#1d4f91'); para(60, 370, 760, 8, '#b8bec8');
    line(880, 350, 300, 180, '#fff'); g.strokeStyle = '#b9c6d6'; g.lineWidth = 2; g.strokeRect(880, 350, 300, 180); line(880, 350, 300, 30, '#1d4f91');
    if (st !== 'load') text(Math.round(sc) + '%', 1030, 470, '700 64px Georgia', tone, 'center');
    return;
  }
  if (era === 2016) {
    line(0, 0, W, H, '#f4f4f4'); line(0, 0, W, 60, '#2b2f36'); text('Notebookcheck', 40, 40, '800 26px system-ui', '#fff'); line(40, 48, 196, 4, '#e5532d');
    if (st === 'load') { line(0, 60, W * 0.38, 4, '#e5532d'); return; }
    photo(0, 60, W, 330); const s2 = g.createLinearGradient(0, 200, 0, 390); s2.addColorStop(0, 'rgba(0,0,0,0)'); s2.addColorStop(1, 'rgba(0,0,0,0.7)'); g.fillStyle = s2; g.fillRect(0, 200, W, 190);
    line(80, 300, 70, 20, '#e5532d'); text('Northfold ' + (o.name || '') + ' review', 80, 360, '300 40px system-ui', '#fff');
    line(60, 410, 800, H, '#fff'); para(100, 450, 700, 12, '#c9c9c9', 24); line(900, 420, 320, 300, '#fff'); ring(1060, 540, 70);
    return;
  }
  line(0, 0, W, H, '#fbfaf7'); text('Notebookcheck', 60, 50, '900 28px system-ui', '#111'); line(0, 76, W, 2, '#e6e3dc');
  if (st === 'load') { line(0, 76, W * 0.3, 3, '#3b5bdb'); return; }
  text('REVIEW', 60, 130, '700 16px system-ui', '#3b5bdb');
  text('Northfold ' + (o.name || '') + ' review:', 60, 185, '800 44px system-ui', '#111'); text(sc < 70 ? 'too hot to live with' : 'the quiet overachiever', 60, 237, '800 44px system-ui', '#111');
  para(60, 280, 700, 3, '#c8c3b8', 26);
  if (st === 'rating') { para(60, 380, 700, 10, '#d8d3c8', 26); } else { photo(60, 370, 760, 380); }
  line(880, 120, 340, 440, '#fff'); g.strokeStyle = '#e6e3dc'; g.lineWidth = 2; g.strokeRect(880, 120, 340, 440); ring(1050, 280, 100, true);
  for (let i = 0; i < 6; i++) { line(920, 430 + i * 20, 90, 7, '#c8c3b8'); line(1030, 430 + i * 20, 150, 7, 'rgba(0,0,0,0.07)'); if (st !== 'load') line(1030, 430 + i * 20, 150 * (0.72 + ((i * 29) % 25) / 100), 7, tone); }
}
function screenTex(kind, ratio, name, o = {}) {
  const W = 1280, H = Math.round(W / ratio), [c, g] = canvas(W, H);
  if (kind === 'review') { reviewPage(g, W, H, { ...o, name }); return tex(c); }
  if (kind === 'off') { g.fillStyle = '#050608'; g.fillRect(0, 0, W, H); const l = g.createLinearGradient(0, 0, W, H); l.addColorStop(0, 'rgba(255,255,255,0.05)'); l.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = l; g.fillRect(0, 0, W, H); }
  else if (kind === 'boot') {
    const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6); r.addColorStop(0, '#2a1b10'); r.addColorStop(1, '#070504'); g.fillStyle = r; g.fillRect(0, 0, W, H);
    g.fillStyle = '#efe6dc'; g.font = `700 ${Math.round(H * 0.13)}px "Barlow Condensed"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name.toUpperCase(), W / 2, H * 0.46);
    g.fillStyle = 'rgba(239,230,220,0.18)'; g.fillRect(W * 0.4, H * 0.62, W * 0.2, 4); g.fillStyle = '#f0913d'; g.fillRect(W * 0.4, H * 0.62, W * 0.13, 4);
  } else if (kind === 'grid') {
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(240,145,61,0.55)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += W / 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += W / 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = '#efe6dc'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    g.beginPath(); g.arc(W / 2, H / 2, H * 0.36, 0, Math.PI * 2); g.stroke();
  } else {
    const r = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W); r.addColorStop(0, '#8a5a36'); r.addColorStop(1, '#1b120c'); g.fillStyle = r; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(16,12,10,0.85)'; g.fillRect(0, H - 34, W, 34);
  }
  return tex(c);
}

function legendTex(kbW, kbD, u, o) {
  const S = 2400 / kbW, [c, g] = canvas(2400, Math.round(kbD * S));
  g.fillStyle = o.legend; g.textBaseline = 'middle';
  let z = 0;
  ROWS.forEach((row, ri) => {
    const rh = (ri === 0 ? 0.6 : 1) * u; let x = 0;
    row.forEach(([k, w, t]) => {
      const kw = w * u, pad = u * 0.2, small = t === 'm' || t === 'a' || t === 'f' || k.length > 1;
      g.font = `${o.weight} ${Math.round((small ? 0.22 : 0.36) * u * S * o.lsize)}px "${o.font}"`;
      const al = t === 's' ? 'c' : o.align;
      g.textAlign = al === 'c' ? 'center' : 'left';
      const lx = al === 'c' ? x + kw / 2 : x + pad, ly = al === 'c' ? z + rh / 2 : al === 'tl' ? z + pad + u * 0.1 : z + rh - pad - u * 0.1;
      const txt = o.caps === 'lower' ? k.toLowerCase() : k.length > 1 && o.caps === 'upper' ? k.toUpperCase() : k;
      g.fillText(txt, lx * S, ly * S);
      x += kw;
    });
    z += rh;
  });
  return tex(c);
}

function decalCanvas(Wm, Hm, items) {
  const S = 2048 / Wm, [c, g] = canvas(2048, Math.round(Hm * S)), boxes = [];
  for (const d of items) {
    const px = d.x * Wm * S, py = d.y * Hm * S, size = mm(d.size) * S;
    g.save(); g.translate(px, py); g.fillStyle = d.color; g.strokeStyle = d.color;
    let w = 0, h = size;
    if (d.mark) {
      const m = size * 1.5; g.lineWidth = m * 0.14; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(-m * 0.5, m * 0.28); g.lineTo(0, -m * 0.34); g.lineTo(m * 0.5, m * 0.28); g.stroke();
      g.beginPath(); g.moveTo(-m * 0.22, m * 0.28); g.lineTo(0, -m * 0.02); g.lineTo(m * 0.22, m * 0.28); g.stroke();
      w = m; h = m;
      if (d.text) { g.translate(0, m * 0.95); }
    }
    if (d.text) {
      g.font = `${d.weight || 700} ${Math.round(size)}px "${d.font}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (d.spacing) g.letterSpacing = `${d.spacing * size}px`;
      g.fillText(d.text, 0, 0); w = Math.max(w, g.measureText(d.text).width); h = d.mark ? h + size * 1.4 : size;
    }
    g.restore();
    boxes.push({ x: d.x, y: d.mark && d.text ? d.y + (h / 2 - size * 1.5 / 2) / (Hm * S) : d.y, w: (w * 1.12) / (Wm * S), h: (h * 1.25) / (Hm * S) });
  }
  return { t: tex(c), boxes };
}

function outline(w, d, y = 0) {
  const g = new THREE.BufferGeometry().setFromPoints([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: ACC, depthTest: false }));
}
function handles(parent, w, d, y, axis) {
  const m = new THREE.MeshBasicMaterial({ color: ACC, depthTest: false }), s = mm(3.2);
  const pts = axis === 'z' ? [[0, -d / 2], [0, d / 2]] : axis === 'x' ? [[-w / 2, 0], [w / 2, 0]] : [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (const [x, z] of pts) { const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s), m); b.position.set(x, y, z); b.renderOrder = 10; parent.add(b); }
}
function dashed(parent, a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: ACC, dashSize: mm(3), gapSize: mm(2.5), depthTest: false, transparent: true, opacity: 0.8 }));
  l.computeLineDistances(); l.renderOrder = 9; parent.add(l);
}

// Double-headed drag arrow, one per degree of freedom. hot: the axis being dragged.
function arrow(parent, at, dir, reach, hot) {
  const g = new THREE.Group(), col = hot ? 0xfff1e0 : ACC, m = new THREE.MeshBasicMaterial({ color: col, depthTest: false });
  const r = mm(0.55), cr = mm(2.1), ch = mm(4.2), gap = mm(4.5);
  for (const sgn of [-1, 1]) {
    const len = reach - gap - ch;
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m); sh.position.y = sgn * (gap + len / 2); g.add(sh);
    const cn = new THREE.Mesh(new THREE.ConeGeometry(cr, ch, 18), m); cn.position.y = sgn * (reach - ch / 2); if (sgn < 0) cn.rotation.z = Math.PI; g.add(cn);
  }
  const dot = new THREE.Mesh(new THREE.SphereGeometry(mm(1.3), 14, 10), m); g.add(dot);
  g.traverse((o) => { o.renderOrder = 12; });
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); g.position.copy(at); parent.add(g); return g;
}
function portMesh(kind, H, mat) {
  const hh = Math.min(H * 0.5, mm(7));
  const dims = { usbc: [8.4, 2.6, 1], usba: [12, 4.5, 0], hdmi: [14, 4.5, 0], jack: [3.6, 3.6, 1], sd: [22, 2.2, 0], dc: [5.5, 5.5, 1], rj45: [15, 11, 0] }[kind] || [8, 3, 0];
  const w = mm(dims[0]), h = Math.min(mm(dims[1]), hh);
  const geo = dims[2] ? new RoundedBoxGeometry(w, h, mm(1), 4, h / 2.05) : new THREE.BoxGeometry(w, h, mm(1));
  const m = new THREE.Mesh(geo, mat); m.userData.size = [w, h]; return m;
}

function build(el) {
  const A = (n, d) => { const v = el.getAttribute(n); return v === null || v === '' ? d : v; }, N = (n, d) => +A(n, d);
  const scene = new THREE.Scene();
  const bg = 0x14100d; scene.background = new THREE.Color(bg); scene.fog = new THREE.Fog(bg, 1.4, 3.6);
  scene.environment = ENV; scene.environmentIntensity = 0.3;
  const [rw, rh] = A('ratio', '16:10').split(':').map(Number), ratio = rw / rh, diag = N('diag', 14) * 0.0254;
  const sw = diag * ratio / Math.hypot(ratio, 1), sh = sw / ratio;
  const bez = mm(N('bezel', 5)), chin = mm(N('chin', bez * 1000 + 7)), top = mm(N('bezel-top', bez * 1000 + 2));
  const W = Math.max(sw + 2 * bez, mm(N('min-w', 0))), L = sh + top + chin, D = L, H = mm(N('thick', 16)), LT = mm(N('lid-t', 5));
  const sel = A('select', ''), xray = A('xray', '') !== '' ? A('xray', 'on') : null;
  const bodyCol = A('color', '#3d3f43'), deckCol = A('deck', bodyCol), finish = A('finish', 'metal');
  const fin = { metal: [0.75, 0.34], matte: [0.05, 0.62], glossy: [0.1, 0.12], soft: [0, 0.85] }[finish] || [0.75, 0.34];
  const mk = (c) => { const m = std(c, fin[1], fin[0]); if (xray) { m.transparent = true; m.opacity = 0.14; m.depthWrite = false; } return m; };
  const body = mk(bodyCol), deck = mk(deckCol);

  // Plinth, sized to the laptop.
  const pr = Math.max(W, D) * 0.84;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), std(0x1c1712, 0.9)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr * 1.03, 0.05, 96), std(0x241d17, 0.55, 0.3)); plinth.position.y = 0.025; plinth.castShadow = plinth.receiveShadow = true; scene.add(plinth);
  scene.add(new THREE.HemisphereLight(0x4a382a, 0x0a0806, 0.7));
  const key = new THREE.DirectionalLight(0xffb27a, 2.6); key.position.set(-1.1, 1.7, 0.9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.5, far: 5 }); key.shadow.bias = -0.0004; key.shadow.radius = 4; scene.add(key);
  const rim = new THREE.DirectionalLight(0x86a2ff, 1.1); rim.position.set(1.4, 0.8, -1.3); scene.add(rim);
  const front = new THREE.DirectionalLight(0xffe6cc, N('fill', 0.5)); front.position.set(0.2, 1.2, 1.6); scene.add(front);
  const pool = new THREE.SpotLight(0xffb27a, 5, 3, 0.55, 0.7, 1.5); pool.position.set(0.1, 1.6, 0.4); scene.add(pool, pool.target);

  const lap = new THREE.Group(); lap.position.y = 0.05; scene.add(lap);
  const base = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, Math.min(mm(5), H / 2.3)), deck); base.position.y = H / 2; base.castShadow = !xray; base.receiveShadow = true; lap.add(base);
  const dy = H + mm(0.3);

  // Keyboard.
  const kbW = Math.min(W * 0.9, mm(N('kb-w', 285))), u = kbW / 15, kbD = 5.6 * u;
  const kbZ = -D / 2 + mm(14) + kbD / 2 + mm(N('kb-y', 0));
  const shape = A('keys', 'rounded'), capCol = A('keycap', '#1a1b1e'), modCol = A('keymod', capCol), accCol = A('keyacc', modCol);
  if (!xray) {
    const well = new THREE.Mesh(new THREE.PlaneGeometry(kbW + mm(3), kbD + mm(3)), std(0x0b0c0d, 0.9)); well.rotation.x = -Math.PI / 2; well.position.set(0, dy - mm(0.2), kbZ); lap.add(well);
    const kh = mm(1.4), geos = new Map(), mats = { n: std(capCol, 0.5), m: std(modCol, 0.5), a: std(accCol, 0.45), f: std(modCol, 0.5), s: std(capCol, 0.5) };
    let z = -kbD / 2;
    ROWS.forEach((row, ri) => {
      const rhh = (ri === 0 ? 0.6 : 1) * u; let x = -kbW / 2;
      row.forEach(([k, w, t]) => {
        const kw = w * u, g = shape === 'square' ? 0.1 : shape === 'round' ? 0.16 : 0.13, cw = kw - u * g, cd = rhh - u * g, gk = `${cw.toFixed(5)}_${cd.toFixed(5)}`;
        if (!geos.has(gk)) geos.set(gk, shape === 'square' ? new THREE.BoxGeometry(cw, kh, cd) : new RoundedBoxGeometry(cw, kh, cd, 3, shape === 'round' ? Math.min(cw, cd) / 2.05 : u * 0.16));
        const m = new THREE.Mesh(geos.get(gk), mats[t || 'n']); m.position.set(x + kw / 2, dy + kh / 2, kbZ + z + rhh / 2); m.castShadow = true; lap.add(m);
        x += kw;
      });
      z += rhh;
    });
    const lt = legendTex(kbW, kbD, u, { legend: A('legend', '#e9e2d8'), font: A('legend-font', 'IBM Plex Sans'), align: A('legend-align', 'c'), lsize: N('legend-size', 1), weight: A('legend-weight', '500'), caps: A('legend-case', 'as') });
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(kbW, kbD), new THREE.MeshBasicMaterial({ map: lt, transparent: true, toneMapped: false, opacity: A('backlit', '') !== '' ? 1 : 0.92 }));
    lp.rotation.x = -Math.PI / 2; lp.position.set(0, dy + kh + mm(0.05), kbZ); lap.add(lp);
    // Trackpad.
    const pw = mm(N('pad-w', 120)), pd = mm(N('pad-d', 75)), pz = kbZ + kbD / 2 + mm(12) + pd / 2 + mm(N('pad-y', 0));
    const pad = new THREE.Mesh(new RoundedBoxGeometry(pw, mm(0.3), pd, 3, mm(3)), std(new THREE.Color(deckCol).multiplyScalar(0.86), Math.min(1, fin[1] + 0.12), fin[0] * 0.6)); pad.position.set(0, dy, pz); lap.add(pad);
    if (sel === 'pad' || sel === 'keyboard') {
      const [ow, od, oz] = sel === 'pad' ? [pw + mm(4), pd + mm(4), pz] : [kbW + mm(5), kbD + mm(5), kbZ];
      const o = outline(ow, od, dy + mm(2)); o.position.z = oz; o.renderOrder = 10; lap.add(o);
      const hg = new THREE.Group(); hg.position.z = oz; lap.add(hg); handles(hg, ow, od, dy + mm(2), 'z');
      arrow(lap, new THREE.Vector3(ow / 2 + mm(12), dy + mm(2), oz), new THREE.Vector3(0, 0, 1), mm(20), A('drag', '') === 'z');
      dashed(lap, new THREE.Vector3(0, dy + mm(2), -D / 2 + mm(4)), new THREE.Vector3(0, dy + mm(2), D / 2 - mm(4)));
    }
    el.info = { pz, kbZ, pw, pd };
  }
  // Palm rest decal.
  const palm = A('palm-text', '');
  if (palm && !xray) {
    const pdc = decalCanvas(W, D, [{ text: palm, font: A('palm-font', 'Barlow Condensed'), color: A('palm-color', '#a8998a'), size: N('palm-size', 4), x: N('palm-x', 0.86), y: N('palm-y', 0.92), spacing: 0.12, weight: 600 }]);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: pdc.t, transparent: true, roughness: 0.4, metalness: 0.5 })); p.rotation.x = -Math.PI / 2; p.position.y = dy + mm(0.05); lap.add(p);
    if (sel === 'palm') { const b = pdc.boxes[0], o = outline(b.w * W, b.h * D, dy + mm(1)); o.position.set((b.x - 0.5) * W, 0, (b.y - 0.5) * D); lap.add(o); handles(o, b.w * W, b.h * D, dy + mm(1), 'all'); }
  }
  // Ports.
  const portMat = new THREE.MeshBasicMaterial({ color: 0x030304 });
  A('ports', 'left:usbc:0.3,left:usbc:0.42,left:hdmi:0.58,right:usba:0.4,right:jack:0.78').split(',').filter(Boolean).forEach((s, i) => {
    const [side, kind, f] = s.split(':'), m = portMesh(kind, H, portMat), sx = side === 'left' ? -1 : 1;
    m.rotation.y = Math.PI / 2; m.position.set(sx * (W / 2 - mm(0.3)), H / 2, -D / 2 + +f * D); lap.add(m);
    if (sel === `port:${i}` || sel === `side:${side}`) {
      const [w, h] = m.userData.size, g = new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(sx * (W / 2 + mm(0.8)), H / 2 + b * (h / 2 + mm(1.6)), m.position.z + a * (w / 2 + mm(1.6)))));
      const o = new THREE.Line(g, new THREE.LineBasicMaterial({ color: ACC, depthTest: false })); o.renderOrder = 10; lap.add(o);
      if (sel === `port:${i}`) { const at = new THREE.Vector3(sx * (W / 2 + mm(3)), H / 2, m.position.z), drag = A('drag', ''); arrow(lap, at, new THREE.Vector3(0, 0, 1), mm(22), drag === 'z'); arrow(lap, at, new THREE.Vector3(0, 1, 0), mm(15), drag === 'y'); }
    }
  });
  // Internals, shown in x-ray.
  if (xray) {
    const pick = xray, box = (id, x0, x1, z0, z1, y0, y1, col) => {
      const on = pick === id, m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), on ? std(ACC, 0.5) : std(col, 0.7, 0.2));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); lap.add(m);
      if (on) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xffd0a0 })); e.position.copy(m.position); lap.add(e); }
    };
    const empty = A('empty', '').split(',');
    const X = (f) => f * W, Z = (f) => f * D, y0 = mm(1.5), y1 = H - mm(2);
    box('board', X(-0.44), X(0.44), Z(-0.47), Z(-0.05), y0 + mm(4), y0 + mm(5.2), 0x28332c);
    if (!empty.includes('battery')) box('battery', X(-0.4), X(0.4), Z(0.02), Z(0.46), y0, y1 - mm(2), 0x3a3c40);
    else { const g = outline(X(0.8), Z(0.44), y0); g.position.z = Z(0.24); g.material.color.set(WARN); lap.add(g); }
    if (!empty.includes('cpu')) box('cpu', X(-0.05), X(0.07), Z(-0.33), Z(-0.19), y0 + mm(5.2), y0 + mm(7), 0x16171a);
    else { const g = outline(X(0.12), Z(0.14), y0 + mm(5.3)); g.position.set(X(0.01), 0, Z(-0.26)); g.material.color.set(WARN); lap.add(g); }
    if (!empty.includes('memory')) box('memory', X(0.16), X(0.3), Z(-0.44), Z(-0.12), y0 + mm(5.2), y0 + mm(6.4), 0x1f5a3a);
    else { const g = outline(X(0.14), Z(0.32), y0 + mm(5.3)); g.position.set(X(0.23), 0, Z(-0.28)); g.material.color.set(WARN); lap.add(g); }
    if (!empty.includes('storage')) box('storage', X(-0.34), X(-0.12), Z(-0.14), Z(-0.07), y0 + mm(5.2), y0 + mm(6.6), 0x202226);
    else { const g = outline(X(0.22), Z(0.07), y0 + mm(5.3)); g.position.set(X(-0.23), 0, Z(-0.105)); g.material.color.set(WARN); lap.add(g); }
    const fanOn = pick === 'cooling';
    for (const fx of [-0.34, 0.36]) {
      if (empty.includes('cooling')) { const g = new THREE.Mesh(new THREE.RingGeometry(Z(0.1) - mm(0.6), Z(0.1), 48), new THREE.MeshBasicMaterial({ color: WARN })); g.rotation.x = -Math.PI / 2; g.position.set(X(fx), y0 + mm(0.5), Z(-0.3)); lap.add(g); continue; }
      const f = new THREE.Mesh(new THREE.CylinderGeometry(Z(0.1), Z(0.1), y1 - y0 - mm(1), 40), fanOn ? std(ACC, 0.5) : std(0x1b1c1f, 0.6)); f.position.set(X(fx), (y0 + y1) / 2, Z(-0.3)); lap.add(f);
      const p = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(X(fx) - X(0.01)), mm(1.6), mm(6)), fanOn ? std(0xffc080, 0.3, 0.8) : std(0xb8733a, 0.3, 0.9)); p.position.set((X(fx) + X(0.01)) / 2, y0 + mm(7.5), Z(-0.44)); lap.add(p);
    }
  }
  // Lid, screen, webcam, decals.
  const hinge = new THREE.Group(); hinge.position.set(0, H, -D / 2 + mm(4)); hinge.rotation.x = -THREE.MathUtils.degToRad(N('lid', 108) - 90); lap.add(hinge);
  const lidM = new THREE.Mesh(new RoundedBoxGeometry(W, L, LT, 4, LT / 2.3), body); lidM.position.set(0, L / 2, -LT / 2); lidM.castShadow = !xray; hinge.add(lidM);
  const bz = new THREE.Mesh(new THREE.PlaneGeometry(W - mm(1), L - mm(1)), std(A('bezel-color', '#07080a'), 0.25, 0.3)); bz.position.set(0, L / 2, mm(0.3)); hinge.add(bz);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTex(A('screen', 'off'), ratio, A('name', 'Northfold'), { era: A('review-era', 2026), state: A('review-state', 'page'), score: A('review-score', 0) }), toneMapped: false })); scr.position.set(0, chin + sh / 2, mm(0.6)); hinge.add(scr);
  if (A('screen', 'off') === 'boot' || A('glow', '') !== '') { const gl = new THREE.PointLight(0xffb070, 0.35, 0.9, 2); gl.position.set(0, chin + sh / 2, mm(260)); hinge.add(gl); }
  const cx = mm(N('cam-x', 0)), cam = new THREE.Group(); cam.position.set(cx, L - top / 2, mm(0.7)); hinge.add(cam);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(Math.min(top * 0.32, mm(1.6)), 24), std(0x101a2a, 0.1, 0.6)); cam.add(lens);
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.min(top * 0.32, mm(1.6)), Math.min(top * 0.46, mm(2.4)), 24), std(0x1a1b1e, 0.4)); ring.position.z = -mm(0.05); cam.add(ring);
  if (sel === 'webcam') {
    const s = mm(7), g = new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(a * s, b * s * 0.55, mm(0.5))));
    const o = new THREE.Line(g, new THREE.LineBasicMaterial({ color: ACC, depthTest: false })); o.renderOrder = 10; cam.add(o);
    dashed(hinge, new THREE.Vector3(-W / 2 + mm(4), L - top / 2, mm(1)), new THREE.Vector3(W / 2 - mm(4), L - top / 2, mm(1)));
    arrow(hinge, new THREE.Vector3(cx, L - top / 2, mm(3)), new THREE.Vector3(1, 0, 0), mm(24), A('drag', '') === 'x');
  }
  const bzt = A('bezel-text', '');
  if (bzt) {
    const dc = decalCanvas(W, L, [{ text: bzt, font: A('bezel-font', 'Barlow Condensed'), color: A('bezel-text-color', '#6f655b'), size: N('bezel-size', 3.2), x: 0.5, y: 1 - chin / 2 / L, spacing: 0.2, weight: 600 }]);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ map: dc.t, transparent: true })); p.position.set(0, L / 2, mm(0.5)); hinge.add(p);
  }
  const lidItems = [];
  if (A('decal-text', '') || A('decal-mark', '') !== '') lidItems.push({ text: A('decal-text', ''), mark: A('decal-mark', '') !== '', font: A('decal-font', 'Barlow Condensed'), color: A('decal-color', '#efe6dc'), size: N('decal-size', 9), x: N('decal-x', 0.5), y: N('decal-y', 0.5), spacing: N('decal-spacing', 0.1), weight: A('decal-weight', '700') });
  if (A('decal2-text', '')) lidItems.push({ text: A('decal2-text', ''), font: A('decal2-font', 'IBM Plex Mono'), color: A('decal2-color', '#a8998a'), size: N('decal2-size', 3.2), x: N('decal2-x', 0.5), y: N('decal2-y', 0.9), spacing: 0.08, weight: 500 });
  if (lidItems.length) {
    const dc = decalCanvas(W, L, lidItems);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: dc.t, transparent: true, roughness: 0.35, metalness: 0.6 })); p.rotation.y = Math.PI; p.position.set(0, L / 2, -LT - mm(0.05)); hinge.add(p);
    const si = sel === 'decal' ? 0 : sel === 'decal2' ? 1 : -1;
    if (si >= 0 && dc.boxes[si]) {
      const b = dc.boxes[si], bw = b.w * W, bh = b.h * L, o = new THREE.Group(); o.rotation.y = Math.PI; o.position.set(0, 0, -LT - mm(0.6)); hinge.add(o);
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, c]) => new THREE.Vector3((b.x - 0.5) * W + a * bw / 2, (1 - b.y) * L + c * bh / 2, 0));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ACC, depthTest: false })); line.renderOrder = 10; o.add(line);
      const hm = new THREE.MeshBasicMaterial({ color: ACC, depthTest: false });
      for (const p2 of pts.slice(0, 4)) { const h = new THREE.Mesh(new THREE.PlaneGeometry(mm(3.4), mm(3.4)), hm); h.position.copy(p2); h.renderOrder = 11; o.add(h); }
      const c0 = new THREE.Vector3((b.x - 0.5) * W, (1 - b.y) * L, mm(2)), drag = A('drag', '');
      arrow(o, c0, new THREE.Vector3(1, 0, 0), bw / 2 + mm(16), drag === 'x'); arrow(o, c0, new THREE.Vector3(0, 1, 0), bh / 2 + mm(16), drag === 'y');
      dashed(o, new THREE.Vector3(0, mm(4), 0), new THREE.Vector3(0, L - mm(4), 0));
      dashed(o, new THREE.Vector3(-W / 2 + mm(4), L / 2, 0), new THREE.Vector3(W / 2 - mm(4), L / 2, 0));
    }
  }
  el.dims = { W, D, H, L, sw, sh, chin };
  return { scene, lap, W, D, H, L, sh, chin, kbZ };
}

const VIEWS = {
  hero: { az: -0.62, el: 0.4, k: 2.55, t: (s) => [0, s.H + 0.075, 0] },
  deck: { az: 0, el: 1.12, k: 2.05, t: (s) => [0, s.H, 0.03] },
  keys: { az: 0, el: 1.02, k: 1.22, t: (s) => [0, s.H, s.kbZ + 0.004] },
  lid: { az: Math.PI + 0.42, el: 0.3, k: 2.3, t: (s) => [0, s.H + s.L * 0.4, -s.D / 2 - s.L * 0.12] },
  side: { az: -Math.PI / 2 + 0.34, el: 0.14, k: 0.95, t: (s) => [-s.W / 2, s.H / 2 - 0.035, 0] },
  screen: { az: 0, el: 0.14, k: 2.05, t: (s) => [0, s.H + s.chin + s.sh / 2, -s.D / 2 + 0.02] },
  cpu: { az: -0.55, el: 0.82, k: 0.85, t: (s) => [s.W * 0.01, s.H * 0.55, -s.D * 0.26] },
  xray: { az: -0.42, el: 0.86, k: 2.1, t: (s) => [0, s.H * 0.5, 0.01] },
  front: { az: -0.25, el: 0.32, k: 2.4, t: (s) => [0, s.H + 0.08, 0] },
};

const items = new Set();
let fontsReady = null, busy = false;
class BuilderLaptop extends HTMLElement {
  static get observedAttributes() { return ['view', 'az', 'el', 'zoom', 'shift', 'lift']; }
  connectedCallback() {
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.style.cssText = 'display:block;width:100%;height:100%'; this.appendChild(this.cv); this.ctx = this.cv.getContext('2d'); }
    this.mo = new MutationObserver(() => this.queue()); this.mo.observe(this, { attributes: true });
    items.add(this); this.queue();
  }
  disconnectedCallback() { items.delete(this); this.mo?.disconnect(); }
  queue() { this.dirty = true; pump(); }
  paint() {
    const w = Math.min(MAXW, Math.round(this.clientWidth)), h = Math.min(MAXH, Math.round(this.clientHeight));
    if (!w || !h) return false;
    const s = build(this), A = (n, d) => { const v = this.getAttribute(n); return v === null || v === '' ? d : v; };
    const V = VIEWS[A('view', 'hero')] || VIEWS.hero, az = V.az + +A('az', 0), el = V.el + +A('el', 0), r = Math.max(s.W, s.D) * V.k * +A('zoom', 1);
    const t = V.t(s); t[1] += 0.05 + +A('lift', 0);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.01, 30);
    cam.position.set(t[0] + Math.sin(az) * Math.cos(el) * r, t[1] + Math.sin(el) * r, t[2] + Math.cos(az) * Math.cos(el) * r); cam.lookAt(...t);
    cam.setViewOffset(w, h, -+A('shift', 0) * w, +A('vshift', 0) * h, w, h);
    this.cv.width = w; this.cv.height = h;
    R.setViewport(0, 0, w, h); R.setScissor(0, 0, w, h); R.render(s.scene, cam);
    this.ctx.drawImage(R.domElement, 0, MAXH - h, w, h, 0, 0, w, h);
    s.scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
    return true;
  }
}
customElements.define('builder-laptop', BuilderLaptop);

async function pump() {
  if (busy) return; busy = true;
  fontsReady ??= Promise.all(['700 20px "Barlow Condensed"', '600 20px "Barlow Condensed"', '500 20px "IBM Plex Sans"', '500 20px "IBM Plex Mono"', '500 20px "Space Mono"', '500 20px "Rubik"', '700 20px "Rubik"'].map((f) => document.fonts.load(f))).catch(() => {});
  await fontsReady;
  await new Promise((r) => requestAnimationFrame(r));
  for (const it of items) if (it.dirty && it.isConnected) { try { if (it.paint()) it.dirty = false; } catch (e) { console.error(e); it.dirty = false; } await new Promise((r) => setTimeout(r, 0)); }
  busy = false;
  if ([...items].some((i) => i.dirty)) setTimeout(pump, 200);
}
new ResizeObserver(() => { for (const i of items) i.dirty = true; pump(); }).observe(document.documentElement);
