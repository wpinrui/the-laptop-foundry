import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Box, Decor, Fit } from "../engine";
import { Atmosphere, Lights, PLINTH_H, PLINTH_R } from "../foundry/Stage";
import { type Hover, Model, type Paint, Reflections, type Surfaces } from "../viewer/Scene";
import { token } from "../viewer/theme";
import { arrowDrag } from "./Arrows";
import type { View } from "./view";

// The builder's scene: the laptop on the Foundry plinth, lit like the menus.
// The camera eases to each stage's view; dragging turns it round the laptop
// and the wheel zooms, both springing back when the view changes.

const EASE_MS = 600;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Nudge {
  az: number;
  el: number;
  zoom: number;
}

interface Pose {
  az: number;
  el: number;
  dist: number;
  t: THREE.Vector3;
  shift: number;
}

function Rig({ view, nudge, resetKey }: { view: View; nudge: RefObject<Nudge>; resetKey: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const now = useRef<Pose | null>(null);
  const from = useRef<{ pose: Pose; at: number } | null>(null);
  const shown = useRef<Nudge>({ az: 0, el: 0, zoom: 1 });
  const clock = useRef(0);
  const last = useRef<{ view: View; key: string } | null>(null);
  useFrame((_, dt) => {
    clock.current += dt;
    const want: Pose = {
      az: view.az,
      el: view.el,
      dist: view.dist,
      t: new THREE.Vector3(...view.target),
      shift: view.shift,
    };
    if (!now.current) now.current = want;
    if (!last.current || last.current.view !== view) {
      from.current = { pose: { ...now.current, t: now.current.t.clone() }, at: clock.current };
      // A new stage or selection springs the player's own turn and zoom back.
      if (last.current && last.current.key !== resetKey) nudge.current = { az: 0, el: 0, zoom: 1 };
      last.current = { view, key: resetKey };
    }
    const f = from.current;
    const k = f ? easeOut(Math.min(1, ((clock.current - f.at) * 1000) / EASE_MS)) : 1;
    const p = f?.pose ?? want;
    const cur: Pose = {
      az: p.az + wrap(want.az - p.az) * k,
      el: p.el + (want.el - p.el) * k,
      dist: p.dist + (want.dist - p.dist) * k,
      t: p.t.clone().lerp(want.t, k),
      shift: p.shift + (want.shift - p.shift) * k,
    };
    now.current = cur;
    const s = shown.current;
    const n = nudge.current;
    const a = 1 - Math.exp(-dt / 0.12);
    s.az += (n.az - s.az) * a;
    s.el += (n.el - s.el) * a;
    s.zoom += (n.zoom - s.zoom) * a;
    const az = cur.az + s.az;
    const el = Math.min(1.45, Math.max(-0.05, cur.el + s.el));
    const r = cur.dist * s.zoom;
    camera.position.set(
      cur.t.x + Math.sin(az) * Math.cos(el) * r,
      cur.t.y + Math.sin(el) * r,
      cur.t.z + Math.cos(az) * Math.cos(el) * r,
    );
    camera.lookAt(cur.t);
    camera.aspect = size.width / size.height;
    camera.setViewOffset(size.width, size.height, -cur.shift * size.width, 0, size.width, size.height);
    camera.updateProjectionMatrix();
  });
  return null;
}

const noLabel = () => "";

export function BuilderScene({
  fit,
  year,
  view,
  resetKey,
  lidAngle,
  colours,
  surfaces,
  xray,
  hideDeck,
  screen,
  glow,
  paint,
  problems = true,
  extra,
  lidExtra,
  labelFor = noLabel,
  onHover,
  onPick,
  decor,
  flip,
}: {
  decor?: Decor;
  /** Turn the laptop over onto its lid, to show the bottom. */
  flip?: boolean;
  fit: Fit;
  year: number;
  view: View;
  /** Changing it springs the player's turn and zoom back. */
  resetKey: string;
  lidAngle: number;
  colours: { floor: string; deck: string; lid: string };
  surfaces: Surfaces;
  xray: boolean;
  /** Leaves out the keyboard, trackpad and other deck-top units, so the internals show. */
  hideDeck?: boolean;
  screen?: THREE.Texture;
  /** A warm light off the screen, for the power on moment. */
  glow?: boolean;
  paint?: Paint;
  problems?: boolean;
  extra?: ReactNode;
  lidExtra?: ReactNode;
  labelFor?: (b: Box) => string;
  onHover: (h: Hover | null) => void;
  onPick?: (b: Box) => void;
}) {
  const nudge = useRef<Nudge>({ az: 0, el: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const moved = useRef(0);
  const floor = useMemo(() => new THREE.Color(token("ground")).multiplyScalar(3), []);
  const glowAt = useMemo(() => {
    const o = fit.shell.outer;
    return [0, PLINTH_H + o.z + o.y * 0.5, 260] as [number, number, number];
  }, [fit]);
  useEffect(() => () => screen?.dispose(), [screen]);
  return (
    <div
      className="bd-scene"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
        moved.current = 0;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.buttons === 0 || arrowDrag.on) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        d.moved += Math.abs(dx) + Math.abs(dy);
        moved.current = d.moved;
        if (d.moved < 4) return;
        nudge.current.az -= dx * 0.006;
        nudge.current.el += dy * 0.004;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
      onWheel={(e) => {
        nudge.current.zoom = Math.min(2, Math.max(0.45, nudge.current.zoom * Math.exp(e.deltaY * 0.001)));
      }}
    >
      <Canvas flat shadows dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 6000, position: [0, 500, 800] }}>
        <Atmosphere />
        <Reflections intensity={0.12} />
        <Lights />
        <directionalLight position={[200, 1200, 1600]} color={token("stage-key")} intensity={0.5} />
        {glow && <pointLight position={glowAt} color={token("screen-glow")} intensity={2.5} distance={0} decay={0} />}
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[20000, 20000]} />
          <meshStandardMaterial color={floor} roughness={1} />
        </mesh>
        <mesh position={[0, PLINTH_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[PLINTH_R, PLINTH_R, PLINTH_H, 96]} />
          <meshStandardMaterial color={token("stage-plinth")} roughness={0.55} metalness={0.3} />
        </mesh>
        <group
          position={[0, flip ? PLINTH_H + fit.shell.outer.z + fit.lidZ : PLINTH_H, 0]}
          rotation-x={flip ? Math.PI : 0}
        >
          <Model
            fit={fit}
            year={year}
            lidAngle={lidAngle}
            colours={colours}
            surfaces={surfaces}
            xray={xray}
            hideDeck={hideDeck}
            labelFor={labelFor}
            onHover={onHover}
            onPick={
              onPick
                ? (b) => {
                    if (moved.current < 4) onPick(b);
                  }
                : undefined
            }
            lockScreen={screen}
            decor={decor}
            paint={paint}
            problems={problems}
            extra={extra}
            lidExtra={lidExtra}
          />
        </group>
        <Rig view={view} nudge={nudge} resetKey={resetKey} />
      </Canvas>
    </div>
  );
}
