import * as THREE from "three";
import { type Build, CONTENT, type Fit, RIVALS, simulate, solve } from "../engine";
import { AMBIENT } from "../engine/sim";
import { eraOf, setAssetResolver } from "./reviewScenes";

// What the game supplies to the review photo sets: local assets, screen
// images, the thermal camera's heat map and the size photo's rival outlines.
// Nothing here is random, so the same build always gives the same photos.

// ------------------------------------------------------------------ assets

// Bundled with the renderer. The dev server serves them over http; the built
// app reads them through the main process's foundry:// scheme. Never the network.
const ASSET_BASE = location.protocol.startsWith("http")
  ? new URL("review-assets/", location.href).href
  : "foundry://assets/";

setAssetResolver(async (id, kind, res) => {
  if (kind === "hdri") return { url: `${ASSET_BASE}hdri/${id}_${res}.hdr` };
  if (kind === "texture") {
    const at = `${ASSET_BASE}textures/${id}/`;
    return { maps: { map: `${at}diff_${res}.jpg`, rough: `${at}rough_${res}.jpg`, nor: `${at}nor_gl_${res}.jpg` } };
  }
  // The glTF names its buffers and textures relative to itself, as they are stored.
  return { url: `${ASSET_BASE}models/${id}/${id}.gltf` };
});

// ------------------------------------------------------------------ panel

export interface PanelLook {
  glossy: boolean;
  /** How far the picture shifts off axis: TN most, IPS-type a little. */
  shift: number;
}

export function panelLook(build: Build): PanelLook {
  const panel = CONTENT.panels.find((p) => p.id === build.parts.display?.[0]?.part);
  const type = panel?.type ?? "";
  return {
    glossy: type.includes("glossy") || type === "oled",
    shift: type.startsWith("tn") ? 0.35 : type === "ips-type" ? 0.1 : 0,
  };
}

// ------------------------------------------------------------------ screens

export type ScreenKind = "wallpaper" | "test" | "bench" | "sysinfo";

type Draw = (g: CanvasRenderingContext2D, W: number, H: number) => void;

function canvas(aspect: number, draw: Draw): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = Math.max(1, Math.round(1024 / aspect));
  const g = c.getContext("2d");
  if (g) draw(g, c.width, c.height);
  return c;
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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

function testCard(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"].forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect((i * W) / 7, 0, W / 7 + 1, H * 0.6);
  });
  for (let i = 0; i < 11; i++) {
    const v = Math.round((i / 10) * 255);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect((i * W) / 11, H * 0.62, W / 11 + 1, H * 0.16);
  }
  ["#e8b89a", "#c68a67", "#8d5a3f", "#5a8f3c", "#3f6fb0", "#e0c040", "#ffffff", "#101010"].forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect((i * W) / 8 + 6, H * 0.82, W / 8 - 12, H * 0.14);
  });
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

const screenCache = new Map<string, HTMLCanvasElement>();

function screenCanvas(kind: ScreenKind, year: number, aspect: number): HTMLCanvasElement {
  const era = eraOf(year);
  const key = `${kind}|${era}|${aspect.toFixed(3)}`;
  let c = screenCache.get(key);
  if (!c) {
    c = canvas(aspect, (g, W, H) => {
      if (kind === "wallpaper") wallpaper(g, W, H, era);
      else if (kind === "test") testCard(g, W, H);
      else if (kind === "bench") bench(g, W, H);
      else sysinfo(g, W, H, era);
    });
    screenCache.set(key, c);
  }
  return c;
}

/**
 * The picture on the panel. `view` is the viewing angle off the screen normal,
 * in degrees: the panel type washes out, dims or inverts the picture accordingly.
 */
