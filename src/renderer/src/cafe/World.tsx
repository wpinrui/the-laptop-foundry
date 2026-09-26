import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CONTENT, type Fit } from "../engine";
import { Model, Reflections, type Surfaces } from "../viewer/Scene";
import { token } from "../viewer/theme";

// The cafe in first person: a procedural room of tables, chairs, a counter
// and a bright window, with the player's laptop on the middle table. Units
// are mm, floor at y = 0, the laptop's table at the origin.

export type Aim = "laptop" | "port" | null;

const ROOM = { x0: -3500, x1: 3500, z0: -3000, z1: 3600, h: 3000 };
const EYE = 1620;
const SPEED = 1500;
const LOOK = 0.0022;
const TABLE_Y = 770;
const REACH = 2000;
const SETTLE_MS = 600;
/** Where the eye rests seated, and where the player stands up to. */
const SEAT: [number, number, number] = [-110, 1180, 560];
const STAND: [number, number, number] = [-110, EYE, 980];
/** The seated eye looks here: the middle of the screen. */
const SCREEN_AT: [number, number, number] = [0, TABLE_Y + 150, -40];

interface Table {
  x: number;
  z: number;
  /** Chair angles round the table, radians; 0 is +z. */
  chairs: number[];
  cup?: [number, number];
}

const TABLES: Table[] = [
  { x: 0, z: 0, chairs: [0], cup: [210, 140] },
  { x: -1900, z: -1500, chairs: [0.4, Math.PI + 0.4], cup: [-60, -90] },
  { x: 2150, z: 350, chairs: [Math.PI / 2 + 0.2, -Math.PI / 2 + 0.2], cup: [80, -110] },
  { x: -2250, z: 1500, chairs: [1.2, Math.PI + 1.2] },
  { x: 700, z: -1950, chairs: [Math.PI / 2, -Math.PI / 2], cup: [-120, 60] },
];
const COUNTER = { x0: 1500, x1: 3500, z0: -3000, z1: -2300 };
/** How close the player can get to a table's centre. */
const TABLE_CLEAR = 620;

function Mat({ c, r = 0.8, m = 0 }: { c: string; r?: number; m?: number }) {
  return <meshStandardMaterial color={token(c)} roughness={r} metalness={m} />;
}

