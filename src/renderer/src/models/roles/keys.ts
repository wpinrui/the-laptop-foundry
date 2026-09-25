import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION KEYBOARD: keycaps on a plate, six rows.
//
// The box is the engine's footprint: (cols - 0.5) x pitch + 4 wide by
// 6 x pitch + 4 deep, a 2 mm frame each side. Pitch is read back from the box,
// so the caps always fill it exactly. Layout, back (-z) to front (+z):
//   row 0: short function row; rows 1 to 4: the main block;
//   row 5: modifiers, space bar and an inverted-T of half-height arrows.
// 19 columns add a 4-wide numpad on the right, with tall + and Enter keys.
// 2006: tall sculpted caps (tapered sides, cylindrical dish, per-row tilt),
//       narrow gaps, on a metal plate.
// 2026: flat chiclet caps with a rounded top edge and wide gaps; the low-profile
//       mechanical part adds switch housings under taller caps.
// Travel sets the cap height. Legends are stroke geometry on the cap tops:
// plastic when unlit, glow when lit, with a glow halo round each cap.
// rgb-zones splits the glow into four meshes (glow:zone:0 to 3, left to right);
// rgb-per-key gives each key its own glow mesh (glow:key:<n>).
//
// All geometry is merged into a handful of meshes, built at identity in model
// space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number];

const TRAVEL: Record<string, number> = {
  "kb-2.5": 2.5,
  "kb-3.0": 3.0,
  "kb-1.0": 1.0,
  "kb-1.5": 1.5,
  "kb-mech-1.8": 1.8,
};

// Stroke font on a 4 by 6 grid, y up. Each polyline is a run of "xy" digit pairs.
const GLYPH_SRC: Record<string, string> = {
  A: "002640|1333",
  B: "00063645443303|3342413000",
  C: "4536160501103041",
  D: "00062645412000",
  E: "40000646|0333",
  F: "000646|0333",
  G: "45361605011030414323",
  H: "0006|4046|0343",
  I: "1636|2620|1030",
  J: "0110203136|1646",
  K: "0006|4602|1340",
  L: "060040",
  M: "0006234640",
  N: "00064046",
  O: "100105163645413010",
  P: "00063645443303",
  Q: "100105163645413010|2240",
  R: "00063645443303|2340",
  S: "453616050413334241301001",
  T: "0646|2620",
  U: "060110304146",
  V: "062046",
  W: "0610233046",
  X: "0046|0640",
  Y: "0623|4623|2320",
  Z: "06460040",
  "0": "100105163645413010|0145",
  "1": "152620|1030",
  "2": "05163645440040",
  "3": "0516364544334241301001|1333",
  "4": "30360242",
  "5": "460603334241301001",
  "6": "36160501103041423303",
  "7": "064610",
  "8": "13040516364544331302011030414233",
  "9": "43130405163645413010",
  "-": "0343",
  "=": "0242|0444",
  "[": "36161030",
  "]": "16363010",
  "\\": "0640",
  ";": "2524|2211",
  "'": "2624",
  ",": "2210",
  ".": "2021",
  "/": "0046",
  "`": "1625",
  "*": "2125|0442|0244",
  "+": "2125|0343",
  "@shift": "1013032643333010",
  "@enter": "464202|130211",
  "@bksp": "4303|140312",
  "@tab": "0333|243322|4541",
  "@caps": "032543|1131",
  "@up": "032543|2521",
  "@down": "032143|2125",
  "@left": "351331|1343",
  "@right": "153311|3303",
  "@win": "0006464000|2026|0343",
};

const GLYPHS: Record<string, P2[][]> = {};
for (const k of Object.keys(GLYPH_SRC))
  GLYPHS[k] = GLYPH_SRC[k].split("|").map((s) => {
    const pts: P2[] = [];
    for (let i = 0; i + 1 < s.length; i += 2) pts.push([+s[i], +s[i + 1]]);
    return pts;
  });

interface KeySpec {
  x: number; // left edge, in key units from the left of the key area
  w: number; // width in key units
  row: number;
  span: number; // rows spanned (numpad + and Enter span two)
  zf: number; // centre offset within the row span, in pitches (+ is front)
  df: number; // cap depth as a fraction of the span
  legend: string;
}

