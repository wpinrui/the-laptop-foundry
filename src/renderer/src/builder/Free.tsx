import { useFrame, useThree } from "@react-three/fiber";
import {
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
import { blurField, type Prompt, Prompts, typing } from "../cafe/Cafe";
import { clamp, collideIn, easeOut, FOV_MIN, lookAngles, type Rect, ZOOM_STEP } from "../cafe/World";
import type { Decor, Fit, Subject } from "../engine";
import { Column, Entry } from "../foundry/Menus";
import { PLINTH_H } from "../foundry/Stage";
import { BottomCover, Model, type Surfaces } from "../viewer/Scene";
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
/** Where the player first stands: in front of the island, a little to the right. */
const START: [number, number, number] = [900, EYE, 1700];
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
  // The left wall's desk and shelves.
  { x0: -9000, x1: -6400, z0: -2950, z1: 3600 },
  // The right wall's shelves.
  { x0: 8000, x1: 9000, z0: -2950, z1: 2200 },
  // The sink counter and the finish cabinet along the front wall.
  { x0: -3220, x1: -1680, z0: 5860, z1: 6500 },
  { x0: 4400, x1: 8800, z0: 6100, z1: 6500 },
];
/** Degrees a second the lid turns. */
const LID_SPEED = 200;
/** Seconds to turn the laptop over, and to lift the cover off. */
const FLIP_S = 0.9;
const COVER_S = 0.9;
/** How high the cover is lifted on its way to the island. */
const COVER_LIFT = 150;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const noLabel = () => "";
const noHover = () => {};

export interface FreeState {
  flipped: boolean;
  coverOff: boolean;
  lidOpen: boolean;
  using: boolean;
  paused: boolean;
  /** The aim dot is on the laptop. */
  aim: boolean;
  /** The laptop is moving to a new pose: no keys until it settles. */
  busy: boolean;
}

