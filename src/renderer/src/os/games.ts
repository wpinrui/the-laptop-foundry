import type { Preset } from "../engine/bench";
import { PRESET_DETAIL, rng, roundRect } from "./art";
import type { Era } from "./types";

// The light and the middle game, drawn in code like Ashfall: Tavern Tiles, a
// tile-matching puzzle by a tavern hearth, and Coastline Rally, a pseudo-3D
// coast road racer. Each paints one frame for a game clock `t` in seconds.

// ------------------------------------------------------------------ Tavern Tiles

const TILE_N = 8;
const TILE_KINDS: [string, string][] = [
  ["#e0563f", "#8e2418"],
  ["#f0c040", "#9a6a10"],
  ["#4fae5a", "#1f5a28"],
  ["#4a86d8", "#1c3f80"],
  ["#a661cc", "#55237a"],
  ["#efe6d0", "#8a7a5a"],
];
/** One move: a swap, the match pops, the tiles above fall in. */
const TILE_CYCLE = 1.8;

function hash(a: number, b: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x27d4eb2f);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const tileKind = (x: number, k: number) => Math.floor(hash(x * 131 + 7, k) * TILE_KINDS.length);
/** The first of the three bottom tiles move `c` pops. */
const popStart = (c: number) => (c * 5) % (TILE_N - 2);
const pops = (x: number, s: number) => s <= x && x < s + 3;

/** How many bottom tiles column `x` has lost before move `c`. */
function popsBefore(x: number, c: number): number {
  const period = TILE_N - 2;
  let per = 0;
  for (let s = 0; s < period; s++) if (pops(x, s)) per++;
  let n = Math.floor(c / period) * per;
  for (let j = c - (c % period); j < c; j++) if (pops(x, popStart(j))) n++;
  return n;
}

let pixels: HTMLCanvasElement | null = null;

/** Draws at a lower resolution and scales it up unsmoothed, as older 2D games did. */
function pixelated(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale: number,
  draw: (p: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  if (scale <= 1) return draw(g, w, h);
  const pw = Math.max(1, Math.round(w / scale));
  const ph = Math.max(1, Math.round(h / scale));
  pixels ??= document.createElement("canvas");
  if (pixels.width !== pw || pixels.height !== ph) {
    pixels.width = pw;
    pixels.height = ph;
  }
  const p = pixels.getContext("2d");
  if (!p) return draw(g, w, h);
  draw(p, pw, ph);
  g.imageSmoothingEnabled = false;
  g.drawImage(pixels, 0, 0, w, h);
  g.imageSmoothingEnabled = true;
}

function tileSymbol(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number) {
  g.beginPath();
  if (kind === 0) g.arc(cx, cy, r, 0, Math.PI * 2);
  else if (kind === 1) {
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r, cy);
  } else if (kind === 2) {
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy + r * 0.8);
    g.lineTo(cx - r, cy + r * 0.8);
  } else if (kind === 3) g.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
  else if (kind === 4) {
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.arc(cx, cy, r * 0.5, 0, Math.PI * 2, true);
  } else {
    g.rect(cx - r, cy - r * 0.3, r * 2, r * 0.6);
    g.rect(cx - r * 0.3, cy - r, r * 0.6, r * 2);
  }
  g.fill("evenodd");
}

function drawTile(g: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, detail: Era, grow = 1) {
  const [c, d] = TILE_KINDS[kind];
  const m = s * 0.06;
  const size = (s - m * 2) * grow;
  if (size <= 0) return;
  const x0 = x + (s - size) / 2;
  const y0 = y + (s - size) / 2;
  if (detail === 2006) {
    const b = Math.max(1, Math.round(s / 10));
    const X = Math.round(x0);
    const Y = Math.round(y0);
    const S = Math.round(size);
    g.fillStyle = d;
    g.fillRect(X, Y, S, S);
    g.fillStyle = c;
    g.fillRect(X, Y, S - b, S - b);
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.fillRect(X, Y, S - b, b);
    g.fillStyle = d;
    tileSymbol(g, kind, Math.round(X + S / 2), Math.round(Y + S / 2), Math.round(S * 0.24));
    return;
  }
  g.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(g, x0 + s * 0.04, y0 + s * 0.06, size, size, size * 0.2);
  g.fill();
  const gr = g.createLinearGradient(0, y0, 0, y0 + size);
  gr.addColorStop(0, c);
  gr.addColorStop(1, d);
  g.fillStyle = gr;
  roundRect(g, x0, y0, size, size, size * 0.2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.28)";
  roundRect(g, x0 + size * 0.1, y0 + size * 0.06, size * 0.8, size * 0.3, size * 0.14);
  g.fill();
  g.fillStyle = detail === 2026 ? "rgba(255,250,235,0.92)" : "rgba(255,255,255,0.8)";
  tileSymbol(g, kind, x0 + size / 2, y0 + size / 2, size * 0.24);
}

