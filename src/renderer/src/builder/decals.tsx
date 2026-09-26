import type { MarkSurface } from "../engine";

// The preset decals the Marks stage offers: one-ink silhouettes, each a single
// evenodd path in assets/decals. A preset becomes an ordinary SVG mark when
// it is placed, so saves and the renderer treat it like an imported one.

export interface Decal {
  id: string;
  name: string;
  set: string;
  /** The surface it is meant for. Any preset can go on any surface. */
  surface: MarkSurface;
  /** Default height in mm; width follows the viewBox. */
  size: number;
  /** The viewBox and path, for drawing the glyph in the UI. */
  vb: [number, number, number, number];
  d: string;
  /** The SVG as a mark stores it. */
  svg: string;
}

export const DECAL_SETS: [string, string][] = [
  ["company", "Company marks"],
  ["line", "Line badges"],
  ["cert", "Certification"],
  ["regulatory", "Regulatory"],
  ["fun", "Fun"],
];

const FILES = import.meta.glob<string>("../assets/decals/*.svg", { query: "?raw", import: "default", eager: true });

const META: Omit<Decal, "vb" | "d" | "svg">[] = [
  { id: "a1-prism", name: "Prism", set: "company", surface: "lid", size: 40 },
  { id: "a2-orbit", name: "Orbit", set: "company", surface: "lid", size: 40 },
  { id: "a3-corner", name: "Corner", set: "company", surface: "lid", size: 36 },
  { id: "a4-crest", name: "Crest", set: "company", surface: "lid", size: 44 },
  { id: "a5-wingbadge", name: "Wingbadge", set: "company", surface: "lid", size: 20 },
  { id: "a6-twin-v", name: "Twin V", set: "company", surface: "lid", size: 32 },
  { id: "a7-hexbolt", name: "Hexbolt", set: "company", surface: "lid", size: 40 },
  { id: "b1-havoc", name: "Havoc", set: "line", surface: "lid", size: 8 },
  { id: "b2-ledger", name: "Ledger", set: "line", surface: "palm", size: 5 },
  { id: "b3-studio", name: "Studio", set: "line", surface: "palm", size: 5 },
  { id: "b4-flux", name: "Flux", set: "line", surface: "bezel", size: 3.5 },
  { id: "b5-titan", name: "Titan", set: "line", surface: "bezel", size: 4 },
  { id: "c1-helix-cpu", name: "Helix CPU", set: "cert", surface: "palm", size: 14 },
  { id: "c2-gpu-fan", name: "GPU Fan", set: "cert", surface: "palm", size: 10 },
  { id: "c3-eco-leaf", name: "Eco Leaf", set: "cert", surface: "palm", size: 12 },
  { id: "c4-rugged", name: "Rugged", set: "cert", surface: "palm", size: 14 },
  { id: "c5-tuned-audio", name: "Tuned Audio", set: "cert", surface: "palm", size: 12 },
  { id: "c6-vivid-display", name: "Vivid Display", set: "cert", surface: "palm", size: 14 },
  { id: "d1-conformity", name: "Conformity", set: "regulatory", surface: "bottom", size: 8 },
  { id: "d2-recycle-loop", name: "Recycle Loop", set: "regulatory", surface: "bottom", size: 9 },
  { id: "d3-no-bin", name: "No Bin", set: "regulatory", surface: "bottom", size: 10 },
  { id: "d4-polarity", name: "Polarity", set: "regulatory", surface: "bottom", size: 6 },
  { id: "d5-rating-plate", name: "Rating Plate", set: "regulatory", surface: "bottom", size: 20 },
  { id: "d6-serial-tag", name: "Serial Tag", set: "regulatory", surface: "bottom", size: 10 },
  { id: "e1-twin-stripe", name: "Twin Stripe", set: "fun", surface: "lid", size: 160 },
  { id: "e2-flame", name: "Flame", set: "fun", surface: "lid", size: 50 },
  { id: "e3-star-trio", name: "Star Trio", set: "fun", surface: "lid", size: 40 },
  { id: "e4-checker-flag", name: "Checker Flag", set: "fun", surface: "lid", size: 36 },
  { id: "e5-bolt-robot", name: "Bolt the Robot", set: "fun", surface: "lid", size: 40 },
  { id: "e6-kiln-cat", name: "Kiln the Cat", set: "fun", surface: "lid", size: 40 },
];

export const DECALS: Decal[] = META.flatMap((m) => {
  const svg = FILES[`../assets/decals/${m.id}.svg`];
  if (!svg) return [];
  const vb = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 1 1").split(/\s+/).map(Number) as Decal["vb"];
  const d = / d="([^"]+)"/.exec(svg)?.[1] ?? "";
  // Drawn at the mark's size: a fixed pixel size for the canvas to scale, as sanitiseSvg does.
  const h = Math.round((1024 * vb[3]) / vb[2]);
  return [{ ...m, vb, d, svg: svg.trim().replace("<svg ", `<svg width="1024" height="${h}" `) }];
});

export const decalById = (id: string | undefined): Decal | undefined => DECALS.find((d) => d.id === id);

/** The decal's glyph, filled with the current colour and fitted to its box. */
export function DecalGlyph({ decal, className }: { decal: Decal; className?: string }) {
  return (
    <svg className={className} viewBox={decal.vb.join(" ")} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor" d={decal.d} />
    </svg>
  );
}
