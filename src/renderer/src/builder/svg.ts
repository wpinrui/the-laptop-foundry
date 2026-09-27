// Rebuilds an imported SVG from an allowlist of shape elements and
// presentation attributes. Scripts, event handlers, foreign content, styles
// and every reference outside the file are dropped. The result is what the
// save stores.

const NS = "http://www.w3.org/2000/svg";

const TAGS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "text",
  "tspan",
  "use",
  "symbol",
]);

const ATTRS = new Set([
  "d",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "viewbox",
  "points",
  "transform",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-dasharray",
  "opacity",
  "clip-rule",
  "clip-path",
  "mask",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "preserveaspectratio",
  "id",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "letter-spacing",
  "clippathunits",
  "maskunits",
  "maskcontentunits",
  "spreadmethod",
  "fx",
  "fy",
  "fr",
  "visibility",
  "display",
]);

/** Style declarations kept, moved onto the element as presentation attributes. */
const STYLE_PROPS = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-dasharray",
  "opacity",
  "clip-rule",
  "stop-color",
  "stop-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "letter-spacing",
  "visibility",
  "display",
]);

/** A value may point inside the file only: url(#id), never anything else. */
function safeValue(v: string): boolean {
  const urls = v.match(/url\([^)]*\)/gi) ?? [];
  return urls.every((u) => /^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(u)) && !/javascript:|expression\(|@import/i.test(v);
}

function copy(src: Element, doc: XMLDocument): Element | null {
  const tag = src.localName.toLowerCase();
  if (!TAGS.has(tag) || (src.namespaceURI && src.namespaceURI !== NS)) return null;
  const out = doc.createElementNS(NS, src.localName);
  for (const a of Array.from(src.attributes)) {
    const name = a.name.toLowerCase();
    if (name === "href" || name === "xlink:href") {
      if (/^#[\w.-]+$/.test(a.value)) out.setAttribute("href", a.value);
      continue;
    }
    if (ATTRS.has(name) && safeValue(a.value)) out.setAttribute(a.name, a.value);
  }
  // Editors such as Inkscape put the colours in style="": keep the safe ones as attributes.
  for (const decl of (src.getAttribute("style") ?? "").split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (STYLE_PROPS.has(prop) && value && safeValue(value)) out.setAttribute(prop, value);
  }
  for (const c of Array.from(src.childNodes)) {
    if (c.nodeType === 1) {
      const e = copy(c as Element, doc);
      if (e) out.appendChild(e);
    } else if (c.nodeType === 3 && (tag === "text" || tag === "tspan")) out.appendChild(doc.createTextNode(c.textContent ?? ""));
  }
  return out;
}

/** The SVG, rebuilt safe, or null when it does not parse as one. */
export function sanitiseSvg(text: string): string | null {
  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (!root || root.localName.toLowerCase() !== "svg" || parsed.getElementsByTagName("parsererror").length > 0) return null;
  const doc = document.implementation.createDocument(NS, "svg", null);
  const out = copy(root, doc);
  if (!out) return null;
  if (!out.getAttribute("viewBox")) {
    const w = Number.parseFloat(out.getAttribute("width") ?? "");
    const h = Number.parseFloat(out.getAttribute("height") ?? "");
    if (w > 0 && h > 0) out.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  // Drawn at the mark's size: a fixed pixel size for the canvas to scale.
  out.setAttribute("width", "1024");
  const vb = (out.getAttribute("viewBox") ?? "0 0 1 1").split(/[\s,]+/).map(Number);
  out.setAttribute("height", String(Math.round((1024 * (vb[3] || 1)) / (vb[2] || 1))));
  return new XMLSerializer().serializeToString(out);
}

const RASTER_MAX = 1024;

/**
 * A PNG, JPEG or WebP data URL decoded and redrawn at most 1024 px on its longest
 * side, in its own format (PNG and WebP keep their alpha). Redrawing keeps only the
 * pixels. Null when it does not decode as an image.
 */
export function downscaleImage(dataUrl: string): Promise<{ image: string; aspect: number } | null> {
  const type = /^data:(image\/(png|jpeg|webp));base64,/.exec(dataUrl)?.[1];
  if (!type) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const w0 = img.naturalWidth;
      const h0 = img.naturalHeight;
      if (!(w0 > 0 && h0 > 0)) return resolve(null);
      const k = Math.min(1, RASTER_MAX / Math.max(w0, h0));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w0 * k));
      c.height = Math.max(1, Math.round(h0 * k));
      const g = c.getContext("2d");
      if (!g) return resolve(null);
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve({ image: c.toDataURL(type, type === "image/png" ? undefined : 0.9), aspect: w0 / h0 });
    };
    img.src = dataUrl;
  });
}
