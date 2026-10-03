import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type DepartmentName, type Layout, ROOM, type Table, TABLE, TABLE_Y } from "./layout";
import type { OnSale } from "./onSale";
import { full } from "../ui/number";

// The display tables, their maker signs and each laptop's price tag, security
// puck and cable, built from the designer's buildDisplays in metres. The
// laptops themselves are the game's models, placed separately. Everything
// here shares its materials and merges into a handful of meshes; the price
// tags share one texture atlas.

export const BLUE = "#1d5fbf";
export const YEL = "#f7c600";
export const BLUE_D = "#123a80";
/** Each department's colour, on its tables' edges and its overhead sign's trim. Kept off blue so the trim shows on the signs. */
export const DEPT: Record<DepartmentName, string> = {
  MacBook: "#8a8d93",
  Gaming: "#e2231a",
  Budget: "#2e9e4f",
  Creator: "#d81b60",
  Business: "#455a64",
  "Thin and Light": "#00a6a6",
  Everyday: "#f28c28",
};
/** A label without a colour of its own. */
const DEPT_OTHER = "#9a9a96";
/** The player's own table: the store's yellow. */
const DEPT_OWN = YEL;
const deptColour = (label: string, own: boolean) =>
  own ? DEPT_OWN : ((DEPT as Record<string, string>)[label] ?? DEPT_OTHER);

const TAG_W = 512;
const TAG_H = 360;
const ATLAS_COLS = 8;

const usd = (n: number) => full(n, true);
/** "$499 to $1,299", or the one price when they match. */
const range = (low: number, high: number) =>
  Math.round(low) === Math.round(high) ? usd(low) : `${usd(low)} to ${usd(high)}`;

/** The tag's flag, if any: sold out, a top three seller, or launched this quarter. */
export function flagOf(
  l: OnSale,
): { text: string; bg: string; fg: string } | null {
  if (l.stock !== null && l.stock <= 0)
    return { text: "SOLD OUT", bg: "#4a4a4f", fg: "#fff" };
  if (l.rank !== null && l.rank <= 3)
    return { text: "BEST SELLER", bg: YEL, fg: BLUE_D };
  if (l.isNew) return { text: "NEW", bg: "#e2231a", fg: "#fff" };
  return null;
}

/** The spec lines a tag prints, empty parts dropped. */
export function tagLines(l: OnSale): string[][] {
  const s = l.spec;
  return [
    [s.cpu],
    [s.display],
    [s.memory, s.storage],
    [s.battery, l.kg ? `${Math.round(l.kg * 100) / 100} kg` : ""],
  ]
    .map((parts) => parts.filter(Boolean))
    .filter((parts) => parts.length > 0);
}

function drawTag(g: CanvasRenderingContext2D, l: OnSale) {
  const w = TAG_W;
  const h = TAG_H;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 64);
  g.fillStyle = "#fff";
  g.font = '700 38px "Barlow Condensed"';
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(l.brand.toUpperCase(), 24, 34, w - 220);
  const flag = flagOf(l);
  if (flag) {
    g.font = '700 26px "Barlow Condensed"';
    const bw = g.measureText(flag.text).width + 24;
    g.fillStyle = flag.bg;
    g.fillRect(w - bw - 16, 14, bw, 36);
    g.fillStyle = flag.fg;
    g.textAlign = "center";
    g.fillText(flag.text, w - 16 - bw / 2, 33);
  }
  g.fillStyle = "#111";
  g.textAlign = "left";
  let fs = 44;
  g.font = `700 ${fs}px "Barlow Condensed"`;
  while (g.measureText(l.name).width > w - 48 && fs > 26) {
    fs -= 2;
    g.font = `700 ${fs}px "Barlow Condensed"`;
  }
  g.fillText(l.name, 24, 102, w - 48);
  g.fillStyle = "#4a4a4f";
  g.font = '500 21px "IBM Plex Sans"';
  tagLines(l)
    .slice(0, 4)
    .forEach((parts, i) => {
      let x = 24;
      for (const p of parts) {
        g.fillText(p, x, 146 + i * 28, w - 24 - x);
        x += Math.min(g.measureText(p).width, w - 24 - x) + 22;
      }
    });
  g.fillStyle = YEL;
  g.fillRect(0, 262, w, 98);
  g.fillStyle = BLUE_D;
  g.font = '700 84px "Barlow Condensed"';
  g.textBaseline = "alphabetic";
  g.fillText(usd(l.price), 22, 342);
}

