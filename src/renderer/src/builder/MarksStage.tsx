import { useEffect, useState } from "react";
import type { Build, Fit, Mark, MarkSurface } from "../engine";
import { faceOf, markExtent, outlined, strokeOf } from "../viewer/Decor";
import { token } from "../viewer/theme";
import { DragArrow, Dashed, Outline } from "./Arrows";
import { ColourPicker } from "./ColourPicker";
import { type Decal, DECAL_SETS, DECALS, DecalGlyph, decalById } from "./decals";
import type { SetBuild } from "./Parts";
import type { StageProps } from "./Stages";
import { sanitiseSvg } from "./svg";
import { Dropdown } from "./Dropdown";
import { Card, Chip, Chips, Label, Slider, TraySep } from "./ui";

// The Marks stage: text, imported SVG and preset decal marks on the lid, palm rest, bottom
// and bezel, each with its font, size, tracking, weight, colour, fill or
// outline, process and position. Marks are open in every year.

export const SURFACES: [MarkSurface, string][] = [
  ["lid", "Lid"],
  ["palm", "Palm rest"],
  ["bottom", "Bottom"],
  ["bezel", "Bezel"],
];

export const MARK_FONTS: [string, string][] = [
  ["Barlow Condensed", "Barlow"],
  ["IBM Plex Sans", "Plex Sans"],
  ["Space Mono", "Space Mono"],
  ["Rubik", "Rubik"],
];

const PROCESSES: Mark["process"][] = ["etched", "printed", "embossed"];
const WEIGHTS = [400, 500, 600, 700];
const WEIGHT_NAME: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const r1 = (v: number) => Math.round(v * 10) / 10;

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Where a new mark starts on each surface, and its size. */
function start(fit: Fit, surface: MarkSurface): Pick<Mark, "x" | "y" | "size" | "process" | "weight"> {
  const f = faceOf(fit, surface);
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  switch (surface) {
    case "lid":
      return { x: 0, y: 0, size: 12, process: "etched", weight: 700 };
    case "palm":
      return { x: r1(f.w * 0.36), y: r1(-f.h * 0.42), size: 4, process: "printed", weight: 600 };
    case "bottom":
      return { x: 0, y: r1(-f.h * 0.3), size: 4, process: "printed", weight: 600 };
    case "bezel": {
      // The chin, between the screen and the hinge.
      const edge = panel ? panel.at.y + panel.size.y : f.h * 0.9;
      const chin = (edge + f.h) / 2;
      return { x: 0, y: r1(f.h / 2 - chin), size: 3.2, process: "printed", weight: 600 };
    }
  }
}

function setMark(b: Build, id: string, f: (m: Mark) => Mark): Build {
  return { ...b, marks: (b.marks ?? []).map((m) => (m.id === id ? f(m) : m)) };
}

