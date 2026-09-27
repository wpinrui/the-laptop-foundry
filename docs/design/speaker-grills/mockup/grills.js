import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

// Speaker grills, mock of the engine rules and the viewer drawing. Engine space:
// x right, y back (0 is the front), z up, mm. Three space: (x - X/2, z, Y/2 - y).

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const PATTERNS = [
  { id: "dots", name: "Dots", min: 0.3, max: 2.5 },
  { id: "slots", name: "Slots", min: 0.6, max: 2.0 },
  { id: "bars", name: "Bars", min: 0.6, max: 2.0 },
  { id: "hex", name: "Hex", min: 1.0, max: 3.0 },
];
export const PLACES = ["none", "deck", "front"];
/** The last year a front-wall grill is offered. */
export const FRONT_UNTIL = 2012;
export const START = { x: 340, y: 240, z: 22 };
const MARGIN = 0.4;
const END_GAP = 1.5;
const EDGE_GAP = 4;
const KEY_GAP = 4;
const DECK_MIN_W = 8;
const DECK_MAX_W = 34;
const FRONT_MIN = 4;
const FRONT_MAX_H = 7;
const HINGE_STRIP = 20;

/** Moulding and machining by era: least hole, least web between holes, a recessed panel. */
export function eraOf(year) {
  if (year < 2011) return { min: 0.8, web: 0.8, frame: true, body: 0xc4c7cb, metal: 0.05, rough: 0.55 };
  if (year < 2019) return { min: 0.5, web: 0.6, frame: false, body: 0xa8aeb4, metal: 0.55, rough: 0.36 };
  return { min: 0.3, web: 0.4, frame: false, body: 0x6c7077, metal: 0.4, rough: 0.42 };
}
export const webOf = (h, year) => Math.max(eraOf(year).web, 0.6 * h);
export const pitchOf = (h, year) => h + webOf(h, year);

/** What an untouched build gets. */
export function stockOf(year) {
  if (year < 2011) return { prefer: ["front", "deck"], pattern: "slots", hole: 1.2 };
  if (year < 2019) return { prefer: ["deck"], pattern: "dots", hole: 1.0 };
  return { prefer: ["deck"], pattern: "dots", hole: 0.5 };
}

const s = (k, of, min, max) => ({ k, of, min, max });
export const BODIES = [
  { id: "workhorse", name: "Workhorse", from: 2000, until: 2099, st: { edge: "square", corner: s(0.006, "short", 1, 5), profile: 0 } },
  { id: "pillow", name: "Pillow", from: 2000, until: 2012, st: { edge: "rounded", corner: s(0.07, "short", 10, 22), profile: s(0.3, "z", 2, 10) } },
  { id: "spine", name: "Spine", from: 2000, until: 2011, st: { edge: "rounded", corner: s(0.025, "short", 5, 9), profile: s(0.12, "z", 1.5, 4), spine: s(0.45, "z", 4, 18) } },
  { id: "field", name: "Field", from: 2000, until: 2099, st: { edge: "rounded", corner: s(0.03, "short", 6, 12), profile: s(0.08, "z", 1.5, 4), bumper: s(0.2, "z", 1.5, 10) } },
  { id: "blade", name: "Blade", from: 2008, until: 2099, st: { edge: "chamfer", corner: s(0.012, "short", 2, 6), profile: s(0.08, "z", 0.6, 2), taper: { front: 0.55, minFront: 5, run: 0.7 } } },
  { id: "float", name: "Float", from: 2013, until: 2099, st: { edge: "rounded", corner: s(0.035, "short", 6, 14), profile: s(0.05, "z", 0.6, 1.5), undercut: { inset: s(0.022, "short", 2.5, 10), height: s(0.45, "z", 3, 14) } } },
  { id: "shelf", name: "Shelf", from: 2014, until: 2099, st: { edge: "chamfer", corner: s(0.01, "short", 2, 5), profile: s(0.08, "z", 1, 3), shelf: { depth: s(0.14, "y", 16, 60), rise: s(0.2, "z", 2, 8) } } },
  { id: "lift", name: "Lift", from: 2019, until: 2099, st: { edge: "rounded", corner: s(0.022, "short", 4, 9), profile: s(0.06, "z", 0.8, 2), lip: s(0.4, "z", 2.5, 9) } },
  { id: "wedge", name: "Wedge", from: 2003, until: 2099, st: { edge: "square", corner: s(0.03, "short", 3, 10), profile: 0, taper: { front: 0.3, minFront: 1, run: 0.9, linear: true } } },
  { id: "slant", name: "Slant", from: 2009, until: 2099, st: { corner: s(0.012, "short", 2, 6), pm: { top: { kind: "round", h: s(0.05, "z", 0.5, 1.2), d: "h" }, bot: { kind: "linear", h: s(0.5, "z", 2, 26), d: s(0.35, "z", 2, 16) }, sides: { f: 1, s: 0, r: 1 } } } },
  { id: "capsule", name: "Capsule", from: 2012, until: 2099, st: { corner: s(0.03, "short", 5, 12), pm: { top: { kind: "round", h: s(0.29, "z", 1.5, 22), d: "h" }, bot: { kind: "round", h: s(0.29, "z", 1.5, 22), d: "h" }, sides: { f: 1, s: 0.3, r: 1 } } } },
  { id: "ultra", name: "Ultra", from: 2015, until: 2099, st: { corner: s(0.02, "short", 3, 8), pm: { top: { kind: "round", h: 1, d: 1 }, bot: { kind: "linear", h: "edge", d: s(0.1, "y", 6, 45) }, edge: { k: 0.5, min: 4 }, sides: { f: 1, s: 1, r: 0.6 } } } },
  { id: "knife", name: "Knife", from: 2018, until: 2099, st: { corner: s(0.012, "short", 2, 5), pm: { top: { kind: "chamfer", h: s(0.16, "z", 1, 3.5), d: s(0.3, "z", 1.5, 6) }, bot: { kind: "linear", h: "edge", d: s(0.12, "y", 8, 50) }, edge: { k: 0.5, min: 4.2 }, sides: { f: 1, s: 1, r: 1 } } } },
  { id: "aero", name: "Aero", from: 2021, until: 2099, st: { corner: s(0.05, "short", 10, 18), pm: { top: { kind: "round", h: s(0.08, "z", 0.8, 1.6), d: "h" }, bot: { kind: "round", h: s(0.3, "z", 1.5, 7), d: "h" }, sides: { f: 1, s: 1, r: 1 } } } },
  { id: "teardrop", name: "Teardrop", from: 2006, until: 2017, st: { corner: s(0.045, "short", 8, 16), pm: { top: { kind: "round", h: 0.8, d: 0.8 }, bot: { kind: "curve", h: "edge", d: s(0.19, "y", 12, 80) }, edge: { k: 0.3, min: 4 }, sides: { f: 1.3, s: 1, r: 0.35 } } } },
  { id: "facet", name: "Facet", from: 2019, until: 2099, st: { cornerKind: "chamfer", corner: s(0.065, "short", 6, 28), pm: { top: { kind: "chamfer", h: 1.2, d: 1.2 }, bot: { kind: "linear", h: "edge", d: s(0.1, "y", 8, 30) }, edge: { k: 0.45, min: 4 }, sides: { f: 0.8, s: 1, r: 1 } } } },
];

