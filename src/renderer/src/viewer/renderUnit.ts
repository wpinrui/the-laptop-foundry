import * as THREE from "three";
import type { BlockRole, Box, Role } from "../engine";

// THE SEAM. Every stand-in unit the viewer draws comes from renderUnit, keyed
// by role. Checkpoint 4 swaps these stand-ins for designed models per role by
// changing this file only. Contract:
//   - input is in engine millimetres: x width, y depth (front to rear), z up;
//   - the returned object is placed and sized so it fills `box` exactly;
//   - it owns no shared state beyond what `ctx` hands it, so the caller can
//     dispose it when the unit goes away.

export interface UnitOpts {
  /** Stand-in colour for the role. */
  colour: string;
}

export interface UnitCtx {
  /** Materials shared across units, by colour. */
  material(colour: string, kind?: "matte" | "glow"): THREE.Material;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 24).rotateX(
  Math.PI / 2,
);

function place(obj: THREE.Object3D, box: Box): THREE.Object3D {
  obj.position.set(
    box.at.x + box.size.x / 2,
    box.at.y + box.size.y / 2,
    box.at.z + box.size.z / 2,
  );
  // Zero-size units still get a sliver so they can be hovered.
  obj.scale.set(
    Math.max(box.size.x, 0.2),
    Math.max(box.size.y, 0.2),
    Math.max(box.size.z, 0.2),
  );
  return obj;
}

export function renderUnit(
  role: Role | BlockRole,
  box: Box,
  opts: UnitOpts,
  ctx: UnitCtx,
): THREE.Object3D {
  switch (role) {
    case "fan": {
      const group = new THREE.Group();
      const hub = new THREE.Mesh(unitCylinder, ctx.material(opts.colour));
      group.add(hub);
      return place(group, box);
    }
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

/** Shared geometry lives for the app's lifetime; only per-unit objects are disposed. */
export function disposeUnit(obj: THREE.Object3D): void {
  obj.removeFromParent();
}
