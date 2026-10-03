import type { Era, Size, Vec3 } from "./types";
import type { Block } from "./units";

export interface PlacedBlock extends Block {
  /** Relative to the board's front-left-bottom corner. */
  at: Vec3;
}

export interface Board {
  size: Size;
  blocks: PlacedBlock[];
  /** Height of the cooler band over the hot chips. */
  cooler: number;
}

const ROW2_ORDER = ["chipset", "mem", "m2", "wlan", "bt", "tb"];
/** Sockets real boards lay along the board edge, long side across: SO-DIMMs and Mini PCIe cards. */
const LIE_FLAT = new Set(["mem"]);

/**
 * Row two's socketed cards turned long side across while that makes the row
 * shallower: a SO-DIMM or Mini PCIe card standing front to back set a board
 * far deeper than real ones, which lay them along the edge. A row whose depth
 * something else sets (an M.2 drive) keeps them as they are.
 */
function turnFlat(row: Block[]): Block[] {
  const out = row.map((b) => ({ ...b, size: { ...b.size } }));
  for (let k = 0; k < out.length; k++) {
    const deep = out.reduce((m, b) => (b.size.y > m.size.y ? b : m), out[0]);
    if (!deep || !LIE_FLAT.has(deep.role) || deep.size.x >= deep.size.y) break;
    const rest = out.filter((b) => b !== deep).reduce((m, b) => Math.max(m, b.size.y), 0);
    if (Math.max(rest, deep.size.x) >= deep.size.y) break;
    deep.size = { x: deep.size.y, y: deep.size.x, z: deep.size.z };
  }
  return out;
}

/**
 * The mainboard is derived, not chosen. Two rows:
 * row one (rear, nearest the fans): processor and its power stage, then graphics and its power stage;
 * row two (front): chipset, memory, M.2 slots, wireless, Bluetooth, Thunderbolt controllers.
 * Width is the wider row, depth is both rows plus the routing margin, height is
 * the PCB plus the tallest block, or a hot chip plus its cooler if that is taller.
 */
export function buildBoard(
  blocks: Block[],
  era: Era,
  gap: number,
  cooler: number,
): Board {
  const row1: Block[] = [];
  for (const b of blocks.filter((b) => b.row === 1)) {
    row1.push(b);
    if (b.hot && b.watts) {
      const area = b.watts * era.vrmMm2PerWatt;
      row1.push({
        id: `${b.id}:vrm`,
        role: "vrm",
        size: { x: area / b.size.y, y: b.size.y, z: era.vrmHeight },
        row: 1,
        hot: false,
        part: b.part,
      });
    }
  }
  const row2 = turnFlat(blocks.filter((b) => b.row === 2))
    .map((b, i) => ({ b, i }))
    .sort(
      (p, q) =>
        ROW2_ORDER.indexOf(p.b.role) - ROW2_ORDER.indexOf(q.b.role) ||
        p.i - q.i,
    )
    .map((p) => p.b);

  const width = (row: Block[]) =>
    row.reduce((s, b) => s + b.size.x, 0) + Math.max(0, row.length - 1) * gap;
  const depth = (row: Block[]) =>
    row.reduce((m, b) => Math.max(m, b.size.y), 0);
  const w1 = width(row1);
  const w2 = width(row2);
  const d1 = depth(row1);
  const d2 = depth(row2);
  const x = Math.max(w1, w2);
  const y = d1 + d2 + (row1.length && row2.length ? era.boardMargin : 0);
  let top = 0;
  for (const b of [...row1, ...row2])
    top = Math.max(top, b.hot ? b.size.z + cooler : b.size.z);
  const size = { x, y, z: era.pcb + top };

  const placed: PlacedBlock[] = [];
  const lay = (row: Block[], w: number, y0: number, d: number) => {
    let cx = (x - w) / 2;
    for (const b of row) {
      placed.push({
        ...b,
        at: { x: cx, y: y0 + (d - b.size.y) / 2, z: era.pcb },
      });
      cx += b.size.x + gap;
    }
  };
  lay(row2, w2, 0, d2);
  lay(row1, w1, y - d1, d1);
  return { size, blocks: placed, cooler };
}
