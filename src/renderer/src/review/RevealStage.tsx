import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type Build, colourHex, decorOf, type Fit } from "../engine";
import { Atmosphere, PLINTH_H, PLINTH_R } from "../foundry/Stage";
import { Model, Reflections, surfacesOf } from "../viewer/Scene";
import { token } from "../viewer/theme";

// The review's stage: the Foundry plinth in the dark warm room, with the
// reviewed laptop on it. The reveal plays here (lid shut, lid lifting, the
// score landing) and the article is read here on the laptop's own screen.
// Units are mm.

export type Beat = "published" | "open" | "score" | "read";

/** How the score sets the light. */
export type Tone = "great" | "good" | "poor";

const LID_OPEN = 105;
const LID_MS = 900;
const FOV = 30;
const HALF = Math.tan((FOV / 2) * (Math.PI / 180));

interface View {
  /** Camera angle round the laptop, radians; 0 is straight in front. */
  az: number;
  /** Camera height angle, radians. */
  el: number;
  dist: number;
  target: THREE.Vector3;
  /** How far right the laptop sits, as a fraction of the view width. */
  shift: number;
}

interface Geometry {
  out: { x: number; y: number; z: number };
  /** Centre of the screen with the lid open, in the world. */
  screen: THREE.Vector3;
  /** Screen width and height, mm. */
  sw: number;
  sh: number;
}

function geometryOf(fit: Fit): Geometry {
  const out = fit.shell.outer;
  const hinge = fit.anchors.find((a) => a.kind === "hinge");
  const hy = hinge?.kind === "hinge" ? hinge.from.y : out.y;
  const hz = hinge?.kind === "hinge" ? hinge.from.z : fit.shell.lid.at.z;
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const lid = fit.shell.lid.size.y;
  // Distance from the hinge to the panel's centre along the lid.
  const along = panel ? hy - (panel.at.y + panel.size.y / 2) : lid / 2;
  const th = (LID_OPEN * Math.PI) / 180;
  return {
    out,
    screen: new THREE.Vector3(0, PLINTH_H + hz + along * Math.sin(th), out.y / 2 - hy + along * Math.cos(th)),
    sw: panel?.size.x ?? out.x * 0.9,
    sh: panel?.size.y ?? lid * 0.85,
  };
}

/** The screen faces up by this much with the lid at LID_OPEN. */
const SCREEN_EL = ((LID_OPEN - 90) * Math.PI) / 180;

/** Distance at which `size` mm fills `share` of the view's height. */
const fill = (size: number, share: number) => size / (share * 2 * HALF);

function viewOf(beat: Beat, g: Geometry, aspect: number): View {
  if (beat === "published")
    return {
      az: 0.7,
      el: 0.42,
      dist: Math.max(760, g.out.x * 2.6),
      target: new THREE.Vector3(0, PLINTH_H + g.out.z + 30, 0),
      shift: 0.2,
    };
  if (beat === "open") {
    const top = g.screen.y + g.sh / 2;
    const target = new THREE.Vector3(0, (PLINTH_H + top) / 2, g.screen.z / 2);
    return {
      az: 0,
      el: 0.3,
      dist: Math.max(fill(top - PLINTH_H, 0.66), fill(g.out.x / aspect, 0.66)),
      target,
      shift: 0,
    };
  }
  if (beat === "score")
    return { az: 0, el: SCREEN_EL + 0.04, dist: fill(g.sh, 0.54), target: g.screen.clone(), shift: 0.2 };
  return {
    az: 0,
    el: SCREEN_EL + 0.06,
    dist: Math.max(fill(g.sh, 0.66), fill(g.sw / aspect, 0.84)),
    target: g.screen.clone(),
    shift: 0,
  };
}