function Chair({ x, z, a }: { x: number; z: number; a: number }) {
  // The chair sits 600 mm out from the table and faces its centre.
  const cx = x + Math.sin(a) * 620;
  const cz = z + Math.cos(a) * 620;
  const legs: [number, number][] = [
    [-180, -180],
    [180, -180],
    [-180, 180],
    [180, 180],
  ];
  return (
    <group position={[cx, 0, cz]} rotation-y={a}>
      <mesh position={[0, 460, 0]} castShadow receiveShadow>
        <boxGeometry args={[440, 40, 440]} />
        <Mat c="cafe-chair" r={0.7} />
      </mesh>
      <mesh position={[0, 760, 200]} rotation-x={-0.12} castShadow>
        <boxGeometry args={[440, 520, 30]} />
        <Mat c="cafe-chair" r={0.7} />
      </mesh>
      {legs.map(([lx, lz]) => (
        <mesh key={`${lx}${lz}`} position={[lx, 220, lz]} castShadow>
          <cylinderGeometry args={[12, 12, 440, 8]} />
          <Mat c="cafe-iron" r={0.5} m={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function CafeTable({ t }: { t: Table }) {
  return (
    <group>
      <group position={[t.x, 0, t.z]}>
        <mesh position={[0, TABLE_Y - 20, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[420, 420, 40, 64]} />
          <Mat c="cafe-top" r={0.55} />
        </mesh>
        <mesh position={[0, (TABLE_Y - 40) / 2, 0]} castShadow>
          <cylinderGeometry args={[35, 35, TABLE_Y - 40, 16]} />
          <Mat c="cafe-iron" r={0.5} m={0.4} />
        </mesh>
        <mesh position={[0, 15, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[250, 270, 30, 48]} />
          <Mat c="cafe-iron" r={0.5} m={0.4} />
        </mesh>
        {t.cup && (
          <mesh position={[t.cup[0], TABLE_Y + 55, t.cup[1]]} castShadow>
            <cylinderGeometry args={[45, 35, 110, 24]} />
            <Mat c="cafe-cup" r={0.4} />
          </mesh>
        )}
      </group>
      {t.chairs.map((a) => (
        <Chair key={a} x={t.x} z={t.z} a={a} />
      ))}
    </group>
  );
}

function Room() {
  const w = ROOM.x1 - ROOM.x0;
  const d = ROOM.z1 - ROOM.z0;
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cz = (ROOM.z0 + ROOM.z1) / 2;
  const win = { x0: -500, x1: 1900, y0: 1000, y1: 2750 };
  const wall = (pos: [number, number, number], size: [number, number, number]) => (
    <mesh position={pos} receiveShadow castShadow>
      <boxGeometry args={size} />
      <Mat c="cafe-room-wall" r={0.95} />
    </mesh>
  );
  const z = ROOM.z0 - 50;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <Mat c="cafe-floor" r={0.85} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[cx, ROOM.h, cz]}>
        <planeGeometry args={[w, d]} />
        <Mat c="cafe-shade" r={1} />
      </mesh>
      {/* Back wall, built round the window opening. */}
      {wall([(ROOM.x0 + win.x0) / 2, ROOM.h / 2, z], [win.x0 - ROOM.x0, ROOM.h, 100])}
      {wall([(win.x1 + ROOM.x1) / 2, ROOM.h / 2, z], [ROOM.x1 - win.x1, ROOM.h, 100])}
      {wall([(win.x0 + win.x1) / 2, win.y0 / 2, z], [win.x1 - win.x0, win.y0, 100])}
      {wall([(win.x0 + win.x1) / 2, (win.y1 + ROOM.h) / 2, z], [win.x1 - win.x0, ROOM.h - win.y1, 100])}
      <mesh position={[(win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z - 40]}>
        <planeGeometry args={[win.x1 - win.x0, win.y1 - win.y0]} />
        <meshBasicMaterial color={token("cafe-window")} toneMapped={false} />
      </mesh>
      {[win.x0 + 30, (win.x0 + win.x1) / 2, win.x1 - 30].map((x) => (
        <mesh key={x} position={[x, (win.y0 + win.y1) / 2, z + 40]}>
          <boxGeometry args={[60, win.y1 - win.y0, 40]} />
          <Mat c="cafe-frame" />
        </mesh>
      ))}
      {[win.y0 + 20, win.y1 - 20].map((y) => (
        <mesh key={y} position={[(win.x0 + win.x1) / 2, y, z + 40]}>
          <boxGeometry args={[win.x1 - win.x0, 40, 40]} />
          <Mat c="cafe-frame" />
        </mesh>
      ))}
      {wall([cx, ROOM.h / 2, ROOM.z1 + 50], [w, ROOM.h, 100])}
      {wall([ROOM.x0 - 50, ROOM.h / 2, cz], [100, ROOM.h, d])}
      {wall([ROOM.x1 + 50, ROOM.h / 2, cz], [100, ROOM.h, d])}
      {/* The counter along the back right. */}
      <mesh
        position={[(COUNTER.x0 + COUNTER.x1) / 2, 520, (COUNTER.z0 + COUNTER.z1) / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[COUNTER.x1 - COUNTER.x0, 1040, COUNTER.z1 - COUNTER.z0]} />
        <Mat c="cafe-counter" r={0.8} />
      </mesh>
      <mesh
        position={[(COUNTER.x0 + COUNTER.x1) / 2 - 20, 1060, (COUNTER.z0 + COUNTER.z1) / 2 + 20]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[COUNTER.x1 - COUNTER.x0 + 40, 40, COUNTER.z1 - COUNTER.z0 + 80]} />
        <Mat c="cafe-counter-top" r={0.5} />
      </mesh>
      {TABLES.map((t) => (
        <CafeTable key={`${t.x},${t.z}`} t={t} />
      ))}
    </group>
  );
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const aim = new THREE.Object3D();
    aim.position.set(0, 0, 600);
    scene.add(aim);
    if (sun.current) sun.current.target = aim;
    return () => {
      scene.remove(aim);
    };
  }, [scene]);
  return (
    <>
      <hemisphereLight args={[token("cafe-sky"), token("cafe-shade"), 0.9]} />
      <directionalLight
        ref={sun}
        position={[700, 2900, -2900]}
        color={token("cafe-sun")}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4000}
        shadow-camera-right={4000}
        shadow-camera-top={4000}
        shadow-camera-bottom={-4000}
        shadow-camera-near={100}
        shadow-camera-far={9000}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 2600, 400]} color={token("stage-key")} intensity={0.6} decay={0} distance={0} />
    </>
  );
}

/** Where each charging port is, in world space, for aiming at it. */
function chargingPorts(root: THREE.Object3D): THREE.Vector3[] {
  const found = new Map<unknown, THREE.Box3>();
  root.traverse((o) => {
    const box = o.userData.box as { role?: string; part?: string } | undefined;
    if (!box || !(o as THREE.Mesh).isMesh || !String(box.role).startsWith("port:") || !box.part) return;
    const part = CONTENT.parts.find((p) => p.id === box.part);
    const shape = Array.isArray(part?.shape) ? part?.shape[0] : part?.shape;
    if (shape?.kind !== "port" || !shape.charges) return;
    const b = found.get(box) ?? new THREE.Box3();
    b.expandByObject(o);
    found.set(box, b);
  });
  return [...found.values()].map((b) => b.getCenter(new THREE.Vector3()));
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function lookAngles(from: THREE.Vector3, at: THREE.Vector3): { yaw: number; pitch: number } {
  const d = at.clone().sub(from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}

/** Keeps the walking player inside the room and out of the tables and counter. */
function collide(p: THREE.Vector3) {
  p.x = clamp(p.x, ROOM.x0 + 300, ROOM.x1 - 300);
  p.z = clamp(p.z, ROOM.z0 + 300, ROOM.z1 - 300);
  for (const t of TABLES) {
    const dx = p.x - t.x;
    const dz = p.z - t.z;
    const r = Math.hypot(dx, dz);
    if (r < TABLE_CLEAR && r > 0) {
      p.x = t.x + (dx / r) * TABLE_CLEAR;
      p.z = t.z + (dz / r) * TABLE_CLEAR;
    }
  }
  if (p.x > COUNTER.x0 - 300 && p.z < COUNTER.z1 + 300) {
    // Push out along the shallower side.
    if (COUNTER.z1 + 300 - p.z < p.x - (COUNTER.x0 - 300)) p.z = COUNTER.z1 + 300;
    else p.x = COUNTER.x0 - 300;
  }
}

function Player({
  seated,
  active,
  laptop,
  onAim,
  onClickAim,
}: {
  seated: boolean;
  active: boolean;
  laptop: RefObject<THREE.Group | null>;
  onAim: (a: Aim) => void;
  onClickAim: RefObject<Aim>;
}) {
  const camera = useThree((s) => s.camera);
  const pos = useRef(new THREE.Vector3(-300, EYE, 2600));
  const look = useRef(lookAngles(pos.current, new THREE.Vector3(0, TABLE_Y, 0)));
  const keys = useRef(new Set<string>());
  const move = useRef({ phase: 0, amount: 0, clock: 0 });
  const settle = useRef<{ from: THREE.Vector3; to: THREE.Vector3; at: number } | null>(null);
  const ports = useRef<THREE.Vector3[]>([]);
  const aimed = useRef<Aim>(null);
  const bounds = useRef({ box: new THREE.Box3(), at: -10 });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const wasSeated = useRef(seated);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const l = look.current;
      l.yaw -= e.movementX * LOOK;
      l.pitch = clamp(l.pitch - e.movementY * LOOK, -1.45, 1.45);
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", mouse);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mouse);
    };
  }, []);

  useEffect(() => {
    if (!active) keys.current.clear();
  }, [active]);

  useFrame((_, dt) => {
    const m = move.current;
    m.clock += dt;
    if (wasSeated.current !== seated) {
      wasSeated.current = seated;
      const to = new THREE.Vector3(...(seated ? SEAT : STAND));
      settle.current = { from: pos.current.clone(), to, at: m.clock };
      if (seated) look.current = lookAngles(to, new THREE.Vector3(...SCREEN_AT));
      if (seated && laptop.current) ports.current = chargingPorts(laptop.current);
    }
    const s = settle.current;
    let walking = 0;
    if (s) {
      const t = Math.min(1, ((m.clock - s.at) * 1000) / SETTLE_MS);
      pos.current.lerpVectors(s.from, s.to, easeOut(t));
      if (t >= 1) settle.current = null;
    } else if (!seated && active) {
      const k = keys.current;
      const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
      const r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
      if (f || r) {
        const yaw = look.current.yaw;
        const len = Math.hypot(f, r);
        const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) / len;
        const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) / len;
        pos.current.x += dx * SPEED * dt;
        pos.current.z += dz * SPEED * dt;
        collide(pos.current);
        walking = 1;
      }
    }
    // Gentle head sway: a step bob while walking, a slow breath at rest.
    m.amount += (walking - m.amount) * (1 - Math.exp(-dt / 0.15));
    m.phase += dt * 8.5 * m.amount;
    const bob = Math.sin(m.phase * 2) * 14 * m.amount + Math.sin(m.clock * 1.3) * 3;
    const side = Math.sin(m.phase) * 9 * m.amount;
    const l = look.current;
    if (seated) l.yaw = clamp(l.yaw, -1.3, 1.3);
    camera.position.set(
      pos.current.x + Math.cos(l.yaw) * side,
      pos.current.y + bob,
      pos.current.z - Math.sin(l.yaw) * side,
    );
    camera.rotation.set(l.pitch, l.yaw, Math.sin(m.phase) * 0.006 * m.amount, "YXZ");

    // What the aim dot is on.
    let next: Aim = null;
    const lap = laptop.current;
    if (lap) {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      ray.far = seated ? 1200 : REACH;
      if (seated) {
        for (const p of ports.current) if (ray.ray.distanceToPoint(p) < 30) next = "port";
      }
      // The laptop's bounds are cheap to hit and forgiving to aim at.
      if (m.clock - bounds.current.at > 1) {
        bounds.current = { box: new THREE.Box3().setFromObject(lap), at: m.clock };
      }
      const hit = ray.ray.intersectBox(bounds.current.box, new THREE.Vector3());
      if (!next && hit && hit.distanceTo(ray.ray.origin) < ray.far) next = "laptop";
    }
    if (next !== aimed.current) {
      aimed.current = next;
      onClickAim.current = next;
      onAim(next);
    }
  });
  return null;
}

