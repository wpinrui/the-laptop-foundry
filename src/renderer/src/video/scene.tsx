import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Build, Fit } from "../engine";
import { StagedLaptop } from "../foundry/Stage";
import { type Card, quarterCaption, type Short, type ShortFacts, type Shot, shareCaption, unitsCaption } from "./script";
import { type Look, lookKey, SetStage } from "./sets";

// A video of a laptop as a program of cuts: each cut a camera shot of the
// laptop on one of the sets, or a slow b-roll pan round it, with a number
// card over it; each cut names its own set, so a video can move between them; the narration's captions run beside. The quarter shorts play
// their lines back to back, one shot each; a commercial lays its scenes over
// the script's words. render.tsx steps this scene frame by frame and encodes
// it; nothing here reads a wall clock. The sets are in metres, so the laptop,
// modelled in mm, is scaled down.

export type Ratio = "9:16" | "1:1" | "16:9";

/** A video's size in pixels and its vertical field of view. */
export interface Frame {
  w: number;
  h: number;
  fov: number;
}

/** The frame's shorter side spans 42 degrees in every shape, as the sets were dressed for. */
const SHORT_SIDE = 42;
const portraitFov = (w: number, h: number) => (2 * Math.atan(Math.tan((SHORT_SIDE / 2) * (Math.PI / 180)) * (h / w)) * 180) / Math.PI;

export const FRAMES: Record<Ratio, Frame> = {
  "9:16": { w: 1080, h: 1920, fov: portraitFov(1080, 1920) },
  "1:1": { w: 1080, h: 1080, fov: SHORT_SIDE },
  "16:9": { w: 1920, h: 1080, fov: SHORT_SIDE },
};

const MM = 0.001;
/** Seconds before the first line, between lines, and after the last. */
export const LEAD = 0.4;
export const GAP = 0.25;
export const TAIL = 1.0;
/** Speaking rate for timing a line when there is no voice, words per second. */
export const SILENT_WPS = 2.7;
/** The lid on every close-up shot, degrees: their framing is set for it. */
export const SHOT_LID = 112;
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

/** A b-roll pan: one of the showcase angles, at its own lid angle. */
export interface Pan {
  pan: number;
  lid: number;
}

/** One stretch of the video: the set, what the camera does, and the card over it from `cardFrom`. */
export interface Cut {
  start: number;
  end: number;
  look: Look;
  view: Shot | Pan;
  card: Card;
  /** When the card's own animation starts. */
  cardFrom: number;
}

/** A card over the cuts from `start` to `end`, whatever they show, its animation starting at `start`. */
export interface CardSpan {
  card: Card;
  start: number;
  end: number;
}

export interface Caption {
  text: string;
  start: number;
  dur: number;
}

/** Everything a video shows, second by second. */
export interface Program {
  frame: Frame;
  facts: ShortFacts;
  /** The small line over the title card's name. */
  kicker: string;
  /** Back to back from 0 to total. */
  cuts: Cut[];
  /** Cards on a track of their own, over the cuts; when absent, each cut carries its own. */
  cards?: CardSpan[];
  captions: Caption[];
  total: number;
  /** When the poster still is taken. */
  poster: number;
}

/** A short as a program: each line on its shot, all on the one set, until the next line starts. */
export function shortProgram(short: Short, tl: Timeline, look: Look, ratio: Ratio = "9:16"): Program {
  const n = short.lines.length;
  const cuts = short.lines.map((l, i): Cut => ({
    start: i === 0 ? 0 : tl.starts[i],
    end: i + 1 < n ? tl.starts[i + 1] : tl.total,
    look,
    view: l.shot,
    card: l.card,
    cardFrom: i === 0 ? 0 : tl.starts[i],
  }));
  // The poster: midway through the first wide shot of the laptop.
  const wide = Math.max(
    0,
    short.lines.findIndex((l) => l.shot === "title" || l.shot === "orbit"),
  );
  const c = cuts[wide];
  return {
    frame: FRAMES[ratio],
    facts: short.facts,
    kicker: `#1 IN ${quarterCaption(short.facts.quarter)}`,
    cuts,
    captions: short.lines.map((l, i) => ({ text: l.text, start: tl.starts[i], dur: tl.durs[i] })),
    total: tl.total,
    poster: c ? (c.start + c.end) / 2 : 0,
  };
}

