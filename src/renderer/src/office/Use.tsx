import { Html } from "@react-three/drei";
import { type ReactNode, type RefObject, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, SAMPLES, decorOf, type Fit, migrateBody, migrateColours, migrateScreen, solve } from "../engine";
import { Model, surfacesOf } from "../viewer/Scene";
import { fovFor, M, type OfficeData, type Pose } from "./Room";

// Using the office's computers in free roam: a laptop off the product wall,
// leaned in on with its OS on screen as in the cafe, and the TV playing the
// quarter's short. Units are mm.

/** A picked or used laptop slides out of its slot toward the room. */
export const PULL = 70;
/** How far open a laptop on the wall stands. */
export const WALL_LID = 105;
/** In use, how much of the view the screen fills. */
const USE_FILL = 0.84;
const noLabel = () => "";
const noHover = () => {};

/** A saved laptop's build as the builder and the OS read it today. */
export const buildOf = (m: SavedModel): Build => migrateBody(migrateColours(migrateScreen(m.build as Build)));

/** Wider laptops than a wall slot shrink to fit it. */
export function slotScale(fit: Fit): number {
  const out = fit.shell.outer;
  return Math.min(1, 380 / out.x, 270 / out.y);
}

/** Where the camera leans in to use the laptop in slot `index`: its screen filling most of the view. */
export function leanFor(data: OfficeData, index: number, fit: Fit, aspect: number): Pose | null {
  const s = data.slots[index];
  if (!s) return null;
  const out = fit.shell.outer;
  const k = slotScale(fit);
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const r = panel ? out.y - (panel.at.y + panel.size.y / 2) : out.y / 2;
  const a = (WALL_LID * Math.PI) / 180;
  const at = new THREE.Vector3(0, (out.z + r * Math.sin(a)) * k + 12, (-out.y / 2 + r * Math.cos(a)) * k + PULL);
  const tanV = Math.tan((fovFor(aspect) * Math.PI) / 360);
  const sw = (panel?.size.x ?? out.x) * k;
  const sh = (panel?.size.y ?? out.y * 0.8) * k;
  const d = Math.max(sw / (2 * tanV * aspect), sh / (2 * tanV)) / USE_FILL;
  const eye = at.clone().add(new THREE.Vector3(0, -Math.cos(a), Math.sin(a)).multiplyScalar(d));
  const m = new THREE.Matrix4().compose(s.pos, s.quat, new THREE.Vector3(1, 1, 1));
  eye.applyMatrix4(m);
  at.applyMatrix4(m);
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, at, new THREE.Vector3(0, 1, 0)));
  return { pos: eye, quat };
}

/** The laptop in use, in its slot and slid out, whole rather than baked, with its OS page on the screen. */
export function UsedLaptop({
  data,
  index,
  build,
  fit,
  page,
  portal,
}: {
  data: OfficeData;
  index: number;
  build: Build;
  fit: Fit;
  page?: { node: ReactNode; width: number; mm: { x: number; y: number } };
  portal: RefObject<HTMLDivElement | null>;
}) {
  const s = data.slots[index];
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
  if (!s) return null;
  return (
    <group position={s.pos} quaternion={s.quat}>
      <group position={[0, 12, PULL]} scale={slotScale(fit)}>
        <Model
          fit={fit}
          year={build.year}
          colours={colours}
          surfaces={surfaces}
          decor={decor}
          lidAngle={WALL_LID}
          xray={false}
          problems={false}
          labelFor={noLabel}
          onHover={noHover}
          screen={page}
          portal={portal}
        />
      </group>
    </group>
  );
}

export const fitOf = (b: Build): Fit | null => {
  try {
    const f = solve(b);
    return f.problems.length === 0 ? f : null;
  } catch {
    return null;
  }
};

/** The TV's screen shape, width over height. */
const TV_ASPECT = 16 / 9;

/**
 * A finished video on the TV, a short or a commercial, with its sound. Its frames go
 * straight to a video texture, updated per decoded frame, and are letterboxed on black
 * at their own shape. The element sits in the page, barely visible, because Chromium
 * stops driving the frames of a video it thinks nobody sees (detached, transparent)
 * and they fall behind the sound. `take` restarts it.
 */
