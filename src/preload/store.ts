// Saved data shared by the main process and the preload bridge. The build is
// opaque here: the renderer owns its shape.

export interface SavedModel {
  id: string;
  name: string;
  build: unknown;
  created: number;
  updated: number;
  /** The model this one was revised from. */
  revisedFrom?: string;
}

export interface SavedData {
  version: 1;
  company: string | null;
  models: SavedModel[];
}
