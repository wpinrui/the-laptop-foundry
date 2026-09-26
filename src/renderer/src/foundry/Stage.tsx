import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Build, CONTENT, type Fit, SAMPLES, solve } from "../engine";
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

const PLINTH_R = 270;
const PLINTH_H = 50;
const ELEVATION = 0.42;
const TARGET_Y = PLINTH_H + 85;
const EASE_MS = 600;
const FADE_S = 0.3;
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

function lockTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = token("ground");
    g.fillRect(0, 0, 512, 320);
    const warm = g.createRadialGradient(170, 70, 0, 170, 70, 420);
    warm.addColorStop(0, token("accent"));
    warm.addColorStop(1, token("ground"));
    g.globalAlpha = 0.22;
    g.fillStyle = warm;
    g.fillRect(0, 0, 512, 320);
    const fall = g.createLinearGradient(0, 0, 0, 320);
    fall.addColorStop(0, token("ground"));
    fall.addColorStop(1, token("ground-deep"));
    g.globalAlpha = 0.5;
    g.fillStyle = fall;
    g.fillRect(0, 0, 512, 320);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const noLabel = () => "";
const noHover = () => {};

/** Fades its meshes in or out, and keeps every mesh casting a shadow. */
function Fader({
  show,
  from,
  onGone,
  children,
}: {
  show: boolean;
  /** Opacity on mount: the first laptop is simply there, later ones fade in. */
  from: number;
  onGone: () => void;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const alpha = useRef(from);
  const applied = useRef(-1);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = show ? 1 : 0;
    const a = alpha.current;
    alpha.current = target > a ? Math.min(1, a + dt / FADE_S) : Math.max(0, a - dt / FADE_S);
    const next = alpha.current;
    const fading = next < 1;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      if (!fading && applied.current === 1) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.userData.baseOpacity === undefined) {
          m.userData.baseOpacity = m.opacity;
          m.userData.baseTransparent = m.transparent;
        }
        const transparent = fading || m.userData.baseTransparent;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = m.userData.baseOpacity * next;
      }
    });
    applied.current = next;
    if (!show && next === 0) onGone();
  });
  return <group ref={group}>{children}</group>;
}

function StagedLaptop({ build, fit, lock }: { build: Build; fit: Fit; lock: THREE.Texture }) {
  const colour = (id: string) => CONTENT.colours.find((c) => c.id === id)?.hex ?? token("slot-plastic");
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

function Lights() {
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
      <hemisphereLight args={[token("stage-fill-sky"), token("stage-fill-ground"), 0.9]} />
      <directionalLight
        ref={key}
        position={[-700, 1200, 800]}
        color={token("stage-key")}
        intensity={1.6}
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
        intensity={2.2}
        angle={0.24}
        penumbra={0.9}
        decay={0}
        distance={0}
      />
      <directionalLight position={[600, 180, -800]} color={token("stage-rim")} intensity={1.8} />
    </>
  );
}

/** The fog and clear colour: the room fades to the ground colour. */
function Atmosphere() {
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
}

export function Stage({ build, stageKey, view }: { build: Build | null; stageKey: string; view: StageView }) {
  const lock = useMemo(() => lockTexture(), []);
  useEffect(() => () => lock.dispose(), [lock]);
  const turntable = useRef<THREE.Group>(null);
  const [slots, setSlots] = useState<Slot[]>(() => [{ key: stageKey, ...stageable(build) }]);
  const first = useRef(stageKey);
  const current = slots[slots.length - 1]?.key;
  // A new model joins the plinth and the others fade out beneath it.
  if (current !== stageKey) {
    first.current = "";
    setSlots((s) => [...s.filter((x) => x.key !== stageKey), { key: stageKey, ...stageable(build) }]);
  }
  return (
    <div className="fd-stage">
      <Canvas
        shadows
        dpr={[1, 2]}
        // The camera stays 700 to 860 mm from the laptop and the fog closes at
        // 3400 mm. A near plane of 10 mm spent the depth buffer's precision on
        // space the camera never sees, and the sub-mm layers in the trackpad
        // and the lid (glass 0.06 mm over the panel) z-fought. Sized to the
        // real range, the depth step at the laptop is about 25 times finer.
        camera={{ fov: 30, near: 250, far: 4000, position: [0, 500, 800] }}
      >
        <Atmosphere />
        <Reflections intensity={0.12} />
        <Lights />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[20000, 20000]} />
          <meshStandardMaterial color={token("ground")} roughness={1} />
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
              from={s.key === first.current ? 1 : 0}
              onGone={() => setSlots((all) => all.filter((x) => x.key !== s.key))}
            >
              <StagedLaptop build={s.build} fit={s.fit} lock={lock} />
            </Fader>
          ))}
        </group>
        <Rig view={view} turntable={turntable} />
      </Canvas>
    </div>
  );
}
