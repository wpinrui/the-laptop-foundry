import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Workshop } from "./Workshop";
import { memo, type ReactNode, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Box, Build, Fit } from "../engine";
import { shellSurface } from "../engine";
import { overflowSlabs } from "./overflow";
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

/** Keeps one object per unit id; rebuilds a unit only when its role, part or size changes. */
function useUnitsGroup(
  boxes: Box[],
  ctx: UnitCtx,
  labelFor: (b: Box) => string,
  year: number,
  hinge: UnitOpts["hinge"],
): THREE.Group {
  const group = useMemo(() => new THREE.Group(), []);
  const live = useRef(new Map<string, { key: string; obj: THREE.Object3D }>());
  useEffect(() => {
    const seen = new Set<string>();
    for (const b of boxes) {
      seen.add(b.id);
      const key = `${b.role}|${b.part ?? ""}|${b.size.x.toFixed(3)}|${b.size.y.toFixed(3)}|${b.size.z.toFixed(3)}|${JSON.stringify(b.opts ?? {})}|${b.edge ?? ""}|${year}|${hinge}`;
      const had = live.current.get(b.id);
      if (had && had.key === key) {
        had.obj.position.set(
          b.at.x + b.size.x / 2,
          b.at.y + b.size.y / 2,
          b.at.z + b.size.z / 2,
        );
        had.obj.userData.label = labelFor(b);
        continue;
      }
      if (had) disposeUnit(had.obj);
      const obj = renderUnit(
        b.role,
        b,
        { colour: roleColour(b.role, year), year, hinge },
        ctx,
      );
      obj.userData.label = labelFor(b);
      obj.traverse((o) => {
        o.userData.label = obj.userData.label;
        o.userData.box = b;
        o.castShadow = true;
      });
      group.add(obj);
      live.current.set(b.id, { key, obj });
    }
    for (const [id, v] of live.current) {
      if (seen.has(id)) continue;
      disposeUnit(v.obj);
      live.current.delete(id);
    }
  }, [boxes, ctx, group, labelFor, year, hinge]);
  return group;
}

function Units({
  boxes,
  ctx,
  labelFor,
  onHover,
  onPick,
  year,
  hinge,
}: {
  boxes: Box[];
  ctx: UnitCtx;
  labelFor: (b: Box) => string;
  onHover: SceneProps["onHover"];
  onPick?: SceneProps["onPick"];
  year: number;
  hinge: UnitOpts["hinge"];
}) {
  const group = useUnitsGroup(boxes, ctx, labelFor, year, hinge);
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

function surfaceGeometry(
  size: Fit["shell"]["outer"],
  style: Fit["shell"]["style"],
  profile: boolean,
): THREE.BufferGeometry {
  const data = shellSurface(size, style, profile);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
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
}) {
  const look = surfaceLook(surface);
  const geometry = useMemo(
    () => surfaceGeometry(size, style, profile),
    [size.x, size.y, size.z, style, profile],
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

const Model = memo(function Model({
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
}: SceneProps) {
  const ctx = useMemo(() => makeCtx(), []);
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
  const deckPlate = useMemo(
    () => ({ x: out.x, y: out.y, z: 0.01 }),
    [out.x, out.y],
  );

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
        />
        <Shell
          size={deckPlate}
          style={fit.shell.style}
          colour={colours.deck}
          profile={false}
          z={out.z}
          surface={surfaces?.deck}
          xray={xray}
          offset={1}
        />
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
                <meshStandardMaterial color={token("color-opening")} roughness={0.15} metalness={0} />
              </mesh>
            )}
            {screen && panelBox && (
              // The panel faces down when the lid is shut; its top edge is the one away from the hinge.
              <Html
                transform
                position={[
                  panelBox.at.x + panelBox.size.x / 2,
                  panelBox.at.y + panelBox.size.y / 2,
                  panelBox.at.z - 0.3,
                ]}
                rotation={[Math.PI, 0, 0]}
                distanceFactor={(screen.mm.x * 400) / screen.width}
                zIndexRange={[4, 0]}
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

/** A procedural room to reflect, so metal shells read as metal. No assets. */
function Reflections() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function Scene(props: SceneProps) {
  const bg = token("color-bg");
  return (
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
      <color attach="background" args={[props.workshop ? token("shop-wall") : bg]} />
      <Reflections />
      {props.workshop ? (
        <>
          {/* Warm lamp over the bench, a cool fill from the window side. */}
          <hemisphereLight args={[token("shop-lamp"), token("shop-bench-edge"), 0.8]} />
          <pointLight
            position={[-150, 700, 250]}
            color={token("shop-lamp")}
            intensity={2.2}
            distance={0}
            decay={0}
          />
          <directionalLight position={[500, 400, 600]} color={token("shop-fill")} intensity={0.5} />
          <directionalLight position={[-400, 300, -300]} intensity={0.35} />
        </>
      ) : (
        <>
          <hemisphereLight args={[token("color-text"), token("color-surface"), 1.1]} />
          <directionalLight position={[300, 700, 500]} intensity={1.6} />
          <directionalLight position={[-400, 300, -300]} intensity={0.5} />
        </>
      )}
      <Model {...props} />
      <OrbitControls
        makeDefault
        target={props.camera?.target ?? [0, 30, 0]}
        minDistance={120}
        maxDistance={2500}
      />
    </Canvas>
  );
}
