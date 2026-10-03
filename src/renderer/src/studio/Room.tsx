import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SavedModel } from "../../../preload/store";
import studioUrl from "../assets/studio/laptop-foundry-studio.glb?url";
import { clamp, collideIn, type Rect } from "../cafe/World";
import { type Build, solve } from "../engine";
import { StagedLaptop } from "../foundry/Stage";
import { token } from "../viewer/theme";

// The video studio: the designer's hire studio (metres, loaded under a group
// scaled to mm, like the office), its laptop on the turntable, its lights,
// and a camera that walks the room in first person or glides from the desk
// view onto the editing screen. Units are mm, floor at y = 0.

export const M = 1000;
const EYE = 1620;
const BODY = 260;
const SPEED = 2000;
const LOOK = 0.0022;
/** Vertical field of view at 16:9, from the room's extras; narrower windows widen it. */
const FOV = 50;
const WIDE = 16 / 9;
/** Turntable turns, radians a second. */
const SPIN = 0.35;
/** How near stand_desk the player has to be for the desk to answer, mm. */
const NEAR_DESK = 1300;
/** How far away the door can be aimed at to leave, mm. */
const DOOR_REACH = 6000;
/** The desk screen's glow: faint, and when the player is near. */
const SCREEN_DIM = 0.35;
const SCREEN_LIT = 1.1;
const ON_AIR = 2.6;
/** Seconds: from wherever the player is to the desk view, then onto the screen; and back. */
const TO_DESK_S = 0.55;
const TO_SCREEN_S = 0.7;
const BACK_S = 0.7;
const noRaycast = () => {};

export interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export interface StudioData {
  scene: THREE.Group;
  room: Rect;
  colliders: Rect[];
  arrival: Pose;
  desk: Pose;
  screenCam: Pose;
  /** The desk screen's centre and its frame, mm: +z out of the glass. */
  screen: { pose: Pose; w: number; h: number };
  standDesk: THREE.Vector3;
  door: THREE.Box3;
  laptop: THREE.Vector3;
  disc: THREE.Object3D | null;
  screenMat: THREE.MeshStandardMaterial | null;
  onAir: THREE.MeshStandardMaterial | null;
}

/** Room parts that never cast a shadow: the shell and the cyc's sweep. */
const SHELL = new Set(["ceiling", "floor", "wall_back", "wall_left", "wall_right", "wall_front"]);

function useStudio(): StudioData {
  const gltf = useLoader(GLTFLoader, studioUrl);
  return useMemo(() => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    // Relative to the scene itself: the loader caches it, so on a remount it can still hang under the old mm group.
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const poseOf = (name: string, eye = false): Pose => {
      const o = scene.getObjectByName(name);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      if (o) new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(pos, quat, new THREE.Vector3());
      pos.multiplyScalar(M);
      if (eye) pos.y = EYE;
      return { pos, quat };
    };
    const root = scene.getObjectByName("studio");
    const extras = (root?.userData ?? {}) as {
      room?: { x0: number; x1: number; z0: number; z1: number };
      colliders?: { name: string; min: number[]; max: number[] }[];
    };
    const r = extras.room ?? { x0: -4, x1: 4, z0: -3.5, z1: 3.5 };
    const room: Rect = { x0: r.x0 * M, x1: r.x1 * M, z0: r.z0 * M, z1: r.z1 * M };
    const colliders: Rect[] = (extras.colliders ?? []).map((c) => ({ x0: c.min[0] * M, z0: c.min[2] * M, x1: c.max[0] * M, z1: c.max[2] * M }));
    const screenNode = scene.getObjectByName("anchor_screen");
    const sx = (screenNode?.userData ?? {}) as { width?: number; height?: number };
    const door = new THREE.Box3();
    const leaf = scene.getObjectByName("door_leaf");
    if (leaf) door.setFromObject(leaf).applyMatrix4(inv);
    door.min.multiplyScalar(M);
    door.max.multiplyScalar(M);
    const mat = (mesh: string) => {
      const m = (scene.getObjectByName(mesh) as THREE.Mesh | undefined)?.material;
      return m && !Array.isArray(m) ? (m as THREE.MeshStandardMaterial) : null;
    };
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const m = mesh.material as THREE.MeshStandardMaterial;
      mesh.castShadow = !(m.transparent || m.emissiveIntensity > 0.9 || SHELL.has(mesh.parent?.name ?? "") || mesh.name === "cyc_sweep");
      mesh.receiveShadow = true;
    });
    const screenMat = mat("desk_screen");
    const onAir = mat("on_air");
    return {
      scene,
      room,
      colliders,
      arrival: poseOf("anchor_arrival", true),
      desk: poseOf("cam_desk"),
      screenCam: poseOf("cam_screen"),
      screen: { pose: poseOf("anchor_screen"), w: (sx.width ?? 0.6) * M, h: (sx.height ?? 0.3375) * M },
      standDesk: poseOf("stand_desk").pos,
      door,
      laptop: poseOf("anchor_laptop").pos,
      disc: scene.getObjectByName("turntable_disc") ?? null,
      screenMat,
      onAir,
    };
  }, [gltf]);
}