function layout(numpad: boolean): KeySpec[] {
  const keys: KeySpec[] = [];
  const row = (r: number, x0: number, items: [string, number][], df = 1, zf = 0) => {
    let x = x0;
    for (const [legend, w] of items) {
      keys.push({ x, w, row: r, span: 1, zf, df, legend });
      x += w;
    }
  };
  const ones = (s: string): [string, number][] => s.split("").map((c) => [c, 1]);
  const fn: [string, number][] = [["ESC", 1]];
  for (let i = 1; i <= 12; i++) fn.push([`F${i}`, 1]);
  fn.push(["DEL", 1.5]);
  row(0, 0, fn, 0.72, 0.1);
  row(1, 0, [...ones("`1234567890-="), ["@bksp", 1.5]]);
  row(2, 0, [["@tab", 1.5], ...ones("QWERTYUIOP[]"), ["\\", 1]]);
  row(3, 0, [["@caps", 1.75], ...ones("ASDFGHJKL;'"), ["@enter", 1.75]]);
  row(4, 0, [["@shift", 2.25], ...ones("ZXCVBNM,./"), ["@shift", 2.25]]);
  row(5, 0, [["CTRL", 1], ["FN", 1], ["@win", 1], ["ALT", 1], ["", 5.5], ["ALT", 1], ["CTRL", 1]]);
  const ax = 11.5;
  const half = (x: number, zf: number, legend: string) =>
    keys.push({ x, w: 1, row: 5, span: 1, zf, df: 0.5, legend });
  half(ax, 0.25, "@left");
  half(ax + 1, -0.25, "@up");
  half(ax + 1, 0.25, "@down");
  half(ax + 2, 0.25, "@right");
  if (numpad) {
    const n = 14.5;
    const tall = (x: number, r: number, legend: string) =>
      keys.push({ x, w: 1, row: r, span: 2, zf: 0, df: 1, legend });
    row(0, n, [["HOME", 1], ["END", 1], ["PGUP", 1], ["PGDN", 1]], 0.72, 0.1);
    row(1, n, [["NUM", 1], ["/", 1], ["*", 1], ["-", 1]]);
    row(2, n, ones("789"));
    tall(n + 3, 2, "+");
    row(3, n, ones("456"));
    row(4, n, ones("123"));
    tall(n + 3, 4, "@enter");
    row(5, n, [["0", 2], [".", 1]]);
  }
  return keys;
}

/** Merged, indexed triangle buffer. Faces are wound to point along a given direction. */
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number): number {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }
  private normalOf(a: number, b: number, c: number): [number, number, number] {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const wx = p[c * 3] - ax, wy = p[c * 3 + 1] - ay, wz = p[c * 3 + 2] - az;
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  }
  tri(a: number, b: number, c: number, ex: number, ey: number, ez: number): void {
    const n = this.normalOf(a, b, c);
    if (n[0] * ex + n[1] * ey + n[2] * ez >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }
  quad(a: number, b: number, c: number, d: number, ex: number, ey: number, ez: number): void {
    let n = this.normalOf(a, b, c);
    if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-9) n = this.normalOf(a, c, d);
    if (n[0] * ex + n[1] * ey + n[2] * ez >= 0) this.idx.push(a, b, c, a, c, d);
    else this.idx.push(a, c, b, a, d, c);
  }
  /** Axis-aligned box; the bottom face is optional. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, bottom: boolean): void {
    const c = [
      this.v(x0, y0, z0), this.v(x1, y0, z0), this.v(x1, y0, z1), this.v(x0, y0, z1),
      this.v(x0, y1, z0), this.v(x1, y1, z0), this.v(x1, y1, z1), this.v(x0, y1, z1),
    ];
    this.quad(c[4], c[5], c[6], c[7], 0, 1, 0);
    if (bottom) this.quad(c[0], c[1], c[2], c[3], 0, -1, 0);
    this.quad(c[3], c[2], c[6], c[7], 0, 0, 1);
    this.quad(c[0], c[1], c[5], c[4], 0, 0, -1);
    this.quad(c[1], c[2], c[6], c[5], 1, 0, 0);
    this.quad(c[0], c[3], c[7], c[4], -1, 0, 0);
  }
  /** Flat horizontal rectangle facing up. */
  rect(x0: number, x1: number, z0: number, z1: number, y: number): void {
    this.quad(this.v(x0, y, z0), this.v(x1, y, z0), this.v(x1, y, z1), this.v(x0, y, z1), 0, 1, 0);
  }
  mesh(mat: THREE.Material, name: string): THREE.Mesh | undefined {
    if (this.idx.length === 0) return undefined;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    return m;
  }
}