/** The cut playing at `t`, and how far through it, 0 to 1. */
export function cutAt(p: Program, t: number): { cut: Cut | undefined; u: number } {
  let i = 0;
  while (i + 1 < p.cuts.length && t >= p.cuts[i + 1].start) i++;
  const cut = p.cuts[i];
  if (!cut) return { cut, u: 0 };
  return { cut, u: Math.min(1, Math.max(0, t - cut.start) / Math.max(0.01, cut.end - cut.start)) };
}

/** The set and the lid angle at `t`: the cut's set, a pan's own lid or the shots'. */
export function stageAt(p: Program, t: number): { look: Look; lid: number } {
  const c = cutAt(p, t).cut;
  const v = c?.view;
  return { look: c?.look ?? p.cuts[0]?.look ?? { set: "desk", paper: 0 }, lid: v && typeof v === "object" ? v.lid : SHOT_LID };
}

/** Every set the program uses, once each. */
export function looksOf(p: Program): Look[] {
  const seen = new Map<string, Look>();
  for (const c of p.cuts) seen.set(lookKey(c.look), c.look);
  return [...seen.values()];
}

// ------------------------------------------------------------------ camera

interface Dims {
  w: number;
  d: number;
  h: number;
}

const ease = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Distance that fits a width `w` across the frame's shorter side. */
function fitDist(w: number): number {
  return w / 2 / Math.tan(((SHORT_SIDE / 2) * Math.PI) / 180);
}

function around(target: THREE.Vector3, azimuth: number, elevation: number, dist: number): THREE.Vector3 {
  return new THREE.Vector3(
    target.x + Math.sin(azimuth) * Math.cos(elevation) * dist,
    target.y + Math.sin(elevation) * dist,
    target.z + Math.cos(azimuth) * Math.cos(elevation) * dist,
  );
}

/**
 * The camera for a shot at `u` through it, round a laptop whose bottom centre
 * is the origin. Every position stays within about 0.8 m of the laptop, inside
 * the 1 m the sets keep clear.
 */
