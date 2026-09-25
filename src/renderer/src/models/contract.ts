import * as THREE from "three";
import type { BlockRole, OptionValue, Piece, Role, Side } from "../engine";

// THE MODEL CONTRACT. One module per model key in ./roles/<key>.ts, exporting
// `model: ModelModule`. The viewer builds it for every unit of that role.
//
// Model space (what the artist builds in):
//   - 1 unit = 1 mm;
//   - origin at the centre of the box;
//   - x is width, left (-x) to right (+x);
//   - y is height, up is +y;
//   - z is depth, the front faces +z.
// "Front" and "up" mean, for parts in the base (floor and deck): the laptop's
// front edge, and up out of the keyboard. For parts in the lid: the screen side
// (toward the user when the lid is open) is the front (+z), and +y runs up the
// screen toward the top bezel. The engine converts to its own space.

/** Model keys: every role, except that all four port roles share one "port" model. */
export type ModelKey =
  | Exclude<
      Role,
      | `port:${string}`
      | "hinge-strip"
      | "bezel-side"
      | "bezel-top"
      | "bezel-chin"
    >
  | "port"
  | BlockRole;

/** The solved box the model must fill and stay inside, in mm. */
export interface ModelBox {
  width: number;
  height: number;
  depth: number;
}

/** Engine-owned materials. Models use only these, so the engine can re-skin every part. */
export const MATERIAL_SLOTS = [
  "body",
  "metal",
  "plastic",
  "rubber",
  "glass",
  "glow",
  "accent",
  "copper",
] as const;
export type MaterialSlot = (typeof MATERIAL_SLOTS)[number];

/** The side of the box that faces the outside of the laptop, in model space. */
export type ModelEdge = "left" | "right" | "front" | "back";

export interface ModelContext {
  year: number;
  piece: Piece;
  /** The chosen part's id, e.g. "vapour-chamber" or "usb-c-10g". */
  part?: string;
  /** Set when the unit sits against an outer wall: vents, ports, bays. */
  edge?: ModelEdge;
  /** The body's hinge style: full-width cover, two barrels, or a drop hinge. */
  hinge: "barrel" | "full" | "drop";
  /** A removable battery pack: its underside (-y) is the outside of the laptop. */
  removable?: boolean;
  materials: Record<MaterialSlot, THREE.Material>;
  /** The only randomness allowed: seeded from the inputs, so the same inputs give the same model. */
  random(): number;
}

export interface ModelModule {
  key: ModelKey;
  /** Build the model for this box. Pure: same inputs, same output. */
  build(
    box: ModelBox,
    options: Record<string, OptionValue>,
    ctx: ModelContext,
  ): THREE.Object3D;
}

/** Anchors are empty children named "anchor:<name>", placed where the name says. */
export const ANCHOR_PREFIX = "anchor:";

/** Anchors every model of a key must provide. */
export const REQUIRED_ANCHORS: Record<ModelKey, string[]> = {
  fan: ["hub", "outlet"],
  fin: ["vent"],
  port: ["opening"],
  odd: ["slot"],
  battery: ["connector"],
  webcam: ["lens"],
  cpu: ["die"],
  gpu: ["die"],
  board: [],
  drive: [],
  spk: [],
  hinge: [],
  keys: [],
  pad: [],
  panel: [],
  inverter: [],
  kblight: [],
  vrm: [],
  chipset: [],
  mem: [],
  m2: [],
  wlan: [],
  bt: [],
  tb: [],
};

/** Triangle and build-time budgets per key. A model over either fails the check. */
export const BUDGETS: Record<ModelKey, { triangles: number; ms: number }> = {
  fan: { triangles: 4000, ms: 8 },
  fin: { triangles: 3000, ms: 8 },
  port: { triangles: 1500, ms: 4 },
  odd: { triangles: 3000, ms: 8 },
  battery: { triangles: 2000, ms: 8 },
  webcam: { triangles: 1500, ms: 4 },
  cpu: { triangles: 800, ms: 4 },
  gpu: { triangles: 1500, ms: 4 },
  board: { triangles: 6000, ms: 10 },
  drive: { triangles: 3000, ms: 8 },
  spk: { triangles: 2000, ms: 6 },
  hinge: { triangles: 2000, ms: 6 },
  keys: { triangles: 40000, ms: 30 },
  pad: { triangles: 1500, ms: 4 },
  panel: { triangles: 2000, ms: 6 },
  inverter: { triangles: 800, ms: 4 },
  kblight: { triangles: 500, ms: 4 },
  vrm: { triangles: 1500, ms: 4 },
  chipset: { triangles: 600, ms: 4 },
  mem: { triangles: 1500, ms: 4 },
  m2: { triangles: 1500, ms: 4 },
  wlan: { triangles: 1000, ms: 4 },
  bt: { triangles: 500, ms: 4 },
  tb: { triangles: 500, ms: 4 },
};

/** How far a model may stray outside its box, in mm. */
export const TOLERANCE_MM = 0.05;

// ------------------------------------------------------------------ engine side

export function modelKey(role: Role | BlockRole): ModelKey | undefined {
  if (role.startsWith("port:")) return "port";
  if (role === "hinge-strip" || role.startsWith("bezel-")) return undefined;
  return role as ModelKey;
}

