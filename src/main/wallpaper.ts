import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { handleTop } from "./ipc";
import { rasterType } from "./svg";

// A model's own wallpaper: picked from disk, downscaled by the renderer, kept
// as a JPEG in the user's data folder. The build stores only the file's id.

const MAX_PICK_BYTES = 40 * 1024 * 1024;
const MAX_SAVE_BYTES = 8 * 1024 * 1024;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const dir = () => join(app.getPath("userData"), "wallpapers");
const fileOf = (id: string) => join(dir(), `${id}.jpg`);

const FILTERS = [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }];

export function registerWallpaper(): void {
  /** The picked image as a data URL; null when cancelled. */
  handleTop("wallpaper:pick", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const pick = await (win
      ? dialog.showOpenDialog(win, { properties: ["openFile"], filters: FILTERS })
      : dialog.showOpenDialog({ properties: ["openFile"], filters: FILTERS }));
    const file = pick.filePaths[0];
    if (pick.canceled || !file) return null;
    const info = await stat(file);
    if (!info.isFile()) return { error: "not-image" as const };
    if (info.size > MAX_PICK_BYTES) return { error: "too-big" as const, limit: "40 MB" };
    const bytes = await readFile(file);
    const type = rasterType(bytes);
    if (!type) return { error: "not-image" as const };
    return { image: `data:${type};base64,${bytes.toString("base64")}` };
  });
  /** Keeps a downscaled JPEG and returns its id. */
  handleTop("wallpaper:save", async (_e, bytes: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_SAVE_BYTES) throw new Error("wallpaper:save: not an image");
    const b = Buffer.from(bytes);
    if (rasterType(b) !== "image/jpeg") throw new Error("wallpaper:save: not a JPEG");
    const id = randomUUID();
    await mkdir(dir(), { recursive: true });
    await writeFile(fileOf(id), b);
    return id;
  });
  /** A kept wallpaper as a data URL; null when the id is unknown. */
  handleTop("wallpaper:get", async (_e, id: unknown) => {
    if (typeof id !== "string" || !ID.test(id)) return null;
    try {
      const b = await readFile(fileOf(id));
      return `data:image/jpeg;base64,${b.toString("base64")}`;
    } catch {
      return null;
    }
  });
}
