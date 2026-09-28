import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  type ReactNode,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import storeUrl from "../assets/storeworld/courts-store.glb?url";
import {
  clamp,
  collideIn,
  easeOut,
  FOV_MIN,
  lookAngles,
  type Rect,
  ZOOM_STEP,
} from "../cafe/World";
import { type Build, colourHex, decorOf, type Fit, solve } from "../engine";
import { useOsStill } from "../os/useOsScreen";
import type { Era } from "../review/Charts";
import { Model, surfacesOf } from "../viewer/Scene";
import { type Baked, bake, Looks } from "./bake";
import { buildDisplays, signTexture } from "./displays";
import { DOOR, type Layout, ROOM, type Seat, TABLE, TABLE_Y } from "./layout";
import type { OnSale } from "./onSale";

// The Courts store in first person: the designer's shell (metres, under a
// group scaled to mm), the display tables rebuilt for what is on sale, and on
// them the game's own laptop models, baked into shared static meshes. Units
// are mm, floor at y = 0, the entrance in the front wall facing +z.

const M = 1000;
const EYE = 1620;
const SPEED = 1500;
const FAST = 2.2;
const LOOK = 0.0022;
const FOV = 60;
const BODY = 280;
const REACH = 2600;
const FLY_MS = 700;
/** Where the player comes in: just inside the door, facing the logo. */
const START = new THREE.Vector3(0, EYE, 8000);
/** The door in the front wall: what the aim dot catches to leave. */
const DOOR_BOX = new THREE.Box3(
  new THREE.Vector3(DOOR.x0 * M, 0, ROOM.z1 * M - 150),
  new THREE.Vector3(DOOR.x1 * M, 2300, ROOM.z1 * M + 50),
);
const LID = 110;
/** In use, the screen fills this much of the view. */
const USE_FILL = 0.84;
/** Beyond this distance a laptop draws its simpler copy. */
const FAR = 2800;
/** Laptop models mounted for baking at once. */
const BATCH = 2;
/** Frames a model is mounted before it is baked: its units build in effects. */
const SETTLE_FRAMES = 3;
const SHADOW_FRAMES = 90;
/** How long the laptops wait for the shared screen picture before baking without it. */
const SCREEN_WAIT_MS = 2500;

type V3 = [number, number, number];

const FONTS = ['700 40px "Barlow Condensed"', '500 20px "IBM Plex Sans"'];

const mm = (r: { x0: number; z0: number; x1: number; z1: number }): Rect => ({
  x0: r.x0 * M,
  z0: r.z0 * M,
  x1: r.x1 * M,
  z1: r.z1 * M,
});

