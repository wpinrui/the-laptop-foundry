import type { Preset } from "../engine/bench";
import type { Era } from "./types";

// What the OS draws in code: the Kilnbench still life as it renders, the
// Ashfall scene, and the boot screen. Canvases, so the live screen and the
// pictures of it in textures and photos draw the same thing.

export const TILES_X = 16;
export const TILES_Y = 10;

/** Renderers spiral out from the centre. */
export const ORDER: number[] = (() => {
  const cx = (TILES_X - 1) / 2;
  const cy = (TILES_Y - 1) / 2;
  const d = (i: number) => Math.hypot((i % TILES_X) - cx, Math.floor(i / TILES_X) - cy);
  return Array.from({ length: TILES_X * TILES_Y }, (_, i) => i).sort((a, b) => d(a) - d(b));
})();

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ Kilnbench

/** The benchmark's scene: glazed pots on a shelf in kiln light. */
function stillLife(g: CanvasRenderingContext2D, w: number, h: number) {
  const wall = g.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, "#2a1a12");
  wall.addColorStop(0.62, "#6b3a20");
  wall.addColorStop(1, "#1a100b");
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, w * 0.6);
  glow.addColorStop(0, "rgba(255,170,90,0.75)");
  glow.addColorStop(1, "rgba(255,170,90,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#3a2418";
  g.fillRect(0, h * 0.68, w, h * 0.32);
  g.fillStyle = "rgba(255,200,140,0.25)";
  g.fillRect(0, h * 0.68, w, h * 0.012);
  // Pots keep their shape on any aspect: sized by the smaller side.
  const s = Math.min(w, h * 1.6);
  const pot = (x: number, y: number, rw: number, rh: number, c1: string, c2: string) => {
    const gr = g.createRadialGradient(x - rw * 0.35, y - rh * 0.3, rw * 0.05, x, y, rw * 1.1);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(x + rw * 0.2, h * 0.69, rw * 1.05, rh * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - rw * 0.32, y - rh * 1.2, rw * 0.64, rh * 0.5);
    g.fillStyle = "rgba(255,240,220,0.55)";
    g.beginPath();
    g.ellipse(x - rw * 0.4, y - rh * 0.35, rw * 0.12, rh * 0.28, -0.4, 0, Math.PI * 2);
    g.fill();
  };
  const base = h * 0.68;
  const at = (k: number) => w / 2 + (k - 0.5) * s;
  pot(at(0.28), base - s * 0.09, s * 0.1, s * 0.094, "#9ec9c0", "#1f4a45");
  pot(at(0.52), base - s * 0.113, s * 0.13, s * 0.119, "#f3c27a", "#7a3b12");
  pot(at(0.75), base - s * 0.069, s * 0.07, s * 0.069, "#c7c2e8", "#34305e");
}

const stills = new Map<string, HTMLCanvasElement>();

