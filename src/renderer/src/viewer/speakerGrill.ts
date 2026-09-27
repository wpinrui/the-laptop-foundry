import * as THREE from "three";
import { type Fit, outerSpanAt, speakerHoles } from "../engine";

// The speaker grill as drawn: each hole a flat polygon in the opening colour,
// lying on the surface it is cut in. On the deck a hole sits on the top at its
// own depth, so it follows a section that changes along the depth; on the
// front it lies on the front face. The grill adds no material of its own: the
// surface around the holes is the shell's.

/** How far a hole stands off its surface, mm; polygon offset does the rest. */
const LIFT = 0.02;

/** Triangles for every hole of the speaker grill, in engine space. */
export function speakerGrillPositions(fit: Fit, year: number): Float32Array {
  const sg = fit.shell.speakerGrill;
  if (!sg || sg.panels.length === 0) return new Float32Array(0);
  const out = fit.shell.outer;
  const style = fit.shell.style;
  const pos: number[] = [];
  for (const p of sg.panels) {
    const { polys } = speakerHoles(sg.pattern, sg.hole, year, p.s, p.l);
    for (const poly of polys) {
      let cs = 0;
      let cl = 0;
      for (const [s, l] of poly) {
        cs += s;
        cl += l;
      }
      cs /= poly.length;
      cl /= poly.length;
      let v: (s: number, l: number) => [number, number, number];
      if (p.surface === "deck") {
        // s runs across x, l along y; the whole hole at the height under its middle.
        const z = outerSpanAt(style, out, p.cx + cs, p.cy + cl)[1] + LIFT;
        v = (s, l) => [p.cx + s, p.cy + l, z];
      } else {
        // s runs up z, l along x, on the front face.
        v = (s, l) => [p.cx + l, -LIFT, p.cz + s];
      }
      const c = v(cs, cl);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        pos.push(...c, ...v(a[0], a[1]), ...v(b[0], b[1]));
      }
    }
  }
  return new Float32Array(pos);
}

export function speakerGrillGeometry(fit: Fit, year: number): THREE.BufferGeometry | null {
  const pos = speakerGrillPositions(fit, year);
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}
