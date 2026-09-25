import {
  available,
  type Build,
  type BuildPart,
  CATEGORIES,
  CONTENT,
  eraFor,
  type OptionValue,
  type Piece,
  panelsFor,
  partsFor,
  solve,
} from "../engine";
import {
  type ModelBox,
  type ModelEdge,
  type ModelKey,
  modelKey,
  toModelEdge,
  toModelSpace,
} from "./contract";

// What each model must handle, derived from the real content and solver: the
// range of boxes it is asked to fill, and every distinct context it is built
// in (year, piece, part, options, outer edge). Used by the model check and to
// write MODELLING.md. Deterministic.

export interface ModelInput {
  year: number;
  piece: Piece;
  part?: string;
  options: Record<string, OptionValue>;
  edge?: ModelEdge;
  hinge: "barrel" | "full" | "drop";
  removable?: boolean;
  /** Smallest and largest box seen in this context. */
  min: ModelBox;
  max: ModelBox;
}

export interface RoleRange {
  min: ModelBox;
  max: ModelBox;
  inputs: ModelInput[];
}

function base(year: number, body: string, layout: string): Build {
  const b = CONTENT.bodies.find((x) => x.id === body);
  const one = (part: string): BuildPart[] => [{ part }];
  const parts: Build["parts"] =
    year < 2012
      ? {
          processor: one("core-duo-t2500"),
          memory: one("ddr2-667-sodimm"),
          storage: one("hdd25-5400"),
          display: one("2006-14.1-1280x800-tn-matte"),
          battery: one("li-ion-18650"),
          cooling: one("one-fan"),
          wireless: one("wifi-bg"),
          keyboard: one("kb-2.5"),
          trackpad: one("pad-65x40"),
          speakers: one("spk-stereo-2006"),
          webcam: one("cam-0.3mp"),
        }
      : year < 2020
        ? {
            processor: one("core-i7-6700hq"),
            graphics: one("geforce-gtx-1060-laptop"),
            memory: one("ddr4-2133-sodimm"),
            storage: one("m2-2280-sata"),
            display: one("2016-14-1920x1080-ips"),
            battery: one("li-po-pouch"),
            cooling: one("two-fans"),
            wireless: one("wifi-ac"),
            keyboard: one("kb-1.5"),
            trackpad: one("pad-105x70"),
            speakers: one("spk-stereo-2016"),
            webcam: one("cam-720p"),
          }
        : {
          processor: one("core-ultra9-275hx"),
          graphics: one("rtx-5070-laptop"),
          memory: one("ddr5-5600-sodimm"),
          storage: one("m2-2280-g4"),
          display: one("2026-14-1920x1200-ips"),
          battery: one("li-po-pouch"),
          cooling: one("two-fans"),
          wireless: one("wifi-6e"),
          keyboard: one("kb-1.0"),
          trackpad: one("pad-125x80"),
          speakers: one("spk-stereo-2026"),
          webcam: one("cam-720p"),
        };
  const mat =
    CONTENT.materials.find((m) => available(m, year))?.id ?? "plastic";
  const tex =
    CONTENT.materials.find((m) => m.id === mat)?.finishes[0] ?? "matte";
  return {
    year,
    body,
    layout,
    size: b ? { ...b.size } : { x: 340, y: 240, z: 22 },
    parts,
    // One charging port so the build is compatible.
    ports: [
      {
        part: "dc-jack",
        side:
          CONTENT.layouts.find((l) => l.id === layout)?.portSides[0] ?? "left",
      },
    ],
    materials: { floor: mat, deck: mat, lid: mat },
    finish: {
      floor: { colour: "black", texture: tex },
      deck: { colour: "black", texture: tex },
      lid: { colour: "black", texture: tex },
    },
    spend: {},
  };
}

function withSpend(b: Build, v: number): Build {
  const spend: Build["spend"] = { packing: v, material: v };
  for (const c of CATEGORIES) spend[c] = v;
  return { ...b, spend };
}

let cache: Map<ModelKey, RoleRange> | undefined;