/** The environment the room reflects: a dark room with the three softboxes and the cyc as its bright sources. */
function Reflections({ laptop }: { laptop: THREE.Vector3 }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const s = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 7), new THREE.MeshBasicMaterial({ color: token("vs-env-room"), side: THREE.BackSide }));
    box.position.set(0, 1.8, 0);
    s.add(box);
    const at = laptop.clone().divideScalar(M);
    const panel = (w: number, h: number, pos: number[], look: THREE.Vector3, colour: string, k: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(k), side: THREE.DoubleSide }),
      );
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(look);
      s.add(m);
    };
    const soft = token("vs-env-soft");
    const cyc = token("vs-env-cyc");
    panel(0.9, 1.2, [-2.75, 1.62, -0.65], at, soft, 9);
    panel(0.4, 1.4, [0.05, 1.45, -0.5], at, soft, 6);
    panel(0.3, 1.0, [-0.05, 1.85, -3.0], at, soft, 5);
    panel(5.2, 3.2, [-1.3, 1.6, -3.38], new THREE.Vector3(-1.3, 1.6, 0), cyc, 1.6);
    panel(5.2, 2.6, [-1.3, 0.02, -2], new THREE.Vector3(-1.3, 3, -2), cyc, 1.2);
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
  }, [gl, scene, laptop]);
  return null;
}

/** The README's recipe: the environment, a weak hemisphere, one shadowed key from the key softbox's side and a fill over the desk. */
function Lights({ laptop }: { laptop: THREE.Vector3 }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const aims: THREE.Object3D[] = [];
    const aim = (l: THREE.DirectionalLight | null, at: THREE.Vector3) => {
      if (!l) return;
      const o = new THREE.Object3D();
      o.position.copy(at);
      scene.add(o);
      l.target = o;
      aims.push(o);
    };
    aim(key.current, laptop);
    aim(fill.current, new THREE.Vector3(2300, 800, -400));
    return () => {
      for (const o of aims) scene.remove(o);
    };
  }, [scene, laptop]);
  return (
    <>
      <Reflections laptop={laptop} />
      <hemisphereLight args={[token("vs-sky"), token("vs-ground"), 0.35]} />
      <directionalLight
        ref={key}
        position={[-5200, 3600, 1000]}
        color={token("vs-key")}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5000}
        shadow-camera-right={5000}
        shadow-camera-top={4000}
        shadow-camera-bottom={-4000}
        shadow-camera-near={1000}
        shadow-camera-far={16000}
        shadow-bias={-0.0004}
        shadow-normalBias={20}
      />
      <directionalLight ref={fill} position={[3600, 3000, 1500]} color={token("vs-fill")} intensity={0.6} />
    </>
  );
}

/** The laptop on the turntable, base on its top, front to +z, lid open; it turns with the disc. */
function TurntableLaptop({ model, company, data }: { model: SavedModel; company: string; data: StudioData }) {
  const group = useRef<THREE.Group>(null);
  const build = model.build as Build;
  const fit = useMemo(() => {
    try {
      return solve(build);
    } catch {
      return null;
    }
  }, [build]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (data.disc) g.rotation.y = data.disc.rotation.y;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  });
  if (!fit) return null;
  return (
    <group ref={group} position={data.laptop}>
      <StagedLaptop build={build} fit={fit} maker={company} model={model.name} lidAngle={108} />
    </group>
  );
}

export type Goal = "walk" | "screen" | "desk";

