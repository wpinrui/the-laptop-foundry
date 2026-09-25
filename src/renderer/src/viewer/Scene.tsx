import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Box, Fit } from "../engine";
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
        { colour: roleColour(b.role), year, hinge },
        ctx,
      );
      obj.userData.label = labelFor(b);
      obj.traverse((o) => {
        o.userData.label = obj.userData.label;
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
  year,
  hinge,
}: {
  boxes: Box[];
  ctx: UnitCtx;
  labelFor: (b: Box) => string;
  onHover: SceneProps["onHover"];
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
}: {
  size: Fit["shell"]["outer"];
  style: Fit["shell"]["style"];
  colour: string;
  profile: boolean;
  z?: number;
}) {
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
        <meshStandardMaterial
          color={colour}
          transparent
          opacity={0.22}
          depthWrite={false}
          side={THREE.DoubleSide}
          roughness={0.5}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={3}>
        <lineBasicMaterial color={colour} transparent opacity={0.55} />
      </lineSegments>
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
}: SceneProps) {
  const ctx = useMemo(() => makeCtx(), []);
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
        />
        <Shell
          size={deckPlate}
          style={fit.shell.style}
          colour={colours.deck}
          profile={false}
          z={out.z}
        />
        <Openings fit={fit} />
        <Units
          boxes={base}
          ctx={ctx}
          labelFor={labelFor}
          onHover={onHover}
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
            />
            <Units
              boxes={lid}
              ctx={ctx}
              labelFor={labelFor}
              onHover={onHover}
              year={year}
              hinge={fit.shell.style.hinge}
            />
          </group>
        </group>
      </group>
    </group>
  );
});

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
      camera={{ position: CAMERA_POSITION, fov: 38, near: 10, far: 4000 }}
      dpr={[1, 2]}
      onPointerMissed={() => props.onHover(null)}
    >
      <color attach="background" args={[bg]} />
      <hemisphereLight
        args={[token("color-text"), token("color-surface"), 1.1]}
      />
      <directionalLight position={[300, 700, 500]} intensity={1.6} />
      <directionalLight position={[-400, 300, -300]} intensity={0.5} />
      <Model {...props} />
      <OrbitControls
        makeDefault
        target={[0, 30, 0]}
        minDistance={120}
        maxDistance={2500}
      />
    </Canvas>
  );
}
