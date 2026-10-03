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

/** One saved notepad document. */
export interface SavedNote {
  name: string;
  text: string;
  updated: number;
}

/** A campaign company's state. A company without one is a sandbox. */
export interface SavedCampaign {
  /** The year the campaign started in, 2006 to 2025. */
  start: number;
  /** The cash the campaign started with. Absent on saves from before it was chosen: STARTING_CASH. */
  cash?: number;
  /** The clock, cash and everything the quarters change. Opaque here, like
   * the build: the renderer owns its shape, and fills it in when absent. */
  state?: unknown;
}

/** Where the player last was in a company: the place, and the laptop brought along, if any. */
export interface SavedPlace {
  at: "map" | "office" | "workshop" | "cafe" | "courts" | "studio";
  model?: string;
}

/** One scene on a commercial's timeline: a camera shot or a card, over the script's words from startWord up to endWord. */
export interface SavedScene {
  kind: string;
  startWord: number;
  /** The word after the scene's last. */
  endWord: number;
  /** Its own set; the commercial's scene set when absent. */
  set?: string;
}

/** A commercial made in the studio. Each laptop gets one, ever. */
export interface SavedCommercial {
  id: string;
  /** The model it advertises. */
  model: string;
  /** The script, one narrated and captioned line each. */
  lines: string[];
  scenes: SavedScene[];
  ratio: "9:16" | "1:1" | "16:9";
  /** The narrator's name, or null for no voice. */
  voice: string | null;
  /** When it was finished. */
  made: number;
  /** What the wheel landed on: 1.5 for +50%. */
  multiplier: number;
  /** The set its scenes are filmed on, the b-roll's set and the sweep's paper colour. Absent on commercials from before they were picked. */
  set?: string;
  brollSet?: string;
  paper?: number;
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
  /** Each opened year's generated market of rival models, by year. Opaque here: the renderer owns its shape. */
  markets?: Record<string, unknown>;
  /** The in-game Notepad's documents. Absent for a company saved before it persisted them. */
  notes?: SavedNote[];
  /** The commercials made in the studio, oldest first. Absent for a company saved before the studio. */
  commercials?: SavedCommercial[];
  /** Where the company was left; absent opens the office. */
  place?: SavedPlace;
}

export interface Settings {
  sound: boolean;
}
