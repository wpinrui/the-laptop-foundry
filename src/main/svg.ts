import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { BrowserWindow, dialog } from "electron";
import { handleTop } from "./ipc";

// Import SVG for the builder's marks: an open-file dialog, then a first,
// conservative clean of the markup. The renderer rebuilds the SVG from an
// allowlist before it is stored, so nothing active or external survives.

const MAX_BYTES = 512 * 1024;

/** Strips scripts, foreign content, event handlers, entities and anything that reaches outside the file. */
export function roughClean(svg: string): string {
  return svg
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<(iframe|embed|object|image|audio|video|animate\w*|set)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "");
}

const MAX_RASTER_BYTES = 20 * 1024 * 1024;

/** The raster type from the file's first bytes, whatever its extension says. */
export function rasterType(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const FILTERS = [
  { name: "Images", extensions: ["svg", "png", "jpg", "jpeg", "webp"] },
  { name: "SVG", extensions: ["svg"] },
  { name: "PNG", extensions: ["png"] },
  { name: "JPEG", extensions: ["jpg", "jpeg"] },
  { name: "WebP", extensions: ["webp"] },
];

/** Import an image for a mark: SVG as cleaned markup; PNG, JPEG and WebP as a data URL the renderer decodes and downscales. */
export function registerSvgImport(): void {
  handleTop("marks:import-image", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const pick = await (win
      ? dialog.showOpenDialog(win, { properties: ["openFile"], filters: FILTERS })
      : dialog.showOpenDialog({ properties: ["openFile"], filters: FILTERS }));
    const file = pick.filePaths[0];
    if (pick.canceled || !file) return null;
    const info = await stat(file);
    if (!info.isFile()) return { error: "not-image" as const };
    const name = basename(file).replace(/\.(svg|png|jpe?g|webp)$/i, "");
    if (/\.svg$/i.test(file)) {
      if (info.size > MAX_BYTES) return { error: "too-big" as const, limit: "512 KB" };
      const text = await readFile(file, "utf8");
      if (!/<svg[\s>]/i.test(text)) return { error: "not-image" as const };
      return { name, svg: roughClean(text) };
    }
    if (info.size > MAX_RASTER_BYTES) return { error: "too-big" as const, limit: "20 MB" };
    const bytes = await readFile(file);
    const type = rasterType(bytes);
    if (!type) return { error: "not-image" as const };
    return { name, image: `data:${type};base64,${bytes.toString("base64")}` };
  });
}
