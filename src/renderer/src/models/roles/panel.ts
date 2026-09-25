import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION PANEL: the display module in the lid.
//
// Width and height are the active area; depth is the module thickness. The
// viewing face is one mesh named "screen" that the engine will draw onto.
// The panel type is the tail of ctx.part (e.g. 2006-15.4-1680x1050-tn-matte).
//
// 2006 (tn-matte, tn-glossy, ips-type): a CCFL module.
//   - a folded metal frame: a thin front lip round the active area and side
//     walls, standing off the back to leave a service gap;
//   - a metal rear sheet, the CCFL lamp channel along the bottom edge with a
//     rubber lamp boot and two lamp leads to a connector, and a shielded
//     T-con board along the top edge with the LVDS connector;
//   - matte: the screen is a flat anti-glare film, glow, just behind the lip;
//   - glossy: the screen is a thin glossy slab, glass, set a little deeper.
// 2026 (ips, oled, mini-led): cover glass edge to edge over the active area.
//   - the screen is the cover glass: a full-face glass slab with a chamfered
//     front edge; the panel stack sits under it, slightly inset;
//   - ips: metal back plate and an LED bar along the bottom edge;
//   - oled: thin stack whose substrate bends back round the bottom edge,
//     with a heat-spreader sheet on the back;
//   - mini-led: a metal back tray with stiffening ribs and a driver board;
//   - every one: a flex tail wrapping the bottom edge to a board connector.
// The bezel is a separate lid part and is not drawn. refresh has no effect.
//
// Model space: centred, x width, y up the screen, z depth with the viewing
// face at +z, 1 unit = 1 mm. Geometry is baked in place; no mesh transforms.

type Kind = "tn-matte" | "tn-glossy" | "ips-type" | "ips" | "oled" | "mini-led";

// Longest ids first, so "ips-type" is not read as "ips".
const KINDS: Kind[] = ["tn-matte", "tn-glossy", "ips-type", "mini-led", "oled", "ips"];

function kindOf(part: string | undefined, year: number): Kind {
  const p = part ?? "";
  for (const k of KINDS) if (p === k || p.endsWith(`-${k}`)) return k;
  return year >= 2015 ? "ips" : "tn-matte";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merged triangle buffer with flat-shaded faces wound to point along a direction. */
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  /** A planar quad from four corners in order; its normal points along (ex, ey, ez). */
  face(p: number[][], ex: number, ey: number, ez: number): void {
    const b = this.pos.length / 3;
    for (const q of p) this.pos.push(q[0], q[1], q[2]);
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
    const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    if (nx * ex + ny * ey + nz * ez >= 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  /** Axis-aligned box. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0, 0, -1);
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0, 1, 0);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0);
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 1, 0, 0);
    this.face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], -1, 0, 0);
  }
  /** A slab from z0 to z1 whose front (+z) edge is chamfered by c all round. */
  chamferSlab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: number): void {
    const zc = z1 - c;
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0, 0, -1);
    this.face([[x0 + c, y0 + c, z1], [x1 - c, y0 + c, z1], [x1 - c, y1 - c, z1], [x0 + c, y1 - c, z1]], 0, 0, 1);
    // Sides, then the chamfer band above each.
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, zc], [x0, y1, zc]], 0, 1, 0);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, zc], [x0, y0, zc]], 0, -1, 0);
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, zc], [x1, y0, zc]], 1, 0, 0);
    this.face([[x0, y0, z0], [x0, y1, z0], [x0, y1, zc], [x0, y0, zc]], -1, 0, 0);
    this.face([[x0, y1, zc], [x1, y1, zc], [x1 - c, y1 - c, z1], [x0 + c, y1 - c, z1]], 0, 1, 1);
    this.face([[x0, y0, zc], [x1, y0, zc], [x1 - c, y0 + c, z1], [x0 + c, y0 + c, z1]], 0, -1, 1);
    this.face([[x1, y0, zc], [x1, y1, zc], [x1 - c, y1 - c, z1], [x1 - c, y0 + c, z1]], 1, 0, 1);
    this.face([[x0, y0, zc], [x0, y1, zc], [x0 + c, y1 - c, z1], [x0 + c, y0 + c, z1]], -1, 0, 1);
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

