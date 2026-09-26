import { available, type Index } from "./content";
import type {
  Body,
  Build,
  Category,
  Era,
  Layout,
  Part,
  Problem,
} from "./types";
import { CATEGORIES, PIECES } from "./types";
import { screenOf, screenProblems } from "./screen";

const REQUIRED: Category[] = [
  "processor",
  "memory",
  "storage",
  "display",
  "battery",
  "cooling",
  "keyboard",
  "trackpad",
];
const MAX: Partial<Record<Category, number>> = { storage: 2 };

/**
 * Compatibility and year problems. They show live but never turn anything red.
 * A part that does not exist in the year is flagged, never swapped.
 */
export function checkCompat(
  build: Build,
  idx: Index,
  era: Era,
  body: Body,
  layout: Layout,
): Problem[] {
  const out: Problem[] = [];
  const year = build.year;

  if (!available(body, year))
    out.push({ kind: "year", code: "unavailable", what: "body", ref: body.id });
  if (!available(layout, year))
    out.push({
      kind: "year",
      code: "unavailable",
      what: "layout",
      ref: layout.id,
    });
  if (!body.layouts.includes(layout.id))
    out.push({ kind: "compat", code: "layout-not-on-body", layout: layout.id });

  for (const piece of PIECES) {
    const m = idx.materials.get(build.materials[piece]);
    if (!m) {
      out.push({
        kind: "compat",
        code: "unknown",
        ref: build.materials[piece],
      });
      continue;
    }
    if (!available(m, year) || !era.pieces[m.id])
      out.push({
        kind: "year",
        code: "unavailable",
        what: "material",
        ref: m.id,
      });
    else if (!era.pieces[m.id].includes(piece))
      out.push({ kind: "compat", code: "wrong-piece", piece, material: m.id });
    const fin = build.finish[piece];
    const colour = idx.colours.get(fin.colour);
    if (!colour) out.push({ kind: "compat", code: "unknown", ref: fin.colour });
    else if (!available(colour, year))
      out.push({
        kind: "year",
        code: "unavailable",
        what: "colour",
        ref: colour.id,
      });
    const tex = idx.finishes.get(fin.texture);
    if (!tex) out.push({ kind: "compat", code: "unknown", ref: fin.texture });
    else {
      if (!available(tex, year))
        out.push({
          kind: "year",
          code: "unavailable",
          what: "finish",
          ref: tex.id,
        });
      if (!m.finishes.includes(tex.id))
        out.push({
          kind: "compat",
          code: "wrong-finish",
          piece,
          finish: tex.id,
        });
    }
  }

  const chosen: Part[] = [];
  const provided = new Set<string>();
  for (const cat of CATEGORIES) {
    if (cat === "display") {
      // The screen is a spec now; older saves hold a panel row, read as one.
      const spec = screenOf(build, idx.content);
      if (!spec) out.push({ kind: "compat", code: "missing", category: cat });
      else out.push(...screenProblems(spec, year, idx.content));
      continue;
    }
    const list = build.parts[cat] ?? [];
    if (REQUIRED.includes(cat) && list.length === 0)
      out.push({ kind: "compat", code: "missing", category: cat });
    const max = MAX[cat] ?? 1;
    if (list.length > max)
      out.push({ kind: "compat", code: "too-many", category: cat, max });
    for (const bp of list) {
      const part = idx.parts.get(bp.part);
      if (!part || part.category !== cat) {
        out.push({ kind: "compat", code: "unknown", ref: bp.part });
        continue;
      }
      if (!available(part, year))
        out.push({
          kind: "year",
          code: "unavailable",
          what: "part",
          ref: part.id,
        });
      for (const [key, value] of Object.entries(bp.opts ?? {})) {
        const list = part.options?.[key];
        if (!list || !list.some((v) => String(v) === String(value)))
          out.push({
            kind: "compat",
            code: "bad-option",
            part: part.id,
            option: key,
            value,
          });
      }
      chosen.push(part);
      for (const t of part.provides ?? []) provided.add(t);
    }
  }

  // Storage cap counts drives, not categories.
  let charges = false;
  const sides = new Set(layout.portSides);
  for (const p of build.ports) {
    const part = idx.parts.get(p.part);
    if (!part || part.category !== "port") {
      out.push({ kind: "compat", code: "unknown", ref: p.part });
      continue;
    }
    if (!available(part, year))
      out.push({
        kind: "year",
        code: "unavailable",
        what: "part",
        ref: part.id,
      });
    if (!sides.has(p.side))
      out.push({
        kind: "compat",
        code: "port-side",
        part: part.id,
        side: p.side,
      });
    const shape = Array.isArray(part.shape) ? part.shape[0] : part.shape;
    if (shape.kind === "port" && shape.charges) charges = true;
    chosen.push(part);
  }
  if (!charges) out.push({ kind: "compat", code: "no-charging" });

  const seen = new Set<string>();
  for (const part of chosen) {
    const bp = [...Object.values(build.parts).flat()].find(
      (b) => b?.part === part.id,
    );
    const needs = [...(part.needs ?? [])];
    for (const [key, byValue] of Object.entries(part.optionNeeds ?? {})) {
      const v = bp?.opts?.[key] ?? part.options?.[key]?.[0];
      if (v !== undefined) needs.push(...(byValue[String(v)] ?? []));
    }
    for (const need of needs) {
      const k = `${part.id}|${need}`;
      if (provided.has(need) || seen.has(k)) continue;
      seen.add(k);
      out.push({ kind: "compat", code: "needs", part: part.id, needs: need });
    }
  }
  return out;
}
