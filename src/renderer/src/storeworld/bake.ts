import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Turns a mounted laptop Model into a static copy: every visible mesh, in the
// model's own frame, merged by look into one mesh per material, with the
// materials shared across every laptop in the store. A far copy keeps only
// the big, solid pieces. Lights, the screen's halo and anything else that is
// not a plain lit or unlit surface are left out.

const TEX = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "bumpMap", "aoMap", "lightMap"] as const;

/** Units that show from outside a closed laptop; the rest sit inside the shell. */
const OUTSIDE = new Set(["keys", "pad", "hinge", "hinge-strip", "panel", "webcam", "odd", "bezel-side", "bezel-top", "bezel-chin"]);
/** Units the far copy keeps. */
const FAR_UNITS = new Set(["pad", "hinge", "hinge-strip", "panel", "bezel-side", "bezel-top", "bezel-chin"]);

function roleOf(o: THREE.Object3D): string | null {
  const box = o.userData.box as { role?: string } | undefined;
  return box?.role ?? null;
}

/** Parts smaller than this (radius, mm) are left off the far copy. */
const FAR_MIN = 30;
/** Unlit parts with more triangles than this (grill holes and slots) are left off the far copy. */
const FAR_DENSE = 200;

type Plain = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshPhysicalMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;

function plain(m: THREE.Material): m is Plain {
  return (
    m instanceof THREE.MeshStandardMaterial ||
    m instanceof THREE.MeshBasicMaterial ||
    m instanceof THREE.MeshLambertMaterial ||
    m instanceof THREE.MeshPhongMaterial
  );
}

const defaultCompile = THREE.Material.prototype.onBeforeCompile;

/** The store's shared materials, one per look. */
export class Looks {
  private byKey = new Map<string, THREE.Material>();

  of(m: Plain): THREE.Material {
    const key = lookKey(m);
    let hit = this.byKey.get(key);
    if (!hit) {
      hit = m.clone();
      this.byKey.set(key, hit);
    }
    return hit;
  }

  get size() {
    return this.byKey.size;
  }

  dispose() {
    for (const m of this.byKey.values()) m.dispose();
    this.byKey.clear();
  }
}

function lookKey(m: Plain): string {
  if (m.onBeforeCompile !== defaultCompile) return `own:${m.uuid}`;
  const a = m as unknown as Record<string, unknown>;
  const parts: unknown[] = [m.type, m.side, m.transparent, m.opacity, m.depthWrite, m.depthTest, m.alphaTest, m.vertexColors, m.toneMapped];
  parts.push(m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.blending);
  for (const k of ["color", "emissive", "specular"]) {
    const c = a[k] as THREE.Color | undefined;
    parts.push(c ? c.getHexString() : "");
  }
  for (const k of ["roughness", "metalness", "emissiveIntensity", "envMapIntensity", "flatShading", "shininess", "wireframe"]) parts.push(a[k]);
  for (const k of TEX) {
    const t = a[k] as THREE.Texture | null | undefined;
    parts.push(t ? t.uuid : "");
  }
  const ns = a.normalScale as THREE.Vector2 | undefined;
  if (ns) parts.push(ns.x, ns.y);
  return parts.join("|");
}

