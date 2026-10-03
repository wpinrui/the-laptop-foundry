import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import beachUrl from "../assets/video-sets/laptop-foundry-set-beach.glb?url";
import benchUrl from "../assets/video-sets/laptop-foundry-set-bench.glb?url";
import cabinUrl from "../assets/video-sets/laptop-foundry-set-cabin.glb?url";
import cycloramaUrl from "../assets/video-sets/laptop-foundry-set-cyclorama.glb?url";
import denUrl from "../assets/video-sets/laptop-foundry-set-den.glb?url";
import deskUrl from "../assets/video-sets/laptop-foundry-set-desk.glb?url";
import libraryUrl from "../assets/video-sets/laptop-foundry-set-library.glb?url";
import loungeUrl from "../assets/video-sets/laptop-foundry-set-lounge.glb?url";
import nightUrl from "../assets/video-sets/laptop-foundry-set-night.glb?url";
import parkUrl from "../assets/video-sets/laptop-foundry-set-park.glb?url";
import trainUrl from "../assets/video-sets/laptop-foundry-set-train.glb?url";

// The short's sets: small rooms and places a reviewer would film a laptop in, one
// per quarter in turn. Each GLB is in metres with the laptop's spot marked by
// anchor_laptop and its light rig described in the root's extras; nothing is
// baked in, so the rig is built here from that data.

export type SetId = "desk" | "night" | "bench" | "park" | "lounge" | "beach" | "den" | "library" | "train" | "cabin" | "cyclorama";

/** The order the sets come round in, one per quarter. */
const ROTATION: SetId[] = ["desk", "park", "cyclorama", "lounge", "night", "beach", "library", "bench", "train", "den", "cabin"];
const URLS: Record<SetId, string> = {
  desk: deskUrl,
  night: nightUrl,
  bench: benchUrl,
  park: parkUrl,
  lounge: loungeUrl,
  beach: beachUrl,
  den: denUrl,
  library: libraryUrl,
  train: trainUrl,
  cabin: cabinUrl,
  cyclorama: cycloramaUrl,
};

export interface Look {
  set: SetId;
  /** For the cyclorama: which of its paper colours, counted round the palette. */
  paper: number;
}

/** Every set, in the order the pickers list them. */
export const SET_IDS: readonly SetId[] = ["desk", "night", "bench", "park", "lounge", "beach", "den", "library", "train", "cabin", "cyclorama"];

/** The set whose paper is recoloured per look. */
export const PAPER_SET: SetId = "cyclorama";

/** A look as a key: the cyclorama's paper tells two of them apart; the other sets have none. */
export const lookKey = (l: Look) => (l.set === PAPER_SET ? `${PAPER_SET}:${l.paper}` : l.set);

/** Starts loading the sets' files, so switching to one later does not wait on the disk. */
export function preloadSets(ids: SetId[]): void {
  for (const id of ids) useLoader.preload(GLTFLoader, URLS[id]);
}

/** The set for a company's nth quarter, from 0: the sets in turn, the cyclorama's paper a new colour each time round. */
export function lookFor(quarter: number): Look {
  const n = Math.max(0, Math.floor(quarter));
  return { set: ROTATION[n % ROTATION.length], paper: Math.floor(n / ROTATION.length) };
}

// The cyclorama's paper colours, read once from its file's root extras: name and hex, in palette order.
let sweepPalette: Promise<[string, string][]> | null = null;

function loadSweepColours(): Promise<[string, string][]> {
  sweepPalette ??= fetch(cycloramaUrl)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      // A GLB: a 12 byte header, then the JSON chunk's length, its type, and the JSON.
      const view = new DataView(buf);
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, view.getUint32(12, true)))) as {
        nodes?: { extras?: Partial<Extras> }[];
      };
      const found = json.nodes?.find((n) => n.extras?.sweepColours)?.extras?.sweepColours ?? {};
      return Object.entries(found);
    })
    .catch(() => {
      sweepPalette = null;
      return [];
    });
  return sweepPalette;
}

/** The cyclorama's paper colours as [name, hex], in the order a look's paper counts round them; empty until read. */
export function useSweepColours(): [string, string][] {
  const [colours, setColours] = useState<[string, string][]>([]);
  useEffect(() => {
    let live = true;
    void loadSweepColours().then((c) => live && setColours(c));
    return () => {
      live = false;
    };
  }, []);
  return colours;
}

type V3 = [number, number, number];

interface Lighting {
  exposure: number;
  hemi: { sky: string; ground: string; intensity: number };
  key: { color: string; intensity: number; pos: V3; target: V3; angle: number; penumbra: number };
  rim: { color: string; intensity: number; pos: V3; target: V3 };
  practicals: { color: string; intensity: number; pos: V3; distance: number }[];
  envPanels: { w: number; h: number; pos: V3; look: V3; color: string; k: number }[];
}

interface Extras {
  lighting: Lighting;
  sweepColours?: Record<string, string>;
}

