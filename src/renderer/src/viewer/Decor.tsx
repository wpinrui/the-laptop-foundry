import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Fit, Mark, MarkSurface } from "../engine";
import { token } from "./theme";

// The player's decoration on the Model: the bezel's own colour, and text or
// SVG marks on the lid, palm rest, bottom and bezel. Each surface is one
// canvas laid over its face, so the marks show wherever the Model is drawn,
// the review photos included. Units are engine mm.

/** A surface's face: its size, and its reading frame in engine space. */
export interface Face {
  w: number;
  h: number;
  /** Centre of the face, engine mm. */
  at: [number, number, number];
  /** Euler turning a plane (x right, y up, facing +z) onto the face. */
  rot: [number, number, number];
}

/** Faces in engine space: palm and bottom in the base's frame, lid and bezel in the closed lid's. */
export function faceOf(fit: Fit, surface: MarkSurface): Face {
  const o = fit.shell.outer;
  const lid = fit.shell.lid;
  switch (surface) {
    case "palm":
      return { w: o.x, h: o.y, at: [o.x / 2, o.y / 2, o.z + 0.06], rot: [0, 0, 0] };
    case "bottom":
      // Read from below: right is the laptop's left.
      return { w: o.x, h: o.y, at: [o.x / 2, o.y / 2, -0.06], rot: [0, Math.PI, 0] };
    case "lid":
      // Read from behind the open lid: up runs away from the hinge, right is the laptop's left.
      return { w: o.x, h: o.y, at: [o.x / 2, o.y / 2, lid.at.z + lid.size.z + 0.06], rot: [0, 0, Math.PI] };
    case "bezel":
      // The lid's front face, read from the front with the lid open.
      return { w: o.x, h: o.y, at: [o.x / 2, o.y / 2, lid.at.z - 0.14], rot: [Math.PI, 0, 0] };
  }
}

const measure = document.createElement("canvas").getContext("2d");

export function fontOf(m: Mark, px: number): string {
  return `${m.weight} ${Math.max(1, Math.round(px))}px "${m.font}"`;
}

/** Aspect of an SVG from its viewBox or size. */
export function svgAspect(svg: string | undefined): number {
  if (!svg) return 1;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  if (vb) return Number(vb[1]) / Math.max(0.001, Number(vb[2]));
  const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const h = /\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  return w && h ? Number(w[1]) / Math.max(0.001, Number(h[1])) : 1;
}

export const outlined = (m: Mark) => m.style === "outline";

/** An outlined mark's line width in mm. */
export function strokeOf(m: Mark): number {
  return m.stroke ?? Math.max(0.2, Math.round(m.size * 0.05 * 10) / 10);
}

/** The mark's width and height in mm, an outline's line included. */
export function markExtent(m: Mark): { w: number; h: number } {
  const line = outlined(m) ? strokeOf(m) : 0;
  if (m.kind === "svg") return { w: m.size * svgAspect(m.svg) + line, h: m.size + line };
  if (!measure) return { w: m.text.length * m.size * 0.6 + line, h: m.size + line };
  const px = 100;
  measure.font = fontOf(m, px);
  (measure as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(m.tracking / 1000) * px}px`;
  const w = measure.measureText(m.text || " ").width / px;
  return { w: w * m.size + line, h: m.size * 1.1 + line };
}

const SHAPES = "path,rect,circle,ellipse,line,polyline,polygon,text,tspan";

/** The SVG with every shape drawn as a line of the mark's width instead of filled, its viewBox grown to hold the line. */
function outlineSvg(svg: string, m: Mark): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const vb = (root.getAttribute("viewBox") ?? "0 0 1 1").split(/[\s,]+/).map(Number);
  const sw = (strokeOf(m) * (vb[3] || 1)) / Math.max(0.1, m.size);
  for (const el of Array.from(root.querySelectorAll(SHAPES))) {
    if (el.closest("mask, clipPath, clippath")) continue;
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "#000");
    el.setAttribute("stroke-width", String(sw));
    el.setAttribute("stroke-linejoin", "round");
    el.removeAttribute("stroke-dasharray");
  }
  const grown = [vb[0] - sw / 2, vb[1] - sw / 2, vb[2] + sw, vb[3] + sw];
  root.setAttribute("viewBox", grown.join(" "));
  root.setAttribute("width", "1024");
  root.setAttribute("height", String(Math.round((1024 * grown[3]) / grown[2])));
  return new XMLSerializer().serializeToString(doc);
}

function svgUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

function drawFace(face: Face, marks: Mark[], canvas: HTMLCanvasElement, S: number, images: Map<string, HTMLImageElement>) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (const m of marks) {
    const cx = (face.w / 2 + m.x) * S;
    const cy = (face.h / 2 - m.y) * S;
    g.save();
    const alpha = (m.process === "etched" ? 0.62 : 1) * (m.ghost ? 0.45 : 1);
    g.globalAlpha = alpha;
    if (m.kind === "text") {
      const px = m.size * S;
      g.font = fontOf(m, px);
      (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(m.tracking / 1000) * px}px`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = strokeOf(m) * S;
      g.lineJoin = "round";
      const paint = (colour: string, x: number, y: number) => {
        if (outlined(m)) {
          g.strokeStyle = colour;
          g.strokeText(m.text, x, y);
        } else {
          g.fillStyle = colour;
          g.fillText(m.text, x, y);
        }
      };
      if (m.process === "embossed") {
        // A raised edge: shadow below right, light above left.
        g.globalAlpha = 0.45;
        paint(token("picker-black"), cx + px * 0.04, cy + px * 0.05);
        g.globalAlpha = 0.35;
        paint(token("picker-white"), cx - px * 0.03, cy - px * 0.03);
        g.globalAlpha = alpha;
      }
      paint(m.colour, cx, cy);
    } else {
      const img = images.get(m.id);
      if (img?.complete && img.naturalWidth > 0) {
        const e = markExtent(m);
        const h = e.h * S;
        const w = e.w * S;
        // Tint: the SVG's shape in the mark's colour, unless it keeps its own.
        const tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(w));
        tmp.height = Math.max(1, Math.round(h));
        const t = tmp.getContext("2d");
        if (t) {
          t.drawImage(img, 0, 0, tmp.width, tmp.height);
          if (!m.original || outlined(m)) {
            t.globalCompositeOperation = "source-in";
            t.fillStyle = m.colour;
            t.fillRect(0, 0, tmp.width, tmp.height);
          }
          if (m.process === "embossed") {
            g.globalAlpha = 0.45;
            g.filter = "brightness(0)";
            g.drawImage(tmp, cx - w / 2 + h * 0.04, cy - h / 2 + h * 0.05);
            g.filter = "none";
            g.globalAlpha = alpha;
          }
          g.drawImage(tmp, cx - w / 2, cy - h / 2);
        }
      }
    }
    g.restore();
  }
}