function shown(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/** A geometry with only the attributes the look needs, indexed, in the root's frame. */
function prepared(src: THREE.BufferGeometry, start: number, count: number, at: THREE.Matrix4, uv: boolean, colour: THREE.Color | null, vcol: boolean): THREE.BufferGeometry | null {
  const pos = src.getAttribute("position");
  if (!pos) return null;
  const g = new THREE.BufferGeometry();
  const copy = (name: string) => {
    const attr = src.getAttribute(name);
    if (!attr) return;
    const n = attr.count;
    const size = attr.itemSize;
    const out = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  };
  copy("position");
  copy("normal");
  const n = pos.count;
  if (uv) {
    if (src.getAttribute("uv")) copy("uv");
    else g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (vcol) {
    const c = src.getAttribute("color");
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = c ? c.getX(i) : 1;
      const gg = c ? c.getY(i) : 1;
      const b = c ? c.getZ(i) : 1;
      out[i * 3] = r * (colour?.r ?? 1);
      out[i * 3 + 1] = gg * (colour?.g ?? 1);
      out[i * 3 + 2] = b * (colour?.b ?? 1);
    }
    g.setAttribute("color", new THREE.BufferAttribute(out, 3));
  }
  const index = src.index;
  const end = Math.min(start + count, index ? index.count : n);
  const idx: number[] = [];
  for (let i = start; i + 2 < end; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    idx.push(a, b, c);
  }
  if (idx.length === 0) return null;
  if (at.determinant() < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.setIndex(idx);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  g.applyMatrix4(at);
  return g;
}

export interface Baked {
  /** Near and far copies under one LOD. */
  object: THREE.LOD;
  triangles: number;
  dispose(): void;
}

/** A static, merged copy of everything visible under `root`. */
export function bake(root: THREE.Object3D, looks: Looks, farAt: number): Baked {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const near = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const far = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const sphere = new THREE.Sphere();
  const scale = new THREE.Vector3();
  const add = (into: Map<THREE.Material, THREE.BufferGeometry[]>, m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = into.get(m) ?? [];
    list.push(g);
    into.set(m, list);
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !shown(mesh, root)) return;
    const role = roleOf(mesh);
    if (role !== null && !OUTSIDE.has(role) && !role.startsWith("port:")) return;
    const farUnit = role === null || FAR_UNITS.has(role);
    const geo = mesh.geometry;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) && geo.groups.length ? geo.groups : [{ start: 0, count: Number.POSITIVE_INFINITY, materialIndex: 0 }];
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const base = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const copies: { at: THREE.Matrix4; colour: THREE.Color | null }[] = [];
    if (inst) {
      const im = new THREE.Matrix4();
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, im);
        const colour = inst.instanceColor ? new THREE.Color() : null;
        if (colour) inst.getColorAt(i, colour);
        copies.push({ at: base.clone().multiply(im), colour });
      }
    } else copies.push({ at: base, colour: null });
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    for (const grp of groups) {
      const src = mats[grp.materialIndex ?? 0];
      if (!src || !plain(src) || !src.visible) continue;
      const vcol = src.vertexColors || !!inst?.instanceColor;
      const look = vcol && !src.vertexColors ? (() => {
        const c = src.clone();
        c.vertexColors = true;
        const l = looks.of(c);
        c.dispose();
        return l;
      })() : looks.of(src);
      const uv = TEX.some((k) => !!(src as unknown as Record<string, unknown>)[k]);
      for (const c of copies) {
        const g = prepared(geo, grp.start, grp.count, c.at, uv, c.colour, vcol);
        if (!g) continue;
        add(near, look, g);
        { const w = window as unknown as { __bakeStats?: Record<string, number> }; const st = (w.__bakeStats ??= {}); const nm = `${role}/${mesh.name}/${mesh.parent?.name ?? ""}/${src.type}/${geo.type}`; st[nm] = (st[nm] ?? 0) + (g.index?.count ?? 0) / 3; } // PROBE
        sphere.copy(geo.boundingSphere as THREE.Sphere);
        c.at.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        const r = sphere.radius * Math.max(scale.x, scale.y, scale.z);
        // Grills and decals are fine detail: dense holes and slots, or pushed onto a surface.
        const fine = src.polygonOffset || (src instanceof THREE.MeshBasicMaterial && (g.index?.count ?? 0) > FAR_DENSE * 3);
        if (farUnit && r >= FAR_MIN && !src.transparent && !fine) add(far, look, g.clone());
      }
    }
  });
  const owned: THREE.BufferGeometry[] = [];
  let triangles = 0;
  const merged = (parts: Map<THREE.Material, THREE.BufferGeometry[]>, count: boolean) => {
    const group = new THREE.Group();
    for (const [m, geos] of parts) {
      const g = mergeGeometries(geos);
      for (const x of geos) x.dispose();
      if (!g) continue;
      owned.push(g);
      if (count) triangles += (g.index?.count ?? 0) / 3;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.matrixAutoUpdate = false;
    return group;
  };
  const lod = new THREE.LOD();
  lod.addLevel(merged(near, true), 0);
  lod.addLevel(merged(far, false), farAt);
  return {
    object: lod,
    triangles,
    dispose() {
      for (const g of owned) g.dispose();
    },
  };
}
