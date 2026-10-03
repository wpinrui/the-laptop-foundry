import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { Loaded } from "../app/Loaded";
import { Walker, type WalkRoom } from "../builder/Free";
import { type Prompt, Prompts } from "../cafe/Cafe";
import { type Build, solve } from "../engine";
import type { CampaignState } from "../engine/campaign";
import { Column, Entry } from "../foundry/Menus";
import { Lights, StagedLaptop } from "../foundry/Stage";
import { SystemEntries } from "../foundry/SystemMenu";
import type { Commercial } from "../video/commercial";
import type { ShortFacts } from "../video/script";
import { token } from "../viewer/theme";
import { StudioEditor } from "./StudioEditor";
import "../cafe/cafe.css";
import "./studio.css";

// The studio: a small film studio walked in first person, the laptop picked
// for its commercial standing on the table under two light stands, the
// editing desk in the corner and the door out to the map. Looking at the desk
// offers making the commercial, which opens the editor over the paused room.
// A stand-in room in mm, floor at 0: the designer's replaces it.

const EYE = 1620;
const TABLE = { x: 0, z: -1500, w: 1400, d: 800, h: 750 };
const DESK = { x: 2600, z: 1600, w: 1600, d: 700, h: 740 };
const STANDS: [number, number][] = [
  [-1500, -700],
  [1500, -700],
];
const HALF_W = 4500;
const HALF_D = 3500;
const DOOR_Z = 2500;

const ROOM: WalkRoom = {
  room: { x0: -HALF_W + 100, x1: HALF_W - 100, z0: -HALF_D + 100, z1: HALF_D - 100 },
  rects: [
    { x0: TABLE.x - TABLE.w / 2, x1: TABLE.x + TABLE.w / 2, z0: TABLE.z - TABLE.d / 2, z1: TABLE.z + TABLE.d / 2 },
    { x0: DESK.x - DESK.w / 2, x1: DESK.x + DESK.w / 2, z0: DESK.z - DESK.d / 2, z1: DESK.z + DESK.d / 2 },
    ...STANDS.map(([x, z]) => ({ x0: x - 200, x1: x + 200, z0: z - 200, z1: z + 200 })),
  ],
  door: new THREE.Box3(new THREE.Vector3(-HALF_W - 100, 0, DOOR_Z - 500), new THREE.Vector3(-HALF_W + 80, 2200, DOOR_Z + 500)),
  start: new THREE.Vector3(0, EYE, 1800),
  face: new THREE.Vector3(TABLE.x, TABLE.h + 120, TABLE.z),
  table: new THREE.Box3(
    new THREE.Vector3(DESK.x - DESK.w / 2, 0, DESK.z - DESK.d / 2),
    new THREE.Vector3(DESK.x + DESK.w / 2, DESK.h + 500, DESK.z + DESK.d / 2),
  ),
};

const noAt = () => ({ eye: new THREE.Vector3(), at: new THREE.Vector3() });
const noAim = () => {};
const none = { current: null };

function Box({ at, size, color }: { at: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/** The laptop on the table, its lid up as it would be filmed. */
function TableLaptop({ model, company }: { model: SavedModel; company: string }) {
  const build = model.build as Build;
  const fit = useMemo(() => {
    try {
      return solve(build);
    } catch {
      return null;
    }
  }, [build]);
  if (!fit) return null;
  return (
    <group position={[TABLE.x, TABLE.h, TABLE.z]}>
      <StagedLaptop build={build} fit={fit} maker={company} model={model.name} />
    </group>
  );
}

/** A soft box's light, aimed at the laptop on the table. */
function Soft({ x, z }: { x: number; z: number }) {
  const light = useRef<THREE.SpotLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(TABLE.x, TABLE.h, TABLE.z);
    l.target.updateMatrixWorld();
  }, []);
  return <spotLight ref={light} position={[x, 2050, z]} angle={0.6} penumbra={0.8} intensity={2.2} decay={0} castShadow />;
}

function Room({ model, company }: { model: SavedModel | null; company: string }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[HALF_W * 2, HALF_D * 2]} />
        <meshStandardMaterial color={token("studio-floor")} roughness={0.9} />
      </mesh>
      {/* The walls, and the backdrop behind the table. */}
      <Box at={[0, 1800, -HALF_D]} size={[HALF_W * 2, 3600, 40]} color={token("studio-wall")} />
      <Box at={[0, 1800, HALF_D]} size={[HALF_W * 2, 3600, 40]} color={token("studio-wall")} />
      <Box at={[-HALF_W, 1800, 0]} size={[40, 3600, HALF_D * 2]} color={token("studio-wall")} />
      <Box at={[HALF_W, 1800, 0]} size={[40, 3600, HALF_D * 2]} color={token("studio-wall")} />
      <Box at={[0, 1600, -HALF_D + 200]} size={[4200, 3200, 20]} color={token("studio-backdrop")} />
      <Box at={[-HALF_W + 30, 1050, DOOR_Z]} size={[40, 2100, 950]} color={token("studio-door")} />
      {/* The table, and the laptop on it. */}
      <Box at={[TABLE.x, TABLE.h / 2, TABLE.z]} size={[TABLE.w, TABLE.h, TABLE.d]} color={token("studio-table")} />
      {model && <TableLaptop key={model.id} model={model} company={company} />}
      {/* The light stands, each a soft box on a pole aimed at the table. */}
      {STANDS.map(([x, z]) => (
        <group key={x}>
          <Box at={[x, 1000, z]} size={[40, 2000, 40]} color={token("studio-stand")} />
          <Box at={[x, 2050, z]} size={[500, 380, 120]} color={token("studio-softbox")} />
          <Soft x={x} z={z} />
        </group>
      ))}
      {/* The editing desk and its monitor. */}
      <Box at={[DESK.x, DESK.h / 2, DESK.z]} size={[DESK.w, DESK.h, DESK.d]} color={token("studio-desk")} />
      <Box at={[DESK.x, DESK.h + 230, DESK.z + 150]} size={[700, 400, 40]} color={token("studio-screen")} />
    </>
  );
}

