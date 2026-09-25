import { contextBridge, ipcRenderer } from "electron";
import type { SavedData, SavedModel } from "./store";

/** The typed surface exposed to the renderer as `window.api`. Keep it minimal. */
const api = {
  versions: process.versions,
  store: {
    load: (): Promise<SavedData> => ipcRenderer.invoke("store:load"),
    setCompany: (name: string): Promise<SavedData> =>
      ipcRenderer.invoke("store:set-company", name),
    saveModel: (model: SavedModel): Promise<SavedData> =>
      ipcRenderer.invoke("store:save-model", model),
    deleteModel: (id: string): Promise<SavedData> =>
      ipcRenderer.invoke("store:delete-model", id),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
export type { SavedData, SavedModel };
