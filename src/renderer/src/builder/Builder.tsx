import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SavedModel } from "../../../preload/store";
import {
  available,
  type Axis,
  type Box,
  type Build,
  type BuildPart,
  CONTENT,
  type Category,
  type Fit,
  type Piece,
  type Problem,
  panelsFor,
  partsFor,
  type Side,
  simulate,
  solve,
} from "../engine";
import { type Hover, Scene, surfacesOf } from "../viewer/Scene";
import { formatOption, panelLabel } from "./format";
import { Measurements } from "./Measurements";
import { Power } from "./Power";
import { blockReason, problemText, type Tab, TABS, tabOf } from "./problems";
import { materialsFor, toBody, toYear } from "./structure";
import "./builder.css";

// ------------------------------------------------------------------ problems

interface Flags {
  parts: Set<string>;
  categories: Set<Category>;
  ports: boolean;
  layout: boolean;
  body: boolean;
  pieces: Set<Piece>;
  short: Set<Axis>;
  tooBig: Set<Axis>;
}

function flagsOf(problems: Problem[], build: Build): Flags {
  const f: Flags = {
    parts: new Set(),
    categories: new Set(),
    ports: false,
    layout: false,
    body: false,
    pieces: new Set(),
    short: new Set(),
    tooBig: new Set(),
  };
  const piecesUsing = (id: string) =>
    (["floor", "deck", "lid"] as Piece[]).filter(
      (p) =>
        build.materials[p] === id ||
        build.finish[p].colour === id ||
        build.finish[p].texture === id,
    );
  for (const p of problems) {
    if (p.kind === "geometry")
      (p.code === "short" ? f.short : f.tooBig).add(p.axis);
    else if (p.kind === "year") {
      if (p.what === "part" || p.what === "panel") f.parts.add(p.ref);
      else if (p.what === "body") f.body = true;
      else if (p.what === "layout") f.layout = true;
      else for (const piece of piecesUsing(p.ref)) f.pieces.add(piece);
    } else if (
      p.code === "needs" ||
      p.code === "no-room" ||
      p.code === "bad-option"
    )
      f.parts.add(p.part);
    // A blank picker already shows a missing part; it gets no outline.
    else if (p.code === "missing") continue;
    else if (p.code === "too-many") f.categories.add(p.category);
    else if (p.code === "port-side") f.ports = true;
    else if (p.code === "no-charging") f.ports = build.ports.length > 0;
    else if (p.code === "wrong-piece" || p.code === "wrong-finish")
      f.pieces.add(p.piece);
    else if (p.code === "layout-not-on-body") f.layout = true;
  }
  return f;
}

// ------------------------------------------------------------------ hover labels

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

// ------------------------------------------------------------------ small controls

type SetBuild = (f: (b: Build) => Build) => void;

/** Visible names for the builder's dropdowns, by their key. */
const FIELD_NAME: Record<string, string> = {
  body: "Body",
  layout: "Layout",
  processor: "Processor",
  graphics: "Graphics",
  memory: "Memory",
  storage: "Storage",
  "storage 2": "Second drive",
  battery: "Battery",
  hotswap: "Swap bay",
  cooling: "Cooling",
  optical: "Optical drive",
  wireless: "Wireless",
  speakers: "Speakers",
  display: "Display",
  keyboard: "Keyboard",
  trackpad: "Trackpad",
  webcam: "Webcam",
  refresh: "Refresh rate",
  capacity: "Capacity",
  slots: "Slots",
  cells: "Cells",
  wh: "Capacity",
  pitch: "Key pitch",
  cols: "Layout",
  light: "Backlight",
  mechanism: "Mechanism",
  buttons: "Buttons",
  stick: "Pointing stick",
  material: "Material",
  finish: "Finish",
};

