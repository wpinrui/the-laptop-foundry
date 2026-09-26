import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { token } from "../viewer/theme";

// Direct manipulation on the 3D laptop, in the Model's engine space (mm, z
// up): an accent outline round the selected item, corner squares where it can
// be resized, a dashed centre line where it is locked to the centre, and one
// double-headed arrow per direction it can move. The player drags the arrows,
// never the item. Arrows ignore depth so they always draw on top.

/** Set while an arrow is being dragged, so the scene does not orbit. */
export const arrowDrag = { on: false };

const R = 0.55;
const CONE_R = 2.1;
const CONE_H = 4.2;
const GAP = 4.5;
const UP = new THREE.Vector3(0, 1, 0);

type V3 = [number, number, number];

export function DragArrow({
  at,
  dir,
  reach,
  value,
  range,
  snaps = [],
  onChange,
  disabled,
  warn,
}: {
  at: V3;
  /** The direction the value grows, in engine space. */
  dir: V3;
  reach: number;
  value: number;
  range: [number, number];
  snaps?: number[];
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Drawn in the warning colour while the item sits somewhere invalid. */
  warn?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const [hot, setHot] = useState(false);
  const [drag, setDrag] = useState(false);
  const latest = useRef({ value, range, snaps, onChange });
  latest.current = { value, range, snaps, onChange };
  const colour = useMemo(() => token(hot || drag ? "hot" : warn ? "warning-hex" : "accent-hex"), [hot, drag, warn]);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize()), [dir]);
  const len = Math.max(1, reach - GAP - CONE_H);

  // Position along the arrow's line nearest the pointer ray, in mm.
  // The drag axis in world space, frozen when the drag starts: the arrow moves
  // with the item it drags, so measuring against its live position fights the drag.
  const axisAt = useRef<{ o: THREE.Vector3; d: THREE.Vector3 } | null>(null);
  const along = useRef<(x: number, y: number) => number | null>(() => null);
  along.current = (x, y) => {
    const g = group.current;
    if (!g) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    if (!axisAt.current) {
      const o0 = g.localToWorld(new THREE.Vector3(0, 0, 0));
      axisAt.current = { o: o0, d: g.localToWorld(new THREE.Vector3(0, 1, 0)).sub(o0).normalize() };
    }
    const { o, d } = axisAt.current;
    const r = ray.ray.direction;
    const w0 = o.clone().sub(ray.ray.origin);
    const b = d.dot(r);
    const den = 1 - b * b;
    if (den < 1e-4) return null;
    return (b * r.dot(w0) - d.dot(w0)) / den;
  };

  useEffect(() => {
    if (!drag) return;
    axisAt.current = null;
    let t0: number | null = null;
    let v0 = latest.current.value;
    const move = (e: PointerEvent) => {
      const t = along.current(e.clientX, e.clientY);
      if (t === null) return;
      if (t0 === null) {
        t0 = t;
        v0 = latest.current.value;
        return;
      }
      const { range: [lo, hi], snaps: s, onChange: set } = latest.current;
      let v = Math.min(hi, Math.max(lo, v0 + (t - t0)));
      for (const p of s) if (Math.abs(v - p) < 1.5) v = p;
      set(Math.round(v * 10) / 10);
    };
    const up = () => {
      setDrag(false);
      arrowDrag.on = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag]);

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (disabled) return;
    e.stopPropagation();
    arrowDrag.on = true;
    setDrag(true);
  };
  return (
    <group
      ref={group}
      position={at}
      quaternion={q}
      onPointerDown={down}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHot(true);
      }}
      onPointerOut={() => setHot(false)}
    >
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, s * (GAP + len / 2), 0]} renderOrder={12}>
            <cylinderGeometry args={[R, R, len, 10]} />
            <meshBasicMaterial color={colour} depthTest={false} transparent />
          </mesh>
          <mesh position={[0, s * (reach - CONE_H / 2), 0]} rotation-z={s < 0 ? Math.PI : 0} renderOrder={12}>
            <coneGeometry args={[CONE_R, CONE_H, 18]} />
            <meshBasicMaterial color={colour} depthTest={false} transparent />
          </mesh>
        </group>
      ))}
      <mesh renderOrder={12}>
        <sphereGeometry args={[1.3, 14, 10]} />
        <meshBasicMaterial color={colour} depthTest={false} transparent />
      </mesh>
      {/* A fatter invisible grip, so the arrow is easy to catch. */}
      <mesh>
        <cylinderGeometry args={[CONE_R * 1.4, CONE_R * 1.4, reach * 2, 8]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A rectangle through four corners, with optional corner squares. */
export function Outline({ corners, handles, warn }: { corners: V3[]; handles?: boolean; warn?: boolean }) {
  const colour = useMemo(() => token(warn ? "warning-hex" : "accent-hex"), [warn]);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([...corners, corners[0]].map((c) => new THREE.Vector3(...c)));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true }));
    l.renderOrder = 10;
    return l;
  }, [corners, colour]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );
  return (
    <group>
      <primitive object={line} />
      {handles &&
        corners.map((c) => (
          <mesh key={c.join(",")} position={c} renderOrder={11}>
            <boxGeometry args={[3.2, 3.2, 3.2]} />
            <meshBasicMaterial color={colour} depthTest={false} transparent />
          </mesh>
        ))}
    </group>
  );
}

