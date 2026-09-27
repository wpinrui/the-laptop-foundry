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

/** A campaign company's state. A company without one is a sandbox. */
export interface SavedCampaign {
  /** The year the campaign started in, 2006 to 2025. */
  start: number;
  /** The clock, cash and everything the quarters change. Opaque here, like
   * the build: the renderer owns its shape, and fills it in when absent. */
  state?: unknown;
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
  /** Absent for a sandbox company, which is what every older save loads as. */
  campaign?: SavedCampaign;
}

export interface Settings {
  sound: boolean;
}
