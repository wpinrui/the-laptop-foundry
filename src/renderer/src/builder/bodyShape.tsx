import { bumperBlock, type Fit, floorBand, hingeAxis, outerSection } from "../engine";

// The body in side section, drawn from the solved shell: the tray cards'
// silhouettes and the Chassis stage's section view. Front on the left, engine mm.

type Pt = [number, number];
const N = 80;

/** The base's outer section along the centre line: bottom front to rear, then top rear to front. */
function baseOutline(fit: Fit): Pt[] {
  const o = fit.shell.outer;
  const st = fit.shell.style;
  const p = st.profile;
  // How far the edge profile cuts in at distance d from an end.
  const cut = (d: number) => {
    if (p <= 0 || d >= p) return 0;
    return st.edge === "chamfer" ? p - d : p - Math.sqrt(p * p - (p - d) ** 2);
  };
  // The undercut's cove lifts the bottom near each end.
  const cove = (d: number) => (st.ui > 0 && d < st.ui ? st.uh * Math.sqrt(1 - (d / st.ui) ** 2) : 0);
  const ys = new Set<number>();
  for (let i = 0; i <= N; i++) ys.add((o.y * i) / N);
  for (let i = 0; i <= 8; i++) {
    const d = (Math.max(p, st.ui) * i) / 8;
    ys.add(d);
    ys.add(o.y - d);
  }
  const lo: Pt[] = [];
  const hi: Pt[] = [];
  for (const y of [...ys].sort((a, b) => a - b)) {
    const s = outerSection(st, o, y);
    if (!s) continue;
    // A spine's round is the rear end; the profile only cuts the front there.
    const d = st.D > 0 ? y : Math.min(y, o.y - y);
    const b = s[0] + Math.max(cut(d), cove(d));
    const t = s[1] - cut(d);
    lo.push([y, Math.min(b, t)]);
    hi.push([y, Math.max(b, t)]);
  }
  return [...lo, ...hi.reverse()];
}

/** The closed lid, a slab on the base from the front to its hinge end. */
function lidOutline(fit: Fit): Pt[] {
  const l = fit.shell.lid;
  const z0 = fit.shell.outer.z;
  const z1 = z0 + l.size.z;
  const c = fit.shell.style.crown;
  const top: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const y = (l.size.y * i) / 16;
    top.push([y, z1 + c * Math.sin((Math.PI * y) / l.size.y)]);
  }
  return [[0, z0], [l.size.y, z0], ...top.reverse()];
}

/** The corner bumpers' blocks at the front and rear ends. */
function bumperOutlines(fit: Fit): Pt[][] {
  const b = fit.shell.style.bumper;
  if (b <= 0) return [];
  const o = fit.shell.outer;
  const L = bumperBlock(fit.shell.style);
  const box = (y0: number, y1: number): Pt[] => [[y0, 0], [y1, 0], [y1, o.z], [y0, o.z]];
  return [box(-0.15 * b, L), box(o.y - L, o.y + 0.15 * b)];
}

/** Floor room at each depth, as a closed outline: inner bottom front to rear, then inner top back. */
function roomOutline(fit: Fit): Pt[] {
  const o = fit.shell.outer;
  const lo: Pt[] = [];
  const hi: Pt[] = [];
  for (let i = 0; i <= N * 2; i++) {
    const y = (o.y * i) / (N * 2);
    const b = floorBand(fit.shell.style, o, fit.shell.offsets, fit.shell.walls.bottom, y);
    if (!b) continue;
    lo.push([y, b[0]]);
    hi.push([y, b[1]]);
  }
  return [...lo, ...hi.reverse()];
}

/** Usable floor volume in litres: the room at each depth times the inner width. */
export function insideLitres(fit: Fit): number {
  const o = fit.shell.outer;
  const width = Math.max(0, o.x - 2 * fit.shell.offsets.side);
  let area = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const b = floorBand(fit.shell.style, o, fit.shell.offsets, fit.shell.walls.bottom, (o.y * (i + 0.5)) / n);
    if (b) area += (b[1] - b[0]) * (o.y / n);
  }
  return (width * area) / 1e6;
}