function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A table's sign: its department, or the company on the player's own, its price range and its makers. */
function drawHeader(g: CanvasRenderingContext2D, w: number, h: number, t: Table) {
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, h);
  g.fillStyle = YEL;
  g.fillRect(0, h - 12, w, 12);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines: [string, number, string][] = [
    [t.label.toUpperCase(), 64, '700 64px "Barlow Condensed"'],
    [range(t.low, t.high), 40, '700 40px "Barlow Condensed"'],
  ];
  if (!t.own) {
    const shown = t.makers.slice(0, 3).join(", ");
    lines.push([t.makers.length > 3 ? `${shown} +${t.makers.length - 3}` : shown, 26, '500 26px "IBM Plex Sans"']);
  }
  const gap = 10;
  let y = (h - 12 - (lines.reduce((n, [, size]) => n + size, 0) + gap * (lines.length - 1))) / 2;
  for (const [text, size, font] of lines) {
    g.font = font;
    g.fillText(text, w / 2, y + size / 2, w - 40);
    y += size + gap;
  }
}

/** The overhead sign over a department: its name, or the company's, the trim in its colour. */
function drawOverhead(g: CanvasRenderingContext2D, w: number, h: number, label: string, colour: string) {
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, h);
  g.fillStyle = YEL;
  g.fillRect(0, h - 34, w, 6);
  g.fillStyle = colour;
  g.fillRect(0, h - 28, w, 28);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '700 170px "Barlow Condensed"';
  g.fillText(label.toUpperCase(), w / 2, (h - 34) / 2 + 8, w - 60);
}

type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;

function put(
  parts: Parts,
  m: THREE.Material,
  geo: THREE.BufferGeometry,
  at: THREE.Matrix4,
) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(at);
  for (const k of Object.keys(g.attributes))
    if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  const list = parts.get(m) ?? [];
  list.push(g);
  parts.set(m, list);
}

const m4 = (x: number, y: number, z: number, ry = 0, rx = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, "YXZ")),
    new THREE.Vector3(1, 1, 1),
  );

export interface Displays {
  group: THREE.Group;
  dispose(): void;
}

