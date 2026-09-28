import { Canvas } from "@react-three/fiber";
import { type ReactNode, type RefObject, useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, decorOf, migrateBody, migrateColours, migrateScreen, type Subject, solve } from "../engine";
import { Lights } from "../foundry/Stage";
import { ownerOf } from "../os/types";
import { useBootingScreen } from "../os/useOsScreen";
import { Reflections, surfacesOf } from "../viewer/Scene";
import { token } from "../viewer/theme";
import { FreeOs, FreeOverlay, type FreeState, freeStart, makeSlot, type PageLook, SlotView, Walker, WorkshopLaptop } from "./Free";
import { Workshop } from "./Workshop";
import "./builder.css";

// A visit to the workshop from the world map: in through the personnel door,
// straight into free view, with the chosen laptop on the turntable or none.
// Out through the door, or the pause menu's Map, goes back to the map.

const LID_OPEN = 110;
const noLabel = () => "";
const noHover = () => {};
const noAt = () => ({ eye: new THREE.Vector3(), at: new THREE.Vector3() });

interface Common {
  sound: boolean;
  onSound: (on: boolean) => void;
  onMap: () => void;
}

/** The workshop round whatever stands on the turntable. */
function Room({
  paused,
  using,
  overlay,
  children,
}: {
  paused: boolean;
  using: boolean;
  overlay: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div className={`bd-scene cafe-world${paused ? " paused" : ""}`}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 0.9 }}
        camera={{ fov: 62, near: 10, far: 40000 }}
      >
        <Workshop />
        <Reflections intensity={0.5} />
        <Lights dim={0.45} />
        <directionalLight position={[200, 1200, 1600]} color={token("stage-key")} intensity={0.3} />
        {children}
      </Canvas>
      <div
        ref={overlay}
        className={`cafe-overlay${using ? " using" : ""}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      />
    </div>
  );
}

function Empty({ sound, onSound, onMap }: Common) {
  const [free, setFree] = useState<FreeState | null>(() => freeStart(false));
  const state = free ?? freeStart(false);
  const overlay = useRef<HTMLDivElement | null>(null);
  const none = useRef<THREE.Group | null>(null);
  return (
    <div className="fd bd free">
      <Room paused={state.paused} using={false} overlay={overlay}>
        <Walker laptop={none} active={!state.paused} using={false} useAt={noAt} onAim={noHover} atDoor onDoor={onMap} />
      </Room>
      <FreeOverlay state={state} set={setFree} canUse={false} onMap={onMap} sound={sound} onSound={onSound} />
    </div>
  );
}

function WithLaptop({
  model,
  company,
  library,
  sound,
  onSound,
  onMap,
}: Common & { model: SavedModel; company: string; library: Subject[] }) {
  const build = useMemo(() => migrateBody(migrateColours(migrateScreen(model.build as Build))), [model]);
  const fit = useMemo(() => solve(build), [build]);
  const valid = fit.problems.length === 0;
  const [free, setFree] = useState<FreeState | null>(() => freeStart(true));
  const state = free ?? freeStart(true);
  const overlay = useRef<HTMLDivElement | null>(null);

  const colours = useMemo(
    () => ({
      floor: colourHex(build.finish.floor.colour),
      deck: colourHex(build.finish.deck.colour),
      lid: colourHex(build.finish.lid.colour),
    }),
    [build],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  const decor = useMemo(() => decorOf(build), [build]);
  const panelBox = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const ratio = panelBox ? panelBox.size.x / Math.max(1, panelBox.size.y) : 1.6;
  const owner = useMemo(() => ownerOf(build, company), [build, company]);
  const booted = useBootingScreen(valid, build, owner, `${company} ${model.name}`.trim(), ratio);

  const osSlot = useMemo(makeSlot, []);
  const [osLook, setOsLook] = useState<PageLook | null>(null);
  const osScreen = useMemo(
    () => (osLook ? { node: <SlotView slot={osSlot} />, width: osLook.width, mm: osLook.mm } : undefined),
    [osLook, osSlot],
  );
  const subject = useMemo<Subject>(() => ({ id: model.id, name: model.name, company, build }), [model, company, build]);
  const onAim = useCallback((on: boolean) => setFree((s) => (s && s.aim !== on ? { ...s, aim: on } : s)), []);
  const onSettled = useCallback(() => setFree((s) => (s?.busy ? { ...s, busy: false } : s)), []);

  return (
    <div className="fd bd free">
      <Room paused={state.paused} using={state.using && !state.paused} overlay={overlay}>
        <WorkshopLaptop
          fit={fit}
          lidAngle={LID_OPEN}
          flip={false}
          portal={overlay}
          model={{ year: build.year, colours, surfaces, xray: false, labelFor: noLabel, onHover: noHover, lockScreen: booted, decor, problems: false }}
          free={{
            state,
            openAngle: LID_OPEN,
            page: valid && !state.full ? osScreen : undefined,
            onAim,
            onSettled,
            atDoor: true,
            onDoor: onMap,
          }}
        />
      </Room>
      <FreeOverlay
        state={state}
        set={setFree}
        canUse={valid && !!osLook}
        page={osLook ? { node: <SlotView slot={osSlot} />, width: osLook.width, height: osLook.height } : undefined}
        onMap={onMap}
        sound={sound}
        onSound={onSound}
      />
      {valid && <FreeOs subject={subject} library={library} sound={sound} onSound={onSound} slot={osSlot} onLook={setOsLook} />}
    </div>
  );
}

export function WorkshopVisit(props: Common & { model: SavedModel | null; company: string; library: Subject[] }) {
  const { model, ...rest } = props;
  return model ? <WithLaptop {...rest} model={model} /> : <Empty {...rest} />;
}
