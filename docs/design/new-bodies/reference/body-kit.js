// Body kit: the proposed body set, resolved against a size, drawn as side
// sections, plans and a 3/4 hero, plus the usable-space model. Mirrors
// proposed/bodies.ts and the shell changes in the README.
(function () {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const LIMITS = { x: [240, 450], y: [160, 330], z: [8, 55] };
  const YEARS = [2006, 2016, 2026];
  const LID = { 2006: 7.5, 2016: 5.5, 2026: 4.4 };
  const WALL = { 2006: 1.6, 2016: 1.1, 2026: 0.85 };
  const s = (k, of, min, max) => ({ k, of, min, max });

  const BODIES = [
    {
      id: "workhorse", name: "Workhorse", from: 2000, until: 2099, sig: "corner", sigName: "Corners", layouts: ["a", "b", "c"],
      style: { edge: "square", corner: s([0.003, 0.014], "short", 1, 5), profile: 0, hinge: "full", latch: false },
      blurb: "Square business slab. Uniform thickness, tight corners, full-width hinge. The reference box every other body is measured against.",
      inside: ["Full inner box: the corner radius stays under 5 mm, which the side wall already covers."],
    },
    {
      id: "pillow", name: "Pillow", from: 2000, until: 2012, sig: "profile", sigName: "Roundness", layouts: ["a", "b", "c"],
      style: { edge: "rounded", corner: s(0.07, "short", 10, 22), profile: s([0.2, 0.4], "z", 2, 10), crown: s(0.06, "z", 0.8, 2.5), hinge: "barrel", latch: true },
      blurb: "Soft 2006 consumer body. Big plan corners, a deep rounded edge all round, a domed lid, barrel hinges and a front latch.",
      inside: ["Big plan corners push the inner box in on every side (cornerOffset).", "The deep edge radius lifts ports and vents clear of it, so thin builds run out of wall height first.", "The domed lid is built outward: nothing inside changes."],
    },
    {
      id: "spine", name: "Spine", from: 2000, until: 2011, sig: "drop", sigName: "Spine", layouts: ["b", "c"],
      style: { edge: "rounded", corner: s(0.025, "short", 5, 9), profile: s(0.12, "z", 1.5, 4), spine: { drop: s([0.25, 0.65], "z", 4, 18) }, hinge: "spine", latch: false },
      blurb: "A cylindrical rear spine carries the hinge and hangs below the base, tilting the keyboard toward you. Cells live in it.",
      inside: ["Gains: a rear-edge zone gets the spine's extra depth below the floor. The rear battery in layouts B and C sits in it.", "Costs: the deck and lid stop at the spine's axis, so the lid is D/2 shorter than the base. A given panel needs more depth.", "The hinge mounts move into the spine, off the floor."],
    },
    {
      id: "field", name: "Field", from: 2000, until: 2099, sig: "bumper", sigName: "Bumpers", layouts: ["a", "b", "c"],
      style: { edge: "rounded", corner: s(0.03, "short", 6, 12), profile: s(0.08, "z", 1.5, 4), bumper: s([0.12, 0.3], "z", 1.5, 10), wallScale: 1.7, hinge: "full", latch: true },
      blurb: "Rugged: walls 1.7 times the era's, rubber corner bumpers that stand proud of the top and bottom, a latched lid.",
      inside: ["Walls are 1.7 times the era's thickness on every face.", "The shell sits inside the bumpers: it loses a quarter of the bumper at the top and at the bottom.", "Corner keep-out grows to the bumper block (2.2 × bumper), so ports and vents keep further from the corners."],
    },
    {
      id: "blade", name: "Blade", from: 2008, until: 2099, sig: "taper", sigName: "Taper", layouts: ["a", "b", "c"],
      style: { edge: "chamfer", corner: s(0.012, "short", 2, 6), profile: s(0.08, "z", 0.6, 2), taper: { front: [0.75, 0.38], minFront: 5, run: 0.7 }, hinge: "drop", latch: false },
      blurb: "A true taper: the bottom rises toward a thin chamfered front edge. The thickness you set is the rear. Drop hinge.",
      inside: ["Floor room falls toward the front: h(y) = Z − T × (1 − s(y / 0.7Y)).", "The front row loses up to T: layout A's battery row and the palm-rest zone decide the minimum thickness.", "The front edge never goes below 5 mm, so the taper shrinks on thin builds."],
    },
    {
      id: "float", name: "Float", from: 2013, until: 2099, sig: "undercut", sigName: "Undercut", layouts: ["a", "b", "c"],
      style: { edge: "rounded", corner: s(0.035, "short", 6, 14), profile: s(0.05, "z", 0.6, 1.5), undercut: { inset: s([0.012, 0.032], "short", 2.5, 10), height: s(0.45, "z", 3, 14) }, hinge: "drop", latch: false },
      blurb: "A deep undercut: the lower half is tucked in all round under a cove, so the body looks thinner and appears to float.",
      inside: ["The inner box comes in by the inset on every side: width and depth each lose 2 × inset.", "Ports and vents open above the undercut, so each lifts to its height. Port height, not parts, often sets the minimum thickness."],
    },
    {
      id: "shelf", name: "Shelf", from: 2014, until: 2099, sig: "shelf", sigName: "Shelf", layouts: ["a", "c"],
      style: { edge: "chamfer", corner: s(0.01, "short", 2, 5), profile: s(0.08, "z", 1, 3), shelf: { depth: s([0.08, 0.2], "y", 16, 60), rise: s(0.2, "z", 2, 8) }, hinge: "inset", latch: false },
      blurb: "The hinge is set forward of a raised rear shelf that holds the exhaust and the rear ports. The gaming body.",
      inside: ["Costs: the deck and lid end at the hinge. The lid is Y − shelf deep and the keyboard band moves forward.", "Gains: the shelf band has no deck over it and rises by min(rise, lid): rear fans there get taller and the rear ports get a full-height wall.", "Layouts with rear fans only (A, C)."],
    },
    {
      id: "lift", name: "Lift", from: 2019, until: 2099, sig: "lip", sigName: "Lift", layouts: ["b", "c"],
      style: { edge: "rounded", corner: s(0.022, "short", 4, 9), profile: s(0.06, "z", 0.8, 2), lift: { lip: s([0.25, 0.55], "z", 2.5, 9) }, hinge: "lift", latch: false },
      blurb: "A lifting hinge: the lid's lower edge swings under the rear and raises it as the lid opens. The rear wall is hidden.",
      inside: ["The rear-bottom edge is chamfered for the swinging lid: rear-edge zones lose 1.1 × lip at the bottom.", "No rear port strip, so layouts B and C only.", "Open, the rear rises by 0.6 × lip: a hook for the cooling model's intake."],
    },
  ];

  // Perimeter bodies: one edge profile (top treatment + bottom treatment) run all round the plan.
  // The bottom inset is scaled per side (front, sides, rear), so the edge looks thin while the
  // full thickness sits a few cm in. kinds: linear | chamfer | round | curve.
  const P = (o) => o;
  BODIES.push(
    {
      id: "wedge", name: "Wedge", from: 2003, until: 2016, sig: "taper", sigName: "Wedge", layouts: ["b", "c"],
      style: { edge: "square", corner: s(0.008, "short", 2, 4), profile: 0, taper: { front: [0.7, 0.4], minFront: 6, run: 0.85, linear: true }, hinge: "full", latch: false },
      blurb: "A straight wedge: the underside is one flat plane from a thick rear to a thin front, square edges all round. The thickness you set is the rear.",
      inside: ["Floor room falls in a straight line: h(y) = Z − T × (1 − y / 0.85Y).", "Nothing tall sits forward of the middle, so rear-battery layouts only (B, C).", "The front edge never goes below 6 mm."],
    },
    {
      id: "slant", name: "Slant", from: 2009, until: 2099, sig: "slant", sigName: "End slant", layouts: ["a", "b", "c"],
      style: { edge: "perim", corner: s(0.012, "short", 2, 6), perim: P({ top: { kind: "round", h: s(0.05, "z", 0.5, 1.2), d: "h" }, bot: { kind: "linear", h: "full", d: s([0.25, 1.0], "z", 2, 24) }, sides: { f: 1, s: 0, r: 1 } }), hinge: "drop", latch: false },
      blurb: "A rectangular slab with the front and rear faces raked back underneath. The top overhangs, so the ends throw a shadow and read thinner. Sides stay square.",
      inside: ["The floor shortens at both ends by the slant: the bottom is Y − 2 × slant deep.", "The top and the sides are untouched: ports go on the square sides at full height."],
    },
    {
      id: "capsule", name: "Capsule", from: 2012, until: 2099, sig: "round", sigName: "End radius", layouts: ["a", "b", "c"],
      style: { edge: "perim", corner: s(0.03, "short", 5, 12), perim: P({ top: { kind: "round", h: s([0.22, 0.5], "z", 1.5, 27), d: "h" }, bot: { kind: "round", h: s([0.22, 0.5], "z", 1.5, 27), d: "h" }, sides: { f: 1, s: 0.3, r: 1 } }), hinge: "full", latch: false },
      blurb: "Rounded ends: the front and rear edges roll over top and bottom, up to a full half-round. The sides keep a tight radius and a flat wall.",
      inside: ["Both ends lose floor and ceiling to the radius: the end zones round off, the middle is a full-height box.", "Sides keep a flat band: ports lose only 0.3 of the radius top and bottom."],
    },
    {
      id: "teardrop", name: "Teardrop", from: 2006, until: 2017, sig: "wrap", sigName: "Taper", layouts: ["b", "c"], sides: true,
      style: { edge: "perim", corner: s(0.045, "short", 8, 16), perim: P({ top: { kind: "round", h: 0.8, d: 0.8 }, bot: { kind: "curve", h: "edge", d: s([0.1, 0.28], "y", 12, 80) }, edge: { k: 0.3, min: 4 }, sides: { f: 1.3, s: 1, r: 0.35 } }), hinge: "drop", latch: false },
      blurb: "The first thin-and-light: the underside sweeps up in one long curve to a knife edge on every side. Longest at the front, shortest at the hinge.",
      inside: ["The underside is convex: floor room climbs quickly off the edge, then flattens a few cm in.", "Ports need the vertical edge band (e − 0.8 mm), so on 2006 and 2016 ports the edge, not the parts, sets the minimum thickness.", "The side curve eats width low down: the inner box loses the curve at half height on each side."],
    },
    {
      id: "ultra", name: "Ultra", from: 2015, until: 2099, sig: "wrap", sigName: "Taper", layouts: ["a", "b", "c"], sides: true,
      style: { edge: "perim", corner: s(0.02, "short", 3, 8), perim: P({ top: { kind: "round", h: 1, d: 1 }, bot: { kind: "linear", h: "edge", d: s([0.05, 0.16], "y", 6, 45) }, edge: { k: 0.42, min: 4 }, sides: { f: 1, s: 1, r: 0.6 } }), hinge: "drop", latch: false },
      blurb: "The ultrabook: a straight bevel runs under every edge, so the body shows a thin band all round while full thickness sits a few cm in.",
      inside: ["Floor room at each end falls along the bevel over the run × that side's setting.", "Ports sit in the vertical edge band: e − 1 mm must clear the port.", "The side bevel eats width at the floor: set the sides to 0 to get the width back."],
    },
    {
      id: "knife", name: "Knife", from: 2018, until: 2099, sig: "wrap", sigName: "Taper", layouts: ["a", "b", "c"], sides: true,
      style: { edge: "perim", corner: s(0.012, "short", 2, 5), perim: P({ top: { kind: "chamfer", h: s(0.16, "z", 1, 3.5), d: s(0.3, "z", 1.5, 6) }, bot: { kind: "linear", h: "edge", d: s([0.06, 0.18], "y", 8, 50) }, edge: { k: 0.45, min: 4.2 }, sides: { f: 1, s: 1, r: 1 } }), hinge: "drop", latch: false },
      blurb: "Double bevel: a shallow chamfer on top and a long bevel underneath meet at a sharp edge line all round. Squarer corners, harder light.",
      inside: ["The top chamfer takes the deck edge: keyboard and trackpad keep 0.3 Z in from every edge.", "The edge band between the bevels carries the ports.", "Floor room at the ends falls along the lower bevel."],
    },
    {
      id: "facet", name: "Facet", from: 2019, until: 2099, sig: "facet", sigName: "Facet", layouts: ["a", "b", "c"], sides: true, cornerKind: "chamfer",
      style: { edge: "perim", cornerKind: "chamfer", corner: s([0.03, 0.1], "short", 6, 28), perim: P({ top: { kind: "chamfer", h: 1.2, d: 1.2 }, bot: { kind: "linear", h: "edge", d: s(0.1, "y", 8, 30) }, edge: { k: 0.45, min: 4 }, sides: { f: 0.8, s: 1, r: 1 } }), hinge: "drop", latch: false },
      blurb: "Gem cut: the plan corners are cut flat instead of rounded, and a bevel runs under every edge. The facet at each corner is the slider.",
      inside: ["Cut corners push the inner box in like a large radius (0.7 × facet).", "Rear facets are a natural home for a corner port or the power jack.", "Floor room at each end falls along the bevel, set per side."],
    },
    {
      id: "aero", name: "Aero", from: 2021, until: 2099, sig: "edge", sigName: "Base radius", layouts: ["a", "b", "c"], sides: true,
      style: { edge: "perim", corner: s(0.05, "short", 10, 18), perim: P({ top: { kind: "round", h: s(0.08, "z", 0.8, 1.6), d: "h" }, bot: { kind: "round", h: s([0.15, 0.45], "z", 1.5, 7), d: "h" }, sides: { f: 1, s: 1, r: 1 } }), hinge: "drop", latch: false },
      blurb: "The modern flat ultralight: uniform thickness, big plan corners, a crisp top edge and a softer radius underneath. Thin by being thin, not by tapering.",
      inside: ["Uniform: the inner box is the full box less the plan corners and a small base radius.", "Big plan corners push the inner box in (cornerOffset).", "Ports need Z − both radii of flat wall."],
    },
  );

  const G = { linear: (u) => u, chamfer: (u) => u, round: (u) => 1 - Math.sqrt(Math.max(0, 1 - u * u)), curve: (u) => 1 - Math.sqrt(Math.max(0, 1 - u)) };
  const GI = { linear: (v) => v, chamfer: (v) => v, round: (v) => Math.sqrt(Math.max(0, 1 - (1 - v) ** 2)), curve: (v) => 1 - (1 - v) ** 2 };
  /** How far the outer skin is in from the plan outline at height z, on a side with multiplier m. */
  function insetAt(r, z, m) {
    const p = r.pm, Z = r.S.z;
    let d = 0;
    if (p.hB > 0 && z < p.hB) d = p.dB * m * G[p.bk]((p.hB - z) / p.hB);
    if (p.hT > 0 && z > Z - p.hT) d = Math.max(d, p.dT * m * G[p.tk]((z - Z + p.hT) / p.hT));
    return d;
  }
  /** Outer skin [bottom, top] at distance yy in from an end. */
  function outerAt(r, yy, m) {
    const p = r.pm, Z = r.S.z, dB = p.dB * m, dT = p.dT * m;
    let lo = 0, hi = Z;
    if (p.hB > 0 && yy < dB) lo = p.hB * (1 - GI[p.bk](yy / dB));
    if (p.hT > 0 && yy < dT) hi = Z - p.hT + p.hT * GI[p.tk](yy / dT);
    return [lo, hi];
  }
  function pmLevels(r) {
    const p = r.pm, Z = r.S.z, set = new Set([0, Z]);
    for (let i = 0; i <= 12; i++) {
      const a = i / 12;
      if (p.hB > 0) { set.add(p.hB * (1 - GI[p.bk](a))); set.add(p.hB * a); }
      if (p.hT > 0) { set.add(Z - p.hT + p.hT * GI[p.tk](a)); set.add(Z - p.hT + p.hT * a); }
    }
    return [...new Set([...set].map((z) => Math.round(z * 200) / 200))].sort((a, b) => a - b);
  }
  const sideIns = (r, z) => { const m = r.pm.m; return { l: insetAt(r, z, m.s), r: insetAt(r, z, m.s), f: insetAt(r, z, m.f), b: insetAt(r, z, m.r) }; };

  const available = (b, y) => y >= b.from && y <= b.until;

  function sc(v, S, t) {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const k = Array.isArray(v.k) ? lerp(v.k[0], v.k[1], t) : v.k;
    const ref = v.of === "short" ? Math.min(S.x, S.y) : S[v.of];
    return clamp(k * ref, v.min, v.max);
  }

  /** Every shape parameter in mm for this size; t is the signature slider, 0 to 1. */
  function resolve(b, S, t = 0.5, year = 2026, opts = {}) {
    const st = b.style;
    const v = (p) => sc(p, S, t);
    const lidZ = LID[year] ?? 5;
    const Z = S.z;
    const r = { id: b.id, edge: st.edge, hinge: st.hinge, latch: !!st.latch, lidZ, wallScale: st.wallScale || 1, S };
    r.corner = Math.min(v(st.corner), Math.min(S.x, S.y) / 4);
    r.cornerKind = st.cornerKind || "round";
    r.pm = null;
    if (st.perim) {
      const pp = st.perim, g = (x, h) => (x === "h" ? h : v(x));
      let hT = Math.min(v(pp.top.h), Z / 2), hB;
      if (pp.bot.h === "edge") hB = Math.max(0, Z - Math.min(Z, Math.max(pp.edge.min, pp.edge.k * Z)));
      else if (pp.bot.h === "full") hB = Z - hT;
      else hB = Math.min(v(pp.bot.h), Z / 2);
      hT = Math.min(hT, Z - hB);
      r.pm = { tk: pp.top.kind, hT, dT: g(pp.top.d, hT), bk: pp.bot.kind, hB, dB: g(pp.bot.d, hB), m: { ...pp.sides, ...(opts.sides || {}) }, e: Z - hB };
    }
    r.lin = !!(st.taper && st.taper.linear);
    r.T = 0;
    r.run = 0;
    if (st.taper) {
      const front = Math.min(Z, Math.max(st.taper.minFront, lerp(st.taper.front[0], st.taper.front[1], t) * Z));
      r.T = Z - front;
      r.run = st.taper.run;
    }
    r.frontZ = Z - r.T;
    r.bumper = st.bumper ? Math.min(v(st.bumper), Z * 0.6) : 0;
    r.q = r.bumper * 0.25;
    r.p = st.edge === "square" ? 0 : Math.max(0, Math.min(v(st.profile), (r.frontZ - 2 * r.q) / 2 - 0.3));
    r.drop = st.spine ? Math.max(0, Math.min(v(st.spine.drop), S.y * 0.3 - Z)) : 0;
    r.D = st.spine ? Z + r.drop : 0;
    r.Sd = st.shelf ? v(st.shelf.depth) : 0;
    r.R = st.shelf ? Math.min(v(st.shelf.rise), lidZ) : 0;
    r.ui = st.undercut ? v(st.undercut.inset) : 0;
    r.uh = st.undercut ? Math.min(v(st.undercut.height), Z * 0.5) : 0;
    r.lip = st.lift ? Math.min(v(st.lift.lip), Z * 0.6) : 0;
    r.crown = st.crown ? v(st.crown) : 0;
    // Where the deck and lid end, from the front.
    r.Yd = r.D ? S.y - r.D / 2 : S.y - r.Sd;
    const dB = r.pm ? r.pm.dB : 0;
    r.sigMm = { corner: r.corner, profile: r.p, drop: r.drop, bumper: r.bumper, taper: r.T, undercut: r.ui, shelf: r.Sd, lip: r.lip, wrap: dB, slant: dB, round: dB, edge: dB, facet: r.corner }[b.sig];
    return r;
  }

  // ------------------------------------------------------------ side section

  function arc(pts, cy, cz, rad, a0, a1, n = 8) {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cy + rad * Math.cos(a), cz + rad * Math.sin(a)]);
    }
  }
  function bottomAt(r, y) {
    if (!r.T) return 0;
    const u = clamp(y / (r.run * r.S.y), 0, 1);
    return r.T * (r.lin ? 1 - u : 1 - u * u * (3 - 2 * u));
  }

  /** Outer base section at the centre line, counter-clockwise in (y, z), front at y = 0. */
  function baseProfile(r) {
    const { y: Y, z: Z } = r.S;
    if (r.pm) {
      const zs = pmLevels(r), out = [];
      for (let i = zs.length - 1; i >= 0; i--) out.push([insetAt(r, zs[i], r.pm.m.f), zs[i]]);
      for (const z of zs) out.push([Y - insetAt(r, z, r.pm.m.r), z]);
      return out;
    }
    const p = r.p, pts = [];
    const z0 = r.q, z1 = Z - r.q;
    const b0 = bottomAt(r, 0) + z0;
    if (r.ui) for (let i = 0; i <= 10; i++) { const th = ((90 - 9 * i) * Math.PI) / 180; pts.push([r.ui * Math.cos(th), r.uh * Math.sin(th)]); }
    else if (p && r.edge === "rounded") arc(pts, p, b0 + p, p, 180, 270);
    else if (p) pts.push([0, b0 + p], [p, b0]);
    else pts.push([0, b0]);
    let Rc = 0, cy = 0, cz = 0, ySp = 0, a0 = 0;
    if (r.D) {
      Rc = r.D / 2; cy = Y - Rc; cz = Z - Rc;
      a0 = 180 + (Math.asin(clamp(cz / Rc, -1, 1)) * 180) / Math.PI;
      ySp = cy + Rc * Math.cos((a0 * Math.PI) / 180);
    }
    const yEnd = r.D ? ySp : r.lip ? Y - r.lip * 1.1 : r.ui ? Y - r.ui : Y - p;
    if (r.T) for (let i = 1; i <= 24; i++) { const y = (r.run * Y * i) / 24; pts.push([y, bottomAt(r, y) + z0]); }
    pts.push([yEnd, z0]);
    if (r.D) arc(pts, cy, cz, Rc, a0, 450, 28);
    else {
      if (r.lip) pts.push([Y, r.lip]);
      else if (r.ui) for (let i = 0; i <= 10; i++) { const th = ((9 * i) * Math.PI) / 180; pts.push([Y - r.ui * Math.cos(th), r.uh * Math.sin(th)]); }
      else if (p && r.edge === "rounded") arc(pts, Y - p, z0 + p, p, 270, 360);
      else if (p) pts.push([Y, z0 + p]);
      else pts.push([Y, z0]);
      const Zr = z1 + r.R;
      if (p && r.edge === "rounded") arc(pts, Y - p, Zr - p, p, 0, 90);
      else if (p) pts.push([Y, Zr - p], [Y - p, Zr]);
      else pts.push([Y, Zr]);
      if (r.R) pts.push([Y - r.Sd, Zr], [Y - r.Sd - r.R * 0.8, z1]);
    }
    if (p && r.edge === "rounded") arc(pts, p, z1 - p, p, 90, 180);
    else if (p) pts.push([p, z1], [0, z1 - p]);
    else pts.push([0, z1]);
    return pts;
  }

  /** Field bumper blocks, full height, at the front and rear ends. */
  function bumperProfiles(r) {
    if (!r.bumper) return [];
    const { y: Y, z: Z } = r.S, L = r.bumper * 2.2, c = Math.min(r.bumper * 0.6, Z / 4);
    const box = (y0, y1) => { const pts = []; arc(pts, y0 + c, c, c, 180, 270, 4); arc(pts, y1 - c, c, c, 270, 360, 4); arc(pts, y1 - c, Z - c, c, 0, 90, 4); arc(pts, y0 + c, Z - c, c, 90, 180, 4); return pts; };
    return [box(-r.bumper * 0.15, L), box(Y - L, Y + r.bumper * 0.15)];
  }

  /** Closed lid section, counter-clockwise, lying on the base top. */
  function lidProfile(r) {
    const Z = r.S.z, lz = r.lidZ, Yl = r.Yd, pts = [];
    const c = Math.min(1.2, lz / 3);
    pts.push([c, Z], [Yl - c, Z]);
    if (r.lip) {
      const lt = lz * 0.8, Y = r.S.y;
      pts.push([Y, Z], [Y, Z - r.lip * 0.55], [Y + lt, Z - r.lip * 0.55], [Y + lt, Z + lz - c], [Y + lt - c, Z + lz]);
    } else pts.push([Yl, Z + c], [Yl, Z + lz - c], [Yl - c, Z + lz]);
    const n = 16;
    for (let i = 1; i < n; i++) { const y = Yl - (Yl * i) / n; pts.push([y, Z + lz + r.crown * Math.sin((Math.PI * y) / Yl)]); }
    pts.push([c, Z + lz], [0, Z + lz - c], [0, Z + c]);
    return pts;
  }

  function pivot(r) {
    const { y: Y, z: Z } = r.S, lz = r.lidZ;
    if (r.hinge === "spine") return [Y - r.D / 2, Z - r.D / 2];
    if (r.hinge === "inset") return [Y - r.Sd, Z];
    if (r.hinge === "drop") return [Y - lz * 0.4, Z - lz * 0.35];
    if (r.hinge === "lift") return [Y - lz * 0.2, Z - r.lip * 0.3];
    return [Y, Z];
  }

  function rot(pt, pv, deg) {
    const b = (-deg * Math.PI) / 180, dy = pt[0] - pv[0], dz = pt[1] - pv[1];
    return [pv[0] + dy * Math.cos(b) - dz * Math.sin(b), pv[1] + dy * Math.sin(b) + dz * Math.cos(b)];
  }

  // ------------------------------------------------------------ usable space

  function sideOffset(r, w) {
    if (r.pm) {
      const rc = r.corner * (r.cornerKind === "chamfer" ? 0.7 : 1);
      const co = rc <= w ? w : rc - (rc - w) / Math.SQRT2;
      return co + insetAt(r, r.S.z * 0.5, r.pm.m.s);
    }
    const p = r.p;
    let need = w;
    // shell.ts profileNeed at h = w: a chamfer needs p + w(√2 − 1), a round edge p.
    if (p > w) need = r.edge === "chamfer" ? p + w * (Math.SQRT2 - 1) : p;
    const rc = Math.max(r.corner, r.bumper ? r.bumper * 2.2 : 0);
    const co = rc <= 0 || need >= rc ? need : rc - (rc - need) / Math.SQRT2;
    return co + r.ui;
  }

  /** Floor room at depth y: [inner bottom, inner top], or null outside the inner box. */
  function band(r, y, year) {
    const w = WALL[year] * r.wallScale, { y: Y, z: Z } = r.S;
    if (r.pm) {
      const front = y < Y / 2, yy = front ? y : Y - y;
      if (yy < w + 0.3) return null;
      const [a, b] = outerAt(r, yy, front ? r.pm.m.f : r.pm.m.r);
      return b - w > a + w ? [a + w, b - w] : null;
    }
    const off = sideOffset(r, w);
    let lo = bottomAt(r, y) + r.q + w, hi = Z - r.q - w;
    if (r.R && y > Y - r.Sd) hi += r.R;
    if (r.lip && y > Y - r.lip * 1.1) lo = Math.max(lo, ((y - (Y - r.lip * 1.1)) / 1.1) + w);
    if (r.D) {
      const Rc = r.D / 2, cy = Y - Rc, cz = Z - Rc;
      if (y > cy) { if (y > Y - w) return null; const h = Math.sqrt(Math.max(0, (Rc - w) ** 2 - (y - cy) ** 2)); lo = cz - h; hi = Math.min(hi, cz + h); }
      else { const dy = cy - y; if (dy < Rc - w) lo = Math.min(lo, cz - Math.sqrt((Rc - w) ** 2 - dy * dy)); }
      if (y < off) return null;
      return hi > lo ? [lo, hi] : null;
    }
    if (y < off || y > Y - off) return null;
    return hi > lo ? [lo, hi] : null;
  }

  function usablePath(r, year, N = 90) {
    const top = [], bot = [];
    for (let i = 0; i <= N; i++) { const y = (r.S.y * i) / N; const b = band(r, y, year); if (b) { bot.push([y, b[0]]); top.push([y, b[1]]); } }
    return bot.concat(top.reverse());
  }

  function volume(r, year) {
    const w = WALL[year] * r.wallScale, N = 200;
    if (r.pm) {
      const ms = r.pm.m.s, co = sideOffset(r, w) - insetAt(r, r.S.z * 0.5, ms);
      let vol = 0;
      for (let i = 0; i < N; i++) {
        const b = band(r, (r.S.y * (i + 0.5)) / N, year);
        if (!b) continue;
        const dz = (b[1] - b[0]) / 10;
        for (let j = 0; j < 10; j++) vol += Math.max(0, r.S.x - 2 * (co + insetAt(r, b[0] + dz * (j + 0.5), ms))) * dz * (r.S.y / N);
      }
      return vol / 1e6;
    }
    const X = r.S.x - 2 * sideOffset(r, w);
    let a = 0;
    for (let i = 0; i < N; i++) { const b = band(r, (r.S.y * (i + 0.5)) / N, year); if (b) a += (b[1] - b[0]) * (r.S.y / N); }
    return Math.max(0, X) * a / 1e6; // litres
  }

  // ------------------------------------------------------------ fit model (mock build)

  const NEEDS = {
    2006: { x: 296, deckY: 204, lidY: 224, lidX: 327, hF: 16.5, hR: 19.5, deck: 5.5, port: 5.5 },
    2016: { x: 300, deckY: 196, lidY: 200, lidX: 326, hF: 8.5, hR: 13.5, deck: 4, port: 4.5 },
    2026: { x: 292, deckY: 188, lidY: 203, lidX: 309, hF: 6.2, hR: 10.8, deck: 3, port: 3.2 },
  };

  function fits(b, S, t, year, opts) {
    const n = NEEDS[year], r = resolve(b, S, t, year, opts), w = WALL[year] * r.wallScale;
    const off = sideOffset(r, w);
    const zoneOk = (y0, y1, h) => { for (let i = 0; i <= 8; i++) { const y = y0 + ((y1 - y0) * i) / 8; const bb = band(r, y, year); if (!bb || bb[1] - bb[0] < h - 1e-6) return false; } return true; };
    const Y = S.y;
    if (!zoneOk(0.08 * Y, 0.4 * Y, n.hF)) return false;
    const rearEnd = r.Sd ? Y - r.Sd - 2 : r.D ? Y - r.D / 2 : 0.92 * Y;
    if (!zoneOk(0.55 * Y, rearEnd, n.hR)) return false;
    if (r.Sd && !zoneOk(Y - r.Sd + 2, Y - off - 1, n.hR - n.deck)) return false;
    const lift = Math.max(r.uh, r.p, r.q) ;
    if (S.z - w - lift - r.q < n.port + 0.6) return false;
    if (r.pm) {
      // Ports need a vertical band of side wall between the top and bottom treatments.
      const ms = r.pm.m.s, room = ms < 0.05 ? S.z - 2 * w : S.z - r.pm.hB - r.pm.hT;
      if (room < n.port + 0.6) return false;
    }
    return true;
  }

  function minimum(b, S, t, year, opts) {
    const n = NEEDS[year];
    const r = resolve(b, S, t, year, opts), w = WALL[year] * r.wallScale, off = sideOffset(r, w);
    const x = Math.max(n.x + 2 * off, n.lidX + 2 * w);
    const deckLoss = r.D ? r.D / 2 : r.Sd;
    const y = Math.max(n.deckY + 2 * off + deckLoss, n.lidY + 2 * w + deckLoss + (r.lip ? 0 : 0));
    let z = LIMITS.z[1] + 0.1;
    for (let Z = LIMITS.z[0]; Z <= LIMITS.z[1] + 1e-9; Z += 0.1) { if (fits(b, { x: S.x, y: Math.max(S.y, y), z: Z }, t, year, opts)) { z = Z; break; } }
    return { x, y, z: Math.round(z * 10) / 10 };
  }

  // ------------------------------------------------------------ drawing

  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(",")})`;
  const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const ptsStr = (pts, fx, fy) => pts.map(([a, b]) => `${f1(fx(a))},${f1(fy(b))}`).join(" ");

  /** Side silhouette, closed: base and lid. Front on the left. vx exaggerates z. */
  function silhouetteSvg(r, o = {}) {
    const W = o.w ?? 144, H = o.h ?? 44, pad = 2, vx = o.vx ?? 2, k = o.scale;
    const fx = (y) => pad + y * k, base = H - pad - (r.drop + 0) * k * vx;
    const fy = (z) => base - z * k * vx;
    const col = o.colour ?? "#a8998a", lid = o.lid ?? "#6f655b";
    const parts = [
      `<polygon points="${ptsStr(lidProfile(r), fx, fy)}" fill="${lid}"/>`,
      `<polygon points="${ptsStr(baseProfile(r), fx, fy)}" fill="${col}"/>`,
      ...bumperProfiles(r).map((b) => `<polygon points="${ptsStr(b, fx, fy)}" fill="${o.bumper ?? "#2a2522"}" stroke="${col}" stroke-width="0.8"/>`),
    ];
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible">${parts.join("")}</svg>`;
  }

  /** Engineering section: outer base, closed lid, usable floor room, and the Workhorse box dashed. */
  function sectionSvg(r, year, o = {}) {
    const k = o.scale ?? 2, pad = o.pad ?? 16, vx = o.vx ?? 1;
    const Y = r.S.y, top = r.S.z + r.lidZ + r.R + r.crown + 2, bottom = -(r.drop + 2);
    const W = o.w ?? Y * k + pad * 2 + (r.lip ? r.lidZ * k : 0), H = (top - bottom) * k * vx + pad * 2;
    const fx = (y) => pad + y * k, fy = (z) => pad + (top - z) * k * vx;
    const c = o.c ?? {};
    const wb = hexRgb(c.body ?? "#3d3f43");
    const w = WALL[year] * r.wallScale;
    const wr = resolve(BODIES[0], r.S, 0.5, year), woff = sideOffset(wr, WALL[year]);
    const els = [];
    els.push(`<polygon points="${ptsStr(lidProfile(r), fx, fy)}" fill="${rgb(mix(wb, [0, 0, 0], 0.35))}"/>`);
    els.push(`<polygon points="${ptsStr(baseProfile(r), fx, fy)}" fill="${rgb(wb)}"/>`);
    for (const b of bumperProfiles(r)) els.push(`<polygon points="${ptsStr(b, fx, fy)}" fill="${c.bumper ?? "#1a1614"}" stroke="${rgb(wb)}" stroke-width="1"/>`);
    els.push(`<polygon points="${ptsStr(usablePath(r, year), fx, fy)}" fill="${c.usable ?? "#0e0b09"}" stroke="${c.accent ?? "#f0913d"}" stroke-width="1.2"/>`);
    els.push(`<rect x="${f1(fx(woff))}" y="${f1(fy(r.S.z - WALL[year]))}" width="${f1((Y - 2 * woff) * k)}" height="${f1((r.S.z - 2 * WALL[year]) * k * vx)}" fill="none" stroke="${c.ref ?? "#efe6dc"}" stroke-opacity="0.55" stroke-dasharray="4 3" stroke-width="1"/>`);
    const pv = pivot(r);
    els.push(`<circle cx="${f1(fx(pv[0]))}" cy="${f1(fy(pv[1]))}" r="3" fill="none" stroke="${c.ref ?? "#efe6dc"}" stroke-width="1.2"/>`);
    return `<svg viewBox="0 0 ${f1(W)} ${f1(H)}" width="${f1(W)}" height="${f1(H)}" style="display:block;max-width:100%;height:auto">${els.join("")}</svg>`;
  }

  /** Plan outline, counter-clockwise, front at y = 0, each side inset on its own; ch cuts the corners flat. */
  function roundRect4(X, Y, rc, I, n = 6, ch = false) {
    const pts = [];
    const rr = Math.max(0, Math.min(rc - Math.min(I.l, I.r, I.f, I.b), (X - I.l - I.r) / 2, (Y - I.f - I.b) / 2));
    const cs = [[X - I.r - rr, I.f + rr, -90], [X - I.r - rr, Y - I.b - rr, 0], [I.l + rr, Y - I.b - rr, 90], [I.l + rr, I.f + rr, 180]];
    for (const [cx, cy, a0] of cs) {
      const r0 = (a0 * Math.PI) / 180, r1 = ((a0 + 90) * Math.PI) / 180;
      for (let i = 0; i <= n; i++) {
        if (ch) { const u = i / n; pts.push([cx + rr * lerp(Math.cos(r0), Math.cos(r1), u), cy + rr * lerp(Math.sin(r0), Math.sin(r1), u)]); }
        else { const a = lerp(r0, r1, i / n); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
      }
    }
    return pts;
  }
  const roundRect = (X, Y, rc, inset = 0, n = 6, ch = false) => roundRect4(X, Y, rc, { l: inset, r: inset, f: inset, b: inset }, n, ch);

  /** Plan from above, front at the bottom: outline, bumpers, undercut footprint dashed, inner box. */
  function planSvg(r, year, o = {}) {
    const k = o.scale ?? 0.6, pad = 8, { x: X, y: Y } = r.S;
    const W = X * k + pad * 2, H = Y * k + pad * 2;
    const fx = (x) => pad + x * k, fy = (y) => pad + (Y - y) * k;
    const c = o.c ?? {};
    const off = sideOffset(r, WALL[year] * r.wallScale);
    const ch = r.cornerKind === "chamfer";
    const els = [`<polygon points="${ptsStr(roundRect(X, Y, r.corner, 0, 6, ch), fx, fy)}" fill="${c.body ?? "#3d3f43"}"/>`];
    if (r.pm) els.push(`<polygon points="${ptsStr(roundRect4(X, Y, r.corner, sideIns(r, 0), 6, ch), fx, fy)}" fill="none" stroke="${c.ref ?? "#efe6dc"}" stroke-opacity="0.5" stroke-dasharray="3 3"/>`);
    if (r.ui) els.push(`<polygon points="${ptsStr(roundRect(X, Y, r.corner, r.ui), fx, fy)}" fill="none" stroke="${c.ref ?? "#efe6dc"}" stroke-opacity="0.5" stroke-dasharray="3 3"/>`);
    if (r.bumper) { const L = r.bumper * 2.2; for (const [x0, y0] of [[0, 0], [X - L, 0], [0, Y - L], [X - L, Y - L]]) els.push(`<rect x="${f1(fx(x0))}" y="${f1(fy(y0 + L))}" width="${f1(L * k)}" height="${f1(L * k)}" rx="${f1(r.bumper * 0.5 * k)}" fill="${c.bumper ?? "#1a1614"}" stroke="${c.bodyLine ?? "#6f655b"}"/>`); }
    const yb = r.D ? Y - r.D / 2 : r.Sd ? Y - r.Sd : Y;
    if (yb < Y) els.push(`<line x1="${f1(fx(0))}" x2="${f1(fx(X))}" y1="${f1(fy(yb))}" y2="${f1(fy(yb))}" stroke="${c.ref ?? "#efe6dc"}" stroke-opacity="0.5" stroke-width="1"/>`);
    els.push(`<rect x="${f1(fx(off))}" y="${f1(fy(Y - (r.D ? WALL[year] : off)))}" width="${f1((X - 2 * off) * k)}" height="${f1((Y - off - (r.D ? WALL[year] : off)) * k)}" fill="none" stroke="${c.accent ?? "#f0913d"}" stroke-width="1"/>`);
    return `<svg viewBox="0 0 ${f1(W)} ${f1(H)}" width="${f1(W)}" height="${f1(H)}" style="display:block;max-width:100%;height:auto">${els.join("")}</svg>`;
  }

  // 3/4 hero: each section extruded across the width, lit, painter-sorted.
  function heroSvg(r, o = {}) {
    const { x: X, y: Y } = r.S;
    const psi = ((o.yaw ?? 46) * Math.PI) / 180, phi = ((o.pitch ?? 16) * Math.PI) / 180;
    const R = [Math.cos(psi), Math.sin(psi), 0];
    const F = [-Math.sin(psi), Math.cos(psi), 0];
    const V = [F[0] * Math.cos(phi), F[1] * Math.cos(phi), -Math.sin(phi)];
    const U = [F[0] * Math.sin(phi), F[1] * Math.sin(phi), Math.cos(phi)];
    const C = [-V[0], -V[1], -V[2]];
    const Ld = (() => { const l = [0.5, -0.45, 0.74]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const angle = o.angle ?? (r.hinge === "lift" ? 125 : 110);
    const tilt = r.hinge === "lift" && angle > 95 ? Math.atan((r.lip * 0.6) / Y) : 0;
    const tiltP = ([y, z]) => [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
    const body = hexRgb(o.colour ?? "#3d3f43"), key = hexRgb("#ffb27a"), rim = hexRgb("#86a2ff");
    const faces = [];
    const shade = (n, base, gloss = 0.1) => {
      const lam = Math.max(0, dot(n, Ld));
      let c = mix([0, 0, 0], base, 0.32 + 0.78 * lam);
      c = mix(c, key, 0.1 * lam);
      if (n[2] < 0.2 && dot(n, [0.7, 0.4, 0]) > 0.3) c = mix(c, rim, 0.08);
      return mix(c, [255, 255, 255], gloss * Math.pow(lam, 8));
    };
    let group = 0;
    const pushFace = (p3, n, fill, decal = false) => {
      if (dot(n, C) <= 1e-4) return;
      const d = decal ? -1e9 : p3.reduce((s2, p) => s2 + dot(p, V), 0) / p3.length;
      faces.push({ p3, fill, d, g: group });
    };
    const extrude = (prof, x0, x1, base, map) => {
      const P = prof.map(map);
      const n = P.length;
      const cap = (x, sign) => pushFace(P.map(([y, z]) => [x, y, z]), [sign, 0, 0], rgb(shade([sign, 0, 0], base)));
      cap(x1, 1); cap(x0, -1);
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n];
        const dy = b[0] - a[0], dz = b[1] - a[1], m = Math.hypot(dy, dz) || 1;
        const nn = [0, dz / m, -dy / m];
        pushFace([[x0, a[0], a[1]], [x1, a[0], a[1]], [x1, b[0], b[1]], [x0, b[0], b[1]]], nn, rgb(shade(nn, base)));
      }
    };
    // Loft: rings of the plan outline stacked in z, joined by quads. Newell normals follow the
    // counter-clockwise ring order, so they point outward through any proper rotation.
    const newell = (q) => { const n = [0, 0, 0]; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); } const m = Math.hypot(...n); return m < 1e-9 ? null : n.map((v) => v / m); };
    const loft = (rings, base) => {
      const face = (q) => { const n = newell(q); if (n) pushFace(q, n, rgb(shade(n, base))); };
      face(rings[rings.length - 1]);
      face([...rings[0]].reverse());
      for (let j = 0; j < rings.length - 1; j++) {
        const A = rings[j], B = rings[j + 1], n = A.length;
        for (let i = 0; i < n; i++) face([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]]);
      }
    };
    const ch = r.cornerKind === "chamfer";
    const baseMap = (pt) => tiltP(pt);
    const pv = pivot(r);
    const lidMap = (pt) => tiltP(rot(pt, pv, angle));
    const lidCol = mix(body, [0, 0, 0], 0.06);
    if (r.pm) {
      const lz = r.lidZ, c = Math.min(1.2, lz / 3), Z0 = r.S.z;
      const lr = [[Z0, 0], [Z0 + lz - c, 0], [Z0 + lz, c]].map(([z, d]) => roundRect(X, r.Yd, r.corner, d, 6, ch).map(([x, y]) => [x, ...lidMap([y, z])]));
      loft(lr, lidCol);
    } else extrude(lidProfile(r), 0, X, lidCol, lidMap);
    const bez = Math.max(5, r.Yd * 0.04), Zs = r.S.z - 0.05;
    const scr = [[bez, bez], [X - bez, bez], [X - bez, r.Yd - bez * 1.8], [bez, r.Yd - bez * 1.8]].map(([x, y]) => { const [yy, zz] = lidMap([y, Zs]); return [x, yy, zz]; });
    const nl = (() => { const [a, b] = [lidMap([0, 0]), lidMap([0, -1])]; return [0, b[0] - a[0], b[1] - a[1]]; })();
    pushFace(scr, nl, o.screen ?? "#0b0d10", true);
    group = 1;
    if (r.pm) loft(pmLevels(r).map((z) => roundRect4(X, Y, r.corner, sideIns(r, z), 6, ch).map(([x, y]) => [x, ...baseMap([y, z])])), body);
    else extrude(baseProfile(r), 0, X, body, baseMap);
    const bump = hexRgb("#1a1614");
    for (const b of bumperProfiles(r)) { const L = r.bumper * 2.2; extrude(b, -r.bumper * 0.15, L, bump, baseMap); extrude(b, X - L, X + r.bumper * 0.15, bump, baseMap); }
    // Deck decals: keyboard, trackpad; lid: the panel.
    const Zt = r.S.z - r.q + 0.05, Yd = r.Yd;
    const topQuad = (x0, x1, y0, y1, fill) => { const q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => { const [yy, zz] = tiltP([y, Zt]); return [x, yy, zz]; }); pushFace(q, [0, 0, 1], fill, true); };
    topQuad(X * 0.1, X * 0.9, Yd * 0.44, Yd * 0.9, rgb(mix(shade([0, 0, 1], body), [0, 0, 0], 0.55)));
    topQuad(X * 0.34, X * 0.66, Yd * 0.07, Yd * 0.36, rgb(mix(shade([0, 0, 1], body), [255, 255, 255], 0.05)));
    faces.sort((a, b) => a.g - b.g || b.d - a.d);
    const proj = (p) => [dot(p, R), -dot(p, U)];
    const k = o.scale ?? 1.4;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const out = faces.map((f) => { const q = f.p3.map((p) => { const [a, b] = proj(p); minx = Math.min(minx, a); maxx = Math.max(maxx, a); miny = Math.min(miny, b); maxy = Math.max(maxy, b); return [a, b]; }); return { q, fill: f.fill }; });
    const cxp = o.centre ?? [(minx + maxx) / 2, (miny + maxy) / 2];
    const W = o.w ?? (maxx - minx) * k + 20, H = o.h ?? (maxy - miny) * k + 20;
    const ox = W / 2 - cxp[0] * k, oy = (o.baseline ?? H / 2) - (o.baseline ? maxy : cxp[1]) * k;
    const polys = out.map((f) => `<polygon points="${f.q.map(([a, b]) => `${f1(ox + a * k)},${f1(oy + b * k)}`).join(" ")}" fill="${f.fill}" stroke="${f.fill}" stroke-width="0.6" stroke-linejoin="round"/>`);
    return `<svg viewBox="0 0 ${f1(W)} ${f1(H)}" width="${f1(W)}" height="${f1(H)}" style="display:block;overflow:visible;max-width:100%;height:auto">${polys.join("")}</svg>`;
  }

  window.BodyKit = { insetAt, LIMITS, YEARS, LID, WALL, BODIES, NEEDS, available, resolve, baseProfile, lidProfile, usablePath, band, sideOffset, volume, minimum, silhouetteSvg, sectionSvg, planSvg, heroSvg };
})();