function FaceMarks({ face, marks }: { face: Face; marks: Mark[] }) {
  const key = JSON.stringify(marks);
  const made = useMemo(() => {
    const S = Math.min(8, 2048 / Math.max(face.w, face.h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(16, Math.round(face.w * S));
    canvas.height = Math.max(16, Math.round(face.h * S));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const images = new Map<string, HTMLImageElement>();
    const urls: string[] = [];
    const redraw = () => {
      drawFace(face, marks, canvas, S, images);
      tex.needsUpdate = true;
    };
    for (const m of marks)
      if (m.kind === "svg" && m.svg) {
        const img = new Image();
        const url = svgUrl(outlined(m) ? outlineSvg(m.svg, m) : m.svg);
        urls.push(url);
        img.onload = redraw;
        img.src = url;
        images.set(m.id, img);
      }
    redraw();
    for (const m of marks)
      if (m.kind === "text")
        document.fonts
          ?.load(fontOf(m, 40))
          .then(redraw)
          .catch(() => {});
    return { tex, urls };
    // biome-ignore lint/correctness/useExhaustiveDependencies: redrawn when the marks' content changes
  }, [key, face.w, face.h]);
  useEffect(
    () => () => {
      made.tex.dispose();
      for (const u of made.urls) URL.revokeObjectURL(u);
    },
    [made],
  );
  return (
    <mesh position={face.at} rotation={face.rot} renderOrder={3}>
      <planeGeometry args={[face.w, face.h]} />
      <meshStandardMaterial
        map={made.tex}
        transparent
        depthWrite={false}
        roughness={0.4}
        metalness={0.3}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

/** Marks on the base's faces (palm rest and bottom), in the base's engine space. */
export function BaseMarks({ fit, marks }: { fit: Fit; marks: Mark[] | undefined }) {
  const palm = (marks ?? []).filter((m) => m.surface === "palm");
  const bottom = (marks ?? []).filter((m) => m.surface === "bottom");
  return (
    <>
      {palm.length > 0 && <FaceMarks face={faceOf(fit, "palm")} marks={palm} />}
      {bottom.length > 0 && <FaceMarks face={faceOf(fit, "bottom")} marks={bottom} />}
    </>
  );
}

/** Marks on the lid's back and bezel, in the closed lid's engine space. The bezel colour is the lid front the Model draws. */
export function LidDecor({ fit, marks }: { fit: Fit; marks: Mark[] | undefined }) {
  const lid = (marks ?? []).filter((m) => m.surface === "lid");
  const onBezel = (marks ?? []).filter((m) => m.surface === "bezel");
  return (
    <>
      {lid.length > 0 && <FaceMarks face={faceOf(fit, "lid")} marks={lid} />}
      {onBezel.length > 0 && <FaceMarks face={faceOf(fit, "bezel")} marks={onBezel} />}
    </>
  );
}
