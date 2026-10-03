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
  /** Other surfaces it is listed under. */
  also?: MarkSurface[];
  /** Default height in mm; width follows the viewBox. */
  size: number;
  /** The viewBox and path, for drawing the glyph in the UI. */
  vb: [number, number, number, number];
  d: string;
  /** The SVG as a mark stores it. */
  svg: string;
  /** The asset file, when several presets share one glyph. */
  file?: string;
  /** The ink it is placed in, when it has a brand colour. */
  colour?: string;
}

export const DECAL_SETS: [string, string][] = [
  ["company", "Company logos"],
  ["line", "Line badges"],
  ["cert", "Certification"],
  ["regulatory", "Regulatory"],
  ["fun", "Fun"],
  ["nokia", "Nokia"],
  ["motorola", "Motorola"],
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
  { id: "n1-nokia-blue", file: "n1-nokia", name: "Nokia Blue", set: "nokia", surface: "lid", also: ["bezel"], size: 14, colour: "#124191" },
  { id: "n1-nokia-white", file: "n1-nokia", name: "Nokia White", set: "nokia", surface: "lid", also: ["bezel"], size: 14, colour: "#FFFFFF" },
  { id: "n1-nokia-black", file: "n1-nokia", name: "Nokia Black", set: "nokia", surface: "lid", also: ["bezel"], size: 14, colour: "#000000" },
  { id: "n1-nokia-silver", file: "n1-nokia", name: "Nokia Silver", set: "nokia", surface: "lid", also: ["bezel"], size: 14, colour: "#C0C4C8" },
  { id: "n2-nokia-2023-blue", file: "n2-nokia-2023", name: "Nokia 2023 Blue", set: "nokia", surface: "lid", also: ["bezel"], size: 16, colour: "#005AFF" },
  { id: "n2-nokia-2023-white", file: "n2-nokia-2023", name: "Nokia 2023 White", set: "nokia", surface: "lid", also: ["bezel"], size: 16, colour: "#FFFFFF" },
  { id: "n2-nokia-2023-black", file: "n2-nokia-2023", name: "Nokia 2023 Black", set: "nokia", surface: "lid", also: ["bezel"], size: 16, colour: "#000000" },
  { id: "n3-nokia-connecting-people-blue", file: "n3-nokia-connecting-people", name: "Connecting People Blue", set: "nokia", surface: "lid", also: ["bezel"], size: 28, colour: "#124191" },
  { id: "n3-nokia-connecting-people-white", file: "n3-nokia-connecting-people", name: "Connecting People White", set: "nokia", surface: "lid", also: ["bezel"], size: 28, colour: "#FFFFFF" },
  { id: "n3-nokia-connecting-people-silver", file: "n3-nokia-connecting-people", name: "Connecting People Silver", set: "nokia", surface: "lid", also: ["bezel"], size: 28, colour: "#C0C4C8" },
  { id: "m1-motorola-batwing-blue", file: "m1-motorola-batwing", name: "Batwing Blue", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#0F589F" },
  { id: "m1-motorola-batwing-white", file: "m1-motorola-batwing", name: "Batwing White", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#FFFFFF" },
  { id: "m1-motorola-batwing-black", file: "m1-motorola-batwing", name: "Batwing Black", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#000000" },
  { id: "m1-motorola-batwing-silver", file: "m1-motorola-batwing", name: "Batwing Silver", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#C0C4C8" },
  { id: "m2-motorola-badge-blue", file: "m2-motorola-badge", name: "Badge Blue", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#0F589F" },
  { id: "m2-motorola-badge-white", file: "m2-motorola-badge", name: "Badge White", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#FFFFFF" },
  { id: "m2-motorola-badge-black", file: "m2-motorola-badge", name: "Badge Black", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#000000" },
  { id: "m2-motorola-badge-silver", file: "m2-motorola-badge", name: "Badge Silver", set: "motorola", surface: "lid", also: ["bezel"], size: 36, colour: "#C0C4C8" },
  { id: "m3-motorola-blue", file: "m3-motorola", name: "Motorola Blue", set: "motorola", surface: "lid", also: ["bezel"], size: 11, colour: "#0F589F" },
  { id: "m3-motorola-white", file: "m3-motorola", name: "Motorola White", set: "motorola", surface: "lid", also: ["bezel"], size: 11, colour: "#FFFFFF" },
  { id: "m3-motorola-black", file: "m3-motorola", name: "Motorola Black", set: "motorola", surface: "lid", also: ["bezel"], size: 11, colour: "#000000" },
  { id: "m3-motorola-silver", file: "m3-motorola", name: "Motorola Silver", set: "motorola", surface: "lid", also: ["bezel"], size: 11, colour: "#C0C4C8" },
  { id: "m4-motorola-lockup-blue", file: "m4-motorola-lockup", name: "Motorola Lockup Blue", set: "motorola", surface: "lid", also: ["bezel"], size: 20, colour: "#0F589F" },
  { id: "m4-motorola-lockup-white", file: "m4-motorola-lockup", name: "Motorola Lockup White", set: "motorola", surface: "lid", also: ["bezel"], size: 20, colour: "#FFFFFF" },
  { id: "m4-motorola-lockup-black", file: "m4-motorola-lockup", name: "Motorola Lockup Black", set: "motorola", surface: "lid", also: ["bezel"], size: 20, colour: "#000000" },
  { id: "m4-motorola-lockup-silver", file: "m4-motorola-lockup", name: "Motorola Lockup Silver", set: "motorola", surface: "lid", also: ["bezel"], size: 20, colour: "#C0C4C8" },
  { id: "n1-nokia-blue-bezel", file: "n1-nokia", name: "Nokia Blue", set: "nokia", surface: "bezel", size: 3.5, colour: "#124191" },
  { id: "n1-nokia-white-bezel", file: "n1-nokia", name: "Nokia White", set: "nokia", surface: "bezel", size: 3.5, colour: "#FFFFFF" },
  { id: "n1-nokia-black-bezel", file: "n1-nokia", name: "Nokia Black", set: "nokia", surface: "bezel", size: 3.5, colour: "#000000" },
  { id: "n1-nokia-silver-bezel", file: "n1-nokia", name: "Nokia Silver", set: "nokia", surface: "bezel", size: 3.5, colour: "#C0C4C8" },
  { id: "n2-nokia-2023-blue-bezel", file: "n2-nokia-2023", name: "Nokia 2023 Blue", set: "nokia", surface: "bezel", size: 3.5, colour: "#005AFF" },
  { id: "n2-nokia-2023-white-bezel", file: "n2-nokia-2023", name: "Nokia 2023 White", set: "nokia", surface: "bezel", size: 3.5, colour: "#FFFFFF" },
  { id: "n2-nokia-2023-black-bezel", file: "n2-nokia-2023", name: "Nokia 2023 Black", set: "nokia", surface: "bezel", size: 3.5, colour: "#000000" },
  { id: "n3-nokia-connecting-people-blue-bezel", file: "n3-nokia-connecting-people", name: "Connecting People Blue", set: "nokia", surface: "bezel", size: 6, colour: "#124191" },
  { id: "n3-nokia-connecting-people-white-bezel", file: "n3-nokia-connecting-people", name: "Connecting People White", set: "nokia", surface: "bezel", size: 6, colour: "#FFFFFF" },
  { id: "n3-nokia-connecting-people-silver-bezel", file: "n3-nokia-connecting-people", name: "Connecting People Silver", set: "nokia", surface: "bezel", size: 6, colour: "#C0C4C8" },
  { id: "m1-motorola-batwing-blue-bezel", file: "m1-motorola-batwing", name: "Batwing Blue", set: "motorola", surface: "bezel", size: 5, colour: "#0F589F" },
  { id: "m1-motorola-batwing-white-bezel", file: "m1-motorola-batwing", name: "Batwing White", set: "motorola", surface: "bezel", size: 5, colour: "#FFFFFF" },
  { id: "m1-motorola-batwing-black-bezel", file: "m1-motorola-batwing", name: "Batwing Black", set: "motorola", surface: "bezel", size: 5, colour: "#000000" },
  { id: "m1-motorola-batwing-silver-bezel", file: "m1-motorola-batwing", name: "Batwing Silver", set: "motorola", surface: "bezel", size: 5, colour: "#C0C4C8" },
  { id: "m2-motorola-badge-blue-bezel", file: "m2-motorola-badge", name: "Badge Blue", set: "motorola", surface: "bezel", size: 5, colour: "#0F589F" },
  { id: "m2-motorola-badge-white-bezel", file: "m2-motorola-badge", name: "Badge White", set: "motorola", surface: "bezel", size: 5, colour: "#FFFFFF" },
  { id: "m2-motorola-badge-black-bezel", file: "m2-motorola-badge", name: "Badge Black", set: "motorola", surface: "bezel", size: 5, colour: "#000000" },
  { id: "m2-motorola-badge-silver-bezel", file: "m2-motorola-badge", name: "Badge Silver", set: "motorola", surface: "bezel", size: 5, colour: "#C0C4C8" },
  { id: "m3-motorola-blue-bezel", file: "m3-motorola", name: "Motorola Blue", set: "motorola", surface: "bezel", size: 3, colour: "#0F589F" },
  { id: "m3-motorola-white-bezel", file: "m3-motorola", name: "Motorola White", set: "motorola", surface: "bezel", size: 3, colour: "#FFFFFF" },
  { id: "m3-motorola-black-bezel", file: "m3-motorola", name: "Motorola Black", set: "motorola", surface: "bezel", size: 3, colour: "#000000" },
  { id: "m3-motorola-silver-bezel", file: "m3-motorola", name: "Motorola Silver", set: "motorola", surface: "bezel", size: 3, colour: "#C0C4C8" },
  { id: "m4-motorola-lockup-blue-bezel", file: "m4-motorola-lockup", name: "Motorola Lockup Blue", set: "motorola", surface: "bezel", size: 4.5, colour: "#0F589F" },
  { id: "m4-motorola-lockup-white-bezel", file: "m4-motorola-lockup", name: "Motorola Lockup White", set: "motorola", surface: "bezel", size: 4.5, colour: "#FFFFFF" },
  { id: "m4-motorola-lockup-black-bezel", file: "m4-motorola-lockup", name: "Motorola Lockup Black", set: "motorola", surface: "bezel", size: 4.5, colour: "#000000" },
  { id: "m4-motorola-lockup-silver-bezel", file: "m4-motorola-lockup", name: "Motorola Lockup Silver", set: "motorola", surface: "bezel", size: 4.5, colour: "#C0C4C8" },
];

export const DECALS: Decal[] = META.flatMap((m) => {
  const svg = FILES[`../assets/decals/${m.file ?? m.id}.svg`];
  if (!svg) return [];
  const vb = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 1 1").split(/\s+/).map(Number) as Decal["vb"];
  const d = / d="([^"]+)"/.exec(svg)?.[1] ?? "";
  // Drawn at the mark's size: a fixed pixel size for the canvas to scale, as sanitiseSvg does.
  const h = Math.round((1024 * vb[3]) / vb[2]);
  return [{ ...m, vb, d, svg: svg.trim().replace("<svg ", `<svg width="1024" height="${h}" `) }];
});

export const decalById = (id: string | undefined): Decal | undefined => DECALS.find((d) => d.id === id);

/** The decal's glyph in the current colour, fitted to its box: filled, or outlined with a line `line` of its height wide. */
export function DecalGlyph({ decal, className, line }: { decal: Decal; className?: string; line?: number }) {
  const [x, y, w, h] = decal.vb;
  const sw = (line ?? 0) * h;
  return (
    <svg className={className} viewBox={`${x - sw / 2} ${y - sw / 2} ${w + sw} ${h + sw}`} aria-hidden="true">
      {line ? (
        <path fill="none" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" d={decal.d} />
      ) : (
        <path fillRule="evenodd" fill="currentColor" d={decal.d} />
      )}
    </svg>
  );
}