/** A mark's allowed centre range on its face. */
function limits(fit: Fit, m: Mark): { x: [number, number]; y: [number, number] } {
  const f = faceOf(fit, m.surface);
  const e = markExtent(m);
  const hx = Math.max(0, f.w / 2 - e.w / 2);
  const hy = Math.max(0, f.h / 2 - e.h / 2);
  return { x: [-hx, hx], y: [-hy, hy] };
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const sameColour = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A preset placed at its default size on the surface's default spot, printed in cream. */
export function presetMark(fit: Fit, marks: Mark[], surface: MarkSurface, decal: Decal): Mark {
  const f = faceOf(fit, surface);
  let x = 0;
  let y = 0;
  if (surface === "lid") y = r1(f.h * 0.2);
  if (surface === "palm") {
    // Beside the pad, on whichever side is free.
    const side = r1(f.w * 0.36);
    x = marks.some((m) => m.surface === "palm" && m.x > 0) ? -side : side;
    y = r1(-f.h * 0.3);
  }
  if (surface === "bezel") y = start(fit, surface).y;
  const m: Mark = {
    id: newId(),
    surface,
    kind: "svg",
    text: decal.name,
    svg: decal.svg,
    preset: decal.id,
    font: "Barlow Condensed",
    tracking: 0,
    weight: 600,
    colour: token("text").toUpperCase(),
    process: "printed",
    size: decal.size,
    x,
    y,
  };
  const lim = limits(fit, m);
  return { ...m, x: clamp(x, lim.x), y: clamp(y, lim.y) };
}

/** The preset browser: sets of tiles, filtered to the surface or all of them. */
function PresetBrowser({
  build,
  fit,
  surface,
  onPick,
  onGhost,
}: {
  build: Build;
  fit: Fit;
  surface: MarkSurface;
  onPick: (d: Decal) => void;
  onGhost: (m: Mark | null) => void;
}) {
  const [all, setAll] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clears the ghost when the browser closes
  useEffect(() => () => onGhost(null), []);
  const marks = build.marks ?? [];
  const placed = new Set(marks.map((m) => m.preset));
  const here = (d: Decal) => d.surface === surface;
  const sets = DECAL_SETS.map(([id, label]) => ({ id, label, items: DECALS.filter((d) => d.set === id && (all || here(d))) })).filter(
    (g) => g.items.length > 0,
  );
  // All: sets with something for this surface first.
  if (all) sets.sort((a, b) => Number(b.items.some(here)) - Number(a.items.some(here)));
  const name = SURFACES.find(([s]) => s === surface)?.[1] ?? surface;
  return (
    <div className="bd-presets fd-in">
      <Chips>
        <Chip caps on={!all} onClick={() => setAll(false)}>
          {name}
        </Chip>
        <Chip caps on={all} onClick={() => setAll(true)}>
          All
        </Chip>
      </Chips>
      <div className={scrolled ? "bd-preset-list scrolled" : "bd-preset-list"} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        {sets.map((g) => (
          <div key={g.id} className="bd-preset-set">
            <Label>{g.label}</Label>
            <div className="bd-preset-grid">
              {g.items.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  className="bd-preset"
                  onMouseEnter={() => onGhost({ ...presetMark(fit, marks, surface, d), ghost: true })}
                  onMouseLeave={() => onGhost(null)}
                  onClick={() => onPick(d)}
                >
                  <span className="bd-preset-tile">
                    <DecalGlyph decal={d} className="bd-preset-glyph" />
                    {!here(d) && <small>{SURFACES.find(([s]) => s === d.surface)?.[1]}</small>}
                    {placed.has(d.id) && <i className="bd-preset-dot" />}
                  </span>
                  <b>{d.name}</b>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarksColumn({
  build,
  fit,
  set,
  locked,
  surface,
  onSurface,
  selected,
  onSelect,
  browsing,
  onBrowse,
  onGhost,
  bodyColour,
}: StageProps & {
  surface: MarkSurface;
  onSurface: (s: MarkSurface) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  browsing: boolean;
  onBrowse: (open: boolean) => void;
  onGhost: (m: Mark | null) => void;
  /** The chassis colour under this surface, for Body and the process previews. */
  bodyColour: string;
}) {
  const [colourOpen, setColourOpen] = useState(false);
  const marks = (build.marks ?? []).filter((m) => m.surface === surface);
  const m = marks.find((x) => x.id === selected) ?? null;
  const decal = decalById(m?.preset);
  const edit = (f: (x: Mark) => Mark) => m && set((b) => setMark(b, m.id, f));
  const size = m && (
    <div className="bd-field">
      <Label>Size</Label>
      <span className="bd-value">{m.size.toFixed(1)} mm</span>
      <Slider label="mark size" value={m.size} min={1.5} max={m.kind === "svg" ? 200 : 60} step={0.5} onChange={(v) => edit((x) => ({ ...x, size: v }))} />
    </div>
  );
  const colour = m && (
    <button type="button" className="bd-field bd-cell" onClick={() => setColourOpen(!colourOpen)}>
      <Label>Colour</Label>
      <span className="bd-value bd-colour-line">
        <i className="bd-swatch" style={{ background: m.colour }} />
        {sameColour(m.colour, bodyColour) ? "Body" : m.colour.toUpperCase()}
      </span>
    </button>
  );
  const style = m && (
    <>
      <div className="bd-line">
        <Label>Style</Label>
        <Chips>
          <Chip caps on={!outlined(m)} onClick={() => edit((x) => ({ ...x, style: "fill" }))}>
            Fill
          </Chip>
          <Chip caps on={outlined(m)} onClick={() => edit((x) => ({ ...x, style: "outline" }))}>
            Outline
          </Chip>
        </Chips>
      </div>
      {outlined(m) && (
        <div className="bd-field">
          <div className="bd-line">
            <Label>Line</Label>
            <span className="bd-value">{strokeOf(m).toFixed(1)} mm</span>
          </div>
          <Slider label="outline width" value={strokeOf(m)} min={0.1} max={4} step={0.1} onChange={(v) => edit((x) => ({ ...x, stroke: v }))} />
        </div>
      )}
    </>
  );
  const position = m && (
    <button type="button" className="bd-field bd-cell" title="Centre" onClick={() => edit((x) => ({ ...x, x: 0 }))}>
      <Label>Position</Label>
      <span className="bd-value">
        <span className={m.x === 0 ? "accent" : ""}>{r1(m.x)}</span> <span className={m.y === 0 ? "accent" : ""}>{r1(m.y)}</span>
      </span>
    </button>
  );
  return (
    <>
      <div className="bd-tabs">
        {SURFACES.map(([s, name]) => (
          <button type="button" key={s} className={s === surface ? "on" : ""} onClick={() => onSurface(s)}>
            {name}
          </button>
        ))}
      </div>
      {browsing && (
        <PresetBrowser
          build={build}
          fit={fit}
          surface={surface}
          onGhost={onGhost}
          onPick={(d) => {
            if (locked) return;
            const pm = presetMark(fit, build.marks ?? [], surface, d);
            set((b) => ({ ...b, marks: [...(b.marks ?? []), pm] }));
            onGhost(null);
            onBrowse(false);
            onSelect(pm.id);
          }}
        />
      )}
      {!browsing && m && decal && (
        <div key={m.id} className="bd-mark fd-in">
          <span className="bd-mark-text svg bd-mark-head">
            <DecalGlyph decal={decal} className="bd-mark-glyph" />
            {m.text}
          </span>
          <div className="bd-mark-grid">
            {size}
            {colour}
            {position}
          </div>
          {colourOpen && <ColourPicker compact value={m.colour} disabled={locked} onChange={(hex) => edit((x) => ({ ...x, colour: hex }))} />}
          {style}
          <div className="bd-field">
            <Label>Process</Label>
            <div className="bd-process">
              {PROCESSES.map((p) => (
                <button type="button" key={p} className={p === m.process ? "on" : ""} onClick={() => edit((x) => ({ ...x, process: p }))}>
                  <span className={`bd-process-tile ${p}`} style={{ background: bodyColour, color: p === "embossed" && sameColour(m.colour, bodyColour) ? bodyColour : m.colour }}>
                    <DecalGlyph decal={decal} className="bd-process-glyph" line={outlined(m) ? strokeOf(m) / m.size : undefined} />
                  </span>
                  <b>{cap(p)}</b>
                </button>
              ))}
            </div>
          </div>
          <RemoveMark set={set} id={m.id} onSelect={onSelect} />
        </div>
      )}
      {!browsing && m && !decal && (
        <div key={m.id} className="bd-mark fd-in">
          {m.kind === "text" ? (
            <input
              className="bd-mark-text"
              aria-label="mark text"
              value={m.text}
              readOnly={locked}
              style={{
                fontFamily: `"${m.font}"`,
                fontWeight: m.weight,
                letterSpacing: `${m.tracking / 1000}em`,
              }}
              onChange={(e) => {
                const v = e.target.value;
                edit((x) => ({ ...x, text: v }));
              }}
            />
          ) : (
            <span className="bd-mark-text svg">{m.text}</span>
          )}
          {m.kind === "text" && (
            <div className="bd-line">
              <Label>Font</Label>
              <Dropdown
                label="Mark font"
                value={m.font}
                options={MARK_FONTS.map(([font, name]) => ({ key: font, label: name, style: { fontFamily: `"${font}"` } }))}
                onChange={(font) => edit((x) => ({ ...x, font }))}
              />
            </div>
          )}
          <div className="bd-mark-grid">
            {size}
            {m.kind === "text" ? (
              <div className="bd-field">
                <Label>Tracking</Label>
                <span className="bd-value">{m.tracking}</span>
                <Slider label="tracking" value={m.tracking} min={-50} max={400} step={10} onChange={(v) => edit((x) => ({ ...x, tracking: v }))} />
              </div>
            ) : (
              <span />
            )}
            {m.kind === "text" ? (
              <button type="button" className="bd-field bd-cell" onClick={() => edit((x) => ({ ...x, weight: WEIGHTS[(WEIGHTS.indexOf(x.weight) + 1) % WEIGHTS.length] }))}>
                <Label>Weight</Label>
                <span className="bd-value">{WEIGHT_NAME[m.weight] ?? m.weight}</span>
              </button>
            ) : (
              <span />
            )}
            {colour}
            <button type="button" className="bd-field bd-cell" onClick={() => edit((x) => ({ ...x, process: PROCESSES[(PROCESSES.indexOf(x.process) + 1) % PROCESSES.length] }))}>
              <Label>Process</Label>
              <span className="bd-value">{cap(m.process)}</span>
            </button>
            {position}
          </div>
          {colourOpen && <ColourPicker compact value={m.colour} disabled={locked} onChange={(hex) => edit((x) => ({ ...x, colour: hex }))} />}
          {style}
          <RemoveMark set={set} id={m.id} onSelect={onSelect} />
        </div>
      )}
    </>
  );
}

function RemoveMark({ set, id, onSelect }: { set: SetBuild; id: string; onSelect: (id: string | null) => void }) {
  return (
    <div className="bd-chips">
      <button
        type="button"
        className="fd-text bd-remove"
        onClick={() => {
          set((b) => ({ ...b, marks: (b.marks ?? []).filter((x) => x.id !== id) }));
          onSelect(null);
        }}
      >
        Remove
      </button>
    </div>
  );
}

export function MarksTray({
  build,
  fit,
  set,
  locked,
  surface,
  selected,
  onSelect,
  defaultText,
  onNote,
  browsing,
  onBrowse,
}: StageProps & {
  surface: MarkSurface;
  selected: string | null;
  onSelect: (id: string | null) => void;
  defaultText: string;
  onNote: (n: string | null) => void;
  browsing: boolean;
  onBrowse: (open: boolean) => void;
}) {
  const marks = (build.marks ?? []).filter((m) => m.surface === surface);
  const add = (m: Mark) => {
    set((b) => ({ ...b, marks: [...(b.marks ?? []), m] }));
    onBrowse(false);
    onSelect(m.id);
  };
  const base = (): Omit<Mark, "kind" | "text"> => ({
    id: newId(),
    surface,
    font: "Barlow Condensed",
    tracking: 120,
    colour: token("text").toUpperCase(),
    ...start(fit, surface),
  });
  return (
    <>
      {marks.map((m) => {
        const on = m.id === selected && !browsing;
        const decal = decalById(m.preset);
        return (
          <Card
            key={m.id}
            width={160}
            on={on}
            top={
              decal ? (
                <span className="bd-card-row">
                  <i className={on ? "bd-badge solid on" : "bd-badge solid"}>Decal</i>
                  <DecalGlyph decal={decal} className={on ? "bd-card-glyph on" : "bd-card-glyph"} />
                </span>
              ) : (
                <i className={on ? "bd-badge on" : "bd-badge"}>{m.kind === "svg" ? "SVG" : "T"}</i>
              )
            }
            name={m.text || " "}
            onClick={() => {
              onBrowse(false);
              onSelect(m.id);
            }}
          />
        );
      })}
      {marks.length > 0 && <TraySep />}
      <Card
        dashed
        width={140}
        name="Import SVG"
        onClick={async () => {
          if (locked) return;
          onNote(null);
          const got = await window.api.marks.importSvg();
          if (!got) return;
          if ("error" in got) {
            onNote(got.error === "too-big" ? "That SVG is over 512 KB" : "That file is not an SVG");
            return;
          }
          const svg = sanitiseSvg(got.svg);
          if (!svg) {
            onNote("That SVG could not be read");
            return;
          }
          const s = base();
          add({ ...s, kind: "svg", text: got.name, svg, size: surface === "lid" ? 20 : s.size * 1.6 });
        }}
      />
      <Card dashed width={140} name="Add text" onClick={() => !locked && add({ ...base(), kind: "text", text: defaultText })} />
      <Card dashed on={browsing} width={140} name="Presets" onClick={() => !locked && onBrowse(!browsing)} />
    </>
  );
}

// ------------------------------------------------------------------ 3D

/** The selected mark's outline, centre lines and arrows, on its face. */
export function MarkHandles({ build, fit, set, selected, locked }: { build: Build; fit: Fit; set: SetBuild; selected: string | null; locked: boolean }) {
  const m = (build.marks ?? []).find((x) => x.id === selected);
  if (!m) return null;
  const f = faceOf(fit, m.surface);
  const e = markExtent(m);
  const w = e.w * 1.12 + 2;
  const h = e.h * 1.25 + 2;
  const lim = limits(fit, m);
  const z = 0.6;
  return (
    <group position={f.at} rotation={f.rot}>
      <Outline
        handles
        corners={[
          [m.x - w / 2, m.y - h / 2, z],
          [m.x + w / 2, m.y - h / 2, z],
          [m.x + w / 2, m.y + h / 2, z],
          [m.x - w / 2, m.y + h / 2, z],
        ]}
      />
      <Dashed a={[0, -f.h / 2 + 4, z]} b={[0, f.h / 2 - 4, z]} />
      <Dashed a={[-f.w / 2 + 4, 0, z]} b={[f.w / 2 - 4, 0, z]} />
      <DragArrow
        at={[m.x, m.y, z + 1.5]}
        dir={[1, 0, 0]}
        reach={w / 2 + 16}
        value={m.x}
        range={lim.x}
        snaps={[0]}
        disabled={locked}
        onChange={(v) => set((b) => setMark(b, m.id, (x) => ({ ...x, x: v })))}
      />
      <DragArrow
        at={[m.x, m.y, z + 1.5]}
        dir={[0, 1, 0]}
        reach={h / 2 + 16}
        value={m.y}
        range={lim.y}
        snaps={[0]}
        disabled={locked}
        onChange={(v) => set((b) => setMark(b, m.id, (x) => ({ ...x, y: v })))}
      />
    </group>
  );
}