function fieldName(key: string): string {
  const named = FIELD_NAME[key];
  if (named) return named;
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Select({
  value,
  options,
  onChange,
  flagged,
  label,
  name,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  flagged?: boolean;
  label: string;
  /** Shown over the dropdown; defaults to a name for `label`. */
  name?: string;
}) {
  return (
    <label className="pick">
      <span className="pick-name">{name ?? fieldName(label)}</span>
      <select
        className={flagged ? "flagged" : undefined}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Spend({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <input
      className="spend"
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function withList(b: Build, cat: Category, list: BuildPart[]): Build {
  const parts = { ...b.parts };
  if (list.length === 0) delete parts[cat];
  else parts[cat] = list;
  return { ...b, parts };
}

const OPTIONAL = new Set<Category>([
  "graphics",
  "hotswap",
  "optical",
  "wireless",
  "webcam",
]);

function PartRow({
  cat,
  slot = 0,
  build,
  set,
  flags,
}: {
  cat: Category;
  slot?: number;
  build: Build;
  set: SetBuild;
  flags: Flags;
}) {
  const list = build.parts[cat] ?? [];
  const current = list[slot];
  const year = build.year;
  const blankAllowed = OPTIONAL.has(cat) || slot > 0;

  const choices =
    cat === "display"
      ? panelsFor(year).map((p) => ({ value: p.id, label: panelLabel(p) }))
      : partsFor(cat, year).map((p) => ({ value: p.id, label: p.name }));
  if (current && !choices.some((c) => c.value === current.part))
    choices.unshift({
      value: current.part,
      label: nameOf(current.part) ?? current.part,
    });
  let blankLabel = "";
  if (cat === "graphics") {
    const cpu = CONTENT.parts.find(
      (p) => p.id === build.parts.processor?.[0]?.part,
    );
    blankLabel = String(cpu?.info?.igpu ?? "");
  }
  if (blankAllowed || !current)
    choices.unshift({ value: "", label: blankLabel });

  const setPart = (id: string) =>
    set((b) => {
      const next = [...(b.parts[cat] ?? [])];
      if (!id) next.splice(slot, 1);
      else next[slot] = { part: id };
      const out = withList(b, cat, next);
      // New chips start from their own default power limits.
      if (cat === "processor" || cat === "graphics") delete out.power;
      return out;
    });
  const setOpt = (key: string, v: string) =>
    set((b) => {
      const next = [...(b.parts[cat] ?? [])];
      const bp = next[slot];
      if (!bp) return b;
      const raw = cat === "display" ? Number(v) : v;
      const part = CONTENT.parts.find((p) => p.id === bp.part);
      const typed = part?.options?.[key]?.find((o) => String(o) === v) ?? raw;
      next[slot] = { ...bp, opts: { ...bp.opts, [key]: typed } };
      return withList(b, cat, next);
    });

  const optionLists: [string, (string | number)[]][] = [];
  if (current) {
    if (cat === "display") {
      const panel = CONTENT.panels.find((p) => p.id === current.part);
      if (panel && panel.refresh.length > 1)
        optionLists.push(["refresh", panel.refresh]);
    } else {
      const part = CONTENT.parts.find((p) => p.id === current.part);
      for (const [k, vs] of Object.entries(part?.options ?? {}))
        if (vs.length > 1) optionLists.push([k, vs]);
    }
  }
  const flagged =
    (!!current && flags.parts.has(current.part)) ||
    (slot === 0 && flags.categories.has(cat));

  return (
    <div className="row">
      <Select
        label={cat}
        name={fieldName(slot > 0 ? `${cat} ${slot + 1}` : cat)}
        value={current?.part ?? ""}
        options={choices}
        flagged={flagged}
        onChange={setPart}
      />
      {optionLists.map(([k, vs]) => {
        const value = current?.opts?.[k] ?? vs[0];
        return (
          <Select
            key={k}
            label={k}
            value={String(value)}
            options={vs.map((v) => ({
              value: String(v),
              label: formatOption(k, v),
            }))}
            onChange={(v) => setOpt(k, v)}
          />
        );
      })}
      {slot === 0 && (
        <Spend
          label={`${cat} spend`}
          value={build.spend[cat] ?? 0}
          onChange={(v) =>
            set((b) => ({ ...b, spend: { ...b.spend, [cat]: v } }))
          }
        />
      )}
    </div>
  );
}

function SizeSlider({
  axis,
  build,
  set,
  fit,
  flags,
  lock,
}: {
  axis: Axis;
  build: Build;
  set: SetBuild;
  fit: Fit;
  flags: Flags;
  /** Scale every axis by the same ratio, in the spirit of a uniform scale. */
  lock: boolean;
}) {
  const body = CONTENT.bodies.find((b) => b.id === build.body);
  if (!body) return null;
  const [lo, hi] = body.limits[axis];
  const value = fit.shell.outer[axis];
  const min = fit.min[axis];
  const markAt = Math.min(1, Math.max(0, (min - lo) / (hi - lo)));
  const state = flags.tooBig.has(axis)
    ? "danger"
    : flags.short.has(axis)
      ? "short"
      : "";
  return (
    <div className={`size ${state}`}>
      <div className="track">
        <input
          type="range"
          min={lo}
          max={hi}
          step={0.5}
          value={value}
          aria-label={`size ${axis}`}
          onChange={(e) => {
            // Read the value now: the updater may run after React restores the controlled input.
            const v = Number(e.target.value);
            set((b) => {
              if (!lock || b.size[axis] <= 0)
                return { ...b, size: { ...b.size, [axis]: v } };
              const k = v / b.size[axis];
              const size = { ...b.size };
              for (const a of ["x", "y", "z"] as Axis[]) {
                const [l, h] = body.limits[a];
                const step = 0.5;
                size[a] = a === axis ? v : Math.min(h, Math.max(l, Math.round((b.size[a] * k) / step) * step));
              }
              return { ...b, size };
            });
          }}
        />
        <span className="mark" style={{ left: `${markAt * 100}%` }} />
      </div>
      <output>{value.toFixed(axis === "z" ? 1 : 0)}</output>
    </div>
  );
}

const SIDE_NAME: Record<Side, string> = {
  left: "Left",
  right: "Right",
  rear: "Rear",
  front: "Front",
};

function Ports({
  build,
  set,
  flags,
}: {
  build: Build;
  set: SetBuild;
  flags: Flags;
}) {
  const layout = CONTENT.layouts.find((l) => l.id === build.layout);
  const sides = [...(layout?.portSides ?? [])];
  for (const p of build.ports) if (!sides.includes(p.side)) sides.push(p.side);
  const choices = partsFor("port", build.year);
  return (
    <div className={flags.ports ? "ports flagged-block" : "ports"}>
      {sides.map((side) => (
        <div
          key={side}
          className={layout?.portSides.includes(side) ? "side" : "side off"}
        >
          <span className="side-name">{SIDE_NAME[side]}</span>
          <div className="chips">
            {build.ports.map((p, i) =>
              p.side !== side ? null : (
                <button
                  type="button"
                  key={`${p.part}-${i}`}
                  className={flags.parts.has(p.part) ? "chip flagged" : "chip"}
                  onClick={() =>
                    set((b) => ({
                      ...b,
                      ports: b.ports.filter((_, j) => j !== i),
                    }))
                  }
                >
                  {nameOf(p.part)}
                </button>
              ),
            )}
            <select
              className="add"
              value=""
              aria-label={`add ${side} port`}
              onChange={(e) => {
                const part = e.target.value;
                if (part)
                  set((b) => ({ ...b, ports: [...b.ports, { part, side }] }));
              }}
            >
              <option value="">+</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

const PIECE_NAME: Record<Piece, string> = {
  floor: "Bottom",
  deck: "Top",
  lid: "Lid",
};

function Materials({
  build,
  set,
  flags,
}: {
  build: Build;
  set: SetBuild;
  flags: Flags;
}) {
  const year = build.year;
  return (
    <div className="materials">
      {(["lid", "deck", "floor"] as Piece[]).map((piece) => {
        const matId = build.materials[piece];
        const mat = CONTENT.materials.find((m) => m.id === matId);
        const allowed = materialsFor(year, piece);
        const mats = CONTENT.materials.filter((m) => allowed.includes(m.id));
        const colours = CONTENT.colours.filter(
          (c) => available(c, year) || c.id === build.finish[piece].colour,
        );
        const finishes = (mat?.finishes ?? [])
          .filter((f) => {
            const fin = CONTENT.finishes.find((x) => x.id === f);
            return !fin || available(fin, year);
          })
          .map((f) => ({
          value: f,
          label: CONTENT.finishes.find((x) => x.id === f)?.name ?? f,
        }));
        if (!finishes.some((f) => f.value === build.finish[piece].texture))
          finishes.unshift({
            value: build.finish[piece].texture,
            label: build.finish[piece].texture,
          });
        return (
          <div
            key={piece}
            className={
              flags.pieces.has(piece) ? "piece flagged-block" : "piece"
            }
          >
            <span className="side-name">{PIECE_NAME[piece]}</span>
            <div className="row">
              <Select
                label={`${piece} material`}
                name="Material"
                value={matId}
                options={mats.map((m) => ({ value: m.id, label: m.name }))}
                onChange={(v) =>
                  set((b) => {
                    const first =
                      CONTENT.materials.find((m) => m.id === v)?.finishes[0] ??
                      b.finish[piece].texture;
                    return {
                      ...b,
                      materials: { ...b.materials, [piece]: v },
                      finish: {
                        ...b.finish,
                        [piece]: { ...b.finish[piece], texture: first },
                      },
                    };
                  })
                }
              />
              <Select
                label={`${piece} finish`}
                name="Finish"
                value={build.finish[piece].texture}
                options={finishes}
                onChange={(v) =>
                  set((b) => ({
                    ...b,
                    finish: {
                      ...b.finish,
                      [piece]: { ...b.finish[piece], texture: v },
                    },
                  }))
                }
              />
            </div>
            <div className="swatches">
              {colours.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-label={c.name}
                  className={
                    build.finish[piece].colour === c.id ? "swatch on" : "swatch"
                  }
                  style={{ background: c.hex }}
                  onClick={() =>
                    set((b) => ({
                      ...b,
                      finish: {
                        ...b.finish,
                        [piece]: { ...b.finish[piece], colour: c.id },
                      },
                    }))
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ hover

// Hover lives outside React state so pointer moves re-render only the label.
let hovered: Hover | null = null;
const listeners = new Set<() => void>();
const hoverStore = {
  set(h: Hover | null) {
    if (
      h === hovered ||
      (h &&
        hovered &&
        h.label === hovered.label &&
        h.x === hovered.x &&
        h.y === hovered.y)
    )
      return;
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
    <div className="hover" style={{ left: h.x + 14, top: h.y + 14 }}>
      {h.label}
    </div>
  );
}

// ------------------------------------------------------------------ builder

const YEARS = [...new Set(CONTENT.eras.map((e) => e.year))];

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
  const back = () => {
    pending.current?.();
    onBack();
  };
  const [tab, setTab] = useState<Tab>("Body");
  const [lidAngle, setLidAngle] = useState(100);
  const [lock, setLock] = useState(false);
  // X-ray follows the tab (see-through while fitting parts) unless pinned.
  const [xrayPin, setXrayPin] = useState<boolean | null>(null);
  const xray = xrayPin ?? (tab === "Body" || tab === "Internals");
  const set: SetBuild = useCallback(
    (f) => {
      if (!locked) setBuild((b) => f(b));
    },
    [locked],
  );
  const fit = useMemo(() => solve(build), [build]);
  const flags = useMemo(() => flagsOf(fit.problems, build), [fit, build]);
  const listed = useMemo(
    () =>
      fit.problems.map((p) => ({ tab: tabOf(p), text: problemText(p) })),
    [fit],
  );
  const perTab = (t: Tab) => listed.filter((p) => p.tab === t).length;
  const block = blockReason(fit.problems);
  const measured = useMemo(() => simulate(build, fit), [build, fit]);

  const colourHex = (id: string) =>
    CONTENT.colours.find((c) => c.id === id)?.hex ?? "";
  const colours = useMemo(
    () => ({
      floor: colourHex(build.finish.floor.colour),
      deck: colourHex(build.finish.deck.colour),
      lid: colourHex(build.finish.lid.colour),
    }),
    [
      build.finish.floor.colour,
      build.finish.deck.colour,
      build.finish.lid.colour,
    ],
  );
  const surfaces = useMemo(
    () => surfacesOf(build),
    [build.materials, build.finish],
  );
  const labelFor = useCallback((b: Box) => {
    const byRole = ROLE_NAME[b.role];
    return byRole ?? nameOf(b.part) ?? "";
  }, []);

  const year = build.year;
  const bodies = CONTENT.bodies.filter((b) => available(b, year));
  const body = CONTENT.bodies.find((b) => b.id === build.body);
  const layouts = CONTENT.layouts.filter(
    (l) => available(l, year) && body?.layouts.includes(l.id),
  );

  return (
    <div className="builder">
      <aside className="panel">
        <div className="model-bar">
          <button type="button" className="back" aria-label="models" onClick={back}>
            ‹
          </button>
          <input
            className="model-name"
            value={name}
            aria-label="model name"
            readOnly={locked}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!name.trim()) setName(model.name);
            }}
          />
          <button
            type="button"
            disabled={!locked && !!block}
            onClick={() => {
              pending.current?.();
              onReview({ ...model, name: name.trim() || model.name, build });
            }}
          >
            {locked ? "Read review" : "Get reviewed"}
          </button>
          {!locked && (
            <button
              type="button"
              className="reroll"
              aria-label="new name"
              onClick={() => setName(reroll(build))}
            >
              ↻
            </button>
          )}
        </div>
        {locked && (
          <div className="locked-bar">
            <button type="button" className="duplicate" onClick={onDuplicate}>
              Duplicate
            </button>
          </div>
        )}
        <nav className="tabs">
          {TABS.map((t) => {
            const n = perTab(t);
            return (
              <button
                type="button"
                key={t}
                className={t === tab ? "tab on" : "tab"}
                onClick={() => setTab(t)}
              >
                {t}
                {n > 0 && (
                  <span className="tab-count">{n}</span>
                )}
              </button>
            );
          })}
        </nav>
        {!locked && listed.length > 0 && (
          <div className="problems">
            <ul>
              {listed.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: problems have no id and never reorder within one render
                <li key={i}>
                  <button type="button" onClick={() => setTab(p.tab)}>
                    <span>{p.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <fieldset className="tab-body" disabled={locked}>
          {tab === "Body" && (
            <>
              <div className="years">
                {YEARS.map((y) => (
                  <button
                    type="button"
                    key={y}
                    className={y === year ? "year on" : "year"}
                    onClick={() => set((b) => toYear(b, y))}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <div className="row">
                <Select
                  label="body"
                  value={build.body}
                  flagged={flags.body}
                  options={bodies.map((b) => ({ value: b.id, label: b.name }))}
                  onChange={(v) =>
                    // Bodies are shapes: switching keeps the laptop's size.
                    set((b) => toBody(b, v))
                  }
                />
                <Select
                  label="layout"
                  value={build.layout}
                  flagged={flags.layout}
                  options={layouts.map((l) => ({ value: l.id, label: l.name }))}
                  onChange={(v) => set((b) => ({ ...b, layout: v }))}
                />
                <Spend
                  label="packing spend"
                  value={build.spend.packing ?? 0}
                  onChange={(v) =>
                    set((b) => ({ ...b, spend: { ...b.spend, packing: v } }))
                  }
                />
              </div>
              <label className="lock">
                <input
                  type="checkbox"
                  checked={lock}
                  onChange={(e) => setLock(e.target.checked)}
                />
                Keep proportions
              </label>
              <div className="sizes">
                {(["x", "y", "z"] as Axis[]).map((a) => (
                  <SizeSlider
                    key={a}
                    axis={a}
                    build={build}
                    set={set}
                    fit={fit}
                    flags={flags}
                    lock={lock}
                  />
                ))}
              </div>
              <Ports build={build} set={set} flags={flags} />
            </>
          )}
          {tab === "Internals" && (
            <>
              {(["processor", "graphics", "memory"] as Category[]).map((c) => (
                <PartRow
                  key={c}
                  cat={c}
                  build={build}
                  set={set}
                  flags={flags}
                />
              ))}
              <PartRow cat="storage" build={build} set={set} flags={flags} />
              {(build.parts.storage?.length ?? 0) >= 1 && (
                <PartRow
                  cat="storage"
                  slot={1}
                  build={build}
                  set={set}
                  flags={flags}
                />
              )}
              {(
                [
                  "battery",
                  "hotswap",
                  "cooling",
                  "optical",
                  "wireless",
                  "speakers",
                ] as Category[]
              ).map((c) => (
                <PartRow
                  key={c}
                  cat={c}
                  build={build}
                  set={set}
                  flags={flags}
                />
              ))}
              <Power build={build} set={set} />
            </>
          )}
          {tab === "Display and input" &&
            (["display", "keyboard", "trackpad", "webcam"] as Category[]).map(
              (c) => (
                <PartRow
                  key={c}
                  cat={c}
                  build={build}
                  set={set}
                  flags={flags}
                />
              ),
            )}
          {tab === "Finish" && (
            <>
              <Materials build={build} set={set} flags={flags} />
              <Spend
                label="material spend"
                value={build.spend.material ?? 0}
                onChange={(v) =>
                  set((b) => ({ ...b, spend: { ...b.spend, material: v } }))
                }
              />
            </>
          )}
        </fieldset>
      </aside>
      <main className="stage">
        <Scene
          fit={fit}
          year={build.year}
          lidAngle={lidAngle}
          colours={colours}
          labelFor={labelFor}
          onHover={hoverStore.set}
          surfaces={surfaces}
          xray={xray}
          workshop
          // Centre the laptop in the space the measurements panel leaves.
          shift={170}
          camera={{ position: [0, 430, 720], target: [0, 70, -60] }}
        />
        <button
          type="button"
          className={xray ? "xray on" : "xray"}
          onClick={() => setXrayPin(!xray)}
        >
          X-ray
        </button>
        <input
          className="lid-angle"
          type="range"
          min={0}
          max={130}
          step={1}
          value={lidAngle}
          aria-label="lid"
          onChange={(e) => setLidAngle(Number(e.target.value))}
        />
        <Measurements
          m={measured}
          build={build}
          fit={fit}
          set={set}
          locked={locked}
        />
        <HoverLabel />
      </main>
    </div>
  );
}