export const bodyAvailable = (id, year) => {
  const b = BODIES.find((x) => x.id === id);
  return !!b && b.from <= year && b.until >= year;
};

function val(v, X, Y, Z) {
  if (typeof v === "number") return v;
  const axis = v.of === "x" ? X : v.of === "y" ? Y : v.of === "z" ? Z : Math.min(X, Y);
  return clamp(v.k * axis, v.min, v.max);
}

/** A body's shape at a size, in mm. */
function resolveBody(id, X, Y, Z) {
  const b = BODIES.find((x) => x.id === id) ?? BODIES[0];
  const t = b.st;
  const v = (x) => val(x, X, Y, Z);
  const st = { id: b.id, corner: v(t.corner), chamferCorner: t.cornerKind === "chamfer", edge: t.edge ?? "perim", profile: t.profile ? v(t.profile) : 0 };
  if (t.spine) st.spine = v(t.spine);
  if (t.bumper) st.bumper = v(t.bumper);
  if (t.taper) st.taper = { ...t.taper, frontT: Math.max(t.taper.minFront, t.taper.front * Z) };
  if (t.undercut) st.undercut = { inset: v(t.undercut.inset), height: Math.min(v(t.undercut.height), Z / 2) };
  if (t.shelf) st.shelf = { depth: v(t.shelf.depth), rise: v(t.shelf.rise) };
  if (t.lip) st.lip = v(t.lip);
  if (t.pm) {
    const pm = t.pm;
    const hT = v(pm.top.h);
    const dT = pm.top.d === "h" ? hT : v(pm.top.d);
    const band = pm.edge ? Math.max(pm.edge.min, pm.edge.k * Z) : 0;
    const hB = pm.bot.h === "edge" ? Math.max(0.5, Z - hT - band) : v(pm.bot.h);
    const dB = pm.bot.d === "h" ? hB : v(pm.bot.d);
    st.pm = { top: { kind: pm.top.kind, h: hT, d: dT, both: pm.top.d === "h" }, bot: { kind: pm.bot.kind, h: hB, d: dB, both: pm.bot.d === "h" }, m: pm.sides };
  }
  return st;
}

/** One side's edge zones on a perimeter body: each side scales the profile by its multiplier. */
function zones(pm, m, Z) {
  const sz = (z) => ({ kind: z.kind, h: z.both ? z.h * m : z.h, d: z.d * m });
  const top = sz(pm.top);
  const bot = sz(pm.bot);
  bot.h = Math.min(bot.h, Math.max(0.3, Z - top.h - 0.3));
  return { top, bot };
}