/** The fixed furniture the player walks around, from the store's layout. */
const FIXED: Rect[] = [
  // Columns.
  ...[
    [-8.2, -1.6],
    [8.2, -1.6],
    [-8.2, 5],
    [8.2, 5],
  ].map(([x, z]) => mm({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
  // Checkout counter.
  mm({ x0: 6.75, x1: 10.05, z0: 6.75, z1: 7.65 }),
  // Stock gondolas along the left wall.
  mm({ x0: -12, x1: -11.45, z0: -8.6, z1: 4.2 }),
  // The TV wall.
  mm({ x0: 11.85, x1: 12, z0: -8.3, z1: 4.3 }),
  // The door's architraves; the front wall either side is the room's own edge.
  mm({ x0: DOOR.x1, x1: DOOR.x1 + 0.12, z0: 9.92, z1: ROOM.z1 }),
  mm({ x0: DOOR.x0 - 0.12, x1: DOOR.x0, z0: 9.92, z1: ROOM.z1 }),
];

const ROOM_MM: Rect = mm(ROOM);

/** Shell parts that neither cast shadows nor block the overhead light. */
const NO_CAST = new Set([
  "floor",
  "ceiling_panel",
  "troffers",
  "wall_back_panel",
  "wall_left_panel",
  "wall_right_panel",
  "wall_front_panel",
  "door_daylight",
  "logo",
  "entrance_mat",
  "entrance_mat_edge",
]);

/** The signage fonts are loaded: canvas text drawn before then falls back to a serif. */
function useFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(FONTS.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

function useShell(era: Era, fonts: boolean): THREE.Group {
  const gltf = useLoader(GLTFLoader, storeUrl);
  const scene = gltf.scene;
  useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const clear = mats.some((m) => m.transparent);
      const unlit = mats.some((m) => m.type === "MeshBasicMaterial");
      mesh.receiveShadow = !unlit;
      let name = mesh.name;
      // A multi-material part loads as a group of meshes under its name.
      if (!NO_CAST.has(name) && mesh.parent && NO_CAST.has(mesh.parent.name))
        name = mesh.parent.name;
      mesh.castShadow = !clear && !unlit && !NO_CAST.has(name);
    });
  }, [scene]);
  // The hanging sign reads NOTEBOOKS in the 2006 era, LAPTOPS after.
  useEffect(() => {
    const sign = scene.getObjectByName("department_sign");
    if (!sign || !fonts) return;
    const tex = signTexture(era === 2006 ? "NOTEBOOKS" : "LAPTOPS");
    const swapped: [THREE.MeshStandardMaterial, THREE.Texture | null][] = [];
    sign.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        const s = m as THREE.MeshStandardMaterial;
        if (!s.map) continue;
        swapped.push([s, s.map]);
        s.map = tex;
        s.needsUpdate = true;
      }
    });
    return () => {
      for (const [s, was] of swapped) {
        s.map = was;
        s.needsUpdate = true;
      }
      tex.dispose();
    };
  }, [scene, era, fonts]);
  return scene;
}

/** A bright retail box for reflections: a white room lit from a ceiling of panels. */
function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const s = new THREE.Scene();
    const owned: { dispose(): void }[] = [];
    const basic = (
      color: THREE.ColorRepresentation,
      side: THREE.Side = THREE.BackSide,
    ) => {
      const m = new THREE.MeshBasicMaterial({ color, side });
      owned.push(m);
      return m;
    };
    const room = new THREE.Mesh(
      new THREE.BoxGeometry(24, 4.2, 20),
      basic(0xc9ccd0),
    );
    room.position.y = 2.1;
    s.add(room);
    const panel = new THREE.PlaneGeometry(1.2, 0.6);
    const lit = basic(
      new THREE.Color(0xfffdf4).multiplyScalar(5),
      THREE.DoubleSide,
    );
    for (let x = -10; x <= 10; x += 2.4)
      for (let z = -8; z <= 8; z += 2.4) {
        const p = new THREE.Mesh(panel, lit);
        p.position.set(x, 4.15, z);
        p.rotation.x = Math.PI / 2;
        s.add(p);
      }
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(24.2, 0.9, 20.2),
      basic(0x1d5fbf),
    );
    band.position.y = 3.75;
    s.add(band);
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(s, 0.03).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.geometry.dispose();
      band.geometry.dispose();
      panel.dispose();
      for (const o of owned) o.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Lights() {
  const top = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const aim = new THREE.Object3D();
    aim.position.set(0, 0, -1000);
    scene.add(aim);
    if (top.current) top.current.target = aim;
    return () => {
      scene.remove(aim);
    };
  }, [scene]);
  return (
    <>
      <hemisphereLight args={[0xffffff, 0xb9bcc0, 1.1]} />
      <directionalLight
        ref={top}
        position={[1500, 12000, 3000]}
        color={0xfffaf0}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12500}
        shadow-camera-right={12500}
        shadow-camera-top={11000}
        shadow-camera-bottom={-11000}
        shadow-camera-near={4000}
        shadow-camera-far={16000}
        shadow-bias={-0.0003}
        shadow-normalBias={15}
        shadow-radius={5}
      />
    </>
  );
}

