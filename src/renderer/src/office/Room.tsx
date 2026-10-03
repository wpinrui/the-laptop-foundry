import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import officeUrl from "../assets/office/laptop-foundry-office.glb?url";
import { clamp, collideIn, type Rect } from "../cafe/World";
import { token } from "../viewer/theme";
import type { StationId } from "./stations";

// The company office: the designer's loft (metres, loaded under a group
// scaled to mm, like the cafe) with a camera that glides between the
// stations' fixed views, or walks the room in first person. Units are mm,
// floor at y = 0.

export const M = 1000;
const EYE = 1620;
const BODY = 260;
const SPEED = 2000;
const LOOK = 0.0022;
/** Vertical field of view at 16:9; narrower windows widen it so the sides stay in view. */
const FOV = 50;
const WIDE = 16 / 9;
const HALF_H = Math.atan(Math.tan((FOV * Math.PI) / 360) * WIDE);
const MOVE_S = 0.85;
const RISE_S = 0.5;
const noRaycast = () => {};

export interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}
export type Side = "left" | "right";
export type Award = "cup" | "obelisk" | "plaque";
export type Pick = { kind: "station"; id: StationId } | { kind: "laptop"; id: string };

/** The desk computer, as the pointer picks it: its monitor, used like a laptop. */
export const DESK_PC_ID = "desk-pc";

export interface OfficeData {
  scene: THREE.Group;
  /** Station cameras by id, the product wall's by bay count (products_1 to products_5), and the arrival spot. */
  poses: Record<string, Pose>;
  stands: Record<string, THREE.Vector3>;
  sides: Record<string, Side>;
  room: Rect;
  colliders: Rect[];
  /** The product wall's slots in fill order, mm. */
  slots: Pose[];
  slotNodes: THREE.Object3D[];
  bays: THREE.Object3D[];
  /** The bays' extent along z, mm: the wall starts at z0 and each bay takes pitch. */
  bay: { z0: number; pitch: number; x: number };
  trophySlots: THREE.Object3D[];
  templates: Partial<Record<Award, THREE.Object3D>>;
  /** The desk computer's monitor, mm: aiming at it uses the computer, anywhere else on the desk opens the Desk. */
  deskScreen: THREE.Box3;
  /** Boxes the pointer picks a station by, mm. */
  boxes: { pick: Pick; box: THREE.Box3 }[];
  screens: Record<string, THREE.Mesh>;
}

export function fovFor(aspect: number): number {
  if (aspect >= WIDE) return FOV;
  return (2 * Math.atan(Math.tan(HALF_H) / aspect) * 180) / Math.PI;
}