/** Groups whose meshes never cast a shadow: the sky or blurred room, the glow, the window and the city. */
const NO_SHADOW = new Set(["surround", "glow", "city", "glass"]);

/** Whether `o` sits anywhere under one of the no-shadow groups. */
function inNoShadow(o: THREE.Object3D): boolean {
  for (let p = o.parent; p; p = p.parent) if (NO_SHADOW.has(p.name)) return true;
  return false;
}

/**
 * The set for `look`, its light rig and environment, with the laptop's spot.
 * Calls `onReady` with the anchor once everything is in the scene.
 */
export function SetStage({ look, onReady }: { look: Look; onReady: (anchor: THREE.Vector3) => void }) {
  const gltf = useLoader(GLTFLoader, URLS[look.set]);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const set = useMemo(() => {
    // A copy per stage: the loader caches one scene per file, and a background render's canvas
    // mounting that same object would take it out of the preview's scene.
    const root = gltf.scene.clone(true);
    root.updateMatrixWorld(true);
    let extras: Extras | null = null;
    root.traverse((o) => {
      if (!extras && (o.userData as Partial<Extras>).lighting) extras = o.userData as Extras;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The cyclorama's paper is recoloured per look, so each copy gets its own.
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => (m.name === "sweep_paper" ? m.clone() : m));
      else if (mesh.material.name === "sweep_paper") mesh.material = mesh.material.clone();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const unlit = mats.some((m) => m.type === "MeshBasicMaterial");
      const clear = mats.some((m) => m.transparent);
      mesh.receiveShadow = !unlit;
      mesh.castShadow = !unlit && !clear && !inNoShadow(mesh);
    });
    // Relative to the set's own root.
    const anchor = new THREE.Vector3();
    const a = root.getObjectByName("anchor_laptop");
    if (a) root.worldToLocal(a.getWorldPosition(anchor));
    return { root, anchor, extras: extras as Extras | null, leaves: !!root.getObjectByName("leaves") };
  }, [gltf]);

  // The cyclorama's paper, a new colour each time round.
  useEffect(() => {
    const colours = Object.values(set.extras?.sweepColours ?? {});
    if (!colours.length) return;
    set.root.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : [])
        if (m.name === "sweep_paper") (m as THREE.MeshStandardMaterial).color.set(colours[look.paper % colours.length]);
    });
  }, [set, look.paper]);

  // The rig: hemisphere fill, the key spot (the only shadow), a rim light and the practicals; an environment from the set's own room.
  useEffect(() => {
    const L = set.extras?.lighting;
    if (!L) return;
    const added: THREE.Object3D[] = [];
    const add = (...o: THREE.Object3D[]) => {
      scene.add(...o);
      added.push(...o);
    };
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = L.exposure;
    add(new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity));
    const k = L.key;
    const key = new THREE.SpotLight(k.color, k.intensity, 0, k.angle, k.penumbra, 2);
    key.position.set(...k.pos);
    key.target.position.set(...k.target);
    key.castShadow = true;
    // The park's leaves throw the dapple, which wants the finer map.
    const size = set.leaves ? 2048 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.01;
    // Fitted to the key's distance: an outdoor sun sits 7 m out, a studio key under 2 m.
    const reach = key.position.distanceTo(key.target.position);
    key.shadow.camera.near = Math.max(0.1, reach - 4);
    key.shadow.camera.far = reach + 3;
    add(key, key.target);
    const rim = new THREE.DirectionalLight(L.rim.color, L.rim.intensity);
    rim.position.set(...L.rim.pos);
    rim.target.position.set(...L.rim.target);
    add(rim, rim.target);
    for (const p of L.practicals) {
      const pl = new THREE.PointLight(p.color, p.intensity, p.distance, 2);
      pl.position.set(...p.pos);
      add(pl);
    }

    const env = new THREE.Scene();
    const made: { dispose: () => void }[] = [];
    // Only the unlit sky or room: lit scenery out there would be black with no lights in this scene.
    set.root.getObjectByName("surround")?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.material.type === "MeshBasicMaterial") env.add(new THREE.Mesh(m.geometry, m.material));
    });
    const floorGeo = new THREE.CircleGeometry(1.5, 32);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x3a3632 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    env.add(floor);
    made.push(floorGeo, floorMat);
    for (const p of L.envPanels) {
      const geo = new THREE.PlaneGeometry(p.w, p.h);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.k), side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...p.pos);
      m.lookAt(...p.look);
      env.add(m);
      made.push(geo, mat);
    }
    const pmrem = new THREE.PMREMGenerator(gl);
    const map = pmrem.fromScene(env, 0.03).texture;
    scene.environment = map;
    scene.background = new THREE.Color(0x000000);
    gl.shadowMap.needsUpdate = true;
    onReady(set.anchor);
    return () => {
      for (const o of added) scene.remove(o);
      scene.environment = null;
      map.dispose();
      pmrem.dispose();
      for (const d of made) d.dispose();
    };
  }, [set, gl, scene, onReady]);

  return <primitive object={set.root} dispose={null} />;
}
