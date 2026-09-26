import { useState } from "react";
import type { Build, Fit, Mark, MarkSurface } from "../engine";
import { faceOf, markExtent } from "../viewer/Decor";
import { token } from "../viewer/theme";
import { DragArrow, Dashed, Outline } from "./Arrows";
import { ColourPicker } from "./ColourPicker";
import type { SetBuild } from "./Parts";
import type { StageProps } from "./Stages";
import { sanitiseSvg } from "./svg";
import { Card, Chip, Chips, Label, Slider, TraySep } from "./ui";

// The Marks stage: text and imported SVG marks on the lid, palm rest, bottom
// and bezel, each with its font, size, tracking, weight, colour, process and
// position. Marks are open in every year.

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

export function MarksColumn({
  build,
  set,
  locked,
  surface,
  onSurface,
  selected,
  onSelect,
}: StageProps & {
  surface: MarkSurface;
  onSurface: (s: MarkSurface) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [colourOpen, setColourOpen] = useState(false);
  const marks = (build.marks ?? []).filter((m) => m.surface === surface);
  const m = marks.find((x) => x.id === selected) ?? null;
  const edit = (f: (x: Mark) => Mark) => m && set((b) => setMark(b, m.id, f));
  return (
    <>
      <div className="bd-tabs">
        {SURFACES.map(([s, name]) => (
          <button type="button" key={s} className={s === surface ? "on" : ""} onClick={() => onSurface(s)}>
            {name}
          </button>
        ))}
      </div>
      {m && (
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
            <Chips>
              {MARK_FONTS.map(([font, name]) => (
                <Chip key={font} on={m.font === font} style={{ fontFamily: `"${font}"`, textTransform: "none" }} onClick={() => edit((x) => ({ ...x, font }))}>
                  {name}
                </Chip>
              ))}
            </Chips>
          )}
          <div className="bd-mark-grid">
            <div className="bd-field">
              <Label>Size</Label>
              <span className="bd-value">{m.size.toFixed(1)} mm</span>
              <Slider label="mark size" value={m.size} min={1.5} max={60} step={0.5} onChange={(v) => edit((x) => ({ ...x, size: v }))} />
            </div>
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
            <button type="button" className="bd-field bd-cell" onClick={() => setColourOpen(!colourOpen)}>
              <Label>Colour</Label>
              <span className="bd-value bd-colour-line">
                <i className="bd-swatch" style={{ background: m.colour }} />
                {m.colour.toUpperCase()}
              </span>
            </button>
            <button type="button" className="bd-field bd-cell" onClick={() => edit((x) => ({ ...x, process: PROCESSES[(PROCESSES.indexOf(x.process) + 1) % PROCESSES.length] }))}>
              <Label>Process</Label>
              <span className="bd-value">{cap(m.process)}</span>
            </button>
            <button type="button" className="bd-field bd-cell" title="Centre" onClick={() => edit((x) => ({ ...x, x: 0 }))}>
              <Label>Position</Label>
              <span className="bd-value accent">
                {r1(m.x)}  {r1(m.y)}
              </span>
            </button>
          </div>
          {colourOpen && <ColourPicker compact value={m.colour} disabled={locked} onChange={(hex) => edit((x) => ({ ...x, colour: hex }))} />}
          <div className="bd-chips">
            <button
              type="button"
              className="fd-text bd-remove"
              onClick={() => {
                set((b) => ({ ...b, marks: (b.marks ?? []).filter((x) => x.id !== m.id) }));
                onSelect(null);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </>
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
}: StageProps & {
  surface: MarkSurface;
  selected: string | null;
  onSelect: (id: string | null) => void;
  defaultText: string;
  onNote: (n: string | null) => void;
}) {
  const marks = (build.marks ?? []).filter((m) => m.surface === surface);
  const add = (m: Mark) => {
    set((b) => ({ ...b, marks: [...(b.marks ?? []), m] }));
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
      {marks.map((m) => (
        <Card
          key={m.id}
          width={160}
          on={m.id === selected}
          top={<i className={m.id === selected ? "bd-badge on" : "bd-badge"}>{m.kind === "svg" ? "SVG" : "T"}</i>}
          name={m.text || " "}
          onClick={() => onSelect(m.id)}
        />
      ))}
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
