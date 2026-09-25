import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// REFERENCE FAN: the worked example of the model contract. Copy its shape.
//
// A blower fan: a square housing with a round intake in the top plate, closed
// on three sides and open on the fourth (the outlet, which faces the fin stack
// on the vent edge), and a rotor of thin blades around a hub.
// 2006 fans have fewer, thicker blades and a bare metal top plate;
// 2026 fans have many thin blades and a dark plastic housing.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

const PLATE = 0.5;
const WALL = 0.8;

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

function build(
  box3: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const modern = ctx.year >= 2015;
  const side = Math.min(box3.width, box3.depth);
  const h = box3.height;
  const half = side / 2;
  const outlet = ctx.edge ?? "back";
  const housing = modern ? ctx.materials.plastic : ctx.materials.metal;
  const top = ctx.materials.metal;
  const rotorMat = modern ? ctx.materials.plastic : ctx.materials.body;

  const fan = new THREE.Group();

  // Bottom and top plates. The top plate has the round intake.
  fan.add(box(side, PLATE, side, housing, 0, -h / 2 + PLATE / 2, 0));
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.lineTo(-half, -half);
  const intake = new THREE.Path();
  intake.absarc(0, 0, side * 0.36, 0, Math.PI * 2, true);
  shape.holes.push(intake);
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: PLATE,
      bevelEnabled: false,
      curveSegments: 24,
    }),
    top,
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = h / 2 - PLATE;
  fan.add(plate);

  // Walls on three sides; the outlet side stays open.
  const wallH = h - 2 * PLATE;
  if (outlet !== "left")
    fan.add(box(WALL, wallH, side, housing, -half + WALL / 2, 0, 0));
  if (outlet !== "right")
    fan.add(box(WALL, wallH, side, housing, half - WALL / 2, 0, 0));
  if (outlet !== "front")
    fan.add(box(side - 2 * WALL, wallH, WALL, housing, 0, 0, half - WALL / 2));
  if (outlet !== "back")
    fan.add(box(side - 2 * WALL, wallH, WALL, housing, 0, 0, -half + WALL / 2));

  // Rotor: hub and blades, clear of both plates and the walls.
  const rotorH = Math.max(0.5, wallH - 0.6);
  const hubR = side * 0.18;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR, hubR, rotorH, 24),
    rotorMat,
  );
  fan.add(hub);
  const blades = modern ? 31 : 11;
  const tipR = half - WALL - 1.2;
  const length = tipR - hubR;
  const thick = modern ? 0.35 : 0.9;
  const bladeGeo = new THREE.BoxGeometry(length, rotorH * 0.92, thick);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, rotorMat);
    const r = hubR + length / 2;
    blade.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Radial, then swept back a little.
    blade.rotation.y = -a + 0.35;
    fan.add(blade);
  }

  // Anchors: the top of the hub, and the centre of the outlet opening.
  fan.add(anchor("hub", 0, rotorH / 2, 0));
  const o = {
    left: [-half, 0, 0],
    right: [half, 0, 0],
    front: [0, 0, half],
    back: [0, 0, -half],
  }[outlet];
  fan.add(anchor("outlet", o[0], o[1], o[2]));
  return fan;
}

export const model: ModelModule = { key: "fan", build };