export function Dashed({ a, b }: { a: V3; b: V3 }) {
  const colour = useMemo(() => token("accent-hex"), []);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    const l = new THREE.Line(
      g,
      new THREE.LineDashedMaterial({ color: colour, dashSize: 3, gapSize: 2.5, depthTest: false, transparent: true, opacity: 0.8 }),
    );
    l.computeLineDistances();
    l.renderOrder = 9;
    return l;
  }, [a, b, colour]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );
  return <primitive object={line} />;
}

/**
 * A corner square the player drags in its own horizontal plane. It reports
 * the pointer's travel from where the drag began, in the parent's engine space.
 */
export function CornerHandle({
  at,
  onStart,
  onDrag,
  disabled,
}: {
  at: V3;
  onStart: () => void;
  onDrag: (dx: number, dy: number) => void;
  disabled?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const [hot, setHot] = useState(false);
  const [drag, setDrag] = useState(false);
  const latest = useRef({ onStart, onDrag });
  latest.current = { onStart, onDrag };
  const colour = useMemo(() => token(hot || drag ? "hot" : "accent-hex"), [hot, drag]);

  // Where the pointer ray meets the handle's horizontal plane, in the parent's space.
  const hit = useRef<(x: number, y: number) => THREE.Vector3 | null>(() => null);
  hit.current = (x, y) => {
    const g = group.current;
    const parent = g?.parent;
    if (!g || !parent) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const o = g.localToWorld(new THREE.Vector3(0, 0, 0));
    const n = g.localToWorld(new THREE.Vector3(0, 0, 1)).sub(o).normalize();
    const p = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, o), new THREE.Vector3());
    return p ? parent.worldToLocal(p) : null;
  };

  useEffect(() => {
    if (!drag) return;
    let p0: THREE.Vector3 | null = null;
    const move = (e: PointerEvent) => {
      const p = hit.current(e.clientX, e.clientY);
      if (!p) return;
      if (!p0) {
        p0 = p;
        latest.current.onStart();
        return;
      }
      latest.current.onDrag(p.x - p0.x, p.y - p0.y);
    };
    const up = () => {
      setDrag(false);
      arrowDrag.on = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag]);

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (disabled) return;
    e.stopPropagation();
    arrowDrag.on = true;
    setDrag(true);
  };
  return (
    <group
      ref={group}
      position={at}
      onPointerDown={down}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHot(true);
      }}
      onPointerOut={() => setHot(false)}
    >
      <mesh renderOrder={11}>
        <boxGeometry args={[3.2, 3.2, 3.2]} />
        <meshBasicMaterial color={colour} depthTest={false} transparent />
      </mesh>
      {/* A bigger invisible grip, so the corner is easy to catch. */}
      <mesh>
        <boxGeometry args={[7, 7, 7]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