export function screenTexture(
  kind: ScreenKind,
  year: number,
  aspect: number,
  look: PanelLook,
  view?: { daz: number; del: number },
): THREE.CanvasTexture {
  const base = screenCanvas(kind, year, aspect);
  if (!view || (view.daz === 0 && view.del === 0)) return texture(base);
  const side = Math.abs(view.daz) / 45;
  const up = Math.max(0, view.del) / 40;
  const down = Math.max(0, -view.del) / 25;
  // Every LCD loses a little off axis; TN loses most, and inverts from below.
  const s = look.shift;
  const wash = Math.min(0.9, s * (1.4 * side + 2 * up));
  const invert = Math.min(0.85, s * 2.4 * down);
  const dim = Math.min(0.5, 0.08 * (side + up + down) + s * 0.6 * (side + up + down));
  const c = canvas(aspect, (g, W, H) => {
    g.filter = `invert(${invert.toFixed(3)}) brightness(${(1 - dim).toFixed(3)}) contrast(${(1 - wash * 0.6).toFixed(3)}) saturate(${(1 - wash * 0.7).toFixed(3)})`;
    g.drawImage(base, 0, 0, W, H);
    g.filter = "none";
    g.fillStyle = `rgba(200,200,200,${(wash * 0.35).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  });
  return texture(c);
}

// ------------------------------------------------------------------ thermal

/** The heat map's fixed scale, so every review's thermal photos read alike. */
const SCALE_C: [number, number] = [20, 66];

function heatTexture(grid: number[], nx: number, ny: number): THREE.DataTexture {
  const t = (c: number) => Math.round(255 * Math.min(1, Math.max(0, (c - SCALE_C[0]) / (SCALE_C[1] - SCALE_C[0]))));
  const tex = new THREE.DataTexture(Uint8Array.from(grid, t), nx, ny, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The unlit false-colour heat map for a build: the simulation's surface
 * temperatures under the stress test, the deck's on the top half of the base
 * and the floor's on the bottom half, looked up by position.
 */
export function heatMaterial(build: Build, fit: Fit): THREE.ShaderMaterial {
  const out = fit.shell.outer;
  const surface = simulate(build, fit).cooling?.surface;
  const flat = (c: number) => heatTexture([c], 1, 1);
  const top = surface ? heatTexture(surface.load.top, surface.nx, surface.ny) : flat(AMBIENT + 3);
  const bottom = surface ? heatTexture(surface.load.bottom, surface.nx, surface.ny) : flat(AMBIENT + 3);
  const t = (c: number) => (c - SCALE_C[0]) / (SCALE_C[1] - SCALE_C[0]);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: top },
      uBottom: { value: bottom },
      uSize: { value: new THREE.Vector3(out.x, out.y, out.z) },
      uInv: { value: new THREE.Matrix4() },
      uLid: { value: t(AMBIENT + 2) },
    },
    vertexShader: `
      uniform mat4 uInv;
      varying vec3 vL;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;
        vL = (uInv * w).xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D uTop;
      uniform sampler2D uBottom;
      uniform vec3 uSize;
      uniform float uLid;
      varying vec3 vL;
      vec3 iron(float t) {
        t = clamp(t, 0., 1.);
        vec3 a = vec3(.02, 0., .08), b = vec3(.3, 0., .5), c = vec3(.74, .06, .42), d = vec3(.96, .38, .05), e = vec3(1., .82, .18), f = vec3(1., 1., .92);
        if (t < .2) return mix(a, b, t / .2);
        if (t < .4) return mix(b, c, (t - .2) / .2);
        if (t < .65) return mix(c, d, (t - .4) / .25);
        if (t < .85) return mix(d, e, (t - .65) / .2);
        return mix(e, f, (t - .85) / .15);
      }
      void main() {
        // Laptop space is engine space turned up: x across, y up, z toward the front.
        vec2 uv = clamp(vec2(vL.x / uSize.x + .5, .5 - vL.z / uSize.y), 0., 1.);
        float t = vL.y < uSize.z * 0.5 ? texture2D(uBottom, uv).r : texture2D(uTop, uv).r;
        // The lid stays near room temperature.
        if (vL.y > uSize.z + 3. || vL.z < -uSize.y * 0.5 - 3.) t = uLid;
        gl_FragColor = vec4(iron(t), 1.);
      }`,
  });
  mat.addEventListener("dispose", () => {
    top.dispose();
    bottom.dispose();
  });
  return mat;
}

// ------------------------------------------------------------------ size

export interface Outline {
  w: number;
  d: number;
}

const outerCache = new Map<string, Outline | null>();

function outlineOf(id: string, build: Build): Outline | null {
  if (!outerCache.has(id)) {
    try {
      const o = solve(build).shell.outer;
      outerCache.set(id, { w: o.x, d: o.y });
    } catch {
      outerCache.set(id, null);
    }
  }
  return outerCache.get(id) ?? null;
}

/** The smallest and largest rival footprints of the build's year, for the size photo. */
export function rivalOutlines(id: string, build: Build, own: Outline): Outline[] {
  const years = [...new Set(RIVALS.map((r) => r.build.year))];
  if (years.length === 0) return [];
  const year = years.reduce((a, b) =>
    Math.abs(b - build.year) < Math.abs(a - build.year) || (Math.abs(b - build.year) === Math.abs(a - build.year) && b < a) ? b : a,
  );
  const all = RIVALS.filter((r) => r.build.year === year && r.id !== id)
    .map((r) => outlineOf(r.id, r.build))
    .filter((o): o is Outline => !!o && (Math.abs(o.w - own.w) > 3 || Math.abs(o.d - own.d) > 3))
    .sort((a, b) => a.w - b.w || a.d - b.d);
  if (all.length === 0) return [];
  const picks = [all[0], all[all.length - 1]];
  return picks[0] === picks[1] ? [picks[0]] : picks;
}
