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

export type Aim = "laptop" | "power" | "door" | null;

/** The laptop on the table, as the room draws it. */
export interface LaptopLook {
  fit: Fit;
  year: number;
  colours: { floor: string; deck: string; lid: string };
  decor?: Decor;
  surfaces: Surfaces;
}

const M = 1000;
const ROOM = { x0: -7000, x1: 7000, z0: -3400, z1: 6600 };
const EYE = 1620;
const SPEED = 1500;
const LOOK = 0.0022;
const REACH = 2000;
const SETTLE_MS = 600;
/** Seated zoom: the camera's field of view, in degrees. */
const FOV = 62;
export const FOV_MIN = 20;
export const ZOOM_STEP = 0.0025;
/** How close the player's eye gets to a wall or collider. */
const BODY = 280;
/** Where the player first stands, in the aisle behind the table. */
const START: [number, number, number] = [1500, EYE, 1900];
/** Arriving from the street: just inside the entrance. */
const DOOR_START: [number, number, number] = [-2000, EYE, -2500];
/** The entrance in the glass street front: walking into it leaves the cafe. */
const DOOR = { x0: -2900, x1: -1100 };
/** The entrance as the aim dot catches it. */
const DOOR_BOX = new THREE.Box3(new THREE.Vector3(DOOR.x0, 0, ROOM.z0 - 100), new THREE.Vector3(DOOR.x1, 2400, ROOM.z0 + 100));
/** The socket sits flush in the table top; this is how much the aim dot catches. */
const SOCKET = new THREE.Vector3(70, 50, 70);
/** The shadow maps are redrawn for this many frames after the room loads, then held. */
const SHADOW_FRAMES = 90;
/** The overhead key: just under the ceiling slats, pointing straight down, so its
 * shadow camera's near plane stays level and below the ceiling everywhere. */
const LAMP_AT: [number, number, number] = [0, 3150, 2300];

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
      const glowing = mats.some((m) => {
        const s = m as THREE.MeshStandardMaterial;
        return !!s.emissive && s.emissiveIntensity > 0 && s.emissive.getHex() !== 0;
      });
      mesh.receiveShadow = !unlit;
      // Glass lets the sun through, lamps don't shadow their own light, and
      // the street stays out of the shadow map.
      mesh.castShadow = !unlit && !clear && !glowing && !street.has(mesh);
      // The designer's floor is white terrazzo: tint it, keeping the grain.
      if (mats.some((m) => m.name === "terrazzo_white")) {
        mesh.material = mats.map((m) => {
          if (m.name !== "terrazzo_white") return m;
          const t = (m as THREE.MeshStandardMaterial).clone();
          t.name = "terrazzo_tinted";
          t.color.set(token("cafe-floor"));
          return t;
        });
        if (mats.length === 1) mesh.material = (mesh.material as THREE.Material[])[0];
      }
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

/**
 * The room is static: draw the shadows while everything settles, then hold
 * them. Mounted with the room, so the count starts once the scene has loaded.
 */
