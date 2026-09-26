(() => {
if (customElements.get('os-art')) return;
// <os-art kind="kiln|ash|site" ...>: the canvases inside the in-game OS mockups.
// kiln: progress (0 to 1), era. Tiles of a rendered still life fill in from the centre.
// ash: era, fps, preset. One deterministic frame of the Ashfall scene.
const TX = 16, TY = 10;
const ORDER = (() => {
  const cx = (TX - 1) / 2, cy = (TY - 1) / 2;
  return Array.from({ length: TX * TY }, (_, i) => i).sort((a, b) => Math.hypot(a % TX - cx, Math.floor(a / TX) - cy) - Math.hypot(b % TX - cx, Math.floor(b / TX) - cy));
})();
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The Kilnbench scene: glazed pots on a shelf in kiln light.
function stillLife(g, w, h) {
  const wall = g.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, '#2a1a12'); wall.addColorStop(0.62, '#6b3a20'); wall.addColorStop(1, '#1a100b');
  g.fillStyle = wall; g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, w * 0.6); glow.addColorStop(0, 'rgba(255,170,90,0.75)'); glow.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a2418'; g.fillRect(0, h * 0.68, w, h * 0.32);
  g.fillStyle = 'rgba(255,200,140,0.25)'; g.fillRect(0, h * 0.68, w, h * 0.012);
  const pot = (x, y, rw, rh, c1, c2) => {
    const gr = g.createRadialGradient(x - rw * 0.35, y - rh * 0.3, rw * 0.05, x, y, rw * 1.1); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x + rw * 0.2, h * 0.69, rw * 1.05, rh * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x - rw * 0.32, y - rh * 1.2, rw * 0.64, rh * 0.5);
    g.fillStyle = 'rgba(255,240,220,0.55)'; g.beginPath(); g.ellipse(x - rw * 0.4, y - rh * 0.35, rw * 0.12, rh * 0.28, -0.4, 0, Math.PI * 2); g.fill();
  };
  pot(w * 0.28, h * 0.54, w * 0.1, h * 0.15, '#9ec9c0', '#1f4a45');
  pot(w * 0.52, h * 0.5, w * 0.13, h * 0.19, '#f3c27a', '#7a3b12');
  pot(w * 0.75, h * 0.57, w * 0.07, h * 0.11, '#c7c2e8', '#34305e');
}

function kiln(g, w, h, o) {
  const p = Math.max(0, Math.min(1, +o.progress || 0)), era = +o.era || 2026;
  const empty = era === 2006 ? '#3c3f44' : era === 2016 ? '#232427' : '#18181c';
  g.fillStyle = empty; g.fillRect(0, 0, w, h);
  if (era === 2006) { g.fillStyle = '#34373c'; for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < w; x += 32) g.fillRect(x, y, 16, 16); }
  const done = Math.floor(p * TX * TY), tw = w / TX, th = h / TY;
  const off = document.createElement('canvas'); off.width = w; off.height = h; stillLife(off.getContext('2d'), w, h);
  for (let i = 0; i < done; i++) { const k = ORDER[i], x = (k % TX) * tw, y = Math.floor(k / TX) * th; g.drawImage(off, x, y, tw, th, x, y, tw, th); }
  if (p > 0 && p < 1) {
    const live = era === 2006 ? 2 : era === 2016 ? 4 : 8;
    g.strokeStyle = era === 2026 ? 'rgba(255,255,255,0.9)' : '#ffffff'; g.lineWidth = era === 2006 ? 2 : 1.5;
    for (let j = 0; j < live && done + j < ORDER.length; j++) {
      const k = ORDER[done + j], x = (k % TX) * tw + 3, y = Math.floor(k / TX) * th + 3, a = tw - 6, b = th - 6, c = Math.min(a, b) * 0.28;
      g.beginPath();
      [[x, y, 1, 1], [x + a, y, -1, 1], [x, y + b, 1, -1], [x + a, y + b, -1, -1]].forEach(([px, py, sx, sy]) => { g.moveTo(px + sx * c, py); g.lineTo(px, py); g.lineTo(px, py + sy * c); });
      g.stroke();
    }
  }
}

function ash(g, w, h, o) {
  const era = +o.era || 2026, r = rng(7);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#2b1e2e'); sky.addColorStop(0.55, '#b4583a'); sky.addColorStop(1, '#f0a15c');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.64, h * 0.5, 0, w * 0.64, h * 0.5, h * (era === 2026 ? 0.55 : 0.3));
  sun.addColorStop(0, 'rgba(255,230,170,1)'); sun.addColorStop(0.18, 'rgba(255,200,120,0.9)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const layers = era === 2006 ? 2 : era === 2016 ? 3 : 4, step = era === 2006 ? 48 : era === 2016 ? 16 : 6;
  const cols = ['#6b3440', '#4a2432', '#301a26', '#1a1018'];
  for (let L = 0; L < layers; L++) {
    const base = h * (0.5 + L * 0.1), amp = h * (0.07 - L * 0.01);
    g.fillStyle = cols[L + (4 - layers)];
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w + step; x += step) { const u = x / w + L * 0.37; g.lineTo(x, base + Math.sin(u * 9) * amp + Math.sin(u * 23 + L) * amp * 0.4); }
    g.lineTo(w, h); g.fill();
    if (era === 2026) { const haze = g.createLinearGradient(0, base - amp, 0, base + amp * 2); haze.addColorStop(0, 'rgba(240,160,100,0)'); haze.addColorStop(1, 'rgba(240,160,100,0.12)'); g.fillStyle = haze; g.fillRect(0, base - amp, w, amp * 3); }
  }
  // A walker on the ridge, facing the sun.
  const fx = w * 0.42, fy = h * 0.8;
  g.fillStyle = '#0e080c'; g.beginPath(); g.ellipse(fx, fy - h * 0.09, h * 0.018, h * 0.05, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(fx, fy - h * 0.155, h * 0.017, 0, Math.PI * 2); g.fill();
  g.fillRect(fx - h * 0.012, fy - h * 0.05, h * 0.009, h * 0.055); g.fillRect(fx + h * 0.004, fy - h * 0.05, h * 0.009, h * 0.055);
  const flakes = era === 2006 ? 50 : era === 2016 ? 110 : 220;
  for (let i = 0; i < flakes; i++) {
    const x = r() * w, y = r() * h, s = (era === 2006 ? 2 : 1 + r() * 2.5) * (h / 400);
    g.fillStyle = `rgba(${era === 2026 && r() > 0.7 ? '255,190,120' : '230,215,205'},${0.35 + r() * 0.5})`;
    if (era === 2006) g.fillRect(x, y, s, s); else { g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
  }
  if (era === 2026) { const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = v; g.fillRect(0, 0, w, h); }
  if (+o.fps && +o.fps < 20) { g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }
}

class OsArt extends HTMLElement {
  connectedCallback() {
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.style.cssText = 'display:block;width:100%;height:100%'; this.appendChild(this.cv); }
    this.ro = new ResizeObserver(() => this.paint()); this.ro.observe(this); this.paint();
  }
  disconnectedCallback() { this.ro?.disconnect(); }
  paint() {
    const w = Math.round(this.clientWidth), h = Math.round(this.clientHeight); if (!w || !h) return;
    this.cv.width = w; this.cv.height = h; const g = this.cv.getContext('2d'), o = {};
    for (const a of this.attributes) o[a.name] = a.value;
    ({ kiln, ash })[o.kind]?.(g, w, h, o);
  }
}
customElements.define('os-art', OsArt);
})();
