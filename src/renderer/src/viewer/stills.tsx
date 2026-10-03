import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { type Build, solve } from "../engine";
import { StagedLaptop } from "../foundry/Stage";

// Product stills: any laptop, the player's or a rival's, in a catalogue
// three-quarter view, lid open, softly lit on a clear background. Taken one
// at a time on a single hidden canvas of its own React root, which mounts
// while there is work and unmounts when the queue runs dry. Kept for the
// session, by laptop and build, so every screen that shows the same laptop
// shares its still.

/** The still's size, px: 3:2, twice the store's largest product slot. */
export const STILL_W = 960;
export const STILL_H = 640;
const FOV = 30;
/** The camera's angle round the laptop and above it, degrees: front left, a little above. */
const AZIMUTH = -30;
const ELEVATION = 18;
/** How much of the frame the laptop spans on its tighter axis. */
const FILL = 0.9;
/** Longest wait for a laptop's lock screen before the still is taken without it, ms. */
const LOCK_WAIT = 1500;

/** A laptop to photograph. */
export interface StillSubject {
  id: string;
  /** The model's name, without its maker. */
  name: string;
  /** The maker's name as its lock screen shows it. */
  company: string;
  build: Build;
  /** The rival maker's id, for its wallpaper; null or absent for the player's own. */
  maker?: string | null;
}

const cache = new Map<string, string>();
const hashes = new WeakMap<Build, string>();

/** FNV-1a of the build without its price, which does not show in a photo. */
function buildHash(b: Build): string {
  const hit = hashes.get(b);
  if (hit) return hit;
  const s = JSON.stringify({ ...b, price: 0 });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out = (h >>> 0).toString(36);
  hashes.set(b, out);
  return out;
}

const keyOf = (s: StillSubject) => `${s.id}:${s.maker ?? ""}:${s.company}:${s.name}:${buildHash(s.build)}`;

// The queue: every mounted useStills is a request, its laptops in display
// order. The newest request goes first; within it, the first laptop not yet
// taken.
let seq = 0;
const requests = new Map<number, StillSubject[]>();
const listeners = new Set<() => void>();
let busy: string | null = null;
let host: { el: HTMLDivElement; root: Root } | null = null;
let pending = false;

function nextJob(): StillSubject | undefined {
  const all = [...requests.values()].reverse();
  for (const list of all) for (const s of list) if (!cache.has(keyOf(s))) return s;
  return undefined;
}

/** Runs after the current commit: mounts, feeds or unmounts the hidden canvas. */
function schedule() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    pump();
  }, 0);
}

function pump() {
  if (busy) return;
  const job = nextJob();
  if (!job) {
    host?.root.unmount();
    host?.el.remove();
    host = null;
    return;
  }
  const key = keyOf(job);
  busy = key;
  if (!host) {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", left: `${-STILL_W * 2}px`, top: "0", width: `${STILL_W}px`, height: `${STILL_H}px`, pointerEvents: "none" });
    document.body.appendChild(el);
    host = { el, root: createRoot(el) };
  }
  host.root.render(
    <Canvas gl={{ preserveDrawingBuffer: true, alpha: true, toneMapping: THREE.NeutralToneMapping }} dpr={1} camera={{ fov: FOV }}>
      <StudioLights />
      <Shot
        key={key}
        subject={job}
        onShot={(url) => {
          cache.set(key, url);
          busy = null;
          for (const l of listeners) l();
          schedule();
        }}
      />
    </Canvas>,
  );
}

/** Soft, neutral product lighting: a big key from the front left, a fill, a rim, and a room to reflect. */
function StudioLights() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <hemisphereLight args={["#ffffff", "#8c8c8c", 1.1]} />
      <directionalLight position={[-700, 1100, 900]} intensity={2} />
      <directionalLight position={[800, 300, 600]} intensity={0.7} />
      <directionalLight position={[300, 600, -900]} intensity={1} />
    </>
  );
}

