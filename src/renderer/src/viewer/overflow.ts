import type { Box, Fit, Size, Vec3 } from "../engine";

export interface Slab {
  at: Vec3;
  size: Size;
}

const AXES = ["x", "y", "z"] as const;

/** The parts of a box outside a container box, as up to six slabs. */
export function outside(box: Slab, container: Slab): Slab[] {
  const out: Slab[] = [];
  let rest: Slab = { at: { ...box.at }, size: { ...box.size } };
  for (const a of AXES) {
    const lo = container.at[a];
    const hi = container.at[a] + container.size[a];
    const r0 = rest.at[a];
    const r1 = rest.at[a] + rest.size[a];
    if (r0 < lo - 1e-6) {
      const cut = Math.min(r1, lo);
      out.push({ at: { ...rest.at }, size: { ...rest.size, [a]: cut - r0 } });
    }
    if (r1 > hi + 1e-6) {
      const from = Math.max(r0, hi);
      out.push({
        at: { ...rest.at, [a]: from },
        size: { ...rest.size, [a]: r1 - from },
      });
    }
    const n0 = Math.max(r0, lo);
    const n1 = Math.min(r1, hi);
    if (n1 <= n0) return out;
    rest = {
      at: { ...rest.at, [a]: n0 },
      size: { ...rest.size, [a]: n1 - n0 },
    };
  }
  return out;
}

/** Everything that pokes out of the shell as drawn at the player's size. */
export function overflowSlabs(fit: Fit): Slab[] {
  const inner = fit.shell.inner;
  const lidInner = fit.shell.lid.inner;
  const slabs: Slab[] = [];
  for (const b of fit.boxes) {
    if (b.kind !== "unit") continue;
    let container: Slab = inner;
    // A removable pack forms the underside, so it may occupy the bottom wall.
    if (b.skin)
      container = {
        at: { ...inner.at, z: 0 },
        size: { ...inner.size, z: inner.size.z + inner.at.z },
      };
    if (b.piece === "lid") container = lidInner;
    slabs.push(...outside(b as Box, container));
  }
  return slabs.filter(
    (s) => s.size.x > 0.05 && s.size.y > 0.05 && s.size.z > 0.05,
  );
}
