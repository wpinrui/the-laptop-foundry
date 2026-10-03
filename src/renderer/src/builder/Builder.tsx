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
  type Side,
  type MarkSurface,
  migrateBody,
  migrateColours,
  migratePad,
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
import { problemText, STAGE_NAME, STAGES, type Stage, stageNow, stageOf } from "./problems";
import { screenTexture } from "./screens";
import { ownerOf } from "../os/types";
import { useBootingScreen } from "../os/useOsScreen";
import { SectionView } from "./bodyShape";
import { toBody } from "./structure";
import {
  type ChassisPreview,
  ChassisColumn,
  ChassisTray,
  InsideColumn,
  insideSlots,
  PriceColumn,
  YearColumn,
} from "./Stages";
import { type FinishPiece, FinishColumn } from "./FinishStage";
import { type KeyGroup, KeysColumn } from "./KeysStage";
import { MarkHandles, type MarkBrowse, MarksColumn, MarksTray } from "./MarksStage";
import { ScreenColumn, ScreenTray } from "./ScreenStage";
import { DisplayMarks, SurfaceColumn, SurfaceMarks, WebcamMarks } from "./SurfaceStage";
import { PowerOn, StatStrip, statsOf } from "./Stats";
import { SliderField } from "./ui";
import { Dropdown } from "./Dropdown";
import { type ViewName, viewFor } from "./view";
import type { WorkshopCanvas } from "./WorkshopPlace";
import "./builder.css";

// The builder: a fixed line of stages over the laptop on the workshop's
// turntable, a mode over the workshop's own scene. Year first, price last;
// stats appear once the laptop is valid. Every change saves shortly after it
// is made, and leaving saves at once. A reviewed model is locked.

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
  internals: { view: "part", shift: 0.24 },
  keyboard: { view: "deck", shift: 0.18, lift: 0.012 },
  trackpad: { view: "deck", shift: 0.18, lift: 0.012 },
  webcam: { view: "screen", shift: 0.2, zoom: 0.9, lift: 0.02 },
  ports: { view: "side", shift: 0.15, zoom: 1.05, lift: 0.02 },
  colour: { view: "finish", shift: 0.16, zoom: 1.12, lift: 0.03 },
  decals: { view: "lid", shift: 0.18, zoom: 0.98, lift: 0.02 },
  done: { view: "hero", shift: 0.2 },
};

/** The body's class per stage, by the names the stylesheet knows them by. */
const BODY: Partial<Record<Stage, string>> = { internals: "inside", colour: "finish", decals: "marks", done: "price" };

/** The stages for what sits on the laptop's surfaces: each one is its surface item. */
const SURFACE = new Set<Stage>(["keyboard", "trackpad", "webcam", "ports"]);
type SurfaceStageName = "keyboard" | "trackpad" | "webcam" | "ports";

/** Stages with a tray of cards along the bottom. */
const TRAY = new Set<Stage>(["chassis", "screen", "colour", "decals"]);

/** Floor zone roles where an empty slot's part would go. */
const ZONE_ROLE: Partial<Record<Category, string>> = {
  battery: "battery",
  cooling: "fan",
  storage: "drive",
  optical: "odd",
  speakers: "spk",
};

const LID_OPEN = 110;
/** The lid slider's range, degrees: shut to lying flat. */
const LID_MAX = 180;
/** Edits closer together than this, ms, are one undo step: a slider drag, or rapid clicks on one control. */
const UNDO_MERGE_MS = 500;
/** Undo steps kept. */
const UNDO_STEPS = 1000;
/** Stages that can take their data from another of the company's laptops. */
const LOADS = new Set<Stage>(["ports", "colour", "decals"]);

/** What a stage copies from another laptop's build: only that stage's data. */
function loadInto(stage: Stage, b: Build, from: Build): Build {
  const src = migrateBody(migrateColours(migrateScreen(from)));
  if (stage === "ports") return { ...b, ports: structuredClone(src.ports ?? []) };
  if (stage === "decals") return { ...b, marks: structuredClone(src.marks ?? []) };
  return {
    ...b,
    materials: { ...src.materials },
    finish: structuredClone(src.finish),
    bezel: src.bezel,
    pad: src.pad && { ...src.pad },
    keyDeck: src.keyDeck,
  };
}

