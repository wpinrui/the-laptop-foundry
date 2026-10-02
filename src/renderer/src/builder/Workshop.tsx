import { useFrame, useLoader } from "@react-three/fiber";
import { memo, type RefObject, Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import workshopUrl from "../assets/workshop/laptop-foundry-workshop.glb?url";
import { Loaded } from "../app/Loaded";
import { PLINTH_H } from "../foundry/Stage";
import { token } from "../viewer/theme";

// The workshop round the builder: the designer's exported machine hall
// (metres, loaded under a group scaled to mm), its turntable standing in for
// the plinth. It is static: drawn once into a held shadow map, never picked,
// and never re-rendered by the build.

const M = 1000;
/** The rooflight's shadow map is drawn for this many frames after the room loads, then held. */
const SHADOW_FRAMES = 3;
/** Groups that never cast: the roof would shade the whole hall from the rooflight. */
const NO_CAST = ["roof", "clerestory", "lights"];
const noRaycast = () => {};
const PLACEHOLDER = /^front_(finish_|label$)/;
/** The side walls' inner faces, x in metres: anything proud of them is a brick pilaster. */
const WALL_FACES = [
  { name: "wall_left_brick_whitewashed", face: -9, side: 1 },
  { name: "wall_right_brick_whitewashed", face: 9, side: -1 },
];

/** The cream cabinet by the 3D printers stands on a black plinth of the same footprint (metres). */
const CABINET = { x0: -3.76, x1: -2.84, z0: -6.46, z1: -5.59, plinth: 0.1 };

/** Starts the cabinet's body on top of its plinth rather than inside it, where the two faces fought. */
function seatCabinet(scene: THREE.Group) {
  scene.getObjectByName("interior_enamel_cream")?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const p = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const c = CABINET;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      if (p.getY(i) < 0.001 && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) p.setY(i, c.plinth);
    }
    p.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

/** Takes the side walls' pilasters out: they stood across the door and clashed with the stairs and pipes. The wall face runs on behind them. */
function removePilasters(scene: THREE.Group) {
  for (const w of WALL_FACES)
    scene.getObjectByName(w.name)?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      const p = g.getAttribute("position") as THREE.BufferAttribute;
      const proud = (i: number) => (p.getX(i) - w.face) * w.side > 0.001;
      const idx = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
      const kept: number[] = [];
      for (let t = 0; t + 2 < idx.length; t += 3)
        if (!proud(idx[t]) && !proud(idx[t + 1]) && !proud(idx[t + 2])) kept.push(idx[t], idx[t + 1], idx[t + 2]);
      g.setIndex(kept);
      g.clearGroups();
      g.computeBoundingBox();
      g.computeBoundingSphere();
    });
}

function useWorkshop(): { scene: THREE.Group; casters: THREE.Mesh[]; lift: number } {
  const gltf = useLoader(GLTFLoader, workshopUrl);
  return useMemo(() => {
    const scene = gltf.scene;
    removePilasters(scene);
    seatCabinet(scene);
    scene.updateMatrixWorld(true);
    // Relative to the scene itself: the loader caches the scene, so on a
    // remount it can still hang under the old mm-scaled group.
    const v = new THREE.Vector3();
    const anchor = scene.getObjectByName("anchor_laptop");
    if (anchor) scene.worldToLocal(anchor.getWorldPosition(v));
    const lift = PLINTH_H - (anchor ? v.y : 0.95) * M;
    const quiet = new Set<THREE.Object3D>();
    for (const n of NO_CAST) scene.getObjectByName(n)?.traverse((o) => quiet.add(o));
    const casters: THREE.Mesh[] = [];
    scene.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      // The archive shelving's stand-in laptops and tags: the company's own laptops take their place.
      if (PLACEHOLDER.test(o.name)) o.visible = false;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      mesh.raycast = noRaycast;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const unlit = mats.some((m) => m.type === "MeshBasicMaterial");
      const clear = mats.some((m) => m.transparent);
      const glowing = mats.some((m) => {
        const s = m as THREE.MeshStandardMaterial;
        return !!s.emissive && s.emissiveIntensity > 0 && s.emissive.getHex() !== 0;
      });
      mesh.receiveShadow = !unlit;
      mesh.castShadow = false;
      if (!unlit && !clear && !glowing && !quiet.has(mesh)) casters.push(mesh);
    });
    return { scene, casters, lift };
  }, [gltf]);
}

function Room({ roof }: { roof: RefObject<THREE.DirectionalLight | null> }) {
  const { scene, casters, lift } = useWorkshop();
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  // Mounted only once the scene has loaded, so the count starts then, and a
  // remount draws the shadows afresh.
  useLayoutEffect(() => {
    const g = group.current;
    if (g) {
      g.updateMatrix();
      g.updateMatrixWorld(true);
      g.matrixAutoUpdate = false;
      g.matrixWorldAutoUpdate = false;
    }
    frames.current = 0;
  }, []);
  useFrame(() => {
    const r = roof.current;
    if (!r || frames.current > SHADOW_FRAMES) return;
    // The room casts only while the rooflight's map is drawn. After that the
    // map is held, and the stage key light, which redraws every frame, finds
    // no room meshes to draw.
    const drawing = frames.current < SHADOW_FRAMES;
    for (const m of casters) m.castShadow = drawing;
    r.shadow.needsUpdate = drawing;
    frames.current++;
  });
  return (
    <group ref={group} position={[0, lift, 0]} scale={M}>
      <primitive object={scene} />
    </group>
  );
}

export const Workshop = memo(function Workshop({ onReady }: { onReady?: () => void }) {
  const roof = useRef<THREE.DirectionalLight>(null);
  return (
    <>
      <color attach="background" args={[token("workshop-ground")]} />
      <hemisphereLight args={[token("workshop-sky"), token("workshop-ground"), 0.6]} />
      <directionalLight
        ref={roof}
        position={[2500, 12000, 3000]}
        color={token("workshop-roof")}
        intensity={1.4}
        castShadow
        shadow-autoUpdate={false}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11000}
        shadow-camera-right={11000}
        shadow-camera-top={11000}
        shadow-camera-bottom={-11000}
        shadow-camera-near={2000}
        shadow-camera-far={20000}
        shadow-bias={-0.0005}
        shadow-normalBias={20}
      />
      <Suspense fallback={null}>
        <Room roof={roof} />
        {onReady && <Loaded onReady={onReady} />}
      </Suspense>
    </>
  );
});
