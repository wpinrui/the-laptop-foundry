import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Build, CONTENT, colourHex, decorOf, type Fit, SAMPLES, solve } from "../engine";
import { legacyLockTexture } from "../os/legacy";
import { LOOKS } from "../os/Os";
import { eraOf, ownerOf } from "../os/types";
import { useOsStill } from "../os/useOsScreen";
import { Model, Reflections, surfacesOf } from "../viewer/Scene";
import { token } from "../viewer/theme";

// The menu stage: one laptop on a bronze plinth in a dark warm room. It stays
// mounted across the menu screens; the camera eases between their angles and
// the laptop cross-fades when the shown model changes. Units are mm.

export type StageMode = "orbit" | "sway";

export interface StageView {
  /** Camera angle round the plinth, in radians. */
  azimuth: number;
  /** Camera distance from the laptop, in mm. */
  distance: number;
  /** How far right the laptop sits, as a fraction of the view width. */
  shift: number;
  mode: StageMode;
}

export const PLINTH_R = 270;
export const PLINTH_H = 50;
const ELEVATION = 0.42;
const TARGET_Y = PLINTH_H + 85;
const EASE_MS = 600;
const ORBIT_SPEED = 0.07;
const SWAY = 0.55;
const SWAY_W = 0.12 / SWAY;
/** The front three-quarter view the list sways about. */
const FRONT_3Q = -0.5;

/** A graphite stock body, shown before the company has any models. */
function stockBuild(): Build {
  const b = structuredClone(
    (SAMPLES.find((s) => s.id === "ultrabook-14") ?? SAMPLES[0]).build,
  );
  const graphite = CONTENT.colours.find((c) => c.id === "graphite")?.id ?? b.finish.lid.colour;
  for (const p of ["floor", "deck", "lid"] as const) b.finish[p].colour = graphite;
  return b;
}

let stock: Build | null = null;

/** The build to stage, or the stock body when it cannot be drawn. */
function stageable(build: Build | null): { build: Build; fit: Fit } {
  if (build)
    try {
      return { build, fit: solve(build) };
    } catch {}
  stock ??= stockBuild();
  return { build: stock, fit: solve(stock) };
}

const noLabel = () => "";
const noHover = () => {};

/** Shows or hides its laptop, and keeps every mesh casting a shadow. */
function Fader({
  show,
  onGone,
  children,
}: {
  show: boolean;
  onGone: () => void;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
    });
    // The laptop's materials are shared, so fading them fights the model's own
    // material state and flickers the shell. Swap instantly instead.
    g.visible = show;
    if (!show) onGone();
  });
  return <group ref={group}>{children}</group>;
}

/** The staged laptop's lock screen: its own era's OS, its company as the user. */
function useLock(build: Build, fit: Fit, maker: string, model: string) {
  const owner = useMemo(() => ownerOf(build, maker), [build, maker]);
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const aspect = panel ? panel.size.x / Math.max(1, panel.size.y) : 1.6;
  // Eras whose OS has not landed yet keep the lock screen they had.
  const legacy = !LOOKS.includes(eraOf(build.year));
  const still = useOsStill("lock", legacy ? null : build, owner, `${maker} ${model}`.trim(), aspect);
  const old = useMemo(() => (legacy ? legacyLockTexture() : undefined), [legacy]);
  useEffect(() => () => old?.dispose(), [old]);
  return legacy ? old : still;
}

