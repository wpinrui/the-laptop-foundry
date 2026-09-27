import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type { SavedCompany, SavedModel, Settings } from "./store";

export interface FoxNav {
  frame: number;
  name: string;
  url: string;
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
    createCompany: (name: string): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:create-company", name),
    openCompany: (id: string): Promise<SavedCompany> => ipcRenderer.invoke("store:open-company", id),
    deleteCompany: (id: string): Promise<SavedCompany[]> =>
      ipcRenderer.invoke("store:delete-company", id),
    saveModel: (company: string, model: SavedModel): Promise<SavedCompany> =>
      ipcRenderer.invoke("store:save-model", company, model),
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
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
  /** The in-game browser's frames, as the main process sees them. */
  fox: {
    onNav: (cb: (m: FoxNav) => void) => listen("fox:nav", cb),
    onTitle: (cb: (m: FoxTitle) => void) => listen("fox:title", cb),
    onOpen: (cb: (url: string) => void) => listen("fox:open", cb),
    onEscape: (cb: () => void) => listen("fox:escape", cb),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
export type { SavedCompany, SavedModel, Settings };
