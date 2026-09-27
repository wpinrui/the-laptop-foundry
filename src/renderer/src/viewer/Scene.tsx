import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { VIEW_EVENT, VIEW_STEP, type View } from "../panel/fx";
import { GLOW_EASE, GLOW_PER_CANDELA, GLOW_REACH, HALO_SPREAD } from "../panel/tuning";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type { Box, Build, Decor, Fit, Side } from "../engine";
import { bumperBlock, outerSpanAt, shellSurface } from "../engine";
import { LID_GROUP } from "../models/roles/hinge";
import { keyPlateThickness } from "../models/roles/keys";
import { padOutline } from "../models/roles/pad";
import { BaseMarks, faceOf, LidDecor } from "./Decor";
import { attachLegends } from "./legends";
import { overflowSlabs } from "./overflow";
import { useStable } from "./stable";
import { type Cuts, flushBay, portCuts, wallPositions } from "./walls";
import { grillGeometry } from "./grill";
import { speakerGrillGeometry } from "./speakerGrill";
import {
  disposeUnit,
  renderUnit,
  type UnitCtx,
  type UnitOpts,
} from "./renderUnit";
import { baseOffset, CAMERA_POSITION, ENGINE_ROTATION_X } from "./space";
import { roleColour, token } from "./theme";

export interface Hover {
  label: string;
  x: number;
  y: number;
}

interface SceneProps {
  fit: Fit;
  year: number;
  /** Lid opening angle in degrees. */
  lidAngle: number;
  colours: { floor: string; deck: string; lid: string };
  labelFor: (box: Box) => string;
  onHover: (h: Hover | null) => void;
  /** A page shown on the display panel, laid out at `width` CSS pixels across the active area. */
  screen?: { node: ReactNode; width: number; mm: { x: number; y: number } };
  camera?: { position: [number, number, number]; target: [number, number, number] };
  /** Called with the unit clicked. */
  onPick?: (box: Box) => void;
  /** A table top under the laptop, in this colour. */
  table?: string;
  /** Material and finish per piece; the shell shows them. */
  surfaces?: Surfaces;
  /** See-through shell, to show the internals. */
  xray?: boolean;
  /** Leaves out the units under the deck's top wall (keyboard, trackpad and the like), except selected ones. */
  hideDeck?: boolean;
  /** Called with every unit that could not be drawn, as "label: reason". */
  onFailed?: (failed: string[]) => void;
  /** A still image lit on the display glass, such as a lock screen. */
  lockScreen?: THREE.Texture;
  /** Roughness of the lit display glass; low on a glossy panel, so it catches glare. */
  screenGloss?: number;
  /** Leaves the bottom cover off, to show the internals from below. */
  floorless?: boolean;
  /** Draws fit problems as red slabs. */
  problems?: boolean;
  /** Draws the listed units in the accent colour and, when dim, everything else dark. */
  paint?: Paint;
  /** The bezel colour and the player's marks. */
  decor?: Decor;
  /** Extra objects in the base's engine space (mm, z up), such as selection outlines. */
  extra?: ReactNode;
  /** Extra objects in the lid's engine space, closed position; they turn with the lid. */
  lidExtra?: ReactNode;
}

export interface Paint {
  /** Box ids drawn in the accent colour. */
  selected: Set<string>;
  dim: boolean;
}

export type Surfaces = Record<
  "floor" | "deck" | "lid",
  { material: string; texture: string }
>;

/** The shell surfaces of a build: material and finish per piece. */
export function surfacesOf(b: Build): Surfaces {
  const one = (p: "floor" | "deck" | "lid") => ({
    material: b.materials[p],
    texture: b.finish[p].texture,
  });
  return { floor: one("floor"), deck: one("deck"), lid: one("lid") };
}

const METALNESS: Record<string, number> = {
  plastic: 0,
  magnesium: 0.55,
  aluminium: 0.85,
  cfrp: 0.1,
};
const ROUGHNESS: Record<string, number> = {
  glossy: 0.12,
  matte: 0.62,
  "soft-touch": 0.9,
  brushed: 0.38,
  anodised: 0.3,
};

/** How a body material and its finish look: metalness and roughness. */
function surfaceLook(s: Surfaces[keyof Surfaces] | undefined) {
  return {
    metalness: METALNESS[s?.material ?? "plastic"] ?? 0,
    roughness: ROUGHNESS[s?.texture ?? "matte"] ?? 0.6,
  };
}

// ------------------------------------------------------------------ materials

function makeCtx(): UnitCtx & { dispose(): void } {
  const cache = new Map<string, THREE.Material>();
  return {
    material(colour, kind = "matte") {
      const key = `${kind}|${colour}`;
      let m = cache.get(key);
      if (!m) {
        m =
          kind === "glow"
            ? new THREE.MeshStandardMaterial({
                color: colour,
                emissive: colour,
                emissiveIntensity: 0.6,
                roughness: 0.3,
              })
            : kind === "gloss"
              ? new THREE.MeshStandardMaterial({ color: colour, roughness: 0.08, metalness: 0.05 })
              : new THREE.MeshStandardMaterial({
                color: colour,
                roughness: 0.6,
                metalness: 0.1,
              });
        cache.set(key, m);
      }
      return m;
    },
    slots(bodyColour) {
      const std = (
        key: string,
        params: THREE.MeshStandardMaterialParameters,
      ) => {
        let m = cache.get(key);
        if (!m) {
          m = new THREE.MeshStandardMaterial(params);
          cache.set(key, m);
        }
        return m;
      };
      return {
        body: this.material(bodyColour),
        glow: this.material(bodyColour, "glow"),
        metal: std("slot|metal", {
          color: token("slot-metal"),
          roughness: 0.35,
          metalness: 0.8,
        }),
        copper: std("slot|copper", {
          color: token("slot-copper"),
          roughness: 0.35,
          metalness: 0.8,
        }),
        plastic: std("slot|plastic", {
          color: token("slot-plastic"),
          roughness: 0.7,
          metalness: 0,
        }),
        accent: std("slot|accent", {
          color: token("slot-accent"),
          roughness: 0.7,
          metalness: 0,
        }),
        rubber: std("slot|rubber", {
          color: token("slot-rubber"),
          roughness: 0.95,
          metalness: 0,
        }),
        glass: std("slot|glass", {
          color: token("slot-glass"),
          roughness: 0.05,
          metalness: 0,
          transparent: true,
          opacity: 0.35,
        }),
      };
    },
    danger: token("color-danger"),
    dispose() {
      for (const m of cache.values()) m.dispose();
      cache.clear();
    },
  };
}

// ------------------------------------------------------------------ units

/** Turns every lid-side hinge part (a LID_GROUP) with the lid, about its own pivot. */
export function turnLidParts(group: THREE.Object3D, lidAngle: number): void {
  const angle = (-lidAngle * Math.PI) / 180;
  group.traverse((o) => {
    if (o.name === LID_GROUP) o.rotation.x = angle;
  });
}

