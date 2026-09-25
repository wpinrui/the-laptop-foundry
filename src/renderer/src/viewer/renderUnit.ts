import * as THREE from "three";
import type { BlockRole, Box, Role } from "../engine";
import {
  contained,
  inspect,
  type MaterialSlot,
  type ModelContext,
  modelKey,
  runModel,
  seeded,
  seedFor,
  toModelEdge,
  toModelSpace,
} from "../models/contract";
import { MODELS } from "../models/registry";

// THE SEAM. Every unit the viewer draws comes from renderUnit, keyed by role.
// A model registered in src/renderer/src/models/roles/<key>.ts is used when
// present; otherwise the unit is a placeholder box. Nothing else in the viewer
// changes when a model is added.
//   - input is in engine millimetres: x width, y depth (front to rear), z up;
//   - the returned object fills `box` exactly;
//   - it owns no shared state beyond what `ctx` hands it, so the caller can
//     dispose it with disposeUnit when the unit goes away.

export interface UnitOpts {
  /** Stand-in colour for the role; the "body" material slot. */
  colour: string;
  year: number;
  /** The body's hinge style. */
  hinge: "barrel" | "full" | "drop";
}

export interface UnitCtx {
  /** Materials shared across units, by colour. */
  material(colour: string, kind?: "matte" | "glow"): THREE.Material;
  /** The engine-owned material slots models draw with. */
  slots(bodyColour: string): Record<MaterialSlot, THREE.Material>;
  /** Colour for a model that breaks its box (dev only). */
  danger: string;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 24).rotateX(
  Math.PI / 2,
);

function centre(obj: THREE.Object3D, box: Box): THREE.Object3D {
  obj.position.set(
    box.at.x + box.size.x / 2,
    box.at.y + box.size.y / 2,
    box.at.z + box.size.z / 2,
  );
  return obj;
}

function place(obj: THREE.Object3D, box: Box): THREE.Object3D {
  centre(obj, box);
  // Zero-size units still get a sliver so they can be hovered.
  obj.scale.set(
    Math.max(box.size.x, 0.2),
    Math.max(box.size.y, 0.2),
    Math.max(box.size.z, 0.2),
  );
  return obj;
}

function placeholder(
  role: Role | BlockRole,
  box: Box,
  opts: UnitOpts,
  ctx: UnitCtx,
): THREE.Object3D {
  switch (role) {
    case "fan":
      return place(
        new THREE.Mesh(unitCylinder, ctx.material(opts.colour)),
        box,
      );
    case "panel":
    case "kblight":
      return place(
        new THREE.Mesh(unitBox, ctx.material(opts.colour, "glow")),
        box,
      );
    default:
      return place(new THREE.Mesh(unitBox, ctx.material(opts.colour)), box);
  }
}

/** Red edges around the space a model actually takes, when it breaks its box. */
function outline(bounds: THREE.Box3, colour: string): THREE.Object3D {
  const size = bounds.getSize(new THREE.Vector3());
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: colour }),
  );
  lines.position.copy(bounds.getCenter(new THREE.Vector3()));
  return lines;
}

export function renderUnit(
  role: Role | BlockRole,
  box: Box,
  opts: UnitOpts,
  ctx: UnitCtx,
): THREE.Object3D {
  const key = modelKey(role);
  const module = key ? MODELS.get(key) : undefined;
  if (!key || !module) return placeholder(role, box, opts, ctx);

  const { box: mbox, rotationX } = toModelSpace(box.piece, box.size);
  const base = {
    year: opts.year,
    piece: box.piece,
    part: box.part,
    edge: toModelEdge(box.piece, box.edge),
    hinge: opts.hinge,
    removable: box.skin,
  };
  const options = box.opts ?? {};
  const mctx: ModelContext = {
    ...base,
    materials: ctx.slots(opts.colour),
    random: seeded(seedFor(key, mbox, options, base)),
  };
  const wrapper = new THREE.Group();
  wrapper.userData.model = true;
  wrapper.rotation.x = rotationX;
  try {
    const t0 = performance.now();
    const obj = runModel(module, mbox, options, mctx);
    const ms = performance.now() - t0;
    wrapper.add(obj);
    if (import.meta.env.DEV) {
      const ins = inspect(obj, mctx);
      if (!contained(ins, mbox)) wrapper.add(outline(ins.bounds, ctx.danger));
      if (ms > 50)
        console.warn(`${key} model took ${ms.toFixed(1)} ms to build`);
    }
  } catch (e) {
    console.error(`${key} model failed; showing the placeholder`, e);
    const fallback = placeholder(role, box, opts, ctx);
    if (import.meta.env.DEV)
      fallback.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(unitBox),
          new THREE.LineBasicMaterial({ color: ctx.danger }),
        ),
      );
    return fallback;
  }
  return centre(wrapper, box);
}

/** Placeholder geometry is shared for the app's lifetime; a model's own geometry is freed with it. */
export function disposeUnit(obj: THREE.Object3D): void {
  obj.removeFromParent();
  if (!obj.userData.model) return;
  obj.traverse((o) => {
    (o as THREE.Mesh).geometry?.dispose();
    if (o instanceof THREE.LineSegments)
      (o.material as THREE.Material).dispose();
  });
}