/** Where the desk screen is on the page, px, for the editor to grow out of; and whether the player is near the desk. */
export interface ScreenAt {
  rect: { x: number; y: number; w: number; h: number };
  near: boolean;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The camera: walking at eye height with WASD and the mouse; or gliding
 * through poses, onto the screen and back to the desk view, calling `onArrive`
 * at the end. Back to walking from wherever the camera stands.
 */
function Rig({ data, goal, active, onArrive, onAim, at }: {
  data: StudioData;
  goal: Goal;
  /** Keys and mouse move the player. */
  active: boolean;
  onArrive: (g: Goal) => void;
  /** The aim dot is on the door. */
  onAim: (door: boolean) => void;
  at: RefObject<ScreenAt | null>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const walk = useRef({ pos: data.arrival.pos.clone(), yaw: 0, pitch: 0 });
  const tween = useRef<{ from: Pose; path: { to: Pose; dur: number }[]; at: number; goal: Goal } | null>(null);
  const clock = useRef(0);
  const keys = useRef(new Set<string>());
  const live = useRef({ active, goal });
  live.current = { active, goal };
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const aimed = useRef(false);
  const ray = useMemo(() => new THREE.Raycaster(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once, on arrival
  useLayoutEffect(() => {
    camera.position.copy(data.arrival.pos);
    camera.quaternion.copy(data.arrival.quat);
    const e = new THREE.Euler().setFromQuaternion(data.arrival.quat, "YXZ");
    walk.current.yaw = e.y;
    walk.current.pitch = 0;
  }, []);

  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: moves when the goal does
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const from = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
    if (goal === "screen")
      tween.current = { from, path: [{ to: data.desk, dur: TO_DESK_S }, { to: data.screenCam, dur: TO_SCREEN_S }], at: clock.current, goal };
    else if (goal === "desk") {
      const to = { pos: data.desk.pos.clone().setY(EYE), quat: data.desk.quat.clone() };
      tween.current = { from, path: [{ to, dur: BACK_S }], at: clock.current, goal };
    } else {
      // Back on foot where the camera stands, facing the same way.
      tween.current = null;
      const w = walk.current;
      w.pos.copy(camera.position).setY(EYE);
      collideIn(w.pos, data.room, data.colliders, BODY);
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      w.yaw = e.y;
      w.pitch = e.x;
    }
  }, [goal]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const mouse = (e: MouseEvent) => {
      const s = live.current;
      if (!document.pointerLockElement || !s.active || s.goal !== "walk") return;
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
  }, []);
  useEffect(() => {
    if (!active) keys.current.clear();
  }, [active]);

  const corner = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    clock.current += dt;
    if (data.disc) data.disc.rotation.y += dt * SPIN;
    const aspect = size.width / size.height;
    const fov = aspect >= WIDE ? FOV : (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (WIDE / aspect)) * 180) / Math.PI;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const t = tween.current;
    if (t) {
      let start = t.at;
      let from = t.from;
      let done = true;
      for (const leg of t.path) {
        const k = (clock.current - start) / leg.dur;
        if (k < 1) {
          const e = easeInOut(clamp(k, 0, 1));
          camera.position.lerpVectors(from.pos, leg.to.pos, e);
          camera.quaternion.slerpQuaternions(from.quat, leg.to.quat, e);
          done = false;
          break;
        }
        start += leg.dur;
        from = leg.to;
      }
      if (done) {
        const end = t.path[t.path.length - 1].to;
        camera.position.copy(end.pos);
        camera.quaternion.copy(end.quat);
        tween.current = null;
        arrive.current(t.goal);
      }
    } else if (live.current.goal === "walk") {
      const w = walk.current;
      const k = keys.current;
      const on = live.current.active;
      const f = on ? (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) : 0;
      const r = on ? (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) : 0;
      if (f || r) {
        const len = Math.hypot(f, r);
        w.pos.x += ((-Math.sin(w.yaw) * f + Math.cos(w.yaw) * r) / len) * SPEED * dt;
        w.pos.z += ((-Math.cos(w.yaw) * f - Math.sin(w.yaw) * r) / len) * SPEED * dt;
        collideIn(w.pos, data.room, data.colliders, BODY);
      }
      camera.position.copy(w.pos);
      camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
    }
    camera.updateMatrixWorld();

    // The desk screen on the page, and whether the player stands at the desk.
    const s = data.screen;
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      corner.set((sx * s.w) / 2, (sy * s.h) / 2, 0).applyQuaternion(s.pose.quat).add(s.pose.pos).project(camera);
      const px = ((corner.x + 1) / 2) * size.width;
      const py = ((1 - corner.y) / 2) * size.height;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
    const walking = live.current.goal === "walk" && !tween.current;
    const near = walking && Math.hypot(camera.position.x - data.standDesk.x, camera.position.z - data.standDesk.z) < NEAR_DESK;
    at.current = { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, near };
    if (data.screenMat) {
      const want = near || !walking ? SCREEN_LIT : SCREEN_DIM;
      data.screenMat.emissiveIntensity += (want - data.screenMat.emissiveIntensity) * Math.min(1, dt * 6);
    }

    let door = false;
    if (walking) {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = new THREE.Vector3();
      door = !near && !!ray.ray.intersectBox(data.door, hit) && hit.distanceTo(ray.ray.origin) < DOOR_REACH;
    }
    if (door !== aimed.current) {
      aimed.current = door;
      onAim(door);
    }
  }, -1);
  return null;
}

/** The studio: the room, its lights and laptop, and the camera. */
export function StudioRoom({ model, company, goal, active, onAir, onArrive, onAim, at }: {
  /** The laptop on the turntable, or none. */
  model: SavedModel | null;
  company: string;
  goal: Goal;
  active: boolean;
  /** A commercial is rendering: the lamp over the door is lit. */
  onAir: boolean;
  onArrive: (g: Goal) => void;
  onAim: (door: boolean) => void;
  at: RefObject<ScreenAt | null>;
}) {
  const data = useStudio();
  useEffect(() => {
    if (data.onAir) data.onAir.emissiveIntensity = onAir ? ON_AIR : 0;
  }, [data, onAir]);
  return (
    <>
      <group scale={M}>
        <primitive object={data.scene} />
      </group>
      <Lights laptop={data.laptop} />
      {model && <TurntableLaptop key={model.id} model={model} company={company} data={data} />}
      <Rig data={data} goal={goal} active={active} onArrive={onArrive} onAim={onAim} at={at} />
    </>
  );
}
