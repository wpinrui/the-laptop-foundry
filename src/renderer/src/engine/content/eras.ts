import type { Era } from "../types";

// Step-wise: the latest era at or before the build's year applies.
export const ERAS: Era[] = [
  {
    year: 2006,
    wall: {
      plastic: [2.0, 1.6],
      magnesium: [1.2, 0.9],
      aluminium: [1.5, 1.2],
      cfrp: [1.4, 1.2],
    },
    pieces: {
      plastic: ["floor", "deck", "lid"],
      magnesium: ["floor", "deck", "lid"],
      aluminium: ["floor", "deck", "lid"],
      cfrp: ["lid"],
    },
    gap: [3, 2],
    bezel: { side: 12, top: 12, chin: 22 },
    packCasing: 2,
    pcb: 1.6,
    heatPipe: 3,
    spreader: 1,
    deckExtra: 1.5,
    boardMargin: 5,
    vrmMm2PerWatt: 12,
    vrmHeight: 3,
    fan: { min: { x: 50, y: 50, z: 9 }, max: { x: 70, y: 70, z: 12 } },
    finDepth: 8,
  },
  {
    year: 2026,
    wall: {
      plastic: [1.6, 1.2],
      magnesium: [0.9, 0.7],
      aluminium: [1.0, 0.8],
      cfrp: [0.9, 0.7],
    },
    pieces: {
      plastic: ["floor", "deck", "lid"],
      magnesium: ["floor", "deck", "lid"],
      aluminium: ["floor", "deck", "lid"],
      cfrp: ["floor", "deck", "lid"],
    },
    gap: [2, 1],
    bezel: { side: 4, top: 5, chin: 10 },
    packCasing: 0,
    pcb: 1.0,
    heatPipe: 2,
    vapourChamber: 2.5,
    spreader: 0.5,
    deckExtra: 1.0,
    boardMargin: 3,
    vrmMm2PerWatt: 8,
    vrmHeight: 2,
    fan: { min: { x: 50, y: 50, z: 5 }, max: { x: 90, y: 90, z: 12 } },
    finDepth: 8,
  },
];

export function eraFor(year: number, eras: Era[] = ERAS): Era {
  let pick = eras[0];
  for (const era of eras)
    if (era.year <= year && era.year >= pick.year) pick = era;
  return pick;
}
