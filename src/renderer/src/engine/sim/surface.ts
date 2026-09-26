import type { Box, Fit } from "../types";

// Surface temperatures over the base's top (keyboard deck and palm rest) and
// bottom, on a coarse grid. Each placed unit puts its heat into the two faces,
// more into the nearer one and spread wider the deeper it sits. The fans carry
// part of the chips' heat to the fin stack, so the vents run hot, and the air
// they move cools the case over them. The shell then spreads heat sideways by
// its material and thickness while every cell sheds heat to the room. The shape
// comes from the layout; the level is anchored to the lumped model's mean case
// temperature, so the hot spots come out of the shape, as a thermal camera finds them.

export const SURFACE_NX = 24;
export const SURFACE_NY = 16;

/** °C per cell, row-major: index j * nx + i, i from the user's left, j from the front. */
export interface SurfaceField {
  top: number[];
  bottom: number[];
}

/** Notebookcheck's nine areas per face, the hottest cell of each, °C. Rows rear to front, columns left to right as seen from above. */
export interface SurfaceReadings {
  top: number[][];
  bottom: number[][];
}

export interface Surface {
  nx: number;
  ny: number;
  idle: SurfaceField;
  load: SurfaceField;
  readings: { idle: SurfaceReadings; load: SurfaceReadings };
}

export interface SurfaceState {
  cpuW: number;
  gpuW: number;
  /** Board, memory, storage and radios. */
  base: number;
  /** Fan speed, 0 to 1. */
  fan: number;
  /** Share of the chips' heat the fans carry to the fin stack. */
  carried: number;
  /** Mean skin temperature over both faces, °C. */
  mean: number;
}

export interface Shell {
  /** Lateral spreading, 0 to 1, of the deck and the floor. */
  spread: { top: number; bottom: number };
  thickness: { top: number; bottom: number };
}

/** How the platform's idle draw splits over the parts that are present. */
const BASE_SHARE: Record<string, number> = {
  board: 0.3,
  chipset: 0.2,
  mem: 0.15,
  drive: 0.2,
  m2: 0.08,
  wlan: 0.05,
  tb: 0.04,
  odd: 0.03,
};
/** Share of the carried heat the exhaust leaves in the case around the fins. */
const EXHAUST = 0.3;
/** Share of all heat the internal air spreads evenly over both faces. */
const AIR = 0.5;
/** Share of that air heat the deck takes. */
const AIR_TOP = 0.4;
/** Depth offset, mm, in how a unit splits its heat between the faces: the heat pipes and air between spread it near evenly. */
const DEPTH = 400;
/** Extra cooling of the case over a fan at full speed, per face: the intake side most. */
const WASH = { top: 10, bottom: 40 };
/** Lateral spreading length, cells: a floor for every shell plus a term for conductive, thicker ones. */
const SPREAD_LEN = { floor: 4.4, metal: 4 };
const SWEEPS = 160;
const OMEGA = 1.7;

type Face = "top" | "bottom";

const area = (b: Box) => b.size.x * b.size.y;

function solveFace(q: Float64Array, h: Float64Array, k: number): Float64Array {
  const nx = SURFACE_NX;
  const ny = SURFACE_NY;
  const n = nx * ny;
  let qs = 0;
  let hs = 0;
  for (let i = 0; i < n; i++) {
    qs += q[i];
    hs += h[i];
  }
  const t = new Float64Array(n).fill(hs > 0 ? qs / hs : 0);
  for (let s = 0; s < SWEEPS; s++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        let sum = 0;
        let nb = 0;
        if (i > 0) (sum += t[c - 1]), nb++;
        if (i < nx - 1) (sum += t[c + 1]), nb++;
        if (j > 0) (sum += t[c - nx]), nb++;
        if (j < ny - 1) (sum += t[c + nx]), nb++;
        const next = (q[c] + k * sum) / (h[c] + k * nb);
        t[c] += OMEGA * (next - t[c]);
      }
    }
  }
  return t;
}

