import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, decorOf, solve } from "../engine";
import type { Award as Won } from "../engine/campaign";
import { Model, surfacesOf } from "../viewer/Scene";
import { token } from "../viewer/theme";
import type { Status } from "./Panels";
import type { Award, OfficeData } from "./Room";

// What grows in the office: the company's laptops on the product wall, open
// and facing the room, and its awards in the trophy cabinet. Status shows on
// the laptop itself: a draft in foam grey, a laptop in stock with its screen
// lit, a sold out one dark with its lid half shut.

const noLabel = () => "";
const noHover = () => {};
/** A picked laptop slides out of its slot toward the room. */
const PULL = 70;
/** Frames a laptop is left to settle before it is baked. */
const SETTLE = 6;

/**
 * Merges a settled laptop's plain meshes into one mesh per material, under
 * `into`, and hides the originals: a laptop is hundreds of small parts, and
 * thirty of them on the wall would be thousands of draw calls. Returns the
 * undo.
 */
function bake(root: THREE.Object3D, into: THREE.Group): () => void {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(into.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material;
    if (mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial) return;
    const g0 = m.geometry;
    if (!g0.attributes.position) return;
    let g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (m.matrixWorld.determinant() < 0) {
      // A mirrored part: flip its winding so it still faces out.
      const pos = g.attributes.position.array as Float32Array;
      for (let i = 0; i < pos.length; i += 9)
        for (let j = 0; j < 3; j++) [pos[i + 3 + j], pos[i + 6 + j]] = [pos[i + 6 + j], pos[i + 3 + j]];
      g = g.clone();
    }
    const list = byMat.get(mat) ?? [];
    list.push(g);
    byMat.set(mat, list);
    hidden.push(m);
  });
  const made: THREE.Mesh[] = [];
  for (const [mat, gs] of byMat) {
    // Only what every part has can be merged: drop uv where one lacks it.
    if (gs.some((g) => !g.attributes.uv)) for (const g of gs) g.deleteAttribute("uv");
    const merged = mergeGeometries(gs, false);
    for (const g of gs) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    into.add(mesh);
    made.push(mesh);
  }
  const bakedFrom = hidden.filter((m) => made.some((x) => x.material === (m as THREE.Mesh).material));
  for (const m of bakedFrom) m.visible = false;
  return () => {
    for (const m of made) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    for (const m of bakedFrom) m.visible = true;
  };
}

export interface WallItem {
  model: SavedModel;
  status: Status;
}

/** A soft lit screen, shared by every laptop in stock. */
function useLit(): THREE.Texture {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, token("office-lit"));
      grad.addColorStop(1, token("office-screen-bar"));
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const Laptop = memo(function Laptop({
  model,
  status,
  lit,
  foam,
}: {
  model: SavedModel;
  status: Status;
  lit: THREE.Texture;
  foam: THREE.Material;
}) {
  const build = model.build as Build;
  const look = useMemo(() => {
    try {
      return {
        fit: solve(build),
        colours: {
          floor: colourHex(build.finish.floor.colour),
          deck: colourHex(build.finish.deck.colour),
          lid: colourHex(build.finish.lid.colour),
        },
        surfaces: surfacesOf(build),
        decor: decorOf(build),
      };
    } catch {
      return null;
    }
  }, [build]);
  const group = useRef<THREE.Group>(null);
  const foamed = status === "draft" || status === "block";
  // A draft is a foam study: every surface in the same grey, laid over once the parts have mounted.
  const frames = useRef(0);
  useEffect(() => {
    frames.current = 0;
  }, [foamed, look]);
  const baked = useRef<THREE.Group>(null);
  const undo = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      undo.current?.();
      undo.current = null;
    },
    [],
  );
  useFrame(() => {
    if (frames.current > SETTLE) return;
    frames.current++;
    group.current?.traverse((o) => {
      // A screen's glow light on every laptop would weigh on every material in the room.
      if ((o as THREE.Light).isLight) o.visible = false;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      if (foamed && m.material !== foam) m.material = foam;
    });
    if (frames.current === SETTLE && group.current && baked.current) {
      undo.current?.();
      undo.current = bake(group.current, baked.current);
    }
  });
  if (!look) return null;
  // Wider laptops than the slot shrink to fit it.
  const out = look.fit.shell.outer;
  const k = Math.min(1, 380 / out.x, 270 / out.y);
  return (
    <>
    <group ref={baked} />
    <group ref={group} scale={k}>
      <Model
        fit={look.fit}
        year={build.year}
        colours={look.colours}
        surfaces={look.surfaces}
        decor={look.decor}
        lidAngle={status === "soldout" ? 60 : 105}
        xray={false}
        problems={false}
        labelFor={noLabel}
        onHover={noHover}
        lockScreen={status === "stock" ? lit : undefined}
      />
    </group>
    </>
  );
});

export function Wall({
  data,
  items,
  picked,
  hidden,
  boxes,
}: {
  data: OfficeData;
  items: WallItem[];
  picked: string | null;
  /** The laptop in use, drawn whole in its place. */
  hidden: string | null;
  boxes: RefObject<{ id: string; box: THREE.Box3 }[]>;
}) {
  const lit = useLit();
  const foam = useMemo(
    () => new THREE.MeshStandardMaterial({ color: token("office-foam"), roughness: 0.95, metalness: 0 }),
    [],
  );
  useEffect(() => () => foam.dispose(), [foam]);
  const shown = items.slice(0, data.slots.length);
  // The pointer picks laptops by their slot's box.
  useEffect(() => {
    boxes.current = shown.map((it, i) => {
      const s = data.slots[i];
      const box = new THREE.Box3(new THREE.Vector3(-200, 0, -170), new THREE.Vector3(200, 300, 170));
      box.applyMatrix4(new THREE.Matrix4().compose(s.pos, s.quat, new THREE.Vector3(1, 1, 1)));
      return { id: it.model.id, box };
    });
  }, [shown, data, boxes]);
  return (
    <>
      {shown.map((it, i) => {
        const s = data.slots[i];
        return (
          <group key={it.model.id} position={s.pos} quaternion={s.quat} visible={it.model.id !== hidden}>
            <group position={it.model.id === picked ? [0, 12, PULL] : [0, 0, 0]}>
              <Laptop
                key={`${it.status}:${it.model.updated}`}
                model={it.model}
                status={it.status}
                lit={lit}
                foam={foam}
              />
            </group>
          </group>
        );
      })}
    </>
  );
}

/** Which template each award kind takes. */
const KIND: Record<Won["award"], Award> = {
  overall: "cup",
  performance: "cup",
  value: "plaque",
  business: "plaque",
  portable: "obelisk",
  gaming: "obelisk",
};

/** The player's awards in the cabinet, lowest shelf first, as clones of the room's templates. */
export function Trophies({ data, awards }: { data: OfficeData; awards: Won[] }) {
  const key = awards.map((a) => a.award).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the awards' kinds
  useEffect(() => {
    const added: THREE.Object3D[] = [];
    awards.slice(0, data.trophySlots.length).forEach((a, i) => {
      const t = data.templates[KIND[a.award]];
      if (!t) return;
      const c = t.clone(true);
      c.visible = true;
      c.position.set(0, 0, 0);
      c.rotation.set(0, 0, 0);
      c.traverse((o) => {
        o.visible = true;
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      data.trophySlots[i].add(c);
      added.push(c);
    });
    return () => {
      for (const c of added) c.removeFromParent();
    };
  }, [data, key]);
  return null;
}

