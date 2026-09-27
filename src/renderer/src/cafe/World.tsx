import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import cafeUrl from "../assets/cafe/laptop-foundry-cafe.glb?url";
import type { Decor, Fit } from "../engine";
import { Model, Reflections, type Surfaces } from "../viewer/Scene";
import { token } from "../viewer/theme";
import COLLIDERS from "./colliders.json";

// The cafe in first person: the designer's exported room (metres, loaded
// under a group scaled to mm) with the player's laptop on the middle table.
// Units are mm, floor at y = 0, the laptop's table at the origin.

export type Aim = "laptop" | "power" | null;

const M = 1000;
const ROOM = { x0: -7000, x1: 7000, z0: -3400, z1: 6600 };
const EYE = 1620;
const SPEED = 1500;
const LOOK = 0.0022;
const REACH = 2000;
const SETTLE_MS = 600;
/** How close the player's eye gets to a wall or collider. */
const BODY = 280;
/** Where the player first stands, in the aisle behind the table. */
const START: [number, number, number] = [1500, EYE, 1900];
/** The socket sits flush in the table top; this is how much the aim dot catches. */
const SOCKET = new THREE.Vector3(70, 50, 70);
/** The sun's shadow map is redrawn for this many frames after mount, then held. */
const SHADOW_FRAMES = 90;

type V3 = [number, number, number];

interface Anchors {
  laptop: V3;
  seat: V3;
  stand: V3;
  screenAt: V3;
  power: V3;
}

const RECTS = COLLIDERS.map((c) => ({ x0: c.x0 * M, z0: c.z0 * M, x1: c.x1 * M, z1: c.z1 * M }));

function useCafe(): { scene: THREE.Group; anchors: Anchors } {
  const gltf = useLoader(GLTFLoader, cafeUrl);
  return useMemo(() => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const at = (name: string): V3 => {
      const v = new THREE.Vector3();
      // Relative to the scene itself: the loader caches the scene, so on a
      // remount it can still hang under the old mm-scaled group.
      const o = scene.getObjectByName(`anchor_${name}`);
      if (o) scene.worldToLocal(o.getWorldPosition(v));
      return [v.x * M, v.y * M, v.z * M];
    };
    const street = new Set<THREE.Object3D>();
    for (const n of ["distant", "exterior"]) scene.getObjectByName(n)?.traverse((o) => street.add(o));
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const unlit = mats.some((m) => m.type === "MeshBasicMaterial");
      const clear = mats.some((m) => m.transparent);
      mesh.receiveShadow = !unlit;
      // Glass lets the sun through, and the street stays out of the shadow map.
      mesh.castShadow = !unlit && !clear && !street.has(mesh);
    });
    return {
      scene,
      anchors: {
        laptop: at("laptop"),
        seat: at("seatEye"),
        stand: at("standEye"),
        screenAt: at("screenAt"),
        power: at("power"),
      },
    };
  }, [gltf]);
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useEffect(() => {
    const aim = new THREE.Object3D();
    aim.position.set(0, 0, 1200);
    scene.add(aim);
    if (sun.current) sun.current.target = aim;
    return () => {
      scene.remove(aim);
    };
  }, [scene]);
  // The room is static: draw the shadows while everything settles, then hold them.
  useFrame(() => {
    if (frames.current >= SHADOW_FRAMES) return;
    frames.current++;
    gl.shadowMap.needsUpdate = true;
  });
  return (
    <>
      <hemisphereLight args={[token("cafe-sky"), token("cafe-shade"), 0.25]} />
      <directionalLight
        ref={sun}
        position={[3000, 7000, -7500]}
        color={token("cafe-sun")}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8500}
        shadow-camera-right={8500}
        shadow-camera-top={8500}
        shadow-camera-bottom={-8500}
        shadow-camera-near={1000}
        shadow-camera-far={20000}
        shadow-bias={-0.0004}
        shadow-normalBias={20}
      />
    </>
  );
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function lookAngles(from: THREE.Vector3, at: THREE.Vector3): { yaw: number; pitch: number } {
  const d = at.clone().sub(from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}

/** Keeps the walking player inside the room and out of the colliders. */
function collide(p: THREE.Vector3) {
  p.x = clamp(p.x, ROOM.x0 + BODY, ROOM.x1 - BODY);
  p.z = clamp(p.z, ROOM.z0 + BODY, ROOM.z1 - BODY);
  for (const r of RECTS) {
    const x0 = r.x0 - BODY;
    const x1 = r.x1 + BODY;
    const z0 = r.z0 - BODY;
    const z1 = r.z1 + BODY;
    if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
    // Push out through the nearest side.
    const out = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z];
    const i = out.indexOf(Math.min(...out));
    if (i === 0) p.x = x0;
    else if (i === 1) p.x = x1;
    else if (i === 2) p.z = z0;
    else p.z = z1;
  }
}

