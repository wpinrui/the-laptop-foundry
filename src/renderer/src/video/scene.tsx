import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Build, Fit } from "../engine";
import { Atmosphere, Lights, PLINTH_H, PLINTH_R, StagedLaptop } from "../foundry/Stage";
import { Reflections } from "../viewer/Scene";
import { token } from "../viewer/theme";
import { type Card, type Line, quarterCaption, type Short, type Shot, shareCaption, unitsCaption } from "./script";

// The quarter's best seller as a vertical short: the narration's lines play
// back to back, each on its own camera shot of the laptop on the menu stage's
// plinth, with captions and the number cards drawn over it. render.tsx steps
// this scene frame by frame and encodes it; nothing here reads a wall clock.

export const W = 1080;
export const H = 1920;
export const FOV = 40;
/** Seconds before the first line, between lines, and after the last. */
const LEAD = 0.4;
const GAP = 0.25;
const TAIL = 1.0;
/** Speaking rate for timing a line when there is no voice, words per second. */
export const SILENT_WPS = 2.7;
const ACCENT = "#f0913d";
const INK = "#efe6dc";
const DISPLAY = '"Barlow Condensed", system-ui, sans-serif';
const BODY = '"IBM Plex Sans", system-ui, sans-serif';

export interface Timeline {
  starts: number[];
  durs: number[];
  total: number;
}

export function timelineOf(durs: number[]): Timeline {
  const starts: number[] = [];
  let t = LEAD;
  for (const d of durs) {
    starts.push(t);
    t += d + GAP;
  }
  return { starts, durs, total: t - GAP + TAIL };
}

/** Which line plays at `t`, and how far through its shot, 0 to 1. A shot runs until the next line starts. */
function at(tl: Timeline, t: number): { i: number; u: number; local: number } {
  let i = 0;
  while (i + 1 < tl.starts.length && t >= tl.starts[i + 1]) i++;
  const start = i === 0 ? 0 : tl.starts[i];
  const end = i + 1 < tl.starts.length ? tl.starts[i + 1] : tl.total;
  const local = Math.max(0, t - start);
  return { i, u: Math.min(1, local / Math.max(0.01, end - start)), local };
}

// ------------------------------------------------------------------ camera

interface Dims {
  w: number;
  d: number;
  h: number;
}

const ease = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Distance that fits a width `w` across the vertical frame. */
function fitDist(w: number): number {
  const half = Math.atan(Math.tan(((FOV / 2) * Math.PI) / 180) * (W / H));
  return w / 2 / Math.tan(half);
}

function around(target: THREE.Vector3, azimuth: number, elevation: number, dist: number): THREE.Vector3 {
  return new THREE.Vector3(
    target.x + Math.sin(azimuth) * Math.cos(elevation) * dist,
    target.y + Math.sin(elevation) * dist,
    target.z + Math.cos(azimuth) * Math.cos(elevation) * dist,
  );
}

/** The camera and the turntable's yaw for a shot at `u` through it. */
function shotView(shot: Shot, u: number, k: Dims, side: number): { pos: THREE.Vector3; target: THREE.Vector3; yaw: number } {
  const e = ease(u);
  const y0 = PLINTH_H;
  // The lid stands at about 112 degrees: its screen's centre is up and behind the hinge.
  const screen = new THREE.Vector3(0, y0 + k.h + 0.46 * k.d, -0.69 * k.d);
  // A three-quarter view with the lid up spans more than the width: leave room round it.
  const full = fitDist(k.w * 1.5);
  switch (shot) {
    case "title": {
      const target = new THREE.Vector3(0, y0 + k.h + 0.3 * k.d + 0.25 * k.w, -0.15 * k.d);
      return { target, pos: around(target, lerp(-0.75, -0.45, e), 0.26, lerp(full * 1.15, full, e)), yaw: 0 };
    }
    case "orbit": {
      const target = new THREE.Vector3(0, y0 + k.h + 0.25 * k.d, -0.15 * k.d);
      return { target, pos: around(target, lerp(-0.9, 0.9, u), 0.32, full * 0.95), yaw: 0 };
    }
    case "keyboard": {
      const x = lerp(-0.18, 0.18, e) * k.w;
      const target = new THREE.Vector3(x, y0 + k.h, -0.12 * k.d);
      return { target, pos: new THREE.Vector3(x * 1.3, target.y + 0.42 * k.w, target.z + 0.4 * k.w), yaw: 0 };
    }
    case "ports": {
      const z = lerp(0.3, -0.3, e) * k.d;
      const target = new THREE.Vector3((side * k.w) / 2, y0 + k.h * 0.5, z);
      return { target, pos: new THREE.Vector3(target.x + side * 0.36 * k.w, target.y + 0.1 * k.w, z + 0.14 * k.w), yaw: 0 };
    }
    case "screen": {
      const normal = new THREE.Vector3(lerp(0.12, -0.08, e), 0.37, 0.93).normalize();
      return { target: screen, pos: screen.clone().addScaledVector(normal, lerp(1.35, 1.1, e) * k.w), yaw: 0 };
    }
    case "lid": {
      const target = screen.clone().add(new THREE.Vector3(0, 0, -0.05 * k.d));
      return { target, pos: around(target, lerp(Math.PI - 0.7, Math.PI - 0.25, e), 0.3, full * 0.75), yaw: 0 };
    }
    case "turn": {
      const target = new THREE.Vector3(0, y0 + k.h + 0.2 * k.d, -0.1 * k.d);
      return { target, pos: around(target, -0.35, 0.16, full * 0.95), yaw: lerp(0, Math.PI * 0.9, u) };
    }
  }
}