function tavern(g: CanvasRenderingContext2D, w: number, h: number, detail: Era, k: number, t: number) {
  const flicker = 0.85 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04;
  // Plank wall.
  g.fillStyle = detail === 2006 ? "#5a3a22" : "#4a2e1c";
  g.fillRect(0, 0, w, h);
  const plank = Math.max(2, Math.round(h / 9));
  g.fillStyle = "rgba(0,0,0,0.3)";
  for (let y = plank; y < h; y += plank) g.fillRect(0, y, w, Math.max(1, Math.round(h / 200)));
  // The hearth on the left.
  const hx = w * 0.04;
  const hy = h * 0.46;
  const hw = w * 0.16;
  const hh = h * 0.54;
  g.fillStyle = "#6e6660";
  g.fillRect(hx, hy, hw, hh);
  g.fillStyle = "#1a0f0a";
  g.fillRect(hx + hw * 0.15, hy + hh * 0.3, hw * 0.7, hh * 0.7);
  const fx = hx + hw / 2;
  const fy = hy + hh;
  if (detail === 2006) {
    g.fillStyle = "#f07820";
    g.fillRect(fx - hw * 0.22, fy - hh * 0.32 * flicker, hw * 0.44, hh * 0.32 * flicker);
    g.fillStyle = "#ffd040";
    g.fillRect(fx - hw * 0.1, fy - hh * 0.2 * flicker, hw * 0.2, hh * 0.2 * flicker);
  } else {
    const fire = g.createRadialGradient(fx, fy, 0, fx, fy, hh * 0.45 * flicker);
    fire.addColorStop(0, "rgba(255,230,140,1)");
    fire.addColorStop(0.4, "rgba(255,140,40,0.9)");
    fire.addColorStop(1, "rgba(255,90,20,0)");
    g.fillStyle = fire;
    g.fillRect(hx + hw * 0.15, hy + hh * 0.3, hw * 0.7, hh * 0.7);
    const room = g.createRadialGradient(fx, fy, 0, fx, fy, w * 0.7);
    room.addColorStop(0, `rgba(255,150,60,${(0.35 * flicker).toFixed(2)})`);
    room.addColorStop(1, "rgba(255,150,60,0)");
    g.fillStyle = room;
    g.fillRect(0, 0, w, h);
  }
  if (detail === 2026) {
    const r = rng(11);
    const n = Math.round(24 * k);
    g.fillStyle = "rgba(255,190,90,0.8)";
    for (let i = 0; i < n; i++) {
      const life = (t * (0.3 + r() * 0.3) + r()) % 1;
      const x = fx + (r() - 0.5) * hw * 0.5 + Math.sin(t * 2 + i) * hw * 0.1;
      const y = fy - hh * 0.2 - life * hh * 1.1;
      const s = (1 - life) * h * 0.006;
      g.fillRect(x, y, s, s);
    }
  }
}

/**
 * One frame of Tavern Tiles: a tile-matching board on a tavern table by the
 * hearth. Older editions draw at a low resolution, scaled up in blocks.
 */