function stillOf(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  let c = stills.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) stillLife(g, w, h);
    if (stills.size > 8) stills.clear();
    stills.set(key, c);
  }
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Kilnbench's render area: finished tiles, brackets on the ones still rendering. */
export function paintKiln(g: CanvasRenderingContext2D, W: number, H: number, progress: number, era: Era, u = 1) {
  const p = Math.max(0, Math.min(1, progress));
  g.clearRect(0, 0, W, H);
  g.fillStyle = era === 2006 ? "#3c3f44" : era === 2016 ? "#232427" : "#18181c";
  g.fillRect(0, 0, W, H);
  // 2026 insets the picture in a rounded frame.
  const inset = era === 2026 ? Math.round(16 * u) : 0;
  const x0 = inset;
  const y0 = inset;
  const w = W - inset * 2;
  const h = H - inset * 2;
  if (w <= 0 || h <= 0) return;
  g.save();
  if (era === 2026) {
    roundRect(g, x0, y0, w, h, 8 * u);
    g.clip();
  }
  if (era === 2006) {
    const c = Math.round(16 * u);
    g.fillStyle = "#34373c";
    for (let y = 0; y < H; y += c) for (let x = (y / c) % 2 ? c : 0; x < W; x += c * 2) g.fillRect(x, y, c, c);
  }
  const done = Math.floor(p * TILES_X * TILES_Y);
  const still = stillOf(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const tx = (i: number) => x0 + Math.round((i * w) / TILES_X);
  const ty = (j: number) => y0 + Math.round((j * h) / TILES_Y);
  for (let i = 0; i < done; i++) {
    const k = ORDER[i];
    const cx = k % TILES_X;
    const cy = Math.floor(k / TILES_X);
    const x = tx(cx);
    const y = ty(cy);
    const tw = tx(cx + 1) - x;
    const th = ty(cy + 1) - y;
    g.drawImage(still, x - x0, y - y0, tw, th, x, y, tw, th);
  }
  g.restore();
  if (p <= 0 || p >= 1) return;
  const live = era === 2006 ? 2 : era === 2016 ? 4 : 8;
  g.strokeStyle = era === 2026 ? "rgba(255,255,255,0.9)" : "#ffffff";
  g.lineWidth = (era === 2006 ? 2 : 1.5) * u;
  for (let j = 0; j < live && done + j < ORDER.length; j++) {
    const k = ORDER[done + j];
    const cx = k % TILES_X;
    const cy = Math.floor(k / TILES_X);
    const x = tx(cx) + 3 * u;
    const y = ty(cy) + 3 * u;
    const a = tx(cx + 1) - tx(cx) - 6 * u;
    const b = ty(cy + 1) - ty(cy) - 6 * u;
    const c = Math.min(a, b) * 0.28;
    g.beginPath();
    for (const [px, py, sx, sy] of [
      [x, y, 1, 1],
      [x + a, y, -1, 1],
      [x, y + b, 1, -1],
      [x + a, y + b, -1, -1],
    ]) {
      g.moveTo(px + sx * c, py);
      g.lineTo(px, py);
      g.lineTo(px, py + sy * c);
    }
    g.stroke();
  }
}

// ------------------------------------------------------------------ Ashfall

const PRESET_DETAIL: Record<Preset, number> = { low: 0.5, medium: 0.75, high: 1, ultra: 1.3 };

/**
 * One frame of Ashfall: a walker on a ridge facing the sun through falling
 * ash. `detail` is the edition's era, so older editions look older; `t` is
 * the game clock in seconds.
 */
export function paintAsh(g: CanvasRenderingContext2D, w: number, h: number, detail: Era, preset: Preset, t: number) {
  const k = PRESET_DETAIL[preset];
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#2b1e2e");
  sky.addColorStop(0.55, "#b4583a");
  sky.addColorStop(1, "#f0a15c");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.64, h * 0.5, 0, w * 0.64, h * 0.5, h * (detail === 2026 ? 0.55 : 0.3));
  sun.addColorStop(0, "rgba(255,230,170,1)");
  sun.addColorStop(0.18, "rgba(255,200,120,0.9)");
  sun.addColorStop(1, "rgba(255,160,90,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
  const layers = detail === 2006 ? 2 : detail === 2016 ? 3 : 4;
  const step = ((detail === 2006 ? 48 : detail === 2016 ? 16 : 6) * w) / 1300 / Math.min(1, k * 1.2);
  const cols = ["#6b3440", "#4a2432", "#301a26", "#1a1018"];
  for (let L = 0; L < layers; L++) {
    const base = h * (0.5 + L * 0.1);
    const amp = h * (0.07 - L * 0.01);
    const drift = t * (0.006 + L * 0.01);
    g.fillStyle = cols[L + (4 - layers)];
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w + step; x += step) {
      const u = x / w + L * 0.37 + drift;
      g.lineTo(x, base + Math.sin(u * 9) * amp + Math.sin(u * 23 + L) * amp * 0.4);
    }
    g.lineTo(w, h);
    g.fill();
    if (detail === 2026) {
      const haze = g.createLinearGradient(0, base - amp, 0, base + amp * 2);
      haze.addColorStop(0, "rgba(240,160,100,0)");
      haze.addColorStop(1, "rgba(240,160,100,0.12)");
      g.fillStyle = haze;
      g.fillRect(0, base - amp, w, amp * 3);
    }
  }
  // The walker on the ridge, facing the sun.
  const fx = w * 0.42;
  const fy = h * 0.8;
  g.fillStyle = "#0e080c";
  g.beginPath();
  g.ellipse(fx, fy - h * 0.09, h * 0.018, h * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(fx, fy - h * 0.155, h * 0.017, 0, Math.PI * 2);
  g.fill();
  g.fillRect(fx - h * 0.012, fy - h * 0.05, h * 0.009, h * 0.055);
  g.fillRect(fx + h * 0.004, fy - h * 0.05, h * 0.009, h * 0.055);
  // Ash falls and drifts; each flake keeps its lane.
  const r = rng(7);
  const flakes = Math.round((detail === 2006 ? 50 : detail === 2016 ? 110 : 220) * k);
  for (let i = 0; i < flakes; i++) {
    const lx = r();
    const ly = r();
    const size = (detail === 2006 ? 2 : 1 + r() * 2.5) * (h / 400);
    const warm = detail === 2026 && r() > 0.7;
    const a = 0.35 + r() * 0.5;
    const fall = 0.04 + r() * 0.05;
    const x = (((lx + t * 0.012 + Math.sin(t * 0.7 + i) * 0.004) % 1) + 1) % 1;
    const y = (ly + t * fall) % 1;
    g.fillStyle = `rgba(${warm ? "255,190,120" : "230,215,205"},${a.toFixed(2)})`;
    if (detail === 2006) g.fillRect(x * w, y * h, size, size);
    else {
      g.beginPath();
      g.arc(x * w, y * h, size, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (detail === 2026) {
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
}

// ------------------------------------------------------------------ boot

/** How long the maker's name holds on black, then the whole boot, in ms. */
export const BOOT_NAME_MS = 1400;
export const BOOT_MS = 3600;

/** The OS mark: a rounded square with a diamond in it, centred on (x, y). */
export function drawMark(g: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  const b = size * 0.13;
  g.save();
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = b;
  roundRect(g, x - size / 2 + b / 2, y - size / 2 + b / 2, size - b, size - b, size * 0.32 - b / 2);
  g.stroke();
  g.translate(x, y);
  g.rotate(Math.PI / 4);
  const d = size * 0.4;
  roundRect(g, -d / 2, -d / 2, d, d, size * 0.1);
  g.fill();
  g.restore();
}

export const OS_FONT: Record<Era, string> = {
  2006: '"Noto Sans", sans-serif',
  2016: '"Open Sans", sans-serif',
  2026: '"Figtree", sans-serif',
};

/** 2026: the maker's name, then an arc spinner turning under it. */
function bootDark(g: CanvasRenderingContext2D, W: number, H: number, maker: string, font: string, ms: number, u: number) {
  g.globalAlpha = Math.min(1, ms / 400);
  g.fillStyle = "#fff";
  g.font = `600 ${Math.round(50 * u)}px ${font}`;
  g.letterSpacing = `${(11 * u).toFixed(1)}px`;
  // Letter spacing trails the last letter; half of it nudges the name back to centre.
  g.fillText(maker.toUpperCase(), W / 2 + 5.5 * u, H * 0.44);
  g.letterSpacing = "0px";
  if (ms >= BOOT_NAME_MS) {
    const t = ms - BOOT_NAME_MS;
    g.globalAlpha = Math.min(1, t / 300);
    const x = W / 2;
    const y = H * 0.74;
    const r = 18.25 * u;
    const a = (t / 1000) * Math.PI * 2.4;
    g.lineWidth = 3.5 * u;
    g.lineCap = "round";
    g.strokeStyle = "rgba(255,255,255,0.14)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#fff";
    g.beginPath();
    g.arc(x, y, r, a, a + Math.PI * 0.55);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.beginPath();
    g.arc(x, y, r, a + Math.PI * 0.55, a + Math.PI * 0.9);
    g.stroke();
    g.lineCap = "butt";
  }
  g.globalAlpha = 1;
}

/** 2016: a glossy orb with a ring of dots turning under it, the maker below. */
function bootGlass(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  H: number,
  maker: string,
  font: string,
  t: number,
  u: number,
) {
  const r = 60 * u;
  const oy = cy - 50 * u;
  const halo = g.createRadialGradient(cx, oy, r * 0.6, cx, oy, r * 2.2);
  halo.addColorStop(0, "rgba(80,170,255,0.45)");
  halo.addColorStop(1, "rgba(80,170,255,0)");
  g.fillStyle = halo;
  g.fillRect(cx - r * 2.4, oy - r * 2.4, r * 4.8, r * 4.8);
  const orb = g.createRadialGradient(cx, oy - r * 0.4, 0, cx, oy, r);
  orb.addColorStop(0, "#d6f3ff");
  orb.addColorStop(0.34, "#4aa3e6");
  orb.addColorStop(0.62, "#1b5aa8");
  orb.addColorStop(1, "#0a2448");
  g.fillStyle = orb;
  g.beginPath();
  g.arc(cx, oy, r, 0, Math.PI * 2);
  g.fill();
  const gloss = g.createLinearGradient(0, oy - r, 0, oy);
  gloss.addColorStop(0, "rgba(255,255,255,0.65)");
  gloss.addColorStop(1, "rgba(255,255,255,0.05)");
  g.fillStyle = gloss;
  g.beginPath();
  g.ellipse(cx, oy - r * 0.45, r * 0.77, r * 0.46, 0, 0, Math.PI * 2);
  g.fill();
  drawMark(g, cx, oy, 52 * u, "#fff");
  // Six dots chase round a ring, fading behind the leader.
  const ry = oy + r + 56 * u + 22 * u;
  const lead = (t / 1000) * Math.PI * 1.6;
  for (let k = 0; k < 6; k++) {
    const a = lead - k * 0.55;
    g.fillStyle = `rgba(255,255,255,${(1 - k * 0.14).toFixed(2)})`;
    g.beginPath();
    g.arc(cx + Math.sin(a) * 17 * u, ry - Math.cos(a) * 17 * u, 3 * u, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.font = `700 ${Math.round(22 * u)}px ${font}`;
  g.letterSpacing = `${(3.5 * u).toFixed(1)}px`;
  g.textAlign = "center";
  g.fillText(maker.toUpperCase(), cx, H - 51 * u);
  g.letterSpacing = "0px";
}

/**
 * The boot screen at `ms` into the boot: the maker's name on black, then the
 * era's loader. `u` is canvas pixels per logical pixel.
 */
export function paintBoot(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  era: Era,
  maker: string,
  wordmark: string,
  ms: number,
  u: number,
) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const font = OS_FONT[era];
  g.textAlign = "center";
  g.textBaseline = "middle";
  const cx = W / 2;
  const cy = H / 2;
  if (era === 2026) {
    bootDark(g, W, H, maker, font, ms, u);
    return;
  }
  if (ms < BOOT_NAME_MS) {
    // The maker's name fades up and holds.
    g.globalAlpha = Math.min(1, ms / 400);
    g.fillStyle = "#fff";
    g.font = `600 ${Math.round(44 * u)}px ${font}`;
    g.letterSpacing = `${Math.round(10 * u)}px`;
    g.fillText(maker.toUpperCase(), cx, cy);
    g.letterSpacing = "0px";
    g.globalAlpha = 1;
    return;
  }
  const t = ms - BOOT_NAME_MS;
  g.globalAlpha = Math.min(1, t / 300);
  if (era === 2016) {
    bootGlass(g, cx, cy, H, maker, font, t, u);
    g.globalAlpha = 1;
    return;
  }
  // 2006: the mark and the italic wordmark over a trough of sliding blocks.
  g.font = `italic 700 ${Math.round(50 * u)}px ${font}`;
  const tw = g.measureText(wordmark).width;
  const mark = 64 * u;
  const gap = 22 * u;
  const left = cx - (mark + gap + tw) / 2;
  const top = cy - 35 * u - 8 * u;
  drawMark(g, left + mark / 2, top, mark, "#fff");
  g.fillStyle = "#fff";
  g.textAlign = "left";
  g.fillText(wordmark, left + mark + gap, top + 2 * u);
  const bw = 150 * u;
  const bh = 16 * u;
  const bx = cx - bw / 2;
  const by = top + mark / 2 + 70 * u - 8 * u;
  g.strokeStyle = "#b2b2b2";
  g.lineWidth = 2 * u;
  roundRect(g, bx + u, by + u, bw - 2 * u, bh - 2 * u, 4 * u);
  g.stroke();
  g.save();
  roundRect(g, bx + 3 * u, by + 3 * u, bw - 6 * u, bh - 6 * u, u);
  g.clip();
  const run = bw + 40 * u;
  const head = ((t / 1000) * 120 * u) % run;
  for (let i = 0; i < 3; i++) {
    const x = bx - 36 * u + head + i * 12 * u;
    const grad = g.createLinearGradient(0, by + 4 * u, 0, by + bh - 4 * u);
    grad.addColorStop(0, "#a8c8ff");
    grad.addColorStop(0.5, "#2f62e8");
    grad.addColorStop(1, "#1c3fa8");
    g.fillStyle = grad;
    roundRect(g, x, by + 4 * u, 9 * u, bh - 8 * u, u);
    g.fill();
  }
  g.restore();
  g.globalAlpha = 1;
}
