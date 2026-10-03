import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type { SavedCampaign, SavedCommercial, SavedCompany, SavedModel, SavedNote, SavedPlace, Settings } from "./store";

export interface FoxNav {
  frame: number;
  name: string;
  url: string;
}
export interface FoxFull {
  frame: number;
  name: string;
  on: boolean;
}
export interface FoxTitle {
  frame: number;
  name: string;
  title: string;
}

function listen<T>(channel: string, cb: (m: T) => void): () => void {
  const h = (_e: IpcRendererEvent, m: T) => cb(m);
  ipcRenderer.on(channel, h);
  return () => {
    ipcRenderer.removeListener(channel, h);
  };
}

/** The typed surface exposed to the renderer as `window.api`. Keep it minimal. */
const api = {
  versions: process.versions,
  /** Escape in the game, held back from the browser so it never drops the pointer lock. */
  onEscape: (cb: () => void) => listen("game:escape", cb),
  store: {
    /** Every save, most recently played first. */
    companies: (): Promise<SavedCompany[]> => ipcRenderer.invoke("store:companies"),
    /** A start year makes a campaign company, starting with `cash`; none makes a sandbox. */
    createCompany: (name: string, start?: number, cash?: number): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:create-company", name, start ?? null, cash ?? null),
    openCompany: (id: string): Promise<SavedCompany> => ipcRenderer.invoke("store:open-company", id),
    deleteCompany: (id: string): Promise<SavedCompany[]> =>
      ipcRenderer.invoke("store:delete-company", id),
    saveModel: (company: string, model: SavedModel): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-model", company, model),
    saveCampaign: (company: string, campaign: SavedCampaign): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-campaign", company, campaign),
    /** Saves a year's generated market with the company. */
    saveMarket: (company: string, year: number, market: unknown): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-market", company, year, market),
    /** Saves the Notepad's documents with the company. */
    /** Remembers where the player is in the company, for the next time it opens. */
    savePlace: (company: string, place: SavedPlace): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-place", company, place),
    saveNotes: (company: string, notes: SavedNote[]): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-notes", company, notes),
    /** Records a finished commercial with the company. */
    saveCommercial: (company: string, commercial: SavedCommercial): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-commercial", company, commercial),
    deleteModel: (company: string, id: string): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:delete-model", company, id),
    settings: (): Promise<Settings> => ipcRenderer.invoke("store:settings"),
    setSettings: (s: Settings): Promise<Settings> => ipcRenderer.invoke("store:set-settings", s),
  },
  marks: {
    /** Opens a file dialog for an SVG, PNG, JPEG or WebP mark. Null when cancelled. */
    importImage: (): Promise<
      { name: string; svg: string } | { name: string; image: string } | { error: "too-big"; limit: string } | { error: "not-image" } | null
    > => ipcRenderer.invoke("marks:import-image"),
  },
  video: {
    /** The narration in a narrator's voice (a name from voices), one clip per line; null when the game has no voice installed. */
    say: (lines: string[], narrator: string): Promise<{ sampleRate: number; clips: Float32Array[] } | null> =>
      ipcRenderer.invoke("video:say", lines, narrator),
    /** The narrators installed, by name; empty without the voice. */
    voices: (): Promise<string[]> => ipcRenderer.invoke("video:voices"),
    /** Every video kept for the company, by file ("2016q3-v4", "ad-<id>-v1"), with when it was written. */
    list: (company: string): Promise<{ file: string; time: number }[]> => ipcRenderer.invoke("video:list", company),
    /** A video rendered for the company before, by file ("2016q3-v4", "ad-<id>-v1"), or null. */
    kept: (company: string, quarter: string): Promise<Uint8Array | null> => ipcRenderer.invoke("video:kept", company, quarter),
    /** Keeps a rendered video beside the company's save. */
    keep: (company: string, quarter: string, bytes: Uint8Array): Promise<void> =>
      ipcRenderer.invoke("video:keep", company, quarter, bytes),
    /** A kept short's poster still (JPEG), or null. */
    poster: (company: string, quarter: string): Promise<Uint8Array | null> =>
      ipcRenderer.invoke("video:poster", company, quarter),
    /** Keeps a short's poster still beside it. */
    keepPoster: (company: string, quarter: string, bytes: Uint8Array): Promise<void> =>
      ipcRenderer.invoke("video:keepPoster", company, quarter, bytes),
    /** Opens a save dialog for a rendered video. True once written. */
    save: (bytes: Uint8Array, name: string): Promise<boolean> => ipcRenderer.invoke("video:save", bytes, name),
  },
  wallpaper: {
    /** Opens a file dialog for a JPEG, PNG or WebP wallpaper, as a data URL. Null when cancelled. */
    pick: (): Promise<{ image: string } | { error: "too-big"; limit: string } | { error: "not-image" } | null> =>
      ipcRenderer.invoke("wallpaper:pick"),
    /** Keeps a downscaled JPEG; resolves to its id. */
    save: (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke("wallpaper:save", bytes),
    /** A kept wallpaper as a data URL, or null. */
    get: (id: string): Promise<string | null> => ipcRenderer.invoke("wallpaper:get", id),
  },
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
  /** The in-game browser's frames, as the main process sees them. */
  fox: {
    onNav: (cb: (m: FoxNav) => void) => listen("fox:nav", cb),
    onTitle: (cb: (m: FoxTitle) => void) => listen("fox:title", cb),
    onOpen: (cb: (url: string) => void) => listen("fox:open", cb),
    onEscape: (cb: () => void) => listen("fox:escape", cb),
    /** A site entered or left full screen in a tab. */
    onFull: (cb: (m: FoxFull) => void) => listen("fox:full", cb),
    /** The laptop's speakers and where the player is, for the tabs' sound. */
    speaker: (state: unknown): void => ipcRenderer.send("fox-speaker:set", state),
    /** How fast the laptop loads pages; null for full speed. */
    pace: (state: unknown): Promise<void> => ipcRenderer.invoke("fox:pace", state),
  },
};

// Preloads also run in the browser's site frames (see src/preload/site.ts);
// the bridge is for the game's own top frame only.
if (process.isMainFrame && window.top === window.self) contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
export type { SavedCampaign, SavedCommercial, SavedCompany, SavedModel, SavedNote, Settings };