export function TvShort({ data, url, sound, take }: { data: OfficeData; url: string; sound: boolean; take: number }) {
  const video = useMemo(() => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.preload = "auto";
    v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
    return v;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);
  useEffect(() => {
    document.body.appendChild(video);
    return () => video.remove();
  }, [video]);
  useEffect(() => {
    const mesh = data.scene.getObjectByName("tv_screen") as THREE.Mesh | undefined;
    if (!mesh) return;
    const was = mesh.material;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // Outside the video's own rectangle the screen is black, not the edge pixels stretched.
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        diffuseColor.rgb *= step(0.0, vMapUv.x) * step(vMapUv.x, 1.0) * step(0.0, vMapUv.y) * step(vMapUv.y, 1.0);`,
      );
    };
    mesh.material = mat;
    return () => {
      mesh.material = was;
      mat.dispose();
    };
  }, [data, tex]);
  useEffect(() => {
    const fit = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      // The share of the screen the video fills across and up, fitted inside it.
      const a = video.videoWidth / video.videoHeight;
      const fx = Math.min(1, a / TV_ASPECT);
      const fy = Math.min(1, TV_ASPECT / a);
      tex.repeat.set(1 / fx, 1 / fy);
      tex.offset.set(0.5 - 0.5 / fx, 0.5 - 0.5 / fy);
    };
    video.addEventListener("loadedmetadata", fit);
    fit();
    return () => video.removeEventListener("loadedmetadata", fit);
  }, [video, tex]);
  useEffect(() => {
    video.src = url;
    // A new video, loaded after its Watch, plays from the start too.
    void video.play().catch(() => {});
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [video, url]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each take plays it from the start
  useEffect(() => {
    video.currentTime = 0;
    void video.play().catch(() => {});
  }, [video, take]);
  useEffect(() => {
    video.muted = !sound;
  }, [video, sound]);
  useEffect(() => () => tex.dispose(), [tex]);
  return null;
}

/** The desk computer: an ideal all-in-one, its build only there for the OS's sizes. */
export const DESK_PC: Build = SAMPLES.find((s) => s.id === "ultrabook-14")?.build ?? SAMPLES[SAMPLES.length - 1].build;

/** The desk monitor's screen in the room, mm: its centre, the way it faces, its up, and its size, read off the mesh itself. */
function deskScreen(
  data: OfficeData,
): { centre: THREE.Vector3; normal: THREE.Vector3; up: THREE.Vector3; w: number; h: number } | null {
  const mesh = data.scene.getObjectByName("desk_monitor_screen") as THREE.Mesh | undefined;
  const cam = data.poses.desk;
  if (!mesh?.geometry || !cam) return null;
  data.scene.updateMatrixWorld(true);
  const rel = data.scene.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  rel.decompose(pos, quat, scl);
  mesh.geometry.computeBoundingBox();
  const lb = mesh.geometry.boundingBox as THREE.Box3;
  const size = lb.getSize(new THREE.Vector3()).multiply(scl).multiplyScalar(M);
  const centre = lb.getCenter(new THREE.Vector3()).applyMatrix4(rel).multiplyScalar(M);
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) =>
    a.applyQuaternion(quat),
  );
  const len = [size.x, size.y, size.z];
  // The thinnest axis is the way the screen faces; of the other two, the one nearest world up is its height.
  const thin = len.indexOf(Math.min(...len));
  const rest = [0, 1, 2].filter((i) => i !== thin);
  const upIdx = Math.abs(axes[rest[0]].y) >= Math.abs(axes[rest[1]].y) ? rest[0] : rest[1];
  const wIdx = rest[0] === upIdx ? rest[1] : rest[0];
  const normal = axes[thin].clone();
  if (normal.dot(cam.pos.clone().sub(centre)) < 0) normal.negate();
  const up = axes[upIdx].clone();
  if (up.y < 0) up.negate();
  return { centre, normal, up, w: len[wIdx], h: len[upIdx] };
}

/** Where the camera leans in to the desk computer: its screen filling most of the view. */
export function deskLean(data: OfficeData, aspect: number): Pose | null {
  const s = deskScreen(data);
  if (!s) return null;
  const tanV = Math.tan((fovFor(aspect) * Math.PI) / 360);
  const d = Math.max(s.w / (2 * tanV * aspect), s.h / (2 * tanV)) / USE_FILL;
  const eye = s.centre.clone().add(s.normal.clone().multiplyScalar(d));
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, s.centre, s.up));
  return { pos: eye, quat };
}

/** The desk computer's OS page, laid on its monitor. */
export function DeskScreen({
  data,
  page,
  portal,
}: {
  data: OfficeData;
  page?: { node: ReactNode; width: number; height: number };
  portal: RefObject<HTMLDivElement | null>;
}) {
  const s = useMemo(() => deskScreen(data), [data]);
  if (!s || !page) return null;
  const k = Math.min(s.w / page.width, s.h / page.height);
  const at = s.centre.clone().add(s.normal.clone().multiplyScalar(1));
  const x = new THREE.Vector3().crossVectors(s.up, s.normal).normalize();
  const face = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, s.up, s.normal));
  return (
    <group position={at} quaternion={face}>
      <Html transform portal={portal as RefObject<HTMLElement>} distanceFactor={k * 400} zIndexRange={[4, 0]} wrapperClass="lid-screen">
        {page.node}
      </Html>
    </group>
  );
}