/** Rounded-rectangle outline in plan, anticlockwise from the +x side. Same count for the same cs. */
function roundRect(cx: number, cz: number, hw: number, hd: number, r: number, cs: number): P2[] {
  const rr = Math.max(0.05, Math.min(r, hw - 0.01, hd - 0.01));
  const out: P2[] = [];
  const corners: [number, number, number][] = [
    [1, 1, 0],
    [-1, 1, Math.PI / 2],
    [-1, -1, Math.PI],
    [1, -1, 1.5 * Math.PI],
  ];
  for (const [sx, sz, a0] of corners)
    for (let i = 0; i <= cs; i++) {
      const a = a0 + (i / cs) * (Math.PI / 2);
      out.push([cx + sx * (hw - rr) + rr * Math.cos(a), cz + sz * (hd - rr) + rr * Math.sin(a)]);
    }
  return out;
}

type Surf = (x: number, z: number) => number;

/** A ring of vertices on a plan outline, at a fixed height or on a surface. */
function ringAt(b: Buf, pts: P2[], y: number | Surf): number[] {
  return pts.map(([x, z]) => b.v(x, typeof y === "number" ? y : y(x, z), z));
}

/** Side band between two matching rings, facing out from (cx, cz). */
function band(b: Buf, lo: number[], hi: number[], pts: P2[], cx: number, cz: number): void {
  const n = lo.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = (pts[i][0] + pts[j][0]) / 2 - cx;
    const ez = (pts[i][1] + pts[j][1]) / 2 - cz;
    b.quad(lo[i], lo[j], hi[j], hi[i], ex, 0, ez);
  }
}

/** Legend strokes: one flat quad per segment, square-capped so joints close, lying on the cap top. */
function legend(
  b: Buf,
  text: string,
  cx: number,
  cz: number,
  h: number,
  sw: number,
  surf: Surf,
  lift: number,
): void {
  const glyphs = text.startsWith("@") ? [GLYPHS[text]] : text.split("").map((c) => GLYPHS[c]);
  const u = h / 6;
  const n = glyphs.length;
  let x0 = cx - ((n * 4 + (n - 1) * 1.5) * u) / 2;
  const hw = sw / 2;
  const p = (x: number, z: number) => b.v(x, surf(x, z) + lift, z);
  for (const g of glyphs) {
    if (g)
      for (const line of g) {
        const pts: P2[] = line.map(([gx, gy]) => [x0 + gx * u, cz - (gy - 3) * u]);
        const n = pts.length;
        const closed = n > 2 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1];
        // Unit direction of each segment.
        const dir: P2[] = [];
        for (let i = 0; i + 1 < n; i++) {
          const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
          const l = Math.hypot(dx, dz) || 1;
          dir.push([dx / l, dz / l]);
        }
        // Mitred offsets at every point; open ends are square-capped by half the stroke.
        const L: P2[] = [];
        const R: P2[] = [];
        for (let i = 0; i < n; i++) {
          let a = dir[i - 1], c = dir[i];
          if (closed && i === 0) a = dir[n - 2];
          if (closed && i === n - 1) c = dir[0];
          let [x, z] = pts[i];
          let mx: number, mz: number, k = 1;
          if (a && c) {
            mx = -(a[1] + c[1]);
            mz = a[0] + c[0];
            const ml = Math.hypot(mx, mz);
            if (ml < 1e-6) { mx = -c[1]; mz = c[0]; }
            else { mx /= ml; mz /= ml; k = Math.min(2.2, 1 / Math.max(0.3, mx * -c[1] + mz * c[0])); }
          } else {
            const d = (c ?? a) as P2;
            mx = -d[1];
            mz = d[0];
            const sgn = c ? -1 : 1;
            x += d[0] * hw * sgn;
            z += d[1] * hw * sgn;
          }
          L.push([x + mx * hw * k, z + mz * hw * k]);
          R.push([x - mx * hw * k, z - mz * hw * k]);
        }
        let pl = p(L[0][0], L[0][1]), pr = p(R[0][0], R[0][1]);
        for (let i = 1; i < n; i++) {
          const nl = p(L[i][0], L[i][1]), nr = p(R[i][0], R[i][1]);
          b.quad(pl, nl, nr, pr, 0, 1, 0);
          pl = nl;
          pr = nr;
        }
      }
    x0 += 5.5 * u;
  }
}