function Player({
  seated,
  active,
  laptop,
  anchors,
  onAim,
  onClickAim,
}: {
  seated: boolean;
  active: boolean;
  laptop: RefObject<THREE.Group | null>;
  anchors: Anchors;
  onAim: (a: Aim) => void;
  onClickAim: RefObject<Aim>;
}) {
  const camera = useThree((s) => s.camera);
  const pos = useRef(new THREE.Vector3(...START));
  const look = useRef(lookAngles(pos.current, new THREE.Vector3(...anchors.laptop)));
  const keys = useRef(new Set<string>());
  const move = useRef({ clock: 0 });
  const settle = useRef<{ from: THREE.Vector3; to: THREE.Vector3; at: number } | null>(null);
  const aimed = useRef<Aim>(null);
  const bounds = useRef({ box: new THREE.Box3(), at: -10 });
  const socket = useMemo(
    () => new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...anchors.power), SOCKET),
    [anchors.power],
  );
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const wasSeated = useRef(seated);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const l = look.current;
      l.yaw -= e.movementX * LOOK;
      l.pitch = clamp(l.pitch - e.movementY * LOOK, -1.45, 1.45);
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", mouse);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mouse);
    };
  }, []);

  useEffect(() => {
    if (!active) keys.current.clear();
  }, [active]);

  useFrame((_, dt) => {
    const m = move.current;
    m.clock += dt;
    if (wasSeated.current !== seated) {
      wasSeated.current = seated;
      const to = new THREE.Vector3(...(seated ? anchors.seat : anchors.stand));
      settle.current = { from: pos.current.clone(), to, at: m.clock };
      if (seated) look.current = lookAngles(to, new THREE.Vector3(...anchors.screenAt));
    }
    const s = settle.current;
    if (s) {
      const t = Math.min(1, ((m.clock - s.at) * 1000) / SETTLE_MS);
      pos.current.lerpVectors(s.from, s.to, easeOut(t));
      if (t >= 1) settle.current = null;
    } else if (!seated && active) {
      const k = keys.current;
      const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
      const r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
      if (f || r) {
        const yaw = look.current.yaw;
        const len = Math.hypot(f, r);
        const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) / len;
        const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) / len;
        pos.current.x += dx * SPEED * dt;
        pos.current.z += dz * SPEED * dt;
        collide(pos.current);
      }
    }
    const l = look.current;
    if (seated) l.yaw = clamp(l.yaw, -1.3, 1.3);
    camera.position.copy(pos.current);
    camera.rotation.set(l.pitch, l.yaw, 0, "YXZ");

    // What the aim dot is on: the laptop, or the power socket beside it.
    let next: Aim = null;
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const far = seated ? 1200 : REACH;
    const origin = ray.ray.origin;
    const hit = new THREE.Vector3();
    let best = far;
    const lap = laptop.current;
    if (lap) {
      // The laptop's bounds are cheap to hit and forgiving to aim at.
      if (m.clock - bounds.current.at > 1) {
        bounds.current = { box: new THREE.Box3().setFromObject(lap), at: m.clock };
      }
      if (ray.ray.intersectBox(bounds.current.box, hit) && hit.distanceTo(origin) < best) {
        best = hit.distanceTo(origin);
        next = "laptop";
      }
    }
    if (ray.ray.intersectBox(socket, hit) && hit.distanceTo(origin) < best) next = "power";
    if (next !== aimed.current) {
      aimed.current = next;
      onClickAim.current = next;
      onAim(next);
    }
  });
  return null;
}

type ModelProps = Omit<Parameters<typeof Model>[0], "lidAngle" | "xray" | "labelFor" | "onHover">;

function Room({
  model,
  seated,
  active,
  onAim,
  aimRef,
}: {
  model: ModelProps;
  seated: boolean;
  active: boolean;
  onAim: (a: Aim) => void;
  aimRef: RefObject<Aim>;
}) {
  const { scene, anchors } = useCafe();
  const laptop = useRef<THREE.Group>(null);
  const noLabel = useMemo(() => () => "", []);
  const noHover = useMemo(() => () => {}, []);
  return (
    <>
      <group scale={M}>
        <primitive object={scene} />
      </group>
      <group ref={laptop} position={anchors.laptop}>
        <Model {...model} lidAngle={105} xray={false} labelFor={noLabel} onHover={noHover} />
      </group>
      <Player
        seated={seated}
        active={active}
        laptop={laptop}
        anchors={anchors}
        onAim={onAim}
        onClickAim={aimRef}
      />
    </>
  );
}

export function World({
  fit,
  year,
  colours,
  decor,
  surfaces,
  screen,
  seated,
  active,
  onAim,
  aimRef,
}: {
  fit: Fit;
  year: number;
  colours: { floor: string; deck: string; lid: string };
  decor?: Decor;
  surfaces: Surfaces;
  screen?: { node: ReactNode; width: number; mm: { x: number; y: number } };
  seated: boolean;
  /** Walking and looking are live: not paused and not full screen. */
  active: boolean;
  onAim: (a: Aim) => void;
  aimRef: RefObject<Aim>;
}) {
  const overlay = useRef<HTMLDivElement | null>(null);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: false }}
        dpr={[1, 1.5]}
        gl={{ toneMapping: THREE.NeutralToneMapping }}
        camera={{ fov: 62, near: 10, far: 80000 }}
      >
        <color attach="background" args={[token("cafe-shade")]} />
        <Reflections intensity={0.8} />
        <Lights />
        <Suspense fallback={null}>
          <Room
            model={{ fit, year, colours, decor, surfaces, screen, portal: overlay }}
            seated={seated}
            active={active}
            onAim={onAim}
            aimRef={aimRef}
          />
        </Suspense>
      </Canvas>
      {/* The on-screen page mounts here, over the canvas. It takes the
          pointer only while the player is using the laptop. */}
      <div
        ref={overlay}
        className={`cafe-overlay${seated ? " using" : ""}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      />
    </div>
  );
}