type Live = Map<string, { key: string; ctx: UnitCtx; obj: THREE.Object3D; failed?: string }>;

/**
 * Keeps one object per unit id; rebuilds a unit only when its role, part or size changes.
 * The group and the record of what is in it live in one ref, so they can never
 * part: a memo can be recomputed (Fast Refresh recomputes every one) while a ref
 * survives, and a fresh empty group beside a full record drew only the units
 * rebuilt after it. Each pass also re-checks that every kept unit is in the group.
 */
function useUnitsGroup(
  boxes: Box[],
  ctx: UnitCtx,
  labelFor: (b: Box) => string,
  year: number,
  hinge: UnitOpts["hinge"],
  onFailed?: (failed: string[]) => void,
): THREE.Group {
  const store = useRef<{ group: THREE.Group; live: Live } | null>(null);
  if (!store.current) store.current = { group: new THREE.Group(), live: new Map() };
  const { group, live } = store.current;
  // Unmount (and Fast Refresh) tears every unit down, so the next pass builds them all afresh.
  useEffect(
    () => () => {
      for (const v of live.values()) disposeUnit(v.obj);
      live.clear();
    },
    [live],
  );
  useEffect(() => {
    const seen = new Set<string>();
    const failed: string[] = [];
    for (const b of boxes) {
      seen.add(b.id);
      const key = `${b.role}|${b.part ?? ""}|${b.size.x.toFixed(3)}|${b.size.y.toFixed(3)}|${b.size.z.toFixed(3)}|${JSON.stringify(b.opts ?? {})}|${b.edge ?? ""}|${b.turn ? "turn" : ""}|${year}|${hinge}`;
      let label = b.role as string;
      try {
        label = labelFor(b);
      } catch {}
      const had = live.get(b.id);
      if (had && had.key === key && had.ctx === ctx && had.obj.parent === group) {
        had.obj.position.set(
          b.at.x + b.size.x / 2,
          b.at.y + b.size.y / 2,
          b.at.z + b.size.z / 2,
        );
        had.obj.traverse((o) => {
          o.userData.label = label;
          o.userData.box = b;
        });
        if (had.failed) failed.push(`${label}: ${had.failed}`);
        continue;
      }
      if (had) disposeUnit(had.obj);
      // One unit that cannot be built must never stop the rest from drawing.
      let obj: THREE.Object3D;
      try {
        obj = renderUnit(b.role, b, { colour: roleColour(b.role, year), year, hinge }, ctx);
        if (b.role === "keys") attachLegends(obj, b.opts);
      } catch (e) {
        console.error(`unit ${b.id} could not be drawn`, e);
        obj = dangerBox(b, ctx, e);
      }
      const why = obj.userData.failed as string | undefined;
      if (why) failed.push(`${label}: ${why}`);
      obj.traverse((o) => {
        o.userData.label = label;
        o.userData.box = b;
        o.castShadow = true;
      });
      group.add(obj);
      live.set(b.id, { key, ctx, obj, failed: why });
    }
    for (const [id, v] of live) {
      if (seen.has(id)) continue;
      disposeUnit(v.obj);
      live.delete(id);
    }
    onFailed?.(failed);
  }, [boxes, ctx, group, live, labelFor, year, hinge, onFailed]);
  return group;
}

/** A red stand-in box for a unit that could not be built at all. */
function dangerBox(b: Box, ctx: UnitCtx, e: unknown): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ctx.material(ctx.danger));
  m.position.set(b.at.x + b.size.x / 2, b.at.y + b.size.y / 2, b.at.z + b.size.z / 2);
  m.scale.set(Math.max(b.size.x, 0.2), Math.max(b.size.y, 0.2), Math.max(b.size.z, 0.2));
  m.userData.model = true;
  m.userData.failed = e instanceof Error ? e.message : String(e);
  return m;
}

function Units({
  boxes,
  ctx,
  labelFor,
  onHover,
  onPick,
  year,
  hinge,
  lidAngle,
  onFailed,
  paint,
}: {
  paint?: Paint;
  boxes: Box[];
  ctx: UnitCtx;
  labelFor: (b: Box) => string;
  onHover: SceneProps["onHover"];
  onPick?: SceneProps["onPick"];
  year: number;
  hinge: UnitOpts["hinge"];
  /** Turns the lid side of each hinge mount with the lid, in degrees. */
  lidAngle?: number;
  /** Called after each pass with the units that could not be drawn. */
  onFailed?: (failed: string[]) => void;
}) {
  const group = useUnitsGroup(boxes, ctx, labelFor, year, hinge, onFailed);
  // Runs after the units effect above, so freshly built hinges turn too.
  useEffect(() => {
    if (lidAngle === undefined) return;
    turnLidParts(group, lidAngle);
  }, [group, lidAngle, boxes, ctx, year, hinge]);
  // Selection paint: swap each mesh's material and keep the original to restore.
  useEffect(() => {
    const accent = paint ? ctx.material(token("accent-hex")) : null;
    const dim = paint ? ctx.material(token("dim-part")) : null;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const box = o.userData.box as Box | undefined;
      if (!mesh.isMesh || !box) return;
      if (mesh.userData.baseMaterial === undefined) mesh.userData.baseMaterial = mesh.material;
      const base = mesh.userData.baseMaterial as THREE.Material;
      mesh.material = !paint ? base : paint.selected.has(box.id) && accent ? accent : paint.dim && dim ? dim : base;
    });
  }, [group, paint, boxes, ctx, year, hinge]);
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const label = e.object.userData.label as string | undefined;
    onHover(
      label
        ? { label, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        : null,
    );
  };
  return (
    <primitive
      object={group}
      onPointerMove={move}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const box = e.object.userData.box as Box | undefined;
        if (onPick && box) {
          e.stopPropagation();
          onPick(box);
        }
      }}
    />
  );
}

// ------------------------------------------------------------------ shell

type Wells = Fit["shell"]["wells"];
const LAP = 1.5;
/** A trackpad well's corner radii, front and back; a well without one is square with a lap. */
type Round = { front: number; back: number } | undefined;

/** The trackpad well's corner radii, per well, from the pad unit in it. */
function wellRounds(fit: Fit, year: number): Round[] {
  return fit.shell.wells.map((w) => {
    const pad = fit.boxes.find(
      (b) => b.kind === "unit" && b.role === "pad" && b.at.x === w.at.x && b.at.y === w.at.y,
    );
    return pad ? padOutline(pad.size.x, pad.size.y, year, pad.opts) : undefined;
  });
}

/**
 * The deck's hole round a trackpad: the pad's own outline, a hairline out, so
 * the pad sits flush with a fine dark gap and nothing lies under the deck at
 * its edge. A lap here hid the pad's edge and the well's lining a fraction of
 * a mm under a deck pushed back in depth, and at a low angle they showed
 * through it as a dark frame round the pad.
 */