function shotView(shot: Shot, u: number, k: Dims, side: number): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const e = ease(u);
  const y0 = 0;
  // The lid stands at about 112 degrees: its screen's centre is up and behind the hinge.
  const screen = new THREE.Vector3(0, y0 + k.h + 0.46 * k.d, -0.69 * k.d);
  // A three-quarter view with the lid up spans more than the width: leave room round it.
  const full = fitDist(k.w * 1.5);
  switch (shot) {
    case "title": {
      const target = new THREE.Vector3(0, y0 + k.h + 0.3 * k.d + 0.25 * k.w, -0.15 * k.d);
      return { target, pos: around(target, lerp(-0.75, -0.45, e), 0.26, lerp(full * 1.15, full, e)) };
    }
    case "orbit": {
      const target = new THREE.Vector3(0, y0 + k.h + 0.25 * k.d, -0.15 * k.d);
      return { target, pos: around(target, lerp(-0.9, 0.9, u), 0.32, full * 0.95) };
    }
    case "keyboard": {
      const x = lerp(-0.18, 0.18, e) * k.w;
      const target = new THREE.Vector3(x, y0 + k.h, -0.12 * k.d);
      return { target, pos: new THREE.Vector3(x * 1.3, target.y + 0.42 * k.w, target.z + 0.4 * k.w) };
    }
    case "ports": {
      const z = lerp(0.3, -0.3, e) * k.d;
      const target = new THREE.Vector3((side * k.w) / 2, y0 + k.h * 0.5, z);
      return { target, pos: new THREE.Vector3(target.x + side * 0.36 * k.w, target.y + 0.1 * k.w, z + 0.14 * k.w) };
    }
    case "screen": {
      const normal = new THREE.Vector3(lerp(0.12, -0.08, e), 0.37, 0.93).normalize();
      return { target: screen, pos: screen.clone().addScaledVector(normal, lerp(1.35, 1.1, e) * k.w) };
    }
    case "lid": {
      const target = screen.clone().add(new THREE.Vector3(0, 0, -0.05 * k.d));
      return { target, pos: around(target, lerp(Math.PI - 0.7, Math.PI - 0.25, e), 0.3, full * 0.75) };
    }
    case "hero": {
      // A low three-quarter from the front right, easing in: the laptop at its most heroic.
      const target = new THREE.Vector3(0, y0 + k.h + 0.3 * k.d, -0.15 * k.d);
      return { target, pos: around(target, lerp(0.62, 0.46, e), lerp(0.08, 0.14, e), lerp(full * 1.05, full * 0.92, e)) };
    }
    case "glance": {
      // The display close, from the side, raking across its face.
      return { target: screen, pos: around(screen, side * lerp(0.85, 0.6, e), lerp(0.28, 0.34, e), lerp(0.95, 0.8, e) * k.w) };
    }
    case "side": {
      // Level with the deck, side on: how thin it is.
      const target = new THREE.Vector3(0, y0 + k.h + 0.15 * k.d, -0.1 * k.d);
      return { target, pos: around(target, side * lerp(Math.PI / 2 - 0.12, Math.PI / 2 + 0.04, e), lerp(0.03, 0.07, e), lerp(full * 0.95, full * 0.82, e)) };
    }
    case "top": {
      // High over the deck, drifting across it.
      const target = new THREE.Vector3(0, y0 + k.h, -0.1 * k.d);
      return { target, pos: around(target, lerp(-0.3, 0.3, u), 1.2, full * 0.85) };
    }
    case "push": {
      // A low dolly straight in on the laptop.
      const target = new THREE.Vector3(0, y0 + k.h + 0.25 * k.d, -0.15 * k.d);
      return { target, pos: around(target, lerp(0.12, 0.04, e), lerp(0.05, 0.12, e), lerp(full * 1.15, full * 0.7, e)) };
    }
    case "turn": {
      // A slow orbit from the front round to the right side, rising a little. It stops short of the
      // back: a dark lid from behind fills the frame with black.
      const target = new THREE.Vector3(0, y0 + k.h + 0.2 * k.d, -0.1 * k.d);
      return { target, pos: around(target, lerp(-0.35, Math.PI * 0.45, u), lerp(0.16, 0.3, u), full * 0.95) };
    }
  }
}

/**
 * The b-roll's showcase angles, each a slow pan: front three-quarter, low
 * hero, side profile, over the deck and rear three-quarter. Azimuth from the
 * front, elevation, and distance as a share of the full-laptop distance.
 */
export const PANS: { az: [number, number]; el: [number, number]; dist: number; lift: number }[] = [
  { az: [-0.85, -0.55], el: [0.28, 0.24], dist: 1, lift: 0.25 },
  { az: [0.22, -0.12], el: [0.04, 0.08], dist: 0.9, lift: 0.35 },
  { az: [Math.PI / 2 - 0.12, Math.PI / 2 + 0.08], el: [0.12, 0.16], dist: 0.95, lift: 0.2 },
  { az: [-0.18, 0.18], el: [0.95, 0.85], dist: 0.8, lift: 0 },
  { az: [Math.PI - 0.85, Math.PI - 0.55], el: [0.3, 0.26], dist: 1, lift: 0.25 },
];

function panView(p: Pan, u: number, k: Dims): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const a = PANS[p.pan % PANS.length];
  // A lower lid makes a lower laptop: aim between the deck and the lid's top.
  const up = Math.sin((Math.min(p.lid, 90) * Math.PI) / 180) * k.d;
  const target = new THREE.Vector3(0, k.h + a.lift * up, -0.1 * k.d);
  return { target, pos: around(target, lerp(a.az[0], a.az[1], u), lerp(a.el[0], a.el[1], u), fitDist(k.w * 1.5) * a.dist) };
}