function profileInset(kind, d, u) {
  if (u <= 0) return 0;
  if (kind === "round") return d * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
  if (kind === "curve") return d * u * u;
  return d * u;
}

function insetAt(zn, z, Z) {
  const { top, bot } = zn;
  if (z < bot.h && bot.d > 0) return profileInset(bot.kind, bot.d, (bot.h - z) / bot.h);
  if (z > Z - top.h && top.d > 0) return profileInset(top.kind, top.d, (z - (Z - top.h)) / top.h);
  return 0;
}

/** Outer bottom and top at depth y (non-perimeter bodies). */
function section(st, X, Y, Z, y) {
  let lo = 0;
  let hi = Z;
  if (st.taper) {
    const run = st.taper.run * Y;
    const lift = Z - st.taper.frontT;
    const u = clamp(1 - y / run, 0, 1);
    lo = lift * (st.taper.linear ? u : 0.5 * (1 - Math.cos(Math.PI * u)));
  }
  if (st.shelf) {
    const y0 = Y - st.shelf.depth;
    const ramp = Math.max(2, 0.8 * st.shelf.rise);
    const u = clamp((y - y0) / ramp, 0, 1);
    hi = Z - st.shelf.rise * (1 - u * u * (3 - 2 * u));
  }
  if (st.lip) {
    const run = 1.5 * st.lip;
    hi -= st.lip * clamp((y - (Y - run)) / run, 0, 1);
  }
  return [lo, hi];
}

function profileRings(st, Z, segs) {
  const p = st.edge === "square" ? 0 : Math.min(st.profile, Z / 2);
  const edge = () => {
    if (p <= 0) return [{ d: 0, z: 0 }];
    if (st.edge === "chamfer") return [{ d: p, z: 0 }, { d: 0, z: p }];
    const out = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * (Math.PI / 2);
      out.push({ d: p - p * Math.sin(a), z: p - p * Math.cos(a) });
    }
    return out;
  };
  const top = [...edge()].reverse().map((r) => ({ d: r.d, z: Z - r.z }));
  let bottom = edge();
  if (st.undercut) {
    bottom = [];
    const k = Math.max(4, segs);
    for (let i = 0; i <= k; i++) {
      const a = (i / k) * (Math.PI / 2);
      bottom.push({ d: st.undercut.inset * Math.cos(a), z: st.undercut.height * Math.sin(a) });
    }
  }
  return [...bottom, ...top];
}

function outline(X, Y, r, I, segs, cuts, chamfer) {
  const corner = (a, b) => Math.max(0.2, Math.min(r - Math.min(a, b), (X - I.l - I.r) / 2 - 0.1, (Y - I.f - I.b) / 2 - 0.1));
  const fr = corner(I.r, I.f);
  const br = corner(I.r, I.b);
  const bl = corner(I.l, I.b);
  const fl = corner(I.l, I.f);
  const arc = (cx, cy, rc, start, out) => {
    const a0 = (start * Math.PI) / 180;
    const a1 = ((start + 90) * Math.PI) / 180;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      if (chamfer) out.push([cx + rc * (Math.cos(a0) + (Math.cos(a1) - Math.cos(a0)) * t), cy + rc * (Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * t)]);
      else {
        const a = a0 + (a1 - a0) * t;
        out.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]);
      }
    }
  };
  const right = [];
  arc(X - I.r - fr, I.f + fr, fr, -90, right);
  for (const y of cuts) right.push([X - I.r, Math.min(Y - I.b - br, Math.max(I.f + fr, y))]);
  arc(X - I.r - br, Y - I.b - br, br, 0, right);
  const left = [];
  arc(I.l + bl, Y - I.b - bl, bl, 90, left);
  for (const y of [...cuts].reverse()) left.push([I.l, Math.min(Y - I.b - bl, Math.max(I.f + fl, y))]);
  arc(I.l + fl, I.f + fl, fl, 180, left);
  return [...right, ...left];
}

/** Signed distance inside the plan outline, mm. */
function planDist(x, y, X, Y, r) {
  const qx = Math.abs(x - X / 2) - (X / 2 - r);
  const qy = Math.abs(y - Y / 2) - (Y / 2 - r);
  return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
}

// ------------------------------------------------------------------ hole patterns

