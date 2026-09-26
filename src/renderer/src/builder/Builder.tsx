import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SavedModel } from "../../../preload/store";
import { type Box, type Build, CONTENT, type Category, costOf, type Piece, simulate, solve } from "../engine";
import { type Hover, type Paint, surfacesOf } from "../viewer/Scene";
import { BuilderScene } from "./BuilderScene";
import { panelLabel } from "./format";
import { Measurements } from "./Measurements";
import { SelectionMarks } from "./Overlay3d";
import { problemText, STAGE_NAME, STAGES, type Stage, stageOf } from "./problems";
import { type ScreenKind, screenTexture } from "./screens";
import {
  ChassisColumn,
  ChassisTray,
  FinishColumn,
  FinishTray,
  InsideColumn,
  insideSlots,
  PriceColumn,
  ScreenColumn,
  SurfaceColumn,
  SurfaceTray,
  YearColumn,
} from "./Stages";
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
const TRAY = new Set<Stage>(["chassis", "surface", "finish"]);

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
  onSave,
  onBack,
  reroll,
  onReview,
  onDuplicate,
}: {
  model: SavedModel;
  onReview: (m: SavedModel) => void;
  onDuplicate: () => void;
  onSave: (m: SavedModel) => void;
  onBack: () => void;
  reroll: (b: Build) => string;
}) {
  const [build, setBuild] = useState<Build>(() => model.build as Build);
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

  const [stage, setStage] = useState<Stage>("year");
  const [visited, setVisited] = useState<Set<Stage>>(() => new Set(["year"]));
  const go = (s: Stage) => {
    setStage(s);
    setVisited((v) => (v.has(s) ? v : new Set([...v, s])));
  };
  const idx = STAGES.indexOf(stage);
  const [insideSlot, setInsideSlot] = useState("processor");
  const [surfaceSlot, setSurfaceSlot] = useState("keyboard");
  const [piece, setPiece] = useState<Piece>("lid");
  const [sheet, setSheet] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const fit = useMemo(() => solve(build), [build]);
  const valid = fit.problems.length === 0;
  const measured = useMemo(() => (valid ? simulate(build, fit) : null), [valid, build, fit]);
  const stats = useMemo(() => (measured ? statsOf(build, fit, measured) : []), [measured, build, fit]);

  // Power on plays the moment the laptop becomes valid, and again after it was invalid.
  const wasValid = useRef(valid);
  const [powering, setPowering] = useState(false);
  useEffect(() => {
    if (valid && !wasValid.current && !locked) setPowering(true);
    if (!valid) setPowering(false);
    wasValid.current = valid;
  }, [valid, locked]);
  const donePowering = useCallback(() => setPowering(false), []);

  // A price appears once there is a cost to set it against.
  useEffect(() => {
    if (stage === "price" && valid && build.price === undefined && !locked) {
      const cost = costOf(build, fit).total;
      const p = Math.round((cost * 1.45) / 10) * 10 - 1;
      set((b) => ({ ...b, price: p }));
    }
  }, [stage, valid, build, fit, locked, set]);

  const hex = (id: string) => CONTENT.colours.find((c) => c.id === id)?.hex ?? "";
  const colours = useMemo(
    () => ({ floor: hex(build.finish.floor.colour), deck: hex(build.finish.deck.colour), lid: hex(build.finish.lid.colour) }),
    [build.finish],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);

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
    () => (inside ? { selected: new Set(selectedBoxes.map((b) => b.id)), dim: true } : undefined),
    [inside, selectedBoxes],
  );

  const frame = powering ? ({ view: "front", shift: 0.2 } as Frame) : FRAME[stage];
  const focus = selectedBoxes[0] ?? emptyBoxes[0];
  const viewName: ViewName = inside && !focus ? "xray" : frame.view;
  const lidAngle = LID_OPEN;
  const view = useMemo(
    () => viewFor(viewName, fit, lidAngle, { shift: frame.shift, zoom: frame.zoom, lift: frame.lift, part: inside ? focus : undefined }),
    [viewName, fit, frame, inside, focus],
  );

  const panelBox = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const ratio = panelBox ? panelBox.size.x / Math.max(1, panelBox.size.y) : 1.6;
  const screenKind: ScreenKind = powering ? "boot" : stage === "screen" ? "grid" : valid ? "desk" : "off";
  const shownName = name.trim() || model.name;
  const screen = useMemo(
    () => screenTexture(screenKind, ratio, shownName),
    [screenKind, ratio, screenKind === "boot" ? shownName : ""],
  );

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
      break;
    case "inside":
      column = <InsideColumn {...props} slot={slot.key} onSlot={setInsideSlot} />;
      break;
    case "surface":
      column = <SurfaceColumn {...props} slot={surfaceSlot} onSlot={setSurfaceSlot} />;
      tray = <SurfaceTray {...props} slot={surfaceSlot} />;
      break;
    case "finish":
      column = <FinishColumn {...props} piece={piece} onPiece={setPiece} />;
      tray = <FinishTray {...props} piece={piece} />;
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
        resetKey={`${stage}:${stage === "inside" ? slot.key : ""}:${powering}`}
        lidAngle={lidAngle}
        colours={colours}
        surfaces={surfaces}
        xray={inside}
        screen={screen}
        glow={powering}
        paint={paint}
        extra={inside ? <SelectionMarks selected={selectedBoxes} empty={emptyBoxes} /> : undefined}
        labelFor={labelFor}
        onHover={inside ? hoverStore.set : () => {}}
        onPick={inside ? pick : undefined}
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
        <>
          <div key={stage} className={`bd-column bd-${stage} fd-in`}>
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
                {stage !== "price" && (
                  <button type="button" className="fd-primary" onClick={() => go(STAGES[idx + 1])}>
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </>
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