const MS: Record<Beat, number> = { published: 0, open: 1200, score: 1200, read: 1000 };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Eases the camera between the beats' views; lets go once the article is up. */
function Rig({
  beat,
  g,
  onFree,
  overlay,
}: {
  beat: Beat;
  g: Geometry;
  onFree: () => void;
  /** The on-screen page's layer; the view offset moves the scene, so it must move too. */
  overlay: RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const clock = useRef(0);
  const last = useRef<Beat | null>(null);
  const from = useRef<View | null>(null);
  const now = useRef<View | null>(null);
  const at = useRef(0);
  const freed = useRef(false);
  useFrame((_, dt) => {
    if (freed.current) return;
    clock.current += dt;
    const target = viewOf(beat, g, size.width / size.height);
    if (last.current !== beat) {
      from.current = now.current ?? target;
      at.current = clock.current;
      last.current = beat;
    }
    const ms = MS[beat];
    const t = ms ? Math.min(1, ((clock.current - at.current) * 1000) / ms) : 1;
    const k = easeInOut(t);
    const f = from.current ?? target;
    const v: View = {
      az: f.az + (target.az - f.az) * k,
      el: f.el + (target.el - f.el) * k,
      dist: f.dist + (target.dist - f.dist) * k,
      target: f.target.clone().lerp(target.target, k),
      shift: f.shift + (target.shift - f.shift) * k,
    };
    now.current = v;
    camera.position.set(
      v.target.x + Math.sin(v.az) * Math.cos(v.el) * v.dist,
      v.target.y + Math.sin(v.el) * v.dist,
      v.target.z + Math.cos(v.az) * Math.cos(v.el) * v.dist,
    );
    camera.lookAt(v.target);
    // A wider frustum cut from its left edge puts the laptop right of centre.
    if (v.shift > 0.001) {
      const s = v.shift * size.width;
      camera.aspect = (size.width + 2 * s) / size.height;
      camera.setViewOffset(size.width + 2 * s, size.height, 0, 0, size.width, size.height);
    } else {
      camera.aspect = size.width / size.height;
      camera.clearViewOffset();
    }
    // Html in transform mode projects about the viewport centre and ignores the
    // view offset, so the page layer shifts right by the same amount as the scene.
    if (overlay.current) overlay.current.style.transform = v.shift > 0.001 ? `translateX(${v.shift * size.width}px)` : "";
    camera.updateProjectionMatrix();
    if (beat === "read" && t >= 1) {
      freed.current = true;
      onFree();
    }
  });
  return null;
}

/** The Foundry lights, with the fill dimmed for a poor score and the screen's warm spill. */
function Lights({ beat, tone, g }: { beat: Beat; tone: Tone; g: Geometry }) {
  const spot = useRef<THREE.SpotLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const glow = useRef<THREE.PointLight>(null);
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
  const landed = beat === "score";
  const dim = landed && tone === "poor" ? 0.4 : 1;
  const warm = beat === "published" ? 0 : landed ? (tone === "great" ? 1.6 : tone === "poor" ? 0.2 : 0.55) : 0.45;
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt / 0.35);
    if (hemi.current) hemi.current.intensity += (15 * dim - hemi.current.intensity) * k;
    if (key.current) key.current.intensity += (2 * (0.6 + 0.4 * dim) - key.current.intensity) * k;
    if (glow.current) glow.current.intensity += (warm - glow.current.intensity) * k;
  });
  const lamp = g.screen.clone().add(new THREE.Vector3(0, Math.sin(SCREEN_EL), Math.cos(SCREEN_EL)).multiplyScalar(g.sh * 0.6));
  return (
    <>
      <hemisphereLight ref={hemi} args={[token("stage-fill-sky"), token("stage-fill-ground"), 15]} />
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
      <pointLight ref={glow} position={lamp} color={token("screen-glow")} intensity={0} decay={0} distance={0} />
    </>
  );
}

/** The lid's angle, eased open when the beat leaves "published". */
function useLid(open: boolean): number {
  const [angle, setAngle] = useState(open ? LID_OPEN : 0);
  // Opened from the start (a review already revealed): no lift.
  const openAtStart = useRef(open);
  useEffect(() => {
    if (!open || openAtStart.current) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / LID_MS);
      setAngle(LID_OPEN * easeInOut(k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  return angle;
}

/** Keeps every mesh casting shadows and switches the keyboard backlight. */
function Backlight({ group, on }: { group: RefObject<THREE.Group | null>; on: boolean }) {
  useFrame(() => {
    group.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      if (mesh.name.startsWith("glow")) mesh.visible = on;
    });
  });
  return null;
}

const noLabel = () => "";
const noHover = () => {};

export function RevealStage({
  build,
  fit,
  beat,
  tone,
  screen,
}: {
  build: Build;
  fit: Fit;
  beat: Beat;
  tone: Tone;
  /** The page on the laptop's screen; absent while the screen is off. */
  screen?: { node: ReactNode; width: number; mm: { x: number; y: number } };
}) {
  const g = useMemo(() => geometryOf(fit), [fit]);
  const overlay = useRef<HTMLDivElement | null>(null);
  const laptop = useRef<THREE.Group>(null);
  const [free, setFree] = useState(false);
  const angle = useLid(beat !== "published");
  const floor = useMemo(() => new THREE.Color(token("ground")).multiplyScalar(3), []);
  const colours = useMemo(
    () => ({
      floor: colourHex(build.finish.floor.colour),
      deck: colourHex(build.finish.deck.colour),
      lid: colourHex(build.finish.lid.colour),
    }),
    [build],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  const decor = useMemo(() => decorOf(build), [build]);
  const backlit = beat === "read" || (beat === "score" && tone === "great");
  return (
    <div className="fd-stage">
      <Canvas flat shadows dpr={[1, 2]} camera={{ fov: FOV, near: 10, far: 6000, position: [0, 500, 800] }}>
        <Atmosphere />
        <Reflections intensity={0.12} />
        <Lights beat={beat} tone={tone} g={g} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[20000, 20000]} />
          <meshStandardMaterial color={floor} roughness={1} />
        </mesh>
        <mesh position={[0, PLINTH_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[PLINTH_R, PLINTH_R, PLINTH_H, 96]} />
          <meshStandardMaterial color={token("stage-plinth")} roughness={0.55} metalness={0.3} />
        </mesh>
        <group ref={laptop} position={[0, PLINTH_H, 0]}>
          <Model
            fit={fit}
            year={build.year}
            lidAngle={angle}
            colours={colours}
            decor={decor}
            surfaces={surfaces}
            xray={false}
            labelFor={noLabel}
            onHover={noHover}
            screen={screen}
            portal={overlay}
          />
        </group>
        <Backlight group={laptop} on={backlit} />
        <Rig beat={beat} g={g} onFree={() => setFree(true)} overlay={overlay} />
        {free && <OrbitControls makeDefault target={g.screen} minDistance={120} maxDistance={2500} />}
      </Canvas>
      {/* The on-screen page mounts here, over the canvas. */}
      <div ref={overlay} className="rv-overlay" />
    </div>
  );
}
