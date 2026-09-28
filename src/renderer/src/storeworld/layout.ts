import type { OnSale } from "./onSale";

// The floor plan, in metres as the designer's store is: y up, the entrance
// facing +z. Display tables stand in the designer's twelve slots, filled
// front row first; laptops go on them sorted by maker, then price.

export const ROOM = { x0: -12, x1: 12, z0: -10, z1: 10, h: 4.2 };
export const TABLE_Y = 0.9;
export const TABLE = { w: 2.6, d: 1.1 };

/** The doorway in the front wall: walking into it leaves the store. */
export const DOOR = { x0: -0.65, x1: 0.65 };

const SLOTS: [number, number][] = [
  [-4.2, -2.3],
  [0, -2.3],
  [4.2, -2.3],
  [-4.2, 0.9],
  [0, 0.9],
  [4.2, 0.9],
  [-4.2, -5.5],
  [0, -5.5],
  [4.2, -5.5],
  [-4.2, 4.1],
  [0, 4.1],
  [4.2, 4.1],
];

/** Places along one side of a table, by how many a side holds. */
const ALONG: Record<number, number[]> = {
  2: [-0.55, 0.55],
  3: [-0.8, 0, 0.8],
  4: [-0.93, -0.31, 0.31, 0.93],
};

export interface Table {
  x: number;
  z: number;
  makers: string[];
}

export interface Seat {
  item: OnSale;
  table: number;
  /** Where the laptop sits, its hinge side away from `side`. */
  x: number;
  z: number;
  /** +1 faces the +z aisle, -1 the -z aisle. */
  side: 1 | -1;
}

export interface Layout {
  tables: Table[];
  seats: Seat[];
}

export function layoutOf(items: OnSale[]): Layout {
  const sorted = [...items].sort((a, b) => (a.brand === b.brand ? a.price - b.price || a.id.localeCompare(b.id) : a.brand.localeCompare(b.brand)));
  const per = sorted.length <= 20 ? 4 : sorted.length <= SLOTS.length * 6 ? 6 : 8;
  const shown = sorted.slice(0, SLOTS.length * per);
  const side = per / 2;
  const tables: Table[] = [];
  const seats: Seat[] = [];
  for (let t = 0; t * per < shown.length; t++) {
    const [tx, tz] = SLOTS[t];
    const here = shown.slice(t * per, t * per + per);
    tables.push({ x: tx, z: tz, makers: [...new Set(here.map((l) => l.brand))] });
    here.forEach((item, i) => {
      const s: 1 | -1 = i < side ? 1 : -1;
      seats.push({ item, table: t, x: tx + ALONG[side][i % side], z: tz + s * 0.2, side: s });
    });
  }
  return { tables, seats };
}
