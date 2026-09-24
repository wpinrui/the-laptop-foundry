import { contextBridge } from "electron";

/** The typed surface exposed to the renderer as `window.api`. Keep it minimal. */
const api = {
  versions: process.versions,
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
