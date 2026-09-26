import {
  BLUETOOTH_2006,
  LID_LIGHT,
  PAD_BUTTON_ROW,
  PAD_STACK,
  SHUTTER_WIDTH,
} from "./content/peripherals";
import { PORT_GROUP_ORDER } from "./content/ports";
import { activeArea, panelThickness } from "./content/display";
import { panelOf } from "./screen";
import type { Index } from "./content";
import type {
  Axis,
  BlockRole,
  Body,
  Build,
  BuildPart,
  Category,
  Era,
  OptionValue,
  Part,
  Piece,
  Role,
  Shape,
  Side,
  Size,
} from "./types";
import { CATEGORIES } from "./types";

/** A physical piece before placement. */
export interface Unit {
  id: string;
  role: Role;
  size: Size;
  part?: string;
  /** Reserves room in a zone but is not a physical piece. */
  spacer?: boolean;
  /** A removable pack whose casing forms the underside: it replaces the bottom wall. */
  skin?: boolean;
  /** The part's options, defaults filled in. */
  opts?: Record<string, OptionValue>;
  /** Index into build.ports for a port unit. */
  src?: number;
}

/** A block on the derived mainboard. */
export interface Block {
  id: string;
  role: BlockRole;
  size: Size;
  row: 1 | 2;
  hot: boolean;
  part?: string;
  watts?: number;
  opts?: Record<string, OptionValue>;
}

export interface Emitted {
  floor: Unit[];
  deck: Unit[];
  lid: Unit[];
  blocks: Block[];
  fans: number;
  chamber: boolean;
  finDepth: number;
}

export const OPENING_ROLES = new Set<Role>([
  "port:left",
  "port:right",
  "port:rear",
  "port:front",
  "fin",
  "odd",
]);

const PIECE_OF: Record<Role, Piece> = {
  board: "floor",
  battery: "floor",
  fan: "floor",
  fin: "floor",
  drive: "floor",
  odd: "floor",
  spk: "floor",
  hinge: "floor",
  "port:left": "floor",
  "port:right": "floor",
  "port:rear": "floor",
  "port:front": "floor",
  keys: "deck",
  pad: "deck",
  "hinge-strip": "deck",
  panel: "lid",
  inverter: "lid",
  webcam: "lid",
  kblight: "lid",
  "bezel-side": "lid",
  "bezel-top": "lid",
  "bezel-chin": "lid",
};

export function pieceOf(role: Role): Piece {
  return PIECE_OF[role];
}

