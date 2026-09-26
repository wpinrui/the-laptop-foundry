import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";

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

export function registerSvgImport(): void {
  ipcMain.handle("marks:import-svg", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const pick = await (win
      ? dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "SVG", extensions: ["svg"] }] })
      : dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "SVG", extensions: ["svg"] }] }));
    const file = pick.filePaths[0];
    if (pick.canceled || !file) return null;
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_BYTES) return { error: "too-big" as const };
    const text = await readFile(file, "utf8");
    if (!/<svg[\s>]/i.test(text)) return { error: "not-svg" as const };
    return { name: basename(file).replace(/\.svg$/i, ""), svg: roughClean(text) };
  });
}