const pts = (p: Pt[], fx: (y: number) => number, fz: (z: number) => number) =>
  p.map(([y, z]) => `${fx(y).toFixed(1)},${fz(z).toFixed(1)}`).join(" ");

/** Extent of the drawing in engine mm: depth and height, above and below the base. */
export function silhouetteExtent(fit: Fit): { y: number; top: number; bottom: number } {
  const s = fit.shell.style;
  return {
    y: fit.shell.outer.y + (s.bumper > 0 ? 0.3 * s.bumper : 0),
    top: fit.shell.outer.z + fit.shell.lid.size.z + s.crown,
    bottom: -s.drop,
  };
}

/**
 * The closed laptop's side silhouette, front on the left. `k` is px per mm and
 * `vx` stretches the height, so cards share one scale and thin bodies read.
 */
export function Silhouette({ fit, k, vx, w, h, on }: { fit: Fit; k: number; vx: number; w: number; h: number; on?: boolean }) {
  const e = silhouetteExtent(fit);
  const fx = (y: number) => 1 + (y + (fit.shell.style.bumper > 0 ? 0.15 * fit.shell.style.bumper : 0)) * k;
  const fz = (z: number) => h - 1 - (z - e.bottom) * k * vx;
  const body = on ? "var(--accent)" : "var(--muted)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <polygon points={pts(lidOutline(fit), fx, fz)} fill={body} opacity={0.55} />
      <polygon points={pts(baseOutline(fit), fx, fz)} fill={body} />
      {bumperOutlines(fit).map((b, i) => (
        <polygon key={i} points={pts(b, fx, fz)} fill="var(--ground)" stroke={body} strokeWidth={0.8} />
      ))}
    </svg>
  );
}

/**
 * The base in section with its usable floor room, the plain slab's inner box
 * dashed for comparison, and the hinge axis ringed. Height is stretched 2.5
 * times so the room reads.
 */
export function SectionView({ fit }: { fit: Fit }) {
  const o = fit.shell.outer;
  const s = fit.shell.style;
  const e = silhouetteExtent(fit);
  const W = 900;
  const vx = 2.5;
  const pad = 20;
  const k = Math.min((W - 2 * pad) / (e.y + 10), 360 / ((e.top - e.bottom) * vx));
  const H = (e.top - e.bottom) * k * vx + 2 * pad;
  const fx = (y: number) => pad + (y + (s.bumper > 0 ? 0.15 * s.bumper : 0)) * k;
  const fz = (z: number) => H - pad - (z - e.bottom) * k * vx;
  // At the drawn size: a short build lays its parts out larger than it is drawn.
  const axis = hingeAxis(s, o, fit.lidZ);
  // The plain slab's inner box: the era's walls, no shape.
  const w = fit.shell.walls;
  const ws = s.wallScale;
  const box: Pt[] = [
    [w.side / ws, w.bottom / ws],
    [o.y - w.side / ws, w.bottom / ws],
    [o.y - w.side / ws, o.z - w.top / ws],
    [w.side / ws, o.z - w.top / ws],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H.toFixed(0)}`} className="bd-section-svg" aria-hidden="true">
      <polygon points={pts(lidOutline(fit), fx, fz)} fill="var(--muted)" fillOpacity={0.22} />
      <polygon points={pts(baseOutline(fit), fx, fz)} fill="var(--muted)" fillOpacity={0.45} />
      {bumperOutlines(fit).map((b, i) => (
        <polygon key={i} points={pts(b, fx, fz)} fill="var(--ground)" stroke="var(--muted)" strokeWidth={1} />
      ))}
      <polygon points={pts(roomOutline(fit), fx, fz)} fill="var(--ground-deep)" stroke="var(--accent)" strokeWidth={1.4} />
      <polygon points={pts(box, fx, fz)} fill="none" stroke="var(--text)" strokeOpacity={0.55} strokeDasharray="5 4" strokeWidth={1} />
      <circle cx={fx(axis.y)} cy={fz(axis.z)} r={4} fill="none" stroke="var(--text)" strokeWidth={1.4} />
    </svg>
  );
}