function circle(cx, cy, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Stadium, long along s. */
function stadium(cs, cl, len, w, n = 6) {
  const r = w / 2;
  const a = Math.max(0, len / 2 - r);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([cs + a + r * Math.cos(t), cl + r * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 + (i / n) * Math.PI;
    out.push([cs - a + r * Math.cos(t), cl + r * Math.sin(t)]);
  }
  return out;
}

/** Hexagon, flats facing along s, `f` across the flats. */
function hexagon(cs, cl, f) {
  const R = f / Math.sqrt(3);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    out.push([cs + R * Math.cos(a), cl + R * Math.sin(a)]);
  }
  return out;
}

/**
 * Holes in a grill S across (s, the short side) by L along (l), centred on 0,
 * and the share of the grill they open.
 */
export function holesFor(pattern, h, year, S, L) {
  const web = webOf(h, year);
  const p = h + web;
  const polys = [];
  let area = 0;
  const sMax = S / 2 - web / 2;
  const lMax = L / 2 - web / 2;
  if (pattern === "dots" || pattern === "hex") {
    const dl = (p * Math.sqrt(3)) / 2;
    const extL = pattern === "hex" ? h / Math.sqrt(3) : h / 2;
    const rows = Math.max(0, Math.floor((2 * lMax - 2 * extL) / dl) + 1);
    const n = Math.max(0, Math.floor((2 * sMax - h) / p) + 1);
    const segs = h < 0.9 ? 8 : h < 1.8 ? 10 : 14;
    for (let i = 0; i < rows; i++) {
      const l = -((rows - 1) * dl) / 2 + i * dl;
      // Rows alternate n and n - 1 holes, so the grid staggers and stays centred.
      const cols = i % 2 && n > 1 ? n - 1 : n;
      for (let j = 0; j < cols; j++) {
        const sc = -((cols - 1) * p) / 2 + j * p;
        if (pattern === "hex") {
          polys.push(hexagon(sc, l, h));
          area += (Math.sqrt(3) / 2) * h * h;
        } else {
          polys.push(circle(sc, l, h / 2, segs));
          area += (Math.PI / 4) * h * h;
        }
      }
    }
  } else if (pattern === "slots") {
    const len = Math.min(Math.max(3 * h, 2.4), 2 * sMax);
    const step = len + web;
    const rows = Math.max(0, Math.floor((2 * lMax - h) / p) + 1);
    const n = Math.max(0, Math.floor((2 * sMax - len) / step) + 1);
    for (let i = 0; i < rows; i++) {
      const l = -((rows - 1) * p) / 2 + i * p;
      const cols = i % 2 && n > 1 ? n - 1 : n;
      for (let j = 0; j < cols; j++) {
        const sc = -((cols - 1) * step) / 2 + j * step;
        polys.push(stadium(sc, l, len, h));
        area += h * (len - h) + (Math.PI / 4) * h * h;
      }
    }
  } else {
    const len = 2 * sMax;
    const rows = Math.max(0, Math.floor((2 * lMax - h) / p) + 1);
    for (let i = 0; i < rows; i++) {
      const l = -((rows - 1) * p) / 2 + i * p;
      polys.push(stadium(0, l, len, h, 8));
      area += h * (len - h) + (Math.PI / 4) * h * h;
    }
  }
  return { polys, open: S * L > 0 ? area / (S * L) : 0 };
}

// ------------------------------------------------------------------ solve

function keyboardOf(year, cols, X) {
  const pitch = cols === 15 ? 19 : year < 2011 ? 17 : 18;
  return { cols, pitch, w: (cols - 0.5) * pitch + 4, d: 6 * pitch + 4 };
}

/** Where the flat deck ends toward the rear. */
function deckEnd(st, Y) {
  let y = Y;
  if (st.shelf) y = Math.min(y, Y - st.shelf.depth);
  if (st.lip) y = Math.min(y, Y - 1.5 * st.lip);
  if (st.spine) y = Math.min(y, Y - 16);
  return y;
}

/**
 * The grill as solved: where each surface can take one, the resolved choice
 * (the player's where it fits, else the era's stock), the hole range and the
 * grill regions in engine mm.
 */
export function solve(cfg) {
  const X = cfg.size?.x ?? START.x;
  const Y = cfg.size?.y ?? START.y;
  const Z = cfg.size?.z ?? START.z;
  const year = cfg.year ?? 2006;
  const body = bodyAvailable(cfg.body, year) ? cfg.body : "workhorse";
  const st = resolveBody(body, X, Y, Z);
  const era = eraOf(year);
  const kb = keyboardOf(year, cfg.cols ?? 15, X);
  const yEnd = deckEnd(st, Y);
  const ky1 = Math.min(Y - HINGE_STRIP, yEnd - 6);
  const ky0 = ky1 - kb.d;
  const kx0 = (X - kb.w) / 2;

  // Deck: a panel each side of the keyboard, on the flat deck.
  const topIn = st.pm ? zones(st.pm, st.pm.m.s, Z).top.d : st.profile;
  const gutter = kx0 - topIn - EDGE_GAP - KEY_GAP;
  const deckW = Math.min(gutter, DECK_MAX_W);
  const dy0 = Math.max(ky0, EDGE_GAP);
  const dy1 = Math.min(ky1, yEnd - 3);
  const deckOk = deckW >= DECK_MIN_W && dy1 - dy0 > 20;
  const deckTop = (y) => (st.pm ? Z : section(st, X, Y, Z, y)[1]);
  const deckRegions = deckOk
    ? [1, -1].map((side) => {
        const cxL = topIn + EDGE_GAP + gutter / 2;
        return { surface: "deck", cx: side > 0 ? cxL : X - cxL, cy: (dy0 + dy1) / 2, S: deckW, L: dy1 - dy0 };
      })
    : [];

  // Front: a panel over each speaker on the front wall's flat band.
  const frontAllowed = year <= FRONT_UNTIL;
  let band = null;
  if (st.pm) {
    const zf = zones(st.pm, st.pm.m.f, Z);
    band = [zf.bot.h + MARGIN, Z - zf.top.h - MARGIN];
  } else {
    const [lo, hi] = section(st, X, Y, Z, 0);
    const k = (hi - lo) / Z;
    band = [lo + Math.max(st.profile, st.undercut?.height ?? 0) * k + MARGIN, hi - st.profile * k - MARGIN];
  }
  const bandH = band[1] - band[0];
  const sideIn = st.pm ? zones(st.pm, st.pm.m.s, Z).bot.d : 0;
  const block = st.bumper ? st.corner * 1.2 + 4 : 0;
  const xLo = Math.max(st.corner + sideIn, block) + END_GAP;
  const frontLen = clamp(0.13 * X, 32, 52);
  const frontH = Math.min(bandH, FRONT_MAX_H);
  const frontOk = frontAllowed && bandH >= FRONT_MIN && X / 2 - xLo > frontLen + 6;
  const frontRegions = frontOk
    ? [1, -1].map((side) => {
        const cxL = xLo + 6 + frontLen / 2;
        return { surface: "front", cx: side > 0 ? cxL : X - cxL, cz: (band[0] + band[1]) / 2, S: frontH, L: frontLen };
      })
    : [];

  const fits = { none: true, deck: deckOk, front: frontOk };
  const stock = stockOf(year);
  const stockPlace = stock.prefer.find((p) => fits[p]) ?? "none";
  const place = cfg.place && fits[cfg.place] && (cfg.place !== "front" || frontAllowed) ? cfg.place : stockPlace;
  const regions = place === "deck" ? deckRegions : place === "front" ? frontRegions : [];
  const short = regions[0]?.S ?? 0;
  const rangeOf = (pid) => {
    const pat = PATTERNS.find((x) => x.id === pid);
    const lo = Math.max(pat.min, era.min);
    let hi = pat.max;
    // At least two holes across the grill.
    for (let h = pat.max; h >= lo - 1e-9; h -= 0.1) {
      hi = h;
      if (2 * h + 3 * webOf(h, year) <= short) break;
    }
    return { min: Math.round(lo * 10) / 10, max: Math.round(hi * 10) / 10, ok: 2 * lo + 3 * webOf(lo, year) <= short };
  };
  const ranges = Object.fromEntries(PATTERNS.map((p) => [p.id, rangeOf(p.id)]));
  let pattern = cfg.pattern && ranges[cfg.pattern]?.ok ? cfg.pattern : stock.pattern;
  if (!ranges[pattern].ok) pattern = PATTERNS.find((p) => ranges[p.id].ok)?.id ?? stock.pattern;
  const r = ranges[pattern];
  const hole = Math.round(clamp(cfg.hole ?? stock.hole, r.min, r.max) * 10) / 10;
  const open = regions[0] ? holesFor(pattern, hole, year, regions[0].S, regions[0].L).open : 0;
  return {
    X, Y, Z, year, body, st, era, kb, ky0, ky1, kx0, yEnd, deckTop, topIn,
    fits, frontAllowed, place, stockPlace, pattern, hole, ranges, regions, deckRegions, frontRegions, open,
    bandH, deckW, gutter,
  };
}

// ------------------------------------------------------------------ three.js scene

const T = (g, x, y, z) => new THREE.Vector3(x - g.X / 2, z, g.Y / 2 - y);

function shellGeometry(g) {
  const { st, X, Y, Z } = g;
  const segs = 7;
  const cuts = [];
  for (let i = 1; i < 60; i++) cuts.push((Y * i) / 60);
  let loops;
  if (st.pm) {
    const zf = zones(st.pm, st.pm.m.f, Z);
    const zs = zones(st.pm, st.pm.m.s, Z);
    const zr = zones(st.pm, st.pm.m.r, Z);
    const hB = Math.max(zf.bot.h, zs.bot.h, zr.bot.h);
    const hT = Math.max(zf.top.h, zs.top.h, zr.top.h);
    const levels = [];
    const nb = 12;
    const nt = 6;
    for (let i = 0; i <= nb; i++) levels.push(hB * (1 - Math.cos((Math.PI / 2) * (i / nb))) );
    for (let i = 0; i <= nt; i++) levels.push(Z - hT + hT * Math.sin((Math.PI / 2) * (i / nt)));
    const uniq = [...new Set(levels.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
    loops = uniq.map((z) => {
      const I = { l: insetAt(zs, z, Z), r: insetAt(zs, z, Z), f: insetAt(zf, z, Z), b: insetAt(zr, z, Z) };
      return outline(X, Y, st.corner, I, segs, cuts, st.chamferCorner).map(([x, y]) => [x, y, z]);
    });
  } else {
    const rings = profileRings(st, Z, segs);
    loops = rings.map((rg) =>
      outline(X, Y, st.corner, { l: rg.d, r: rg.d, f: rg.d, b: rg.d }, segs, cuts, st.chamferCorner).map(([x, y]) => {
        const [lo, hi] = section(st, X, Y, Z, y);
        return [x, y, lo + (rg.z / Z) * (hi - lo)];
      }),
    );
  }
  const n = loops[0].length;
  const m = n / 2;
  const toArr = (pts) => {
    const a = [];
    for (const p of pts) {
      const v = T(g, p[0], p[1], p[2]);
      a.push(v.x, v.y, v.z);
    }
    return a;
  };
  // Sides: indexed and smooth.
  const sidePos = toArr(loops.flat());
  const sideIdx = [];
  for (let k = 0; k + 1 < loops.length; k++) {
    const a = k * n;
    const b = (k + 1) * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      sideIdx.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  const sides = new THREE.BufferGeometry();
  sides.setAttribute("position", new THREE.Float32BufferAttribute(sidePos, 3));
  sides.setIndex(sideIdx);
  sides.computeVertexNormals();
  // Top and bottom faces: their own vertices, so the edges stay crisp.
  const face = (loop, up) => {
    const pos = toArr(loop);
    const idx = [];
    for (let k = 0; k + 1 < m; k++) {
      const r0 = k, r1 = k + 1, l0 = n - 1 - k, l1 = n - 2 - k;
      if (up) idx.push(l0, r0, r1, l0, r1, l1);
      else idx.push(l0, l1, r1, l0, r1, r0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const minZ = Math.min(...loops[0].map((p) => p[2]));
  return { sides, top: face(loops[loops.length - 1], true), bottom: face(loops[0], false), minZ };
}

function polyGeometry(polys, map, normal) {
  const pos = [];
  const nrm = [];
  for (const poly of polys) {
    const pts = poly.map(map);
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p.x; cy += p.y; cz += p.z; }
    const c = [cx / pts.length, cy / pts.length, cz / pts.length];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      pos.push(...c, a.x, a.y, a.z, b.x, b.y, b.z);
      nrm.push(...normal, ...normal, ...normal);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

function roundRect(w, h, r, n = 5) {
  const rr = Math.min(r, w / 2, h / 2);
  const out = [];
  const cs = [[w / 2 - rr, h / 2 - rr, 0], [-w / 2 + rr, h / 2 - rr, 90], [-w / 2 + rr, -h / 2 + rr, 180], [w / 2 - rr, -h / 2 + rr, 270]];
  for (const [cx, cy, a0] of cs)
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  return out;
}

/** The grill drawn on the shell: holes in the opening colour, and the 2006 recessed panel. */
function grillMeshes(g, group, mats) {
  const lift = 0.02;
  for (const rg of g.regions) {
    const { polys } = holesFor(g.pattern, g.hole, g.year, rg.S, rg.L);
    let map;
    let normal;
    let keep;
    if (rg.surface === "deck") {
      map = ([sv, lv]) => T(g, rg.cx + sv, rg.cy + lv, g.deckTop(rg.cy + lv) + lift);
      normal = [0, 1, 0];
      keep = (poly) => poly.every(([sv, lv]) => planDist(rg.cx + sv, rg.cy + lv, g.X, g.Y, g.st.corner) >= g.topIn + 1.5 && rg.cy + lv <= g.yEnd - 2);
    } else {
      map = ([sv, lv]) => T(g, rg.cx + lv, -lift, rg.cz + sv);
      normal = [0, 0, 1];
      keep = () => true;
    }
    const hg = polyGeometry(polys.filter(keep), map, normal);
    if (hg) group.add(new THREE.Mesh(hg, mats.hole));
    if (g.era.frame) {
      const pad = 1.2;
      const panel = rg.surface === "deck" ? roundRect(rg.S + 2 * pad, rg.L + 2 * pad, 2.5) : roundRect(rg.S + 2 * pad, rg.L + 2 * pad, Math.min(2.5, rg.S / 2 + pad));
      const pg = polyGeometry([panel], map, normal);
      if (pg) group.add(new THREE.Mesh(pg, mats.panel));
    }
  }
}

function keyboardMeshes(g, group, mats) {
  const { kb, kx0, ky0, ky1, year } = g;
  const top = g.deckTop((ky0 + ky1) / 2);
  const well = new THREE.Mesh(new THREE.BoxGeometry(kb.w, 0.2, kb.d), mats.well);
  well.position.copy(T(g, kx0 + kb.w / 2, (ky0 + ky1) / 2, top + 0.05));
  group.add(well);
  const gap = year < 2011 ? 1.2 : 3.6;
  const capH = year < 2011 ? 2.2 : 0.9;
  const cap = new THREE.BoxGeometry(1, capH, 1);
  const p = kb.pitch;
  const keys = [];
  // Rows front to rear: modifiers and space, four letter rows, the short function row.
  const rowsUnits = [];
  const n = kb.cols;
  rowsUnits.push([1, 1, 1, 1, 5.5, 1, 1, ...Array(Math.max(0, n - 12)).fill(1)]);
  for (let r = 0; r < 4; r++) rowsUnits.push(Array(n).fill(1).map((u, i) => (i === 0 ? 1 + r * 0.25 : u)));
  rowsUnits.push(Array(n).fill(1));
  rowsUnits.forEach((units, r) => {
    const scale = (n - 0.5) / units.reduce((a, b) => a + b, 0);
    let x = kx0 + 2;
    const depth = r === 5 ? 0.62 * p : p;
    const yc = ky0 + 2 + r * p + depth / 2 + (r === 5 ? 0.2 * p : 0);
    for (const u of units) {
      const w = u * scale * p;
      keys.push([x + w / 2, yc, w - gap, depth - gap]);
      x += w;
    }
  });
  const inst = new THREE.InstancedMesh(cap, mats.keycap, keys.length);
  const m4 = new THREE.Matrix4();
  keys.forEach(([x, y, w, d], i) => {
    const v = T(g, x, y, top + capH / 2 + 0.1);
    m4.compose(v, new THREE.Quaternion(), new THREE.Vector3(w, 1, d));
    inst.setMatrixAt(i, m4);
  });
  group.add(inst);
  // Trackpad on the palm rest.
  const pad = year < 2011 ? [75, 45] : year < 2019 ? [105, 70] : [125, 80];
  const py = ky0 / 2;
  if (ky0 > pad[1] + 10) {
    const tp = new THREE.Mesh(new THREE.BoxGeometry(pad[0], 0.12, pad[1]), mats.pad);
    tp.position.copy(T(g, g.X / 2, py, g.deckTop(py) + 0.06));
    group.add(tp);
  }
}

function extras(g, group, mats) {
  const { st, X, Y, Z } = g;
  if (st.bumper) {
    const b = st.corner * 1.2 + 4;
    const pr = st.bumper * 0.45;
    for (const [x, y] of [[b / 2 - 1, b / 2 - 1], [X - b / 2 + 1, b / 2 - 1], [b / 2 - 1, Y - b / 2 + 1], [X - b / 2 + 1, Y - b / 2 + 1]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b, Z + 2 * pr, b), mats.rubber);
      m.position.copy(T(g, x, y, Z / 2));
      group.add(m);
    }
  }
  if (st.spine) {
    const R = (Z + st.spine) / 2;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(R, R, X - 2 * st.corner, 40), mats.body);
    c.rotation.z = Math.PI / 2;
    c.position.copy(T(g, X / 2, Y - R, Z - R));
    group.add(c);
  }
}

function materials(g) {
  const e = g.era;
  const body = new THREE.Color(e.body);
  return {
    body: new THREE.MeshStandardMaterial({ color: body, metalness: e.metal, roughness: e.rough }),
    panel: new THREE.MeshStandardMaterial({ color: body.clone().multiplyScalar(0.62), metalness: e.metal, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    well: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 }),
    keycap: new THREE.MeshStandardMaterial({ color: 0x262a31, roughness: 0.6 }),
    pad: new THREE.MeshStandardMaterial({ color: body.clone().multiplyScalar(0.86), metalness: e.metal, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.9 }),
  };
}

function buildScene(g) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14100d);
  scene.add(new THREE.HemisphereLight(0x4a382a, 0x0a0806, 0.9));
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffd6b8, 2.0);
  key.position.set(-260, 420, 320);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.1);
  fill.position.set(300, 260, 380);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x86a2ff, 0.6);
  rim.position.set(120, 180, -420);
  scene.add(rim);
  const mats = materials(g);
  const group = new THREE.Group();
  const sh = shellGeometry(g);
  for (const geo of [sh.sides, sh.top, sh.bottom]) group.add(new THREE.Mesh(geo, mats.body));
  extras(g, group, mats);
  keyboardMeshes(g, group, mats);
  grillMeshes(g, group, mats);
  const lowest = Math.min(sh.minZ, g.st.spine ? g.Z - (g.Z + g.st.spine) : 0, g.st.bumper ? -g.st.bumper * 0.45 : 0);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(g.X, g.Y) * 0.95, Math.max(g.X, g.Y) * 0.95, 4, 96), new THREE.MeshStandardMaterial({ color: 0x241d17, roughness: 0.95 }));
  plinth.position.y = lowest - 2;
  scene.add(plinth);
  scene.add(group);
  return scene;
}

