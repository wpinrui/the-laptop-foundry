import type { Box, Fit } from "../engine";
import { PLINTH_H } from "../foundry/Stage";

// Camera framing per builder stage, in world millimetres (three's y up, the
// laptop's front toward +z, the base centred on the plinth). A view is an
// angle round the laptop (az), an elevation (el), a distance as a multiple of
// the laptop's larger plan side (k), and a target point.

export type ViewName = "hero" | "deck" | "keys" | "lid" | "side" | "screen" | "part" | "front" | "finish" | "xray";

export interface View {
  az: number;
  el: number;
  dist: number;
  target: [number, number, number];
  /** How far right the laptop sits, as a fraction of the view width. */
  shift: number;
}

/** Engine point (mm, z up, front-left-bottom origin) to world, as the Model places it on the plinth. */
export function toWorld(fit: Fit, p: { x: number; y: number; z: number }): [number, number, number] {
  const o = fit.shell.outer;
  return [p.x - o.x / 2, PLINTH_H + p.z, o.y / 2 - p.y];
}

export function centreOf(b: Box): { x: number; y: number; z: number } {
  return { x: b.at.x + b.size.x / 2, y: b.at.y + b.size.y / 2, z: b.at.z + b.size.z / 2 };
}

/** A lid point `r` mm from the hinge along the lid, at `lidAngle` degrees open. */
function lidPoint(fit: Fit, r: number, lidAngle: number): { y: number; z: number } {
  const o = fit.shell.outer;
  const a = (lidAngle * Math.PI) / 180;
  return { y: PLINTH_H + o.z + r * Math.sin(a), z: -o.y / 2 + r * Math.cos(a) };
}

export function viewFor(
  name: ViewName,
  fit: Fit,
  lidAngle: number,
  opt: { shift: number; zoom?: number; lift?: number; part?: Box },
): View {
  const o = fit.shell.outer;
  const W = o.x;
  const D = o.y;
  const H = o.z;
  const span = Math.max(W, D);
  const zoom = opt.zoom ?? 1;
  const lift = (opt.lift ?? 0) * 1000;
  const keys = fit.boxes.find((b) => b.kind === "unit" && b.role === "keys");
  const kbZ = keys ? D / 2 - (keys.at.y + keys.size.y / 2) : 0;
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  // Panel centre, measured from the hinge along the lid.
  const r = panel ? D - (panel.at.y + panel.size.y / 2) : D / 2;
  let az = 0;
  let el = 0;
  let k = 1;
  let t: [number, number, number] = [0, PLINTH_H + H, 0];
  switch (name) {
    case "hero":
      az = -0.62;
      el = 0.4;
      k = 2.55;
      t = [0, PLINTH_H + H + 75, 0];
      break;
    case "finish":
      az = -0.82;
      el = 0.4;
      k = 2.55;
      t = [0, PLINTH_H + H + 75, 0];
      break;
    case "front":
      az = -0.25;
      el = 0.32;
      k = 2.4;
      t = [0, PLINTH_H + H + 80, 0];
      break;
    case "deck":
      az = 0;
      el = 1.12;
      k = 2.05;
      t = [0, PLINTH_H + H, 30];
      break;
    case "keys":
      az = 0;
      el = 1.02;
      k = 1.22;
      t = [0, PLINTH_H + H, kbZ + 4];
      break;
    case "lid": {
      az = Math.PI + 0.42;
      el = 0.3;
      k = 2.3;
      const p = lidPoint(fit, D * 0.5, lidAngle);
      t = [0, p.y, p.z - D * 0.12];
      break;
    }
    case "side":
      az = -Math.PI / 2 + 0.34;
      el = 0.14;
      k = 0.95;
      t = [-W / 2, PLINTH_H + H / 2, 0];
      break;
    case "screen": {
      az = 0;
      el = 0.14;
      k = 2.05;
      const p = lidPoint(fit, r, lidAngle);
      t = [0, p.y, p.z + 20];
      break;
    }
    case "xray":
      az = -0.42;
      el = 0.86;
      k = 2.1;
      t = [0, PLINTH_H + H * 0.5, 10];
      break;
    case "part": {
      az = -0.55;
      el = 0.82;
      k = 0.85;
      t = opt.part ? toWorld(fit, centreOf(opt.part)) : [0, PLINTH_H + H * 0.55, -D * 0.26];
      break;
    }
  }
  t = [t[0], t[1] + lift, t[2]];
  return { az, el, dist: span * k * zoom, target: t, shift: opt.shift };
}
