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
    packCasing: 1,
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
    year: 2016,
    wall: {
      plastic: [1.8, 1.4],
      magnesium: [1.0, 0.8],
      aluminium: [1.2, 1.0],
      cfrp: [1.1, 0.9],
    },
    pieces: {
      plastic: ["floor", "deck", "lid"],
      magnesium: ["floor", "deck", "lid"],
      aluminium: ["floor", "deck", "lid"],
      cfrp: ["deck", "lid"],
    },
    gap: [2.5, 1.5],
    bezel: { side: 8, top: 10, chin: 16 },
    packCasing: 1,
    pcb: 1.2,
    heatPipe: 2.5,
    spreader: 0.8,
    deckExtra: 1.2,
    boardMargin: 4,
    vrmMm2PerWatt: 10,
    vrmHeight: 2.5,
    fan: { min: { x: 50, y: 50, z: 6 }, max: { x: 80, y: 80, z: 12 } },
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
    fan: { min: { x: 50, y: 50, z: 4.5 }, max: { x: 90, y: 90, z: 12 } },
    finDepth: 8,
  },
];

/** The latest era row at or before the year. */
function stepEra(year: number, eras: Era[]): Era {
  let pick = eras[0];
  for (const era of eras)
    if (era.year <= year && era.year >= pick.year) pick = era;
  return pick;
}

/**
 * The era for a year. On a row's own year it is that row. Between two rows
 * the measurements (walls, gaps, bezels, board and fan sizes) move in a
 * straight line from one to the next; which materials go where, and whether
 * there is a vapour chamber, stay with the earlier row.
 */
export function eraFor(year: number, eras: Era[] = ERAS): Era {
  const a = stepEra(year, eras);
  const b = eras
    .filter((e) => e.year > a.year)
    .reduce<Era | undefined>((m, e) => (!m || e.year < m.year ? e : m), undefined);
  if (!b || a.year === year || year < a.year) return a;
  const t = (year - a.year) / (b.year - a.year);
  const n = (x: number, y: number) => Math.round((x + (y - x) * t) * 100) / 100;
  const tune = (x: [number, number], y: [number, number]): [number, number] => [n(x[0], y[0]), n(x[1], y[1])];
  const size = (x: Era["fan"]["min"], y: Era["fan"]["min"]) => ({ x: n(x.x, y.x), y: n(x.y, y.y), z: n(x.z, y.z) });
  const wall: Era["wall"] = {};
  for (const [m, w] of Object.entries(a.wall)) wall[m] = b.wall[m] ? tune(w, b.wall[m]) : w;
  return {
    ...a,
    year,
    wall,
    gap: tune(a.gap, b.gap),
    bezel: { side: n(a.bezel.side, b.bezel.side), top: n(a.bezel.top, b.bezel.top), chin: n(a.bezel.chin, b.bezel.chin) },
    packCasing: n(a.packCasing, b.packCasing),
    pcb: n(a.pcb, b.pcb),
    heatPipe: n(a.heatPipe, b.heatPipe),
    spreader: n(a.spreader, b.spreader),
    deckExtra: n(a.deckExtra, b.deckExtra),
    boardMargin: n(a.boardMargin, b.boardMargin),
    vrmMm2PerWatt: n(a.vrmMm2PerWatt, b.vrmMm2PerWatt),
    vrmHeight: n(a.vrmHeight, b.vrmHeight),
    fan: { min: size(a.fan.min, b.fan.min), max: size(a.fan.max, b.fan.max) },
    finDepth: n(a.finDepth, b.finDepth),
  };
}
