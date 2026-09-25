import * as THREE from "three";
import type { Size, Vec3 } from "../engine";

// Engine space: x width (user's left to right), y depth (front to rear), z up,
// origin at the base's front-left-bottom. three.js is y up. The scene turns
// engine space once, about x, and centres the base on the origin, so the
// laptop faces +z, toward the default camera, with the user's left on -x.

export const ENGINE_ROTATION_X = -Math.PI / 2;
export const CAMERA_POSITION: [number, number, number] = [0, 360, 560];

export function baseOffset(outer: Size): [number, number, number] {
  return [-outer.x / 2, -outer.y / 2, 0];
}

/** Where an engine point lands in the world, through the same transforms the scene uses. */
export function engineToWorld(p: Vec3, outer: Size): THREE.Vector3 {
  const [ox, oy, oz] = baseOffset(outer);
  const v = new THREE.Vector3(p.x + ox, p.y + oy, p.z + oz);
  return v.applyEuler(new THREE.Euler(ENGINE_ROTATION_X, 0, 0));
}