/** Camera for a named view: target and direction from it, in three space. */
function viewOf(g, view) {
  const R = Math.max(g.X, g.Y);
  const dRg = g.deckRegions[0] ?? g.regions.find((r) => r.surface === "deck");
  const fRg = g.frontRegions[0] ?? g.regions.find((r) => r.surface === "front");
  const rg = g.regions[0];
  const pick = view === "auto" ? (rg?.surface === "front" ? "front" : rg ? "deck" : "hero") : view;
  if (pick === "deck" && dRg) return { t: T(g, dRg.cx + 6, dRg.cy, g.deckTop(dRg.cy)), dir: [-0.3, 0.86, 0.42], dist: Math.max(150, dRg.L * 1.45) };
  if (pick === "front" && fRg) return { t: T(g, fRg.cx + 8, 0, fRg.cz), dir: [-0.34, 0.2, 0.92], dist: Math.max(120, fRg.L * 2.6) };
  if (pick === "deckWide") return { t: T(g, g.X / 2, (g.ky0 + g.ky1) / 2, g.Z), dir: [0, 0.82, 0.57], dist: g.X * 1.9 };
  if (pick === "live-deck") return { t: T(g, g.X * 0.36, (g.ky0 + g.ky1) / 2, g.Z * 0.6), dir: [-0.42, 0.72, 0.55], dist: R * 2.5 };
  if (pick === "live-front") return { t: T(g, g.X * 0.34, g.Y * 0.2, g.Z * 0.5), dir: [-0.5, 0.26, 0.83], dist: R * 1.9 };
  return { t: T(g, g.X / 2, g.Y * 0.45, g.Z * 0.4), dir: [-0.42, 0.62, 0.66], dist: R * 2.0 };
}

