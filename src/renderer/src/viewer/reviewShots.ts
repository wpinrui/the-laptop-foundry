import * as THREE from "three";
import { type Build, type Fit, panelOf, RIVALS, simulate, solve } from "../engine";
import { AMBIENT } from "../engine/sim";
import { setAssetResolver } from "./reviewScenes";

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
  const panel = panelOf(build);
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
  c.width = 1600;
  c.height = Math.max(1, Math.round(1600 / aspect));
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

const testCache = new Map<string, HTMLCanvasElement>();

function testCanvas(aspect: number): HTMLCanvasElement {
  const key = aspect.toFixed(3);
  let c = testCache.get(key);
  if (!c) {
    c = canvas(aspect, testCard);
    testCache.set(key, c);
  }
  return c;
}

/** The OS still each photo set shows: the desktop, Ashfall running, or System. */
export const OS_SHOT = { wallpaper: "desktop", bench: "ash", sysinfo: "sys" } as const;

/**
 * The picture on the panel. `view` is the viewing angle off the screen normal,
 * in degrees: the panel type washes out, dims or inverts the picture accordingly.
 */
export function screenTexture(
  kind: ScreenKind,
  os: Partial<Record<ScreenKind, HTMLCanvasElement>>,
  aspect: number,
  look: PanelLook,
  view?: { daz: number; del: number },
): THREE.CanvasTexture {
  const base = kind === "test" ? testCanvas(aspect) : (os[kind] ?? testCanvas(aspect));
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