interface Bufs {
  metal: Buf;
  plastic: Buf;
  rubber: Buf;
  screen: Buf;
}

/** 2006 CCFL module: metal frame, rear sheet, lamp channel, T-con, and a matte or glossy face. */
function ccfl(b: Bufs, W: number, H: number, D: number, glossy: boolean): void {
  const x1 = W / 2, y1 = H / 2, zF = D / 2, zB = -D / 2;
  const t = 0.35; // frame sheet
  const lip = clamp(0.004 * W, 0.9, 1.4); // front lip over the active-area edge
  const gap = clamp(0.15 * D, 0.6, 0.9); // service gap behind the frame
  const zR = zB + gap;

  // Frame: front lip ring, then side walls back to the gap.
  b.metal.box(-x1, x1, y1 - lip, y1, zF - t, zF);
  b.metal.box(-x1, x1, -y1, -y1 + lip, zF - t, zF);
  b.metal.box(-x1, -x1 + lip, -y1 + lip, y1 - lip, zF - t, zF);
  b.metal.box(x1 - lip, x1, -y1 + lip, y1 - lip, zF - t, zF);
  b.metal.box(-x1, x1, y1 - t, y1, zR, zF - t);
  b.metal.box(-x1, x1, -y1, -y1 + t, zR, zF - t);
  b.metal.box(-x1, -x1 + t, -y1 + t, y1 - t, zR, zF - t);
  b.metal.box(x1 - t, x1, -y1 + t, y1 - t, zR, zF - t);
  // Rear sheet.
  const sheet = 0.3;
  b.metal.box(-x1 + t, x1 - t, -y1 + t, y1 - t, zR, zR + sheet);

  // The LCD cell behind the face: dark, seen through a glossy face's edges.
  const zS = zF - 0.12; // viewing face
  const faceT = glossy ? 0.25 : 0;
  b.plastic.box(-x1 + t, x1 - t, -y1 + t, y1 - t, zR + sheet, zS - faceT - 0.06);

  // Viewing face, just behind the lip.
  const sx = x1 - t - 0.01, sy = y1 - t - 0.01;
  if (glossy) b.screen.box(-sx, sx, -sy, sy, zS - faceT, zS);
  else b.screen.face([[-sx, -sy, zS], [sx, -sy, zS], [sx, sy, zS], [-sx, sy, zS]], 0, 0, 1);

  // CCFL lamp channel along the bottom, with a rubber boot on the right end.
  const lampH = clamp(0.035 * H, 6, 8);
  const boot = 7;
  b.metal.box(-x1 + 2, x1 - 2 - boot, -y1, -y1 + lampH, zB, zR);
  b.rubber.box(x1 - 2 - boot, x1 - 2, -y1 + 0.4, -y1 + lampH - 0.4, zB, zR);
  // Two lamp leads out of the boot and along to the inverter connector.
  const wire = Math.min(0.6, gap - 0.05);
  const run = clamp(0.12 * W, 30, 45);
  const cxR = x1 - 2 - boot / 2;
  for (let i = 0; i < 2; i++) {
    const wy = -y1 + lampH + 1 + i * 1.4;
    const wx = cxR - 1.2 + i * 1.4;
    b.rubber.box(wx, wx + wire, -y1 + lampH - 0.4, wy + wire, zR - wire, zR);
    b.rubber.box(cxR - run, wx, wy, wy + wire, zR - wire, zR);
  }
  b.plastic.box(cxR - run - 6, cxR - run, -y1 + lampH + 0.4, -y1 + lampH + 3.8, zB, zR);

  // T-con board under a metal shield along the top, with the LVDS connector.
  const tconH = clamp(0.045 * H, 7, 10);
  b.metal.box(-x1 + 12, x1 - 12, y1 - 1.5 - tconH, y1 - 1.5, zR - 0.35, zR);
  const lx = -0.2 * W;
  b.plastic.box(lx - 7, lx + 7, y1 - 1.5 - tconH + 1.5, y1 - 3, zB, zR - 0.35);
}

