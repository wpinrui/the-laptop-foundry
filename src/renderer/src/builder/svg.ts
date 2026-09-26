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