function ShadowWarmup() {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current >= SHADOW_FRAMES) return;
    frames.current++;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const lamp = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const aim = new THREE.Object3D();
    aim.position.set(0, 0, 1200);
    // The overhead key looks down at the middle of the room.
    const below = new THREE.Object3D();
    below.position.set(LAMP_AT[0] + 1, 0, LAMP_AT[2]);
    scene.add(aim, below);
    if (sun.current) sun.current.target = aim;
    if (lamp.current) lamp.current.target = below;
    return () => {
      scene.remove(aim, below);
    };
  }, [scene]);
  return (
    <>
      {/* A soft key from just under the ceiling, standing in for the lamps,
          so the furniture grounds itself where the sun never reaches. Its
          shadow camera starts below the ceiling so the ceiling does not
          shade the room. */}
      <directionalLight
        ref={lamp}
        position={LAMP_AT}
        color={token("cafe-lamp")}
        intensity={0.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7600}
        shadow-camera-right={7600}
        shadow-camera-top={7600}
        shadow-camera-bottom={-7600}
        shadow-camera-near={0}
        shadow-camera-far={3600}
        shadow-bias={-0.0005}
        shadow-normalBias={8}
        shadow-radius={6}
      />
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

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function lookAngles(from: THREE.Vector3, at: THREE.Vector3): { yaw: number; pitch: number } {
  const d = at.clone().sub(from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}

/** A floor plan rectangle, mm. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Keeps the walking player inside the room and out of the colliders. */
function collide(p: THREE.Vector3) {
  collideIn(p, ROOM, RECTS, BODY);
}

/** Keeps a point `body` mm inside `room` and `body` mm clear of each rectangle. */
export function collideIn(p: THREE.Vector3, room: Rect, rects: Rect[], body: number) {
  p.x = clamp(p.x, room.x0 + body, room.x1 - body);
  p.z = clamp(p.z, room.z0 + body, room.z1 - body);
  for (const r of rects) {
    const x0 = r.x0 - body;
    const x1 = r.x1 + body;
    const z0 = r.z0 - body;
    const z1 = r.z1 + body;
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
  using,
  active,
  laptop,
  anchors,
  onAim,
  onClickAim,
  atDoor,
  onDoor,
}: {
  atDoor: boolean;
  onDoor?: () => void;
  seated: boolean;
  using: boolean;
  active: boolean;
  laptop: RefObject<THREE.Group | null>;
  anchors: Anchors;
  onAim: (a: Aim) => void;
  onClickAim: RefObject<Aim>;
}) {
  const camera = useThree((s) => s.camera);
  const pos = useRef(new THREE.Vector3(...(atDoor ? DOOR_START : START)));
  const door = useRef(onDoor);
  door.current = onDoor;
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
  const fov = useRef(FOV);
  const live = useRef({ seated, using, active });
  live.current = { seated, using, active };

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const l = look.current;
      // Slower look when zoomed in, so the aim stays steady.
      const k = LOOK * (fov.current / FOV);
      l.yaw -= e.movementX * k;
      l.pitch = clamp(l.pitch - e.movementY * k, -1.45, 1.45);
    };
    // Zoom with the pointer locked, sitting or standing; in use the wheel
    // belongs to the laptop's screen.
    const wheel = (e: WheelEvent) => {
      const s = live.current;
      if (!document.pointerLockElement || s.using || !s.active) return;
      fov.current = clamp(fov.current * Math.exp(e.deltaY * ZOOM_STEP), FOV_MIN, FOV);
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", mouse);
    document.addEventListener("wheel", wheel);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mouse);
      document.removeEventListener("wheel", wheel);
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
    if (seated) {
      l.yaw = clamp(l.yaw, -1.3, 1.3);
      l.pitch = clamp(l.pitch, -1.2, 0.9);
    }
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - fov.current) > 0.01) {
      cam.fov += (fov.current - cam.fov) * Math.min(1, dt * 12);
      if (Math.abs(cam.fov - fov.current) <= 0.01) cam.fov = fov.current;
      cam.updateProjectionMatrix();
    }
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
    // With no laptop on the table the socket has nothing to charge.
    if (lap && ray.ray.intersectBox(socket, hit) && hit.distanceTo(origin) < best) next = "power";
    // Standing, the street entrance: E leaves through it.
    if (door.current && !seated && ray.ray.intersectBox(DOOR_BOX, hit) && hit.distanceTo(origin) < best) next = "door";
    if (next !== aimed.current) {
      aimed.current = next;
      onClickAim.current = next;
      onAim(next);
    }
    // Before the default frame hooks, so the screen's Html follows this
    // frame's camera, not the last one.
  }, -1);
  return null;
}

type ModelProps = Omit<Parameters<typeof Model>[0], "lidAngle" | "xray" | "labelFor" | "onHover">;

function Room({
  model,
  seated,
  using,
  active,
  onAim,
  aimRef,
  atDoor,
  onDoor,
}: {
  atDoor: boolean;
  onDoor?: () => void;
  model?: ModelProps;
  seated: boolean;
  using: boolean;
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
      <ShadowWarmup />
      {model && (
        <group ref={laptop} position={anchors.laptop}>
          <Model {...model} lidAngle={105} xray={false} labelFor={noLabel} onHover={noHover} />
        </group>
      )}
      <Player
        seated={seated}
        using={using}
        active={active}
        laptop={laptop}
        anchors={anchors}
        onAim={onAim}
        onClickAim={aimRef}
        atDoor={atDoor}
        onDoor={onDoor}
      />
    </>
  );
}

export function World({
  laptop,
  screen,
  seated,
  using,
  active,
  onAim,
  aimRef,
  atDoor = false,
  onDoor,
}: {
  /** None: the table stands empty. */
  laptop?: LaptopLook;
  /** Arrives through the street entrance. */
  atDoor?: boolean;
  /** Walking out through the street entrance. */
  onDoor?: () => void;
  screen?: { node: ReactNode; width: number; mm: { x: number; y: number } };
  seated: boolean;
  /** Seated with the pointer free on the laptop's screen. */
  using: boolean;
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
        camera={{ fov: FOV, near: 10, far: 80000 }}
      >
        <color attach="background" args={[token("cafe-shade")]} />
        <Reflections intensity={0.8} />
        <Lights />
        <Suspense fallback={null}>
          <Room
            model={laptop ? { ...laptop, screen, portal: overlay } : undefined}
            seated={seated}
            using={using}
            active={active}
            onAim={onAim}
            aimRef={aimRef}
            atDoor={atDoor}
            onDoor={onDoor}
          />
        </Suspense>
      </Canvas>
      {/* The on-screen page mounts here, over the canvas. It takes the
          pointer only while the player is using the laptop. */}
      <div
        ref={overlay}
        className={`cafe-overlay${using ? " using" : ""}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      />
    </div>
  );
}
