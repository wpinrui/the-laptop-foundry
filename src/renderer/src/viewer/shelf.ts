import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Many laptops standing still, as on the office's product wall and the
// workshop's shelves: each laptop is baked once into one geometry per look,
// and the shelf merges every laptop's geometry of one look into one mesh,
// so thirty laptops draw in a couple of hundred calls instead of thousands.
// A laptop with its own texture (its marks, its keycap legends) keeps its
// own mesh, since its look is its own.

/** Canvas width for a shelved laptop's marks and legends: they are seen from a step away at most. */
export const SHELF_TEX = 512;

/** Units inside the closed shell, never seen on a shelf. A removable battery is the bottom's skin and stays. */
const INTERIOR = new Set([
  "board",
  "battery",
  "drive",
  "fan",
  "fin",
  "spk",
  "inverter",
  "cpu",
  "gpu",
  "vrm",
  "chipset",
  "mem",
  "m2",
  "wlan",
  "bt",
  "tb",
]);

const TEXTURES = [
  "map",
  "emissiveMap",
  "alphaMap",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "bumpMap",
  "lightMap",
  "displacementMap",
  "specularMap",
] as const;

const noRaycast = () => {};
/** Frames the shelf waits after a laptop lands before merging, so laptops landing together merge once. */
const QUIET = 2;

/** What a material looks like, as a key: two materials with one key draw the same. */
function lookKey(m: THREE.Material): string {
  const out: string[] = [m.type, m.customProgramCacheKey()];
  for (const [k, v] of Object.entries(m)) {
    if (k === "uuid" || k === "id" || k === "name" || k === "version" || v === null || v === undefined) continue;
    const t = typeof v;
    if (t === "number" || t === "string" || t === "boolean") out.push(`${k}=${v}`);
    else if ((v as THREE.Color).isColor) {
      const c = v as THREE.Color;
      out.push(`${k}=${c.r},${c.g},${c.b}`);
    } else if ((v as THREE.Texture).isTexture) out.push(`${k}=${(v as THREE.Texture).uuid}`);
    else if ((v as THREE.Vector2).isVector2) out.push(`${k}=${(v as THREE.Vector2).x},${(v as THREE.Vector2).y}`);
  }
  return out.join("|");
}

const texturesOf = (m: THREE.Material): THREE.Texture[] =>
  TEXTURES.map((k) => (m as unknown as Record<string, THREE.Texture | null | undefined>)[k]).filter(
    (t): t is THREE.Texture => !!t?.isTexture,
  );

/** An attribute as plain floats, so parts built different ways merge. */
function plain(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  if (a instanceof THREE.BufferAttribute && a.array instanceof Float32Array && !a.normalized) return a;
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return new THREE.BufferAttribute(out, a.itemSize);
}

/** One part's triangles, unindexed, in the shelf's space. */
function partGeometry(g0: THREE.BufferGeometry, m: THREE.Matrix4, uv: boolean): THREE.BufferGeometry {
  const g = g0.index ? g0.toNonIndexed() : g0.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name === "position" || name === "normal" || (uv && name === "uv")) g.setAttribute(name, plain(g.getAttribute(name)));
    else g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (uv && !g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.applyMatrix4(m);
  if (m.determinant() < 0) {
    // A mirrored part: turn each triangle's winding back so it still faces out.
    for (const a of Object.values(g.attributes)) {
      const arr = a.array as Float32Array;
      const s = a.itemSize;
      for (let i = 0; i + 3 * s <= arr.length; i += 3 * s)
        for (let j = 0; j < s; j++) [arr[i + s + j], arr[i + 2 * s + j]] = [arr[i + 2 * s + j], arr[i + s + j]];
    }
  }
  return g;
}

/** A laptop's look-alike parts merged: one geometry per look. */
export interface Part {
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  order: number;
}

/**
 * Bakes the shown, outside meshes under `src` into one geometry per look, in
 * `root`'s space. `src` itself may be hidden: only what is hidden under it is left out.
 */
