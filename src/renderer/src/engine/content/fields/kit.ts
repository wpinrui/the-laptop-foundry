import { makeBuild } from "../../samples";
import { MATERIALS } from "../finish";
import { solve } from "../../solve";
import { migrateScreen } from "../../screen";
import type { Build, Category, OptionValue, Piece, Side, Size } from "../../types";

// The kit every year's field of rivals is built with.

export interface Rival {
  id: string;
  maker: string;
  name: string;
  build: Build;
}

export type PartSpec = string | [string, Record<string, OptionValue>];

export interface RivalSpec {
  body: string;
  layout: string;
  size: [number, number, number];
  price: number;
  parts: Partial<Record<Category, PartSpec | PartSpec[]>>;
  ports: [string, Side][];
  materials?: Partial<Record<Piece, string>>;
  spend?: Build["spend"];
}

/**
 * The size, grown on each axis to the build's minimum there, to the half mm.
 * The body's shape follows the size, so the minimum moves a little as the size
 * grows to it: grown until it holds.
 */
function grown(build: Build, start: Size): Size {
  const up = (v: number) => Math.ceil(v * 2) / 2;
  let size = start;
  for (let i = 0; i < 4; i++) {
    const min = solve({ ...build, size }, undefined, { auto: false }).min;
    const next: Size = {
      x: up(Math.max(size.x, min.x)),
      y: up(Math.max(size.y, min.y)),
      z: up(Math.max(size.z, min.z)),
    };
    if (next.x === size.x && next.y === size.y && next.z === size.z) break;
    size = next;
  }
  return size;
}

export function rival(
  year: number,
  maker: string,
  name: string,
  spec: RivalSpec,
): Rival {
  const build = makeBuild({ year, ...spec });
  // The listed size is the target; a rival never ships short of its own minimum,
  // taken with every part where its layout puts it, so auto placement never resizes a rival.
  const target: Size = { x: spec.size[0], y: spec.size[1], z: spec.size[2] };
  const size = grown(build, target);
  return {
    id: `${maker}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`,
    maker,
    name,
    build: { ...build, size, price: spec.price },
  };
}

/** Another configuration of an existing rival: same chassis, new price and parts. */
export function trim(
  base: Rival,
  name: string,
  price: number,
  change: {
    maker?: string;
    parts?: Partial<Record<Category, PartSpec | PartSpec[] | null>>;
    materials?: Partial<Record<Piece, string>>;
    spend?: Build["spend"];
  } = {},
): Rival {
  const maker = change.maker ?? base.maker;
  const parts = { ...base.build.parts };
  for (const [cat, v] of Object.entries(change.parts ?? {}) as [
    Category,
    PartSpec | PartSpec[] | null,
  ][]) {
    if (v === null) {
      delete parts[cat];
      continue;
    }
    const single =
      typeof v === "string" ||
      (typeof v[0] === "string" && typeof v[1] === "object" && !Array.isArray(v[1]));
    const list = single ? [v as PartSpec] : (v as PartSpec[]);
    parts[cat] = list.map((x) =>
      typeof x === "string" ? { part: x } : { part: x[0], opts: x[1] },
    );
  }
  const materials = { ...base.build.materials, ...change.materials };
  const texture = (m: string) =>
    MATERIALS.find((x) => x.id === m)?.finishes[0] ?? "matte";
  const finish = { ...base.build.finish };
  for (const piece of Object.keys(change.materials ?? {}) as Piece[])
    finish[piece] = { ...finish[piece], texture: texture(materials[piece]) };
  // A new display pick replaces the base's screen spec.
  const build: Build = migrateScreen({
    ...base.build,
    parts,
    materials,
    finish,
    spend: { ...base.build.spend, ...change.spend },
    price,
    screen: change.parts?.display !== undefined ? undefined : base.build.screen,
  });
  const size = grown(build, build.size);
  return {
    id: `${maker}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${build.year}`,
    maker,
    name,
    build: { ...build, size },
  };
}


export const pick = (list: Rival[], name: string): Rival => {
  const r = list.find((x) => x.name === name);
  if (!r) throw new Error(`no rival ${name}`);
  return r;
};

export type Port = [string, Side];
