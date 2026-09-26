import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Workshop, WORKSHOP_REACH } from "./Workshop";
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
import type { Box, Build, Fit, Side } from "../engine";
import { shellSurface } from "../engine";
import { LID_GROUP } from "../models/roles/hinge";
import { overflowSlabs } from "./overflow";
import { type Cuts, portCuts, wallPositions } from "./walls";
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
  /** A procedural workshop around the laptop: bench, pegboard wall, warm lamp. */
  workshop?: boolean;
  /** Called with every unit that could not be drawn, as "label: reason". */
  onFailed?: (failed: string[]) => void;
  /** A still image lit on the display glass, such as a lock screen. */
  lockScreen?: THREE.Texture;
  /** Roughness of the lit display glass; low on a glossy panel, so it catches glare. */
  screenGloss?: number;
  /** Leaves the bottom cover off, to show the internals from below. */
  floorless?: boolean;
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
      const key = `${b.role}|${b.part ?? ""}|${b.size.x.toFixed(3)}|${b.size.y.toFixed(3)}|${b.size.z.toFixed(3)}|${JSON.stringify(b.opts ?? {})}|${b.edge ?? ""}|${year}|${hinge}`;
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
}: {
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
    group.traverse((o) => {
      if (o.name === LID_GROUP) o.rotation.x = (-lidAngle * Math.PI) / 180;
    });
  }, [group, lidAngle, boxes, ctx, year, hinge]);
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

/**
 * The shell surface. "open" leaves out the flat top face, which the deck
 * draws instead; "deck" is that top face alone, with the keyboard and
 * trackpad wells cut out so a solid shell does not cover them.
 */