function useOffice(): OfficeData {
  const gltf = useLoader(GLTFLoader, officeUrl);
  return useMemo(() => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    // Relative to the scene itself: the loader caches the scene, so on a
    // remount it can still hang under the old mm-scaled group.
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const poseOf = (o: THREE.Object3D): Pose => {
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      m.decompose(pos, quat, new THREE.Vector3());
      return { pos: pos.multiplyScalar(M), quat };
    };
    const boxOf = (...names: string[]) => {
      const b = new THREE.Box3();
      for (const n of names) {
        const o = scene.getObjectByName(n);
        if (o) b.union(new THREE.Box3().setFromObject(o).applyMatrix4(inv));
      }
      b.min.multiplyScalar(M);
      b.max.multiplyScalar(M);
      return b;
    };
    const root = scene.getObjectByName("office");
    const extras = (root?.userData ?? {}) as {
      room?: { x0: number; x1: number; z0: number; z1: number };
      bays?: { pitch: number; z0: number };
      stations?: string[];
      colliders?: { name: string; min: number[]; max: number[] }[];
    };
    const r = extras.room ?? { x0: -5.5, x1: 5.5, z0: -4, z1: 4 };
    const room: Rect = { x0: r.x0 * M, x1: r.x1 * M, z0: r.z0 * M, z1: r.z1 * M };
    const colliders: Rect[] = (extras.colliders ?? []).map((c) => ({
      x0: c.min[0] * M,
      z0: c.min[2] * M,
      x1: c.max[0] * M,
      z1: c.max[2] * M,
    }));
    const collider = (name: string) => {
      const c = extras.colliders?.find((x) => x.name === name);
      return c
        ? new THREE.Box3(new THREE.Vector3(...c.min).multiplyScalar(M), new THREE.Vector3(...c.max).multiplyScalar(M))
        : new THREE.Box3();
    };
    const poses: Record<string, Pose> = {};
    const stands: Record<string, THREE.Vector3> = {};
    const sides: Record<string, Side> = {};
    const ids = extras.stations ?? ["desk", "finance", "market", "marketing", "door", "tv", "products", "trophies"];
    for (const id of ids) {
      const cam = scene.getObjectByName(`cam_${id}`);
      if (cam) {
        poses[id] = poseOf(cam);
        sides[id] = (cam.userData as { panel?: Side }).panel ?? "right";
      }
      const stand = scene.getObjectByName(`stand_${id}`);
      if (stand) stands[id] = poseOf(stand).pos;
    }
    for (let n = 1; n <= 5; n++) {
      const cam = scene.getObjectByName(`cam_products_${n}`);
      if (cam) poses[`products_${n}`] = poseOf(cam);
    }
    const arrival = scene.getObjectByName("anchor_arrival");
    if (arrival) {
      const p = poseOf(arrival);
      p.pos.y = EYE;
      poses.arrival = p;
    }
    const slotNodes: THREE.Object3D[] = [];
    for (let i = 0; i < 40; i++) {
      const o = scene.getObjectByName(`slot_${String(i).padStart(2, "0")}`);
      if (o) slotNodes.push(o);
    }
    const bays: THREE.Object3D[] = [];
    for (let i = 0; i < 5; i++) {
      const o = scene.getObjectByName(`bay_${i}`);
      if (o) bays.push(o);
    }
    const trophySlots: THREE.Object3D[] = [];
    for (let i = 0; i < 15; i++) {
      const o = scene.getObjectByName(`trophy_slot_${String(i).padStart(2, "0")}`);
      if (o) trophySlots.push(o);
    }
    // The shell marks its prototype group (the award templates, at the origin) `hidden`; glTF has no visibility, so honour it here.
    scene.traverse((o) => {
      if ((o.userData as { hidden?: boolean }).hidden) o.visible = false;
    });
    const templates: Partial<Record<Award, THREE.Object3D>> = {};
    for (const a of ["cup", "obelisk", "plaque"] as Award[]) {
      const o = scene.getObjectByName(`award_${a}`);
      if (o) templates[a] = o;
    }
    const screens: Record<string, THREE.Mesh> = {};
    scene.getObjectByName("screens")?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) screens[o.name] = o as THREE.Mesh;
    });
    const quiet = new Set<THREE.Object3D>();
    for (const n of ["ceiling", "lights", "templates"]) scene.getObjectByName(n)?.traverse((o) => quiet.add(o));
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clear = mats.some((m) => m.transparent);
      const glowing = mats.some((m) => {
        const s = m as THREE.MeshStandardMaterial;
        return !!s.emissive && s.emissiveIntensity > 0 && s.emissive.getHex() !== 0;
      });
      mesh.receiveShadow = true;
      mesh.castShadow = !clear && !glowing && !quiet.has(mesh);
    });
    const desk = collider("desk");
    desk.max.y = 1300;
    const boxes: OfficeData["boxes"] = [
      { pick: { kind: "station", id: "desk" }, box: desk.union(boxOf("desk_monitor_screen", "desk_chair")) },
      { pick: { kind: "station", id: "finance" }, box: collider("finance").union(boxOf("finance_screen", "ledger")) },
      {
        pick: { kind: "station", id: "market" },
        box: collider("market_credenza").union(boxOf(...[0, 1, 2, 3, 4, 5].map((i) => `intel_screen_${i}`))),
      },
      { pick: { kind: "station", id: "marketing" }, box: boxOf("whiteboard") },
      { pick: { kind: "station", id: "door" }, box: boxOf("door") },
      { pick: { kind: "station", id: "tv" }, box: collider("tv_console").union(boxOf("tv_screen")) },
      { pick: { kind: "station", id: "trophies" }, box: boxOf("trophies") },
    ];
    const bay = extras.bays ?? { pitch: 0.98, z0: 1.3 };
    return {
      scene,
      poses,
      stands,
      sides,
      room,
      colliders,
      slots: slotNodes.map(poseOf),
      slotNodes,
      bays,
      bay: { z0: bay.z0 * M, pitch: bay.pitch * M, x: room.x0 + 400 },
      trophySlots,
      templates,
      boxes,
      deskScreen: boxOf("desk_monitor_screen").expandByScalar(40),
      screens,
    };
  }, [gltf]);
}