/** The shadows are drawn while the store settles, then held. */
function ShadowWarmup({ stamp }: { stamp: unknown }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraws when the tables change
  useEffect(() => {
    frames.current = 0;
  }, [stamp]);
  useFrame(() => {
    if (frames.current >= SHADOW_FRAMES) return;
    frames.current++;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}

const noLabel = () => "";
const noHover = () => {};

/** One laptop model mounted out of sight until it is baked. */
function Bakery({
  item,
  screen,
  looks,
  onDone,
}: {
  item: OnSale;
  screen: THREE.Texture | undefined;
  looks: Looks;
  onDone: (id: string, b: Baked | null) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const done = useRef(false);
  const build = item.build;
  const look = useMemo(() => {
    const l = lookOf(build);
    if (!l) console.error(`store laptop ${item.id} could not be fitted`);
    return l;
  }, [build, item.id]);
  const fit = look?.fit ?? null;
  useEffect(() => {
    if (!fit) onDone(item.id, null);
  }, [fit, item.id, onDone]);
  useFrame(() => {
    if (
      done.current ||
      !fit ||
      ++frames.current < SETTLE_FRAMES ||
      !root.current
    )
      return;
    done.current = true;
    let b: Baked | null = null;
    try {
      b = bake(root.current, looks, FAR);
    } catch (e) {
      console.error(`store laptop ${item.id} could not be baked`, e);
    }
    onDone(item.id, b);
  });
  if (!look) return null;
  return (
    <group ref={root} visible={false}>
      <Model
        fit={look.fit}
        year={build.year}
        lidAngle={LID}
        colours={look.colours}
        decor={look.decor}
        surfaces={look.surfaces}
        xray={false}
        problems={false}
        labelFor={noLabel}
        onHover={noHover}
        lockScreen={screen}
      />
    </group>
  );
}

const OWNER = { maker: "Courts", wordmark: "COURTS" };

/** What the Model draws for a build; null when it cannot be fitted. */
function lookOf(build: Build) {
  let fit: Fit;
  try {
    fit = solve(build);
  } catch {
    return null;
  }
  const hex = (c: string) => {
    try {
      return colourHex(c);
    } catch {
      return "#888888";
    }
  };
  return {
    fit,
    colours: {
      floor: hex(build.finish.floor.colour),
      deck: hex(build.finish.deck.colour),
      lid: hex(build.finish.lid.colour),
    },
    surfaces: surfacesOf(build),
    decor: decorOf(build),
  };
}

/** The OS page on the screen of the laptop in use. */
export interface StoreScreen {
  node: ReactNode;
  width: number;
  mm: { x: number; y: number };
}

/** The laptop in use, drawn live in place of its baked copy. */
function Live({
  seat,
  screen,
  still,
  portal,
}: {
  seat: Seat;
  screen?: StoreScreen;
  /** The display units' shared desktop picture, shown until the OS page is up. */
  still?: THREE.Texture;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const look = useMemo(() => lookOf(seat.item.build), [seat.item.build]);
  if (!look) return null;
  return (
    <group
      position={[seat.x * M, TABLE_Y * M, seat.z * M]}
      rotation={[0, seat.side > 0 ? 0 : Math.PI, 0]}
    >
      <Model
        fit={look.fit}
        year={seat.item.build.year}
        lidAngle={LID}
        colours={look.colours}
        decor={look.decor}
        surfaces={look.surfaces}
        xray={false}
        problems={false}
        labelFor={noLabel}
        onHover={noHover}
        screen={screen}
        lockScreen={screen ? undefined : still}
        portal={portal}
      />
    </group>
  );
}

/** Where to stand to use a seat's laptop, close enough that its screen fills most of the view. */
function leanOf(
  s: Seat,
  aspect: number,
): { pos: THREE.Vector3; at: THREE.Vector3 } | null {
  const look = lookOf(s.item.build);
  if (!look) return null;
  const fit = look.fit;
  const o = fit.shell.outer;
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const r = panel ? o.y - (panel.at.y + panel.size.y / 2) : o.y / 2;
  const a = (LID * Math.PI) / 180;
  const py = o.z + r * Math.sin(a);
  const pz = -o.y / 2 + r * Math.cos(a);
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
  const sw = panel?.size.x ?? o.x;
  const sh = panel?.size.y ?? o.y * 0.8;
  const d = Math.max(sw / (2 * tanV * aspect), sh / (2 * tanV)) / USE_FILL;
  const base = new THREE.Vector3(s.x * M, TABLE_Y * M, s.z * M);
  const k = s.side > 0 ? 1 : -1;
  const at = base.clone().add(new THREE.Vector3(0, py, pz * k));
  const pos = base
    .clone()
    .add(
      new THREE.Vector3(0, py - Math.cos(a) * d, (pz + Math.sin(a) * d) * k),
    );
  return { pos, at };
}

/** The laptops on the tables: each model mounted, baked and placed in turn. */
function Laptops({
  seats,
  live,
  page,
  portal,
}: {
  seats: Seat[];
  live: number | null;
  page?: StoreScreen;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const looks = useMemo(() => new Looks(), []);
  const [baked, setBaked] = useState<Map<string, Baked | null>>(
    () => new Map(),
  );
  const all = useRef(baked);
  all.current = baked;
  const first = seats[0]?.item.build ?? null;
  const screen = useOsStill("desktop", first, OWNER, "", 1.6, 1024);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), SCREEN_WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(
    () => () => {
      for (const b of all.current.values()) b?.dispose();
      looks.dispose();
    },
    [looks],
  );
  const onDone = useCallback((id: string, b: Baked | null) => {
    setBaked((m) => new Map(m).set(id, b));
  }, []);
  const ready = !!screen || waited;
  const queue = ready
    ? seats.filter((s) => !baked.has(s.item.id)).slice(0, BATCH)
    : [];
  return (
    <>
      {queue.map((s) => (
        <Bakery
          key={s.item.id}
          item={s.item}
          screen={screen}
          looks={looks}
          onDone={onDone}
        />
      ))}
      {live !== null && seats[live] && (
        <Live
          seat={seats[live]}
          screen={page}
          still={screen}
          portal={portal}
        />
      )}
      {seats.map((s, i) => {
        const b = baked.get(s.item.id);
        if (!b) return null;
        return (
          <primitive
            key={s.item.id}
            object={b.object}
            visible={i !== live}
            position={[s.x * M, TABLE_Y * M, s.z * M]}
            rotation={[0, s.side > 0 ? 0 : Math.PI, 0]}
          />
        );
      })}
    </>
  );
}

/** Where to stand to look at a seat's laptop, and the point to look at. */
function focusOf(s: Seat): { pos: THREE.Vector3; at: THREE.Vector3 } {
  const p = new THREE.Vector3(s.x * M, TABLE_Y * M, s.z * M);
  return {
    pos: p.clone().add(new THREE.Vector3(0, 460, s.side * 620)),
    at: p.clone().add(new THREE.Vector3(0, 100, -s.side * 40)),
  };
}

function seatBox(s: Seat): THREE.Box3 {
  return new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(s.x * M, (TABLE_Y + 0.2) * M, (s.z + s.side * 0.1) * M),
    new THREE.Vector3(480, 400, 640),
  );
}

/** What the aim dot is on: a laptop's seat, the door, or nothing. */
export type StoreAim = number | "door" | null;

function Player({
  layout,
  active,
  inspect,
  using,
  shift,
  onAim,
}: {
  layout: Layout;
  active: boolean;
  inspect: number | null;
  /** The inspected laptop is in use: the camera leans in to its screen. */
  using: boolean;
  /** Pixels the picture moves left while the inspect card is open. */
  shift: number;
  onAim: (aim: StoreAim) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const pos = useRef(START.clone());
  const look = useRef({ yaw: 0, pitch: -0.12 });
  const keys = useRef(new Set<string>());
  const fov = useRef(FOV);
  const aimed = useRef<StoreAim>(null);
  const fly = useRef<{
    fromPos: THREE.Vector3;
    fromQ: THREE.Quaternion;
    toPos: THREE.Vector3;
    toQ: THREE.Quaternion;
    t: number;
  } | null>(null);
  const was = useRef("null:false");
  const live = useRef({ active, inspect });
  live.current = { active, inspect };
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const boxes = useMemo(() => layout.seats.map(seatBox), [layout]);
  const rects = useMemo(
    () => [
      ...FIXED,
      ...layout.tables.map((t) =>
        mm({
          x0: t.x - TABLE.w / 2,
          x1: t.x + TABLE.w / 2,
          z0: t.z - TABLE.d / 2,
          z1: t.z + TABLE.d / 2,
        }),
      ),
    ],
    [layout],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (!document.pointerLockElement || live.current.inspect !== null) return;
      const k = LOOK * (fov.current / FOV);
      look.current.yaw -= e.movementX * k;
      look.current.pitch = clamp(
        look.current.pitch - e.movementY * k,
        -1.45,
        1.45,
      );
    };
    const wheel = (e: WheelEvent) => {
      if (
        !document.pointerLockElement ||
        !live.current.active ||
        live.current.inspect !== null
      )
        return;
      fov.current = clamp(
        fov.current * Math.exp(e.deltaY * ZOOM_STEP),
        FOV_MIN,
        FOV,
      );
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
    if (!active || inspect !== null) keys.current.clear();
  }, [active, inspect]);

  useFrame((_, dt) => {
    // Into or between inspect views, into use, and back to walking: ease the camera.
    const mode = `${inspect}:${using}`;
    if (was.current !== mode) {
      const fromPos = camera.position.clone();
      const fromQ = camera.quaternion.clone();
      let toPos: THREE.Vector3;
      let toQ: THREE.Quaternion;
      const seat = inspect !== null ? layout.seats[inspect] : undefined;
      if (seat) {
        const f = (using && leanOf(seat, camera.aspect)) || focusOf(seat);
        toPos = f.pos;
        const a = lookAngles(f.pos, f.at);
        toQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(a.pitch, a.yaw, 0, "YXZ"),
        );
      } else {
        toPos = pos.current.clone();
        toQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(look.current.pitch, look.current.yaw, 0, "YXZ"),
        );
      }
      fly.current =
        was.current === "null:false" && inspect === null
          ? null
          : { fromPos, fromQ, toPos, toQ, t: 0 };
      was.current = mode;
    }
    if (inspect === null && active && !fly.current) {
      const k = keys.current;
      const f =
        (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
        (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      const r =
        (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
        (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
      if (f || r) {
        const yaw = look.current.yaw;
        const len = Math.hypot(f, r);
        const v =
          SPEED *
          (k.has("ShiftLeft") || k.has("ShiftRight") ? FAST : 1) *
          Math.min(dt, 0.1);
        pos.current.x += ((-Math.sin(yaw) * f + Math.cos(yaw) * r) / len) * v;
        pos.current.z += ((-Math.cos(yaw) * f - Math.sin(yaw) * r) / len) * v;
        collideIn(pos.current, ROOM_MM, rects, BODY);
      }
    }
    const cam = camera;
    const target = inspect !== null ? FOV : fov.current;
    if (Math.abs(cam.fov - target) > 0.01) {
      cam.fov += (target - cam.fov) * Math.min(1, dt * 12);
      if (Math.abs(cam.fov - target) <= 0.01) cam.fov = target;
      cam.updateProjectionMatrix();
    }
    const fl = fly.current;
    if (fl) {
      fl.t = Math.min(1, fl.t + (dt * 1000) / FLY_MS);
      const k = easeOut(fl.t);
      if (inspect === null) {
        fl.toPos.copy(pos.current);
        fl.toQ.setFromEuler(
          new THREE.Euler(look.current.pitch, look.current.yaw, 0, "YXZ"),
        );
      }
      cam.position.lerpVectors(fl.fromPos, fl.toPos, k);
      cam.quaternion.slerpQuaternions(fl.fromQ, fl.toQ, k);
      if (fl.t >= 1) fly.current = null;
    } else if (inspect === null) {
      cam.position.copy(pos.current);
      cam.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
    }
    // The inspect card covers the right: centre the laptop in what is left.
    const off = inspect !== null && !using ? shift : 0;
    const has = cam.view?.enabled && cam.view.offsetX !== 0;
    if (off > 0 && (!has || cam.view?.offsetX !== off)) {
      cam.setViewOffset(
        size.width,
        size.height,
        off,
        0,
        size.width,
        size.height,
      );
      cam.updateProjectionMatrix();
    } else if (off === 0 && has) {
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }

    // Which laptop the aim dot is on, or the door.
    let next: StoreAim = null;
    if (inspect === null && active) {
      ray.setFromCamera(new THREE.Vector2(0, 0), cam);
      const hit = new THREE.Vector3();
      let best = REACH;
      boxes.forEach((b, i) => {
        if (ray.ray.intersectBox(b, hit)) {
          const d = hit.distanceTo(ray.ray.origin);
          if (d < best) {
            best = d;
            next = i;
          }
        }
      });
      if (ray.ray.intersectBox(DOOR_BOX, hit)) {
        if (hit.distanceTo(ray.ray.origin) < best) next = "door";
      }
    }
    if (next !== aimed.current) {
      aimed.current = next;
      onAim(next);
    }
  }, -1);
  return null;
}

function Room({
  layout,
  era,
  active,
  inspect,
  using,
  screen,
  portal,
  shift,
  onAim,
}: {
  layout: Layout;
  era: Era;
  active: boolean;
  inspect: number | null;
  using: boolean;
  screen?: StoreScreen;
  portal: RefObject<HTMLDivElement | null>;
  shift: number;
  onAim: (aim: StoreAim) => void;
}) {
  const fonts = useFonts();
  const shell = useShell(era, fonts);
  const displays = useMemo(
    () => (fonts ? buildDisplays(layout) : null),
    [layout, fonts],
  );
  useEffect(() => () => displays?.dispose(), [displays]);
  return (
    <>
      <group scale={M}>
        <primitive object={shell} />
        {displays && <primitive object={displays.group} />}
      </group>
      <ShadowWarmup stamp={displays} />
      <Laptops
        seats={layout.seats}
        live={using ? inspect : null}
        page={screen}
        portal={portal}
      />
      <Player
        layout={layout}
        active={active}
        inspect={inspect}
        using={using}
        shift={shift}
        onAim={onAim}
      />
    </>
  );
}

export function Store(props: {
  layout: Layout;
  era: Era;
  active: boolean;
  inspect: number | null;
  /** The inspected laptop is in use: live, its OS on the screen. */
  using: boolean;
  screen?: StoreScreen;
  shift: number;
  onAim: (aim: StoreAim) => void;
}) {
  const overlay = useRef<HTMLDivElement | null>(null);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
    <Canvas
      shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: false }}
      dpr={[1, 1.5]}
      gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 0.92 }}
      camera={{
        fov: FOV,
        near: 20,
        far: 60000,
        position: START.toArray() as V3,
      }}
    >
      <color attach="background" args={["#dfe3e8"]} />
      <Environment />
      <Lights />
      <Suspense fallback={null}>
        <Room
          layout={props.layout}
          era={props.era}
          active={props.active}
          inspect={props.inspect}
          using={props.using}
          screen={props.screen}
          portal={overlay}
          shift={props.shift}
          onAim={props.onAim}
        />
      </Suspense>
    </Canvas>
      {/* The in-use screen's page mounts here, over the canvas. It takes the
          pointer only while the laptop is in use. */}
      <div
        ref={overlay}
        className={`cafe-overlay${props.using ? " using" : ""}`}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