const box = new THREE.Box3();
const part = new THREE.Box3();
const corner = new THREE.Vector3();

/** The visible meshes' bounds in world space. */
function boundsOf(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  box.makeEmpty();
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const inst = m as unknown as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      if (!inst.boundingBox) inst.computeBoundingBox();
      if (inst.boundingBox) part.copy(inst.boundingBox).applyMatrix4(m.matrixWorld);
    } else {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      if (!m.geometry.boundingBox) return;
      part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    }
    box.union(part);
  });
  return box;
}

/** Aims the camera from the catalogue angle so the bounds fill FILL of the frame, centred. */
function frame(camera: THREE.PerspectiveCamera, b: THREE.Box3) {
  if (b.isEmpty()) return;
  const az = (AZIMUTH * Math.PI) / 180;
  const el = (ELEVATION * Math.PI) / 180;
  const back = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
  const tanH = tanV * (STILL_W / STILL_H);
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++)
    corners.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  const target = b.getCenter(new THREE.Vector3());
  let dist = 0;
  // Fit the distance and centre the laptop's projection, twice, then fit once more.
  for (let pass = 0; pass < 3; pass++) {
    dist = 0;
    for (const p of corners) {
      corner.subVectors(p, target);
      const x = Math.abs(corner.dot(right));
      const y = Math.abs(corner.dot(up));
      const z = corner.dot(back);
      dist = Math.max(dist, z + x / (tanH * FILL), z + y / (tanV * FILL));
    }
    if (pass === 2) break;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of corners) {
      corner.subVectors(p, target);
      const d = dist - corner.dot(back);
      const x = corner.dot(right) / d;
      const y = corner.dot(up) / d;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    target.addScaledVector(right, ((x0 + x1) / 2) * dist).addScaledVector(up, ((y0 + y1) / 2) * dist);
  }
  camera.position.copy(target).addScaledVector(back, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.aspect = STILL_W / STILL_H;
  camera.near = dist / 20;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
}

function Shot({ subject, onShot }: { subject: StillSubject; onShot: (url: string) => void }) {
  const fit = useMemo(() => {
    try {
      return solve(subject.build);
    } catch {
      return null;
    }
  }, [subject.build]);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const [locked, setLocked] = useState(false);
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const done = useRef(onShot);
  done.current = onShot;
  const taken = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => setLocked(true), LOCK_WAIT);
    return () => clearTimeout(t);
  }, []);
  useFrame(() => {
    if (taken.current) return;
    if (!fit) {
      taken.current = true;
      done.current("");
      return;
    }
    if (group.current) frame(camera, boundsOf(group.current));
    if (!locked) return;
    frames.current++;
    if (frames.current === 3) {
      taken.current = true;
      done.current(gl.domElement.toDataURL("image/webp", 0.92));
    }
  });
  if (!fit) return null;
  return (
    <group ref={group}>
      <StagedLaptop
        build={subject.build}
        fit={fit}
        maker={subject.company}
        model={subject.name}
        rival={subject.maker ?? null}
        lidAngle={106}
        unlit
        onLock={() => setLocked(true)}
      />
    </group>
  );
}

/**
 * Stills of the laptops, by subject id, once taken: "" for one that cannot be
 * drawn. Queues the ones not yet taken, in the order given, while mounted.
 */
export function useStills(subjects: StillSubject[]): Record<string, string> {
  const [, bump] = useState(0);
  const keys = subjects.map(keyOf);
  const sig = keys.join("|");
  const latest = useRef(subjects);
  latest.current = subjects;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the subjects' content
  useEffect(() => {
    const id = ++seq;
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    requests.set(id, latest.current);
    schedule();
    return () => {
      requests.delete(id);
      listeners.delete(listener);
      schedule();
    };
  }, [sig]);
  const out: Record<string, string> = {};
  subjects.forEach((s, i) => {
    const hit = cache.get(keys[i]);
    if (hit !== undefined) out[s.id] = hit;
  });
  return out;
}
