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
  /** When the model was first reviewed. A reviewed model is locked: its
   * build never changes, so its review never changes. Revise makes a new model. */
  reviewed?: number;
}

export interface SavedData {
  version: 1;
  company: string | null;
  models: SavedModel[];
}