function roundHole(w: Wells[number], r: NonNullable<Round>): THREE.Path {
  const x0 = w.at.x - WELL_CLEAR;
  const y0 = w.at.y - WELL_CLEAR;
  const x1 = w.at.x + w.size.x + WELL_CLEAR;
  const y1 = w.at.y + w.size.y + WELL_CLEAR;
  const max = Math.min(x1 - x0, y1 - y0) / 2 - 0.01;
  const rf = Math.max(0.05, Math.min(r.front + WELL_CLEAR, max));
  const rb = Math.max(0.05, Math.min(r.back + WELL_CLEAR, max));
  const hole = new THREE.Path();
  hole.moveTo(x0 + rf, y0);
  hole.lineTo(x1 - rf, y0);
  hole.absarc(x1 - rf, y0 + rf, rf, -Math.PI / 2, 0, false);
  hole.lineTo(x1, y1 - rb);
  hole.absarc(x1 - rb, y1 - rb, rb, 0, Math.PI / 2, false);
  hole.lineTo(x0 + rb, y1);
  hole.absarc(x0 + rb, y1 - rb, rb, Math.PI / 2, Math.PI, false);
  hole.lineTo(x0, y0 + rf);
  hole.absarc(x0 + rf, y0 + rf, rf, Math.PI, 1.5 * Math.PI, false);
  hole.closePath();
  return hole;
}

/**
 * The shell surface. "open" leaves out the flat top face, which the deck
 * draws instead; "deck" is that top face alone, with the keyboard and
 * trackpad wells cut out so a solid shell does not cover them.
 */