function clamp01(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function spendOf(build: Build, key: keyof Build["spend"]): number {
  return clamp01(build.spend[key]);
}

function shrink(size: Size, axes: Axis[], f: number): Size {
  if (f === 1 || axes.length === 0) return { ...size };
  return {
    x: axes.includes("x") ? size.x * f : size.x,
    y: axes.includes("y") ? size.y * f : size.y,
    z: axes.includes("z") ? size.z * f : size.z,
  };
}

/** Chosen option value, or the part's default (first listed). */
export function opt(
  part: Part,
  bp: BuildPart | undefined,
  key: string,
): OptionValue | undefined {
  const given = bp?.opts?.[key];
  const list = part.options?.[key];
  if (
    given !== undefined &&
    (!list || list.some((v) => String(v) === String(given)))
  )
    return given;
  return list?.[0];
}

function shapes(part: Part): Shape[] {
  return Array.isArray(part.shape) ? part.shape : [part.shape];
}

function packCasingFor(build: Build, idx: Index, era: Era): number {
  let casing = era.packCasing;
  for (const bp of build.parts.hotswap ?? []) {
    const p = idx.parts.get(bp.part);
    if (p?.packCasing !== undefined) casing = Math.max(casing, p.packCasing);
  }
  return casing;
}

function portSize(
  side: Side,
  width: number,
  height: number,
  depth: number,
): Size {
  return side === "left" || side === "right"
    ? { x: depth, y: width, z: height }
    : { x: width, y: depth, z: height };
}

/**
 * Turn a build into units and board blocks, in a fixed order: categories in
 * CATEGORIES order, then ports sorted by side strip order, then the body and
 * era pieces. Unknown ids are skipped here; compat reports them.
 */
export function emit(build: Build, idx: Index, era: Era, body: Body): Emitted {
  const out: Emitted = {
    floor: [],
    deck: [],
    lid: [],
    blocks: [],
    fans: 0,
    chamber: false,
    finDepth: era.finDepth,
  };
  const push = (u: Unit) => out[pieceOf(u.role)].push(u);
  const casing = packCasingFor(build, idx, era);

  for (const cat of CATEGORIES) {
    const chosen = build.parts[cat] ?? [];
    const f = 1 - 0.15 * spendOf(build, cat);
    chosen.forEach((bp, n) => {
      // Every unit and block this part emits carries its resolved options.
      const lists: { opts?: Record<string, OptionValue> }[][] = [
        out.floor,
        out.deck,
        out.lid,
        out.blocks,
      ];
      const before = lists.map((l) => l.length);
      emitOne(cat, f, bp, n);
      const opts = resolvedOpts(idx, bp);
      lists.forEach((l, i) => {
        for (let k = before[i]; k < l.length; k++) l[k].opts = opts;
      });
    });
  }

  function emitOne(cat: Category, f: number, bp: BuildPart, n: number): void {
    {
      if (cat === "display") return;
      const part = idx.parts.get(bp.part);
      if (!part || part.category !== cat) return;
      const base = `${cat}:${n}`;
      shapes(part).forEach((shape, s) => {
        const id = s === 0 ? base : `${base}:${s}`;
        emitShape(
          out,
          push,
          part,
          bp,
          shape,
          id,
          f,
          casing,
          era,
          spendOf(build, cat),
        );
      });
      if (cat === "keyboard" && opt(part, bp, "light") === "lid-light") {
        push({
          id: `${base}:light`,
          role: "kblight",
          size: { ...LID_LIGHT },
          part: part.id,
        });
      }
      if (cat === "wireless" && opt(part, bp, "bluetooth") === "2.0") {
        out.blocks.push({
          id: `${base}:bt`,
          role: "bt",
          size: { ...BLUETOOTH_2006 },
          row: 2,
          hot: false,
          part: part.id,
        });
      }
    }
  }

  // The player's keycaps ride on the keyboard unit's options, for its model.
  if (build.keys) {
    const k = build.keys;
    for (const u of out.deck)
      if (u.role === "keys")
        u.opts = {
          ...u.opts,
          keyShape: k.shape,
          capLetters: k.colours.letters,
          capMods: k.colours.mods,
          capAccent: k.colours.accent,
          legendFont: k.legend.font,
          legendColour: k.legend.colour,
          legendAlign: k.legend.align,
          legendCase: k.legend.case,
          legendSize: k.legend.size,
          legendWeight: k.legend.weight,
        };
  }

  // The screen: its active area and thickness from the resolved panel.
  const panel = panelOf(build, idx.content);
  const ptype = panel && idx.panelTypes.get(panel.type);
  if (panel && ptype) {
    const area = activeArea(panel);
    const z = panelThickness(ptype, panel.inches) * (1 - 0.15 * spendOf(build, "display"));
    push({
      id: "display:0",
      role: "panel",
      size: { x: area.x, y: area.y, z },
      part: panel.id,
      opts: { refresh: panel.hz },
    });
    if (ptype.inverter)
      push({ id: "display:0:inverter", role: "inverter", size: { ...ptype.inverter }, part: panel.id, opts: { refresh: panel.hz } });
  }

  emitPorts(build, idx, out, push);

  push({ id: "body:hinge:0", role: "hinge", size: { ...body.hinge } });
  push({ id: "body:hinge:1", role: "hinge", size: { ...body.hinge } });
  push({
    id: "body:hinge-strip",
    role: "hinge-strip",
    size: { x: 0, y: body.hinge.y, z: 0 },
    spacer: true,
  });
  return out;
}

function padStack(mech: string, spend: number): number {
  const [a, b] = PAD_STACK[mech] ?? PAD_STACK.mechanical;
  return a + (b - a) * spend;
}

function resolvedOpts(
  idx: Index,
  bp: BuildPart,
): Record<string, OptionValue> {
  const part = idx.parts.get(bp.part);
  const out: Record<string, OptionValue> = {};
  if (!part) return out;
  for (const k of Object.keys(part.options ?? {})) {
    const v = opt(part, bp, k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function emitShape(
  out: Emitted,
  push: (u: Unit) => void,
  part: Part,
  bp: BuildPart,
  shape: Shape,
  id: string,
  f: number,
  casing: number,
  era: Era,
  spend: number,
): void {
  switch (shape.kind) {
    case "none":
      return;
    case "box": {
      let k = 0;
      for (const u of shape.units) {
        for (let c = 0; c < (u.count ?? 1); c++) {
          let size = shrink(u.size, part.compact, f);
          if (u.role === "webcam" && opt(part, bp, "shutter") === "yes")
            size = { ...size, x: size.x + SHUTTER_WIDTH };
          push({ id: `${id}:${k++}`, role: u.role, size, part: part.id });
        }
      }
      return;
    }
    case "block": {
      let size = shrink(shape.size, part.compact, f);
      if (shape.stack)
        size = { ...size, z: size.z * Number(opt(part, bp, shape.stack) ?? 1) };
      out.blocks.push({
        id,
        role: shape.role,
        size,
        row: shape.row,
        hot: !!shape.hot,
        part: part.id,
        watts: part.power?.rated ?? part.watts?.[1],
      });
      return;
    }
    case "cells": {
      const cells = Number(opt(part, bp, "cells") ?? 6);
      const perRow = shape.perRow[String(cells)] ?? 3;
      const rows = Math.ceil(cells / perRow);
      const size = {
        x: perRow * shape.length + 10 + 2 * casing,
        y: rows * shape.diameter + 3.2 + 2 * casing,
        z: shape.height + 2 * casing,
      };
      push({ id, role: "battery", size, part: part.id, skin: casing > 0 });
      return;
    }
    case "pouch": {
      const wh = Number(opt(part, bp, "wh") ?? 50);
      const tKey = String(
        opt(part, bp, "thickness") ?? Object.keys(shape.thickness)[0],
      );
      const t = shape.thickness[tKey] ?? Object.values(shape.thickness)[0];
      const width = ((wh / shape.whPerLitre) * 1e6) / (shape.depth * t);
      const size = shrink({ x: width, y: shape.depth, z: t }, part.compact, f);
      push({
        id,
        role: "battery",
        size: {
          x: size.x + 2 * casing,
          y: size.y + 2 * casing,
          z: size.z + 2 * casing,
        },
        part: part.id,
        skin: casing > 0,
      });
      return;
    }
    case "keys": {
      const cols = Number(opt(part, bp, "cols") ?? 15);
      const pitch = Number(opt(part, bp, "pitch") ?? 19);
      push({
        id,
        role: "keys",
        size: {
          // A row of "15 columns" is about 14.5 full keys wide (narrow keys at the
          // ends), plus a 2 mm frame each side. Calibrated against real 14 inch boards.
          x: (cols - 0.5) * pitch + 4,
          y: shape.rows * pitch + 4,
          z: shape.stack[0] + (shape.stack[1] - shape.stack[0]) * spend,
        },
        part: part.id,
      });
      return;
    }
    case "pad": {
      const mech = String(opt(part, bp, "mechanism") ?? "mechanical");
      const rows =
        (opt(part, bp, "buttons") === "separate" ? 1 : 0) +
        (opt(part, bp, "stick") === "yes" ? 1 : 0);
      push({
        id,
        role: "pad",
        size: {
          x: shape.x,
          y: shape.y + rows * PAD_BUTTON_ROW,
          z: padStack(mech, spend),
        },
        part: part.id,
      });
      return;
    }
    case "fan": {
      out.fans += shape.count;
      out.chamber = out.chamber || !!shape.chamber;
      out.finDepth = part.compact.includes("y")
        ? era.finDepth * f
        : era.finDepth;
      // Cooling spend thins the fan by up to a third; the fin stack matches it.
      const fanZ = era.fan.min.z * (1 - spend / 3);
      const fin = { x: 0, y: out.finDepth, z: fanZ };
      for (let i = 0; i < shape.count; i++) {
        push({
          id: `${id}:fan:${i}`,
          role: "fan",
          size: { ...era.fan.min, z: fanZ },
          part: part.id,
        });
        push({
          id: `${id}:fin:${i}`,
          role: "fin",
          size: { ...fin },
          part: part.id,
        });
      }
      return;
    }
    case "port":
      return;
  }
}

function emitPorts(
  build: Build,
  idx: Index,
  out: Emitted,
  push: (u: Unit) => void,
): void {
  const rank = (g: string) => PORT_GROUP_ORDER.indexOf(g as never);
  const list = build.ports
    .map((p, i) => ({ ...p, i, part: idx.parts.get(p.part) }))
    .filter((p) => p.part && p.part.category === "port")
    .map((p) => ({ ...p, shape: shapes(p.part as Part)[0] }))
    .filter((p) => p.shape.kind === "port");
  list.sort((a, b) => {
    const sa = a.shape as Extract<Shape, { kind: "port" }>;
    const sb = b.shape as Extract<Shape, { kind: "port" }>;
    return (
      rank(sa.group) - rank(sb.group) ||
      (a.part as Part).id.localeCompare((b.part as Part).id) ||
      a.i - b.i
    );
  });
  const controllers = new Map<string, { size: Size; n: number }>();
  let k = 0;
  for (const p of list) {
    const s = p.shape as Extract<Shape, { kind: "port" }>;
    const part = p.part as Part;
    for (let c = 0; c < (s.count ?? 1); c++) {
      push({
        id: `port:${p.side}:${k++}`,
        role: `port:${p.side}` as Role,
        size: portSize(p.side, s.width, s.height, s.depth),
        part: part.id,
        src: p.i,
      });
    }
    if (s.controller) {
      const e = controllers.get(part.id) ?? { size: s.controller, n: 0 };
      e.n++;
      controllers.set(part.id, e);
    }
  }
  for (const [part, e] of controllers) {
    for (let i = 0; i < Math.ceil(e.n / 2); i++)
      out.blocks.push({
        id: `port:${part}:ctl:${i}`,
        role: "tb",
        size: { ...e.size },
        row: 2,
        hot: false,
        part,
      });
  }
}

/**
 * Bezel reserves: active-area edge to outer shell, less the lid's side offset.
 * The player's side bezel moves all four; the top and chin keep the era's
 * extra over the sides (the webcam and the panel's driver board).
 */
export function bezelUnits(era: Era, lidSide: number, side?: number): Unit[] {
  const d = side === undefined ? 0 : Math.max(era.bezel.side, side) - era.bezel.side;
  const b = { side: era.bezel.side + d, top: era.bezel.top + d, chin: era.bezel.chin + d };
  const r = (v: number) => Math.max(0, v - lidSide);
  return [
    {
      id: "bezel:chin",
      role: "bezel-chin",
      size: { x: 0, y: r(b.chin), z: 0 },
      spacer: true,
    },
    {
      id: "bezel:left",
      role: "bezel-side",
      size: { x: r(b.side), y: 0, z: 0 },
      spacer: true,
    },
    {
      id: "bezel:right",
      role: "bezel-side",
      size: { x: r(b.side), y: 0, z: 0 },
      spacer: true,
    },
    {
      id: "bezel:top",
      role: "bezel-top",
      size: { x: 0, y: r(b.top), z: 0 },
      spacer: true,
    },
  ];
}