// Icons from Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors.
function UndoIcon({ redo }: { redo?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={redo ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}

// ------------------------------------------------------------------ builder

export function Builder({
  canvas,
  model,
  company = "",
  onSave,
  onExit,
  reroll,
  onReview,
  onDuplicate,
  yearLocked = false,
  released = false,
  sources = [],
}: {
  /** The company's other laptops a stage can load its data from, newest first. */
  sources?: SavedModel[];
  /** The workshop's canvas the builder draws its laptop, camera and overlays into. */
  canvas: WorkshopCanvas;
  /** A campaign model released to market is locked like a reviewed one. */
  released?: boolean;
  /** A campaign model keeps the year it was made in. */
  yearLocked?: boolean;
  model: SavedModel;
  /** The company's name, which the laptop's own OS shows as its maker. */
  company?: string;
  onReview: (m: SavedModel) => void;
  onDuplicate: () => void;
  onSave: (m: SavedModel) => void;
  /** Back to free roam in the workshop: the laptop's lid, whether it lies turned over, and the laptop as just built. */
  onExit: (lid: number, flip: boolean, built: SavedModel) => void;
  reroll: (b: Build) => string;
}) {
  // Older saves picked a panel row; the builder edits a screen spec.
  // Older trackpad size parts become their technology at that size; a reviewed model keeps its parts.
  const [build, setBuild] = useState<Build>(() => {
    const b = migrateBody(migrateColours(migrateScreen(model.build as Build)));
    return model.reviewed || released ? b : migratePad(b);
  });
  const [name, setName] = useState(model.name);
  // A reviewed model is locked for good so its review never changes.
  const locked = !!model.reviewed || released;

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
  // Leaving the builder (Back, Done, Escape, Free view) lands in free roam in the same workshop.
  const toFree = useRef<() => void>(() => {});
  const leave = useCallback(() => {
    pending.current?.();
    toFree.current();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) leave();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [leave]);

  // Undo: the builds before each edit, and the ones undone since. Kept for this visit to the builder.
  const history = useRef<{ past: Build[]; future: Build[]; at: number }>({ past: [], future: [], at: 0 });
  const buildNow = useRef(build);
  buildNow.current = build;
  const set = useCallback(
    (f: (b: Build) => Build) => {
      if (locked) return;
      setBuild((b) => {
        const next = f(b);
        if (next === b) return b;
        const h = history.current;
        const now = performance.now();
        // A run of edits close together is one step: only its first saves the build before it.
        if (now - h.at > UNDO_MERGE_MS) {
          h.past.push(b);
          if (h.past.length > UNDO_STEPS) h.past.shift();
        }
        h.at = now;
        h.future = [];
        return next;
      });
    },
    [locked],
  );
  // Undo and redo go through the same debounced save as any edit; the stage stays where it is.
  const step = useCallback(
    (back: boolean) => {
      if (locked) return;
      const h = history.current;
      const to = (back ? h.past : h.future).pop();
      if (!to) return;
      const cur = buildNow.current;
      (back ? h.future : h.past).push(cur);
      h.at = 0;
      setBuild({ ...to, stage: cur.stage });
    },
    [locked],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // A text field undoes its own typing.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        step(!e.shiftKey);
      } else if (k === "y") {
        e.preventDefault();
        step(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step]);

  // A campaign model's year is fixed, so its stage never shows in the builder.
  const stages: Stage[] = yearLocked ? STAGES.filter((s) => s !== "year") : [...STAGES];

  // Reopen where the player left off. Only a brand-new model starts on Year.
  const [stage, setStage] = useState<Stage>(() => {
    const saved = stageNow(build.stage);
    if (saved && stages.includes(saved)) return saved;
    if (Object.values(build.parts).some((l) => (l ?? []).length > 0)) return "chassis";
    return yearLocked ? "chassis" : "year";
  });
  const [visited, setVisited] = useState<Set<Stage>>(() => new Set(stages.slice(0, stages.indexOf(stage) + 1)));
  const go = (s: Stage) => {
    setStage(s);
    setVisited((v) => (v.has(s) ? v : new Set([...v, s])));
    // Changing stage is remembered, but it is no undo step.
    if (!locked) setBuild((b) => (b.stage === s ? b : { ...b, stage: s }));
  };
  const idx = stages.indexOf(stage);
  const goRef = useRef(go);
  goRef.current = go;
  const [insideSlot, setInsideSlot] = useState("processor");
  const [port, setPort] = useState(0);
  // The wall the Ports stage looks at: the player's own pick, never the selected port's.
  const [portView, setPortView] = useState<Side | undefined>(() => build.ports[0]?.side);
  const [keyGroups, setKeyGroups] = useState<KeyGroup[]>(["letters", "mods", "accent"]);
  const [piece, setPiece] = useState<FinishPiece>("lid");
  const [markSurface, setMarkSurface] = useState<MarkSurface>("lid");
  const [markSel, setMarkSel] = useState<string | null>(null);
  const [markNote, setMarkNote] = useState<string | null>(null);
  const [markBrowse, setMarkBrowse] = useState<MarkBrowse>(null);
  const [markGhost, setMarkGhost] = useState<Mark | null>(null);
  const [sheet, setSheet] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // The lid is a view setting, not part of the design: it starts open each visit.
  const [lid, setLid] = useState(LID_OPEN);

  const fit = useMemo(() => solve(build), [build]);
  // On the Chassis stage: a body under the pointer shows on the plinth, and the section view while the signature slider is held.
  const [preview, setPreview] = useState<ChassisPreview>({});
  useEffect(() => setPreview({}), [stage]);
  // On the Inside stage's Speakers slot: the outside view framed on the speaker grill while the pointer is on its fields.
  const [grillView, setGrillView] = useState(false);
  useEffect(() => setGrillView(false), [stage, insideSlot]);
  const previewFit = useMemo(() => {
    if (!preview.body || preview.body === build.body) return fit;
    try {
      return solve(toBody(build, preview.body));
    } catch {
      return fit;
    }
  }, [preview.body, build, fit]);
  const valid = fit.problems.length === 0;
  const measured = useMemo(() => (valid ? simulate(build, fit) : null), [valid, build, fit]);
  const stats = useMemo(() => statsOf(build, fit, measured), [measured, build, fit]);

  // No power-on moment: the stats simply appear once the laptop is valid.
  const powering = false;
  const donePowering = useCallback(() => {}, []);

  // A price appears once there is a cost to set it against.
  useEffect(() => {
    if (stage === "done" && valid && build.price === undefined && !locked) {
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
  const inside = stage === "internals" && !powering;
  const paint = useMemo<Paint | undefined>(
    () => (inside ? { selected: new Set(selectedBoxes.map((b) => b.id)), dim: false } : undefined),
    [inside, selectedBoxes],
  );

  const surface = SURFACE.has(stage) && !powering;
  const marking = stage === "decals" && !powering;
  let frame = powering ? ({ view: "front", shift: 0.2 } as Frame) : FRAME[stage];
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
  // The left grill panel, framed from outside, while the pointer is on the grill's fields.
  const grillPanel = inside && grillView ? fit.shell.speakerGrill?.panels[0] : undefined;
  const grillAt = useMemo(
    () =>
      grillPanel
        ? { x: grillPanel.cx, y: grillPanel.cy, z: grillPanel.cz, front: grillPanel.surface === "front" }
        : undefined,
    [grillPanel],
  );
  const outside = !!grillAt;
  const viewName: ViewName = outside ? "grill" : inside && !focus ? "xray" : frame.view;
  // Turned over, the laptop lies on its shut lid.
  const lidAngle = flip ? 0 : lid;
  const view = useMemo(
    () =>
      viewFor(viewName, fit, lidAngle, {
        shift: frame.shift,
        zoom: frame.zoom,
        lift: frame.lift,
        part: inside ? focus : undefined,
        side: portView,
        grill: grillAt,
      }),
    [viewName, fit, frame, inside, focus, lidAngle, portView, grillAt],
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

  // Out to free roam: the laptop stays as the builder left it, its lid and whether it lies turned over.
  toFree.current = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onExit(lid, flip, { ...model, name: shownName, build, updated: Date.now() });
  };

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
      if (b.role === "keys") goRef.current("keyboard");
      else if (b.role === "pad") goRef.current("trackpad");
      else if (b.role === "webcam") goRef.current("webcam");
      else if (b.role === "panel") goRef.current("screen");
      else if (String(b.role).startsWith("port:")) {
        const i = fit.place.ports.findIndex((p) => p?.box === b.id);
        if (i >= 0) {
          goRef.current("ports");
          setPort(i);
        }
      }
    },
    [fit],
  );

  // Clicking off the selected mark, on the body or the empty stage, clears its handles.
  const deselectMark = useCallback(() => {
    if (arrowDrag.on || performance.now() < arrowDrag.until) return;
    setMarkSel(null);
  }, []);

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
      column = <YearColumn {...props} only={yearLocked ? build.year : undefined} />;
      break;
    case "chassis":
      column = <ChassisColumn {...props} onPreview={setPreview} />;
      tray = <ChassisTray {...props} onPreview={setPreview} />;
      break;
    case "screen":
      column = (
        <>
          <ScreenColumn {...props} />
          <SurfaceColumn {...props} item="display" port={port} onPort={setPort} />
        </>
      );
      tray = <ScreenTray {...props} />;
      break;
    case "internals":
      column = <InsideColumn {...props} slot={slot.key} onSlot={setInsideSlot} onGrillView={setGrillView} />;
      break;
    case "keyboard":
      column = (
        <>
          <SurfaceColumn {...props} item="keyboard" port={port} onPort={setPort} />
          <KeysColumn {...props} groups={keyGroups} onGroups={setKeyGroups} />
        </>
      );
      break;
    case "trackpad":
    case "webcam":
    case "ports":
      column = <SurfaceColumn {...props} item={stage} port={port} onPort={setPort} onSide={setPortView} />;
      break;
    case "colour":
      column = <FinishColumn {...props} piece={piece} onPiece={setPiece} />;
      break;
    case "decals":
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
    case "done":
      column = (
        <PriceColumn
          {...props}
          valid={valid}
          name={name}
          company={company}
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
  // Ports, Colour and Decals can take that stage's data from another of the company's laptops.
  const loadable = sources.filter((m) => m.id !== model.id);
  if (LOADS.has(stage) && loadable.length > 0)
    column = (
      <>
        <Dropdown
          label="Load from"
          value={null}
          placeholder="Load from"
          disabled={locked}
          options={loadable.map((m) => ({ key: m.id, label: m.name, aside: (m.build as Build).year }))}
          onChange={(id) => {
            const from = loadable.find((m) => m.id === id);
            if (from) set((b) => loadInto(stage, b, from.build as Build));
          }}
        />
        {column}
      </>
    );

  return (
    <>
      <BuilderScene
        canvas={canvas}
        modelId={model.id}
        fit={previewFit}
        year={build.year}
        view={view}
        resetKey={`${stage}:${stage === "internals" ? slot.key : stage === "ports" ? (portView ?? "") : marking ? `decals:${markSurface}` : ""}:${powering}`}
        lidAngle={lidAngle}
        colours={colours}
        surfaces={surfaces}
        xray={inside && !outside}
        hideDeck={inside && !outside}
        screen={screen}
        glow={powering}
        paint={paint}
        problems={stage !== "colour" && stage !== "decals"}
        extra={
          inside && outside ? undefined : inside ? (
            <SelectionMarks selected={selectedBoxes} empty={emptyBoxes} />
          ) : surface ? (
            <SurfaceMarks build={build} fit={fit} set={set} item={stage as SurfaceStageName} port={port} locked={locked} />
          ) : marking && (markSurface === "palm" || markSurface === "bottom") ? (
            <MarkHandles build={build} fit={fit} set={set} selected={markSel} locked={locked} />
          ) : undefined
        }
        lidExtra={
          stage === "webcam" && !powering ? (
            <WebcamMarks fit={fit} set={set} locked={locked} />
          ) : stage === "screen" && !powering ? (
            <DisplayMarks fit={fit} set={set} locked={locked} />
          ) : marking && (markSurface === "lid" || markSurface === "bezel") ? (
            <MarkHandles build={build} fit={fit} set={set} selected={markSel} locked={locked} />
          ) : undefined
        }
        decor={decor}
        flip={flip}
        labelFor={labelFor}
        onHover={inside ? hoverStore.set : () => {}}
        onPick={inside ? pick : surface ? pickSurface : marking ? deselectMark : undefined}
        onMiss={marking ? deselectMark : undefined}
      />
      {stage === "chassis" && preview.section && (
        <div className="bd-section">
          <SectionView fit={fit} />
        </div>
      )}
      <div className={stage === "internals" ? "bd-scrim wide" : "bd-scrim"} />
      {TRAY.has(stage) && !powering && <div className="bd-scrim-bottom" />}

      <nav className="bd-stages">
        {stages.map((s, i) => (
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
        {!powering && stats.length > 0 && <StatStrip stats={stats} onOpen={() => setSheet(true)} />}
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
        <div className="bd-view">
          {!locked && (
            <div className="bd-undo">
              <button
                type="button"
                className="fd-text"
                aria-label="Undo"
                title="Undo"
                disabled={history.current.past.length === 0}
                onClick={() => step(true)}
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                className="fd-text"
                aria-label="Redo"
                title="Redo"
                disabled={history.current.future.length === 0}
                onClick={() => step(false)}
              >
                <UndoIcon redo />
              </button>
            </div>
          )}
          <SliderField label="Lid" value={lidAngle} unit="deg" min={0} max={LID_MAX} onChange={setLid} disabled={flip} />
          <button type="button" className="fd-text bd-free" onClick={() => toFree.current()}>
            Free view
          </button>
        </div>
      </div>

      {powering ? (
        <PowerOn name={shownName} stats={stats} onDone={donePowering} />
      ) : (
        // One body per stage: the column scrolls on its own and always ends above the tray row.
        <div className={`bd-body bd-${BODY[stage] ?? stage}${surface ? " bd-surface" : ""}`}>
          <div key={stage} className="bd-column fd-in">
            {stage === "done" ? column : <fieldset disabled={locked}>{column}</fieldset>}
            {stage === "year" && (
              <div className="bd-actions">
                <button type="button" className="fd-text" onClick={leave}>
                  Back
                </button>
                <button type="button" className="fd-primary" onClick={() => go(stages[idx + 1])}>
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
                <button type="button" className="fd-text" onClick={idx > 0 ? () => go(stages[idx - 1]) : leave}>
                  Back
                </button>
                {stage !== "done" ? (
                  <button type="button" className="fd-primary" onClick={() => go(stages[idx + 1])}>
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
    </>
  );
}
