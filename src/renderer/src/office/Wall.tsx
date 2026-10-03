import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, decorOf, solve } from "../engine";
import type { Award as Won } from "../engine/campaign";
import { Model, surfacesOf } from "../viewer/Scene";
import { bakeLaptop, freeze, SHELF_TEX, type Shelf, useShelf } from "../viewer/shelf";
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
export const SETTLE = 6;

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
  shelf,
  model,
  status,
  lit,
  foam,
}: {
  shelf: Shelf;
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
    if (group.current) freeze(group.current, false);
  }, [foamed, look]);
  useFrame(() => {
    if (frames.current > SETTLE) return;
    frames.current++;
    const g = group.current;
    if (!g) return;
    if (foamed)
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material !== foam) m.material = foam;
      });
    if (frames.current === SETTLE) {
      // The wall draws the laptop from here on; the model stays, hidden and still, as the owner of its marks.
      shelf.set(model.id, bakeLaptop(g, shelf.root));
      freeze(g);
    }
  });
  if (!look) return null;
  // Wider laptops than the slot shrink to fit it.
  const out = look.fit.shell.outer;
  const k = Math.min(1, 380 / out.x, 270 / out.y);
  return (
    // Never drawn: the source of the wall's baked meshes.
    <group ref={group} scale={k} visible={false}>
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
        unlit
        texWidth={SHELF_TEX}
      />
    </group>
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
  // Both sides: the shell's faces are drawn from either side, and one-sided foam left the bezel see-through.
  const foam = useMemo(
    () => new THREE.MeshStandardMaterial({ color: token("office-foam"), roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    [],
  );
  useEffect(() => () => foam.dispose(), [foam]);
  const shelf = useShelf(true);
  const shown = useMemo(() => items.slice(0, data.slots.length), [items, data]);
  // The pointer picks laptops by their slot's box.
  useEffect(() => {
    boxes.current = shown.map((it, i) => {
      const s = data.slots[i];
      const box = new THREE.Box3(new THREE.Vector3(-200, 0, -170), new THREE.Vector3(200, 300, 170));
      box.applyMatrix4(new THREE.Matrix4().compose(s.pos, s.quat, new THREE.Vector3(1, 1, 1)));
      return { id: it.model.id, box };
    });
  }, [shown, data, boxes]);
  // A laptop gone from the wall goes from the shelf; one rebaking keeps its old look until the new one lands.
  useEffect(() => shelf.keep(new Set(shown.map((it) => it.model.id))), [shelf, shown]);
  // The picked laptop slides out of its slot toward the room; the one in use is drawn whole elsewhere.
  useEffect(() => {
    shown.forEach((it, i) => {
      const id = it.model.id;
      const pull = new THREE.Vector3(0, 12, PULL).applyQuaternion(data.slots[i].quat);
      shelf.place(id, id === hidden ? null : id === picked ? pull : undefined);
    });
  }, [shelf, shown, data, picked, hidden]);
  return (
    <>
      <primitive object={shelf.root} />
      {shown.map((it, i) => {
        const s = data.slots[i];
        return (
          <group key={it.model.id} position={s.pos} quaternion={s.quat}>
            <Laptop
              key={`${it.status}:${it.model.updated}`}
              shelf={shelf}
              model={it.model}
              status={it.status}
              lit={lit}
              foam={foam}
            />
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

/**
 * Where `n` trophies stand. Up to the shell's slot count they take its slots as
 * authored; past that each shelf takes a staggered back and front row, packed
 * tighter and scaled down to fit, so every award stays inside the cabinet.
 */
function cabinetSlots(slots: THREE.Object3D[], n: number): THREE.Object3D[] {
  if (n <= slots.length) return slots.slice(0, n);
  const parent = slots[0].parent;
  if (!parent) return slots;
  const shelves = [...new Set(slots.map((s) => s.position.y))].sort((a, b) => a - b);
  const xs = slots.map((s) => s.position.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z = slots[0].position.z;
  const base = Math.max(2, Math.round(slots.length / shelves.length));
  const pitch0 = (x1 - x0) / (base - 1);
  const perShelf = Math.ceil(n / shelves.length);
  const cols = Math.ceil(perShelf / 2);
  const pitch = (x1 - x0) / Math.max(1, cols - 0.5);
  const scale = Math.min(1, pitch / pitch0);
  const depth = pitch0 * 0.3;
  const out: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % perShelf;
    const row = Math.floor(k / cols);
    const o = new THREE.Object3D();
    o.position.set(x0 + ((k % cols) + row * 0.5) * pitch, shelves[Math.floor(i / perShelf)], z - depth + row * 2 * depth);
    o.scale.setScalar(scale);
    parent.add(o);
    out.push(o);
  }
  return out;
}

/** The player's awards in the cabinet, lowest shelf first, as clones of the room's templates. */
export function Trophies({ data, awards }: { data: OfficeData; awards: Won[] }) {
  const key = awards.map((a) => a.award).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the awards' kinds
  useEffect(() => {
    const added: THREE.Object3D[] = [];
    if (data.trophySlots.length === 0) return;
    const slots = cabinetSlots(data.trophySlots, awards.length);
    const made = slots.filter((s) => !data.trophySlots.includes(s));
    added.push(...made);
    awards.slice(0, slots.length).forEach((a, i) => {
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
      slots[i].add(c);
      added.push(c);
    });
    return () => {
      for (const c of added) c.removeFromParent();
    };
  }, [data, key]);
  return null;
}

