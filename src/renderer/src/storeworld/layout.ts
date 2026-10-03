import { solve } from "../engine";
import type { OnSale } from "./onSale";

// The floor plan, in metres as the designer's store is: y up, the entrance
// facing +z. Display tables stand in rows across the floor, a central aisle
// down the middle from the door; every laptop faces the entrance, toward the
// aisle in front of its table. One brand to a table, brands in order of
// market share from the entrance in.

export const ROOM = { x0: -12, x1: 12, z0: -10, z1: 10, h: 4.2 };
export const TABLE_Y = 0.9;
/** A table holds one row of laptops. */
export const TABLE = { w: 2.0, d: 0.7 };
/** How far the display laptops' lids stand open, degrees. */
export const LID = 110;

/** The doorway in the front wall: walking into it leaves the store. */
export const DOOR = { x0: -0.65, x1: 0.65 };

/** Half the central aisle's width, from the door to the back wall. */
const AISLE = 0.8;
/** Gap between tables side by side in a row. */
const GAP = 0.2;
/** Tables either side of the central aisle in a row. */
const PER_SIDE = 3;
/** The front row's table centre, and the distance from one row to the next back. */
const FRONT_Z = 5.2;
const ROW_PITCH = 2.0;
const ROWS = 8;

/**
 * The table places, nearest the entrance first: row by row from the front,
 * each row read left to right as a shopper facing its laptops sees it.
 */
const SLOTS: [number, number][] = (() => {
  const xs: number[] = [];
  for (let k = 0; k < PER_SIDE; k++) xs.push(AISLE + TABLE.w / 2 + k * (TABLE.w + GAP));
  const row = [...xs.map((x) => -x).reverse(), ...xs];
  const out: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (const x of row) out.push([x, FRONT_Z - r * ROW_PITCH]);
  return out;
})();

/** Laptops a table holds. */
const PER_TABLE = 3;
/** Places along a table, by how many it holds. */
const ALONG: Record<number, number[]> = {
  1: [0],
  2: [-0.31, 0.31],
  3: [-0.62, 0, 0.62],
};
/** How far in from the table's front edge a laptop's front stands, metres. */
const FRONT_IN = 0.12;

export interface Table {
  x: number;
  z: number;
  /** Its maker, or the company's name on the player's own. */
  label: string;
  own: boolean;
  /** The cheapest and dearest laptop on it. */
  low: number;
  high: number;
}

export interface Seat {
  item: OnSale;
  table: number;
  /** Where the laptop sits, facing `side`. */
  x: number;
  z: number;
  /** +1 faces the +z aisle; every laptop does. */
  side: 1 | -1;
}

export interface Layout {
  tables: Table[];
  seats: Seat[];
}

/** How far in front of the table's middle a laptop's centre sits: its front stays just in from the edge, its lid leaning back over the rest. */
function offsetOf(item: OnSale): number {
  let depth = 0.3;
  try {
    depth = solve(item.build).shell.outer.y / 1000;
  } catch {}
  return TABLE.d / 2 - FRONT_IN - depth / 2;
}

/**
 * Tables by brand: each brand's laptops together on consecutive tables,
 * cheapest first, brands by their share of units sold, the biggest nearest
 * the entrance. With nothing sold (a sandbox's market) a brand's share is its
 * count of laptops on sale. The player's own brand goes by its share like any.
 */
export function layoutOf(items: OnSale[], company: string): Layout {
  const byPrice = (a: OnSale, b: OnSale) => a.price - b.price || a.id.localeCompare(b.id);
  const keyOf = (i: OnSale) => (i.own ? "\u0000own" : (i.maker ?? i.brand));
  const groups = new Map<string, { label: string; own: boolean; items: OnSale[]; units: number }>();
  for (const i of items) {
    const k = keyOf(i);
    let g = groups.get(k);
    if (!g) {
      g = { label: i.own ? company : i.brand, own: i.own, items: [], units: 0 };
      groups.set(k, g);
    }
    g.items.push(i);
    g.units += i.units;
  }
  const sold = items.some((i) => i.units > 0);
  const share = (g: { items: OnSale[]; units: number }) => (sold ? g.units : g.items.length);
  const ordered = [...groups.values()]
    .sort((a, b) => share(b) - share(a) || a.label.localeCompare(b.label))
    .map((g) => ({ ...g, items: g.items.sort(byPrice) }));

  const counts = ordered.map((g) => Math.ceil(g.items.length / PER_TABLE));
  // Too many for the floor: the brands with the most tables give some up, their dearest laptops unshown.
  for (let over = counts.reduce((n, c) => n + c, 0) - SLOTS.length; over > 0; over--) {
    const i = counts.indexOf(Math.max(...counts));
    if (counts[i] <= 1) break;
    counts[i]--;
  }

  const tables: Table[] = [];
  const seats: Seat[] = [];
  let next = 0;
  ordered.forEach((g, gi) => {
    const n = counts[gi];
    const shown = g.items.slice(0, n * PER_TABLE);
    // More brands than the floor holds: the last ones go unshown rather than share a table.
    for (let k = 0; k < n && next < SLOTS.length; k++) {
      // The brand's laptops shared out evenly over its tables.
      const here = shown.slice(Math.round((k * shown.length) / n), Math.round(((k + 1) * shown.length) / n));
      const [tx, tz] = SLOTS[next++];
      const t = tables.length;
      tables.push({
        x: tx,
        z: tz,
        label: g.label,
        own: g.own,
        low: here[0].price,
        high: here[here.length - 1].price,
      });
      here.forEach((item, i) => {
        seats.push({
          item,
          table: t,
          x: tx + ALONG[here.length][i],
          z: tz + offsetOf(item),
          side: 1,
        });
      });
    }
  });
  return { tables, seats };
}
