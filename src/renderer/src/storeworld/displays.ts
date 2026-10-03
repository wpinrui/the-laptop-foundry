import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type Layout, type Table, TABLE, TABLE_Y } from "./layout";
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

/** A table's sign: its maker, or the company on the player's own, and its price range. */
function drawHeader(g: CanvasRenderingContext2D, w: number, h: number, t: Table) {
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, h);
  g.fillStyle = YEL;
  g.fillRect(0, h - 12, w, 12);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines: [string, number, string][] = [
    [t.label.toUpperCase(), 72, '700 72px "Barlow Condensed"'],
    [range(t.low, t.high), 44, '700 44px "Barlow Condensed"'],
  ];
  const gap = 10;
  let y = (h - 12 - (lines.reduce((n, [, size]) => n + size, 0) + gap * (lines.length - 1))) / 2;
  for (const [text, size, font] of lines) {
    g.font = font;
    g.fillText(text, w / 2, y + size / 2, w - 40);
    y += size + gap;
  }
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
  const edgeM = std("#8a8d93", 0.5);
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
  const body = box(TABLE.w - 0.2, TABLE_Y - 0.1, TABLE.d - 0.2);
  const plinth = box(TABLE.w - 0.3, 0.06, TABLE.d - 0.3);
  const edge = box(TABLE.w, 0.05, 0.012);
  const stripe = box(TABLE.w - 0.2, 0.04, 0.01);
  // The sign stands on two posts along the table's back edge, over the laptops' lids.
  const SIGN = { w: 1.2, h: 0.4, y: TABLE_Y + 0.62, post: 0.5 };
  const post = box(0.03, SIGN.y - TABLE_Y, 0.03);
  const card = box(SIGN.w, SIGN.h, 0.012);
  const puck = new THREE.CylinderGeometry(0.02, 0.024, 0.012, 24);
  const acr = box(0.22, 0.004, 0.06);
  owned.push(puck);

  layout.tables.forEach((t) => {
    put(shadowParts, topM, top, m4(t.x, TABLE_Y - 0.02, t.z));
    put(shadowParts, bodyM, body, m4(t.x, (TABLE_Y - 0.1) / 2 + 0.06, t.z));
    put(shadowParts, plinthM, plinth, m4(t.x, 0.03, t.z));
    for (const s of [-1, 1]) {
      put(parts, edgeM, edge, m4(t.x, TABLE_Y - 0.025, t.z + s * (TABLE.d / 2 + 0.006)));
      put(parts, stripeM, stripe, m4(t.x, TABLE_Y - 0.2, t.z + s * ((TABLE.d - 0.2) / 2 + 0.005)));
    }
    const hdr = canvasTexture(600, 200, (g) =>
      drawHeader(g, 600, 200, t),
    );
    owned.push(hdr);
    const hm = std("#ffffff", 0.4, 0, { map: hdr });
    const back = t.z - TABLE.d / 2 + 0.03;
    for (const end of [-1, 1]) put(parts, postM, post, m4(t.x + end * SIGN.post, (TABLE_Y + SIGN.y) / 2, back));
    const c = new THREE.Mesh(card, [bodyM, bodyM, bodyM, bodyM, hm, bodyM]);
    c.position.set(t.x, SIGN.y, back);
    c.castShadow = true;
    c.receiveShadow = true;
    group.add(c);
  });

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
    const tz = layout.tables[s.table].z + s.side * (TABLE.d / 2 - 0.05);
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
    put(parts, acrylicM, acr, m4(s.x, TABLE_Y + 0.002, tz, ry));
    const plane = new THREE.PlaneGeometry(0.2, 0.14);
    const u0 = (i % ATLAS_COLS) / ATLAS_COLS;
    const v1 = 1 - Math.floor(i / ATLAS_COLS) / rows;
    const du = 1 / ATLAS_COLS;
    const dv = 1 / rows;
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++)
      uv.setXY(k, u0 + uv.getX(k) * du, v1 - dv + uv.getY(k) * dv);
    const at = new THREE.Matrix4()
      .multiply(m4(s.x, TABLE_Y, tz, ry))
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
