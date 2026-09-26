import * as THREE from "three";
import { token } from "../viewer/theme";
import type { Era } from "./types";

// The screens the laptop showed before the in-game OS, kept for the eras
// whose OS has not landed yet. Goes when the last era's OS does.

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d");
  if (g) draw(g, c.width, c.height);
  return c;
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The menu's lock screen: a warm glow on the ground colour. */
export function legacyLockTexture(): THREE.CanvasTexture {
  return texture(
    canvas(512, 320, (g) => {
      g.fillStyle = token("ground");
      g.fillRect(0, 0, 512, 320);
      const warm = g.createRadialGradient(170, 70, 0, 170, 70, 420);
      warm.addColorStop(0, token("accent"));
      warm.addColorStop(1, token("ground"));
      g.globalAlpha = 0.22;
      g.fillStyle = warm;
      g.fillRect(0, 0, 512, 320);
      const fall = g.createLinearGradient(0, 0, 0, 320);
      fall.addColorStop(0, token("ground"));
      fall.addColorStop(1, token("ground-deep"));
      g.globalAlpha = 0.5;
      g.fillStyle = fall;
      g.fillRect(0, 0, 512, 320);
    }),
  );
}

/** The builder's desktop: a warm gradient and a bar. */
export function legacyDeskTexture(ratio: number): THREE.CanvasTexture {
  const W = 1280;
  return texture(
    canvas(W, W / Math.max(0.5, ratio), (g, _w, H) => {
      const r = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W);
      r.addColorStop(0, token("screen-desk"));
      r.addColorStop(1, token("screen-desk-edge"));
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.85;
      g.fillStyle = token("ground");
      g.fillRect(0, H - 34, W, 34);
      g.globalAlpha = 1;
    }),
  );
}

function wallpaper(g: CanvasRenderingContext2D, W: number, H: number, era: number) {
  const cols = ({ 2006: ["#5d8fd0", "#1f4f96"], 2016: ["#1f6f86", "#0c1f33"], 2026: ["#7e5bb5", "#1d2b53"] } as Record<number, string[]>)[era];
  const r = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.95);
  r.addColorStop(0, cols[0]);
  r.addColorStop(1, cols[1]);
  g.fillStyle = r;
  g.fillRect(0, 0, W, H);
  g.fillStyle = era === 2006 ? "#c9ccd2" : "#10131a";
  g.fillRect(0, H - (era === 2006 ? 30 : 40), W, 40);
}

function bench(g: CanvasRenderingContext2D, W: number, H: number) {
  const s = g.createLinearGradient(0, 0, 0, H * 0.62);
  s.addColorStop(0, "#1c2240");
  s.addColorStop(1, "#e0784a");
  g.fillStyle = s;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#ffd38a";
  g.beginPath();
  g.arc(W * 0.62, H * 0.5, H * 0.08, 0, Math.PI * 2);
  g.fill();
  (
    [
      ["#3a2a48", 0.46, 0.18],
      ["#241b33", 0.54, 0.12],
    ] as const
  ).forEach(([c, y, amp], j) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 32)
      g.lineTo(x, H * y + Math.sin(x * 0.011 + j * 2) * H * amp * 0.5 + Math.sin(x * 0.031) * H * 0.03);
    g.lineTo(W, H);
    g.fill();
  });
  g.fillStyle = "#121019";
  g.fillRect(0, H * 0.62, W, H * 0.38);
  g.strokeStyle = "#e0c070";
  g.lineWidth = 3;
  for (let i = -6; i <= 6; i++) {
    g.beginPath();
    g.moveTo(W / 2, H * 0.62);
    g.lineTo(W / 2 + i * W * 0.2, H);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.fillRect(W * 0.03, H * 0.05, W * 0.16, 8);
  g.fillStyle = "#58c26b";
  g.fillRect(W * 0.03, H * 0.05, W * 0.11, 8);
}

function sysinfo(g: CanvasRenderingContext2D, W: number, H: number, era: number) {
  wallpaper(g, W, H, era);
  const dark = era === 2026;
  const x = W * 0.12;
  const y = H * 0.08;
  const ww = W * 0.76;
  const hh = H * 0.76;
  g.fillStyle = dark ? "#202225" : "#f0f0f0";
  g.fillRect(x, y, ww, hh);
  g.fillStyle = era === 2006 ? "#2a5bd0" : dark ? "#2b2e33" : "#ffffff";
  g.fillRect(x, y, ww, 34);
  g.fillStyle = dark ? "#5b6068" : "#9a9da3";
  for (let i = 0; i < 12; i++) g.fillRect(x + 28, y + 64 + i * 28, 120 + ((i * 53) % 140), 10);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = dark ? "#3a3f46" : "#d8dadd";
    g.fillRect(x + ww * 0.5, y + 70 + i * 40, ww * 0.44, 18);
    g.fillStyle = "#4c8ed8";
    g.fillRect(x + ww * 0.5, y + 70 + i * 40, ww * 0.44 * (0.25 + ((i * 37) % 70) / 100), 18);
  }
}

/** The review photos' screens: "wallpaper", "bench" or "sysinfo". */
export function legacyShot(kind: "wallpaper" | "bench" | "sysinfo", era: Era, aspect: number): HTMLCanvasElement {
  return canvas(1024, 1024 / aspect, (g, W, H) => {
    if (kind === "wallpaper") wallpaper(g, W, H, era);
    else if (kind === "bench") bench(g, W, H);
    else sysinfo(g, W, H, era);
  });
}
