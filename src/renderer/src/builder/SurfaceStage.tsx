import {
  type Box,
  type Build,
  type BuildPort,
  CONTENT,
  type Category,
  type Fit,
  type Part,
  partPrice,
  type PortGroup,
  partsFor,
  type Problem,
  type Side,
} from "../engine";
import { Html } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { CornerHandle, DragArrow, Dashed, Outline } from "./Arrows";
import { OptionChips, type SetBuild, withPart } from "./Parts";
import { problemText } from "./problems";
import type { StageProps } from "./Stages";
import { type DropOption, Dropdown } from "./Dropdown";
import { Chip, Chips, Label, Line, money, SliderField, Value } from "./ui";

// The Surface stage: keyboard, trackpad, webcam and ports, placed on the 3D
// laptop with drag arrows. Keyboard and trackpad stay centred left to right;
// the webcam slides along the top bezel; the display moves up and down the
// lid; each port moves along its wall and up and down it.

export type SurfaceItem = "keyboard" | "trackpad" | "webcam" | "display" | "ports";

const SIDE_NAME: Record<Side, string> = { left: "Left", right: "Right", rear: "Rear", front: "Front" };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function portShape(id: string): string {
  if (id.startsWith("usb-c") || id.startsWith("usb4") || id.startsWith("thunderbolt") || id === "mini-dp") return "pill";
  if (id.startsWith("usb-a")) return "rect";
  if (id.startsWith("hdmi")) return "hdmi";
  if (id === "audio-combo") return "round";
  if (id === "dc-jack") return "ring";
  if (id.startsWith("ethernet") || id.startsWith("modem")) return "lan";
  if (id.includes("sd") || id.includes("card")) return "slot";
  if (id === "vga" || id === "dvi-d") return "wide";
  return "rect";
}

function setPlace(b: Build, f: (p: NonNullable<Build["place"]>) => NonNullable<Build["place"]>): Build {
  return { ...b, place: f(b.place ?? {}) };
}

function setPort(b: Build, i: number, f: (p: BuildPort) => BuildPort): Build {
  return { ...b, ports: b.ports.map((p, j) => (j === i ? f(p) : p)) };
}

function portsWarn(fit: Fit): boolean {
  return fit.problems.some(
    (p) => p.kind === "compat" && (p.code === "no-charging" || p.code === "port-side" || p.code === "overlap"),
  );
}

function partWarn(build: Build, fit: Fit, cat: Category): boolean {
  const bp = build.parts[cat]?.[0];
  if (!bp) return cat !== "webcam";
  return fit.problems.some((p) => (p.kind === "year" && p.ref === bp.part) || (p.kind === "compat" && "part" in p && p.part === bp.part));
}

function Centred() {
  return (
    <div className="bd-centred">
      <i />
      Centred
    </div>
  );
}