function StagedLaptop({ build, fit, maker, model }: { build: Build; fit: Fit; maker: string; model: string }) {
  const lock = useLock(build, fit, maker, model);
  const colour = (id: string) => colourHex(id);
  const colours = useMemo(
    () => ({
      floor: colour(build.finish.floor.colour),
      deck: colour(build.finish.deck.colour),
      lid: colour(build.finish.lid.colour),
    }),
    [build],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  return (
    <Model
      fit={fit}
      year={build.year}
      lidAngle={112}
      colours={colours}
      decor={decorOf(build)}
      surfaces={surfaces}
      xray={false}
      labelFor={noLabel}
      onHover={noHover}
      lockScreen={lock}
    />
  );
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Eases the camera between screen views and turns the laptop per the mode. */
function Rig({ view, turntable }: { view: StageView; turntable: RefObject<THREE.Group | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const from = useRef({ ...view, at: 0 });
  const now = useRef({ azimuth: view.azimuth, distance: view.distance, shift: view.shift });
  const yaw = useRef(FRONT_3Q);
  const orbit = useRef(FRONT_3Q);
  const clock = useRef(0);
  const last = useRef(view);
  useFrame((_, dt) => {
    clock.current += dt;
    if (last.current !== view) {
      from.current = { ...now.current, mode: view.mode, at: clock.current };
      if (view.mode === "orbit") orbit.current = yaw.current;
      last.current = view;
    }
    const t = Math.min(1, ((clock.current - from.current.at) * 1000) / EASE_MS);
    const k = easeOut(t);
    const f = from.current;
    now.current = {
      azimuth: f.azimuth + wrap(view.azimuth - f.azimuth) * k,
      distance: f.distance + (view.distance - f.distance) * k,
      shift: f.shift + (view.shift - f.shift) * k,
    };
    const { azimuth, distance, shift } = now.current;
    camera.position.set(
      Math.sin(azimuth) * Math.cos(ELEVATION) * distance,
      TARGET_Y + Math.sin(ELEVATION) * distance,
      Math.cos(azimuth) * Math.cos(ELEVATION) * distance,
    );
    camera.lookAt(0, TARGET_Y, 0);
    // A wider frustum cut from its left edge puts the laptop right of centre.
    // The full frustum keeps its own aspect, so the cut is not a zoom.
    const s = shift * size.width;
    camera.aspect = (size.width + 2 * s) / size.height;
    camera.setViewOffset(size.width + 2 * s, size.height, 0, 0, size.width, size.height);
    camera.updateProjectionMatrix();

    orbit.current += ORBIT_SPEED * dt;
    const desired =
      view.mode === "orbit" ? orbit.current : FRONT_3Q + SWAY * Math.sin(clock.current * SWAY_W);
    yaw.current += wrap(desired - yaw.current) * (1 - Math.exp(-dt / 0.2));
    if (turntable.current) turntable.current.rotation.y = yaw.current;
  });
  return null;
}

export function Lights() {
  const spot = useRef<THREE.SpotLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const aim = new THREE.Object3D();
    aim.position.set(0, PLINTH_H, 0);
    scene.add(aim);
    if (spot.current) spot.current.target = aim;
    if (key.current) key.current.target = aim;
    return () => {
      scene.remove(aim);
    };
  }, [scene]);
  return (
    <>
      <hemisphereLight args={[token("stage-fill-sky"), token("stage-fill-ground"), 15]} />
      <directionalLight
        ref={key}
        position={[-700, 1200, 800]}
        color={token("stage-key")}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-500}
        shadow-camera-right={500}
        shadow-camera-top={500}
        shadow-camera-bottom={-500}
        shadow-camera-near={200}
        shadow-camera-far={3500}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      <spotLight
        ref={spot}
        position={[-250, 1500, 350]}
        color={token("stage-key")}
        intensity={1.2}
        angle={0.24}
        penumbra={0.9}
        decay={0}
        distance={0}
      />
      <directionalLight position={[600, 180, -800]} color={token("stage-rim")} intensity={6} />
    </>
  );
}

/** The fog and clear colour: the room fades to the ground colour. */
export function Atmosphere() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const ground = new THREE.Color(token("ground"));
    scene.background = ground;
    scene.fog = new THREE.Fog(ground, 1300, 3400);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene]);
  return null;
}

interface Slot {
  key: string;
  build: Build;
  fit: Fit;
  maker: string;
  model: string;
}

export function Stage({
  build,
  stageKey,
  view,
  maker = "",
  model = "",
}: {
  build: Build | null;
  stageKey: string;
  view: StageView;
  /** The staged laptop's company and model name, for its lock screen. */
  maker?: string;
  model?: string;
}) {
  const turntable = useRef<THREE.Group>(null);
  // The floor is the ground colour lifted to the brightness the mockup shows
  // under the same lights; the fog and background stay exactly --ground.
  const floor = useMemo(() => new THREE.Color(token("ground")).multiplyScalar(3), []);
  const [slots, setSlots] = useState<Slot[]>(() => [{ key: stageKey, ...stageable(build), maker, model }]);
  const current = slots[slots.length - 1]?.key;
  // A new model joins the plinth and replaces the others.
  if (current !== stageKey) {
    setSlots((s) => [...s.filter((x) => x.key !== stageKey), { key: stageKey, ...stageable(build), maker, model }]);
  }
  return (
    <div className="fd-stage">
      {/* Flat: no tone mapping, so the fog and background land exactly on
          --ground. ACES filmic (the r3f default) pulled every dark value down
          toward black. Light levels are fitted to the start menu mockup: the
          floor near the plinth reads about #2a1f19 and a graphite deck in the
          pool about #3e3635. */}
      <Canvas
        flat
        shadows
        dpr={[1, 2]}
        camera={{ fov: 30, near: 10, far: 6000, position: [0, 500, 800] }}
      >
        <Atmosphere />
        <Reflections intensity={0.12} />
        <Lights />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[20000, 20000]} />
          <meshStandardMaterial color={floor} roughness={1} />
        </mesh>
        <mesh position={[0, PLINTH_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[PLINTH_R, PLINTH_R, PLINTH_H, 96]} />
          <meshStandardMaterial color={token("stage-plinth")} roughness={0.55} metalness={0.3} />
        </mesh>
        <group ref={turntable} position={[0, PLINTH_H, 0]}>
          {slots.map((s) => (
            <Fader
              key={s.key}
              show={s.key === stageKey}
              onGone={() => setSlots((all) => all.filter((x) => x.key !== s.key))}
            >
              <StagedLaptop build={s.build} fit={s.fit} maker={s.maker} model={s.model} />
            </Fader>
          ))}
        </group>
        <Rig view={view} turntable={turntable} />
      </Canvas>
    </div>
  );
}
