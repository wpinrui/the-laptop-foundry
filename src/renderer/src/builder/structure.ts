import { available, type Build, CONTENT, type Piece, PIECES } from "../engine";

// Structural choices always hold a valid value for the year. Changing year
// keeps every part, port, option and spend setting: anything the new year
// lacks stays in the build and the engine flags it unavailable, for the
// player to replace.

function firstBody(year: number): string {
  return (CONTENT.bodies.find((b) => available(b, year)) ?? CONTENT.bodies[0])
    .id;
}

function validLayout(body: string, layout: string, year: number): string {
  const b = CONTENT.bodies.find((x) => x.id === body);
  const ok = (id: string) =>
    b?.layouts.includes(id) &&
    CONTENT.layouts.some((l) => l.id === id && available(l, year));
  if (ok(layout)) return layout;
  return b?.layouts.find(ok) ?? layout;
}

export function materialsFor(year: number, piece: Piece): string[] {
  const era =
    [...CONTENT.eras].reverse().find((e) => e.year <= year) ?? CONTENT.eras[0];
  return CONTENT.materials
    .filter((m) => available(m, year) && era.pieces[m.id]?.includes(piece))
    .map((m) => m.id);
}

/** Keep materials, finishes and colours valid for the year, changing only what must change. */
function validFinish(b: Build): Pick<Build, "materials" | "finish"> {
  const materials = { ...b.materials };
  const finish = { ...b.finish };
  for (const piece of PIECES) {
    const allowed = materialsFor(b.year, piece);
    if (!allowed.includes(materials[piece]))
      materials[piece] = allowed[0] ?? materials[piece];
    const mat = CONTENT.materials.find((m) => m.id === materials[piece]);
    const f = { ...finish[piece] };
    const finishes = (mat?.finishes ?? []).filter((id) =>
      CONTENT.finishes.some((x) => x.id === id && available(x, b.year)),
    );
    if (!finishes.includes(f.texture)) f.texture = finishes[0] ?? f.texture;
    if (!CONTENT.colours.some((c) => c.id === f.colour && available(c, b.year)))
      f.colour = (
        CONTENT.colours.find((c) => available(c, b.year)) ?? CONTENT.colours[0]
      ).id;
    finish[piece] = f;
  }
  return { materials, finish };
}

/** Move a build to another year: choices are kept, missing ones get flagged; the structure stays valid. */
export function toYear(b: Build, year: number): Build {
  const bodyOk = CONTENT.bodies.some(
    (x) => x.id === b.body && available(x, year),
  );
  const body = bodyOk ? b.body : firstBody(year);
  const next: Build = { ...b, year, body };
  next.layout = validLayout(body, b.layout, year);
  return { ...next, ...validFinish(next) };
}

/** Switch body within the year, keeping the size and a layout the body takes. */
export function toBody(b: Build, body: string): Build {
  return { ...b, body, layout: validLayout(body, b.layout, b.year) };
}

/** The builder starts empty: only the structural choices hold a value. */
export function emptyBuild(): Build {
  const year = Math.max(...CONTENT.eras.map((e) => e.year));
  const body = firstBody(year);
  const b = CONTENT.bodies.find((x) => x.id === body);
  const colour = (
    CONTENT.colours.find((c) => available(c, year)) ?? CONTENT.colours[0]
  ).id;
  const base: Build = {
    year,
    body,
    layout: validLayout(body, CONTENT.layouts[0].id, year),
    size: { ...(b?.size ?? { x: 340, y: 240, z: 22 }) },
    parts: {},
    ports: [],
    materials: { floor: "", deck: "", lid: "" },
    finish: {
      floor: { colour, texture: "" },
      deck: { colour, texture: "" },
      lid: { colour, texture: "" },
    },
    spend: {},
  };
  return { ...base, ...validFinish(base) };
}