export function SurfaceColumn({
  build,
  fit,
  set,
  item,
  onItem,
  port,
  onPort,
}: StageProps & { item: SurfaceItem; onItem: (i: SurfaceItem) => void; port: number; onPort: (i: number) => void }) {
  const items: [SurfaceItem, string, boolean][] = [
    ["keyboard", "Keyboard", partWarn(build, fit, "keyboard")],
    ["trackpad", "Trackpad", partWarn(build, fit, "trackpad")],
    ["webcam", "Webcam", partWarn(build, fit, "webcam")],
    ["display", "Display", fit.problems.some((p) => p.kind === "compat" && p.code === "bezel-fit")],
    ["ports", "Ports", portsWarn(fit)],
  ];
  const rep = fit.place;
  return (
    <>
      <div className="bd-slots big">
        {items.map(([k, name, warn]) => (
          <button
            type="button"
            key={k}
            className={["bd-row-item", k === item ? "on" : "", warn ? "warn" : ""].join(" ")}
            onClick={() => onItem(k)}
          >
            {name}
            {k === "ports" && <small>{build.ports.length}</small>}
          </button>
        ))}
      </div>
      <div key={item} className="bd-surface-detail fd-in">
        {item === "keyboard" && (
          <>
            {rep.kb && (
              <Line label="From hinge">
                <Value v={r1(rep.kb.y)} unit="mm" />
              </Line>
            )}
            {rep.kb && <Centred />}
            <PartChips cat="keyboard" build={build} set={set} />
            <OptionChips cat="keyboard" build={build} set={set} />
          </>
        )}
        {item === "trackpad" && (
          <>
            <PartChips cat="trackpad" build={build} set={set} />
            {rep.pad && (
          <>
            <SliderField
              label="Width"
              value={rep.pad.w}
              unit="mm"
              min={rep.pad.w0[0]}
              max={rep.pad.w0[1]}
              onChange={(v) => set((b) => setPlace(b, (p) => ({ ...p, pad: { ...p.pad, w: v } })))}
            />
            <SliderField
              label="Depth"
              value={rep.pad.d}
              unit="mm"
              min={rep.pad.d0[0]}
              max={rep.pad.d0[1]}
              onChange={(v) => set((b) => setPlace(b, (p) => ({ ...p, pad: { ...p.pad, d: v } })))}
            />
            <Line label="From keyboard">
              <Value v={r1(rep.pad.y)} unit="mm" />
            </Line>
            <Centred />
          </>
            )}
            <OptionChips cat="trackpad" build={build} set={set} />
          </>
        )}
        {item === "webcam" && (
          <>
            {rep.cam && (
              <Line label="From centre">
                <Value v={r1(rep.cam.x)} unit="mm" />
              </Line>
            )}
            <PartChips cat="webcam" build={build} set={set} />
            <OptionChips cat="webcam" build={build} set={set} />
          </>
        )}
        {item === "display" && rep.panel && (
          <>
            <Line label="From top">
              <Value v={r1(rep.panel.y)} unit="mm" />
            </Line>
            <Centred />
          </>
        )}
        {item === "ports" && <PortDetail build={build} fit={fit} set={set} port={port} onPort={onPort} />}
        {fit.problems
          .filter(
            (p) =>
              p.kind === "compat" &&
              (p.code === "overlap" ||
                p.code === "bezel-fit" ||
                (item === "ports" && (p.code === "no-charging" || p.code === "port-side"))),
          )
          .map((p) => (
            <span key={problemText(p)} className="bd-note">
              {problemText(p)}
            </span>
          ))}
      </div>
    </>
  );
}