/** A small room for reflections: the window bank, warm walls, the floor and the pendants. */
function Reflections() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const s = new THREE.Scene();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(11, 3.3, 8),
      new THREE.MeshBasicMaterial({ color: token("office-env-room"), side: THREE.BackSide }),
    );
    box.position.set(0, 1.65, 0);
    s.add(box);
    const panel = (w: number, h: number, pos: number[], rx: number, colour: string, k: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(k), side: THREE.DoubleSide }),
      );
      m.position.set(pos[0], pos[1], pos[2]);
      m.rotation.x = rx;
      s.add(m);
    };
    panel(4.4, 2, [0.6, 1.85, -3.95], 0, token("office-env-window"), 6);
    panel(11, 8, [0, 0.02, 0], -Math.PI / 2, token("office-env-floor"), 0.9);
    for (const [x, z] of [
      [-2.6, 2.6],
      [0.6, -2.5],
      [-2.8, -1.4],
      [1.4, 1.0],
      [4.2, -1.9],
      [4.2, 1.8],
    ])
      panel(0.4, 0.4, [x, 2.3, z], Math.PI / 2, token("office-env-lamp"), 8);
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(s, 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      s.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    };
  }, [gl, scene]);
  return null;
}

export function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const aim = new THREE.Object3D();
    aim.position.set(200, 0, 0);
    scene.add(aim);
    if (sun.current) sun.current.target = aim;
    return () => {
      scene.remove(aim);
    };
  }, [scene]);
  return (
    <>
      <Reflections />
      <hemisphereLight args={[token("office-sky"), token("office-ground"), 0.55]} />
      <directionalLight
        ref={sun}
        position={[1800, 7500, -10000]}
        color={token("office-sun")}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7000}
        shadow-camera-right={7000}
        shadow-camera-top={6000}
        shadow-camera-bottom={-6000}
        shadow-camera-near={4000}
        shadow-camera-far={22000}
        shadow-bias={-0.0004}
        shadow-normalBias={20}
      />
    </>
  );
}

