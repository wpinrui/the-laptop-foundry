export * from "./content";
export { makeBuild, SAMPLES } from "./samples";
export { solve } from "./solve";
export * from "./screen";
export * from "./types";
export { validateContent } from "./validate";
export { type MeshData, shellSurface } from "./shellGeometry";
export {
  type Battery,
  type Cooling,
  defaultProfiles,
  type Durability,
  durabilityOf,
  type Lab,
  labOf,
  type Measurements,
  type Performance,
  profilesOf,
  type Runtime,
  simulate,
  type Timeline,
  timeline,
} from "./sim";
export { type Specs, specs } from "./sim/specs";
export {
  type Budget,
  type BodyClass,
  type Cost,
  classify,
  costOf,
  partPrice,
  screenPrice,
  type DeviceClass,
  type PerfClass,
  weightOf,
} from "./price";
export {
  type BenchResult,
  GAMES,
  type GameResult,
  gameEdition,
  KILNBENCH,
  PRESETS,
  type Results,
  results,
} from "./bench";
export {
  MAKERS,
  type Maker,
  RIVALS,
  type Rival,
  rivalsFor,
} from "./content/rivals";
export {
  type BarChart,
  type Chart,
  type DisplayBox,
  type LineChart,
  type ScaleChart,
  CATEGORIES as REVIEW_CATEGORIES,
  factsOf,
  laptopKind,
  type Review,
  reviewOf,
  rivalSubject,
  rollScores,
  type Scores,
  type Subject,
  type Table,
} from "./review";
