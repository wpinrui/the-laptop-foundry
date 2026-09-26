import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION PORTS: one module draws every connector behind a side-wall opening.
//
// Built in a canonical frame with the opening on the +z face: opening width
// along x, height along y, the connector reaching back along -z. Then turned
// about y so the opening faces ctx.edge; on left and right edges the canonical
// width is the box's depth and the reach is the box's width.
//
// Every connector is drawn from the box, so it holds from the 2 mm microSD
// slot to the 86 mm PC Card cage. By ctx.part:
//   dc-jack          plastic housing, round socket, metal sleeve and centre pin;
//   vga, dvi-d       D-sub: metal flange, trapezoid shell, pin insert (15 round
//                    holes; 24 square holes and a flat blade), hex jackscrew posts;
//   s-video          mini-DIN: round shield, insert with four pins and a key;
//   hdmi-*           chamfered metal shell round a flat contact tongue;
//   ethernet-*       8P8C: latch-notched socket, eight contacts, metal shield,
//                    two link lights (glow); drop-jaw: a slim socket over a
//                    hinged jaw; modem-rj11: smaller, four contacts, no lights;
//   usb-a-*          metal shell, tongue with 4 contacts (9 at 5 Gbps and up);
//                    black tongue (plastic), blue on 2026 5 and 10 Gbps (accent);
//   usb-c, usb4, tb  stadium shell round a thin tongue with contacts both sides;
//   firewire-400     small shell, chamfered top corners, four-contact tongue;
//   pc-card          wide slot, metal cage, pin header, eject button and rod;
//   expresscard-*    push-push slot, cage and edge connector;
//   sd, microsd      thin slot, cage, one contact row (two on UHS-II);
//   headphone-mic,   3.5 mm jack: round socket in a collar (metal on the
//   audio-combo      separate 2006 jacks, plastic on the combo jack);
//   lock-slot        metal plate with the slot, and the T-bar cavity behind.
// Anchor: opening, at the centre of the ctx.edge face.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