/** Redraws the held shadow map for a few frames whenever `stamp` changes: after the room, laptops or awards land. */
export function ShadowRefresh({ stamp }: { stamp: string }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the stamp is the trigger
  useEffect(() => {
    frames.current = 45;
  }, [stamp]);
  useFrame(() => {
    if (frames.current <= 0) return;
    frames.current--;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/** Room geometry the office's other parts share. */
export function OfficeScene({ children }: { children: (data: OfficeData) => React.ReactNode }) {
  const data = useOffice();
  return (
    <>
      <group scale={M}>
        <primitive object={data.scene} />
      </group>
      {children(data)}
    </>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface Walk {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
}

/**
 * The camera: at a station it glides to the station's view; in free roam
 * it walks at eye height with WASD, looking with the mouse. `target` null
 * is free roam.
 */
export function Rig({
  data,
  target,
  lean,
  arrive,
  walk,
  active,
  zoom,
}: {
  data: OfficeData;
  target: Pose | null;
  /** In free roam: leaning in to use a laptop, the camera held here. */
  lean: Pose | null;
  /** In from the map: mount in free roam beside the Desk, facing its screen. */
  arrive: boolean;
  /** Free roam's position and heading, shared with the picker. */
  walk: RefObject<Walk>;
  /** Keys and mouse move the player. */
  active: boolean;
  /** In free roam: the field of view the wheel asks for, as a share of the default. */
  zoom?: RefObject<number>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  // The field of view as it eases toward the wheel's, a share of the default.
  const scale = useRef(1);
  const size = useThree((s) => s.size);
  const clock = useRef(0);
  const tween = useRef<{ from: Pose; to: Pose; at: number; dur: number } | null>(null);
  const rise = useRef<{ from: number; at: number } | null>(null);
  const keys = useRef(new Set<string>());
  const goal = target ?? lean;
  const live = useRef({ active, free: goal === null });
  live.current = { active, free: goal === null };
  const leaning = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once, on mount
  useLayoutEffect(() => {
    if (arrive && !target) {
      const w = walk.current;
      const spot = data.stands.desk ?? data.poses.desk?.pos ?? data.poses.arrival?.pos;
      if (spot) w.pos.set(spot.x, EYE, spot.z);
      collideIn(w.pos, data.room, data.colliders, BODY);
      const c = data.deskScreen.isEmpty() ? null : data.deskScreen.getCenter(new THREE.Vector3());
      if (c) {
        const dx = c.x - w.pos.x;
        const dz = c.z - w.pos.z;
        w.yaw = Math.atan2(-dx, -dz);
        w.pitch = clamp(Math.atan2(c.y - EYE, Math.hypot(dx, dz)), -0.8, 0.4);
      }
      camera.position.copy(w.pos);
      camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
      return;
    }
    if (target) {
      camera.position.copy(target.pos);
      camera.quaternion.copy(target.quat);
    }
  }, []);
  const poseNow = (): Pose => ({ pos: camera.position.clone(), quat: camera.quaternion.clone() });

  const first = useRef(true);
  // A layout effect: a frame drawn before it would walk from the stale free roam pose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: moves when the target does
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (goal) {
      tween.current = { from: poseNow(), to: goal, at: clock.current, dur: MOVE_S };
      leaning.current = !target;
      return;
    }
    if (leaning.current) {
      // Back from a laptop to where the player stood.
      leaning.current = false;
      const w = walk.current;
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(w.pitch, w.yaw, 0, "YXZ"));
      tween.current = { from: poseNow(), to: { pos: w.pos.clone(), quat }, at: clock.current, dur: MOVE_S };
      return;
    }
    // Into free roam from wherever the camera is: onto the floor at eye height, facing the same way.
    tween.current = null;
    const w = walk.current;
    w.pos.copy(camera.position);
    collideIn(w.pos, data.room, data.colliders, BODY);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    w.yaw = e.y;
    w.pitch = e.x;
    rise.current = { from: camera.position.y, at: clock.current };
  }, [goal]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const mouse = (e: MouseEvent) => {
      const s = live.current;
      if (!s.free || !s.active) return;
      // Pointer locked, or dragging with the button held.
      if (!document.pointerLockElement && !(e.buttons & 1)) return;
      const w = walk.current;
      w.yaw -= e.movementX * LOOK;
      w.pitch = clamp(w.pitch - e.movementY * LOOK, -1.4, 1.4);
    };
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
  }, [walk]);

  useFrame((_, dt) => {
    clock.current += dt;
    // The wheel's zoom holds only while walking; anywhere else the view is the default.
    const want = live.current.free ? (zoom?.current ?? 1) : 1;
    scale.current += (want - scale.current) * Math.min(1, dt * 10);
    if (Math.abs(want - scale.current) < 0.001) scale.current = want;
    const fov = fovFor(size.width / size.height) * scale.current;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const t = tween.current;
    if (t) {
      const k = clamp((clock.current - t.at) / t.dur, 0, 1);
      const e = easeInOut(k);
      camera.position.lerpVectors(t.from.pos, t.to.pos, e);
      camera.quaternion.slerpQuaternions(t.from.quat, t.to.quat, e);
      if (k >= 1) tween.current = null;
      return;
    }
    if (goal) {
      camera.position.copy(goal.pos);
      camera.quaternion.copy(goal.quat);
      return;
    }
    const w = walk.current;
    const s = live.current;
    const k = keys.current;
    const f = s.active ? (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) : 0;
    const r = s.active ? (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) : 0;
    if (f || r) {
      const len = Math.hypot(f, r);
      w.pos.x += ((-Math.sin(w.yaw) * f + Math.cos(w.yaw) * r) / len) * SPEED * dt;
      w.pos.z += ((-Math.cos(w.yaw) * f - Math.sin(w.yaw) * r) / len) * SPEED * dt;
      collideIn(w.pos, data.room, data.colliders, BODY);
    }
    const up = rise.current;
    if (up) {
      const q = clamp((clock.current - up.at) / RISE_S, 0, 1);
      w.pos.y = up.from + (EYE - up.from) * easeInOut(q);
      if (q >= 1) rise.current = null;
    } else w.pos.y = EYE;
    camera.position.copy(w.pos);
    camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
  }, -1);
  return null;
}

/**
 * What the middle of the view is on in free roam, by boxes rather than the
 * room's meshes: the laptops on the wall first, then the nearest station.
 * A click in free roam takes the pointer again.
 */
export function Picker({
  data,
  laptops,
  bays,
  free,
  onLock,
  onAim,
}: {
  data: OfficeData;
  laptops: RefObject<{ id: string; box: THREE.Box3 }[]>;
  bays: number;
  free: boolean;
  onLock: () => void;
  /** In free roam: what the middle of the view is on, as it changes. */
  onAim: (p: Pick | null) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const lock = useRef(onLock);
  lock.current = onLock;
  const aim = useRef(onAim);
  aim.current = onAim;
  const live = useRef({ bays, free });
  live.current = { bays, free };
  const aimed = useRef<string>("");
  const since = useRef(0);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const within = (): Pick | null => {
    const hit = new THREE.Vector3();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const reach = 3500;
    for (const l of laptops.current ?? [])
      if (ray.ray.intersectBox(l.box, hit) && hit.distanceTo(ray.ray.origin) < reach) return { kind: "laptop", id: l.id };
    if (ray.ray.intersectBox(data.deskScreen, hit) && hit.distanceTo(ray.ray.origin) < reach) return { kind: "laptop", id: DESK_PC_ID };
    let best: Pick | null = null;
    let near = Number.POSITIVE_INFINITY;
    const n = live.current.bays;
    const wall = new THREE.Box3(
      new THREE.Vector3(data.room.x0, 0, data.bay.z0 - n * data.bay.pitch),
      new THREE.Vector3(data.room.x0 + 400, 2100, data.bay.z0),
    );
    for (const b of [...data.boxes, { pick: { kind: "station", id: "products" } as Pick, box: wall }]) {
      if (!ray.ray.intersectBox(b.box, hit)) continue;
      const d = hit.distanceTo(ray.ray.origin);
      // The door can be aimed at from further off than the rest.
      const far = b.pick.kind === "station" && b.pick.id === "door" ? 6000 : reach;
      if (d < near && d < far) {
        near = d;
        best = b.pick;
      }
    }
    return best;
  };
  useFrame((_, dt) => {
    since.current += dt;
    if (since.current < 0.1) return;
    since.current = 0;
    const p = live.current.free ? within() : null;
    const key = p ? JSON.stringify(p) : "";
    if (key === aimed.current) return;
    aimed.current = key;
    aim.current(p);
  });
  useEffect(() => {
    const el = gl.domElement;
    let down = { x: 0, y: 0 };
    const press = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const click = (e: MouseEvent) => {
      // A drag to look round is not a click.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      if (live.current.free) lock.current();
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("click", click);
    return () => {
      el.removeEventListener("pointerdown", press);
      el.removeEventListener("click", click);
    };
  }, [gl]);
  return null;
}