/** Rise over the room per cell, before anchoring. */
function rise(fit: Fit, shell: Shell, s: SurfaceState): Record<Face, Float64Array> {
  const out = fit.shell.outer;
  const nx = SURFACE_NX;
  const ny = SURFACE_NY;
  const cw = out.x / nx;
  const ch = out.y / ny;
  const q: Record<Face, Float64Array> = {
    top: new Float64Array(nx * ny),
    bottom: new Float64Array(nx * ny),
  };
  const units = fit.boxes.filter((b) => b.kind === "unit" && b.piece !== "lid");
  const of = (role: string) => units.filter((b) => b.role === role);

  /** Spread `w` over the rectangle, clipped to the base, onto one face. */
  const rect = (face: Face, x0: number, y0: number, x1: number, y1: number, w: number) => {
    const ax = Math.max(0, x0);
    const bx = Math.min(out.x, x1);
    const ay = Math.max(0, y0);
    const by = Math.min(out.y, y1);
    if (bx <= ax || by <= ay || w <= 0) return;
    const per = w / ((bx - ax) * (by - ay));
    for (let j = Math.floor(ay / ch); j < Math.min(ny, Math.ceil(by / ch)); j++) {
      const oy = Math.min(by, (j + 1) * ch) - Math.max(ay, j * ch);
      if (oy <= 0) continue;
      for (let i = Math.floor(ax / cw); i < Math.min(nx, Math.ceil(bx / cw)); i++) {
        const ox = Math.min(bx, (i + 1) * cw) - Math.max(ax, i * cw);
        if (ox > 0) q[face][j * nx + i] += per * ox * oy;
      }
    }
  };
  /** A unit's heat into both faces: more into the nearer, wider the deeper. */
  const put = (b: Box, w: number) => {
    if (w <= 0) return;
    const dTop = Math.max(0.5, out.z - (b.at.z + b.size.z));
    const dBot = Math.max(0.5, b.at.z);
    const wt = 1 / (dTop + DEPTH);
    const wb = 1 / (dBot + DEPTH);
    for (const [face, d, share] of [
      ["top", dTop, wt / (wt + wb)],
      ["bottom", dBot, wb / (wt + wb)],
    ] as const) {
      const m = 1.5 * d;
      rect(face, b.at.x - m, b.at.y - m, b.at.x + b.size.x + m, b.at.y + b.size.y + m, w * share);
    }
  };
  const split = (boxes: Box[], w: number) => {
    const total = boxes.reduce((sum, b) => sum + area(b), 0);
    if (total > 0) for (const b of boxes) put(b, (w * area(b)) / total);
  };

  const local = 1 - AIR;
  const kept = 1 - s.carried;
  const cpus = of("cpu");
  const gpus = of("gpu");
  split(cpus, local * kept * (s.cpuW + (gpus.length ? 0 : s.gpuW)));
  split(gpus, local * kept * s.gpuW);
  split(of("vrm"), local * 0.1 * (s.cpuW + s.gpuW));
  const present = Object.keys(BASE_SHARE).filter((r) => of(r).length > 0);
  const shares = present.reduce((sum, r) => sum + BASE_SHARE[r], 0);
  for (const r of present) split(of(r), (local * s.base * BASE_SHARE[r]) / shares);
  const chips = s.cpuW + s.gpuW;
  split(of("battery"), local * 0.03 * (chips + s.base));
  split(of("fin"), local * s.carried * EXHAUST * chips);

  // The internal air warms both faces evenly.
  const even = (AIR * (chips * (1.1 - s.carried * (1 - EXHAUST)) + s.base)) / (nx * ny);
  for (let c = 0; c < nx * ny; c++) {
    q.top[c] += AIR_TOP * even;
    q.bottom[c] += (1 - AIR_TOP) * even;
  }

  // Moving air over the fans cools the case there, the intake side most.
  const fans = of("fan");
  const res: Record<Face, Float64Array> = { top: q.top, bottom: q.bottom };
  for (const face of ["top", "bottom"] as const) {
    const h = new Float64Array(nx * ny).fill(1);
    const boost = WASH[face] * s.fan;
    for (const f of fans)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const x = (i + 0.5) * cw;
          const y = (j + 0.5) * ch;
          if (x >= f.at.x && x <= f.at.x + f.size.x && y >= f.at.y && y <= f.at.y + f.size.y)
            h[j * nx + i] = 1 + boost;
        }
    // Spreading length in cells: plastic keeps hot spots tight, metal smears them.
    const len = SPREAD_LEN.floor + SPREAD_LEN.metal * shell.spread[face] ** 2 * Math.sqrt(Math.max(0.3, shell.thickness[face]));
    res[face] = solveFace(q[face], h, len * len);
  }
  return res;
}

function anchor(r: Record<Face, Float64Array>, mean: number, ambient: number): SurfaceField {
  let sum = 0;
  for (const v of r.top) sum += v;
  for (const v of r.bottom) sum += v;
  const avg = sum / (r.top.length + r.bottom.length);
  const scale = avg > 0 ? Math.max(0, mean - ambient) / avg : 0;
  const map = (a: Float64Array) => Array.from(a, (v) => ambient + v * scale);
  return { top: map(r.top), bottom: map(r.bottom) };
}

function ninths(grid: number[]): number[][] {
  const nx = SURFACE_NX;
  const ny = SURFACE_NY;
  const cut = (n: number, k: number) => Math.floor((k * n) / 3);
  // Rows rear first, as Notebookcheck draws the top view.
  return [2, 1, 0].map((row) =>
    [0, 1, 2].map((col) => {
      let m = -Infinity;
      for (let j = cut(ny, row); j < cut(ny, row + 1); j++)
        for (let i = cut(nx, col); i < cut(nx, col + 1); i++) m = Math.max(m, grid[j * nx + i]);
      return m;
    }),
  );
}

export function surfaceOf(
  fit: Fit,
  shell: Shell,
  idle: SurfaceState,
  load: SurfaceState,
  ambient: number,
): Surface {
  const i = anchor(rise(fit, shell, idle), idle.mean, ambient);
  const l = anchor(rise(fit, shell, load), load.mean, ambient);
  return {
    nx: SURFACE_NX,
    ny: SURFACE_NY,
    idle: i,
    load: l,
    readings: {
      idle: { top: ninths(i.top), bottom: ninths(i.bottom) },
      load: { top: ninths(l.top), bottom: ninths(l.bottom) },
    },
  };
}
