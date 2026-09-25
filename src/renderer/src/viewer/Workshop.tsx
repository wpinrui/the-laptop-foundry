import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Size } from "../engine";
import { token } from "./theme";

// The workshop the laptop is built in: a wooden bench under it and a pegboard
// wall behind, with a shelf and hand tools. All procedural, no assets. Drawn in
// engine space (z up, y toward the rear), inside the base's frame.

function pegboardTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = token("shop-peg");
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = token("shop-peg-hole");
    for (let y = 16; y < 256; y += 32)
      for (let x = 16; x < 256; x += 32) {
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hanging tools on the pegboard: x from centre, z of the hook, shaft length. */
const TOOLS: [number, number, number][] = [
  [-440, 440, 160],
  [-360, 460, 120],
  [-280, 430, 190],
  [-200, 450, 140],
  [420, 440, 170],
];

export function Workshop({ out }: { out: Size }) {
  const peg = useMemo(() => pegboardTexture(), []);
  useEffect(() => () => peg.dispose(), [peg]);
  const cx = out.x / 2;
  const benchW = 1800;
  const benchD = 800;
  // The bench top is flush with the bottom of the base.
  const benchY = out.y / 2 + 120;
  const wallY = benchY + benchD / 2;
  const tool = token("shop-tool");
  const grip = token("shop-tool-grip");
  return (
    <group>
      <mesh position={[cx, benchY, -20]} scale={[benchW, benchD, 40]}>
        <boxGeometry />
        <meshStandardMaterial color={token("shop-bench")} roughness={0.75} />
      </mesh>
      <mesh position={[cx, benchY - benchD / 2 + 10, -50]} scale={[benchW, 20, 60]}>
        <boxGeometry />
        <meshStandardMaterial color={token("shop-bench-edge")} roughness={0.8} />
      </mesh>
      <mesh position={[cx, wallY + 30, 450]} scale={[benchW * 1.6, 20, 1000]}>
        <boxGeometry />
        <meshStandardMaterial color={token("shop-wall")} roughness={0.95} />
      </mesh>
      {/* The plane faces -y (toward the laptop) after turning about x. */}
      <mesh position={[cx, wallY + 15, 380]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[1300, 520]} />
        <meshStandardMaterial map={peg} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx + 300, wallY - 80, 580]} scale={[460, 170, 18]}>
        <boxGeometry />
        <meshStandardMaterial color={token("shop-shelf")} roughness={0.8} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[cx + 160 + i * 110, wallY - 80, 589 + (70 + i * 14) / 2]}
          scale={[70, 90, 70 + i * 14]}
        >
          <boxGeometry />
          <meshStandardMaterial
            color={i === 1 ? grip : tool}
            roughness={0.6}
            metalness={0.3}
          />
        </mesh>
      ))}
      {TOOLS.map(([x, z, len]) => (
        <group key={x} position={[cx + x, wallY - 10, z]}>
          <mesh position={[0, 0, -len / 2]} scale={[8, 8, len]}>
            <boxGeometry />
            <meshStandardMaterial color={tool} metalness={0.8} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 30]} scale={[22, 22, 70]}>
            <boxGeometry />
            <meshStandardMaterial color={grip} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
