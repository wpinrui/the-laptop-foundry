import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SavedModel } from "../../../preload/store";
import {
  type Box,
  type Build,
  CONTENT,
  type Category,
  colourHex,
  costOf,
  decorOf,
  type Mark,
  type MarkSurface,
  migrateColours,
  migrateScreen,
  simulate,
  solve,
} from "../engine";
import { type Hover, type Paint, surfacesOf } from "../viewer/Scene";
import { arrowDrag } from "./Arrows";
import { BuilderScene } from "./BuilderScene";
import { panelLabel } from "./format";
import { Measurements } from "./Measurements";
import { SelectionMarks } from "./Overlay3d";
import { problemText, STAGE_NAME, STAGES, type Stage, stageOf } from "./problems";
import { screenTexture } from "./screens";
import { ownerOf } from "../os/types";
import { useBootingScreen } from "../os/useOsScreen";
import {
  ChassisColumn,
  ChassisTray,
  InsideColumn,
  insideSlots,
  PriceColumn,
  YearColumn,
} from "./Stages";
import { type FinishPiece, FinishColumn } from "./FinishStage";
import { type KeyGroup, KeysColumn } from "./KeysStage";
import { MarkHandles, MarksColumn, MarksTray } from "./MarksStage";
import { ScreenColumn, ScreenTray } from "./ScreenStage";
import { DisplayMarks, type SurfaceItem, SurfaceColumn, SurfaceMarks, WebcamMarks } from "./SurfaceStage";
import { PowerOn, StatStrip, statsOf } from "./Stats";
import { type ViewName, viewFor } from "./view";
import "./builder.css";

// The builder: a fixed line of stages over the laptop on the Foundry plinth.
// Year first, price last; stats appear once the laptop is valid and has
// powered on. Every change saves shortly after it is made, and leaving saves
// at once. A reviewed model is locked.

// ------------------------------------------------------------------ hover

const ROLE_NAME: Record<string, string> = {
  board: "Mainboard",
  fan: "Fan",
  fin: "Fin stack",
  vrm: "Power stage",
  chipset: "Chipset",
  hinge: "Hinge",
  inverter: "Inverter",
  tb: "Thunderbolt controller",
  bt: "Bluetooth",
  kblight: "Keyboard light",
  panel: "Display",
};

function nameOf(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const panel = CONTENT.panels.find((p) => p.id === id);
  if (panel) return panelLabel(panel);
  return CONTENT.parts.find((p) => p.id === id)?.name;
}

