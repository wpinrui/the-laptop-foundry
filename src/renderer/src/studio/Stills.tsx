import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { SavedModel } from "../../../preload/store";
import { type Build, solve } from "../engine";
import { Lights, StagedLaptop } from "../foundry/Stage";

// Stills of the company's laptops for the studio's pick cards: each one in a
// three-quarter view, lid open, on a clear background the card's own
// backdrop shows through. Taken one at a time on a hidden canvas, kept for the
// session.

const W = 640;
const H = 480;
/** Longest wait for a laptop's lock screen before the still is taken without it, ms. */
const LOCK_WAIT = 1500;

const cache = new Map<string, string>();
const keyOf = (m: SavedModel) => `${m.id}:${m.updated}`;

function Shot({ model, company, onShot }: { model: SavedModel; company: string; onShot: (url: string) => void }) {
  const build = model.build as Build;
  const fit = useMemo(() => {
    try {
      return solve(build);
    } catch {
      return null;
    }
  }, [build]);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const [locked, setLocked] = useState(false);
  const frames = useRef(0);
  const done = useRef(onShot);
  done.current = onShot;
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    const t = setTimeout(() => setLocked(true), LOCK_WAIT);
    return () => clearTimeout(t);
  }, []);
  // Framed from the front left, a little above, the whole laptop with its lid up in view.
  useLayoutEffect(() => {
    if (!fit) return;
    const o = fit.shell.outer;
    const target = new THREE.Vector3(0, o.z + 0.25 * o.y, -0.1 * o.y);
    const dist = (o.x * 1.25) / 2 / Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const az = (-28 * Math.PI) / 180;
    const el = (15 * Math.PI) / 180;
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);
    camera.near = dist / 20;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
  }, [fit, camera]);
  useFrame(() => {
    if (!fit) {
      done.current("");
      return;
    }
    if (!locked) return;
    frames.current++;
    if (frames.current === 3) done.current(gl.domElement.toDataURL("image/png"));
  });
  if (!fit) return null;
  return <StagedLaptop build={build} fit={fit} maker={company} model={model.name} lidAngle={106} unlit onLock={() => setLocked(true)} />;
}

/** Stills of the laptops, by model id, once taken; and the hidden shoot to render until they all are. */
export function useStills(models: SavedModel[], company: string): { stills: Record<string, string>; shoot: ReactNode } {
  const [, bump] = useState(0);
  const stills: Record<string, string> = {};
  for (const m of models) {
    const s = cache.get(keyOf(m));
    // An empty still is a laptop that cannot be drawn: taken, with nothing to show.
    if (s !== undefined) stills[m.id] = s;
  }
  const next = models.find((m) => !cache.has(keyOf(m)));
  const shoot = next ? (
    <div aria-hidden="true" style={{ position: "fixed", left: -W * 2, top: 0, width: W, height: H, pointerEvents: "none" }}>
      <Canvas gl={{ preserveDrawingBuffer: true, alpha: true, toneMapping: THREE.NeutralToneMapping }} dpr={1} camera={{ fov: 30 }}>
        <Lights />
        <Shot
          key={keyOf(next)}
          model={next}
          company={company}
          onShot={(url) => {
            cache.set(keyOf(next), url);
            bump((n) => n + 1);
          }}
        />
      </Canvas>
    </div>
  ) : null;
  return { stills, shoot };
}