/** 2026 module: full-face cover glass over a panel stack, back finished by type. */
function coverGlass(b: Bufs, W: number, H: number, D: number, kind: Kind): { bend?: [number, number, number, number] } {
  const x1 = W / 2, y1 = H / 2, zF = D / 2, zB = -D / 2;
  const cg = clamp(0.25 + 0.1 * D, 0.4, 0.7);
  const c = Math.min(0.2, 0.35 * cg);
  const R = Math.min(0.7, 0.22 * D); // room behind the stack for boards and connectors
  const ins = 0.5; // the stack sits just inside the glass edge
  const zG = zF - cg;
  const zBody = zB + R;
  const zStackFront = zG - 0.02;

  b.screen.chamferSlab(-x1, x1, -y1, y1, zG, zF, c);

  // Panel stack; the OLED substrate bends back round the bottom edge.
  let out: { bend?: [number, number, number, number] } = {};
  let yLo = -y1 + ins;
  if (kind === "oled") {
    const r = (zStackFront - zBody) / 2;
    out = { bend: [W - 2 * ins, r, -y1 + ins + r, zBody + r] };
    yLo = -y1 + ins + r;
  }
  b.plastic.box(-x1 + ins, x1 - ins, yLo, y1 - ins, zBody, zStackFront);

  // Back plate.
  const pt = Math.min(0.15, 0.3 * R);
  const zP = zBody - pt;
  const plateIns = kind === "oled" ? 4 : ins + 0.5;
  b.metal.box(-x1 + plateIns, x1 - plateIns, -y1 + ins + (kind === "oled" ? 4 : 0.5), y1 - plateIns, zP, zBody);

  if (kind === "ips") {
    // Edge-lit: an LED bar along the bottom edge.
    b.metal.box(-x1 + ins + 2, x1 - ins - 2, -y1 + ins, -y1 + ins + 4, zB, zP);
  } else if (kind === "mini-led") {
    // Direct-lit: stamped ribs across the tray and a driver board low in the middle.
    for (const f of [-0.24, 0.24]) {
      const ry = f * H;
      b.metal.box(-x1 + ins + 8, x1 - ins - 8, ry - 1.5, ry + 1.5, zB, zP);
    }
    b.plastic.box(-0.16 * W, 0.16 * W, -y1 + ins + 5, -y1 + ins + 5 + clamp(0.1 * H, 18, 24), zB + 0.1, zP);
  }

  // Flex tail: wraps the bottom edge under the glass (not on OLED, where the bend
  // is the substrate itself), runs up the back to a board connector.
  const fx = 0.3 * W;
  const zT = zP - 0.1;
  if (kind !== "oled") b.plastic.box(fx - 11, fx + 11, -y1 + ins - 0.12, -y1 + ins, zT, zStackFront);
  b.plastic.box(fx - 11, fx + 11, -y1 + ins, -y1 + ins + 20, zT, zP);
  b.plastic.box(fx - 5, fx + 5, -y1 + ins + 14, -y1 + ins + 20, zB, zT);
  return out;
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const kind = kindOf(ctx.part, ctx.year);
  const cover = kind === "ips" || kind === "oled" || kind === "mini-led";
  const b: Bufs = { metal: new Buf(), plastic: new Buf(), rubber: new Buf(), screen: new Buf() };

  let bend: [number, number, number, number] | undefined;
  if (cover) bend = coverGlass(b, box.width, box.height, box.depth, kind).bend;
  else ccfl(b, box.width, box.height, box.depth, kind === "tn-glossy");

  const panel = new THREE.Group();
  panel.name = "panel";
  const add = (mesh: THREE.Mesh | undefined) => mesh && panel.add(mesh);
  add(b.metal.mesh(m.metal, "frame"));
  add(b.plastic.mesh(m.plastic, "module"));
  add(b.rubber.mesh(m.rubber, "leads"));
  // Matte film is a diffuse lit face; glossy film and cover glass are glass.
  add(b.screen.mesh(kind === "tn-matte" || kind === "ips-type" ? m.glow : m.glass, "screen"));

  if (bend) {
    // OLED bend: a half-round along x at the bottom of the stack, baked in place.
    const [len, r, y, z] = bend;
    const g = new THREE.CylinderGeometry(r, r, len, 12, 1, false, Math.PI, Math.PI);
    g.rotateZ(Math.PI / 2);
    g.translate(0, y, z);
    const mesh = new THREE.Mesh(g, m.plastic);
    mesh.name = "bend";
    panel.add(mesh);
  }
  return panel;
}

export const model: ModelModule = { key: "panel", build };