function place(cam, v, yaw = 0, pitch = 0) {
  const d = new THREE.Vector3(...v.dir).normalize();
  const sph = new THREE.Spherical().setFromVector3(d);
  sph.theta += yaw;
  sph.phi = clamp(sph.phi - pitch, 0.12, 1.5);
  const dir = new THREE.Vector3().setFromSpherical(sph);
  cam.position.copy(v.t).addScaledVector(dir, v.dist);
  cam.lookAt(v.t);
}

let shared = null;
function sharedRenderer() {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    shared.outputColorSpace = THREE.SRGBColorSpace;
  }
  return shared;
}

function dispose(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

/** A still of the build from a named view, as a JPEG data URL. */
export function shot(cfg, view, w = 480, h = 300) {
  const g = solve(cfg);
  const r = sharedRenderer();
  r.setPixelRatio(1.6);
  r.setSize(w, h, false);
  const scene = buildScene(g);
  const cam = new THREE.PerspectiveCamera(30, w / h, 1, 5000);
  place(cam, viewOf(g, view));
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/jpeg", 0.9);
  dispose(scene);
  return url;
}

/** A pattern swatch on the era's body colour, as a PNG data URL. */
export function swatch(pattern, hole, year, wMm, hMm, pxPerMm) {
  const c = document.createElement("canvas");
  c.width = Math.round(wMm * pxPerMm);
  c.height = Math.round(hMm * pxPerMm);
  const x = c.getContext("2d");
  x.fillStyle = "#" + new THREE.Color(eraOf(year).body).getHexString();
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#05070a";
  const { polys } = holesFor(pattern, hole, year, hMm, wMm);
  for (const poly of polys) {
    x.beginPath();
    poly.forEach(([sv, lv], i) => {
      const px = (wMm / 2 + lv) * pxPerMm;
      const py = (hMm / 2 - sv) * pxPerMm;
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    });
    x.closePath();
    x.fill();
  }
  return c.toDataURL("image/png");
}

/** The live view on a canvas: drag to turn, framed on the grill as it changes. */
export function mountLive(canvas, cfg, opts = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const cam = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  let scene = null;
  let g = null;
  let key = "";
  let yaw = 0;
  let pitch = 0;
  let from = null;
  let to = null;
  let t0 = 0;
  const shift = opts.shift ?? 0;
  const size = () => {
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 450;
    r.setSize(w, h, false);
    cam.aspect = w / h;
    if (shift) cam.setViewOffset(w, h, -shift * w, 0, w, h);
    cam.updateProjectionMatrix();
  };
  const frame = () => {
    const now = performance.now();
    const k = to ? Math.min(1, (now - t0) / 450) : 1;
    const e = 1 - (1 - k) ** 3;
    const v = from && to ? { t: from.t.clone().lerp(to.t, e), dir: from.dir.map((d, i) => d + (to.dir[i] - d) * e), dist: from.dist + (to.dist - from.dist) * e } : to;
    if (v) place(cam, v, yaw, pitch);
    if (scene) r.render(scene, cam);
    if (k < 1) requestAnimationFrame(frame);
    else from = to;
  };
  const set = (c) => {
    const k = JSON.stringify(c);
    if (k === key) return;
    key = k;
    if (scene) dispose(scene);
    g = solve(c);
    scene = buildScene(g);
    const next = viewOf(g, g.place === "front" ? "live-front" : "live-deck");
    from = from ?? next;
    to = next;
    t0 = performance.now();
    requestAnimationFrame(frame);
  };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
    pitch = drag.pitch + (e.clientY - drag.y) * 0.004;
    requestAnimationFrame(frame);
  });
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("dblclick", () => {
    yaw = 0;
    pitch = 0;
    requestAnimationFrame(frame);
  });
  new ResizeObserver(() => {
    size();
    requestAnimationFrame(frame);
  }).observe(canvas);
  size();
  set(cfg);
  return { set };
}