export function paintTiles(g: CanvasRenderingContext2D, w: number, h: number, detail: Era, preset: Preset, t: number) {
  const k = PRESET_DETAIL[preset];
  const scale = detail === 2006 ? h / 200 : detail === 2016 ? h / 480 : 1;
  pixelated(g, w, h, scale, (p, W, H) => {
    tavern(p, W, H, detail, k, t);
    const s = Math.floor(Math.min((H * 0.84) / TILE_N, (W * 0.5) / TILE_N));
    const bw = s * TILE_N;
    const bx = Math.round((W - bw) / 2 + W * 0.06);
    const by = Math.round((H - bw) / 2);
    const rim = Math.max(2, Math.round(s * 0.3));
    p.fillStyle = "#2a180e";
    p.fillRect(bx - rim, by - rim, bw + rim * 2, bw + rim * 2);
    p.fillStyle = detail === 2006 ? "#3a2616" : "#1e120a";
    p.fillRect(bx, by, bw, bw);
    const c = Math.floor(t / TILE_CYCLE);
    const ph = (t / TILE_CYCLE) % 1;
    const start = popStart(c);
    const matched = tileKind(start, popsBefore(start, c));
    const ease = (u: number) => u * u * (3 - 2 * u);
    p.save();
    p.beginPath();
    p.rect(bx, by, bw, bw);
    p.clip();
    for (let x = 0; x < TILE_N; x++) {
      const n = popsBefore(x, c);
      const px = bx + x * s;
      const popping = pops(x, start);
      for (let j = 0; j <= TILE_N; j++) {
        if (j === TILE_N && (!popping || ph < 0.5)) continue;
        let row = TILE_N - 1 - j;
        let kind = tileKind(x, n + j);
        let grow = 1;
        if (popping) {
          if (j === 0) {
            if (ph >= 0.5) continue;
            if (ph >= 0.25) {
              kind = matched;
              grow = 1 - ease((ph - 0.25) / 0.25);
            } else if (x === start + 1) row -= ease(ph / 0.25);
          } else if (ph >= 0.5) row += ease((ph - 0.5) / 0.5);
          else if (j === 1 && x === start + 1 && ph < 0.25) row += ease(ph / 0.25);
        }
        drawTile(p, kind, px, by + row * s, s, detail, grow);
      }
    }
    p.restore();
    // The pop flashes.
    if (ph >= 0.25 && ph < 0.55) {
      const a = Math.max(0, 1 - Math.abs(ph - 0.4) / 0.15);
      p.fillStyle = `rgba(255,245,210,${(a * 0.6).toFixed(2)})`;
      p.fillRect(bx + start * s, by + (TILE_N - 1) * s, s * 3, s);
      if (detail === 2026 && k >= 0.75) {
        const r = rng(c);
        p.fillStyle = TILE_KINDS[matched][0];
        for (let i = 0; i < 18 * k; i++) {
          const ang = r() * Math.PI * 2;
          const d = ((ph - 0.25) / 0.3) * s * (0.8 + r());
          p.fillRect(bx + (start + 1.5) * s + Math.cos(ang) * d, by + (TILE_N - 0.5) * s + Math.sin(ang) * d, s * 0.08, s * 0.08);
        }
      }
    }
    // The score board on the right.
    const sx = bx + bw + rim * 3;
    const fs = Math.max(6, Math.round(s * 0.5));
    p.fillStyle = "#2a180e";
    p.fillRect(sx, by, s * 2.6, s * 1.4);
    p.fillStyle = "#f0d9a0";
    p.font = `bold ${fs}px ${detail === 2006 ? "monospace" : "sans-serif"}`;
    p.textBaseline = "middle";
    p.fillText(String(1200 + c * 30 + (ph >= 0.5 ? 30 : 0)).padStart(5, "0"), sx + s * 0.25, by + s * 0.7);
    for (let i = 0; i < 3; i++) drawTile(p, (c + i) % TILE_KINDS.length, sx + i * s * 0.85, by + s * 1.7, s * 0.8, detail);
  });
  if (detail === 2026) {
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.4)");
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
}

// ------------------------------------------------------------------ Coastline Rally

/**
 * One frame of Coastline Rally: a car on a coast road, the sea on the left
 * and palms on the right, the road curving ahead in the old pseudo-3D way.
 */