export function World({
  fit,
  year,
  colours,
  surfaces,
  screen,
  seated,
  active,
  onAim,
  aimRef,
}: {
  fit: Fit;
  year: number;
  colours: { floor: string; deck: string; lid: string };
  surfaces: Surfaces;
  screen?: { node: ReactNode; width: number; mm: { x: number; y: number } };
  seated: boolean;
  /** Walking and looking are live: not paused and not full screen. */
  active: boolean;
  onAim: (a: Aim) => void;
  aimRef: RefObject<Aim>;
}) {
  const overlay = useRef<HTMLDivElement | null>(null);
  const laptop = useRef<THREE.Group>(null);
  const noLabel = useMemo(() => () => "", []);
  const noHover = useMemo(() => () => {}, []);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Near 100 mm, not 10: the laptop is seen from 0.6 to 2 m, where a 10 mm
          near plane left the depth step coarser than the sub-mm gaps between
          the trackpad glass, the panel and the lid, so they z-fought. The seated
          eye is never closer than 400 mm to anything, and the room's far
          corner is under 12 m away. */}
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 62, near: 100, far: 12000 }}>
        <color attach="background" args={[token("cafe-shade")]} />
        <Reflections intensity={0.3} />
        <Lights />
        <Room />
        <group ref={laptop} position={[0, TABLE_Y, 0]}>
          <Model
            fit={fit}
            year={year}
            lidAngle={105}
            colours={colours}
            surfaces={surfaces}
            xray={false}
            labelFor={noLabel}
            onHover={noHover}
            screen={screen}
            portal={overlay}
          />
        </group>
        <Player seated={seated} active={active} laptop={laptop} onAim={onAim} onClickAim={aimRef} />
      </Canvas>
      {/* The on-screen page mounts here, over the canvas. */}
      <div
        ref={overlay}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      />
    </div>
  );
}
