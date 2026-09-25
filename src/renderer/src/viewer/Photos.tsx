import { Canvas, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { type Build, CONTENT, solve } from "../engine";
import { Model, Reflections, surfacesOf } from "./Scene";
import { token } from "./theme";

// Professional shots: the review's product photos, taken automatically in a
// plain studio. The player does not direct angles or lighting. Each pose is a
// fixed camera and lid angle, scaled to the laptop, so the same build always
// gives the same photos. Rendered once on a hidden canvas and cached.

export type Pose = "hero" | "side" | "top" | "closed";
export const POSES: Pose[] = ["hero", "side", "top", "closed"];

export const POSE_CAPTION: Record<Pose, string> = {
  hero: "The test unit",
  side: "Left side",
  top: "Keyboard and touchpad",
  closed: "Closed",
};

interface Shot {
  lid: number;
  position: [number, number, number];
  target: [number, number, number];
}

function shotOf(pose: Pose, k: number): Shot {
  const s = framed(pose, k);
  // Pull back from the target so the whole laptop, lid included, fits the frame.
  const back = 1.45;
  const position = s.position.map((v, i) => s.target[i] + (v - s.target[i]) * back) as Shot["position"];
  return { ...s, position };
}

function framed(pose: Pose, k: number): Shot {
  switch (pose) {
    case "hero":
      return { lid: 110, position: [-300 * k, 230 * k, 470 * k], target: [0, 70 * k, -30 * k] };
    case "side":
      return { lid: 100, position: [-600 * k, 110 * k, 60 * k], target: [0, 95 * k, -50 * k] };
    case "top":
      return { lid: 100, position: [0, 640 * k, 170 * k], target: [0, 0, -30 * k] };
    case "closed":
      return { lid: 0, position: [330 * k, 250 * k, 430 * k], target: [0, 5 * k, 0] };
  }
}

const cache = new Map<string, string[]>();

/** Takes the poses in turn: sets the lid, waits for the frame, grabs the canvas. */
function Shooter({
  poses,
  k,
  setLid,
  onDone,
}: {
  poses: Pose[];
  k: number;
  setLid: (deg: number) => void;
  onDone: (urls: string[]) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const [i, setI] = useState(0);
  const [urls] = useState<string[]>([]);
  useEffect(() => {
    if (i >= poses.length) return;
    const s = shotOf(poses[i], k);
    setLid(s.lid);
    let cancelled = false;
    // Two frames: one for the lid to commit, one for units built in effects.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        camera.position.set(...s.position);
        camera.lookAt(...s.target);
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
        urls.push(gl.domElement.toDataURL("image/jpeg", 0.88));
        if (i + 1 >= poses.length) onDone([...urls]);
        else setI(i + 1);
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [i, poses, k, gl, scene, camera, setLid, onDone, urls]);
  return null;
}

const noLabel = () => "";
const noHover = () => {};

/** A hidden studio canvas that photographs one build and reports the photos. */
function PhotoShoot({
  build,
  poses,
  width,
  height,
  onDone,
}: {
  build: Build;
  poses: Pose[];
  width: number;
  height: number;
  onDone: (urls: string[]) => void;
}) {
  const fit = useMemo(() => solve(build), [build]);
  const [lid, setLid] = useState(shotOf(poses[0], 1).lid);
  const colour = (id: string) => CONTENT.colours.find((c) => c.id === id)?.hex ?? "";
  const colours = useMemo(
    () => ({
      floor: colour(build.finish.floor.colour),
      deck: colour(build.finish.deck.colour),
      lid: colour(build.finish.lid.colour),
    }),
    [build],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  const out = fit.shell.outer;
  const k = Math.max(out.x, out.y * 1.3) / 340;
  return (
    <div
      aria-hidden
      style={{ position: "fixed", left: -10000, top: 0, width, height, pointerEvents: "none" }}
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={1}
        frameloop="demand"
        camera={{ fov: 30, near: 10, far: 6000, position: [0, 300, 600] }}
      >
        <color attach="background" args={[token("studio-bg")]} />
        <Reflections />
        <hemisphereLight args={[token("color-text"), token("studio-floor"), 1.0]} />
        <directionalLight position={[-400, 700, 600]} intensity={1.5} />
        <directionalLight position={[500, 300, 300]} intensity={0.5} />
        <directionalLight position={[0, 400, -700]} intensity={0.6} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]}>
          <planeGeometry args={[6000, 6000]} />
          <meshStandardMaterial color={token("studio-floor")} roughness={0.9} />
        </mesh>
        <Model
          fit={fit}
          year={build.year}
          lidAngle={lid}
          colours={colours}
          labelFor={noLabel}
          onHover={noHover}
          surfaces={surfaces}
          xray={false}
        />
        <Shooter poses={poses} k={k} setLid={setLid} onDone={onDone} />
      </Canvas>
    </div>
  );
}

/**
 * Photos of a build, keyed by `key` (one set per model and build). Returns the
 * photos once taken, and the hidden shoot to render until then.
 */
export function usePhotos(
  key: string | null,
  build: Build | null,
  poses: Pose[] = POSES,
  size: [number, number] = [960, 600],
): { photos: string[] | null; shoot: ReactNode } {
  const full = key && build ? `${key}|${poses.join(",")}|${size.join("x")}|${JSON.stringify(build)}` : null;
  const [, bump] = useState(0);
  const photos = full ? (cache.get(full) ?? null) : null;
  const shoot =
    full && build && !photos ? (
      <PhotoShoot
        key={full}
        build={build}
        poses={poses}
        width={size[0]}
        height={size[1]}
        onDone={(urls) => {
          cache.set(full, urls);
          bump((n) => n + 1);
        }}
      />
    ) : null;
  return { photos, shoot };
}
