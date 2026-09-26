import { contextBridge, ipcRenderer } from "electron";
import type { SavedCompany, SavedModel, Settings } from "./store";

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
    /** Opens a file dialog for an SVG mark. Null when cancelled. */
    importSvg: (): Promise<{ name: string; svg: string } | { error: "too-big" | "not-svg" } | null> =>
      ipcRenderer.invoke("marks:import-svg"),
  },
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
export type { SavedCompany, SavedModel, Settings };