function shapeOf(pts: P2[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function pathOf(pts: P2[]): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

function rect(cx: number, cy: number, w: number, h: number): P2[] {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

function circle(cx: number, cy: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** Stadium (rounded-end slot) outline. */
function stadium(cx: number, cy: number, w: number, h: number, segs: number): P2[] {
  const r = h / 2;
  const a = w / 2 - r;
  const out: P2[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = -Math.PI / 2 + (i / segs) * Math.PI;
    out.push([cx + a + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  for (let i = 0; i <= segs; i++) {
    const t = Math.PI / 2 + (i / segs) * Math.PI;
    out.push([cx - a + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

/** Collects the parts of one connector. All geometry is baked in the canonical frame. */
class Kit {
  group = new THREE.Group();
  add(g: THREE.BufferGeometry, mat: THREE.Material, name: string): void {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    this.group.add(mesh);
  }
  box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, name = "part"): void {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat, name);
  }
  /** Extrude a front-view shape from z0 to z1. */
  prism(mat: THREE.Material, s: THREE.Shape, z0: number, z1: number, segs: number, name = "part"): void {
    if (z1 - z0 < 1e-3) return;
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: segs });
    g.translate(0, 0, z0);
    this.add(g, mat, name);
  }
  /** A tube along z: rIn to rOut, from z0 to z1. */
  ring(mat: THREE.Material, rIn: number, rOut: number, x: number, y: number, z0: number, z1: number, segs: number, name = "ring"): void {
    const g = new THREE.LatheGeometry(
      [
        new THREE.Vector2(rIn, z0),
        new THREE.Vector2(rOut, z0),
        new THREE.Vector2(rOut, z1),
        new THREE.Vector2(rIn, z1),
        new THREE.Vector2(rIn, z0),
      ],
      segs,
    );
    g.rotateX(Math.PI / 2); // lathe y -> z
    g.translate(x, y, 0);
    this.add(g, mat, name);
  }
  /** A solid rod along z. */
  rod(mat: THREE.Material, r: number, x: number, y: number, z0: number, z1: number, segs: number, name = "rod"): void {
    const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, (z0 + z1) / 2);
    this.add(g, mat, name);
  }
  /** A row of n thin contact strips across x0..x1. */
  strips(mat: THREE.Material, n: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill = 0.55): void {
    const pitch = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const c = x0 + (i + 0.5) * pitch;
      this.box(mat, c - (pitch * fill) / 2, c + (pitch * fill) / 2, y0, y1, z0, z1, "contact");
    }
  }
}

interface Mats {
  body: THREE.Material;
  metal: THREE.Material;
  plastic: THREE.Material;
  rubber: THREE.Material;
  glow: THREE.Material;
  accent: THREE.Material;
}

// ------------------------------------------------------------------ openings
//
// The front outline of each connector, shared by its model and by the shell,
// which cuts the side wall to it. Canonical front view: x across the opening,
// y up, centred on the box face.

const dcR = (W: number, H: number) => 0.34 * Math.min(W, H);
const dinR = (W: number, H: number) => 0.42 * Math.min(W, H);
const audioR = (W: number, H: number) => 0.45 * Math.min(W, H);

function dsubTrap(W: number, H: number, dvi: boolean) {
  const sw = (dvi ? 0.64 : 0.54) * W;
  const shH = 0.6 * H;
  const tap = 0.12 * shH;
  const trap = (d: number): P2[] => [
    [-sw / 2 + d, shH / 2 - d],
    [-sw / 2 + tap + d, -shH / 2 + d],
    [sw / 2 - tap - d, -shH / 2 + d],
    [sw / 2 - d, shH / 2 - d],
  ];
  return { sw, shH, tap, trap };
}

function hdmiShape(W: number, H: number) {
  const w = 0.93 * W;
  const h = 0.75 * H;
  const c = 0.28 * h;
  const outline = (d: number): P2[] => [
    [-w / 2 + d, h / 2 - d],
    [-w / 2 + d, -h / 2 + c],
    [-w / 2 + c, -h / 2 + d],
    [w / 2 - c, -h / 2 + d],
    [w / 2 - d, -h / 2 + c],
    [w / 2 - d, h / 2 - d],
  ];
  return { w, h, outline };
}

function firewireShape(W: number, H: number) {
  const w = 0.85 * W, h = 0.7 * H;
  const c = 0.28 * h;
  const outline = (d: number): P2[] => [
    [-w / 2 + d, -h / 2 + d],
    [w / 2 - d, -h / 2 + d],
    [w / 2 - d, h / 2 - c],
    [w / 2 - c, h / 2 - d],
    [-w / 2 + c, h / 2 - d],
    [-w / 2 + d, h / 2 - c],
  ];
  return { w, h, outline };
}

const usbASize = (W: number, H: number) => ({ w: 0.88 * W, h: 0.72 * H });

function usbCSize(W: number, H: number) {
  const w = 0.88 * W;
  return { w, h: Math.min(0.65 * H, 0.4 * w) };
}

/** The socket of a modular (8P8C, RJ11) jack: its outline and the housing round it. */
function modularSocket(W: number, H: number, jaw: boolean) {
  const sh = Math.min(0.3, 0.03 * W);
  const bw = W - 2 * sh, bh = H - sh;
  const by = -sh / 2;
  const ow = 0.74 * W;
  if (jaw) {
    // Slim socket above a hinged jaw that drops open for the plug.
    const top = by + bh / 2 - 0.12 * H;
    const bot = by - bh / 2 + 0.25;
    return { sh, bw, bh, by, ow, top, bot, outline: rect(0, (top + bot) / 2, ow, top - bot) };
  }
  const oh = 0.68 * H;
  const oy = by - 0.04 * H;
  const top = oy + oh / 2;
  const nw = 0.36 * ow, nh = 0.14 * oh;
  const bot = oy - oh / 2;
  const outline: P2[] = [
    [-ow / 2, top],
    [-ow / 2, bot + nh],
    [-nw / 2, bot + nh],
    [-nw / 2, bot],
    [nw / 2, bot],
    [nw / 2, bot + nh],
    [ow / 2, bot + nh],
    [ow / 2, top],
  ];
  return { sh, bw, bh, by, ow, top, bot, outline };
}

type Card = "pc-card" | "expresscard-34" | "expresscard-54" | "sd" | "sd-uhs2" | "microsd";

function cardSlotShape(W: number, H: number, card: Card) {
  const pc = card === "pc-card";
  const sd = card === "sd" || card === "sd-uhs2" || card === "microsd";
  const slotW = (pc ? 0.8 : 0.9) * W;
  const slotH = clamp((sd ? 0.5 : 0.55) * H, 0.6, H - 0.6);
  const sx = pc ? -0.08 * W : 0;
  // PC Card: eject button beside the slot.
  const bx0 = sx + slotW / 2 + 0.6, bx1 = W / 2 - 0.5;
  const bh = 0.5 * H;
  return { pc, sd, slotW, slotH, sx, bx0, bx1, bh };
}

function circlePts(r: number, segs = 24): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

const CARDS: Record<string, Card> = {
  "pc-card": "pc-card",
  "expresscard-34": "expresscard-34",
  "expresscard-54": "expresscard-54",
  "sd-reader": "sd",
  "sd-reader-uhs2": "sd-uhs2",
  "microsd-reader": "microsd",
};

/**
 * The outlines a side wall is cut to for a port, in the canonical front view
 * (x across, y up, centred on the port box's face) for a box W across and H
 * high. Most ports are one outline; a PC Card slot adds its eject button.
 */
export function portOpening(part: string, W: number, H: number): P2[][] {
  if (part === "dc-jack") return [circlePts(dcR(W, H))];
  if (part === "vga" || part === "dvi-d") return [dsubTrap(W, H, part === "dvi-d").trap(0)];
  if (part === "s-video") return [circlePts(dinR(W, H))];
  if (part.startsWith("hdmi") || part === "mini-dp") return [hdmiShape(W, H).outline(0)];
  if (part === "ethernet-drop-jaw") return [modularSocket(W, H, true).outline];
  if (part.startsWith("ethernet") || part === "modem-rj11") return [modularSocket(W, H, false).outline];
  if (part.startsWith("usb-a")) {
    const { w, h } = usbASize(W, H);
    return [rect(0, 0, w, h)];
  }
  if (part === "usb-c-10g" || part === "usb4-40g" || part.startsWith("thunderbolt")) {
    const { w, h } = usbCSize(W, H);
    return [stadium(0, 0, w, h, 8)];
  }
  if (part === "firewire-400") return [firewireShape(W, H).outline(0)];
  const card = CARDS[part];
  if (card) {
    const c = cardSlotShape(W, H, card);
    const out = [rect(c.sx, 0, c.slotW, c.slotH)];
    if (c.pc) out.push(rect((c.bx0 + c.bx1) / 2, 0, c.bx1 - c.bx0, c.bh));
    return out;
  }
  if (part === "headphone-mic" || part === "audio-combo") return [circlePts(audioR(W, H))];
  if (part === "lock-slot") return [rect(0, 0, 0.78 * W, 0.62 * H)];
  return [rect(0, 0, 0.8 * W, 0.7 * H)];
}

// ------------------------------------------------------------------ connectors

function dcJack(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const r = dcR(W, H);
  const zS = zF - 0.65 * L;
  const sh = shapeOf(rect(0, 0, W, H));
  sh.holes.push(circle(0, 0, r));
  k.prism(m.plastic, sh, zS, zF, 16, "housing");
  k.box(m.plastic, -W / 2, W / 2, -H / 2, H / 2, zB, zS, "housing");
  k.ring(m.metal, 0.82 * r, r - 0.01, 0, 0, zS, zF - 0.4, 16, "sleeve");
  k.rod(m.metal, 0.26 * r, 0, 0, zS, zF - 1.2, 10, "pin");
  for (const f of [-0.3, 0, 0.3]) k.box(m.metal, f * W - 0.5, f * W + 0.5, -H / 2, -H / 2 + 0.35, zB, zB + Math.min(2, 0.2 * L), "tab");
}

function dsub(k: Kit, m: Mats, W: number, H: number, L: number, dvi: boolean): void {
  const zF = L / 2, zB = -L / 2;
  const flT = Math.min(0.6, 0.06 * L);
  const zFl = zF - Math.min(0.8, 0.08 * L); // flange front
  k.box(m.metal, -0.49 * W, 0.49 * W, -0.47 * H, 0.47 * H, zFl - flT, zFl, "flange");
  k.box(m.plastic, -0.4 * W, 0.4 * W, -0.4 * H, 0.4 * H, zB, zFl - flT, "body");
  // Trapezoid shell, wider at the top.
  const { sw, shH, tap, trap } = dsubTrap(W, H, dvi);
  const t = Math.min(0.45, 0.04 * H);
  const shell = shapeOf(trap(0));
  shell.holes.push(pathOf(trap(t)));
  k.prism(m.metal, shell, zFl - flT, zF - 0.3, 4, "shell");
  // Insert with pin holes, recessed in the shell.
  const ins = shapeOf(trap(t + 0.02));
  const iw = sw - 2 * t;
  if (!dvi) {
    const r = 0.04 * H;
    const rows: [number, number][] = [[5, 0.26], [5, 0], [5, -0.26]];
    rows.forEach(([n, fy], ri) => {
      const y = fy * shH;
      const span = (iw - tap * (0.5 - fy)) * 0.72 - (ri === 1 ? 0.06 * iw : 0);
      for (let i = 0; i < n; i++) ins.holes.push(circle(-span / 2 + (i * span) / (n - 1), y, r));
    });
  } else {
    const q = 0.03 * H;
    const span = iw * 0.6;
    const x0 = -iw * 0.4;
    for (const fy of [0.24, 0, -0.24])
      for (let i = 0; i < 8; i++) ins.holes.push(pathOf(rect(x0 + (i * span) / 7, fy * shH, 2 * q, 2 * q)));
    ins.holes.push(pathOf(rect(iw * 0.34, 0, 0.12 * iw, 0.05 * shH)));
  }
  k.prism(m.plastic, ins, zFl - flT, zF - 0.3 - Math.min(1, 0.1 * L), 4, "insert");
  // Hex jackscrew posts with threaded holes.
  const pr = Math.min(0.17 * H, (W / 2 - sw / 2) * 0.42);
  const px = Math.min(sw / 2 + pr + 0.8, W / 2 - pr - 0.2);
  for (const sx of [-1, 1]) k.ring(m.metal, 0.42 * pr, pr, sx * px, 0, zFl, zF, 6, "post");
}

function miniDin(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const s = Math.min(W, H);
  const rO = dinR(W, H);
  const rI = rO - Math.max(0.25, 0.03 * s);
  const zS = zF - 0.75 * L;
  k.box(m.plastic, -W / 2, W / 2, -H / 2, H / 2, zB, zF - 1, "body");
  k.ring(m.metal, rI, rO, 0, 0, zS, zF, 20, "shield");
  const ins = new THREE.Shape();
  ins.absarc(0, 0, rI - 0.02, 0, Math.PI * 2, false);
  const pin = 0.05 * s;
  for (const [fx, fy] of [[-0.5, 0.15], [0.5, 0.15], [-0.28, -0.38], [0.28, -0.38]] as P2[])
    ins.holes.push(circle(fx * rI, fy * rI, pin));
  ins.holes.push(pathOf(rect(0, -0.62 * rI, 0.26 * rI, 0.3 * rI)));
  k.prism(m.plastic, ins, zS, zF - 1.5, 10, "insert");
}

function hdmi(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const { w, h, outline } = hdmiShape(W, H);
  const t = Math.min(0.35, 0.06 * h);
  const zBk = zB + Math.min(1.2, 0.1 * L);
  const shell = shapeOf(outline(0));
  shell.holes.push(pathOf(outline(t)));
  k.prism(m.metal, shell, zBk, zF, 2, "shell");
  k.box(m.metal, -w / 2 + t, w / 2 - t, -h / 2 + t, h / 2 - t, zBk, zBk + 0.3, "shell");
  k.box(m.plastic, -w / 2, w / 2, -h / 2, h / 2, zB, zBk, "body");
  const tw = 0.72 * w, tt = 0.22 * h;
  const tz0 = zBk + 0.3, tz1 = zF - Math.min(0.8, 0.08 * L);
  k.box(m.plastic, -tw / 2, tw / 2, -tt / 2, tt / 2, tz0, tz1, "tongue");
  k.strips(m.metal, 10, -tw / 2 + 0.3, tw / 2 - 0.3, tt / 2, tt / 2 + 0.06, tz1 - 0.55 * (tz1 - tz0), tz1 - 0.3);
  k.strips(m.metal, 9, -tw / 2 + 0.6, tw / 2 - 0.6, -tt / 2 - 0.06, -tt / 2, tz1 - 0.55 * (tz1 - tz0), tz1 - 0.3);
}

function modular(k: Kit, m: Mats, W: number, H: number, L: number, pins: number, lights: boolean, jaw: boolean): void {
  const zF = L / 2, zB = -L / 2;
  const { sh, bw, bh, by, ow, top, bot, outline } = modularSocket(W, H, jaw);
  const zS = zF - 0.7 * L;
  const body = shapeOf(rect(0, by, bw, bh));
  body.holes.push(pathOf(outline));
  if (jaw) {
    // A hinged jaw under the slim socket drops open for the plug.
    const jawTop = bot + 0.5 * (top - bot);
    k.box(m.plastic, -ow / 2 + 0.15, ow / 2 - 0.15, bot, jawTop - 0.15, zF - Math.min(3, 0.2 * L), zF - 0.1, "jaw");
  }
  // Link lights sit in their own windows beside the top of the socket.
  const lx = (ow / 2 + bw / 2) / 2;
  const ls = Math.min(1.2, (bw / 2 - ow / 2) * 0.7);
  if (lights) for (const sx of [-1, 1]) body.holes.push(pathOf(rect(sx * lx, top - ls / 2, ls, ls)));
  k.prism(m.plastic, body, zS, zF, 2, "housing");
  k.box(m.plastic, -bw / 2, bw / 2, by - bh / 2, by + bh / 2, zB, zS, "housing");
  // Contacts hang from the top of the socket.
  k.strips(m.metal, pins, -0.36 * ow, 0.36 * ow, top - 0.35, top, zS + 0.1, zS + 0.45 * (zF - zS), 0.5);
  // Shield over the top and sides.
  k.box(m.metal, -W / 2, W / 2, H / 2 - sh, H / 2, zB + 1, zF, "shield");
  k.box(m.metal, -W / 2, -W / 2 + sh, -H / 2, H / 2 - sh, zB + 1, zF, "shield");
  k.box(m.metal, W / 2 - sh, W / 2, -H / 2, H / 2 - sh, zB + 1, zF, "shield");
  if (lights)
    for (const sx of [-1, 1]) k.box(m.glow, sx * lx - ls / 2 + 0.01, sx * lx + ls / 2 - 0.01, top - ls + 0.01, top - 0.01, zF - 1, zF - 0.1, "light");
}

function usbA(k: Kit, m: Mats, W: number, H: number, L: number, tongueMat: THREE.Material, fast: boolean): void {
  const zF = L / 2, zB = -L / 2;
  const { w, h } = usbASize(W, H);
  const t = Math.min(0.3, 0.05 * h);
  const zBk = zB + Math.min(1.5, 0.12 * L);
  const shell = shapeOf(rect(0, 0, w, h));
  shell.holes.push(pathOf(rect(0, 0, w - 2 * t, h - 2 * t)));
  k.prism(m.metal, shell, zBk, zF, 2, "shell");
  k.box(m.metal, -w / 2 + t, w / 2 - t, -h / 2 + t, h / 2 - t, zBk, zBk + 0.3, "shell");
  k.box(m.plastic, -w / 2, w / 2, -h / 2, h / 2, zB, zBk, "body");
  // Tongue against the top wall, contacts on its underside.
  const ih = h - 2 * t;
  const tw = w - 2 * t - 1.6;
  const yT1 = ih / 2 - 0.02, yT0 = ih / 2 - 0.38 * ih;
  const tz0 = zBk + 0.3, tz1 = zF - Math.min(0.6, 0.05 * L);
  k.box(tongueMat, -tw / 2, tw / 2, yT0, yT1, tz0, tz1, "tongue");
  const len = tz1 - tz0;
  k.strips(m.metal, 4, -tw / 2 + 0.3, tw / 2 - 0.3, yT0 - 0.07, yT0, tz1 - 0.55 * len, tz1 - 0.35, 0.45);
  if (fast) k.strips(m.metal, 5, -tw / 2 + 0.6, tw / 2 - 0.6, yT0 - 0.07, yT0, tz1 - 0.85 * len, tz1 - 0.62 * len, 0.4);
  // Spring detents on the top and bottom of the shell.
  for (const sx of [-0.25, 0.25]) {
    k.box(m.metal, sx * w - 0.5, sx * w + 0.5, h / 2 - t - 0.12, h / 2 - t, zF - 0.45 * len, zF - 0.25 * len, "detent");
    k.box(m.metal, sx * w - 0.5, sx * w + 0.5, -h / 2 + t, -h / 2 + t + 0.12, zF - 0.45 * len, zF - 0.25 * len, "detent");
  }
}

function usbC(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const { w, h } = usbCSize(W, H);
  const t = Math.min(0.25, 0.1 * h);
  const zBk = zB + Math.min(1, 0.12 * L);
  const shell = shapeOf(stadium(0, 0, w, h, 6));
  shell.holes.push(pathOf(stadium(0, 0, w - 2 * t, h - 2 * t, 6)));
  k.prism(m.metal, shell, zBk, zF, 2, "shell");
  k.prism(m.metal, shapeOf(stadium(0, 0, w - 2 * t + 0.01, h - 2 * t + 0.01, 6)), zBk, zBk + 0.25, 2, "shell");
  k.box(m.plastic, -w / 2 + h / 2, w / 2 - h / 2, -h / 2, h / 2, zB, zBk, "body");
  const tw = w - h - 0.4, tt = 0.27 * h;
  const tz0 = zBk + 0.25, tz1 = zF - Math.min(0.5, 0.06 * L);
  k.box(m.plastic, -tw / 2, tw / 2, -tt / 2, tt / 2, tz0, tz1, "tongue");
  const len = tz1 - tz0;
  k.strips(m.metal, 6, -tw / 2 + 0.2, tw / 2 - 0.2, tt / 2, tt / 2 + 0.05, tz1 - 0.6 * len, tz1 - 0.2, 0.5);
  k.strips(m.metal, 6, -tw / 2 + 0.2, tw / 2 - 0.2, -tt / 2 - 0.05, -tt / 2, tz1 - 0.6 * len, tz1 - 0.2, 0.5);
}

function firewire(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const { w, h, outline } = firewireShape(W, H);
  const t = Math.min(0.25, 0.06 * h);
  const zBk = zB + Math.min(1, 0.1 * L);
  const shell = shapeOf(outline(0));
  shell.holes.push(pathOf(outline(t)));
  k.prism(m.metal, shell, zBk, zF, 2, "shell");
  k.box(m.plastic, -w / 2, w / 2, -h / 2, h / 2, zB, zBk + 0.2, "body");
  const tw = 0.55 * w, tt = 0.3 * h;
  const tz1 = zF - Math.min(0.5, 0.06 * L);
  k.box(m.plastic, -tw / 2, tw / 2, -tt / 2 - 0.1 * h, tt / 2 - 0.1 * h, zBk + 0.2, tz1, "tongue");
  k.strips(m.metal, 4, -tw / 2, tw / 2, tt / 2 - 0.1 * h, tt / 2 - 0.1 * h + 0.05, zBk + 0.2 + 0.4 * (tz1 - zBk), tz1 - 0.2, 0.5);
}

function cardSlot(k: Kit, m: Mats, W: number, H: number, L: number, card: Card): void {
  const zF = L / 2, zB = -L / 2;
  const { pc, sd, slotW, slotH, sx, bx0, bx1, bh } = cardSlotShape(W, H, card);
  const bezelT = Math.min(1.2, 0.1 * L);
  const zBz = zF - bezelT;
  const bezel = shapeOf(rect(0, 0, W, H));
  bezel.holes.push(pathOf(rect(sx, 0, slotW, slotH)));
  // PC Card: eject button beside the slot.
  if (pc) bezel.holes.push(pathOf(rect((bx0 + bx1) / 2, 0, bx1 - bx0, bh)));
  k.prism(m.plastic, bezel, zBz, zF, 2, "bezel");
  // Cage: sheet top and bottom, plastic rails at the sides.
  const zConn = zB + Math.min(2, 0.1 * L);
  const ct = Math.min(0.25, 0.15 * (H - slotH));
  k.box(m.metal, sx - slotW / 2 - 0.4, sx + slotW / 2 + 0.4, slotH / 2, slotH / 2 + ct, zConn, zBz, "cage");
  k.box(m.metal, sx - slotW / 2 - 0.4, sx + slotW / 2 + 0.4, -slotH / 2 - ct, -slotH / 2, zConn, zBz, "cage");
  k.box(m.plastic, sx - slotW / 2 - 0.4, sx - slotW / 2, -slotH / 2, slotH / 2, zConn, zBz, "rail");
  k.box(m.plastic, sx + slotW / 2, sx + slotW / 2 + 0.4, -slotH / 2, slotH / 2, zConn, zBz, "rail");
  k.box(m.plastic, sx - slotW / 2, sx + slotW / 2, -slotH / 2, slotH / 2, zB, zConn, "connector");
  if (sd) {
    // Spring contacts on the floor at the back; UHS-II adds a second row.
    const f = -slotH / 2;
    const cl = Math.min(3, 0.12 * L);
    const n = card === "microsd" ? 8 : 9;
    k.strips(m.metal, n, sx - slotW * 0.42, sx + slotW * 0.42, f, f + 0.06, zConn, zConn + cl, 0.5);
    if (card === "sd-uhs2") k.strips(m.metal, 8, sx - slotW * 0.35, sx + slotW * 0.35, f, f + 0.06, zConn + cl + 1, zConn + 2 * cl, 0.5);
  } else {
    // Pin header or edge connector across the back.
    const rows = pc ? 2 : 1;
    const ph = slotH / (rows + 1);
    for (let r = 0; r < rows; r++) {
      const y = -slotH / 2 + (r + 1) * ph;
      k.strips(m.metal, pc ? 17 : 13, sx - slotW * 0.45, sx + slotW * 0.45, y - 0.12, y + 0.12, zConn, zConn + 1.2, 0.4);
    }
  }
  if (pc) {
    k.box(m.plastic, bx0 + 0.1, bx1 - 0.1, -bh / 2 + 0.1, bh / 2 - 0.1, zF - Math.min(3, 0.1 * L), zF - 0.3, "eject");
    const rr = Math.min(0.5, 0.2 * (bx1 - bx0));
    k.rod(m.metal, rr, (bx0 + bx1) / 2, 0, zConn, zF - Math.min(3, 0.1 * L), 6, "eject-rod");
  }
}

function audio(k: Kit, m: Mats, W: number, H: number, L: number, metalRing: boolean): void {
  const zF = L / 2, zB = -L / 2;
  const s = Math.min(W, H);
  const r = 0.25 * s;
  const rO = audioR(W, H);
  const collar = Math.min(1, 0.1 * L);
  const zS = zF - 0.6 * L;
  const bw = 0.92 * W, bh = 0.92 * H;
  const body = shapeOf(rect(0, 0, bw, bh));
  body.holes.push(circle(0, 0, r));
  k.prism(m.plastic, body, zS, zF - collar, 14, "housing");
  k.box(m.plastic, -bw / 2, bw / 2, -bh / 2, bh / 2, zB, zS, "housing");
  k.ring(metalRing ? m.metal : m.plastic, r, rO, 0, 0, zF - collar, zF, 18, "collar");
  k.box(m.metal, -0.3 * r, 0.3 * r, r - 0.15, r, zS, zS + 0.4 * (zF - zS), "spring");
  for (const f of [-0.3, 0.3]) k.box(m.metal, f * bw - 0.4, f * bw + 0.4, -H / 2, -bh / 2, zB, zB + Math.min(2, 0.2 * L), "tab");
}

function lockSlot(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const pt = Math.min(0.8, 0.18 * L);
  const plate = shapeOf(rect(0, 0, W, H));
  plate.holes.push(pathOf(rect(0, 0, 0.78 * W, 0.62 * H)));
  k.prism(m.metal, plate, zF - pt, zF, 2, "plate");
  // The T-bar cavity behind is wider than the slot.
  const cav = shapeOf(rect(0, 0, 0.98 * W, 0.98 * H));
  cav.holes.push(pathOf(rect(0, 0, 0.9 * W, 0.86 * H)));
  k.prism(m.metal, cav, zB + 0.4, zF - pt, 2, "cavity");
  k.box(m.metal, -0.49 * W, 0.49 * W, -0.49 * H, 0.49 * H, zB, zB + 0.4, "cavity");
}

function generic(k: Kit, m: Mats, W: number, H: number, L: number): void {
  const zF = L / 2, zB = -L / 2;
  const s = shapeOf(rect(0, 0, W, H));
  s.holes.push(pathOf(rect(0, 0, 0.8 * W, 0.7 * H)));
  k.prism(m.plastic, s, zF - 0.5 * L, zF, 2, "housing");
  k.box(m.plastic, -W / 2, W / 2, -H / 2, H / 2, zB, zF - 0.5 * L, "housing");
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const slots = ctx.materials as unknown as Record<string, THREE.Material | undefined>;
  const m: Mats = {
    body: ctx.materials.body,
    metal: ctx.materials.metal,
    plastic: ctx.materials.plastic,
    rubber: ctx.materials.rubber,
    glow: ctx.materials.glow,
    accent: slots.accent ?? ctx.materials.plastic,
  };
  const old = ctx.year < 2015;
  const part = ctx.part ?? "usb-a-2.0";
  const edge = ctx.edge ?? "left";
  const side = edge === "left" || edge === "right";
  // Canonical frame: opening width W along x, reach L along z, face at +z.
  const W = side ? box.depth : box.width;
  const L = side ? box.width : box.depth;
  const H = box.height;

  const k = new Kit();
  if (part === "dc-jack") dcJack(k, m, W, H, L);
  else if (part === "vga") dsub(k, m, W, H, L, false);
  else if (part === "dvi-d") dsub(k, m, W, H, L, true);
  else if (part === "s-video") miniDin(k, m, W, H, L);
  // Mini DisplayPort is drawn as the nearest shape, a small keyed HDMI-style socket.
  else if (part.startsWith("hdmi") || part === "mini-dp") hdmi(k, m, W, H, L);
  else if (part === "ethernet-drop-jaw") modular(k, m, W, H, L, 8, false, true);
  else if (part.startsWith("ethernet")) modular(k, m, W, H, L, 8, true, false);
  else if (part === "modem-rj11") modular(k, m, W, H, L, 4, false, false);
  else if (part.startsWith("usb-a")) {
    const fast = part !== "usb-a-2.0";
    usbA(k, m, W, H, L, fast && !old ? m.accent : m.plastic, fast);
  } else if (part === "usb-c-10g" || part === "usb4-40g" || part.startsWith("thunderbolt")) usbC(k, m, W, H, L);
  else if (part === "firewire-400") firewire(k, m, W, H, L);
  else if (part === "pc-card") cardSlot(k, m, W, H, L, "pc-card");
  else if (part === "expresscard-34") cardSlot(k, m, W, H, L, "expresscard-34");
  else if (part === "expresscard-54") cardSlot(k, m, W, H, L, "expresscard-54");
  else if (part === "sd-reader") cardSlot(k, m, W, H, L, "sd");
  else if (part === "sd-reader-uhs2") cardSlot(k, m, W, H, L, "sd-uhs2");
  else if (part === "microsd-reader") cardSlot(k, m, W, H, L, "microsd");
  else if (part === "headphone-mic") audio(k, m, W, H, L, true);
  else if (part === "audio-combo") audio(k, m, W, H, L, false);
  else if (part === "lock-slot") lockSlot(k, m, W, H, L);
  else generic(k, m, W, H, L);

  const body = k.group;
  body.add(anchor("opening", 0, 0, L / 2));
  // Turn the canonical (opening at front) connector to face ctx.edge.
  body.rotation.y = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 }[edge];

  const port = new THREE.Group();
  port.name = "port";
  port.add(body);
  return port;
}

export const model: ModelModule = { key: "port", build };
