import { solve } from "../engine";
import type { OnSale } from "./onSale";

// The floor plan, in metres as the designer's store is: y up, the entrance
// facing +z. Display tables stand in the designer's twelve slots, one
// department to a table or more; laptops go on them cheapest first.

export const ROOM = { x0: -12, x1: 12, z0: -10, z1: 10, h: 4.2 };
export const TABLE_Y = 0.9;
export const TABLE = { w: 2.6, d: 1.1 };
/** How far the display laptops' lids stand open, degrees. */
export const LID = 110;

/** The doorway in the front wall: walking into it leaves the store. */
export const DOOR = { x0: -0.65, x1: 0.65 };

/**
 * The designer's twelve slots, front centre first: the slot nearest the
 * entrance takes the player's own table. The rest run row by row, each row
 * turning back where the last ended, so a department's tables stand together.
 */
const SLOTS: [number, number][] = [
  [0, 4.1],
  [-4.2, 0.9],
  [0, 0.9],
  [4.2, 0.9],
  [4.2, -2.3],
  [0, -2.3],
  [-4.2, -2.3],
  [-4.2, -5.5],
  [0, -5.5],
  [4.2, -5.5],
  [4.2, 4.1],
  [-4.2, 4.1],
];
/** Clear floor between the outer columns, for a store with more departments than the twelve slots hold. */
const SPARE: [number, number][] = [
  [8.2, -5.5],
  [8.2, 1.7],
  [-8.2, 1.7],
  [-8.2, -5.5],
];

/**
 * The departments, in the order they fill the floor from the entrance in:
 * everyday buyers, then work, then creative, then performance. Classes are
 * the buyer segments' short names.
 */
const DEPARTMENTS = [
  "Consumer",
  "Budget",
  "Student",
  "K-12",
  "Writer",
  "Nomad",
  "Corporate",
  "Biz Pro",
  "Field",
  "Developer",
  "Creative",
  "Video Ed.",
  "3D Artist",
  "Music Prod.",
  "Tech Enth.",
  "Gamer",
  "Esports",
  "Streamer",
];
/** A laptop whose class could not be worked out. */
const OTHER = "Other";

/** Places along one side of a table, by how many a side holds. */
const ALONG: Record<number, number[]> = {
  1: [0],
  2: [-0.55, 0.55],
  3: [-0.8, 0, 0.8],
  4: [-0.93, -0.31, 0.31, 0.93],
};

export interface Table {
  x: number;
  z: number;
  /** Its department's class, or the company's name on the player's own table. */
  label: string;
  own: boolean;
  /** Its department, by index into the layout's departments. */
  dept: number;
  makers: string[];
  /** The cheapest and dearest laptop on it. */
  low: number;
  high: number;
}

/** A department: one class, or the player's own laptops, on one or more tables. */
export interface Department {
  label: string;
  own: boolean;
  tables: number[];
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
  departments: Department[];
}

/**
 * How far a laptop's centre sits from the table's middle: far enough that its
 * lid, leaning back past upright, stops short of the middle, so laptops on
 * the two sides never meet. Metres.
 */
function offsetOf(item: OnSale): number {
  let depth = 0.3;
  try {
    depth = solve(item.build).shell.outer.y / 1000;
  } catch {}
  const lean = Math.max(0, -Math.cos((LID * Math.PI) / 180));
  return Math.max(0.2, depth / 2 + depth * lean + 0.015);
}

/** Laptops a table holds, both sides together. */
const PER_TABLE = [4, 6, 8];

/**
 * Tables by department: the player's own on the table nearest the entrance,
 * then one class to a table in department order, a big class taking several
 * tables side by side. Each department runs cheapest first, left to right
 * along each side as a shopper faces it. Tables hold fewer laptops the
 * fewer there are, and more when the departments would not fit otherwise.
 */
export function layoutOf(items: OnSale[], classOf: Map<string, string>, company: string): Layout {
  const byPrice = (a: OnSale, b: OnSale) => a.price - b.price || a.id.localeCompare(b.id);
  const groups: { label: string; own: boolean; items: OnSale[] }[] = [];
  const own = items.filter((i) => i.own).sort(byPrice);
  if (own.length) groups.push({ label: company, own: true, items: own });
  const rank = (c: string) => {
    const i = DEPARTMENTS.indexOf(c);
    return i < 0 ? DEPARTMENTS.length : i;
  };
  const byClass = new Map<string, OnSale[]>();
  for (const i of items) {
    if (i.own) continue;
    const c = classOf.get(i.id) ?? OTHER;
    byClass.set(c, [...(byClass.get(c) ?? []), i]);
  }
  for (const c of [...byClass.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)))
    groups.push({ label: c, own: false, items: (byClass.get(c) ?? []).sort(byPrice) });

  // Without own laptops the slot by the entrance stands empty.
  const slots = [...SLOTS, ...SPARE].slice(own.length ? 0 : 1);
  const main = SLOTS.length - (own.length ? 0 : 1);
  const tablesAt = (per: number) => groups.reduce((n, g) => n + Math.ceil(g.items.length / per), 0);
  // The fewest a table holds that still fits every department on the twelve slots, else on the spare floor too.
  const per =
    PER_TABLE.find((p) => tablesAt(p) <= main && (p > 4 || items.length <= 20)) ??
    PER_TABLE.find((p) => tablesAt(p) <= slots.length) ??
    PER_TABLE[PER_TABLE.length - 1];
  // Still too many: the biggest departments give up tables, their dearest laptops unshown, until every one fits.
  const counts = groups.map((g) => Math.ceil(g.items.length / per));
  for (let over = tablesAt(per) - slots.length; over > 0; over--) {
    const i = counts.indexOf(Math.max(...counts));
    if (counts[i] <= 1) break;
    counts[i]--;
  }

  const tables: Table[] = [];
  const seats: Seat[] = [];
  const departments: Department[] = [];
  let next = 0;
  groups.forEach((g, gi) => {
    const n = counts[gi];
    const shown = g.items.slice(0, n * per);
    const dept: Department = { label: g.label, own: g.own, tables: [] };
    // More departments than the floor holds: the last ones go unshown rather than share a table.
    for (let k = 0; k < n && next < slots.length; k++) {
      // The department's laptops shared out evenly over its tables.
      const here = shown.slice(Math.round((k * shown.length) / n), Math.round(((k + 1) * shown.length) / n));
      const [tx, tz] = slots[next++];
      const t = tables.length;
      tables.push({
        x: tx,
        z: tz,
        label: g.label,
        own: g.own,
        dept: departments.length,
        makers: [...new Set(here.map((l) => l.brand))],
        low: here[0].price,
        high: here[here.length - 1].price,
      });
      dept.tables.push(t);
      // The cheaper half faces the front aisle, the rest the back, each read left to right.
      const front = Math.ceil(here.length / 2);
      here.forEach((item, i) => {
        const s: 1 | -1 = i < front ? 1 : -1;
        const count = s > 0 ? front : here.length - front;
        const along = ALONG[count][s > 0 ? i : i - front];
        seats.push({
          item,
          table: t,
          x: tx + s * along,
          z: tz + s * offsetOf(item),
          side: s,
        });
      });
    }
    if (dept.tables.length) departments.push(dept);
  });
  return { tables, seats, departments };
}
