import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type { SavedCampaign, SavedCompany, SavedModel, SavedNote, Settings } from "./store";

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
  store: {
    /** Every save, most recently played first. */
    companies: (): Promise<SavedCompany[]> => ipcRenderer.invoke("store:companies"),
    /** A start year makes a campaign company; none makes a sandbox. */
    createCompany: (name: string, start?: number): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:create-company", name, start ?? null),
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
    saveNotes: (company: string, notes: SavedNote[]): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-notes", company, notes),
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
    /** The narration in a narrator's voice ("michael" or "heart"), one clip per line; null when the game has no voice installed. */
    say: (lines: string[], narrator: string): Promise<{ sampleRate: number; clips: Float32Array[] } | null> =>
      ipcRenderer.invoke("video:say", lines, narrator),
    /** A short rendered for the company and quarter ("2016q3") before, or null. */
    kept: (company: string, quarter: string): Promise<Uint8Array | null> => ipcRenderer.invoke("video:kept", company, quarter),
    /** Keeps a rendered short beside the company's save, replacing older quarters'. */
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
export type { SavedCampaign, SavedCompany, SavedModel, SavedNote, Settings };