/** The tables, signs, tags and fittings for a layout, in metres. */
export function buildDisplays(layout: Layout): Displays {
  const group = new THREE.Group();
  group.name = "displays";
  const owned: { dispose(): void }[] = [];
  const std = (
    color: string,
    roughness: number,
    metalness = 0,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra,
    });
    owned.push(m);
    return m;
  };
  const topM = std("#fbfbf9", 0.35);
  const bodyM = std("#e4e4e1", 0.7);
  const plinthM = std("#9a9a96", 0.6);
  // One edge material per department colour.
  const edges = new Map<string, THREE.Material>();
  const edgeOf = (c: string) => {
    let m = edges.get(c);
    if (!m) {
      m = std(c, 0.5);
      edges.set(c, m);
    }
    return m;
  };
  const stripeM = std(YEL, 0.5);
  const postM = std("#b8bcc2", 0.3, 0.8);
  const puckM = std("#2a2b2e", 0.4, 0.5);
  const cableM = std("#1b1b1d", 0.5);
  const acrylicM = std("#e8f0f6", 0.05, 0, { transparent: true, opacity: 0.5 });
  const box = (w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    owned.push(g);
    return g;
  };
  const parts: Parts = new Map();
  const shadowParts: Parts = new Map();

  const top = box(TABLE.w, 0.04, TABLE.d);
  const body = box(2.4, TABLE_Y - 0.1, 0.9);
  const plinth = box(2.3, 0.06, 0.8);
  const edge = box(TABLE.w, 0.05, 0.012);
  const stripe = box(2.4, 0.04, 0.01);
  const post = box(0.03, 0.5, 0.03);
  const card = box(0.012, 0.28, 0.84);
  const puck = new THREE.CylinderGeometry(0.02, 0.024, 0.012, 24);
  const acr = box(0.22, 0.004, 0.06);
  owned.push(puck);

  layout.tables.forEach((t) => {
    put(shadowParts, topM, top, m4(t.x, TABLE_Y - 0.02, t.z));
    put(shadowParts, bodyM, body, m4(t.x, (TABLE_Y - 0.1) / 2 + 0.06, t.z));
    put(shadowParts, plinthM, plinth, m4(t.x, 0.03, t.z));
    for (const s of [-1, 1]) {
      put(parts, edgeOf(deptColour(t.label, t.own)), edge, m4(t.x, TABLE_Y - 0.025, t.z + s * 0.556));
      put(parts, stripeM, stripe, m4(t.x, TABLE_Y - 0.2, t.z + s * 0.455));
    }
    const hdr = canvasTexture(600, 200, (g) =>
      drawHeader(g, 600, 200, t),
    );
    owned.push(hdr);
    const hm = std("#ffffff", 0.4, 0, { map: hdr });
    for (const end of [-1, 1]) {
      put(parts, postM, post, m4(t.x + end * 1.2, TABLE_Y + 0.25, t.z));
      const c = new THREE.Mesh(card, [hm, hm, bodyM, bodyM, bodyM, bodyM]);
      c.position.set(t.x + end * 1.2, TABLE_Y + 0.62, t.z);
      c.castShadow = true;
      c.receiveShadow = true;
      group.add(c);
    }
  });

  // One sign over each department, centred over its tables and hung from the
  // ceiling. Read from the entrance, so each row back hangs a little higher.
  const SIGN = { w: 2.4, h: 0.55, d: 0.04 };
  const sign = box(SIGN.w, SIGN.h, SIGN.d);
  for (const d of layout.departments) {
    const at = d.tables.map((i) => layout.tables[i]);
    const x = at.reduce((n, t) => n + t.x, 0) / at.length;
    const z = at.reduce((n, t) => n + t.z, 0) / at.length;
    const y = Math.min(ROOM.h - 0.15 - SIGN.h / 2, 2.95 + (4.1 - z) * 0.09);
    const face = canvasTexture(1200, 275, (g) => drawOverhead(g, 1200, 275, d.label, deptColour(d.label, d.own)));
    owned.push(face);
    const fm = std("#ffffff", 0.4, 0, { map: face, emissive: "#ffffff", emissiveMap: face, emissiveIntensity: 0.25 });
    const s = new THREE.Mesh(sign, [bodyM, bodyM, bodyM, bodyM, fm, fm]);
    s.position.set(x, y, z);
    group.add(s);
    const wire = box(0.008, ROOM.h - y - SIGN.h / 2, 0.008);
    for (const end of [-1, 1]) put(parts, postM, wire, m4(x + end * (SIGN.w / 2 - 0.15), (ROOM.h + y + SIGN.h / 2) / 2, z));
  }

  // One atlas for every price tag.
  const n = layout.seats.length;
  const rows = Math.max(1, Math.ceil(n / ATLAS_COLS));
  const atlas = canvasTexture(TAG_W * ATLAS_COLS, TAG_H * rows, (g) => {
    layout.seats.forEach((s, i) => {
      g.save();
      g.translate((i % ATLAS_COLS) * TAG_W, Math.floor(i / ATLAS_COLS) * TAG_H);
      g.beginPath();
      g.rect(0, 0, TAG_W, TAG_H);
      g.clip();
      drawTag(g, s.item);
      g.restore();
    });
  });
  owned.push(atlas);
  const tagM = std("#ffffff", 0.45, 0, { map: atlas });
  const tagGeos: THREE.BufferGeometry[] = [];

  layout.seats.forEach((s, i) => {
    const ry = s.side > 0 ? 0 : Math.PI;
    const sz = s.z - s.side * 0.2;
    // The tag stands at the table's edge, wherever the laptop sits.
    const tz = layout.tables[s.table].z;
    // The puck and its cable beside the laptop, on the aisle side.
    const px = s.x + s.side * 0.2;
    put(parts, puckM, puck, m4(px, TABLE_Y + 0.006, sz + s.side * 0.05));
    const cable = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, TABLE_Y + 0.01, sz + s.side * 0.05),
        new THREE.Vector3(
          px - s.side * 0.01,
          TABLE_Y + 0.006,
          sz + s.side * 0.12,
        ),
        new THREE.Vector3(
          px - s.side * 0.045,
          TABLE_Y + 0.01,
          sz + s.side * 0.2,
        ),
      ]),
      12,
      0.003,
      6,
    );
    put(parts, cableM, cable, new THREE.Matrix4());
    cable.dispose();
    // The tag on its acrylic stand at the aisle edge.
    put(parts, acrylicM, acr, m4(s.x, TABLE_Y + 0.002, tz + s.side * 0.47, ry));
    const plane = new THREE.PlaneGeometry(0.2, 0.14);
    const u0 = (i % ATLAS_COLS) / ATLAS_COLS;
    const v1 = 1 - Math.floor(i / ATLAS_COLS) / rows;
    const du = 1 / ATLAS_COLS;
    const dv = 1 / rows;
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++)
      uv.setXY(k, u0 + uv.getX(k) * du, v1 - dv + uv.getY(k) * dv);
    const at = new THREE.Matrix4()
      .multiply(m4(s.x, TABLE_Y, tz + s.side * 0.47, ry))
      .multiply(m4(0, 0.066, -0.005, 0, -0.45));
    tagGeos.push(plane.applyMatrix4(at));
  });

  const merge = (p: Parts, cast: boolean) => {
    for (const [m, geos] of p) {
      const g = mergeGeometries(geos);
      for (const x of geos) x.dispose();
      if (!g) continue;
      owned.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  merge(shadowParts, true);
  merge(parts, false);
  if (tagGeos.length) {
    const g = mergeGeometries(tagGeos);
    for (const x of tagGeos) x.dispose();
    if (g) {
      owned.push(g);
      const mesh = new THREE.Mesh(g, tagM);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return {
    group,
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}
