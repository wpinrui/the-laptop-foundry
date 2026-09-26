import { useMemo } from "react";
import * as THREE from "three";
import type { Box } from "../engine";
import { token } from "../viewer/theme";

// Selection marks drawn in the Model's engine space (mm, z up): light edges
// round the selected part, and warning outlines where an empty slot's part goes.

const unitEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

function BoxEdges({ box, colour, flat }: { box: Box; colour: string; flat?: boolean }) {
  const z = flat ? box.at.z + 0.2 : box.at.z + box.size.z / 2;
  const sz = flat ? 0.01 : Math.max(0.2, box.size.z) + 0.2;
  return (
    <lineSegments
      geometry={unitEdges}
      position={[box.at.x + box.size.x / 2, box.at.y + box.size.y / 2, z]}
      scale={[box.size.x + 0.2, box.size.y + 0.2, sz]}
      renderOrder={8}
    >
      <lineBasicMaterial color={colour} depthTest={!flat} transparent opacity={flat ? 0.9 : 1} />
    </lineSegments>
  );
}

export function SelectionMarks({ selected, empty }: { selected: Box[]; empty: Box[] }) {
  const edge = useMemo(() => token("select-edge"), []);
  const warn = useMemo(() => token("warning-hex"), []);
  return (
    <group>
      {selected.map((b) => (
        <BoxEdges key={`s-${b.id}`} box={b} colour={edge} />
      ))}
      {empty.map((b) => (
        <BoxEdges key={`e-${b.id}`} box={b} colour={warn} flat />
      ))}
    </group>
  );
}
