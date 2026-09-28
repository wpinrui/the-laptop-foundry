import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
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

/**
 * The quarter's short on the TV: the video decodes in a hidden element, with
 * its sound, and each frame is drawn centred on the screen's own canvas.
 * `take` restarts it.
 */
export function TvShort({ data, url, sound, take }: { data: OfficeData; url: string; sound: boolean; take: number }) {
  const video = useMemo(() => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.preload = "auto";
    return v;
  }, []);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  useEffect(() => {
    const mesh = data.scene.getObjectByName("tv_screen") as THREE.Mesh | undefined;
    if (!mesh) return;
    const was = mesh.material;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mesh.material = mat;
    return () => {
      mesh.material = was;
      mat.dispose();
    };
  }, [data, tex]);
  useEffect(() => {
    video.src = url;
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
  useFrame(() => {
    if (video.readyState < 2 || !video.videoWidth) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#000";
    g.fillRect(0, 0, canvas.width, canvas.height);
    const k = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * k;
    const h = video.videoHeight * k;
    g.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    tex.needsUpdate = true;
  });
  return null;
}

/** The desk computer: an ideal all-in-one, its build only there for the OS's sizes. */
export const DESK_PC: Build = SAMPLES.find((s) => s.id === "ultrabook-14")?.build ?? SAMPLES[SAMPLES.length - 1].build;

/** The desk monitor's screen in the room, mm: its centre, the way it faces, and its size. */
function deskScreen(data: OfficeData): { centre: THREE.Vector3; normal: THREE.Vector3; w: number; h: number } | null {
  const mesh = data.scene.getObjectByName("desk_monitor_screen");
  const cam = data.poses.desk;
  if (!mesh || !cam) return null;
  data.scene.updateMatrixWorld(true);
  const inv = data.scene.matrixWorld.clone().invert();
  const box = new THREE.Box3().setFromObject(mesh).applyMatrix4(inv);
  box.min.multiplyScalar(M);
  box.max.multiplyScalar(M);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // The screen faces the desk's own camera, over the chair.
  const normal = cam.pos.clone().sub(centre).setY(0).normalize();
  return { centre, normal, w: Math.max(size.x, size.z), h: size.y };
}

/** Where the camera leans in to the desk computer: its screen filling most of the view. */
export function deskLean(data: OfficeData, aspect: number): Pose | null {
  const s = deskScreen(data);
  if (!s) return null;
  const tanV = Math.tan((fovFor(aspect) * Math.PI) / 360);
  const d = Math.max(s.w / (2 * tanV * aspect), s.h / (2 * tanV)) / USE_FILL;
  const eye = s.centre.clone().add(s.normal.clone().multiplyScalar(d));
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, s.centre, new THREE.Vector3(0, 1, 0)));
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
  const at = s.centre.clone().add(s.normal.clone().multiplyScalar(3));
  return (
    <group position={at} rotation={[0, Math.atan2(s.normal.x, s.normal.z), 0]}>
      <Html transform portal={portal as RefObject<HTMLElement>} distanceFactor={k * 400} zIndexRange={[4, 0]} wrapperClass="lid-screen">
        {page.node}
      </Html>
    </group>
  );
}