export function bakeLaptop(src: THREE.Object3D, root: THREE.Object3D): Map<string, Part> {
  root.updateWorldMatrix(true, false);
  src.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert();
  const lists = new Map<string, { material: THREE.Material; order: number; geos: THREE.BufferGeometry[] }>();
  const m = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.geometry.attributes.position) return;
    const mat = mesh.material;
    if ((mat as THREE.ShaderMaterial).isShaderMaterial) return;
    for (let p: THREE.Object3D | null = mesh; p && p !== src; p = p.parent) if (!p.visible) return;
    const box = mesh.userData.box as { role?: string; skin?: boolean } | undefined;
    if (box?.role && INTERIOR.has(box.role) && !box.skin) return;
    const uv = texturesOf(mat).length > 0;
    const key = lookKey(mat);
    const list = lists.get(key) ?? { material: mat, order: mesh.renderOrder, geos: [] };
    const inst = mesh as unknown as THREE.InstancedMesh;
    const count = inst.isInstancedMesh ? inst.count : 1;
    for (let i = 0; i < count; i++) {
      m.multiplyMatrices(toRoot, mesh.matrixWorld);
      if (inst.isInstancedMesh) m.multiply(inst.getMatrixAt(i, im));
      list.geos.push(partGeometry(mesh.geometry, m, uv));
    }
    lists.set(key, list);
  });
  const parts = new Map<string, Part>();
  for (const [key, l] of lists) {
    const geometry = mergeGeometries(l.geos, false);
    for (const g of l.geos) g.dispose();
    if (geometry) parts.set(key, { material: l.material, geometry, order: l.order });
  }
  return parts;
}

/** Geometry over a range of another's vertices, sharing its arrays. */
function view(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const v = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const s = a.itemSize;
    v.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).subarray(start * s, (start + count) * s), s));
  }
  return v;
}

interface Merged {
  mesh: THREE.Mesh;
  /** Each laptop's vertices in the merged geometry: first and count. */
  ranges: [string, number, number][];
}

/**
 * A shelf of baked laptops, drawn under `root`. A laptop set apart (picked
 * and slid out, or in use) is left out of the merged meshes by their draw
 * groups, so setting one apart never merges again.
 */
export class Shelf {
  readonly root = new THREE.Group();
  private readonly loose = new THREE.Group();
  private laptops = new Map<string, Map<string, Part>>();
  /** One shared material per look, the shelf's own copy. */
  private mats = new Map<string, THREE.Material>();
  private merged = new Map<string, Merged>();
  /** Laptops set apart: drawn moved by the offset, or not at all (null). */
  private apart = new Map<string, THREE.Vector3 | null>();
  private dirty = false;
  private quiet = 0;
  private relayout = false;

  constructor(private readonly shadows: boolean) {
    this.root.add(this.loose);
  }

  /** Whether laptops have landed that are not merged yet. */
  get busy(): boolean {
    return this.dirty;
  }

  /** A laptop's baked parts, in place of any it had. */
  set(id: string, parts: Map<string, Part>): void {
    this.laptops.set(id, parts);
    this.dirty = true;
    this.quiet = 0;
  }

  /** Drops every laptop not in `ids`. */
  keep(ids: Set<string>): void {
    for (const id of [...this.laptops.keys()])
      if (!ids.has(id)) {
        this.laptops.delete(id);
        this.dirty = true;
      }
  }

  /** Sets a laptop apart, moved by `offset` or hidden (null), or back on the shelf (undefined). */
  place(id: string, offset: THREE.Vector3 | null | undefined): void {
    const had = this.apart.get(id);
    if (offset === undefined) {
      if (!this.apart.has(id)) return;
      this.apart.delete(id);
    } else {
      if (this.apart.has(id) && (had === offset || (had && offset && had.equals(offset)))) return;
      this.apart.set(id, offset);
    }
    this.relayout = true;
  }

  /** Once a frame: merges what has landed, once it has settled, and redraws the draw groups. */
  flush(): void {
    if (this.dirty && ++this.quiet >= QUIET) this.rebuild();
    if (this.relayout && !this.dirty) this.layout();
  }

