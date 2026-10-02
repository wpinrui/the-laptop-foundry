import { Canvas } from "@react-three/fiber";
import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, decorOf, migrateBody, migrateColours, migrateScreen, type Subject, solve } from "../engine";
import { Lights } from "../foundry/Stage";
import { ownerOf } from "../os/types";
import { useBootingScreen } from "../os/useOsScreen";
import { Reflections, surfacesOf } from "../viewer/Scene";
import { token } from "../viewer/theme";
import { type AimShelf, freshOnTable, useArchive } from "./Archive";
import {
  FreeOs,
  FreeOverlay,
  type FreeState,
  freeStart,
  makeSlot,
  type PageLook,
  type Slot,
  SlotView,
  type Stance,
  Walker,
  WorkshopLaptop,
} from "./Free";
import { Workshop } from "./Workshop";
import "./builder.css";

// A visit to the workshop from the world map: in through the personnel door,
// straight into free view, with the chosen laptop on the turntable or none.
// Any laptop off the archive's shelves can be put on the turntable. Out
// through the door, or the pause menu's Map, goes back to the map.

const LID_OPEN = 110;
const noLabel = () => "";
const noHover = () => {};
const noAt = () => ({ eye: new THREE.Vector3(), at: new THREE.Vector3() });

/** The workshop round whatever stands on the turntable. */
function Room({
  paused,
  using,
  overlay,
  onReady,
  children,
}: {
  paused: boolean;
  using: boolean;
  overlay: RefObject<HTMLDivElement | null>;
  /** Once the room has loaded, for the travel card over it. */
  onReady?: () => void;
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
        <Workshop onReady={onReady} />
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

/** What the laptop on the turntable offers the free view overlay. */
export interface TableOs {
  canUse: boolean;
  page?: { node: ReactNode; width: number; height: number };
}

/** Free view's hooks into the scene for a laptop off the shelves: where the player stands, the archive's aim. */
export interface TableDrive {
  onAim: (on: boolean) => void;
  onSettled: () => void;
  onShelf: (id: string | null) => void;
  shelves: RefObject<AimShelf | null>;
  stance: RefObject<Stance | null>;
  atDoor?: boolean;
  onDoor?: (on: boolean) => void;
}

/**
 * A saved laptop on the turntable in free view. The laptop itself goes into
 * the canvas through `scene`; its OS runs here, over it. Mounted afresh, by
 * the model's id, for each laptop put on the turntable.
 */
export function TableLaptop({
  model,
  company,
  library,
  sound,
  onSound,
  state,
  scene,
  portal,
  drive,
  onOs,
  lidOpen,
}: {
  model: SavedModel;
  company: string;
  library: Subject[];
  sound: boolean;
  onSound: (on: boolean) => void;
  state: FreeState;
  scene: Slot;
  portal: RefObject<HTMLDivElement | null>;
  drive: TableDrive;
  onOs: (os: TableOs) => void;
  /** It arrives with its lid open, rather than shut as it lay on the shelf. */
  lidOpen: boolean;
}) {
  const build = useMemo(() => migrateBody(migrateColours(migrateScreen(model.build as Build))), [model]);
  const fit = useMemo(() => solve(build), [build]);
  const valid = fit.problems.length === 0;
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
  // The lid it arrived with: fixed, so the laptop does not move when the state changes.
  const [arrived] = useState(lidOpen ? LID_OPEN : 0);

  useEffect(() => {
    onOs({
      canUse: valid && !!osLook,
      page: osLook ? { node: <SlotView slot={osSlot} />, width: osLook.width, height: osLook.height } : undefined,
    });
  }, [valid, osLook, osSlot, onOs]);
  useEffect(() => () => onOs({ canUse: false }), [onOs]);

  useLayoutEffect(() => {
    scene.set(
      <WorkshopLaptop
        key={model.id}
        fit={fit}
        lidAngle={arrived}
        flip={false}
        portal={portal}
        model={{ year: build.year, colours, surfaces, xray: false, labelFor: noLabel, onHover: noHover, lockScreen: booted, decor, problems: false }}
        free={{ state, openAngle: LID_OPEN, page: valid && !state.full ? osScreen : undefined, ...drive }}
      />,
    );
  });
  // A layout cleanup: it runs before the next laptop's layout effect sets its own.
  useLayoutEffect(() => () => scene.set(null), [scene]);

  return valid ? <FreeOs subject={subject} library={library} sound={sound} onSound={onSound} slot={osSlot} onLook={setOsLook} /> : null;
}

/** Whether the aim dot is on the workshop's personnel door. */
export const useDoorAim = (setFree: Dispatch<SetStateAction<FreeState | null>>) =>
  useCallback((on: boolean) => setFree((s) => (s && s.door !== on ? { ...s, door: on } : s)), [setFree]);

/** Free view's state setters shared by the visit and the builder. */
export function useFreeHandlers(setFree: Dispatch<SetStateAction<FreeState | null>>) {
  const onAim = useCallback((on: boolean) => setFree((s) => (s && s.aim !== on ? { ...s, aim: on } : s)), [setFree]);
  const onSettled = useCallback(() => setFree((s) => (s?.busy ? { ...s, busy: false } : s)), [setFree]);
  return { onAim, onSettled };
}

export function WorkshopVisit({
  model,
  models,
  company,
  library,
  sound,
  onSound,
  onMap,
  onLeave,
  onReady,
  held = false,
  onNew,
  onEdit,
  onDuplicate,
}: {
  model: SavedModel | null;
  /** Every laptop the company has built, for the archive's shelves. */
  models: SavedModel[];
  company: string;
  library: Subject[];
  sound: boolean;
  onSound: (on: boolean) => void;
  onMap: () => void;
  /** Back to where the visit came from, through the door, rather than to the map. */
  onLeave?: () => void;
  onReady?: () => void;
  /** A card is up over the workshop: the scene pauses behind it. */
  held?: boolean;
  /** A new laptop, from the empty turntable; absent when no more can be made. */
  onNew?: () => void;
  /** The turntable's laptop into the builder. */
  onEdit?: (id: string) => void;
  /** A copy of the turntable's laptop; absent when no more can be made. */
  onDuplicate?: (id: string) => void;
}) {
  const [onTable, setOnTable] = useState<{ m: SavedModel; open: boolean } | null>(model ? { m: model, open: true } : null);
  const [free, setFree] = useState<FreeState | null>(() => freeStart(!!model));
  const state = free ?? freeStart(false);
  const overlay = useRef<HTMLDivElement | null>(null);
  const scene = useMemo(makeSlot, []);
  const stance = useRef<Stance | null>(null);
  const [os, setOs] = useState<TableOs>({ canUse: false });
  const { onAim, onSettled } = useFreeHandlers(setFree);

  const take = useCallback((m: SavedModel) => {
    setOnTable({ m, open: false });
    setFree((s) => freshOnTable(s));
  }, []);
  const putAway = useCallback(() => {
    setOnTable(null);
    setFree((s) => freshOnTable(s));
  }, []);
  const { archive, aim, onShelf, keys } = useArchive(models, onTable?.m.id ?? null, setFree, take, putAway);
  const onDoor = useDoorAim(setFree);
  const onTableAim = useCallback((on: boolean) => setFree((s) => (s && s.table !== on ? { ...s, table: on } : s)), []);
  const id = onTable?.m.id;
  const laptops = {
    make: onTable ? undefined : onNew,
    edit: id && onEdit ? () => onEdit(id) : undefined,
    copy: id && onDuplicate ? () => onDuplicate(id) : undefined,
  };
  // Behind a card the scene stands still, as behind the pause menu.
  const shown = held ? { ...state, paused: true } : state;
  const drive: TableDrive = { onAim, onSettled, onShelf, shelves: aim, stance, atDoor: true, onDoor };

  return (
    <div className="fd bd free">
      <Room paused={shown.paused} using={state.using && !shown.paused} overlay={overlay} onReady={onReady}>
        {archive}
        <SlotView slot={scene} />
        {!onTable && (
          <Walker laptop={{ current: null }} active={!shown.paused} using={false} useAt={noAt} onTable={onTableAim} {...drive} />
        )}
      </Room>
      <FreeOverlay
        state={state}
        set={setFree}
        canUse={os.canUse}
        page={os.page}
        onMap={onMap}
        onLeave={onLeave}
        sound={sound}
        onSound={onSound}
        archive={keys}
        models={laptops}
        held={held}
      />
      {onTable && (
        <TableLaptop
          key={onTable.m.id}
          model={onTable.m}
          lidOpen={onTable.open}
          company={company}
          library={library}
          sound={sound}
          onSound={onSound}
          state={shown}
          scene={scene}
          portal={overlay}
          drive={drive}
          onOs={setOs}
        />
      )}
    </div>
  );
}