export function StudioPlace({
  company,
  campaign,
  models,
  sound,
  onSound,
  onMap,
  onReady,
  onFinish,
}: {
  company: SavedCompany;
  campaign: CampaignState | null;
  /** The laptops that can still have their commercial. */
  models: SavedModel[];
  sound: boolean;
  onSound: (on: boolean) => void;
  /** To the world map: out through the door, or Map from the pause menu. */
  onMap: () => void;
  onReady?: () => void;
  onFinish: (c: Commercial, facts: ShortFacts) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [editing, setEditing] = useState(false);
  const [desk, setDesk] = useState(false);
  const [door, setDoor] = useState(false);
  const [picked, setPicked] = useState<string | null>(models[0]?.id ?? null);
  const shown = models.find((m) => m.id === picked) ?? models[0] ?? null;
  const expectUnlock = useRef(false);
  const pausedAt = useRef(0);
  const active = !paused && !editing;

  const pause = useCallback(() => {
    pausedAt.current = performance.now();
    setPaused(true);
  }, []);
  const lock = useCallback(() => {
    // Refused (as just after Escape): the next click takes the pointer.
    Promise.resolve(root.current?.requestPointerLock()).catch(() => {});
  }, []);
  const unlock = useCallback(() => {
    if (!document.pointerLockElement) return;
    expectUnlock.current = true;
    document.exitPointerLock();
  }, []);

  useEffect(() => {
    lock();
    const change = () => {
      if (document.pointerLockElement === root.current) return;
      if (expectUnlock.current) {
        expectUnlock.current = false;
        return;
      }
      pause();
    };
    document.addEventListener("pointerlockchange", change);
    return () => {
      document.removeEventListener("pointerlockchange", change);
      expectUnlock.current = true;
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [lock, pause]);

  const resume = useCallback(() => {
    setPaused(false);
    lock();
  }, [lock]);
  const open = useCallback(() => {
    unlock();
    setEditing(true);
  }, [unlock]);
  const close = useCallback(() => {
    setEditing(false);
    lock();
  }, [lock]);

  const state = useRef({ paused, editing, desk, door, can: models.length > 0, resume, open, onMap });
  state.current = { paused, editing, desk, door, can: models.length > 0, resume, open, onMap };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = state.current;
      if (s.editing) return;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) s.resume();
        } else {
          unlock();
          pause();
        }
        return;
      }
      if (s.paused || e.repeat) return;
      if (e.code === "KeyE" && s.door) s.onMap();
      else if (e.code === "KeyE" && s.desk && s.can) s.open();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pause, unlock]);

  let prompts: Prompt[] = [];
  if (active && door) prompts = [{ key: "E", label: "Leave" }];
  else if (active && desk && models.length > 0) prompts = [{ key: "E", label: "Make commercial" }];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="cafe st-room"
      onMouseDown={() => {
        if (active && !document.pointerLockElement) lock();
      }}
    >
      <div className={`cafe-world${paused || editing ? " paused" : ""}`}>
        <Canvas shadows dpr={[1, 1.5]} frameloop={editing ? "never" : "always"} camera={{ fov: 62, near: 10, far: 40000, position: ROOM.start.toArray() }}>
          <color attach="background" args={[token("studio-shade")]} />
          <hemisphereLight args={[token("studio-sky"), token("studio-earth"), 0.6]} />
          <Lights dim={0.5} />
          <Room model={shown} company={company.name} />
          <Walker laptop={none} active={active} using={false} useAt={noAt} onAim={noAim} onDoor={setDoor} onTable={setDesk} room={ROOM} />
          {onReady && <Loaded onReady={onReady} />}
        </Canvas>
      </div>
      {active && <i className="cafe-dot" />}
      {active && <Prompts list={prompts} using={false} />}
      {editing && (
        <StudioEditor
          company={company}
          campaign={campaign}
          models={models}
          picked={shown?.id ?? null}
          onPick={setPicked}
          onFinish={onFinish}
          onClose={close}
        />
      )}
      {paused && (
        <div className="fd fd-over">
          <div className="fd-scrim" />
          <Column>
            <div className="fd-entries">
              <Entry onClick={resume} autoFocus>
                Resume
              </Entry>
              <Entry valued sub={sound ? "On" : "Off"} onClick={() => onSound(!sound)}>
                Sound
              </Entry>
              <Entry onClick={onMap}>Map</Entry>
              <SystemEntries />
            </div>
          </Column>
        </div>
      )}
    </div>
  );
}