export function paintRally(g: CanvasRenderingContext2D, w: number, h: number, detail: Era, preset: Preset, t: number) {
  const k = PRESET_DETAIL[preset];
  const hor = Math.round(h * 0.42);
  const f = h * 0.9;
  const pos = t * 36;
  const curv = 0.014 * Math.sin(pos * 0.004) + 0.006 * Math.sin(pos * 0.011 + 1);
  const sway = Math.sin(t * 0.9) * 0.12;
  const roadX = (z: number) => 0.5 * curv * z * z - sway;
  // Sky and sun.
  if (detail === 2006) {
    g.fillStyle = "#4f94e0";
    g.fillRect(0, 0, w, hor);
    g.fillStyle = "#8cc0f0";
    g.fillRect(0, hor * 0.66, w, hor * 0.34);
    g.fillStyle = "#fff4b0";
    g.fillRect(w * 0.7, hor * 0.3, h * 0.06, h * 0.06);
  } else {
    const sky = g.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, detail === 2026 ? "#2d5fb0" : "#3a7ad0");
    sky.addColorStop(1, detail === 2026 ? "#f3c79a" : "#b8dcf5");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, hor);
    const sun = g.createRadialGradient(w * 0.72, hor * 0.55, 0, w * 0.72, hor * 0.55, h * (detail === 2026 ? 0.4 : 0.2));
    sun.addColorStop(0, "rgba(255,250,220,1)");
    sun.addColorStop(0.15, "rgba(255,240,190,0.9)");
    sun.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = sun;
    g.fillRect(0, 0, w, hor);
  }
  // The headland on the right, drifting with the curve.
  const drift = -curv * w * 20;
  g.fillStyle = detail === 2006 ? "#5a8a50" : "#6f8f78";
  g.beginPath();
  g.moveTo(w * 0.45 + drift, hor);
  g.lineTo(w * 0.62 + drift, hor - h * 0.05);
  g.lineTo(w * 0.8 + drift, hor - h * 0.08);
  g.lineTo(w * 1.3 + drift, hor - h * 0.06);
  g.lineTo(w * 1.3 + drift, hor);
  g.fill();
  // Ground, then the road in strips from far to near.
  g.fillStyle = detail === 2006 ? "#3aa040" : "#4e9a48";
  g.fillRect(0, hor, w, h - hor);
  const zNear = f / (h - hor);
  const zFar = 90;
  const n = Math.round((detail === 2006 ? 40 : detail === 2016 ? 90 : 160) * Math.min(1, k));
  const zAt = (i: number) => zNear * (zFar / zNear) ** (i / n);
  const edgeAt = (z: number) => w / 2 + (roadX(z) * f) / z;
  // The sea runs to the horizon beyond the last strip.
  g.fillStyle = "#2a70c8";
  g.fillRect(0, hor, Math.max(0, edgeAt(zFar) - (f / zFar) * 2.4), Math.ceil(f / zFar) + 1);
  for (let i = n - 1; i >= 0; i--) {
    const z0 = zAt(i);
    const z1 = zAt(i + 1);
    const zm = (z0 + z1) / 2;
    const y0 = Math.ceil(hor + f / z0);
    const y1 = Math.floor(hor + f / z1);
    const sh = Math.max(1, y0 - y1);
    const cx = edgeAt(zm);
    const hw = f / zm;
    const band = Math.floor((zm + pos) / 3) % 2;
    g.fillStyle = detail === 2006 ? (band ? "#34963a" : "#3ca842") : band ? "#469240" : "#52a24a";
    g.fillRect(cx + hw * 1.12, y1, w, sh);
    g.fillStyle = detail === 2006 || band ? "#2a70c8" : "#2f7cc2";
    g.fillRect(0, y1, Math.max(0, cx - hw * 2.4), sh);
    g.fillStyle = band ? "#e2cf96" : "#ead8a2";
    g.fillRect(cx - hw * 2.4, y1, hw * 1.3, sh);
    g.fillStyle = band ? "#d8d8d8" : "#c83a2e";
    g.fillRect(cx - hw * 1.12, y1, hw * 2.24, sh);
    g.fillStyle = band ? "#5c5e62" : "#606266";
    g.fillRect(cx - hw, y1, hw * 2, sh);
    if (band) {
      g.fillStyle = "#f2f2e8";
      g.fillRect(cx - hw * 0.03, y1, hw * 0.06, sh);
    }
  }
  if (detail !== 2006) {
    // The sea glints under the sun.
    const r = rng(5);
    g.fillStyle = "rgba(255,250,220,0.55)";
    for (let i = 0; i < 40 * k; i++) {
      const y = hor + r() * r() * (h - hor) * 0.5;
      const z = f / Math.max(1, y - hor);
      const edge = edgeAt(z) - (f / z) * 2.4;
      const x = r() * edge;
      if (Math.sin(t * 3 + i * 1.7) > 0.3) g.fillRect(x, y, h * 0.012 * (1 + r()), Math.max(1, h * 0.002));
    }
  }
  // Roadside: posts on the sea side, palms on the land side, far to near.
  const post = 5;
  for (let s = Math.floor((pos + zFar * 0.5) / post) * post; s > pos; s -= post) {
    const z = s - pos;
    if (z < zNear * 1.05) break;
    const sc = f / z;
    const x = w / 2 + (roadX(z) - 1.3) * sc;
    const y = hor + f / z;
    g.fillStyle = "#f4f4f0";
    g.fillRect(x, y - sc * 0.3, sc * 0.06, sc * 0.3);
    g.fillStyle = "#c83a2e";
    g.fillRect(x, y - sc * 0.3, sc * 0.06, sc * 0.06);
  }
  const palm = detail === 2006 ? 24 : detail === 2016 ? 14 : 9;
  const fronds = detail === 2006 ? 4 : 7;
  for (let s = Math.floor((pos + zFar * 0.7) / palm) * palm; s > pos; s -= palm) {
    const z = s - pos;
    if (z < zNear * 1.05) break;
    const sc = f / z;
    const x = w / 2 + (roadX(z) + 2 + hash(s, 3)) * sc;
    const y = hor + f / z;
    const th = sc * 1.8;
    if (detail !== 2006) {
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath();
      g.ellipse(x, y, sc * 0.35, sc * 0.08, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#7a5a3a";
    g.beginPath();
    g.moveTo(x - sc * 0.07, y);
    g.lineTo(x + sc * 0.07, y);
    g.lineTo(x + sc * 0.2, y - th);
    g.lineTo(x + sc * 0.14, y - th);
    g.fill();
    g.fillStyle = detail === 2006 ? "#1e7a2a" : "#2a8a3a";
    const tx = x + sc * 0.17;
    const ty = y - th;
    for (let a = 0; a < fronds; a++) {
      const ang = -Math.PI * 0.95 + (a / (fronds - 1)) * Math.PI * 0.9 + Math.sin(t * 1.5 + s) * 0.05;
      g.beginPath();
      g.ellipse(tx + Math.cos(ang) * sc * 0.4, ty + Math.sin(ang) * sc * 0.25 + sc * 0.1, sc * 0.45, sc * 0.09, ang, 0, Math.PI * 2);
      g.fill();
    }
  }
  // The car, from behind.
  const cw = h * 0.36;
  const cx = w / 2 + Math.sin(t * 1.3) * h * 0.012 - curv * h * 2;
  const cy = h * 0.95 + Math.sin(t * 17) * h * 0.002;
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath();
  g.ellipse(cx, cy + h * 0.01, cw * 0.58, h * 0.025, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#151515";
  g.fillRect(cx - cw * 0.5, cy - h * 0.06, cw * 0.16, h * 0.07);
  g.fillRect(cx + cw * 0.34, cy - h * 0.06, cw * 0.16, h * 0.07);
  if (detail === 2006) {
    g.fillStyle = "#c81e1e";
    g.fillRect(cx - cw * 0.5, cy - h * 0.16, cw, h * 0.11);
    g.fillRect(cx - cw * 0.36, cy - h * 0.23, cw * 0.72, h * 0.08);
  } else {
    const gr = g.createLinearGradient(0, cy - h * 0.24, 0, cy - h * 0.04);
    gr.addColorStop(0, "#f05050");
    gr.addColorStop(0.5, "#d8282a");
    gr.addColorStop(1, "#7a1010");
    g.fillStyle = gr;
    roundRect(g, cx - cw * 0.5, cy - h * 0.16, cw, h * 0.11, h * 0.02);
    g.fill();
    roundRect(g, cx - cw * 0.36, cy - h * 0.235, cw * 0.72, h * 0.09, h * 0.03);
    g.fill();
  }
  g.fillStyle = detail === 2026 ? "#1c2430" : "#2a3440";
  g.fillRect(cx - cw * 0.3, cy - h * 0.22, cw * 0.6, h * 0.055);
  g.fillStyle = "#ff3020";
  g.fillRect(cx - cw * 0.46, cy - h * 0.14, cw * 0.18, h * 0.025);
  g.fillRect(cx + cw * 0.28, cy - h * 0.14, cw * 0.18, h * 0.025);
  g.fillStyle = "#e8e8e0";
  g.fillRect(cx - cw * 0.09, cy - h * 0.1, cw * 0.18, h * 0.03);
  if (detail === 2026 && k >= 0.75) {
    for (const side of [-0.37, 0.37]) {
      const lx = cx + side * cw;
      const ly = cy - h * 0.128;
      const glow = g.createRadialGradient(lx, ly, 0, lx, ly, h * 0.06);
      glow.addColorStop(0, "rgba(255,60,40,0.45)");
      glow.addColorStop(1, "rgba(255,60,40,0)");
      g.fillStyle = glow;
      g.fillRect(lx - h * 0.06, ly - h * 0.06, h * 0.12, h * 0.12);
    }
  }
  // The speedo.
  const speed = String(Math.round(172 + Math.sin(t * 0.7) * 14));
  g.font = `italic bold ${Math.round(h * 0.06)}px ${detail === 2006 ? "monospace" : "sans-serif"}`;
  g.textBaseline = "alphabetic";
  g.textAlign = "right";
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillText(speed, w * 0.95 + 2, h * 0.93 + 2);
  g.fillStyle = "#fff";
  g.fillText(speed, w * 0.95, h * 0.93);
  g.textAlign = "left";
  if (detail === 2026) {
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.72);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
}