function Rig({ lines, tl, time, dims, side, turntable }: {
  lines: Line[];
  tl: Timeline;
  time: RefObject<number>;
  dims: Dims;
  side: number;
  turntable: RefObject<THREE.Group | null>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useFrame(() => {
    const { i, u } = at(tl, time.current);
    const v = shotView(lines[i]?.shot ?? "title", u, dims, side);
    camera.position.copy(v.pos);
    camera.lookAt(v.target);
    if (turntable.current) turntable.current.rotation.y = v.yaw;
  });
  return null;
}

/** Every mesh of the laptop casts a shadow on the plinth. */
function Shadows({ group }: { group: RefObject<THREE.Group | null> }) {
  useFrame(() => {
    group.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  });
  return null;
}

// ------------------------------------------------------------------ overlay

function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number): number {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > 24 && g.measureText(text).width > max) {
    s -= 4;
    g.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha: number) {
  g.save();
  g.globalAlpha = alpha * 0.82;
  g.fillStyle = "#0e0b09";
  g.beginPath();
  g.roundRect(x, y, w, h, 36);
  g.fill();
  g.globalAlpha = alpha;
  g.fillStyle = ACCENT;
  g.fillRect(x, y + 36, 10, h - 72);
  g.restore();
}

/** The caption's words in chunks of a few, each shown for its share of the line. */
function chunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 4 || cur.join(" ").length > 18 || /[.?!:]$/.test(w)) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

function drawCaption(g: CanvasRenderingContext2D, line: Line, local: number, dur: number) {
  const parts = chunks(line.text);
  const total = parts.reduce((a, p) => a + p.length, 0);
  let acc = 0;
  let part = parts[parts.length - 1] ?? "";
  for (const p of parts) {
    acc += p.length;
    if ((local / Math.max(0.01, dur)) * total < acc) {
      part = p;
      break;
    }
  }
  const text = part.toUpperCase();
  fitFont(g, text, 700, 96, DISPLAY, W - 140);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 14;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(text, W / 2, 1480);
  g.fillStyle = INK;
  g.fillText(text, W / 2, 1480);
}