// Hover lives outside React state so pointer moves re-render only the label.
let hovered: Hover | null = null;
const listeners = new Set<() => void>();
const hoverStore = {
  set(h: Hover | null) {
    if (h === hovered || (h && hovered && h.label === hovered.label && h.x === hovered.x && h.y === hovered.y)) return;
    hovered = h;
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => hovered,
};

function HoverLabel() {
  const h = useSyncExternalStore(hoverStore.subscribe, hoverStore.get);
  if (!h) return null;
  return (
    <div className="bd-hover" style={{ left: h.x + 14, top: h.y + 14 }}>
      {h.label}
    </div>
  );
}

// ------------------------------------------------------------------ stage framing

interface Frame {
  view: ViewName;
  shift: number;
  zoom?: number;
  lift?: number;
}

const FRAME: Record<Stage, Frame> = {
  year: { view: "hero", shift: 0.2, zoom: 1.05 },
  chassis: { view: "hero", shift: 0.2, zoom: 1.05 },
  screen: { view: "screen", shift: 0.2, zoom: 1.05, lift: 0.01 },
  inside: { view: "part", shift: 0.24 },
  surface: { view: "deck", shift: 0.18, lift: 0.012 },
  keys: { view: "keys", shift: 0.17, zoom: 1.1, lift: 0.012 },
  finish: { view: "finish", shift: 0.16, zoom: 1.12, lift: 0.03 },
  marks: { view: "lid", shift: 0.18, zoom: 0.98, lift: 0.02 },
  price: { view: "hero", shift: 0.2 },
};

/** Stages with a tray of cards along the bottom. */
const TRAY = new Set<Stage>(["chassis", "screen", "keys", "finish", "marks"]);

/** Floor zone roles where an empty slot's part would go. */
const ZONE_ROLE: Partial<Record<Category, string>> = {
  battery: "battery",
  cooling: "fan",
  storage: "drive",
  optical: "odd",
  speakers: "spk",
};

const LID_OPEN = 110;

// ------------------------------------------------------------------ builder

export function Builder({
  model,
  company = "",
  onSave,
  onBack,
  reroll,
  onReview,
  onDuplicate,
}: {
  model: SavedModel;
  /** The company's name, which the laptop's own OS shows as its maker. */
  company?: string;
  onReview: (m: SavedModel) => void;
  onDuplicate: () => void;
  onSave: (m: SavedModel) => void;
  onBack: () => void;
  reroll: (b: Build) => string;
}) {
  // Older saves picked a panel row; the builder edits a screen spec.
  const [build, setBuild] = useState<Build>(() => migrateColours(migrateScreen(model.build as Build)));
  const [name, setName] = useState(model.name);
  // A reviewed model is locked for good so its review never changes.
  const locked = !!model.reviewed;

  // Every change saves shortly after it is made, and leaving saves at once.
  const pending = useRef<(() => void) | null>(null);
  const first = useRef(true);
  // Saved data reloads after each save; the effect must not re-run on that.
  const latest = useRef({ model, onSave });
  latest.current = { model, onSave };
  useEffect(() => {
    if (first.current || locked) {
      first.current = false;
      return;
    }
    const flush = () => {
      pending.current = null;
      const { model: m, onSave: save } = latest.current;
      save({ ...m, name: name.trim() || m.name, build, updated: Date.now() });
    };
    pending.current = flush;
    const t = setTimeout(flush, 400);
    return () => clearTimeout(t);
  }, [build, name, locked]);
  const leave = useCallback(() => {
    pending.current?.();
    onBack();
  }, [onBack]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) leave();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [leave]);

  const set = useCallback(
    (f: (b: Build) => Build) => {
      if (!locked) setBuild((b) => f(b));
    },
    [locked],
  );

  // Reopen where the player left off. Only a brand-new model starts on Year.
  const [stage, setStage] = useState<Stage>(() => {
    const saved = build.stage as Stage | undefined;
    if (saved && STAGES.includes(saved)) return saved;
    return Object.values(build.parts).some((l) => (l ?? []).length > 0) ? "chassis" : "year";
  });
  const [visited, setVisited] = useState<Set<Stage>>(() => new Set(STAGES.slice(0, STAGES.indexOf(stage) + 1)));
  const go = (s: Stage) => {
    setStage(s);
    setVisited((v) => (v.has(s) ? v : new Set([...v, s])));
    set((b) => (b.stage === s ? b : { ...b, stage: s }));
  };
  const idx = STAGES.indexOf(stage);
  const [insideSlot, setInsideSlot] = useState("processor");
  const [surfaceItem, setSurfaceItem] = useState<SurfaceItem>("keyboard");
  const [port, setPort] = useState(0);
  const [keyGroups, setKeyGroups] = useState<KeyGroup[]>(["letters", "mods", "accent"]);
  const [piece, setPiece] = useState<FinishPiece>("lid");
  const [markSurface, setMarkSurface] = useState<MarkSurface>("lid");
  const [markSel, setMarkSel] = useState<string | null>(null);
  const [markNote, setMarkNote] = useState<string | null>(null);
  const [markBrowse, setMarkBrowse] = useState(false);
  const [markGhost, setMarkGhost] = useState<Mark | null>(null);
  const [sheet, setSheet] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const fit = useMemo(() => solve(build), [build]);
  const valid = fit.problems.length === 0;
  const measured = useMemo(() => (valid ? simulate(build, fit) : null), [valid, build, fit]);
  const stats = useMemo(() => (measured ? statsOf(build, fit, measured) : []), [measured, build, fit]);

  // No power-on moment: the stats simply appear once the laptop is valid.
  const powering = false;
  const donePowering = useCallback(() => {}, []);

  // A price appears once there is a cost to set it against.
  useEffect(() => {
    if (stage === "price" && valid && build.price === undefined && !locked) {
      const cost = costOf(build, fit).total;
      const p = Math.round((cost * 1.45) / 10) * 10 - 1;
      set((b) => ({ ...b, price: p }));
    }
  }, [stage, valid, build, fit, locked, set]);

  const hex = (id: string) => colourHex(id);
  const colours = useMemo(
    () => ({ floor: hex(build.finish.floor.colour), deck: hex(build.finish.deck.colour), lid: hex(build.finish.lid.colour) }),
    [build.finish],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  const decor = useMemo(() => decorOf(markGhost ? { ...build, marks: [...(build.marks ?? []), markGhost] } : build), [build, markGhost]);

  // Inside: the selected slot's part, and where an empty slot's part goes.
  const slot = insideSlots(build).find((s) => s.key === insideSlot) ?? insideSlots(build)[0];
  const slotPart = build.parts[slot.cat]?.[slot.index]?.part;
  const selectedBoxes = useMemo(
    () => (slotPart ? fit.boxes.filter((b) => b.kind === "unit" && b.part === slotPart) : []),
    [fit, slotPart],
  );
  const emptyBoxes = useMemo(() => {
    if (slotPart) return [];
    const role = ZONE_ROLE[slot.cat];
    return role ? fit.boxes.filter((b) => b.kind === "zone" && b.piece === "floor" && b.role === role) : [];
  }, [fit, slotPart, slot.cat]);
  const inside = stage === "inside" && !powering;
  const paint = useMemo<Paint | undefined>(
    () => (inside ? { selected: new Set(selectedBoxes.map((b) => b.id)), dim: false } : undefined),
    [inside, selectedBoxes],
  );

  const surface = stage === "surface" && !powering;
  const portSide = build.ports[port]?.side;
  let frame = powering ? ({ view: "front", shift: 0.2 } as Frame) : FRAME[stage];
  if (surface && surfaceItem === "webcam") frame = { view: "screen", shift: 0.2, zoom: 0.9, lift: 0.02 };
  if (surface && surfaceItem === "display") frame = { view: "screen", shift: 0.2, zoom: 1.05, lift: 0.01 };
  if (surface && surfaceItem === "ports") frame = { view: "side", shift: 0.15, zoom: 1.05, lift: 0.02 };
  const marking = stage === "marks" && !powering;
  if (marking && markSurface === "palm") frame = { view: "deck", shift: 0.18, lift: 0.012 };
  if (marking && markSurface === "bottom") frame = { view: "bottom", shift: 0.18 };
  if (marking && markSurface === "bezel") frame = { view: "screen", shift: 0.2, zoom: 1.05, lift: 0.01 };
  const flip = marking && markSurface === "bottom";
  // Frame every box of the selected part together, such as both fans.
  const focus = useMemo<Box | undefined>(() => {
    const all = selectedBoxes.length ? selectedBoxes : emptyBoxes;
    if (all.length <= 1) return all[0];
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const b of all)
      for (const k of ["x", "y", "z"] as const) {
        lo[k] = Math.min(lo[k], b.at[k]);
        hi[k] = Math.max(hi[k], b.at[k] + b.size[k]);
      }
    return { ...all[0], at: lo, size: { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z } };
  }, [selectedBoxes, emptyBoxes]);
  const viewName: ViewName = inside && !focus ? "xray" : frame.view;
  const lidAngle = (surface && surfaceItem === "ports") || flip ? 0 : LID_OPEN;
  const view = useMemo(
    () =>
      viewFor(viewName, fit, lidAngle, {
        shift: frame.shift,
        zoom: frame.zoom,
        lift: frame.lift,
        part: inside ? focus : undefined,
        side: portSide,
      }),
    [viewName, fit, frame, inside, focus, lidAngle, portSide],
  );

  const panelBox = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const ratio = panelBox ? panelBox.size.x / Math.max(1, panelBox.size.y) : 1.6;
  const grid = stage === "screen";
  const shownName = name.trim() || model.name;
  const gridTexture = useMemo(() => (grid ? screenTexture("grid", ratio, shownName) : undefined), [grid, ratio]);
  // Once the laptop is valid its own screen boots into the era's desktop.
  const owner = useMemo(() => ownerOf(build, company), [build, company]);
  const booted = useBootingScreen(!grid && valid, build, owner, `${company} ${shownName}`.trim(), ratio);
  const screen = grid ? gridTexture : booted;

  const labelFor = useCallback((b: Box) => ROLE_NAME[b.role] ?? nameOf(b.part) ?? "", []);
  const pick = useCallback(
    (b: Box) => {
      if (!b.part) return;
      const cat = CONTENT.parts.find((p) => p.id === b.part)?.category;
      if (!cat || cat === "port") return;
      const list = build.parts[cat as Category] ?? [];
      const i = Math.max(0, list.findIndex((x) => x.part === b.part));
      const key = i > 0 ? `${cat}:${i}` : cat;
      if (insideSlots(build).some((s) => s.key === key)) setInsideSlot(key);
    },
    [build],
  );

  const pickSurface = useCallback(
    (b: Box) => {
      // The click that ends a handle drag must not select whatever is under the pointer.
      if (arrowDrag.on || performance.now() < arrowDrag.until) return;
      if (b.role === "keys") setSurfaceItem("keyboard");
      else if (b.role === "pad") setSurfaceItem("trackpad");
      else if (b.role === "webcam") setSurfaceItem("webcam");
      else if (b.role === "panel") setSurfaceItem("display");
      else if (String(b.role).startsWith("port:")) {
        const i = fit.place.ports.findIndex((p) => p?.box === b.id);
        if (i >= 0) {
          setSurfaceItem("ports");
          setPort(i);
        }
      }
    },
    [fit],
  );

  const review = () => {
    pending.current?.();
    onReview({ ...model, name: shownName, build });
  };

  const missing = fit.problems.filter((p) => p.kind === "compat" && p.code === "missing").length;
  const others = fit.problems.length - missing;
  const count = [missing ? `${missing} missing` : "", others ? `${others} ${others === 1 ? "problem" : "problems"}` : ""]
    .filter(Boolean)
    .join(", ");

  const props = { build, fit, set, locked };
  let column: ReactNode = null;
  let tray: ReactNode = null;
  switch (stage) {
    case "year":
      column = <YearColumn {...props} />;
      break;
    case "chassis":
      column = <ChassisColumn {...props} />;
      tray = <ChassisTray {...props} />;
      break;
    case "screen":
      column = <ScreenColumn {...props} />;
      tray = <ScreenTray {...props} />;
      break;
    case "inside":
      column = <InsideColumn {...props} slot={slot.key} onSlot={setInsideSlot} />;
      break;
    case "surface":
      column = (
        <SurfaceColumn {...props} item={surfaceItem} onItem={setSurfaceItem} port={port} onPort={setPort} />
      );
      break;
    case "keys":
      column = <KeysColumn {...props} groups={keyGroups} onGroups={setKeyGroups} />;
      break;
    case "finish":
      column = <FinishColumn {...props} piece={piece} onPiece={setPiece} />;
      break;
    case "marks":
      column = (
        <>
          <MarksColumn
            {...props}
            surface={markSurface}
            onSurface={(s) => {
              setMarkSurface(s);
              setMarkSel((build.marks ?? []).find((m) => m.surface === s)?.id ?? null);
            }}
            selected={markSel}
            onSelect={setMarkSel}
            browsing={markBrowse}
            onBrowse={setMarkBrowse}
            onGhost={setMarkGhost}
            bodyColour={
              markSurface === "palm" ? colours.deck : markSurface === "bottom" ? colours.floor : markSurface === "bezel" ? (build.bezel ?? colours.lid) : colours.lid
            }
          />
          {markNote && <span className="bd-note">{markNote}</span>}
        </>
      );
      tray = (
        <MarksTray
          {...props}
          surface={markSurface}
          selected={markSel}
          onSelect={setMarkSel}
          defaultText={(shownName.split(" ")[0] ?? "").toUpperCase()}
          onNote={setMarkNote}
          browsing={markBrowse}
          onBrowse={setMarkBrowse}
        />
      );
      break;
    case "price":
      column = (
        <PriceColumn
          {...props}
          valid={valid}
          name={name}
          onName={setName}
          onReroll={() => setName(reroll(build))}
          onReview={review}
          onDuplicate={() => {
            pending.current?.();
            onDuplicate();
          }}
        />
      );
      break;
  }

  return (
    <div className="fd bd">
      <BuilderScene
        fit={fit}
        year={build.year}
        view={view}
        resetKey={`${stage}:${stage === "inside" ? slot.key : stage === "surface" ? `${surfaceItem}:${portSide ?? ""}` : stage === "marks" ? markSurface : ""}:${powering}`}
        lidAngle={lidAngle}
        colours={colours}
        surfaces={surfaces}
        xray={inside}
        hideDeck={inside}
        screen={screen}
        glow={powering}
        paint={paint}
        problems={!["keys", "finish", "marks"].includes(stage)}
        extra={
          inside ? (
            <SelectionMarks selected={selectedBoxes} empty={emptyBoxes} />
          ) : surface ? (
            <SurfaceMarks build={build} fit={fit} set={set} item={surfaceItem} port={port} locked={locked} />
          ) : marking && (markSurface === "palm" || markSurface === "bottom") ? (
            <MarkHandles build={build} fit={fit} set={set} selected={markSel} locked={locked} />
          ) : undefined
        }
        lidExtra={
          surface && surfaceItem === "webcam" ? (
            <WebcamMarks fit={fit} set={set} locked={locked} />
          ) : surface && surfaceItem === "display" ? (
            <DisplayMarks fit={fit} set={set} locked={locked} />
          ) : marking && (markSurface === "lid" || markSurface === "bezel") ? (
            <MarkHandles build={build} fit={fit} set={set} selected={markSel} locked={locked} />
          ) : undefined
        }
        decor={decor}
        flip={flip}
        labelFor={labelFor}
        onHover={inside ? hoverStore.set : () => {}}
        onPick={inside ? pick : surface ? pickSurface : undefined}
      />
      <div className={stage === "inside" ? "bd-scrim wide" : "bd-scrim"} />
      {TRAY.has(stage) && !powering && <div className="bd-scrim-bottom" />}

      <nav className="bd-stages">
        {STAGES.map((s, i) => (
          <button
            type="button"
            key={s}
            className={s === stage ? "on" : i < idx || visited.has(s) ? "done" : ""}
            onClick={() => go(s)}
          >
            {STAGE_NAME[s]}
          </button>
        ))}
      </nav>

      <div className="bd-corner">
        {valid && !powering && stats.length > 0 && <StatStrip stats={stats} onOpen={() => setSheet(true)} />}
        {!valid && (
          <button type="button" className="bd-missing" onClick={() => setListOpen(!listOpen)}>
            {count}
          </button>
        )}
        {!valid && listOpen && (
          <div className="bd-problems fd-in">
            {fit.problems.map((p, i) => (
              <button
                type="button"
                // biome-ignore lint/suspicious/noArrayIndexKey: problems have no id and never reorder within one render
                key={i}
                onClick={() => {
                  go(stageOf(p));
                  setListOpen(false);
                }}
              >
                {problemText(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      {powering ? (
        <PowerOn name={shownName} stats={stats} onDone={donePowering} />
      ) : (
        // One body per stage: the column scrolls on its own and always ends above the tray row.
        <div className={`bd-body bd-${stage}`}>
          <div key={stage} className="bd-column fd-in">
            {stage === "price" ? column : <fieldset disabled={locked}>{column}</fieldset>}
            {stage === "year" && (
              <div className="bd-actions">
                <button type="button" className="fd-text" onClick={leave}>
                  Back
                </button>
                <button type="button" className="fd-primary" onClick={() => go(STAGES[idx + 1])}>
                  Next
                </button>
              </div>
            )}
          </div>
          {stage !== "year" && (
            <div className="bd-bottom">
              <fieldset className="bd-tray" disabled={locked}>
                {tray}
              </fieldset>
              <div className="bd-actions">
                <button type="button" className="fd-text" onClick={() => go(STAGES[idx - 1])}>
                  Back
                </button>
                {stage !== "price" ? (
                  <button type="button" className="fd-primary" onClick={() => go(STAGES[idx + 1])}>
                    Next
                  </button>
                ) : (
                  <button type="button" className="fd-primary" onClick={leave}>
                    Done
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {sheet && measured && (
        <div className="bd-sheet fd-in">
          <button type="button" className="fd-text bd-sheet-close" onClick={() => setSheet(false)}>
            Close
          </button>
          <Measurements m={measured} build={build} fit={fit} set={set} locked={locked} />
        </div>
      )}
      {inside && <HoverLabel />}
    </div>
  );
}
