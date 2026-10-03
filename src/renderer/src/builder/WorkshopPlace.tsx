import { Canvas } from "@react-three/fiber";
import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { typing } from "../cafe/Cafe";
import { ConfirmDelete } from "../foundry/Menus";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, decorOf, migrateBody, migrateColours, migrateScreen, type Subject, solve } from "../engine";
import { yearOf } from "../foundry/LaptopList";
import { Lights } from "../foundry/Stage";
import { Thumb } from "../map/WorldMap";
import { ownerOf } from "../os/types";
import { useBootingScreen } from "../os/useOsScreen";
import { Reflections, surfacesOf } from "../viewer/Scene";
import { token } from "../viewer/theme";
import { type AimShelf, freshOnTable, useArchive, useWorkshopReady } from "./Archive";
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
  TABLE_START,
  Walker,
  WorkshopLaptop,
} from "./Free";
import { Workshop } from "./Workshop";
import "./builder.css";

// The workshop: one canvas, its room and archive shelves, the turntable and
// whatever laptop stands on it, for the whole time the player is there. Free
// roam is the workshop itself: walking it in first person, the laptop on the
// turntable answering to them, the shelves, the door out to the map. The
// builder is a mode over the same scene on the turntable's laptop: its
// panels, its camera and its editing overlays, with nothing remounted.

const LID_OPEN = 110;
const noLabel = () => "";
const noHover = () => {};
const noAt = () => ({ eye: new THREE.Vector3(), at: new THREE.Vector3() });

/** The workshop's pointer, as the builder uses it while it is up. */
export interface SceneInput {
  down: (e: PointerEvent) => void;
  move: (e: PointerEvent) => void;
  up: () => void;
  wheel: (e: WheelEvent) => void;
  missed: () => void;
}

/** What the builder draws into the workshop's canvas through. */
export interface WorkshopCanvas {
  /** The turntable's laptop: one instance, by its id, in free roam and the builder. */
  table: Slot;
  /** The builder's camera rig and lights. */
  extra: Slot;
  input: RefObject<SceneInput | null>;
  /** Where the laptop screen's page and the builder's on-model labels mount, over the canvas. */
  portal: RefObject<HTMLDivElement | null>;
}

/** What the laptop on the turntable offers the free roam overlay. */
interface TableOs {
  canUse: boolean;
  page?: { node: ReactNode; width: number; height: number };
}

/** Free roam's hooks into the scene for the turntable's laptop: where the player stands, the archive's aim. */
interface TableDrive {
  onAim: (on: boolean) => void;
  onSettled: () => void;
  onShelf: (id: string | null) => void;
  shelves: RefObject<AimShelf | null>;
  stance: RefObject<Stance | null>;
  onDoor?: (on: boolean) => void;
}

/**
 * The saved laptop on the turntable in free roam. The laptop itself goes into
 * the canvas through the table slot, keyed by its id; its OS runs here, over it.
 */
function TableLaptop({
  model,
  company,
  library,
  sound,
  onSound,
  state,
  canvas,
  drive,
  onOs,
  lidOpen,
  openAngle,
}: {
  model: SavedModel;
  company: string;
  library: Subject[];
  sound: boolean;
  onSound: (on: boolean) => void;
  state: FreeState;
  canvas: WorkshopCanvas;
  drive: TableDrive;
  onOs: (os: TableOs) => void;
  /** It arrives with its lid open, rather than shut as it lay on the shelf. */
  lidOpen: boolean;
  /** How far its lid opens. */
  openAngle: number;
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
    canvas.table.set(
      <WorkshopLaptop
        key={model.id}
        fit={fit}
        lidAngle={arrived}
        flip={false}
        portal={canvas.portal}
        model={{ year: build.year, colours, surfaces, xray: false, labelFor: noLabel, onHover: noHover, lockScreen: booted, decor, problems: false }}
        free={{ state, openAngle, page: valid && !state.full ? osScreen : undefined, ...drive }}
      />,
    );
  });
  // A layout cleanup: it runs before the next laptop's, or the builder's, layout effect sets its own.
  useLayoutEffect(() => () => canvas.table.set(null), [canvas]);

  return valid ? <FreeOs subject={subject} library={library} sound={sound} onSound={onSound} slot={osSlot} onLook={setOsLook} /> : null;
}