function drawCard(g: CanvasRenderingContext2D, card: Card, short: Short, local: number) {
  if (!card) return;
  const f = short.facts;
  const a = Math.min(1, local / 0.3);
  const rise = (1 - ease(a)) * 40;
  g.save();
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  if (card === "title") {
    g.globalAlpha = a;
    const top = 170 + rise;
    g.fillStyle = ACCENT;
    g.font = `700 44px ${DISPLAY}`;
    g.fillText(`#1 IN ${quarterCaption(f.quarter)}`.toUpperCase(), 90, top);
    g.fillStyle = INK;
    fitFont(g, f.subject.company.toUpperCase(), 600, 64, DISPLAY, W - 180);
    g.fillText(f.subject.company.toUpperCase(), 90, top + 80);
    fitFont(g, f.subject.name.toUpperCase(), 700, 150, DISPLAY, W - 180);
    g.fillText(f.subject.name.toUpperCase(), 90, top + 220);
  } else if (card === "sales") {
    const x = 90;
    const y = 190 + rise;
    panel(g, x, y, W - 180, 520, a);
    g.globalAlpha = a;
    g.fillStyle = ACCENT;
    g.font = `700 44px ${DISPLAY}`;
    g.fillText(`${quarterCaption(f.quarter)} SALES`, x + 60, y + 100);
    g.fillStyle = INK;
    g.font = `700 220px ${DISPLAY}`;
    g.fillText(unitsCaption(f.units), x + 56, y + 310);
    g.font = `400 40px ${BODY}`;
    g.fillText("units", x + 64, y + 370);
    const bw = W - 180 - 120;
    g.fillStyle = "rgba(239,230,220,0.18)";
    g.fillRect(x + 60, y + 420, bw, 26);
    g.fillStyle = ACCENT;
    g.fillRect(x + 60, y + 420, Math.max(8, bw * Math.min(1, f.share) * ease(a)), 26);
    g.fillStyle = INK;
    g.font = `700 48px ${DISPLAY}`;
    g.textAlign = "right";
    g.fillText(shareCaption(f.share), x + 60 + bw, y + 400);
  } else if (card === "stats") {
    const x = 90;
    const rows = f.stats.slice(0, 3);
    const y = 190 + rise;
    panel(g, x, y, W - 180, 110 + rows.length * 150, a);
    g.globalAlpha = a;
    rows.forEach((r, i) => {
      const ry = y + 150 + i * 150;
      g.fillStyle = ACCENT;
      g.font = `700 40px ${DISPLAY}`;
      g.textAlign = "left";
      g.fillText(r.label.toUpperCase(), x + 60, ry);
      g.fillStyle = INK;
      g.font = `700 110px ${DISPLAY}`;
      g.textAlign = "right";
      g.fillText(r.caption, W - 150, ry + 20);
    });
  } else if (card === "score") {
    const cx = W / 2;
    const cy = 480 + rise;
    const r = 230;
    g.globalAlpha = a;
    g.fillStyle = "rgba(14,11,9,0.8)";
    g.beginPath();
    g.arc(cx, cy, r + 40, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 26;
    g.strokeStyle = "rgba(239,230,220,0.18)";
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    const s = f.score;
    if (s !== null) {
      g.strokeStyle = ACCENT;
      g.lineCap = "round";
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s * ease(a)) / 100);
      g.stroke();
    }
    g.fillStyle = INK;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 230px ${DISPLAY}`;
    g.fillText(s === null ? "?" : String(Math.round(s * ease(a))), cx, cy + 10);
    f.awards.slice(-2).forEach((w, i) => {
      const t = w.toUpperCase();
      const ty = cy + r + 110 + i * 90;
      fitFont(g, t, 700, 56, DISPLAY, W - 240);
      const tw = g.measureText(t).width + 70;
      g.fillStyle = ACCENT;
      g.beginPath();
      g.roundRect(cx - tw / 2, ty - 40, tw, 80, 40);
      g.fill();
      g.fillStyle = "#14100d";
      g.fillText(t, cx, ty + 3);
    });
  }
  g.restore();
}

/** One frame's overlay at `t` seconds: the line's card, its caption chunk and the progress bar. */
export function drawOverlay(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, short: Short, tl: Timeline, t: number) {
  const ctx = g as CanvasRenderingContext2D;
  const { i } = at(tl, t);
  const l = short.lines[i];
  const local = t - tl.starts[i];
  if (l) {
    drawCard(ctx, l.card, short, Math.max(0, i === 0 ? t : local));
    if (local >= 0 && local <= tl.durs[i] + GAP) drawCaption(ctx, l, local, tl.durs[i]);
  }
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W * Math.min(1, t / tl.total), 8);
}

/** The short's 3D set: the laptop on the plinth, lit as on the menu stage, the camera on the shot at `time`. */
export function ShortStage({ short, fit, tl, time, onLock }: {
  short: Short;
  fit: Fit;
  tl: Timeline;
  time: RefObject<number>;
  onLock: () => void;
}) {
  const build = short.facts.subject.build as Build;
  const dims = useMemo((): Dims => ({ w: fit.shell.outer.x, d: fit.shell.outer.y, h: fit.shell.outer.z }), [fit]);
  const floor = useMemo(() => new THREE.Color(token("ground")).multiplyScalar(3), []);
  const turntable = useRef<THREE.Group>(null);
  return (
    <>
      <Atmosphere />
      <Reflections intensity={0.12} />
      <Lights />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[20000, 20000]} />
        <meshStandardMaterial color={floor} roughness={1} />
      </mesh>
      <mesh position={[0, PLINTH_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[PLINTH_R, PLINTH_R, PLINTH_H, 96]} />
        <meshStandardMaterial color={token("stage-plinth")} roughness={0.55} metalness={0.3} />
      </mesh>
      <group ref={turntable} position={[0, PLINTH_H, 0]}>
        <StagedLaptop build={build} fit={fit} maker={short.facts.subject.company} model={short.facts.subject.name} onLock={onLock} />
      </group>
      <Shadows group={turntable} />
      <Rig lines={short.lines} tl={tl} time={time} dims={dims} side={short.facts.portSide === "right" ? 1 : -1} turntable={turntable} />
    </>
  );
}
