import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { osFontCss } from "./fonts";
import osCss from "./os.css?inline";
import type { Era } from "./types";

// Pictures of the OS for textures and photos: the same components the live
// screen uses, rendered once off screen and drawn into a canvas through an
// SVG foreignObject. Images and fonts inside must be data URLs, as an SVG
// image loads nothing else.

const XHTML = "http://www.w3.org/1999/xhtml";

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function markupOf(node: ReactElement): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(node));
  const html = Array.from(host.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join("");
  root.unmount();
  return html;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("the OS picture did not load"));
    img.src = src;
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Draws `node` laid out at `w` x `h` logical pixels into a canvas `outW`
 * pixels wide. Rejects if the picture cannot be drawn or read back.
 */
export async function snapshot(node: ReactElement, era: Era, w: number, h: number, outW: number): Promise<HTMLCanvasElement> {
  const html = markupOf(node);
  const style = escapeXml(`${osFontCss(era)}\n${osCss}`);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="${XHTML}" style="width:${w}px;height:${h}px;overflow:hidden"><style>${style}</style>${html}</div>` +
    "</foreignObject></svg>";
  const img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const c = document.createElement("canvas");
  c.width = Math.round(outW);
  c.height = Math.round((outW * h) / w);
  const g = c.getContext("2d");
  if (!g) throw new Error("no 2D context");
  // The first draw starts the embedded fonts loading; the second has them.
  g.drawImage(img, 0, 0, c.width, c.height);
  await wait(120);
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  // Throws if the browser marked the canvas unreadable; the caller falls back.
  g.getImageData(0, 0, 1, 1);
  return c;
}