  private rebuild(): void {
    const byKey = new Map<string, { material: THREE.Material; order: number; items: [string, THREE.BufferGeometry][] }>();
    for (const [id, parts] of this.laptops)
      for (const [key, p] of parts) {
        const e = byKey.get(key) ?? { material: p.material, order: p.order, items: [] };
        e.items.push([id, p.geometry]);
        byKey.set(key, e);
      }
    const old = this.merged;
    this.merged = new Map();
    for (const [key, e] of byKey) {
      const geometry = mergeGeometries(
        e.items.map(([, g]) => g),
        false,
      );
      if (!geometry) continue;
      let mat = this.mats.get(key);
      if (!mat) {
        mat = e.material.clone();
        this.mats.set(key, mat);
      }
      // An array of one: the draw groups leave out the laptops set apart.
      const mesh = new THREE.Mesh(geometry, [mat]);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = true;
      mesh.raycast = noRaycast;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = e.order;
      const ranges: Merged["ranges"] = [];
      let at = 0;
      for (const [id, g] of e.items) {
        const n = g.attributes.position.count;
        ranges.push([id, at, n]);
        // The laptop's part becomes a window on the merged arrays: no second copy is kept.
        const part = this.laptops.get(id)?.get(key);
        if (part) part.geometry = view(geometry, at, n);
        at += n;
      }
      this.root.add(mesh);
      this.merged.set(key, { mesh, ranges });
    }
    for (const m of old.values()) {
      m.mesh.removeFromParent();
      m.mesh.geometry.dispose();
    }
    for (const [key, mat] of [...this.mats]) if (!this.merged.has(key)) this.dropMaterial(key, mat);
    this.dirty = false;
    this.quiet = 0;
    this.layout();
  }

  /** Frees a look's material, and its textures once no other look of the shelf uses them. */
  private dropMaterial(key: string, mat: THREE.Material): void {
    this.mats.delete(key);
    mat.dispose();
    const used = new Set<THREE.Texture>();
    for (const m of this.mats.values()) for (const t of texturesOf(m)) used.add(t);
    for (const t of texturesOf(mat)) if (!used.has(t)) t.dispose();
  }

  private layout(): void {
    this.relayout = false;
    for (const { mesh, ranges } of this.merged.values()) {
      const g = mesh.geometry;
      g.clearGroups();
      let start = -1;
      let end = -1;
      for (const [id, at, n] of ranges) {
        if (this.apart.has(id)) continue;
        if (at === end) end += n;
        else {
          if (start >= 0) g.addGroup(start, end - start, 0);
          start = at;
          end = at + n;
        }
      }
      if (start >= 0) g.addGroup(start, end - start, 0);
      mesh.visible = g.groups.length > 0;
    }
    for (const c of [...this.loose.children]) {
      c.removeFromParent();
      (c as THREE.Mesh).geometry.dispose();
    }
    for (const [id, offset] of this.apart) {
      const parts = offset && this.laptops.get(id);
      if (!parts) continue;
      for (const [key, p] of parts) {
        const mat = this.mats.get(key);
        if (!mat) continue;
        const mesh = new THREE.Mesh(p.geometry, mat);
        mesh.position.copy(offset);
        mesh.castShadow = this.shadows;
        mesh.receiveShadow = true;
        mesh.raycast = noRaycast;
        mesh.renderOrder = p.order;
        this.loose.add(mesh);
      }
    }
  }

  dispose(): void {
    for (const m of this.merged.values()) {
      m.mesh.removeFromParent();
      m.mesh.geometry.dispose();
    }
    this.merged.clear();
    for (const c of [...this.loose.children]) {
      c.removeFromParent();
      (c as THREE.Mesh).geometry.dispose();
    }
    for (const [key, mat] of [...this.mats]) this.dropMaterial(key, mat);
    this.laptops.clear();
    this.apart.clear();
    this.dirty = false;
  }
}

/**
 * Freezes a baked source (or thaws it, to bake again): frozen, its matrices
 * are never recomputed, so the hidden tree costs next to nothing a frame.
 */
export function freeze(src: THREE.Object3D, frozen = true): void {
  src.traverse((o) => {
    if (o === src) return;
    o.matrixAutoUpdate = !frozen;
    o.raycast = noRaycast;
  });
}

/** A shelf for this canvas, merged once a frame; draw its `root`. */
export function useShelf(shadows: boolean): Shelf {
  const shelf = useMemo(() => new Shelf(shadows), [shadows]);
  useEffect(() => () => shelf.dispose(), [shelf]);
  useFrame(() => shelf.flush());
  return shelf;
}
