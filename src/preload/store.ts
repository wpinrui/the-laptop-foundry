// Saved data shared by the main process and the preload bridge. The build is
// opaque here: the renderer owns its shape.

export interface SavedModel {
  id: string;
  name: string;
  build: unknown;
  created: number;
  updated: number;
  /** When the model was first reviewed. A reviewed model is locked: its
   * build never changes, so its review never changes. */
  reviewed?: number;
  /** When the player first saw the review's score land. The reveal plays only before this. */
  revealed?: number;
}

/** One company: one save. */
export interface SavedCompany {
  version: 1;
  id: string;
  name: string;
  created: number;
  /** When the company was last loaded or changed. */
  played: number;
  models: SavedModel[];
}

export interface Settings {
  sound: boolean;
}