function build(
  box: ModelBox,
  options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const modern = ctx.year >= 2015;
  const part = ctx.part ?? (modern ? "kb-1.0" : "kb-2.5");
  const travel = TRAVEL[part] ?? (modern ? 1.0 : 2.5);
  const mech = part.includes("mech");
  const cols = Number(options.cols) === 19 ? 19 : 15;
  const light = String(options.light ?? "none");
  const lit = light === "backlit" || light === "white" || light.startsWith("rgb");

  const W = box.width;
  const H = box.height;
  const D = box.depth;
  const yBot = -H / 2;
  const yTop = H / 2;
  const frame = 2;
  const px = (W - 2 * frame) / (cols - 0.5);
  const pz = (D - 2 * frame) / 6;
  const p = Math.min(px, pz);

  // Vertical stack: plate at the bottom, cap tops at the top of the box.
  const plateT = modern ? Math.min(0.5, 0.18 * H) : Math.min(0.8, 0.14 * H);
  const plateTop = yBot + plateT;
  const wantCap = modern ? (mech ? 2.4 : 0.4 + 0.8 * travel) : 1.3 + travel;
  const capH = Math.max(0.6, Math.min(wantCap, yTop - plateTop - 0.2));
  const capBot = yTop - capH;

  const caps = new Buf();
  const ink = new Buf();
  const switches = new Buf();
  const plate = new Buf();
  const glow = new Map<string, Buf>();
  const glowBuf = (id: string) => {
    let b = glow.get(id);
    if (!b) glow.set(id, (b = new Buf()));
    return b;
  };

  plate.box(-W / 2, W / 2, yBot, plateTop, -D / 2, D / 2, true);

  // Sculpted profile (2006): per-row tilt (+ raises the front edge) and drop below the box top.
  const TILT = [-0.3, -0.4, -0.2, 0, 0.2, 0.3];
  const DROP = [0.25, 0, 0.15, 0.3, 0.2, 0.15];
  const dish = Math.min(0.35, 0.1 * capH);
  const cs = 4;

  const specs = layout(cols === 19);
  specs.forEach((k, n) => {
    const kw = k.w * px;
    const spanD = k.span * pz;
    const cx = -W / 2 + frame + (k.x + k.w / 2) * px;
    const cz = -D / 2 + frame + k.row * pz + spanD / 2 + k.zf * pz;
    const kd = k.df * spanD;

    let hw0: number, hd0: number, gap: number, rB: number;
    let hwT: number, hdT: number; // top face extents, for legend fitting
    let surf: Surf;
    let lift: number;

    if (!modern) {
      gap = 0.045 * p;
      hw0 = kw / 2 - gap / 2;
      hd0 = kd / 2 - gap / 2;
      const taper = Math.min(0.085 * p, 0.28 * Math.min(hw0, hd0));
      const hw1 = hw0 - taper;
      const hd1 = hd0 - taper;
      const tilt = k.span > 1 ? 0 : TILT[k.row];
      const drop = k.span > 1 ? 0.2 : DROP[k.row];
      const yT = yTop - Math.abs(tilt) - drop;
      surf = (x, z) => {
        const xn = Math.max(-1, Math.min(1, (x - cx) / hw1));
        const zn = Math.max(-1, Math.min(1, (z - cz) / hd1));
        return yT - dish * (1 - xn * xn) + tilt * zn;
      };
      lift = 0.05;
      const r0 = 0.07 * p;
      rB = r0;
      const r1 = 0.1 * p;
      const bp = roundRect(cx, cz, hw0, hd0, r0, cs);
      const mp = roundRect(cx, cz, hw0 - 0.3 * taper, hd0 - 0.3 * taper, (r0 + r1) / 2, cs);
      const tp = roundRect(cx, cz, hw1, hd1, r1, cs);
      const yMid = capBot + 0.5 * (yT - dish - Math.abs(tilt) - capBot);
      const B = ringAt(caps, bp, capBot);
      const M = ringAt(caps, mp, yMid);
      const T = ringAt(caps, tp, surf);
      band(caps, B, M, bp, cx, cz);
      band(caps, M, T, tp, cx, cz);
      // Dished top: a separate ring for a crisp edge, an inner ring, and the centre.
      const T2 = ringAt(caps, tp, surf);
      const ip: P2[] = tp.map(([x, z]) => [cx + 0.55 * (x - cx), cz + 0.55 * (z - cz)]);
      const I = ringAt(caps, ip, surf);
      const C = caps.v(cx, surf(cx, cz), cz);
      for (let i = 0; i < T2.length; i++) {
        const j = (i + 1) % T2.length;
        caps.quad(T2[i], T2[j], I[j], I[i], 0, 1, 0);
        caps.tri(I[i], I[j], C, 0, 1, 0);
      }
      hwT = hw1;
      hdT = hd1;
    } else {
      gap = (mech ? 0.14 : 0.17) * p;
      hw0 = kw / 2 - gap / 2;
      hd0 = kd / 2 - gap / 2;
      const taper = Math.min(mech ? 0.45 : 0.12, 0.2 * Math.min(hw0, hd0));
      const cham = Math.min(0.35, capH * 0.22);
      const yT = yTop - 0.05;
      surf = () => yT;
      lift = 0.035;
      const r0 = 0.085 * p;
      rB = r0;
      const bp = roundRect(cx, cz, hw0, hd0, r0, cs);
      const up = roundRect(cx, cz, hw0 - taper, hd0 - taper, r0 - taper * 0.5, cs);
      const ep = roundRect(cx, cz, hw0 - taper - cham, hd0 - taper - cham, r0 - taper * 0.5 - cham * 0.5, cs);
      const B = ringAt(caps, bp, capBot);
      const U = ringAt(caps, up, yT - cham);
      const E = ringAt(caps, ep, yT);
      band(caps, B, U, bp, cx, cz);
      band(caps, U, E, up, cx, cz);
      const E2 = ringAt(caps, ep, yT);
      const C = caps.v(cx, yT, cz);
      for (let i = 0; i < E2.length; i++) caps.tri(E2[i], E2[(i + 1) % E2.length], C, 0, 1, 0);
      hwT = hw0 - taper - cham;
      hdT = hd0 - taper - cham;
      if (mech) {
        const s = Math.min(hw0, hd0, 0.37 * p) - 0.3;
        const sTop = capBot - 0.05;
        if (s > 0.5 && sTop - plateTop > 0.2)
          switches.box(cx - s, cx + s, plateTop, sTop, cz - s, cz + s, false);
      }
    }

    const target = lit
      ? glowBuf(
          light === "rgb-per-key"
            ? `glow:key:${n}`
            : light === "rgb-zones"
              ? `glow:zone:${Math.min(3, Math.max(0, Math.floor(((cx + W / 2) / W) * 4)))}`
              : "glow",
        )
      : ink;

    // Light spill: a rounded ring on the plate hugging the cap's footprint, and a thin
    // lit band round the foot of the cap skirt, both seen through the gap.
    if (lit) {
      const halo = Math.min(modern ? 0.5 : 0.3, gap / 2 - 0.05);
      if (halo > 0.02) {
        const ins = Math.min(0.4, 0.3 * Math.min(hw0, hd0));
        const ip = roundRect(cx, cz, hw0 - ins, hd0 - ins, rB - ins, cs);
        const op = roundRect(cx, cz, hw0 + halo, hd0 + halo, rB + halo, cs);
        const I = ringAt(target, ip, plateTop + 0.02);
        const O = ringAt(target, op, plateTop + 0.02);
        for (let i = 0; i < I.length; i++) {
          const j = (i + 1) % I.length;
          target.quad(I[i], I[j], O[j], O[i], 0, 1, 0);
        }
      }
      const skirt = Math.min(modern ? 0.3 : 0.4, 0.15 * capH);
      const bp = roundRect(cx, cz, hw0 + 0.02, hd0 + 0.02, rB + 0.02, cs);
      band(target, ringAt(target, bp, capBot), ringAt(target, bp, capBot + skirt), bp, cx, cz);
    }

    if (k.legend) {
      const single = k.legend.length === 1 || k.legend.startsWith("@");
      let h = single ? (k.legend.startsWith("@") ? 0.19 : 0.21) * p : 0.12 * p;
      const chars = single ? 1 : k.legend.length;
      const textW = ((chars * 4 + (chars - 1) * 1.5) * h) / 6;
      const maxW = hwT * 2 * 0.78;
      if (textW > maxW) h *= maxW / textW;
      h = Math.min(h, hdT * 2 * 0.6);
      const sw = Math.max(0.2, (modern ? 0.65 : 0.75) * (h / 6));
      if (h > 0.8) legend(target, k.legend, cx, cz, h, sw, surf, lift);
    }
  });

  const kb = new THREE.Group();
  kb.name = "keys";
  const add = (mesh: THREE.Mesh | undefined) => mesh && kb.add(mesh);
  add(plate.mesh(m.metal, "plate"));
  add(switches.mesh(m.plastic, "switches"));
  add(caps.mesh(m.body, "caps"));
  add(ink.mesh(m.plastic, "legends"));
  for (const [id, b] of glow) add(b.mesh(m.glow, id));
  return kb;
}

export const model: ModelModule = { key: "keys", build };
