import type { Content } from "./content";
import { CONTENT } from "./content";
import type { Node, Role, Side, ZoneNode } from "./types";
import { isZone } from "./types";

// Layouts are validated once, when authored. A zone that declares an edge
// must reach that outer boundary. Children stretch across their split, so a
// zone reaches an edge exactly when, at every split along that edge's axis on
// the way down, it lies in the first child (left, front) or the last (right, rear).

function reaches(root: Node, target: ZoneNode, side: Side): boolean {
  const axis = side === "left" || side === "right" ? "x" : "y";
  const first = side === "left" || side === "front";
  const walk = (n: Node): boolean | null => {
    if (isZone(n)) return n === target ? true : null;
    for (let i = 0; i < n.children.length; i++) {
      const r = walk(n.children[i]);
      if (r === null) continue;
      if (!r) return false;
      if (n.split !== axis) return true;
      return first ? i === 0 : i === n.children.length - 1;
    }
    return null;
  };
  return walk(root) === true;
}

function zones(root: Node): ZoneNode[] {
  const out: ZoneNode[] = [];
  const walk = (n: Node) => {
    if (isZone(n)) out.push(n);
    else for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

const PORT_ROLE: Record<Side, Role> = {
  left: "port:left",
  right: "port:right",
  rear: "port:rear",
  front: "port:front",
};

export function validatePlan(name: string, root: Node): string[] {
  const errors: string[] = [];
  const list = zones(root);
  const ids = new Set<string>();
  for (const z of list) {
    if (ids.has(z.zone))
      errors.push(`${name}: zone id ${z.zone} is used twice`);
    ids.add(z.zone);
    if (z.grow < 0)
      errors.push(`${name}: zone ${z.zone} has a negative grow weight`);
    if (z.edge && !reaches(root, z, z.edge))
      errors.push(
        `${name}: zone ${z.zone} declares edge ${z.edge} but does not reach it`,
      );
    const fan = z.takes.includes("fan");
    const fin = z.takes.includes("fin");
    if (fan !== fin)
      errors.push(`${name}: zone ${z.zone} must take fans and fins together`);
    if (fan && !z.edge)
      errors.push(`${name}: fan zone ${z.zone} needs a vent edge`);
    for (const side of ["left", "right", "rear", "front"] as Side[]) {
      if (z.takes.includes(PORT_ROLE[side]) && z.edge !== side)
        errors.push(
          `${name}: zone ${z.zone} takes ${side} ports but is not on the ${side} edge`,
        );
    }
    if (z.takes.includes("odd") && !z.edge)
      errors.push(`${name}: optical bay ${z.zone} needs an edge`);
  }
  const walkSplits = (n: Node) => {
    if (isZone(n)) return;
    if (n.children.length === 0) errors.push(`${name}: empty split`);
    for (const c of n.children) walkSplits(c);
  };
  walkSplits(root);
  return errors;
}

/** Every layout and plan in the content, validated. Empty means all good. */
export function validateContent(content: Content = CONTENT): string[] {
  const errors: string[] = [];
  const plans = new Map(content.plans.map((p) => [p.id, p]));
  for (const p of content.plans)
    errors.push(...validatePlan(`plan ${p.id}`, p.root));
  for (const l of content.layouts) {
    errors.push(...validatePlan(`layout ${l.id} floor`, l.floor));
    if (!plans.has(l.deck))
      errors.push(`layout ${l.id}: missing deck plan ${l.deck}`);
    if (!plans.has(l.lid))
      errors.push(`layout ${l.id}: missing lid plan ${l.lid}`);
    const floorZones = zones(l.floor);
    for (const side of ["left", "right", "rear", "front"] as Side[]) {
      const has = floorZones.some((z) => z.takes.includes(PORT_ROLE[side]));
      if (has !== l.portSides.includes(side))
        errors.push(
          `layout ${l.id}: portSides disagrees with the tree on ${side}`,
        );
    }
    for (const role of ["board", "battery", "hinge"] as Role[]) {
      if (!floorZones.some((z) => z.takes.includes(role)))
        errors.push(`layout ${l.id}: no zone takes ${role}`);
    }
    if (floorZones.filter((z) => z.takes.includes("hinge")).length !== 2)
      errors.push(`layout ${l.id}: needs exactly two hinge zones`);
  }
  for (const b of content.bodies) {
    for (const id of b.layouts)
      if (!content.layouts.some((l) => l.id === id))
        errors.push(`body ${b.id}: unknown layout ${id}`);
  }
  return errors;
}