/** Every laptop the company has, newest first, to put one on the empty turntable. */
function PutPicker({
  models,
  onPick,
  onCancel,
}: {
  models: SavedModel[];
  onPick: (m: SavedModel) => void;
  onCancel: () => void;
}) {
  const list = useMemo(() => [...models].sort((a, b) => b.created - a.created), [models]);
  const [at, setAt] = useState(0);
  const rows = useRef<HTMLDivElement>(null);
  const live = useRef({ list, at, onPick, onCancel });
  live.current = { list, at, onPick, onCancel };
  // The workshop underneath hears none of the keys.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      const s = live.current;
      const n = s.list.length;
      if (e.key === "Escape") {
        e.preventDefault();
        s.onCancel();
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n > 0) {
        e.preventDefault();
        setAt((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const m = s.list[s.at];
        if (m) s.onPick(m);
      }
    };
    const up = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);
  useEffect(() => {
    rows.current?.children[at]?.scrollIntoView({ block: "nearest" });
  }, [at]);
  return createPortal(
    <div className="fd fd-modal" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="fd-modal-panel bd-put">
        <div ref={rows} className="wm-list">
          {list.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`wm-row${i === at ? " on" : ""}`}
              onMouseEnter={() => setAt(i)}
              onClick={() => onPick(m)}
            >
              <Thumb model={m} />
              <span>
                <b>{m.name}</b>
                <small>{yearOf(m)}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="fd-actions">
          <button type="button" className="fd-text" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const titleOf = (m: SavedModel) => ({ name: m.name, year: yearOf(m) });

export function WorkshopPlace({
  model,
  models,
  company,
  library,
  sound,
  onSound,
  onMap,
  onReady,
  held = false,
  building,
  builder,
  onTable,
  onBuild,
  onLeaveBuild,
  onNew,
  onDuplicate,
  onDelete,
}: {
  /** The laptop on the turntable, or none. */
  model: SavedModel | null;
  /** Every laptop the company has built, for the archive's shelves. */
  models: SavedModel[];
  company: string;
  library: Subject[];
  sound: boolean;
  onSound: (on: boolean) => void;
  /** To the world map: through the door, or the pause menu's Map. */
  onMap: () => void;
  /** The room and its shelves are in, for the travel card over them. */
  onReady?: () => void;
  /** A card (naming a laptop) or the map is up over the workshop: the scene pauses behind it. */
  held?: boolean;
  /** The builder is up on the turntable's laptop. */
  building: boolean;
  /** The builder, drawing into this canvas; `exit` goes back to free roam with its lid, flip and laptop as built. */
  builder: (canvas: WorkshopCanvas, exit: (lid: number, flip: boolean, built: SavedModel) => void) => ReactNode;
  /** A laptop goes on the turntable, or none. */
  onTable: (m: SavedModel | null) => void;
  /** The builder on this laptop, put on the turntable first if it is not there. */
  onBuild: (m: SavedModel) => void;
  /** Out of the builder, back to free roam. */
  onLeaveBuild: () => void;
  /** A new laptop, from the empty turntable; absent when no more can be made. */
  onNew?: () => void;
  /** A copy of the turntable's laptop; absent when no more can be made. */
  onDuplicate?: (id: string) => void;
  /** Deletes a laptop, once confirmed: off its shelf or the turntable. */
  onDelete?: (id: string) => void;
}) {
  const [free, setFree] = useState<FreeState | null>(() => freeStart(!!model));
  const state = free ?? freeStart(false);
  const [picking, setPicking] = useState(false);
  const [doomed, setDoomed] = useState<SavedModel | null>(null);
  const hold = held || picking || !!doomed;
  // Behind a card the scene stands still, as behind the pause menu.
  const shown = hold ? { ...state, paused: true } : state;
  const portal = useRef<HTMLDivElement | null>(null);
  const input = useRef<SceneInput | null>(null);
  const canvas = useMemo<WorkshopCanvas>(() => ({ table: makeSlot(), extra: makeSlot(), input, portal }), []);
  const stance = useRef<Stance | null>(null);
  const [os, setOs] = useState<TableOs>({ canUse: false });
  // A laptop off the shelves arrives shut; the one brought in, or back from the builder, as it was.
  const [shut, setShut] = useState<string | null>(null);
  const [openAngle, setOpenAngle] = useState(LID_OPEN);
  // Out of the builder the turntable shows the laptop as built until its save comes back as the saved model.
  const [built, setBuilt] = useState<{ was: SavedModel; now: SavedModel } | null>(null);
  const table = model && built?.was === model ? built.now : model;

  // Into the builder: back out of it, the player stands in front of the turntable again.
  useLayoutEffect(() => {
    if (building) stance.current = null;
  }, [building]);
  const exit = useCallback(
    (lid: number, flip: boolean, now: SavedModel) => {
      if (model) setBuilt({ was: model, now });
      stance.current = null;
      setShut(null);
      setOpenAngle(lid > 0 ? lid : LID_OPEN);
      setFree(freeStart(lid > 0 && !flip, flip));
      onLeaveBuild();
    },
    [model, onLeaveBuild],
  );

  const onAim = useCallback((on: boolean) => setFree((s) => (s && s.aim !== on ? { ...s, aim: on } : s)), []);
  const onSettled = useCallback(() => setFree((s) => (s?.busy ? { ...s, busy: false } : s)), []);
  const onDoor = useCallback((on: boolean) => setFree((s) => (s && s.door !== on ? { ...s, door: on } : s)), []);
  const onTableAim = useCallback((on: boolean) => setFree((s) => (s && s.table !== on ? { ...s, table: on } : s)), []);

  // Putting a laptop on the turntable, off its shelf or from the list: shut, as it lay there.
  const place = (m: SavedModel) => {
    setShut(m.id);
    setOpenAngle(LID_OPEN);
    setFree((s) => freshOnTable(s));
    onTable(m);
  };
  // A shelved laptop goes on the turntable and straight into the builder.
  const take = (m: SavedModel) => {
    place(m);
    onBuild(m);
  };
  const putAway = () => {
    setFree((s) => freshOnTable(s));
    onTable(null);
  };
  const { archive, aim, onShelf, keys, ready } = useArchive(models, model?.id ?? null, setFree, take, putAway);
  const roomIn = useWorkshopReady(ready, onReady);
  const drive: TableDrive = { onAim, onSettled, onShelf, shelves: aim, stance, onDoor };
  const laptops = {
    make: model ? undefined : onNew,
    put: model || models.length === 0 ? undefined : () => setPicking(true),
    edit: model ? () => onBuild(model) : undefined,
    copy: model && onDuplicate ? () => onDuplicate(model.id) : undefined,
    discard: onDelete ? (id?: string) => setDoomed((id ? models.find((m) => m.id === id) : model) ?? null) : undefined,
  };
  const named = {
    shelf: (id: string) => {
      const m = models.find((x) => x.id === id);
      return m ? titleOf(m) : undefined;
    },
    table: model ? titleOf(model) : undefined,
  };
  const roaming = !building;

  // In the builder, M opens the map over it as free roam's M does; the builder waits underneath.
  const toMap = useRef(onMap);
  toMap.current = onMap;
  useEffect(() => {
    if (!building || held) return;
    const key = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat && !typing(e)) toMap.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [building, held]);

  return (
    <div className={`fd bd${roaming ? " free" : ""}`}>
      <div
        className={`bd-scene cafe-world${roaming && shown.paused ? " paused" : ""}`}
        onPointerDown={(e) => input.current?.down(e)}
        onPointerMove={(e) => input.current?.move(e)}
        onPointerUp={() => input.current?.up()}
        onPointerLeave={() => input.current?.up()}
        onWheel={(e) => input.current?.wheel(e)}
      >
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 0.9 }}
          camera={{ fov: 62, near: 10, far: 40000, position: TABLE_START.toArray() }}
          onPointerMissed={() => input.current?.missed()}
        >
          <Workshop onReady={roomIn} />
          <Reflections intensity={0.5} />
          <Lights dim={0.45} />
          <directionalLight position={[200, 1200, 1600]} color={token("stage-key")} intensity={0.3} />
          {archive}
          <SlotView slot={canvas.table} />
          <SlotView slot={canvas.extra} />
          {roaming && !model && (
            <Walker
              laptop={{ current: null }}
              active={!shown.paused && !shown.full}
              using={false}
              useAt={noAt}
              onTable={onTableAim}
              {...drive}
            />
          )}
        </Canvas>
        {/* The laptop screen's page and the builder's labels mount here, over the canvas. The page
            takes the pointer only while the player is using the laptop. */}
        <div
          ref={portal}
          className={`cafe-overlay${roaming && state.using && !shown.paused ? " using" : ""}`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
        />
      </div>
      {roaming && (
        <FreeOverlay
          state={state}
          set={setFree}
          canUse={os.canUse}
          page={os.page}
          onMap={onMap}
          sound={sound}
          onSound={onSound}
          archive={keys}
          models={laptops}
          named={named}
          held={hold}
        />
      )}
      {roaming && table && (
        <TableLaptop
          key={table.id}
          model={table}
          lidOpen={table.id !== shut}
          openAngle={openAngle}
          company={company}
          library={library}
          sound={sound}
          onSound={onSound}
          state={shown}
          canvas={canvas}
          drive={drive}
          onOs={setOs}
        />
      )}
      {building && model && builder(canvas, exit)}
      {roaming && doomed && (
        <ConfirmDelete
          name={doomed.name}
          onCancel={() => setDoomed(null)}
          onConfirm={() => {
            const id = doomed.id;
            setDoomed(null);
            if (id === model?.id) putAway();
            onDelete?.(id);
          }}
        />
      )}
      {roaming && picking && (
        <PutPicker
          models={models}
          onCancel={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            place(m);
          }}
        />
      )}
    </div>
  );
}