function surfaceGeometry(
  size: Fit["shell"]["outer"],
  style: Fit["shell"]["style"],
  profile: boolean,
  mode: "full" | "open" | "deck" | "walls" | "floor" = "full",
  wells: Wells = [],
  cuts: Cuts = {},
  wallDepth = 0,
): THREE.BufferGeometry {
  const open = mode === "deck" || mode === "floor" ? [] : (Object.keys(cuts) as Side[]);
  const data = shellSurface(size, style, profile, 8, open);
  const count = data.positions.length / 3;
  // shellSurface lays out the rings, then the bottom centre, then the top centre.
  const topCentre = count - 1;
  const bottomCentre = count - 2;
  if (mode === "deck") {
    const lastLoop: THREE.Vector2[] = [];
    let n = 0;
    for (let i = 0; i + 2 < data.indices.length; i += 3)
      if (data.indices[i] === topCentre) n++;
    for (let v = bottomCentre - n; v < bottomCentre; v++)
      lastLoop.push(new THREE.Vector2(data.positions[v * 3], data.positions[v * 3 + 1]));
    const shape = new THREE.Shape(lastLoop);
    for (const w of wells) {
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
    const g = new THREE.ShapeGeometry(shape);
    g.translate(0, 0, size.z);
    return g;
  }
  let indices = data.indices;
  if (mode === "open" || mode === "walls" || mode === "floor") {
    // "walls" also drops the bottom face; "floor" keeps only the bottom face, the cover.
    const kept: number[] = [];
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const c = indices[i];
      const keep =
        mode === "floor" ? c === bottomCentre : c !== topCentre && (mode !== "walls" || c !== bottomCentre);
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
  mode?: "full" | "open" | "deck" | "walls" | "floor";
  wells?: Wells;
  /** Port openings cut through the side walls, so a solid shell shows the connectors. */
  cuts?: Cuts;
  /** Side wall thickness: how deep the port holes run to the connector faces. */
  wallDepth?: number;
}) {
  const look = surfaceLook(surface);
  const geometry = useMemo(
    () => surfaceGeometry(size, style, profile, mode, wells, cuts, wallDepth),
    [size.x, size.y, size.z, style, profile, mode, wells, cuts, wallDepth],
  );
  const edges = useMemo(
    () => new THREE.EdgesGeometry(geometry, 25),
    [geometry],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
    },
    [geometry, edges],
  );
  return (
    <group position={[0, 0, z]}>
      <mesh geometry={geometry} renderOrder={2}>
        {/* Units sit flush on the shell's faces (a cover-glass panel IS the
            lid's front face), so the shell is pushed back in depth: a flush
            unit face wins cleanly instead of z-fighting the shell's fan. */}
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
          polygonOffsetFactor={offset}
          polygonOffsetUnits={offset}
        />
      </mesh>
      {xray && (
        <lineSegments geometry={edges} renderOrder={3}>
          <lineBasicMaterial color={colour} transparent opacity={0.55} />
        </lineSegments>
      )}
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
function Well({ well: w, top }: { well: Wells[number]; top: number }) {
  const x0 = w.at.x - WELL_CLEAR;
  const y0 = w.at.y - WELL_CLEAR;
  const sx = w.size.x + 2 * WELL_CLEAR;
  const sy = w.size.y + 2 * WELL_CLEAR;
  const z0 = w.at.z - 0.05;
  // The walls stop just under the top case, so their top edge never meets its face.
  const h = top - WELL_CLEAR - z0;
  const colour = token("color-opening");
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
        <meshBasicMaterial color={colour} side={THREE.DoubleSide} />
      </mesh>
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.pos} rotation={wall.rot}>
          <planeGeometry args={wall.size} />
          <meshBasicMaterial color={colour} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Openings({ fit }: { fit: Fit }) {
  const colour = token("color-opening");
  const w = fit.shell.walls.side + 0.4;
  const out = fit.shell.outer;
  return (
    <group>
      {fit.shell.cutouts.map((o) => {
        // A port's model draws its own opening; an opaque block here would
        // hide the connector face and read as a brick poking out of the wall.
        if (o.kind === "port") return null;
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
  workshop,
  portal,
  onFailed,
  lockScreen,
  screenGloss = 0.35,
  floorless = false,
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
    () => fit.boxes.filter((b) => b.kind === "unit" && b.piece !== "lid"),
    [fit],
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
          mode={floorless ? "walls" : "open"}
          cuts={cuts}
          wallDepth={fit.shell.offsets.side}
        />
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
        />
        {!xray && fit.shell.wells.map((w) => <Well key={`${w.at.x}-${w.at.y}`} well={w} top={out.z} />)}
        <Openings fit={fit} />
        {workshop && !table && <Workshop out={out} />}
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
        />
        <Overflow fit={fit} />
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
            />
            <Units
              boxes={lid}
              ctx={ctx}
              labelFor={labelFor}
              onHover={onHover}
              year={year}
              hinge={fit.shell.style.hinge}
              onFailed={reportLid}
            />
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
                {lockScreen ? (
                  <meshStandardMaterial
                    color={token("color-opening")}
                    emissive={token("panel-glare")}
                    emissiveMap={lockScreen}
                    roughness={screenGloss}
                    metalness={0}
                  />
                ) : (
                  <meshStandardMaterial color={token("color-opening")} roughness={0.4} metalness={0} />
                )}
              </mesh>
            )}
            {screen && panelBox && (
              // The panel faces down when the lid is shut; its top edge is the one away from the hinge.
              <Html
                transform
                // A fixed target: without it Html mounts on the canvas wrapper,
                // remounts once events connect, and React 19 wipes the new root.
                portal={portal as RefObject<HTMLElement>}
                position={[
                  panelBox.at.x + panelBox.size.x / 2,
                  panelBox.at.y + panelBox.size.y / 2,
                  panelBox.at.z - 0.3,
                ]}
                rotation={[Math.PI, 0, 0]}
                distanceFactor={(screen.mm.x * 400) / screen.width}
                zIndexRange={[4, 0]}
                wrapperClass="lid-screen"
              >
                {screen.node}
              </Html>
            )}
          </group>
        </group>
      </group>
    </group>
  );
});

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
        <Shell size={out} style={fit.shell.style} colour={colour} profile surface={surface} xray={false} mode="floor" />
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
      <color attach="background" args={[props.workshop ? token("shop-wall") : props.table ? token("cafe-wall") : bg]} />
      <Reflections />
      {props.workshop ? (
        <>
          {/* Warm lamp over the bench, a cool fill from the window side. */}
          <hemisphereLight args={[token("color-text"), token("shop-bench-edge"), 0.75]} />
          <pointLight
            position={[-150, 700, 250]}
            color={token("shop-lamp")}
            intensity={1.1}
            distance={0}
            decay={0}
          />
          <directionalLight position={[300, 700, 500]} intensity={0.7} />
          <directionalLight position={[500, 400, 600]} color={token("shop-fill")} intensity={0.35} />
          <directionalLight position={[-400, 300, -300]} intensity={0.3} />
        </>
      ) : (
        <>
          <hemisphereLight args={[token("color-text"), token("color-surface"), 1.1]} />
          <directionalLight position={[300, 700, 500]} intensity={1.6} />
          <directionalLight position={[-400, 300, -300]} intensity={0.5} />
        </>
      )}
      <Model {...props} portal={overlay} onFailed={onFailed} />
      <ViewShift shift={props.shift ?? 0} />
      <OrbitControls
        makeDefault
        target={props.camera?.target ?? [0, 30, 0]}
        minDistance={120}
        maxDistance={props.workshop ? WORKSHOP_REACH : 2500}
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