/** The model box for a unit of engine size, and the rotation (about x) that takes model space into engine space. */
export function toModelSpace(
  piece: Piece,
  size: { x: number; y: number; z: number },
): { box: ModelBox; rotationX: number } {
  if (piece === "lid")
    return {
      box: { width: size.x, height: size.y, depth: size.z },
      rotationX: Math.PI,
    };
  return {
    box: { width: size.x, height: size.z, depth: size.y },
    rotationX: Math.PI / 2,
  };
}

export function toModelEdge(
  piece: Piece,
  side: Side | undefined,
): ModelEdge | undefined {
  if (!side) return undefined;
  if (side === "left" || side === "right") return side;
  if (piece === "lid") return side === "front" ? "back" : "front";
  return side === "front" ? "front" : "back";
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** A seeded generator: mulberry32. */
export function seeded(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFor(
  key: ModelKey,
  box: ModelBox,
  options: Record<string, OptionValue>,
  ctx: Omit<ModelContext, "random" | "materials">,
): string {
  const opts = Object.keys(options)
    .sort()
    .map((k) => `${k}=${options[k]}`)
    .join(",");
  return `${key}|${box.width.toFixed(3)}|${box.height.toFixed(3)}|${box.depth.toFixed(3)}|${opts}|${ctx.year}|${ctx.piece}|${ctx.part ?? ""}|${ctx.edge ?? ""}|${ctx.hinge}`;
}

/**
 * Build a model with the contract's runtime guards: no network or asset
 * loading while it builds. Throws what the model throws.
 */
export function runModel(
  module: ModelModule,
  box: ModelBox,
  options: Record<string, OptionValue>,
  ctx: ModelContext,
): THREE.Object3D {
  const g = globalThis as Record<string, unknown>;
  const saved = {
    fetch: g.fetch,
    XMLHttpRequest: g.XMLHttpRequest,
    Image: g.Image,
  };
  const deny = (what: string) => () => {
    throw new Error(
      `${module.key} model used ${what}: models may not load assets or touch the network`,
    );
  };
  g.fetch = deny("fetch");
  g.XMLHttpRequest = deny("XMLHttpRequest");
  g.Image = deny("Image");
  try {
    const obj = module.build(box, options, ctx);
    obj.updateMatrixWorld(true);
    return obj;
  } finally {
    g.fetch = saved.fetch;
    g.XMLHttpRequest = saved.XMLHttpRequest;
    g.Image = saved.Image;
  }
}

// ------------------------------------------------------------------ rules

export interface Inspection {
  bounds: THREE.Box3;
  triangles: number;
  anchors: Map<string, THREE.Vector3>;
  foreignMaterials: number;
}

export function inspect(obj: THREE.Object3D, ctx: ModelContext): Inspection {
  obj.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const anchors = new Map<string, THREE.Vector3>();
  const slots = new Set<THREE.Material>(Object.values(ctx.materials));
  let triangles = 0;
  let foreignMaterials = 0;
  obj.traverse((o) => {
    if (o.name.startsWith(ANCHOR_PREFIX))
      anchors.set(
        o.name.slice(ANCHOR_PREFIX.length),
        new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),
      );
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (geo.boundingBox)
      bounds.union(geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    triangles += geo.index
      ? geo.index.count / 3
      : (geo.getAttribute("position")?.count ?? 0) / 3;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (!slots.has(m)) foreignMaterials++;
  });
  return { bounds, triangles, anchors, foreignMaterials };
}

/** Is everything, anchors included, inside the box (centred on the origin) within tolerance? */
export function contained(
  ins: Inspection,
  box: ModelBox,
  tol = TOLERANCE_MM,
): boolean {
  const hx = box.width / 2 + tol;
  const hy = box.height / 2 + tol;
  const hz = box.depth / 2 + tol;
  const inside = (p: THREE.Vector3) =>
    Math.abs(p.x) <= hx && Math.abs(p.y) <= hy && Math.abs(p.z) <= hz;
  if (
    !ins.bounds.isEmpty() &&
    (!inside(ins.bounds.min) || !inside(ins.bounds.max))
  )
    return false;
  for (const p of ins.anchors.values()) if (!inside(p)) return false;
  return true;
}

/** A fingerprint of everything that makes up the model, for the determinism rule. */
export function fingerprint(obj: THREE.Object3D, ctx: ModelContext): string {
  const slotName = new Map<THREE.Material, string>(
    Object.entries(ctx.materials).map(([k, m]) => [m, k]),
  );
  const parts: string[] = [];
  obj.traverse((o) => {
    const e = o.matrix.elements.map((v) => v.toFixed(5)).join(",");
    let geo = "";
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const pos = mesh.geometry.getAttribute("position");
      let h = 0;
      if (pos)
        for (let i = 0; i < pos.array.length; i++)
          h = (h * 31 + Math.round((pos.array[i] as number) * 1000)) | 0;
      const idx = mesh.geometry.index;
      if (idx)
        for (let i = 0; i < idx.array.length; i++)
          h = (h * 31 + (idx.array[i] as number)) | 0;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      geo = `${pos?.count ?? 0}:${h}:${mats.map((m) => slotName.get(m) ?? "?").join("+")}`;
    }
    parts.push(`${o.type}|${o.name}|${e}|${geo}`);
  });
  return parts.join("\n");
}
