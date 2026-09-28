import { useFrame, useThree } from "@react-three/fiber";
import {
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { type OsPage, useLaptopOs } from "../cafe/CafeScreen";
import { blurField, FullPage, type Prompt, Prompts, typing } from "../cafe/Cafe";
import { clamp, collideIn, easeOut, FOV_MIN, lookAngles, type Rect, ZOOM_STEP } from "../cafe/World";
import type { Fit, Subject } from "../engine";
import { Column, Entry } from "../foundry/Menus";
import { PLINTH_H } from "../foundry/Stage";
import { BottomCover, Model } from "../viewer/Scene";
import type { AimShelf } from "./Archive";
import { lidPoint } from "./view";

// Free view: the player walks the workshop in first person, the laptop on
// the turntable. Looking at it offers what can be done in its current state:
// turn it over, take its bottom cover off, open or shut the lid, or use it,
// the laptop's own OS on its screen as in the cafe. Units are mm, in the
// builder's world: the turntable top at PLINTH_H, the laptop centred on it.

/** The workshop floor: the room is lifted so its turntable top (0.95 m) is at the plinth's height. */
const FLOOR = PLINTH_H - 950;
const EYE = FLOOR + 1620;
const FOV = 62;
const SPEED = 1500;
const LOOK = 0.0022;
const REACH = 2000;
const SETTLE_MS = 600;
const BODY = 260;
/** How long the camera takes between the builder's pose and standing, either way. */
export const ENTER_MS = 500;
/** The island's top, round the turntable, is this far under the turntable's. */
const ISLAND_DROP = 50;
/** The turntable's radius. */
const TURNTABLE_R = 270;
/** Inside the walls, from the designer's workshop (metres there, mm here). */
const ROOM: Rect = { x0: -8780, x1: 8780, z0: -6490, z1: 6490 };
/** What the player walks round, approximately. */
const RECTS: Rect[] = [
  // The build island.
  { x0: -600, x1: 600, z0: -450, z1: 450 },
  // Under the mezzanine, its columns and glass rooms.
  { x0: -9000, x1: 9000, z0: -6500, z1: -2950 },
  // The workbench and the tool cart.
  { x0: -2450, x1: 2880, z0: -2950, z1: -1610 },
  // The layout table.
  { x0: 3400, x1: 7250, z0: -250, z1: 850 },
  // The lounge.
  { x0: -7800, x1: -3850, z0: 3600, z1: 6500 },
  // The left wall's desk and shelves, and the coat stand by the door.
  { x0: -9000, x1: -6400, z0: -2950, z1: 2100 },
  { x0: -8700, x1: -8100, z0: 3240, z1: 4000 },
  // The right wall's shelves.
  { x0: 8000, x1: 9000, z0: -2950, z1: 2200 },
  // The sink counter and the finish cabinet along the front wall.
  { x0: -3220, x1: -1680, z0: 5860, z1: 6500 },
  { x0: 4400, x1: 8800, z0: 6100, z1: 6500 },
];
/** The personnel door in the left wall, from the designer's workshop: looking at it offers leaving. */
const DOOR = new THREE.Box3(new THREE.Vector3(ROOM.x0 - 250, FLOOR, 2700), new THREE.Vector3(ROOM.x0 + 60, FLOOR + 2300, 3700));
/** Arriving through the door: where the player stands. */
const DOOR_START = new THREE.Vector3(ROOM.x0 + 900, EYE, 2700);
/** Degrees a second the lid turns. */
const LID_SPEED = 200;
/** Seconds to turn the laptop over, and to lift the cover off. */
const FLIP_S = 0.9;
const COVER_S = 0.9;
/** How high the cover is lifted on its way to the island. */
const COVER_LIFT = 150;
/** In use, how much of the view the screen fills: a little of the bezel and deck stay in sight. */
const USE_FILL = 0.84;

/** A camera's pose at the start of a move between the builder and free view. */
export interface CamFrom {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
  /** The view offset's x, px: the builder frames the laptop off centre. */
  off: number;
  at: number;
}

export const camFrom = (c: THREE.PerspectiveCamera, at: number): CamFrom => ({
  pos: c.position.clone(),
  quat: c.quaternion.clone(),
  fov: c.fov,
  off: c.view?.enabled ? c.view.offsetX : 0,
  at,
});

/** Puts the camera k of the way from a start pose to the given one. */
export function camFromTo(
  c: THREE.PerspectiveCamera,
  f: CamFrom,
  pos: THREE.Vector3,
  quat: THREE.Quaternion,
  fov: number,
  off: number,
  k: number,
  size: { width: number; height: number },
) {
  const p = pos.clone();
  const q = quat.clone();
  c.position.lerpVectors(f.pos, p, k);
  c.quaternion.slerpQuaternions(f.quat, q, k);
  c.fov = f.fov + (fov - f.fov) * k;
  const o = f.off + (off - f.off) * k;
  if (Math.abs(o) < 0.5) c.clearViewOffset();
  else c.setViewOffset(size.width, size.height, o, 0, size.width, size.height);
  c.updateProjectionMatrix();
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const noLabel = () => "";
const noHover = () => {};

export interface FreeState {
  flipped: boolean;
  coverOff: boolean;
  lidOpen: boolean;
  using: boolean;
  /** The OS page fills the game window. */
  full: boolean;
  paused: boolean;
  /** The aim dot is on the laptop. */
  aim: boolean;
  /** The laptop is moving to a new pose: no keys until it settles. */
  busy: boolean;
  /** The shelved laptop the aim dot is on, by model id. */
  shelf: string | null;
  /** The aim dot is on the personnel door. */
  door: boolean;
}

export const freeStart = (lidOpen: boolean, flipped = false): FreeState => ({
  flipped,
  coverOff: false,
  lidOpen,
  using: false,
  full: false,
  paused: false,
  aim: false,
  busy: false,
  shelf: null,
  door: false,
});

// ------------------------------------------------------------------ the OS page

/** Holds the OS page, rendered by the builder, for the screen's own React root to show. */
export interface Slot {
  set: (n: ReactNode) => void;
  subscribe: (l: () => void) => () => void;
  get: () => ReactNode;
}

export function makeSlot(): Slot {
  let node: ReactNode = null;
  const ls = new Set<() => void>();
  return {
    set(n) {
      if (n === node) return;
      node = n;
      for (const l of ls) l();
    },
    subscribe(l) {
      ls.add(l);
      return () => ls.delete(l);
    },
    get: () => node,
  };
}

export function SlotView({ slot }: { slot: Slot }) {
  return <>{useSyncExternalStore(slot.subscribe, slot.get)}</>;
}

export type PageLook = Omit<OsPage, "node">;

/** Runs the laptop's OS while in free view, handing its page to the screen through the slot. */
export function FreeOs({
  subject,
  library,
  sound,
  onSound,
  slot,
  onLook,
}: {
  subject: Subject;
  library: Subject[];
  sound: boolean;
  onSound: (on: boolean) => void;
  slot: Slot;
  onLook: (l: PageLook | null) => void;
}) {
  // On the workshop's bench it runs on the charger.
  const os = useLaptopOs({ subject, library, sound, onSound, startPlugged: true, startOn: true, room: "workshop" });
  const node = os.page?.node ?? null;
  useLayoutEffect(() => slot.set(node));
  useEffect(() => () => slot.set(null), [slot]);
  const w = os.page?.width ?? 0;
  const h = os.page?.height ?? 0;
  const mx = os.page?.mm.x ?? 0;
  const my = os.page?.mm.y ?? 0;
  useEffect(() => {
    onLook(w && h ? { width: w, height: h, mm: { x: mx, y: my } } : null);
  }, [w, h, mx, my, onLook]);
  useEffect(() => () => onLook(null), [onLook]);
  // Kept in view while the builder's menus fade out.
  return <div className="bd-keep" style={{ display: "contents" }}>{os.shoot}</div>;
}

// ------------------------------------------------------------------ in the canvas

interface Pose {
  eye: THREE.Vector3;
  at: THREE.Vector3;
}

/** Where the player stands and looks, kept while a laptop is swapped on the turntable. */
export interface Stance {
  pos: THREE.Vector3;
  look: { yaw: number; pitch: number };
  fov: number;
}

export function Walker({
  laptop,
  active,
  using,
  useAt,
  onAim,
  atDoor = false,
  onDoor,
  stance,
  shelves,
  onShelf,
}: {
  laptop: RefObject<THREE.Group | null>;
  active: boolean;
  using: boolean;
  /** Where the player stands to use the laptop, and what they look at. */
  useAt: (aspect: number) => Pose;
  onAim: (on: boolean) => void;
  /** Arrives through the personnel door rather than from the builder's camera. */
  atDoor?: boolean;
  /** Whether the aim dot is on the personnel door; without it the door is not offered. */
  onDoor?: (on: boolean) => void;
  /** Where the player stood before a swap on the turntable remounted this. */
  stance?: RefObject<Stance | null>;
  /** The archive's shelved laptops, and which one the aim dot is on. */
  shelves?: RefObject<AimShelf | null>;
  onShelf?: (id: string | null) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const pos = useRef(new THREE.Vector3(0, EYE, 0));
  const look = useRef({ yaw: 0, pitch: 0 });
  // From the builder's camera to standing: where it started, and when.
  const enter = useRef<CamFrom | null>(null);
  const started = useRef(false);
  const keys = useRef(new Set<string>());
  const clock = useRef(0);
  const settle = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromLook: { yaw: number; pitch: number };
    toLook: { yaw: number; pitch: number };
    at: number;
  } | null>(null);
  const before = useRef<{ pos: THREE.Vector3; look: { yaw: number; pitch: number } } | null>(null);
  const wasUsing = useRef(using);
  const aimed = useRef(false);
  const bounds = useRef({ box: new THREE.Box3(), at: -10 });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const fov = useRef(FOV);
  const live = useRef({ using, active });
  live.current = { using, active };
  const doorAimed = useRef(false);
  const shelfAimed = useRef<string | null>(null);

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
    // In use the wheel belongs to the laptop's screen.
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
  }, [camera]);

  useEffect(() => {
    if (!active || using) keys.current.clear();
    // Using the laptop frames its screen at the plain field of view.
    if (using) fov.current = FOV;
  }, [active, using]);

  useFrame((_, dt) => {
    clock.current += dt;
    const was = stance?.current;
    if (!started.current && was) {
      // A swap on the turntable: the player stays where they stood.
      started.current = true;
      pos.current.copy(was.pos);
      look.current = { ...was.look };
      fov.current = was.fov;
      camera.fov = was.fov;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    if (!started.current) {
      // Stand where the builder's camera is, out of the island, facing the laptop.
      started.current = true;
      const p = atDoor ? DOOR_START.clone() : new THREE.Vector3(camera.position.x, EYE, camera.position.z);
      collideIn(p, ROOM, RECTS, BODY);
      pos.current.copy(p);
      look.current = lookAngles(p, new THREE.Vector3(0, PLINTH_H + 60, 0));
      if (atDoor) {
        camera.fov = FOV;
        camera.clearViewOffset();
        camera.updateProjectionMatrix();
      } else enter.current = camFrom(camera, clock.current);
    }
    if (wasUsing.current !== using) {
      wasUsing.current = using;
      let to: THREE.Vector3;
      let toLook: { yaw: number; pitch: number };
      if (using) {
        before.current = { pos: pos.current.clone(), look: { ...look.current } };
        const p = useAt(camera.aspect);
        to = p.eye;
        toLook = lookAngles(p.eye, p.at);
      } else {
        const b = before.current;
        to = b ? b.pos : pos.current.clone();
        toLook = b ? b.look : { ...look.current };
      }
      settle.current = { from: pos.current.clone(), to, fromLook: { ...look.current }, toLook, at: clock.current };
    }
    const s = settle.current;
    if (s) {
      const t = Math.min(1, ((clock.current - s.at) * 1000) / SETTLE_MS);
      const k = easeOut(t);
      pos.current.lerpVectors(s.from, s.to, k);
      look.current = {
        yaw: s.fromLook.yaw + wrap(s.toLook.yaw - s.fromLook.yaw) * k,
        pitch: s.fromLook.pitch + (s.toLook.pitch - s.fromLook.pitch) * k,
      };
      if (t >= 1) settle.current = null;
    } else if (active && !using && !enter.current) {
      const k = keys.current;
      const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
      const r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
      if (f || r) {
        const yaw = look.current.yaw;
        const len = Math.hypot(f, r);
        pos.current.x += ((-Math.sin(yaw) * f + Math.cos(yaw) * r) / len) * SPEED * dt;
        pos.current.z += ((-Math.cos(yaw) * f - Math.sin(yaw) * r) / len) * SPEED * dt;
        collideIn(pos.current, ROOM, RECTS, BODY);
      }
    }
    const e = enter.current;
    if (e) {
      const k = easeOut(Math.min(1, ((clock.current - e.at) * 1000) / ENTER_MS));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.current.pitch, look.current.yaw, 0, "YXZ"));
      camFromTo(camera, e, pos.current, q, fov.current, 0, k, size);
      if (k >= 1) enter.current = null;
    } else {
      if (Math.abs(camera.fov - fov.current) > 0.01) {
        camera.fov += (fov.current - camera.fov) * Math.min(1, dt * 12);
        if (Math.abs(camera.fov - fov.current) <= 0.01) camera.fov = fov.current;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(pos.current);
      camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
    }

    if (stance) {
      const st = stance.current ?? { pos: new THREE.Vector3(), look: { yaw: 0, pitch: 0 }, fov: FOV };
      st.pos.copy(pos.current);
      st.look = { ...look.current };
      st.fov = fov.current;
      stance.current = st;
    }

    // Whether the aim dot is on the laptop: its bounds are cheap to hit and forgiving to aim at.
    let on = false;
    let shelf: string | null = null;
    let atTheDoor = false;
    const lap = laptop.current;
    if (!using) {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      let d = Number.POSITIVE_INFINITY;
      if (lap) {
        if (clock.current - bounds.current.at > 0.5) {
          bounds.current = { box: new THREE.Box3().setFromObject(lap), at: clock.current };
        }
        const hit = new THREE.Vector3();
        if (ray.ray.intersectBox(bounds.current.box, hit)) d = hit.distanceTo(ray.ray.origin);
        on = d < REACH;
      }
      // A shelved laptop nearer than the turntable's takes the aim.
      const s = shelves?.current?.(ray.ray, REACH);
      if (s && s.d < d) {
        on = false;
        shelf = s.id;
        d = s.d;
      }
      const hit = new THREE.Vector3();
      if (onDoor && ray.ray.intersectBox(DOOR, hit) && hit.distanceTo(ray.ray.origin) < Math.min(d, REACH)) {
        on = false;
        shelf = null;
        atTheDoor = true;
      }
    }
    if (on !== aimed.current) {
      aimed.current = on;
      onAim(on);
    }
    if (shelf !== shelfAimed.current) {
      shelfAimed.current = shelf;
      onShelf?.(shelf);
    }
    if (atTheDoor !== doorAimed.current) {
      doorAimed.current = atTheDoor;
      onDoor?.(atTheDoor);
    }
    // Before the default frame hooks, so the screen's Html follows this frame's camera.
  }, -1);
  return null;
}