function Rig({ program, time, dims, side, anchor }: {
  program: Program;
  time: RefObject<number>;
  dims: Dims;
  side: number;
  anchor: THREE.Vector3;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useFrame(() => {
    const f = program.frame;
    if (camera.fov !== f.fov) {
      camera.fov = f.fov;
      camera.updateProjectionMatrix();
    }
    // Landscape: the laptop sits right of centre, leaving the left for the cards.
    const shift = f.w > f.h ? -0.12 * f.w : 0;
    if ((camera.view?.enabled ? camera.view.offsetX : 0) !== shift) {
      if (shift) camera.setViewOffset(f.w, f.h, shift, 0, f.w, f.h);
      else camera.clearViewOffset();
    }
    const { cut, u } = cutAt(program, time.current);
    const view = cut?.view ?? "title";
    // The train's window wall stands close on the left: a side-on shot from there is behind it.
    const from = view === "side" && cut?.look.set === "train" ? 1 : side;
    const v = typeof view === "object" ? panView(view, u, dims) : shotView(view, u, dims, from);
    camera.position.copy(v.pos.add(anchor));
    camera.lookAt(v.target.add(anchor));
  });
  return null;
}

/** Every mesh of the laptop casts a shadow on the set. */
function Shadows({ group }: { group: RefObject<THREE.Group | null> }) {
  useFrame(() => {
    group.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  });
  return null;
}

// ------------------------------------------------------------------ overlay

/** Where the cards and captions go in a frame: the cards in a box at the top, or on the left of a landscape frame. */
function layoutOf(f: Frame): { x: number; y: number; w: number; k: number; caption: number } {
  if (f.w > f.h) return { x: 90, y: 110, w: 820, k: 0.85, caption: f.h - 130 };
  if (f.w === f.h) return { x: 140, y: 60, w: f.w - 280, k: 0.75, caption: f.h - 120 };
  return { x: 90, y: 190, w: f.w - 180, k: 1, caption: 1480 };
}

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

function drawCaption(g: CanvasRenderingContext2D, f: Frame, c: Caption, local: number) {
  const parts = chunks(c.text);
  const total = parts.reduce((a, p) => a + p.length, 0);
  let acc = 0;
  let part = parts[parts.length - 1] ?? "";
  for (const p of parts) {
    acc += p.length;
    if ((local / Math.max(0.01, c.dur)) * total < acc) {
      part = p;
      break;
    }
  }
  const text = part.toUpperCase();
  const y = layoutOf(f).caption;
  fitFont(g, text, 700, 96, DISPLAY, f.w - 140);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 14;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(text, f.w / 2, y);
  g.fillStyle = INK;
  g.fillText(text, f.w / 2, y);
}

/** `text` broken into lines no wider than `max` in the current font, at most `most` of them. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number, most: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && g.measureText(next).width > max) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  if (out.length > most) {
    out.length = most;
    out[most - 1] = `${out[most - 1].replace(/[,.;:]?$/, "")}...`;
  }
  return out;
}

/** The end card: the brand over the whole frame, the shot dimmed behind it. */
function drawLogo(g: CanvasRenderingContext2D, p: Program, local: number) {
  const { w: fw, h: fh } = p.frame;
  const f = p.facts;
  const a = Math.min(1, local / 0.4);
  const s = Math.min(fw, fh) / 1080;
  const rise = (1 - ease(a)) * 30 * s;
  g.save();
  g.globalAlpha = a * 0.72;
  g.fillStyle = "#0e0b09";
  g.fillRect(0, 0, fw, fh);
  g.globalAlpha = a;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const cy = fh * 0.46 + rise;
  g.fillStyle = ACCENT;
  fitFont(g, f.subject.company.toUpperCase(), 700, 200 * s, DISPLAY, fw * 0.8);
  g.fillText(f.subject.company.toUpperCase(), fw / 2, cy);
  const rule = Math.min(fw * 0.5, 420 * s) * ease(a);
  g.fillRect(fw / 2 - rule / 2, cy + 40 * s, rule, 8 * s);
  g.fillStyle = INK;
  fitFont(g, f.subject.name.toUpperCase(), 600, 90 * s, DISPLAY, fw * 0.8);
  g.fillText(f.subject.name.toUpperCase(), fw / 2, cy + 150 * s);
  g.font = `400 ${Math.round(44 * s)}px ${BODY}`;
  g.fillText(p.kicker, fw / 2, cy + 230 * s);
  g.restore();
}

/** A card, drawn in its own box `w` wide from the layout's corner, at its scale. */
function drawCard(g: CanvasRenderingContext2D, p: Program, card: Card, local: number) {
  if (!card) return;
  if (card === "logo") return drawLogo(g, p, local);
  const f = p.facts;
  const L = layoutOf(p.frame);
  const w = L.w / L.k;
  const a = Math.min(1, local / 0.3);
  const rise = (1 - ease(a)) * 40;
  g.save();
  g.translate(L.x, L.y);
  g.scale(L.k, L.k);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  if (card === "title") {
    g.globalAlpha = a;
    // No panel behind the title: a soft shadow keeps it readable over a busy shot.
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 28;
    g.shadowOffsetY = 4;
    const top = rise - 20;
    g.fillStyle = ACCENT;
    g.font = `700 44px ${DISPLAY}`;
    g.fillText(p.kicker.toUpperCase(), 0, top);
    g.fillStyle = INK;
    fitFont(g, f.subject.company.toUpperCase(), 600, 64, DISPLAY, w);
    g.fillText(f.subject.company.toUpperCase(), 0, top + 80);
    fitFont(g, f.subject.name.toUpperCase(), 700, 150, DISPLAY, w);
    g.fillText(f.subject.name.toUpperCase(), 0, top + 220);
  } else if (card === "sales") {
    const y = rise;
    panel(g, 0, y, w, 520, a);
    g.globalAlpha = a;
    g.fillStyle = ACCENT;
    g.font = `700 44px ${DISPLAY}`;
    g.fillText(`${quarterCaption(f.quarter)} SALES`, 60, y + 100);
    g.fillStyle = INK;
    g.font = `700 220px ${DISPLAY}`;
    g.fillText(unitsCaption(f.units), 56, y + 310);
    g.font = `400 40px ${BODY}`;
    g.fillText("units", 64, y + 370);
    const bw = w - 120;
    g.fillStyle = "rgba(239,230,220,0.18)";
    g.fillRect(60, y + 420, bw, 26);
    g.fillStyle = ACCENT;
    g.fillRect(60, y + 420, Math.max(8, bw * Math.min(1, f.share) * ease(a)), 26);
    g.fillStyle = INK;
    g.font = `700 48px ${DISPLAY}`;
    g.textAlign = "right";
    g.fillText(shareCaption(f.share), 60 + bw, y + 400);
  } else if (card === "stats") {
    const rows = f.stats.slice(0, 3);
    const y = rise;
    panel(g, 0, y, w, 110 + rows.length * 150, a);
    g.globalAlpha = a;
    rows.forEach((r, i) => {
      const ry = y + 150 + i * 150;
      g.fillStyle = ACCENT;
      g.font = `700 40px ${DISPLAY}`;
      g.textAlign = "left";
      g.fillText(r.label.toUpperCase(), 60, ry);
      g.fillStyle = INK;
      g.font = `700 110px ${DISPLAY}`;
      g.textAlign = "right";
      g.fillText(r.caption, w - 60, ry + 20);
    });
  } else if (card === "price") {
    const y = rise;
    panel(g, 0, y, w, 400, a);
    g.globalAlpha = a;
    g.fillStyle = ACCENT;
    fitFont(g, f.kind.toUpperCase(), 700, 44, DISPLAY, w - 120);
    g.fillText(f.kind.toUpperCase(), 60, y + 100);
    g.fillStyle = INK;
    fitFont(g, p.kicker, 700, 210, DISPLAY, w - 120);
    g.fillText(p.kicker, 56, y + 290);
    g.font = `400 40px ${BODY}`;
    g.fillText(`${f.subject.company} ${f.subject.name}`, 64, y + 350);
  } else if (card === "spec") {
    const top = f.stats[0];
    if (top) {
      const y = rise;
      panel(g, 0, y, w, 400, a);
      g.globalAlpha = a;
      g.fillStyle = ACCENT;
      g.font = `700 44px ${DISPLAY}`;
      g.fillText(top.label.toUpperCase(), 60, y + 100);
      g.fillStyle = INK;
      fitFont(g, top.caption, 700, 240, DISPLAY, w - 120);
      g.fillText(top.caption, 56, y + 320);
    }
  } else if (card === "chips") {
    const rows = [
      ["PROCESSOR", f.cpu],
      ["GRAPHICS", f.gpu],
    ].filter(([, v]) => !!v);
    const y = rise;
    panel(g, 0, y, w, 90 + rows.length * 190, a);
    g.globalAlpha = a;
    rows.forEach(([label, v], i) => {
      const ry = y + 100 + i * 190;
      g.fillStyle = ACCENT;
      g.font = `700 40px ${DISPLAY}`;
      g.fillText(label, 60, ry);
      g.fillStyle = INK;
      fitFont(g, v, 700, 96, DISPLAY, w - 120);
      g.fillText(v, 56, ry + 100);
    });
  } else if (card === "quote") {
    const said = f.pros[0] ?? f.kind;
    const y = rise;
    g.font = `600 64px ${BODY}`;
    const lines = wrap(g, `${said.charAt(0).toUpperCase()}${said.slice(1)}.`.replace(/\.\.$/, "."), w - 120, 3);
    const h = 170 + lines.length * 82 + (f.score !== null ? 110 : 0);
    panel(g, 0, y, w, h, a);
    g.globalAlpha = a;
    g.fillStyle = ACCENT;
    g.font = `700 180px ${DISPLAY}`;
    g.fillText("“", 50, y + 170);
    g.fillStyle = INK;
    g.font = `600 64px ${BODY}`;
    lines.forEach((l, i) => g.fillText(l, 60, y + 190 + i * 82));
    if (f.score !== null) {
      const t = `${f.score} / 100`;
      g.font = `700 52px ${DISPLAY}`;
      const tw = g.measureText(t).width + 60;
      const py = y + 190 + lines.length * 82;
      g.fillStyle = ACCENT;
      g.beginPath();
      g.roundRect(60, py - 10, tw, 76, 38);
      g.fill();
      g.fillStyle = "#14100d";
      g.textBaseline = "middle";
      g.fillText(t, 90, py + 30);
    }
  } else if (card === "launch") {
    g.globalAlpha = a;
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 28;
    g.shadowOffsetY = 4;
    const top = rise + 170;
    g.fillStyle = ACCENT;
    g.font = `700 230px ${DISPLAY}`;
    g.fillText("NEW", -6, top);
    g.fillStyle = INK;
    fitFont(g, f.subject.name.toUpperCase(), 700, 110, DISPLAY, w);
    g.fillText(f.subject.name.toUpperCase(), 0, top + 120);
    g.font = `600 56px ${DISPLAY}`;
    g.fillText(f.mine && f.units > 0 ? `OUT NOW, ${quarterCaption(f.quarter)}` : `OUT NOW, ${f.quarter.year}`, 0, top + 200);
  } else if (card === "score") {
    const cx = w / 2;
    const cy = 290 + rise;
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
    f.awards.slice(-2).forEach((aw, i) => {
      const t = aw.toUpperCase();
      const ty = cy + r + 110 + i * 90;
      fitFont(g, t, 700, 56, DISPLAY, w - 60);
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

/** One frame's overlay at `t` seconds: the cut's card, the caption's chunk and the progress bar. */
export function drawOverlay(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, p: Program, t: number) {
  const ctx = g as CanvasRenderingContext2D;
  if (p.cards) {
    const on = p.cards.find((c) => t >= c.start && t < c.end);
    if (on) drawCard(ctx, p, on.card, t - on.start);
  } else {
    const { cut } = cutAt(p, t);
    if (cut) drawCard(ctx, p, cut.card, Math.max(0, t - cut.cardFrom));
  }
  for (const c of p.captions) {
    const local = t - c.start;
    if (local >= 0 && local <= c.dur + GAP) {
      drawCaption(ctx, p.frame, c, local);
      break;
    }
  }
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, p.frame.w * Math.min(1, t / p.total), 8);
}

/** Puts the set and the lid of the cut at `t` in the scene; resolves once both are in and drawn. */
export type StageControl = { current: ((t: number) => Promise<void>) | null };

/**
 * The video's 3D set: the laptop on the cut's set, the camera on the cut at
 * `time`. The set and the lid change between cuts: `control` hands the
 * renderer a way to change them and wait until they are in; `follow` changes
 * them from `time` every frame, for a live preview.
 */
export function VideoStage({ program, fit, time, onScreen, onSet, control, follow = false }: {
  program: Program;
  fit: Fit;
  time: RefObject<number>;
  /** Once the laptop's desktop is on its screen. */
  onScreen: () => void;
  /** Once the first set is in. */
  onSet: () => void;
  control?: StageControl;
  follow?: boolean;
}) {
  const subject = program.facts.subject;
  const build = subject.build as Build;
  const dims = useMemo((): Dims => ({ w: fit.shell.outer.x * MM, d: fit.shell.outer.y * MM, h: fit.shell.outer.z * MM }), [fit]);
  const laptop = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const [want, setWant] = useState(() => stageAt(program, time.current ?? 0));
  const key = lookKey(want.look);
  // The set in the scene, by its key, and where the laptop stands on it.
  const [placed, setPlaced] = useState<{ key: string; anchor: THREE.Vector3 } | null>(null);
  const waiting = useRef<{ key: string; lid: number; done: () => void }[]>([]);
  const shown = useRef<{ key: string; lid: number } | null>(null);
  const first = useRef<(() => void) | null>(onSet);
  const ready = useCallback(
    (a: THREE.Vector3) => {
      setPlaced({ key, anchor: a.clone() });
      first.current?.();
      first.current = null;
    },
    [key],
  );
  const set = useCallback((t: number) => {
    const next = stageAt(program, t);
    const k = lookKey(next.look);
    const now = shown.current;
    if (now && now.key === k && now.lid === next.lid) return Promise.resolve();
    return new Promise<void>((r) => {
      waiting.current.push({ key: k, lid: next.lid, done: r });
      setWant((w) => (lookKey(w.look) === k && w.lid === next.lid ? w : next));
    });
  }, [program]);
  if (control) control.current = set;
  // The set and the lid are in, the set's and the hinge parts' own effects run first: the shadow is drawn again and whoever waited goes on.
  useEffect(() => {
    if (placed?.key !== key) return;
    shown.current = { key, lid: want.lid };
    gl.shadowMap.needsUpdate = true;
    const done = (w: { key: string; lid: number }) => w.key === key && w.lid === want.lid;
    for (const w of waiting.current) if (done(w)) w.done();
    waiting.current = waiting.current.filter((w) => !done(w));
  }, [placed, key, want.lid, gl]);
  useFrame(() => {
    if (follow) void set(time.current);
  });
  const anchor = placed?.anchor ?? null;
  return (
    <>
      <Suspense fallback={null}>
        <SetStage key={key} look={want.look} onReady={ready} />
      </Suspense>
      {anchor && (
        <>
          <group ref={laptop} position={anchor} scale={MM}>
            <StagedLaptop build={build} fit={fit} maker={subject.company} model={subject.name} rival={subject.maker} screen="desktop" onScreen={onScreen} lidAngle={want.lid} />
          </group>
          <Shadows group={laptop} />
          <Rig program={program} time={time} dims={dims} side={program.facts.portSide === "right" ? 1 : -1} anchor={anchor} />
        </>
      )}
    </>
  );
}