export function modelRanges(): Map<ModelKey, RoleRange> {
  if (cache) return cache;
  const out = new Map<ModelKey, RoleRange>();
  const inputs = new Map<string, ModelInput>();
  const grow = (
    a: ModelBox,
    b: ModelBox,
    f: (x: number, y: number) => number,
  ): ModelBox => ({
    width: f(a.width, b.width),
    height: f(a.height, b.height),
    depth: f(a.depth, b.depth),
  });

  const clean = (b: Build) =>
    !solve(b).problems.some((p) => p.kind !== "geometry");
  // A substitution may need another processor or memory to be compatible: find one,
  // leaving the substituted category alone.
  const compatible = (b: Build, fixed: string): Build | undefined => {
    if (clean(b)) return b;
    const cpus =
      fixed === "processor"
        ? [b.parts.processor]
        : partsFor("processor", b.year).map((p) => [{ part: p.id }]);
    const mems =
      fixed === "memory"
        ? [b.parts.memory]
        : partsFor("memory", b.year).map((p) => [{ part: p.id }]);
    for (const processor of cpus)
      for (const memory of mems) {
        const tryB = { ...b, parts: { ...b.parts, processor, memory } };
        if (clean(tryB)) return tryB;
      }
    return undefined;
  };
  const record = (build: Build) => {
    const fit = solve(build);
    if (fit.problems.some((p) => p.kind !== "geometry")) return;
    for (const box of fit.boxes) {
      if (box.kind !== "unit") continue;
      const key = modelKey(box.role);
      if (!key) continue;
      const { box: mb } = toModelSpace(box.piece, box.size);
      const edge = toModelEdge(box.piece, box.edge);
      const options = box.opts ?? {};
      const hinge = fit.shell.style.hinge;
      // The hinge style only matters to hinges; elsewhere it would just multiply contexts.
      const sig = JSON.stringify([
        key,
        build.year,
        box.piece,
        box.part ?? "",
        options,
        edge ?? "",
        key === "hinge" ? hinge : "",
        !!box.skin,
      ]);
      const had = inputs.get(sig);
      if (had) {
        had.min = grow(had.min, mb, Math.min);
        had.max = grow(had.max, mb, Math.max);
      } else
        inputs.set(sig, {
          year: build.year,
          piece: box.piece,
          part: box.part,
          options,
          edge,
          hinge,
          removable: box.skin,
          min: mb,
          max: mb,
        });
      const r = out.get(key);
      if (r) {
        r.min = grow(r.min, mb, Math.min);
        r.max = grow(r.max, mb, Math.max);
      } else out.set(key, { min: mb, max: mb, inputs: [] });
    }
  };

  for (const year of [2006, 2016, 2026]) {
    // One part or option value at a time, into a base build; ports on every side.
    const subs: { cat: string; apply: (b: Build) => Build }[] = [
      { cat: "", apply: (b) => b },
    ];
    for (const c of CATEGORIES) {
      if (c === "display") {
        for (const p of panelsFor(year))
          for (const r of p.refresh)
            subs.push({
              cat: c,
              apply: (b) => ({
                ...b,
                parts: {
                  ...b.parts,
                  display: [{ part: p.id, opts: { refresh: r } }],
                },
              }),
            });
        continue;
      }
      for (const part of partsFor(c, year)) {
        const opts = Object.entries(part.options ?? {});
        const combos: BuildPart[] = opts.length
          ? opts.flatMap(([k, vs]) =>
              vs.map((v) => ({ part: part.id, opts: { [k]: v } })),
            )
          : [{ part: part.id }];
        for (const bp of combos)
          subs.push({
            cat: c,
            apply: (b) => ({ ...b, parts: { ...b.parts, [c]: [bp] } }),
          });
      }
    }
    for (const body of CONTENT.bodies.filter((b) => available(b, year)))
      for (const layout of CONTENT.layouts) {
        const ports = partsFor("port", year);
        const withPorts = (b: Build): Build => ({
          ...b,
          ports: layout.portSides.flatMap((side) =>
            ports.map((p) => ({ part: p.id, side })),
          ),
        });
        for (const sub of subs)
          for (const spend of [0, 1]) {
            const found = compatible(
              withSpend(sub.apply(base(year, body.id, layout.id)), spend),
              sub.cat,
            );
            if (!found) continue;
            const b = found;
            const lim = body.limits;
            const first = solve(b).min;
            const xy = {
              x: Math.max(first.x, lim.x[0]),
              y: Math.max(first.y, lim.y[0]),
            };
            const z = Math.max(
              solve({ ...b, size: { ...xy, z: b.size.z } }).min.z,
              lim.z[0],
            );
            record({ ...b, size: { ...xy, z } });
            record({ ...b, size: { x: lim.x[1], y: lim.y[1], z: lim.z[1] } });
          }
        // Every port on every side, at both sizes.
        const b = base(year, body.id, layout.id);
        const lim = body.limits;
        record(
          withPorts({ ...b, size: { x: lim.x[1], y: lim.y[1], z: lim.z[1] } }),
        );
      }
  }
  for (const [sig, input] of inputs) {
    const key = JSON.parse(sig)[0] as ModelKey;
    // Fans only reach their thinnest when they set the height, which a sample
    // may never hit: take the fan and fin range from the era limits as well.
    if (key === "fan" || key === "fin") {
      const era = eraFor(input.year);
      const thinnest = era.fan.min.z * (2 / 3);
      input.min = {
        ...input.min,
        height: Math.min(input.min.height, thinnest),
      };
      input.max = {
        ...input.max,
        height: Math.max(input.max.height, era.fan.max.z),
      };
      if (key === "fan") {
        input.min = {
          ...input.min,
          width: era.fan.min.x,
          depth: era.fan.min.x,
        };
        input.max = {
          ...input.max,
          width: era.fan.max.x,
          depth: era.fan.max.x,
        };
      }
    }
    const r = out.get(key);
    if (r) {
      r.min = grow(r.min, input.min, Math.min);
      r.max = grow(r.max, input.max, Math.max);
      r.inputs.push(input);
    }
  }
  cache = out;
  return out;
}