function surfaceGeometry(
  size: Fit["shell"]["outer"],
  style: Fit["shell"]["style"],
  profile: boolean,
  mode: "full" | "open" | "deck" | "walls" | "floor" | "back" = "full",
  wells: Wells = [],
  cuts: Cuts = {},
  wallDepth = 0,
  rounds: Round[] = [],
): THREE.BufferGeometry {
  const open = mode === "deck" || mode === "floor" ? [] : (Object.keys(cuts) as Side[]);
  const data = shellSurface(size, style, profile, 8, open);
  const count = data.positions.length / 3;
  if (mode === "deck") {
    // The flat front of the top face, with the wells cut, and whatever the
    // body raises or rounds behind it (a shelf, a spine) as the shell has it.
    const shape = new THREE.Shape(data.deck.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const [i, w] of wells.entries()) {
      const round = rounds[i];
      if (round) {
        shape.holes.push(roundHole(w, round));
        continue;
      }
      const hole = new THREE.Path();
      // The deck laps over the edge of each module by a little, as a real
      // top case does, so no internals show in the gap at the well's edge.
      const lap = Math.min(LAP, w.size.x / 4, w.size.y / 4);
      const x0 = w.at.x + lap;
      const y0 = w.at.y + lap;
      const x1 = w.at.x + w.size.x - lap;
      const y1 = w.at.y + w.size.y - lap;
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }
    const flat = new THREE.ShapeGeometry(shape).toNonIndexed();
    flat.translate(0, 0, data.deck.z);
    const fp = flat.getAttribute("position");
    const [r0, r1] = data.deck.rest;
    const all = new Float32Array(fp.count * 3 + (r1 - r0) * 3);
    all.set(fp.array as Float32Array);
    for (let i = r0; i < r1; i++) {
      const v = data.indices[i];
      all.set(data.positions.subarray(v * 3, v * 3 + 3), fp.count * 3 + (i - r0) * 3);
    }
    flat.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(all, 3));
    g.computeVertexNormals();
    return g;
  }
  let indices = data.indices;
  if (mode === "open" || mode === "walls" || mode === "floor" || mode === "back") {
    // "open" drops the top face, which the deck draws; "walls" drops the bottom face too;
    // "floor" keeps only the bottom face, the cover; "back" drops only the bottom face
    // (the lid's front, drawn as the bezel).
    const [b0, b1] = data.bottom;
    const [t0, t1] = data.top;
    const kept: number[] = [];
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const bottom = i >= b0 && i < b1;
      const top = i >= t0 && i < t1;
      const keep =
        mode === "floor" ? bottom : mode === "back" ? !bottom : !top && (mode !== "walls" || !bottom);
      if (keep) kept.push(indices[i], indices[i + 1], indices[i + 2]);
    }
    indices = new Uint32Array(kept);
  }
  // The walls left open are built whole, with their port holes cut through.
  let positions = data.positions;
  if (data.walls.length > 0) {
    const extra: number[] = [];
    for (const w of data.walls) extra.push(...wallPositions(w, cuts[w.side] ?? [], wallDepth));
    const all = new Float32Array(positions.length + extra.length);
    all.set(positions);
    all.set(extra, positions.length);
    const idx = new Uint32Array(indices.length + extra.length / 3);
    idx.set(indices);
    for (let i = 0; i < extra.length / 3; i++) idx[indices.length + i] = count + i;
    positions = all;
    indices = idx;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

function Shell({
  size,
  style,
  colour,
  profile,
  z = 0,
  surface,
  xray = true,
  offset = 2,
  mode = "full",
  wells,
  rounds,
  cuts,
  wallDepth,
}: {
  size: Fit["shell"]["outer"];
  style: Fit["shell"]["style"];
  colour: string;
  profile: boolean;
  z?: number;
  surface?: Surfaces[keyof Surfaces];
  xray?: boolean;
  /** Depth push. The deck plate uses less, so it wins over the top face of the base. */
  offset?: number;
  mode?: "full" | "open" | "deck" | "walls" | "floor" | "back";
  wells?: Wells;
  /** Per well, a trackpad's corner radii: its hole follows the pad's outline. */
  rounds?: Round[];
  /** Port openings cut through the side walls, so a solid shell shows the connectors. */
  cuts?: Cuts;
  /** Side wall thickness: how deep the port holes run to the connector faces. */
  wallDepth?: number;
}) {
  const look = surfaceLook(surface);
  // A re-solve rebuilds these objects; the surface is rebuilt only when their content changes.
  const shape = useStable({ style, wells, cuts, rounds });
  const geometry = useMemo(
    () => surfaceGeometry(size, shape.style, profile, mode, shape.wells, shape.cuts, wallDepth, shape.rounds),
    [size.x, size.y, size.z, shape, profile, mode, wallDepth],
  );
  // The edges only show in x-ray.
  const edges = useMemo(() => (xray ? new THREE.EdgesGeometry(geometry, 25) : null), [geometry, xray]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => edges?.dispose(), [edges]);
  return (
    <group position={[0, 0, z]}>
      <mesh geometry={geometry} renderOrder={2}>
        {/* Units sit flush on the shell's faces (a cover-glass panel IS the
            lid's front face), so the shell is pushed back in depth: a flush
            unit face wins cleanly instead of z-fighting the shell's fan.
            The deck is pushed by a constant only: a slope-scaled push grows
            at a low angle until the well linings and unit edges a fraction
            of a mm under it show through as a dark frame. Nothing sits
            flush over it now that the trackpad's hole follows the pad. */}
        <meshStandardMaterial
          // Remount on mode change so three recompiles the transparency state.
          key={xray ? "xray" : "solid"}
          color={colour}
          transparent={xray}
          opacity={xray ? 0.22 : 1}
          depthWrite={!xray}
          side={THREE.DoubleSide}
          roughness={look.roughness}
          metalness={look.metalness}
          polygonOffset
          // The deck and the bottom cover are pushed by a constant only: a
          // slope-scaled push sinks a big flat face at an angle behind the
          // units a mm inside it, and the fans and battery showed through
          // the closed cover as flat grey shapes.
          polygonOffsetFactor={mode === "deck" || mode === "floor" ? 0 : offset}
          polygonOffsetUnits={offset}
        />
      </mesh>
      {edges && (
        <lineSegments geometry={edges} renderOrder={3}>
          <lineBasicMaterial color={colour} transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
}

/**
 * The lid's front face (the B panel round the display) in the bezel's own
 * colour, with the lid's material look. The lid shell leaves this face out, so
 * the lid colour never shows over it. The panel shows through a hole.
 */
function LidFront({
  fit,
  colour,
  surface,
  xray,
}: {
  fit: Fit;
  colour: string;
  surface?: Surfaces[keyof Surfaces];
  xray: boolean;
}) {
  const look = surfaceLook(surface);
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const size = fit.shell.lid.size;
  const style = useStable(fit.shell.style);
  const px = panel?.at.x ?? 0;
  const py = panel?.at.y ?? 0;
  const pw = panel?.size.x ?? 0;
  const ph = panel?.size.y ?? 0;
  const geometry = useMemo(() => {
    const data = shellSurface(size, style, false, 8);
    const pts: THREE.Vector2[] = [];
    for (let v = 0; v < data.n; v++) pts.push(new THREE.Vector2(data.positions[v * 3], data.positions[v * 3 + 1]));
    const shape = new THREE.Shape(pts);
    if (pw > 0 && ph > 0) {
      const hole = new THREE.Path();
      hole.moveTo(px, py);
      hole.lineTo(px + pw, py);
      hole.lineTo(px + pw, py + ph);
      hole.lineTo(px, py + ph);
      hole.closePath();
      shape.holes.push(hole);
    }
    return new THREE.ShapeGeometry(shape);
  }, [size.x, size.y, size.z, style, px, py, pw, ph]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 0, fit.shell.lid.at.z]} renderOrder={2}>
      <meshStandardMaterial
        key={xray ? "xray" : "solid"}
        color={colour}
        transparent={xray}
        opacity={xray ? 0.22 : 1}
        depthWrite={!xray}
        side={THREE.DoubleSide}
        roughness={look.roughness}
        metalness={look.metalness}
        polygonOffset
        polygonOffsetFactor={2}
        polygonOffsetUnits={2}
      />
    </mesh>
  );
}

/**
 * The visible hinge, as barrels centred on the lid's axis, so it looks the
 * same at every lid angle and always joins the lid to the base. `part` picks
 * which knuckles to draw: the base's go in the base group, the lid's in the lid
 * group, so each turns with its own half. By the body's hinge:
 *   full, inset: one barrel along the whole rear edge (in front of the shelf
 *     on an inset hinge, sitting on the deck); two end knuckles over the
 *     mounts belong to the base, the long middle one to the lid, with a steel
 *     shaft showing in the splits.
 *   barrel: a short barrel over each mount, its outer half the base's and its
 *     inner half the lid's.
 *   drop, lift: one clutch barrel of the lid's between the mounts (the whole
 *     width on a lift), round the axis below the lid's edge, so the lid's edge
 *     rolls down behind the rear as it opens.
 *   spine: none; the spine is the barrel.
 */
function HingeBarrel({
  fit,
  part,
  colour,
  surface,
  xray,
}: {
  fit: Fit;
  part: "base" | "lid";
  colour: string;
  surface?: Surfaces[keyof Surfaces];
  xray: boolean;
}) {
  const axis = fit.anchors.find((a) => a.kind === "hinge");
  const mounts = fit.boxes.filter((b) => b.kind === "unit" && b.role === "hinge").sort((a, b) => a.at.x - b.at.x);
  const kind = fit.shell.style.hinge;
  if (kind === "spine" || axis?.kind !== "hinge" || mounts.length < 2) return null;
  const out = fit.shell.outer;
  const look = surfaceLook(surface);
  const split = 0.5;
  // Clear of any corner bumpers.
  const x0 = 0.3 + bumperBlock(fit.shell.style);
  const x1 = out.x - x0;
  const m0 = mounts[0];
  const m1 = mounts[mounts.length - 1];
  const xa = m0.at.x + m0.size.x;
  const xb = m1.at.x;
  // How far the axis sits below the lid's bottom face (drop, lift) or above the deck (inset).
  const below = out.z - axis.from.z;
  let r: number;
  let spans: [number, number][];
  if (kind === "drop" || kind === "lift") {
    // Just reaches the lid's bottom face, so the lid's edge stays on it as it turns.
    r = below + 0.3;
    spans = part === "base" ? [] : kind === "lift" ? [[x0, x1]] : [[m0.at.x, m1.at.x + m1.size.x]];
  } else if (kind === "barrel") {
    r = Math.min(0.8 * fit.shell.lid.size.z, 0.35 * out.z, fit.shell.offsets.side + 3);
    const inset = Math.min(1.5, m0.size.x / 6);
    const [a0, a1] = [m0.at.x + inset, m0.at.x + m0.size.x - inset];
    const [b0, b1] = [m1.at.x + inset, m1.at.x + m1.size.x - inset];
    const am = (a0 + a1) / 2;
    const bm = (b0 + b1) / 2;
    spans =
      part === "base"
        ? [[a0, am - split / 2], [bm + split / 2, b1]]
        : [[am + split / 2, a1], [b0, bm - split / 2]];
  } else {
    // As thick as the lid, so the lid's bottom edge stays inside it as it
    // turns; no more than 0.4 of the base's height, and clear of the keyboard.
    // Inset: sitting on the deck, the axis its height over it.
    r = kind === "inset" ? -below : Math.min(fit.shell.lid.size.z, 0.4 * out.z, fit.shell.offsets.side + 3);
    spans = part === "base" ? [[x0, xa - split / 2], [xb + split / 2, x1]] : [[xa + split / 2, xb - split / 2]];
  }
  const shaft: [number, number][] =
    part !== "base" || kind === "drop" || kind === "lift" ? [] : kind === "barrel" ? [[m0.at.x + 1, m0.at.x + m0.size.x - 1], [m1.at.x + 1, m1.at.x + m1.size.x - 1]] : [[x0 + 0.1, x1 - 0.1]];
  const material = (
    <meshStandardMaterial
      key={xray ? "xray" : "solid"}
      color={colour}
      transparent={xray}
      opacity={xray ? 0.22 : 1}
      depthWrite={!xray}
      roughness={look.roughness}
      metalness={look.metalness}
    />
  );
  return (
    <group position={[0, axis.from.y, axis.from.z]} rotation-z={-Math.PI / 2}>
      {/* A cylinder runs along y; turned a quarter about z, its +y runs along +x. */}
      {spans.map(([a, b]) => (
        <mesh key={a} position={[0, (a + b) / 2, 0]}>
          <cylinderGeometry args={[r, r, b - a, 40]} />
          {material}
        </mesh>
      ))}
      {shaft.map(([a, b]) => (
        <mesh key={`shaft-${a}`} position={[0, (a + b) / 2, 0]}>
          <cylinderGeometry args={[0.45 * r, 0.45 * r, b - a, 20]} />
          <meshStandardMaterial color={token("slot-metal")} roughness={0.35} metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Rubber corner bumpers, full height, standing proud of the shell's sides, top and bottom. */
function Bumpers({ fit, xray }: { fit: Fit; xray: boolean }) {
  const style = useStable(fit.shell.style);
  const out = fit.shell.outer;
  const b = style.bumper;
  const geometry = useMemo(() => {
    if (b <= 0) return null;
    const side = bumperBlock(style) + 0.15 * b;
    const stub: typeof style = {
      ...style,
      edge: "rounded",
      corner: Math.min(0.5 * b, side / 2 - 0.01),
      profile: Math.min(0.6 * b, out.z / 4),
      taper: null,
      pm: null,
      cornerKind: "round",
      ui: 0,
      uh: 0,
      drop: 0,
      D: 0,
      Sd: 0,
      R: 0,
      lip: 0,
      bevel: null,
      q: 0,
      crown: 0,
    };
    const data = shellSurface({ x: side, y: side, z: out.z }, stub, true, 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    return { g, side };
  }, [b, style, out.z]);
  useEffect(() => () => geometry?.g.dispose(), [geometry]);
  if (!geometry) return null;
  const o = -0.15 * b;
  const far = (len: number) => len - geometry.side - o;
  const at: [number, number][] = [
    [o, o],
    [far(out.x), o],
    [o, far(out.y)],
    [far(out.x), far(out.y)],
  ];
  return (
    <group>
      {at.map(([x, y]) => (
        <mesh key={`${x}-${y}`} geometry={geometry.g} position={[x, y, 0]} renderOrder={2}>
          <meshStandardMaterial
            key={xray ? "xray" : "solid"}
            color={token("slot-rubber")}
            transparent={xray}
            opacity={xray ? 0.3 : 1}
            depthWrite={!xray}
            roughness={0.9}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

/** How far a well's dark lining stands off the unit in it, in mm. */
const WELL_CLEAR = 0.2;

/**
 * The lining of a keyboard or trackpad well, dark: a floor under the unit and
 * four walls from the top case down to it. Without the walls a look through
 * the opening at a slant passed under the top case's lip, beside the unit,
 * and lit up the inside of the shell floor as a pale strip along the far
 * edges (worst through a glass trackpad).
 */
function Well({
  well: w,
  top,
  floor,
  tint,
  flush,
}: { well: Wells[number]; top: number; floor?: number; tint?: string; flush?: boolean }) {
  const x0 = w.at.x - WELL_CLEAR;
  const y0 = w.at.y - WELL_CLEAR;
  const sx = w.size.x + 2 * WELL_CLEAR;
  const sy = w.size.y + 2 * WELL_CLEAR;
  const z0 = floor ?? w.at.z - 0.05;
  // The walls stop just under the top case, so their top edge never meets its face.
  // A trackpad's hole is cut on them, so theirs rise to its edge and close the gap.
  const h = (flush ? top : top - WELL_CLEAR) - z0;
  const colour = tint ?? token("color-opening");
  // A player's colour takes the light, so it reads as a surface; the stock dark stays flat.
  const mat = tint ? (
    <meshStandardMaterial color={colour} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
  ) : (
    <meshBasicMaterial color={colour} side={THREE.DoubleSide} />
  );
  const walls: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number] }[] = [
    { pos: [x0 + sx / 2, y0, z0 + h / 2], rot: [Math.PI / 2, 0, 0], size: [sx, h] },
    { pos: [x0 + sx / 2, y0 + sy, z0 + h / 2], rot: [Math.PI / 2, 0, 0], size: [sx, h] },
    { pos: [x0, y0 + sy / 2, z0 + h / 2], rot: [Math.PI / 2, Math.PI / 2, 0], size: [sy, h] },
    { pos: [x0 + sx, y0 + sy / 2, z0 + h / 2], rot: [Math.PI / 2, Math.PI / 2, 0], size: [sy, h] },
  ];
  return (
    <group>
      <mesh position={[x0 + sx / 2, y0 + sy / 2, z0]}>
        <planeGeometry args={[sx, sy]} />
        {mat}
      </mesh>
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.pos} rotation={wall.rot}>
          <planeGeometry args={wall.size} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

/**
 * How deep a well's floor goes. Under a keyboard it lies just over the key
 * plate: sculpted caps tilt and dish well below the top wall on a thin deck,
 * and a floor at the top wall's underside cut dark bites out of their tops.
 * Any other unit keeps the floor under the top wall.
 */
function wellFloor(fit: Fit, w: Wells[number], year: number): number | undefined {
  const keys = fit.boxes.find(
    (b) => b.kind === "unit" && b.role === "keys" && b.at.x === w.at.x && b.at.y === w.at.y,
  );
  if (!keys) return undefined;
  return keys.at.z + keyPlateThickness(keys.size.z, year) + 0.15;
}

/** The speaker grill's holes, in the opening colour, pushed onto the surface by polygon offset. */
function SpeakerGrill({ fit, year }: { fit: Fit; year: number }) {
  const geo = useMemo(() => speakerGrillGeometry(fit, year), [fit, year]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color={token("color-opening")}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-3}
        polygonOffsetUnits={-3}
      />
    </mesh>
  );
}

function Openings({ fit }: { fit: Fit }) {
  const colour = token("color-opening");
  const w = fit.shell.walls.side + 0.4;
  const out = fit.shell.outer;
  // A slotted grill's slots, all in one mesh.
  const cutouts = useStable(fit.shell.cutouts);
  const grill = useMemo(() => grillGeometry(cutouts, out, w - 0.2), [cutouts, out.x, out.y, out.z, w]);
  useEffect(() => () => grill?.dispose(), [grill]);
  return (
    <group>
      {grill && (
        <mesh geometry={grill}>
          <meshBasicMaterial color={colour} side={THREE.DoubleSide} />
        </mesh>
      )}
      {fit.shell.cutouts.map((o) => {
        // A port's or bay's model draws its own opening (a connector face, a
        // drive bezel); an opaque block here would hide it and read as a
        // black brick in the wall. A grill's slots are drawn above.
        if (o.kind === "port" || o.kind === "bay" || o.slots) return null;
        const du = o.u[1] - o.u[0];
        const dz = o.z[1] - o.z[0];
        const uc = (o.u[0] + o.u[1]) / 2;
        const zc = (o.z[0] + o.z[1]) / 2;
        const pos: [number, number, number] =
          o.side === "left"
            ? [w / 2 - 0.2, uc, zc]
            : o.side === "right"
              ? [out.x - w / 2 + 0.2, uc, zc]
              : o.side === "front"
                ? [uc, w / 2 - 0.2, zc]
                : [uc, out.y - w / 2 + 0.2, zc];
        const scale: [number, number, number] =
          o.side === "left" || o.side === "right" ? [w, du, dz] : [du, w, dz];
        return (
          <mesh key={o.id} position={pos} scale={scale}>
            <boxGeometry />
            <meshBasicMaterial color={colour} />
          </mesh>
        );
      })}
    </group>
  );
}

function Overflow({ fit }: { fit: Fit }) {
  const slabs = useMemo(() => overflowSlabs(fit), [fit]);
  const colour = token("color-danger");
  return (
    <group>
      {slabs.map((s, i) => (
        <mesh
          key={i}
          position={[
            s.at.x + s.size.x / 2,
            s.at.y + s.size.y / 2,
            s.at.z + s.size.z / 2,
          ]}
          scale={[s.size.x, s.size.y, s.size.z]}
          renderOrder={4}
        >
          <boxGeometry />
          <meshBasicMaterial
            color={colour}
            transparent
            opacity={0.75}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ scene

const HALO_VERT = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uHalf;
uniform float uSpread;
varying vec2 vPos;
void main() {
  float d = length(max(abs(vPos) - uHalf, 0.0));
  gl_FragColor = vec4(uColor * uOpacity * exp(-3.0 * d / uSpread), 1.0);
}`;

/**
 * The screen's place, facing out of the lid with its top edge away from the
 * hinge. Each frame it tells the page where the camera is: the angle above or
 * below and beside the screen's normal, which the panel's viewing angle reads.
 * It also lights the scene as the page does: a soft light out of the screen,
 * tinted and scaled by the page's average colour, and a faint halo.
 */
function ScreenView({
  portal,
  mm,
  position,
  children,
}: {
  portal?: RefObject<HTMLDivElement | null>;
  mm: { x: number; y: number };
  position: [number, number, number];
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const aim = useRef<THREE.Object3D>(null);
  const page = useRef<HTMLElement | null>(null);
  const last = useRef<View | null>(null);
  const eye = useMemo(() => new THREE.Vector3(), []);
  const glow = useRef({ key: "", want: [0, 0, 0, 0], now: [0, 0, 0, 0] });
  const halo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(0, 0, 0) },
          uOpacity: { value: 0 },
          uHalf: { value: new THREE.Vector2(mm.x / 2, mm.y / 2) },
          uSpread: { value: HALO_SPREAD },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [mm.x, mm.y],
  );
  useEffect(() => () => halo.dispose(), [halo]);
  useEffect(() => {
    if (spot.current && aim.current) spot.current.target = aim.current;
  }, []);
  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    if (!page.current?.isConnected) {
      // A newly mounted page starts head-on: it needs the view again.
      page.current = portal?.current?.querySelector<HTMLElement>(".panel-page") ?? null;
      last.current = null;
    }
    const el = page.current;

    // The glow follows the page's last guessed colour, easing; no page, no light.
    const gl = glow.current;
    const key = el?.dataset.glow ?? "";
    if (key !== gl.key) {
      gl.key = key;
      gl.want = key ? key.split(",").map(Number) : [0, 0, 0, 0];
    }
    const k = Math.min(1, dt / GLOW_EASE);
    for (let i = 0; i < 4; i++) gl.now[i] += (gl.want[i] - gl.now[i]) * k;
    const [r, gg, b, haloK] = gl.now;
    const top = Math.max(r, gg, b, 1e-6);
    const area = (mm.x * mm.y) / 1e6;
    const s = spot.current;
    if (s) {
      s.color.setRGB(r / top, gg / top, b / top);
      s.intensity = GLOW_PER_CANDELA * area * top;
    }
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    halo.uniforms.uColor.value.setRGB(r / top, gg / top, b / top);
    halo.uniforms.uOpacity.value = (haloK * lum) / 100;

    if (!el) return;
    g.worldToLocal(camera.getWorldPosition(eye));
    // Behind the screen there is nothing to see.
    if (eye.z <= 0) return;
    const deg = 180 / Math.PI;
    const view: View = {
      v: Math.atan2(eye.y, eye.z) * deg,
      h: Math.atan2(eye.x, eye.z) * deg,
      half: Math.atan2(mm.y / 2, eye.length()) * deg,
    };
    const l = last.current;
    if (
      l &&
      Math.abs(view.v - l.v) < VIEW_STEP &&
      Math.abs(view.h - l.h) < VIEW_STEP &&
      Math.abs(view.half - l.half) < VIEW_STEP
    )
      return;
    last.current = view;
    el.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail: view }));
  });
  return (
    <group ref={group} position={position} rotation={[Math.PI, 0, 0]}>
      {children}
      {/* No shadows: the shadow maps are drawn once and held. */}
      <spotLight
        ref={spot}
        position={[0, 0, 4]}
        intensity={0}
        angle={1.5}
        penumbra={1}
        decay={2}
        distance={GLOW_REACH}
      />
      <object3D ref={aim} position={[0, 0, 100]} />
      <mesh position={[0, 0, 1.5]} material={halo} renderOrder={5}>
        <planeGeometry args={[mm.x + 4 * HALO_SPREAD, mm.y + 4 * HALO_SPREAD]} />
      </mesh>
    </group>
  );
}

export const Model = memo(function Model({
  fit,
  year,
  lidAngle,
  colours,
  labelFor,
  onHover,
  onPick,
  screen,
  table,
  surfaces,
  xray = true,
  hideDeck = false,
  portal,
  onFailed,
  lockScreen,
  screenGloss = 0.35,
  floorless = false,
  problems = true,
  paint,
  extra,
  lidExtra,
  decor,
}: SceneProps & { portal?: RefObject<HTMLDivElement | null> }) {
  const ctx = useMemo(() => makeCtx(), []);
  // Base and lid report their failed units separately; the scene gets them together.
  const failed = useRef<{ base: string[]; lid: string[] }>({ base: [], lid: [] });
  const reportBase = useCallback(
    (f: string[]) => {
      failed.current.base = f;
      onFailed?.([...f, ...failed.current.lid]);
    },
    [onFailed],
  );
  const reportLid = useCallback(
    (f: string[]) => {
      failed.current.lid = f;
      onFailed?.([...failed.current.base, ...f]);
    },
    [onFailed],
  );
  const panelBox = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  useEffect(() => () => ctx.dispose(), [ctx]);
  const base = useMemo(
    () =>
      fit.boxes
        .filter(
          (b) => b.kind === "unit" && b.piece !== "lid" && !(hideDeck && b.piece === "deck" && !paint?.selected.has(b.id)),
        )
        .map((b) => flushBay(b, fit.shell.outer)),
    [fit, hideDeck, paint],
  );
  const lid = useMemo(
    () => fit.boxes.filter((b) => b.kind === "unit" && b.piece === "lid"),
    [fit],
  );
  const hinge = fit.anchors.find((a) => a.kind === "hinge");
  const hy = hinge?.kind === "hinge" ? hinge.from.y : fit.shell.outer.y;
  const hz = hinge?.kind === "hinge" ? hinge.from.z : fit.shell.lid.at.z;
  const out = fit.shell.outer;
  const lidSize = fit.shell.lid.size;
  // Each port's own model draws its connector face; the wall is cut open over it.
  const cuts = useMemo(() => portCuts(fit), [fit]);
  const rounds = useMemo(() => wellRounds(fit, year), [fit, year]);


  return (
    // Engine space is z up; three is y up. Rotate once here and centre the base.
    <group rotation-x={ENGINE_ROTATION_X}>
      <group position={baseOffset(out)}>
        <Shell
          size={out}
          style={fit.shell.style}
          colour={colours.floor}
          profile
          surface={surfaces?.floor}
          xray={xray}
          mode="walls"
          cuts={cuts}
          wallDepth={fit.shell.offsets.side}
        />
        {!floorless && (
          <>
            <Shell
              size={out}
              style={fit.shell.style}
              colour={colours.floor}
              profile
              surface={surfaces?.floor}
              xray={xray}
              // Only a removable pack lies flush with the cover, in its own hatch.
              offset={4}
              mode="floor"
            />
            {!xray && <CoverFittings fit={fit} />}
          </>
        )}
        <Shell
          size={out}
          style={fit.shell.style}
          colour={colours.deck}
          profile
          surface={surfaces?.deck}
          xray={xray}
          offset={1}
          mode="deck"
          wells={fit.shell.wells}
          rounds={rounds}
        />
        {!xray &&
          fit.shell.wells.map((w, i) => {
            const floor = wellFloor(fit, w, year);
            return (
              <Well
                // By place in the list: a key from the well's position remounted it,
                // and recompiled its shaders, at every step of a size drag.
                // biome-ignore lint/suspicious/noArrayIndexKey: the wells keep their order
                key={i}
                well={w}
                top={out.z}
                floor={floor}
                flush={rounds[i] !== undefined}
                tint={floor === undefined ? undefined : decor?.keyDeck}
              />
            );
          })}
        <Openings fit={fit} />
        <SpeakerGrill fit={fit} year={year} />
        {table && (
          <mesh position={[out.x / 2, out.y / 2, -3]} scale={[out.x * 4, out.y * 3, 6]}>
            <boxGeometry />
            <meshStandardMaterial color={table} roughness={0.8} />
          </mesh>
        )}
        <Units
          boxes={base}
          ctx={ctx}
          labelFor={labelFor}
          onHover={onHover}
          onPick={onPick}
          year={year}
          hinge={fit.shell.style.hinge}
          lidAngle={lidAngle}
          onFailed={reportBase}
          paint={paint}
        />
        <HingeBarrel fit={fit} part="base" colour={colours.floor} surface={surfaces?.floor} xray={xray} />
        <Bumpers fit={fit} xray={xray} />
        <BaseMarks fit={fit} marks={decor?.marks} />
        {extra}
        {problems && <Overflow fit={fit} />}
        {/* The lid turns about the hinge axis, which runs along x. */}
        <group position={[0, hy, hz]} rotation-x={(-lidAngle * Math.PI) / 180}>
          <group position={[0, -hy, -hz]}>
            <Shell
              size={lidSize}
              style={fit.shell.style}
              colour={colours.lid}
              profile={false}
              z={fit.shell.lid.at.z}
              surface={surfaces?.lid}
              xray={xray}
              // No depth push: no unit is flush with the lid's back (there is always a
              // back wall), and a slope-scaled push sinks it behind the panel's back.
              offset={0}
              mode="back"
            />
            <LidFront fit={fit} colour={decor?.bezel ?? colours.lid} surface={surfaces?.lid} xray={xray} />
            <HingeBarrel fit={fit} part="lid" colour={colours.lid} surface={surfaces?.lid} xray={xray} />
            <Units
              boxes={lid}
              ctx={ctx}
              labelFor={labelFor}
              onHover={onHover}
              year={year}
              hinge={fit.shell.style.hinge}
              onFailed={reportLid}
              paint={paint}
            />
            <LidDecor fit={fit} marks={decor?.marks} />
            {lidExtra}
            {!xray && panelBox && (
              // A solid lid would hide a panel set behind its bezel: show the dark screen glass.
              <mesh
                position={[
                  panelBox.at.x + panelBox.size.x / 2,
                  panelBox.at.y + panelBox.size.y / 2,
                  Math.min(panelBox.at.z, fit.shell.lid.at.z) - 0.1,
                ]}
                rotation-x={Math.PI}
              >
                <planeGeometry args={[panelBox.size.x, panelBox.size.y]} />
                {/* Keyed apart: three compiles a material once, so the dark glass
                    reused for the lit one never samples the late texture and glows white. */}
                {lockScreen ? (
                  <meshStandardMaterial
                    key="lit"
                    color={token("color-opening")}
                    emissive={token("panel-glare")}
                    emissiveMap={lockScreen}
                    roughness={screenGloss}
                    metalness={0}
                  />
                ) : (
                  <meshStandardMaterial key="dark" color={token("color-opening")} roughness={0.4} metalness={0} />
                )}
              </mesh>
            )}
            {panelBox && (
              // The panel faces down when the lid is shut; its top edge is the one away from the hinge.
              // Mounted with or without a page, so its light never comes and goes (a new light recompiles every material).
              <ScreenView
                portal={screen ? portal : undefined}
                mm={screen?.mm ?? { x: panelBox.size.x, y: panelBox.size.y }}
                position={[
                  panelBox.at.x + panelBox.size.x / 2,
                  panelBox.at.y + panelBox.size.y / 2,
                  panelBox.at.z - 0.3,
                ]}
              >
                {screen && <Html
                  transform
                  // A fixed target: without it Html mounts on the canvas wrapper,
                  // remounts once events connect, and React 19 wipes the new root.
                  portal={portal as RefObject<HTMLElement>}
                  distanceFactor={(screen.mm.x * 400) / screen.width}
                  zIndexRange={[4, 0]}
                  wrapperClass="lid-screen"
                >
                  {screen.node}
                </Html>}
              </ScreenView>
            )}
          </group>
        </group>
      </group>
    </group>
  );
});

/** Whether a point of the underside lies on its flat part, clear of a battery hatch. */
function onCover(fit: Fit, x: number, y: number, r: number): boolean {
  const o = fit.shell.outer;
  const flat = faceOf(fit, "bottom").flat;
  if (flat) {
    for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (!flat(o.x / 2 - (x + dx), y + dy - o.y / 2)) return false;
    }
  }
  return !fit.shell.hatches.some(
    (h) => x > h.at.x - r - 1 && x < h.at.x + h.size.x + r + 1 && y > h.at.y - r - 1 && y < h.at.y + h.size.y + r + 1,
  );
}

/**
 * What a real bottom cover carries: a rubber foot near each corner and the
 * screws that hold it on, round its edge. Base engine space, under the cover.
 */
function CoverFittings({ fit }: { fit: Fit }) {
  const o = fit.shell.outer;
  const style = fit.shell.style;
  const shape = useStable({ o, style, hatches: fit.shell.hatches });
  const parts = useMemo(() => {
    const f0 = { shell: { ...fit.shell, outer: shape.o, style: shape.style, hatches: shape.hatches } } as Fit;
    const O = shape.o;
    const feet: { x: number; y: number; z: number; r: number }[] = [];
    const screws: { x: number; y: number; z: number }[] = [];
    const r = Math.min(7, Math.max(3.5, Math.min(O.x, O.y) * 0.022));
    const bottomAt = (x: number, y: number) => outerSpanAt(shape.style, O, x, y)[0];
    // A foot moves in toward the middle until it sits on the flat.
    const inset0 = Math.max(r + 8, shape.style.corner * 0.4 + r + 4);
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      for (let inset = inset0; inset < Math.min(O.x, O.y) / 3; inset += 2) {
        const x = sx ? O.x - inset : inset;
        const y = sy ? O.y - inset : inset;
        if (!onCover(f0, x, y, r)) continue;
        feet.push({ x, y, z: bottomAt(x, y), r });
        break;
      }
    }
    // Screws round the edge, and one mid-cover on each side.
    const e = Math.max(6, inset0 * 0.55);
    const spots: [number, number][] = [
      [O.x * 0.3, e],
      [O.x * 0.7, e],
      [O.x * 0.3, O.y - e],
      [O.x * 0.5, O.y - e],
      [O.x * 0.7, O.y - e],
      [e, O.y * 0.5],
      [O.x - e, O.y * 0.5],
    ];
    for (const [x, y] of spots) {
      if (!onCover(f0, x, y, 2)) continue;
      if (feet.some((f) => Math.hypot(f.x - x, f.y - y) < f.r + 4)) continue;
      screws.push({ x, y, z: bottomAt(x, y) });
    }
    return { feet, screws };
    // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt when the shape's content changes
  }, [shape]);
  const rubber = token("slot-rubber");
  const metal = token("slot-metal");
  const slot = token("color-opening");
  return (
    <group>
      {parts.feet.map((f, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed places
        <mesh key={`f${i}`} position={[f.x, f.y, f.z - 0.6]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[f.r, f.r * 0.85, 1.2, 28]} />
          <meshStandardMaterial color={rubber} roughness={0.95} metalness={0} />
        </mesh>
      ))}
      {parts.screws.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed places
        <group key={`s${i}`} position={[s.x, s.y, s.z]}>
          <mesh position={[0, 0, -0.08]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[1.25, 1.25, 0.16, 20]} />
            <meshStandardMaterial color={metal} roughness={0.4} metalness={0.8} />
          </mesh>
          {[0, Math.PI / 2].map((a) => (
            <mesh key={a} position={[0, 0, -0.17]} rotation-z={a}>
              <planeGeometry args={[1.6, 0.3]} />
              <meshBasicMaterial color={slot} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** The bottom cover alone, placed as the Model places the base, inner face up. */
export function BottomCover({
  fit,
  colour,
  surface,
}: {
  fit: Fit;
  colour: string;
  surface?: Surfaces[keyof Surfaces];
}) {
  const out = fit.shell.outer;
  return (
    <group rotation-x={ENGINE_ROTATION_X}>
      <group position={baseOffset(out)}>
        <Shell size={out} style={fit.shell.style} colour={colour} profile surface={surface} xray={false} offset={4} mode="floor" />
        <CoverFittings fit={fit} />
      </group>
    </group>
  );
}

/** A procedural room to reflect, so metal shells read as metal. No assets. */
export function Reflections({ intensity = 0.45 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/**
 * Shifts the picture left by `shift` pixels without moving the camera, so the
 * model centres in the part of the view an overlay panel leaves free.
 */
function ViewShift({ shift }: { shift: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (shift > 0)
      camera.setViewOffset(size.width + 2 * shift, size.height, 2 * shift, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, shift]);
  return null;
}

export function Scene(props: SceneProps & { shift?: number }) {
  const bg = token("color-bg");
  const overlay = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const outer = props.onFailed;
  const onFailed = useCallback(
    (f: string[]) => {
      setFailed((prev) => (prev.join("|") === f.join("|") ? prev : f));
      outer?.(f);
    },
    [outer],
  );
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
    <Canvas
      // The orbit camera never sits closer than 120mm or farther than 2500mm
      // (below); near:far used to span 1 to 20000mm, 400x wider than the
      // camera ever uses, which starves the depth buffer of precision at the
      // sub-mm gaps models rely on (e.g. the panel's screen over its module
      // stack) and shows up as moire z-fighting. Tightened to the range the
      // camera actually visits.
      camera={{
        position: props.camera?.position ?? CAMERA_POSITION,
        fov: 38,
        near: 10,
        far: 4000,
      }}
      dpr={[1, 2]}
      onPointerMissed={() => props.onHover(null)}
    >
      <color attach="background" args={[props.table ? token("cafe-wall") : bg]} />
      <Reflections />
      <hemisphereLight args={[token("color-text"), token("color-surface"), 1.1]} />
      <directionalLight position={[300, 700, 500]} intensity={1.6} />
      <directionalLight position={[-400, 300, -300]} intensity={0.5} />
      <Model {...props} portal={overlay} onFailed={onFailed} />
      <ViewShift shift={props.shift ?? 0} />
      <OrbitControls
        makeDefault
        target={props.camera?.target ?? [0, 30, 0]}
        minDistance={120}
        maxDistance={2500}
      />
    </Canvas>
      {/* The on-screen page mounts here, over the canvas. */}
      <div
        ref={overlay}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      />
      {failed.length > 0 && (
        // A part that cannot be drawn shows as a red box and is named here, never dropped quietly.
        <div
          role="alert"
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            maxWidth: "50%",
            padding: "6px 10px",
            borderRadius: 6,
            background: token("color-surface"),
            color: token("color-danger"),
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          Could not draw: {failed.join("; ")}
        </div>
      )}
    </div>
  );
}
