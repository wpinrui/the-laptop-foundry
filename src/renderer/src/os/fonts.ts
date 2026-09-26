import noto400 from "../assets/fonts/noto-sans-latin-400-normal.woff2?inline";
import noto600 from "../assets/fonts/noto-sans-latin-600-normal.woff2?inline";
import noto700 from "../assets/fonts/noto-sans-latin-700-normal.woff2?inline";
import noto700i from "../assets/fonts/noto-sans-latin-700-italic.woff2?inline";
import open400 from "../assets/fonts/open-sans-latin-400-normal.woff2?inline";
import open600 from "../assets/fonts/open-sans-latin-600-normal.woff2?inline";
import open700 from "../assets/fonts/open-sans-latin-700-normal.woff2?inline";
import code600 from "../assets/fonts/source-code-pro-latin-600-normal.woff2?inline";
import code700 from "../assets/fonts/source-code-pro-latin-700-normal.woff2?inline";
import type { Era } from "./types";

// The in-game OS's fonts (SIL Open Font License 1.1; the licence texts sit
// beside the files). They are inlined so the same faces reach both the live
// page and the pictures of it drawn into textures, which cannot load files.

type Face = [family: string, weight: number, style: "normal" | "italic", src: string];

const CODE: Face[] = [
  ["Source Code Pro", 600, "normal", code600],
  ["Source Code Pro", 700, "normal", code700],
];

const FACES: Record<Era, Face[]> = {
  2006: [
    ["Noto Sans", 400, "normal", noto400],
    ["Noto Sans", 600, "normal", noto600],
    ["Noto Sans", 700, "normal", noto700],
    ["Noto Sans", 700, "italic", noto700i],
  ],
  2016: [
    ["Open Sans", 400, "normal", open400],
    ["Open Sans", 600, "normal", open600],
    ["Open Sans", 700, "normal", open700],
  ],
  2026: [],
};

const css = (faces: Face[]) =>
  faces
    .map(
      ([family, weight, style, src]) =>
        `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};src:url(${src}) format("woff2");}`,
    )
    .join("\n");

/** The @font-face rules one era needs, fps font included. */
export function osFontCss(era: Era): string {
  return css([...FACES[era], ...CODE]);
}

let installed = false;

/** Registers every OS face on the page once, so live screens and canvases can use them. */
export function installOsFonts(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const el = document.createElement("style");
  el.dataset.os = "fonts";
  el.textContent = css([...FACES[2006], ...FACES[2016], ...FACES[2026], ...CODE]);
  document.head.appendChild(el);
}

/** Resolves once the era's faces are ready to draw with on a canvas. */
export function osFontsReady(era: Era): Promise<unknown> {
  installOsFonts();
  const loads = [...FACES[era], ...CODE].map(([family, weight, style]) =>
    document.fonts.load(`${style} ${weight} 20px "${family}"`),
  );
  return Promise.all(loads).catch(() => undefined);
}
