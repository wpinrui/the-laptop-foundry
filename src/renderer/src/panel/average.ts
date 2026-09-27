import { IFRAME_GUESS } from "./tuning";

// A cheap guess at the page's average colour, from layout alone: each box's
// own background over the area its children leave, images and canvases
// shrunk to a few pixels. No capture of the page. Cross-origin frames cannot
// be read and count as a light page.

type Rgb = [number, number, number];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

let probe: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 4;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  return probe;
}

const colours = new Map<string, [number, number, number, number]>();
/** A CSS colour as linear RGB and alpha, through the canvas so every syntax parses. */
function colourOf(css: string): [number, number, number, number] {
  const hit = colours.get(css);
  if (hit) return hit;
  const g = ctx();
  let out: [number, number, number, number] = [0, 0, 0, 0];
  if (g) {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    out = a > 0 ? [lin(d[0]), lin(d[1]), lin(d[2]), a] : [0, 0, 0, 0];
  }
  if (colours.size > 500) colours.clear();
  colours.set(css, out);
  return out;
}

/** Average of an image or canvas, shrunk to 4 by 4. */
function pictureOf(src: CanvasImageSource): Rgb | null {
  const g = ctx();
  if (!g) return null;
  try {
    g.clearRect(0, 0, 4, 4);
    g.drawImage(src, 0, 0, 4, 4);
    const d = g.getImageData(0, 0, 4, 4).data;
    const s: Rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      s[0] += lin(d[i]) * a;
      s[1] += lin(d[i + 1]) * a;
      s[2] += lin(d[i + 2]) * a;
    }
    return [s[0] / 16, s[1] / 16, s[2] / 16];
  } catch {
    return null;
  }
}

const images = new Map<string, Rgb | null>();
function backgroundImage(css: string): Rgb | null {
  const url = /url\(["']?([^"')]+)["']?\)/.exec(css)?.[1];
  if (!url) return null;
  if (images.has(url)) return images.get(url) ?? null;
  images.set(url, null);
  const img = new Image();
  img.onload = () => images.set(url, pictureOf(img));
  img.src = url;
  return null;
}

interface Sum {
  rgb: Rgb;
  area: number;
}

function walk(el: Element, min: number, budget: { n: number }): Sum {
  const none: Sum = { rgb: [0, 0, 0], area: 0 };
  if (!(el instanceof HTMLElement) || budget.n-- <= 0) return none;
  const area = el.offsetWidth * el.offsetHeight;
  if (area < min) return none;
  const st = getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) < 0.05) return none;
  const tag = el.tagName;
  if (tag === "IFRAME") return { rgb: [IFRAME_GUESS * area, IFRAME_GUESS * area, IFRAME_GUESS * area], area };
  if (tag === "CANVAS" || tag === "IMG" || tag === "VIDEO") {
    const p = pictureOf(el as unknown as CanvasImageSource);
    return p ? { rgb: [p[0] * area, p[1] * area, p[2] * area], area } : none;
  }
  const sum: Sum = { rgb: [0, 0, 0], area: 0 };
  for (const c of el.children) {
    const s = walk(c, min, budget);
    sum.rgb[0] += s.rgb[0];
    sum.rgb[1] += s.rgb[1];
    sum.rgb[2] += s.rgb[2];
    sum.area += s.area;
  }
  const covered = Math.min(area, sum.area);
  if (covered < area) {
    const own = backgroundImage(st.backgroundImage) ?? (() => {
      const c = colourOf(st.backgroundColor);
      return c[3] > 0.5 ? ([c[0], c[1], c[2]] as Rgb) : null;
    })();
    if (own) {
      const rest = area - covered;
      sum.rgb[0] += own[0] * rest;
      sum.rgb[1] += own[1] * rest;
      sum.rgb[2] += own[2] * rest;
      sum.area = area;
    }
  }
  if (sum.area > area) {
    // Overlapping children: scale back to the box.
    const k = area / sum.area;
    sum.rgb = [sum.rgb[0] * k, sum.rgb[1] * k, sum.rgb[2] * k];
    sum.area = area;
  }
  return sum;
}

/** The page's average linear colour; anything not covered counts as black. */
export function averageColour(root: HTMLElement): Rgb {
  const total = root.offsetWidth * root.offsetHeight;
  if (total <= 0) return [0, 0, 0];
  const s = walk(root, total * 0.004, { n: 1500 });
  return [s.rgb[0] / total, s.rgb[1] / total, s.rgb[2] / total];
}
