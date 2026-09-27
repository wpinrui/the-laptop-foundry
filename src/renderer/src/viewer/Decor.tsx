import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { type Fit, type Mark, type MarkSurface, outerSection, outerSpanAt } from "../engine";
import { planDistance } from "../engine/shell";
import { useStable } from "./stable";
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
  /** How far the surface stands off the plane along its facing, at a point (x right, y up from the centre), where the body shapes it. */
  bulge?: (u: number, v: number) => number;
  /** Whether a point (x right, y up from the centre) lies on the face's flat part, the only part marks print on. */
  flat?: (u: number, v: number) => boolean;
}

/** Steepest slope a mark still prints over, rise per run. */
const STEEP = 0.3;

/** Whether the surface is gentle at a point: no steeper than STEEP either way. */
function gentle(f: (u: number, v: number) => number, u: number, v: number): boolean {
  const d = 0.5;
  return Math.abs(f(u + d, v) - f(u - d, v)) <= 2 * d * STEEP && Math.abs(f(u, v + d) - f(u, v - d)) <= 2 * d * STEEP;
}

/** Faces in engine space: palm and bottom in the base's frame, lid and bezel in the closed lid's. */
export function faceOf(fit: Pick<Fit, "shell">, surface: MarkSurface): Face {
  const o = fit.shell.outer;
  const lid = fit.shell.lid;
  const style = fit.shell.style;
  const L = lid.size.y;
  // The base's top and bottom follow its section along the depth (a taper, a shelf, a spine).
  const shaped = !!style.taper || style.D > 0 || style.Sd > 0 || style.lip > 0 || !!style.bevel || style.q > 0 || !!style.pm;
  // On a perimeter body the faces also curve away toward the sides: x is the plane's u, mirrored on the bottom.
  const section = (v: number, x = o.x / 2) => {
    const y = Math.min(o.y, Math.max(0, o.y / 2 + v));
    if (style.pm) return outerSpanAt(style, o, Math.min(o.x, Math.max(0, x)), y);
    return outerSection(style, o, y) ?? [0, o.z];
  };
  // Marks stay off the plan's rounded or cut corners and the edge profile.
  const inPlan = (x: number, y: number, W: number, H: number) =>
    planDistance(x, y, W, H, style.corner, style.cornerKind === "chamfer") >= (style.pm ? 0 : style.profile);
  const palmBulge = (u: number, v: number) => section(v, o.x / 2 + u)[1] - o.z;
  const bottomBulge = (u: number, v: number) => -section(v, o.x / 2 - u)[0];
  // On a perimeter body the flat face is where the edge zones leave the full height; elsewhere where the shape is gentle.
  const baseFlat = (bulge: (u: number, v: number) => number) => (u: number, v: number) => {
    if (!inPlan(o.x / 2 + u, o.y / 2 + v, o.x, o.y)) return false;
    if (style.pm) return Math.abs(bulge(u, v)) < 0.05;
    return !shaped || gentle(bulge, u, v);
  };
  switch (surface) {
    case "palm":
      return {
        w: o.x,
        h: o.y,
        at: [o.x / 2, o.y / 2, o.z + 0.06],
        rot: [0, 0, 0],
        ...(shaped ? { bulge: palmBulge } : {}),
        flat: baseFlat(palmBulge),
      };
    case "bottom":
      // Read from below: right is the laptop's left.
      return {
        w: o.x,
        h: o.y,
        at: [o.x / 2, o.y / 2, -0.06],
        rot: [0, Math.PI, 0],
        ...(shaped ? { bulge: bottomBulge } : {}),
        flat: baseFlat(bottomBulge),
      };
    case "lid":
      // Read from behind the open lid: up runs away from the hinge, right is the laptop's left.
      return {
        w: o.x,
        h: L,
        at: [o.x / 2, L / 2, lid.at.z + lid.size.z + 0.06],
        rot: [0, 0, Math.PI],
        ...(style.crown > 0 ? { bulge: (_u: number, v: number) => style.crown * Math.sin((Math.PI * (L / 2 - v)) / L) } : {}),
        flat: (u: number, v: number) => inPlan(o.x / 2 + u, L / 2 + v, o.x, L),
      };
    case "bezel":
      // The lid's front face, read from the front with the lid open.
      return { w: o.x, h: L, at: [o.x / 2, L / 2, lid.at.z - 0.14], rot: [Math.PI, 0, 0] };
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
  if (m.kind === "image") return { w: m.size * (m.aspect ?? 1) + line, h: m.size + line };
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

/** The canvas grown by r px in every direction: copies stamped round two circles over the original. */
function grown(src: HTMLCanvasElement, r: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const g = out.getContext("2d");
  if (!g) return out;
  g.drawImage(src, 0, 0);
  for (const rad of r > 2 ? [r, r / 2] : [r]) {
    const n = Math.min(48, Math.max(8, Math.ceil(2 * Math.PI * rad)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      g.drawImage(src, Math.cos(a) * rad, Math.sin(a) * rad);
    }
  }
  return out;
}

/** A raster's alpha silhouette as a line of width sw px along its edge, half outside and half inside. */
function edgeOf(src: HTMLCanvasElement, sw: number): HTMLCanvasElement {
  const r = Math.max(0.5, sw / 2);
  const outer = grown(src, r);
  // The silhouette shrunk by r: what is left after the grown outside is taken away.
  const outside = document.createElement("canvas");
  outside.width = src.width;
  outside.height = src.height;
  const o = outside.getContext("2d");
  const inner = document.createElement("canvas");
  inner.width = src.width;
  inner.height = src.height;
  const i = inner.getContext("2d");
  const g = outer.getContext("2d");
  if (!o || !i || !g) return outer;
  o.fillRect(0, 0, outside.width, outside.height);
  o.globalCompositeOperation = "destination-out";
  o.drawImage(src, 0, 0);
  i.drawImage(src, 0, 0);
  i.globalCompositeOperation = "destination-out";
  i.drawImage(grown(outside, r), 0, 0);
  g.globalCompositeOperation = "destination-out";
  g.drawImage(inner, 0, 0);
  return outer;
}

function svgUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

/** The face's flat part as an alpha mask, one pixel a millimetre. */
function flatMask(face: Face): HTMLCanvasElement | null {
  const flat = face.flat;
  if (!flat) return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(face.w));
  c.height = Math.max(1, Math.round(face.h));
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(c.width, c.height);
  const sx = face.w / c.width;
  const sy = face.h / c.height;
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++)
      if (flat((i + 0.5) * sx - face.w / 2, face.h / 2 - (j + 0.5) * sy)) img.data[(j * c.width + i) * 4 + 3] = 255;
  g.putImageData(img, 0, 0);
  return c;
}

function drawFace(
  face: Face,
  marks: Mark[],
  canvas: HTMLCanvasElement,
  S: number,
  images: Map<string, HTMLImageElement>,
  mask: HTMLCanvasElement | null,
) {
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
        let tmp = document.createElement("canvas");
        tmp.width = Math.max(1, Math.round(w));
        tmp.height = Math.max(1, Math.round(h));
        let t = tmp.getContext("2d");
        if (t && m.kind === "image") {
          // A raster: the picture inset by half the line, and outlined along its alpha edge.
          const sw = outlined(m) ? strokeOf(m) * S : 0;
          t.drawImage(img, sw / 2, sw / 2, Math.max(1, tmp.width - sw), Math.max(1, tmp.height - sw));
          if (sw > 0) {
            tmp = edgeOf(tmp, sw);
            t = tmp.getContext("2d");
          }
        } else t?.drawImage(img, 0, 0, tmp.width, tmp.height);
        if (t) {
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
  if (mask) {
    g.save();
    g.globalCompositeOperation = "destination-in";
    g.drawImage(mask, 0, 0, canvas.width, canvas.height);
    g.restore();
  }
}

function FaceMarks({ face, marks }: { face: Face; marks: Mark[] }) {
  const key = JSON.stringify(marks);
  const mask = useMemo(() => flatMask(face), [face]);
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
      drawFace(face, marks, canvas, S, images, mask);
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
      } else if (m.kind === "image" && m.image) {
        const img = new Image();
        img.onload = redraw;
        img.src = m.image;
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
  }, [key, face.w, face.h, mask]);
  useEffect(
    () => () => {
      made.tex.dispose();
      for (const u of made.urls) URL.revokeObjectURL(u);
    },
    [made],
  );
  const plane = useMemo(() => {
    const g = new THREE.PlaneGeometry(face.w, face.h, face.bulge ? 24 : 1, face.bulge ? 96 : 1);
    if (face.bulge) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) p.setZ(i, face.bulge(p.getX(i), p.getY(i)));
      g.computeVertexNormals();
    }
    return g;
  }, [face]);
  useEffect(() => () => plane.dispose(), [plane]);
  return (
    <mesh position={face.at} rotation={face.rot} renderOrder={3} geometry={plane}>
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

/**
 * What the faces are made from, the same object while its content is: a
 * re-solve that leaves the shell's size and shape alone keeps the faces, their
 * masks and their canvases.
 */
function useFaceShape(fit: Fit): Pick<Fit, "shell"> {
  const { outer, lid, style } = fit.shell;
  const stable = useStable({ outer, lid, style });
  return useMemo(() => ({ shell: stable as Fit["shell"] }), [stable]);
}

/** Marks on the base's faces (palm rest and bottom), in the base's engine space. */
export function BaseMarks({ fit, marks }: { fit: Fit; marks: Mark[] | undefined }) {
  const palm = (marks ?? []).filter((m) => m.surface === "palm");
  const bottom = (marks ?? []).filter((m) => m.surface === "bottom");
  const shape = useFaceShape(fit);
  const palmFace = useMemo(() => faceOf(shape, "palm"), [shape]);
  const bottomFace = useMemo(() => faceOf(shape, "bottom"), [shape]);
  return (
    <>
      {palm.length > 0 && <FaceMarks face={palmFace} marks={palm} />}
      {bottom.length > 0 && <FaceMarks face={bottomFace} marks={bottom} />}
    </>
  );
}

/** Marks on the lid's back and bezel, in the closed lid's engine space. The bezel colour is the lid front the Model draws. */
export function LidDecor({ fit, marks }: { fit: Fit; marks: Mark[] | undefined }) {
  const lid = (marks ?? []).filter((m) => m.surface === "lid");
  const onBezel = (marks ?? []).filter((m) => m.surface === "bezel");
  const shape = useFaceShape(fit);
  const lidFace = useMemo(() => faceOf(shape, "lid"), [shape]);
  const bezelFace = useMemo(() => faceOf(shape, "bezel"), [shape]);
  return (
    <>
      {lid.length > 0 && <FaceMarks face={lidFace} marks={lid} />}
      {onBezel.length > 0 && <FaceMarks face={bezelFace} marks={onBezel} />}
    </>
  );
}
