export * from "./content";
export { makeBuild, SAMPLES } from "./samples";
export { solve } from "./solve";
export * from "./battery";
export * from "./fan";
export * from "./grill";
export * from "./speakerGrill";
export * from "./screen";
export * from "./look";
export * from "./pad";
export { compactable } from "./compact";
export * from "./speaker";
export * from "./quality";
export { optionAvailable, yearOptions } from "./compat";
export * from "./types";
export { validateContent } from "./validate";
export { type MeshData, shellSurface } from "./shellGeometry";
export {
  bumperBlock,
  floorBand,
  hingeAxis,
  outerSection,
  outerSpanAt,
  perimBand,
  perimZones,
  resolveStyle,
  SIDE_RANGE,
  taperDepth,
} from "./shell";
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
  packageGb,
  partPrice,
  pieceOf,
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
  RIVAL_YEARS,
  rivalsFor,
  rivalYear,
} from "./content/rivals";
export {
  type BarChart,
  type Chart,
  type DisplayBox,
  type LineChart,
  type ScaleChart,
  type SurfaceGrid,
  type Section,
  CATEGORIES as REVIEW_CATEGORIES,
  factsOf,
  laptopKind,
  type Review,
  reviewOf,
  rivalSubject,
  scoresOf,
  type Scores,
  type Subject,
  type Table,
} from "./review";