export type ScreenPage = { node: ReactNode; width: number; mm: { x: number; y: number } };

/** What free view drives the workshop's laptop and camera with. */
export interface FreeDrive {
  state: FreeState;
  /** How far the lid opens, degrees. */
  openAngle: number;
  page?: ScreenPage;
  onAim: (on: boolean) => void;
  onSettled: () => void;
  /** Arrives through the personnel door. */
  atDoor?: boolean;
  /** Whether the aim dot is on the personnel door, which leaves to the map. */
  onDoor?: (on: boolean) => void;
  stance?: RefObject<Stance | null>;
  shelves?: RefObject<AimShelf | null>;
  onShelf?: (id: string | null) => void;
}

type ModelProps = ComponentProps<typeof Model>;

/**
 * The laptop on the turntable, one instance in the builder and in free view.
 * In the builder it takes the builder's lid and flip at once. In free view,
 * and on the way back from it, it moves to them: lid, turning over, cover.
 */
export function WorkshopLaptop({
  fit,
  lidAngle,
  flip,
  model,
  free,
  portal,
}: {
  fit: Fit;
  /** The builder's lid, degrees, and whether it lies turned over. */
  lidAngle: number;
  flip: boolean;
  /** The Model's props in the builder. */
  model: Omit<ModelProps, "fit" | "lidAngle" | "portal" | "screen" | "floorless">;
  free?: FreeDrive;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const out = fit.shell.outer;
  const T = out.z + fit.lidZ;
  const D = out.y;
  const [lid, setLid] = useState(lidAngle);
  const [open, setOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const lidNow = useRef(lidAngle);
  const flipT = useRef(flip ? 1 : 0);
  const coverT = useRef(0);
  const reported = useRef(false);
  const flipG = useRef<THREE.Group>(null);
  const coverG = useRef<THREE.Group>(null);
  const laptop = useRef<THREE.Group>(null);
  const live = useRef({ free, lidAngle, flip, returning, T });
  live.current = { free, lidAngle, flip, returning, T };
  const coverX = TURNTABLE_R + 25 + D / 2;
  const coverY = -(T + ISLAND_DROP - 2);

  const isFree = !!free;
  const wasFree = useRef(isFree);
  useLayoutEffect(() => {
    if (wasFree.current === isFree) return;
    wasFree.current = isFree;
    setLid(lidNow.current);
    // Back from free view the laptop moves to the builder's pose rather than jumping.
    if (!isFree) setReturning(true);
  }, [isFree]);

  useFrame((_, dt) => {
    const { free: fr, lidAngle: builderLid, flip: builderFlip, returning: back, T: t } = live.current;
    const s = fr?.state;
    const flipWant = (s ? s.flipped : builderFlip) ? 1 : 0;
    const coverWant = s?.coverOff ? 1 : 0;
    const lidTarget = s && fr ? (s.lidOpen ? fr.openAngle : 0) : builderLid;
    // The lid shuts before the laptop turns over, and the cover is back on before it turns upright.
    const lidWant = flipWant || flipT.current > 0 ? 0 : lidTarget;
    let l = lidNow.current;
    if (!s && !back) {
      // The builder: its own lid and flip, at once.
      l = builderLid;
      lidNow.current = l;
      flipT.current = flipWant;
      coverT.current = 0;
    } else {
      if (l !== lidWant) {
        const step = LID_SPEED * dt;
        l = Math.abs(lidWant - l) <= step ? lidWant : l + Math.sign(lidWant - l) * step;
        lidNow.current = l;
        setLid(l);
      }
      if (flipT.current !== flipWant && l === 0 && coverT.current === 0) {
        const step = dt / FLIP_S;
        flipT.current = clamp(flipT.current + Math.sign(flipWant - flipT.current) * step, 0, 1);
      }
      if (coverT.current !== coverWant && flipT.current === 1) {
        const step = dt / COVER_S;
        coverT.current = clamp(coverT.current + Math.sign(coverWant - coverT.current) * step, 0, 1);
      }
    }
    const nowOpen = coverT.current > 0;
    if (nowOpen !== open) setOpen(nowOpen);

    const f = flipT.current;
    const g = flipG.current;
    if (g) {
      // Turned about its middle and lifted clear of the turntable on the way.
      g.position.set(0, PLINTH_H + t / 2 + (D / 2 + 30) * Math.sin(Math.PI * f), 0);
      g.rotation.set(Math.PI * easeInOut(f), 0, 0);
    }
    const c = coverT.current;
    const cg = coverG.current;
    if (cg) {
      const e = easeInOut(c);
      cg.position.set(coverX * e, PLINTH_H + t / 2 + coverY * e + COVER_LIFT * Math.sin(Math.PI * c), 0);
      cg.rotation.y = (Math.PI / 2) * e;
    }

    const still = l === lidWant && f === flipWant && c === coverWant;
    if (back && still) {
      live.current.returning = false;
      setReturning(false);
    }
    if (!s?.busy) reported.current = false;
    else if (still && !reported.current) {
      reported.current = true;
      fr?.onSettled();
    }
  }, -1);

  const useAt = useCallback(
    (aspect: number): Pose => {
      const a = lidNow.current;
      const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
      const r = panel ? out.y - (panel.at.y + panel.size.y / 2) : out.y / 2;
      const p = lidPoint(fit, r, a);
      const rad = (a * Math.PI) / 180;
      // Leaning in: close enough that the screen, by width or height, fills most of the view.
      const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
      const sw = panel?.size.x ?? out.x;
      const sh = panel?.size.y ?? out.y * 0.8;
      const d = Math.max(sw / (2 * tanV * aspect), sh / (2 * tanV)) / USE_FILL;
      return {
        eye: new THREE.Vector3(0, p.y - Math.cos(rad) * d, p.z + Math.sin(rad) * d),
        at: new THREE.Vector3(0, p.y, p.z),
      };
    },
    [fit, out],
  );

  const driven = isFree || returning;
  const shownLid = driven ? lid : lidAngle;
  const page = free && !free.state.flipped && shownLid > 40 ? free.page : undefined;
  const props: Omit<ModelProps, "fit" | "lidAngle"> = free
    ? {
        year: model.year,
        colours: model.colours,
        surfaces: model.surfaces,
        lockScreen: model.lockScreen,
        decor: model.decor,
        xray: false,
        labelFor: noLabel,
        onHover: noHover,
        problems: false,
      }
    : model;
  return (
    <>
      {/* Placed every frame, above: props here would undo a turn in progress on each render. */}
      <group ref={flipG}>
        <group position={[0, -T / 2, 0]}>
          <group ref={laptop}>
            <Model {...props} fit={fit} lidAngle={shownLid} floorless={open} screen={page} portal={portal} />
          </group>
        </group>
      </group>
      {open && (
        <group ref={coverG} position={[0, PLINTH_H + T / 2, 0]}>
          <group rotation-x={Math.PI}>
            <group position={[0, -T / 2, 0]}>
              <BottomCover fit={fit} colour={model.colours.floor} surface={model.surfaces?.floor} />
            </group>
          </group>
        </group>
      )}
      {free && (
        <Walker
          laptop={laptop}
          active={!free.state.paused && !free.state.full}
          using={free.state.using}
          useAt={useAt}
          onAim={free.onAim}
          atDoor={free.atDoor}
          onDoor={free.onDoor}
          stance={free.stance}
          shelves={free.shelves}
          onShelf={free.onShelf}
        />
      )}
    </>
  );
}


// ------------------------------------------------------------------ over the canvas

/** Pointer lock, the aim dot and prompts, the keys, and the pause menu. */
export function FreeOverlay({
  state,
  set,
  canUse,
  page,
  onExit,
  onMap,
  sound,
  onSound,
  archive,
}: {
  state: FreeState;
  set: Dispatch<SetStateAction<FreeState | null>>;
  /** The archive's keys: a shelved laptop onto the turntable, the turntable's back, the next shelf load. */
  archive?: { take: (id: string) => void; putAway?: () => void; more?: () => void };
  /** The laptop runs: it can be used. */
  canUse: boolean;
  /** The OS page, for full screen. */
  page?: { node: ReactNode; width: number; height: number };
  /** Back to the builder; absent on a visit from the map. */
  onExit?: () => void;
  onMap?: () => void;
  sound: boolean;
  onSound: (on: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const expectUnlock = useRef(false);
  const pausedAt = useRef(0);
  const patch = useCallback((p: Partial<FreeState>) => set((s) => (s ? { ...s, ...p } : s)), [set]);

  const pause = useCallback(() => {
    pausedAt.current = performance.now();
    patch({ paused: true });
  }, [patch]);

  const lock = useCallback(() => {
    const el = root.current;
    if (!el) return;
    Promise.resolve(el.requestPointerLock()).catch(pause);
  }, [pause]);

  const unlock = useCallback(() => {
    if (!document.pointerLockElement) return;
    expectUnlock.current = true;
    document.exitPointerLock();
  }, []);

  useEffect(() => {
    lock();
    const change = () => {
      if (document.pointerLockElement === root.current) return;
      if (expectUnlock.current) {
        expectUnlock.current = false;
        return;
      }
      pause();
    };
    document.addEventListener("pointerlockchange", change);
    document.addEventListener("pointerlockerror", pause);
    return () => {
      document.removeEventListener("pointerlockchange", change);
      document.removeEventListener("pointerlockerror", pause);
      expectUnlock.current = true;
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [lock, pause]);

  const resume = useCallback(() => {
    patch({ paused: false });
    if (!state.using && !state.full) lock();
  }, [patch, lock, state.using, state.full]);

  const live = useRef({ state, canUse, resume, archive, onMap });
  live.current = { state, canUse, resume, archive, onMap };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { state: s, canUse: runs, resume: back, archive: shelves, onMap: leave } = live.current;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) back();
        } else if (s.using || s.full) pause();
        return;
      }
      if (e.repeat || s.paused || s.busy || typing(e)) return;
      if (e.code === "KeyF") {
        if (s.full) {
          patch({ full: false });
          if (!s.using) {
            blurField();
            lock();
          }
        } else if (runs && (s.using || (s.aim && !s.flipped && s.lidOpen))) {
          unlock();
          patch({ full: true });
        }
        return;
      }
      if (s.full) return;
      if (e.code === "KeyE" && s.using) {
        patch({ using: false });
        blurField();
        lock();
        return;
      }
      if (s.door && !s.using) {
        if (e.code === "KeyE") leave?.();
        return;
      }
      if (s.shelf && shelves && !s.using) {
        if (e.code === "KeyE") shelves.take(s.shelf);
        else if (e.code === "KeyN") shelves.more?.();
        return;
      }
      if (!s.aim || s.using) return;
      if (e.code === "KeyP" && shelves?.putAway) shelves.putAway();
      else if (e.code === "KeyE" && !s.flipped && s.lidOpen && runs) {
        unlock();
        patch({ using: true });
      } else if (e.code === "KeyR" && !s.coverOff) {
        patch({ flipped: !s.flipped, lidOpen: s.flipped ? s.lidOpen : false, busy: true });
      } else if (e.code === "KeyO" && s.flipped) {
        patch({ coverOff: !s.coverOff, busy: true });
      } else if (e.code === "KeyL" && !s.flipped) {
        patch({ lidOpen: !s.lidOpen, busy: true });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [lock, unlock, pause, patch]);

  const active = !state.paused && !state.full;
  const screen = { key: "F", label: "Full screen" };
  let prompts: Prompt[] = [];
  if (active && state.using) prompts = [{ key: "E", label: "Stop using" }, screen];
  else if (active && state.door && onMap) prompts.push({ key: "E", label: "Leave" });
  else if (active && state.shelf && archive && !state.busy) {
    prompts.push({ key: "E", label: "Put on turntable" });
    if (archive.more) prompts.push({ key: "N", label: "Next shelf" });
  } else if (active && state.aim && !state.busy) {
    if (!state.flipped) {
      if (state.lidOpen && canUse) prompts.push({ key: "E", label: "Use" }, screen);
      prompts.push({ key: "L", label: state.lidOpen ? "Shut lid" : "Open lid" });
      prompts.push({ key: "R", label: "Turn over" });
    } else {
      prompts.push({ key: "O", label: state.coverOff ? "Cover on" : "Cover off" });
      if (!state.coverOff) prompts.push({ key: "R", label: "Turn upright" });
    }
    if (archive?.putAway) prompts.push({ key: "P", label: "Put away" });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="bd-free-root"
      // In use, the pointer belongs to the laptop's screen underneath.
      style={{ pointerEvents: state.using && !state.full && !state.paused ? "none" : "auto" }}
      onMouseDown={() => {
        if (!active || state.using) return;
        if (!document.pointerLockElement) lock();
      }}
    >
      {state.full && page && (
        <div className={`cafe-world${state.paused ? " paused" : ""}`}>
          <FullPage page={page} />
        </div>
      )}
      {active && (
        <>
          {!state.using && <i className="cafe-dot" />}
          <Prompts list={prompts} using={state.using} />
        </>
      )}
      {state.paused && (
        <div className="fd fd-over">
          <div className="fd-scrim" />
          {/* Escape resumes through the key handler above. */}
          <Column>
            <div className="fd-entries">
              <Entry onClick={resume} autoFocus>
                Resume
              </Entry>
              <Entry valued sub={sound ? "On" : "Off"} onClick={() => onSound(!sound)}>
                Sound
              </Entry>
              {onExit && <Entry onClick={onExit}>Leave free view</Entry>}
              {onMap && <Entry onClick={onMap}>Map</Entry>}
            </div>
          </Column>
        </div>
      )}
      {/* The builder's Free view button, pressed: while the pointer is free, it leaves. */}
      {onExit && (state.paused || (state.using && !state.full)) && (
        <button type="button" className="fd-text bd-free on" onClick={onExit}>
          Free view
        </button>
      )}
    </div>
  );
}