function PortDetail({ build, fit, set, port, onPort }: { build: Build; fit: Fit; set: SetBuild; port: number; onPort: (i: number) => void }) {
  const layout = CONTENT.layouts.find((l) => l.id === build.layout);
  const sides = layout?.portSides ?? [];
  const bp = build.ports[port];
  const rep = fit.place.ports[port];
  const part = bp && CONTENT.parts.find((p) => p.id === bp.part);
  // Gap to the next port along the same wall, edge to edge.
  let gap: number | null = null;
  if (bp && rep) {
    const me = fit.boxes.find((b) => b.id === rep.box);
    const e = bp.side === "left" || bp.side === "right" ? "y" : "x";
    if (me) {
      const others = build.ports
        .map((p, i) => ({ p, r: fit.place.ports[i], i }))
        .filter((o) => o.i !== port && o.p.side === bp.side && o.r)
        .map((o) => fit.boxes.find((b) => b.id === o.r?.box))
        .filter((b): b is Box => !!b);
      const after = others.filter((b) => b.at[e] >= me.at[e] + me.size[e] - 0.01);
      if (after.length > 0) gap = Math.min(...after.map((b) => b.at[e] - (me.at[e] + me.size[e])));
    }
  }
  // Walls the layout offers, then any wall a port sits on that it no longer does.
  const walls = [...sides, ...build.ports.map((p) => p.side).filter((s) => !sides.includes(s))].filter(
    (s, i, a) => a.indexOf(s) === i,
  );
  // The player picks a wall first, then configures the ports on it.
  const [wall, setWall] = useState<Side>(bp?.side ?? sides[0] ?? "left");
  useEffect(() => {
    if (bp && bp.side !== wall) setWall(bp.side);
  }, [bp?.side]);
  const onWall = build.ports.map((p, i) => ({ p, i })).filter((x) => x.p.side === wall);
  const pickWall = (w: Side) => {
    setWall(w);
    const first = build.ports.findIndex((p) => p.side === w);
    onPort(first >= 0 ? first : -1);
  };
  const add = (id: string) => {
    set((b) => ({ ...b, ports: [...b.ports, { part: id, side: wall }] }));
    onPort(build.ports.length);
  };
  const shown = bp && bp.side === wall;
  return (
    <>
      <Chips>
        {walls.map((w) => (
          <Chip caps key={w} on={w === wall} onClick={() => pickWall(w)}>
            {SIDE_NAME[w]}
          </Chip>
        ))}
      </Chips>
      <div className="bd-port-walls">
        <div className="bd-port-wall">
          {onWall.map(({ p, i }) => (
            <button
              type="button"
              key={`${p.part}-${i}`}
              className={["bd-port-item", i === port ? "on" : ""].join(" ")}
              onClick={() => onPort(i)}
            >
              <b className="bd-port-icon">
                <i className={`bd-port-shape ${portShape(p.part)}`} />
              </b>
              <span>{CONTENT.parts.find((x) => x.id === p.part)?.name ?? p.part}</span>
            </button>
          ))}
        </div>
      </div>
      <Dropdown label="Add port" value={null} placeholder="Add port" options={portOptions(build)} onChange={add} />
      {shown && bp && part && (
        <>
          <div className="bd-port-head">
            <b>{part.name}</b>
          </div>
          {rep && (
            <>
              <Line label={bp.side === "left" || bp.side === "right" ? "From rear" : "From left"}>
                <Value v={r1(rep.along)} unit="mm" />
              </Line>
              {gap !== null && (
                <Line label="Gap to next">
                  <Value v={r1(gap)} unit="mm" />
                </Line>
              )}
              <Line label="From bottom">
                <span className="bd-value">
                  {r1(rep.height)} mm
                  {rep.heightRange && (
                    <small>
                      {" "}
                      of {r1(rep.heightRange[0])} to {r1(rep.heightRange[1])}
                    </small>
                  )}
                </span>
              </Line>
            </>
          )}
          <div className="bd-chips">
            <Chip
              caps
              onClick={() => {
                set((b) => ({ ...b, ports: [...b.ports, { part: bp.part, side: bp.side }] }));
                onPort(build.ports.length);
              }}
            >
              Duplicate
            </Chip>
            <button
              type="button"
              className="fd-text bd-remove"
              onClick={() => {
                set((b) => ({ ...b, ports: b.ports.filter((_, j) => j !== port) }));
                onPort(Math.max(0, port - 1));
              }}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </>
  );
}



const GROUP_NAME: [PortGroup, string][] = [
  ["power", "Power"],
  ["usb", "USB"],
  ["video", "Video"],
  ["network", "Network"],
  ["cards", "Cards"],
  ["audio", "Audio"],
  ["other", "Other"],
];

/** The year's ports for the Add port dropdown, grouped, each with how many the laptop has. */
function portOptions(build: Build): DropOption[] {
  const list = partsFor("port", build.year);
  return GROUP_NAME.flatMap(([g, name]) =>
    list
      .filter((p) => p.shape.kind === "port" && p.shape.group === g)
      .map((p) => {
        const n = build.ports.filter((x) => x.part === p.id).length;
        return { key: p.id, label: p.name, group: name, aside: n > 0 ? `${n} fitted` : undefined };
      }),
  );
}

const PART_LABEL: Partial<Record<Category, string>> = { keyboard: "Travel", trackpad: "Size", webcam: "Camera" };

/** The part itself: chips for a short list, a dropdown for a long one. */
function PartChips({ cat, build, set }: { cat: Category; build: Build; set: SetBuild }) {
  const current = build.parts[cat]?.[0]?.part ?? "";
  const list = partsFor(cat, build.year);
  const choices: { id: string; name: string; price?: number }[] = [
    ...(cat === "webcam" ? [{ id: "", name: "None" }] : []),
    ...list.map((p) => ({ id: p.id, name: shortName(cat, p), price: partPrice(cat, { part: p.id }, build.year) })),
  ];
  const pick = (id: string) => set((b) => withPart(b, cat, 0, id));
  if (choices.length > 4)
    return (
      <div className="bd-line">
        <Label>{PART_LABEL[cat]}</Label>
        <Dropdown
          label={PART_LABEL[cat] ?? cat}
          value={current}
          options={choices.map((c) => ({ key: c.id, label: c.name, aside: c.price === undefined ? undefined : money(c.price) }))}
          onChange={pick}
        />
      </div>
    );
  return (
    <div className="bd-field">
      <Label>{PART_LABEL[cat]}</Label>
      <Chips>
        {choices.map((c) => (
          <Chip key={c.id || "none"} on={c.id === current} title={c.price === undefined ? undefined : money(c.price)} onClick={() => pick(c.id)}>
            {c.name}
          </Chip>
        ))}
      </Chips>
    </div>
  );
}

function shortName(cat: Category, p: Part): string {
  if (cat === "keyboard") return p.name.replace(/ travel$/, "").replace("Low-profile mechanical, ", "Mech ");
  return p.name;
}

// ------------------------------------------------------------------ 3D

type V3 = [number, number, number];

/** The first fit problem that names this part, for feedback on the 3D handles. */
function partProblem(fit: Fit, part: string | undefined, codes: string[]): Problem | undefined {
  if (!part) return undefined;
  return fit.problems.find((p) => p.kind === "compat" && codes.includes(p.code) && (p as { part?: string }).part === part);
}

/** A short warning floating beside a handle. */
function HandleNote({ at, problem }: { at: V3; problem?: Problem }) {
  if (!problem) return null;
  return (
    <Html position={at} center={false} style={{ pointerEvents: "none" }}>
      <span className="bd-3d-note">{problemText(problem)}</span>
    </Html>
  );
}

/** Outline, centre line and arrows for the selected surface item, in the base's engine space. */
export function SurfaceMarks({
  build,
  fit,
  set,
  item,
  port,
  locked,
}: {
  build: Build;
  fit: Fit;
  set: SetBuild;
  item: SurfaceItem;
  port: number;
  locked: boolean;
}) {
  const o = fit.shell.outer;
  const top = o.z + 2;
  const rep = fit.place;
  if (item === "keyboard" || item === "trackpad") {
    const b = fit.boxes.find((x) => x.kind === "unit" && x.role === (item === "keyboard" ? "keys" : "pad"));
    if (!b) return null;
    const m = item === "keyboard" ? 2.5 : 2;
    const x0 = b.at.x - m;
    const x1 = b.at.x + b.size.x + m;
    const y0 = b.at.y - m;
    const y1 = b.at.y + b.size.y + m;
    const corners: V3[] = [
      [x0, y0, top],
      [x1, y0, top],
      [x1, y1, top],
      [x0, y1, top],
    ];
    const kb = item === "keyboard";
    const r = kb ? rep.kb : rep.pad;
    const bad = partProblem(fit, b.part, ["overlap", "no-room"]);
    return (
      <group>
        <Outline corners={corners} warn={!!bad} />
        <HandleNote at={[x1 + 4, y1, top]} problem={bad} />
        {!kb && rep.pad && <PadHandles corners={corners} pad={rep.pad} set={set} locked={locked} />}
        <Dashed a={[o.x / 2, 4, top]} b={[o.x / 2, o.y - 4, top]} />
        {r && (
          <DragArrow
            at={[x1 + 12, (y0 + y1) / 2, top]}
            dir={[0, -1, 0]}
            reach={20}
            value={kb ? (rep.kb?.y ?? 0) : (rep.pad?.y ?? 0)}
            range={kb ? (rep.kb?.range ?? [0, 0]) : (rep.pad?.range ?? [0, 0])}
            disabled={locked}
            warn={!!bad}
            onChange={(v) =>
              set((bd) =>
                setPlace(bd, (p) => (kb ? { ...p, kb: { y: v } } : { ...p, pad: { ...p.pad, y: v } })),
              )
            }
          />
        )}
      </group>
    );
  }
  if (item !== "ports") return null;
  const bp = build.ports[port];
  const pr = rep.ports[port];
  const b = pr && fit.boxes.find((x) => x.id === pr.box);
  if (!bp || !pr || !b) return null;
  const side = bp.side;
  const pad = 1.6;
  const cz = b.at.z + b.size.z / 2;
  let corners: V3[];
  let at: V3;
  let alongDir: V3;
  if (side === "left" || side === "right") {
    const x = side === "left" ? -0.8 : o.x + 0.8;
    const ya = b.at.y - pad;
    const yb = b.at.y + b.size.y + pad;
    corners = [
      [x, ya, b.at.z - pad],
      [x, yb, b.at.z - pad],
      [x, yb, b.at.z + b.size.z + pad],
      [x, ya, b.at.z + b.size.z + pad],
    ];
    at = [side === "left" ? -3 : o.x + 3, b.at.y + b.size.y / 2, cz];
    alongDir = [0, -1, 0];
  } else {
    const y = side === "front" ? -0.8 : o.y + 0.8;
    const xa = b.at.x - pad;
    const xb = b.at.x + b.size.x + pad;
    corners = [
      [xa, y, b.at.z - pad],
      [xb, y, b.at.z - pad],
      [xb, y, b.at.z + b.size.z + pad],
      [xa, y, b.at.z + b.size.z + pad],
    ];
    at = [b.at.x + b.size.x / 2, side === "front" ? -3 : o.y + 3, cz];
    alongDir = [1, 0, 0];
  }
  // Snap to the wall's middle and to the other ports on this wall.
  const peers = build.ports
    .map((p, i) => ({ p, r: rep.ports[i], i }))
    .filter((x) => x.i !== port && x.p.side === side && x.r);
  const alongSnaps = [(pr.alongRange[0] + pr.alongRange[1]) / 2, ...peers.map((x) => x.r?.along ?? 0)];
  const hSnaps = pr.heightRange ? [(pr.heightRange[0] + pr.heightRange[1]) / 2, ...peers.map((x) => x.r?.height ?? 0)] : [];
  const bad = partProblem(fit, bp.part, ["overlap", "port-side", "no-room"]);
  return (
    <group>
      <Outline corners={corners} warn={!!bad} />
      <HandleNote at={corners[2]} problem={bad} />
      <DragArrow
        at={at}
        dir={alongDir}
        reach={22}
        value={pr.along}
        range={pr.alongRange}
        snaps={alongSnaps}
        disabled={locked}
        warn={!!bad}
        onChange={(v) => set((bd) => setPort(bd, port, (p) => ({ ...p, along: v })))}
      />
      {pr.heightRange && (
        <DragArrow
          at={at}
          dir={[0, 0, 1]}
          reach={15}
          value={pr.height}
          range={pr.heightRange}
          snaps={hSnaps}
          disabled={locked}
          warn={!!bad}
          onChange={(v) => set((bd) => setPort(bd, port, (p) => ({ ...p, height: v })))}
        />
      )}
    </group>
  );
}

type PadRep = NonNullable<Fit["place"]["pad"]>;

/**
 * The trackpad's corner squares. A corner drag resizes it about the centre
 * line, so width grows on both sides; the front corners move the front edge
 * and the rear corners the rear edge, the front edge staying where it is.
 */
function PadHandles({ corners, pad, set, locked }: { corners: V3[]; pad: PadRep; set: SetBuild; locked: boolean }) {
  const start = useRef({ w: pad.w, d: pad.d, y: pad.y });
  const clampTo = (v: number, [lo, hi]: [number, number]) => Math.round(Math.min(hi, Math.max(lo, v)));
  return (
    <>
      {corners.map((c, i) => {
        const sx = i === 1 || i === 2 ? 1 : -1;
        const rear = i >= 2;
        return (
          <CornerHandle
            key={i}
            at={c}
            disabled={locked}
            onStart={() => {
              start.current = { w: pad.w, d: pad.d, y: pad.y };
            }}
            onDrag={(dx, dy) => {
              const s0 = start.current;
              const w = clampTo(s0.w + 2 * sx * dx, pad.w0);
              const d = clampTo(s0.d + (rear ? dy : -dy), pad.d0);
              const y = rear ? Math.max(pad.range[0], s0.y - (d - s0.d)) : s0.y;
              set((b) => setPlace(b, (p) => ({ ...p, pad: { ...p.pad, w, d, ...(rear ? { y } : {}) } })));
            }}
          />
        );
      })}
    </>
  );
}

/** The webcam's outline and arrow, in the lid's engine space (closed; the screen faces down). */
export function WebcamMarks({ fit, set, locked }: { fit: Fit; set: SetBuild; locked: boolean }) {
  const cam = fit.boxes.find((b) => b.kind === "unit" && b.role === "webcam");
  const r = fit.place.cam;
  if (!cam || !r) return null;
  const z = cam.at.z - 0.6;
  const cx = cam.at.x + cam.size.x / 2;
  const cy = cam.at.y + cam.size.y / 2;
  const w = Math.max(7, cam.size.x / 2 + 2);
  const h = Math.max(4, cam.size.y / 2 + 1.5);
  const o = fit.shell.outer;
  return (
    <group>
      <Outline
        corners={[
          [cx - w, cy - h, z],
          [cx + w, cy - h, z],
          [cx + w, cy + h, z],
          [cx - w, cy + h, z],
        ]}
      />
      <Dashed a={[4, cy, z]} b={[o.x - 4, cy, z]} />
      <DragArrow
        at={[cx, cy, z - 2.5]}
        dir={[1, 0, 0]}
        reach={24}
        value={r.x}
        range={r.range}
        snaps={[0]}
        disabled={locked}
        onChange={(v) => set((b) => setPlace(b, (p) => ({ ...p, cam: { x: v } })))}
      />
    </group>
  );
}

/** The display panel's outline and up-down arrow, in the lid's engine space (closed; the screen faces down). */
export function DisplayMarks({ fit, set, locked }: { fit: Fit; set: SetBuild; locked: boolean }) {
  const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
  const r = fit.place.panel;
  if (!panel || !r) return null;
  const z = fit.shell.lid.at.z - 0.6;
  const m = 2;
  const x0 = panel.at.x - m;
  const x1 = panel.at.x + panel.size.x + m;
  const y0 = panel.at.y - m;
  const y1 = panel.at.y + panel.size.y + m;
  const o = fit.shell.outer;
  const cy = (y0 + y1) / 2;
  return (
    <group>
      <Outline
        corners={[
          [x0, y0, z],
          [x1, y0, z],
          [x1, y1, z],
          [x0, y1, z],
        ]}
      />
      <Dashed a={[o.x / 2, 4, z]} b={[o.x / 2, o.y - 4, z]} />
      {/* The top bezel grows toward the hinge, which is +y in the closed lid. */}
      <DragArrow
        at={[o.x / 2, cy, z - 2.5]}
        dir={[0, 1, 0]}
        reach={30}
        value={r.y}
        range={r.range}
        disabled={locked}
        onChange={(v) => set((b) => setPlace(b, (p) => ({ ...p, panel: { y: v } })))}
      />
    </group>
  );
}