export const freeStart = (lidOpen: boolean): FreeState => ({
  flipped: false,
  coverOff: false,
  lidOpen,
  using: false,
  paused: false,
  aim: false,
  busy: false,
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
  const os = useLaptopOs({ subject, library, sound, onSound, startPlugged: true });
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
  return <>{os.shoot}</>;
}

// ------------------------------------------------------------------ in the canvas

interface Pose {
  eye: THREE.Vector3;
  at: THREE.Vector3;
}

function Walker({
  laptop,
  active,
  using,
  useAt,
  onAim,
}: {
  laptop: RefObject<THREE.Group | null>;
  active: boolean;
  using: boolean;
  /** Where the player stands to use the laptop, and what they look at. */
  useAt: () => Pose;
  onAim: (on: boolean) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const pos = useRef(new THREE.Vector3(...START));
  const look = useRef(lookAngles(pos.current, new THREE.Vector3(0, PLINTH_H + 60, 0)));
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

  useEffect(() => {
    camera.clearViewOffset();
    camera.fov = FOV;
    camera.updateProjectionMatrix();
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
    if (wasUsing.current !== using) {
      wasUsing.current = using;
      let to: THREE.Vector3;
      let toLook: { yaw: number; pitch: number };
      if (using) {
        before.current = { pos: pos.current.clone(), look: { ...look.current } };
        const p = useAt();
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
    } else if (active && !using) {
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
    if (Math.abs(camera.fov - fov.current) > 0.01) {
      camera.fov += (fov.current - camera.fov) * Math.min(1, dt * 12);
      if (Math.abs(camera.fov - fov.current) <= 0.01) camera.fov = fov.current;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(pos.current);
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");

    // Whether the aim dot is on the laptop: its bounds are cheap to hit and forgiving to aim at.
    let on = false;
    const lap = laptop.current;
    if (lap && !using) {
      if (clock.current - bounds.current.at > 0.5) {
        bounds.current = { box: new THREE.Box3().setFromObject(lap), at: clock.current };
      }
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = new THREE.Vector3();
      on = !!ray.ray.intersectBox(bounds.current.box, hit) && hit.distanceTo(ray.ray.origin) < REACH;
    }
    if (on !== aimed.current) {
      aimed.current = on;
      onAim(on);
    }
    // Before the default frame hooks, so the screen's Html follows this frame's camera.
  }, -1);
  return null;
}

type ScreenPage = { node: ReactNode; width: number; mm: { x: number; y: number } };

export function FreeWorld({
  fit,
  year,
  colours,
  surfaces,
  decor,
  lockScreen,
  state,
  openAngle,
  lidStart,
  page,
  portal,
  onAim,
  onSettled,
}: {
  fit: Fit;
  year: number;
  colours: { floor: string; deck: string; lid: string };
  surfaces: Surfaces;
  decor?: Decor;
  lockScreen?: THREE.Texture;
  state: FreeState;
  /** How far the lid opens, degrees. */
  openAngle: number;
  lidStart: number;
  page?: ScreenPage;
  portal: RefObject<HTMLDivElement | null>;
  onAim: (on: boolean) => void;
  onSettled: () => void;
}) {
  const out = fit.shell.outer;
  const T = out.z + fit.lidZ;
  const D = out.y;
  const [lid, setLid] = useState(lidStart);
  const [open, setOpen] = useState(false);
  const lidNow = useRef(lidStart);
  const flipT = useRef(0);
  const coverT = useRef(0);
  const reported = useRef(false);
  const flipG = useRef<THREE.Group>(null);
  const coverG = useRef<THREE.Group>(null);
  const laptop = useRef<THREE.Group>(null);
  const live = useRef({ state, openAngle, onSettled });
  live.current = { state, openAngle, onSettled };
  const coverX = TURNTABLE_R + 25 + D / 2;
  const coverY = -(T + ISLAND_DROP - 2);

  useFrame((_, dt) => {
    const { state: s, openAngle: angle, onSettled: settled } = live.current;
    const lidWant = s.flipped || !s.lidOpen ? 0 : angle;
    let l = lidNow.current;
    if (l !== lidWant) {
      const step = LID_SPEED * dt;
      l = Math.abs(lidWant - l) <= step ? lidWant : l + Math.sign(lidWant - l) * step;
      lidNow.current = l;
      setLid(l);
    }
    const flipWant = s.flipped ? 1 : 0;
    // The lid shuts before the laptop turns over, and the cover is back on before it turns upright.
    if (flipT.current !== flipWant && l === 0 && coverT.current === 0) {
      const step = dt / FLIP_S;
      flipT.current = clamp(flipT.current + Math.sign(flipWant - flipT.current) * step, 0, 1);
    }
    const coverWant = s.coverOff ? 1 : 0;
    if (coverT.current !== coverWant && flipT.current === 1) {
      const step = dt / COVER_S;
      coverT.current = clamp(coverT.current + Math.sign(coverWant - coverT.current) * step, 0, 1);
    }
    const nowOpen = coverT.current > 0;
    if (nowOpen !== open) setOpen(nowOpen);

    const f = flipT.current;
    const g = flipG.current;
    if (g) {
      // Turned about its middle and lifted clear of the turntable on the way.
      g.position.y = PLINTH_H + T / 2 + (D / 2 + 30) * Math.sin(Math.PI * f);
      g.rotation.x = Math.PI * easeInOut(f);
    }
    const c = coverT.current;
    const cg = coverG.current;
    if (cg) {
      const e = easeInOut(c);
      cg.position.set(coverX * e, PLINTH_H + T / 2 + coverY * e + COVER_LIFT * Math.sin(Math.PI * c), 0);
      cg.rotation.y = (Math.PI / 2) * e;
    }

    const still = l === lidWant && f === flipWant && c === coverWant;
    if (!s.busy) reported.current = false;
    else if (still && !reported.current) {
      reported.current = true;
      settled();
    }
  }, -1);

  const useAt = useCallback((): Pose => {
    const a = lidNow.current;
    const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
    const r = panel ? out.y - (panel.at.y + panel.size.y / 2) : out.y / 2;
    const p = lidPoint(fit, r, a);
    const rad = (a * Math.PI) / 180;
    const d = (panel?.size.x ?? out.x) * 1.05;
    return {
      eye: new THREE.Vector3(0, p.y - Math.cos(rad) * d, p.z + Math.sin(rad) * d),
      at: new THREE.Vector3(0, p.y, p.z),
    };
  }, [fit, out]);

  const screenOn = !state.flipped && lid > 40;
  return (
    <>
      <group ref={flipG} position={[0, PLINTH_H + T / 2, 0]}>
        <group position={[0, -T / 2, 0]}>
          <group ref={laptop}>
            <Model
              fit={fit}
              year={year}
              lidAngle={lid}
              colours={colours}
              surfaces={surfaces}
              xray={false}
              labelFor={noLabel}
              onHover={noHover}
              lockScreen={lockScreen}
              decor={decor}
              problems={false}
              floorless={open}
              screen={screenOn ? page : undefined}
              portal={portal}
            />
          </group>
        </group>
      </group>
      {open && (
        <group ref={coverG} position={[0, PLINTH_H + T / 2, 0]}>
          <group rotation-x={Math.PI}>
            <group position={[0, -T / 2, 0]}>
              <BottomCover fit={fit} colour={colours.floor} surface={surfaces.floor} />
            </group>
          </group>
        </group>
      )}
      <Walker laptop={laptop} active={!state.paused} using={state.using} useAt={useAt} onAim={onAim} />
    </>
  );
}

// ------------------------------------------------------------------ over the canvas

/** Pointer lock, the aim dot and prompts, the keys, and the pause menu. */
export function FreeOverlay({
  state,
  set,
  canUse,
  onExit,
  sound,
  onSound,
}: {
  state: FreeState;
  set: Dispatch<SetStateAction<FreeState | null>>;
  /** The laptop runs: it can be used. */
  canUse: boolean;
  onExit: () => void;
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
    if (!state.using) lock();
  }, [patch, lock, state.using]);

  const live = useRef({ state, canUse, resume });
  live.current = { state, canUse, resume };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { state: s, canUse: runs, resume: back } = live.current;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) back();
        } else if (s.using) pause();
        return;
      }
      if (e.repeat || s.paused || s.busy || typing(e)) return;
      if (e.code === "KeyE" && s.using) {
        patch({ using: false });
        blurField();
        lock();
        return;
      }
      if (!s.aim || s.using) return;
      if (e.code === "KeyE" && !s.flipped && s.lidOpen && runs) {
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

  const active = !state.paused;
  let prompts: Prompt[] = [];
  if (active && state.using) prompts = [{ key: "E", label: "Stop using" }];
  else if (active && state.aim && !state.busy) {
    if (!state.flipped) {
      if (state.lidOpen && canUse) prompts.push({ key: "E", label: "Use" });
      prompts.push({ key: "L", label: state.lidOpen ? "Shut lid" : "Open lid" });
      prompts.push({ key: "R", label: "Turn over" });
    } else {
      prompts.push({ key: "O", label: state.coverOff ? "Cover on" : "Cover off" });
      if (!state.coverOff) prompts.push({ key: "R", label: "Turn upright" });
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="bd-free-root"
      // In use, the pointer belongs to the laptop's screen underneath.
      style={{ pointerEvents: state.using && !state.paused ? "none" : "auto" }}
      onMouseDown={() => {
        if (!active || state.using) return;
        if (!document.pointerLockElement) lock();
      }}
    >
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
              <Entry onClick={onExit}>Leave free view</Entry>
            </div>
          </Column>
        </div>
      )}
      {/* The builder's Free view button, pressed: while the pointer is free, it leaves. */}
      {(state.paused || state.using) && (
        <button type="button" className="fd-text bd-free on" onClick={onExit}>
          Free view
        </button>
      )}
    </div>
  );
}
