import { useMemo, useState } from "react";
import {
  available,
  type Axis,
  type Build,
  CONTENT,
  type Category,
  costOf,
  eraFor,
  factsOf,
  type Fit,
  partsFor,
  profilesOf,
  RIVALS,
  rivalSubject,
} from "../engine";
import { type SetBuild, type Slot, Options, SlotList } from "./Parts";
import { Power } from "./Power";
import { problemText } from "./problems";
import { toBody, toYear } from "./structure";
import { Card, Chip, Chips, Label, Line, SliderField, Slider, money, Toggle, Value } from "./ui";

// The left column of each builder stage, and the tray along the bottom where
// the stage has one. Every change goes through `set`, which does nothing on a
// locked model.

export interface StageProps {
  build: Build;
  fit: Fit;
  set: SetBuild;
  locked: boolean;
}

// ------------------------------------------------------------------ year

export const YEARS = [...new Set(CONTENT.eras.map((e) => e.year))];

export function YearColumn({ build, set }: StageProps) {
  return (
    <div className="bd-years">
      {YEARS.map((y) => (
        <button
          type="button"
          key={y}
          className={y === build.year ? "bd-year on" : "bd-year"}
          onClick={() => set((b) => toYear(b, y))}
        >
          {y}
          {y === build.year && <i />}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ chassis

const AXIS_NAME: Record<Axis, string> = { x: "Width", y: "Depth", z: "Thickness" };
const EDGE_NAME = { square: "Square edges", rounded: "Rounded edges", chamfer: "Chamfered edges" };
const HINGE_NAME = { full: "Full width", barrel: "Two barrels", drop: "Drop hinge" };

export function ChassisColumn({ build, fit, set }: StageProps) {
  const [lock, setLock] = useState(false);
  const body = CONTENT.bodies.find((b) => b.id === build.body);
  const layouts = CONTENT.layouts.filter((l) => available(l, build.year) && body?.layouts.includes(l.id));
  const geo = fit.problems.filter((p) => p.kind === "geometry");
  const setSize = (axis: Axis, v: number) =>
    set((b) => {
      if (!body) return b;
      if (!lock || b.size[axis] <= 0) return { ...b, size: { ...b.size, [axis]: v } };
      const k = v / b.size[axis];
      const size = { ...b.size };
      for (const a of ["x", "y", "z"] as Axis[]) {
        const [l, h] = body.limits[a];
        size[a] = a === axis ? v : Math.min(h, Math.max(l, Math.round((b.size[a] * k) / 0.5) * 0.5));
      }
      return { ...b, size };
    });
  return (
    <>
      {body &&
        (["x", "y", "z"] as Axis[]).map((a) => {
          const [lo, hi] = body.limits[a];
          const problem = geo.find((p) => p.axis === a);
          return (
            <SliderField
              key={a}
              label={AXIS_NAME[a]}
              value={fit.shell.outer[a]}
              unit="mm"
              digits={a === "z" ? 1 : 0}
              min={lo}
              max={hi}
              step={0.5}
              mark={fit.min[a]}
              warn={!!problem}
              note={problem ? problemText(problem) : undefined}
              onChange={(v) => setSize(a, v)}
            />
          );
        })}
      <Chips>
        <Toggle on={lock} onClick={() => setLock(!lock)}>
          Keep proportions
        </Toggle>
      </Chips>
      <div className="bd-field">
        <Label>Layout</Label>
        <Chips>
          {layouts.map((l) => (
            <Chip caps key={l.id} on={l.id === build.layout} onClick={() => set((b) => ({ ...b, layout: l.id }))}>
              {l.name}
            </Chip>
          ))}
        </Chips>
      </div>
      <SliderField
        label="Packing"
        value={Math.round((build.spend.packing ?? 0) * 100)}
        unit="%"
        min={0}
        max={100}
        onChange={(v) => set((b) => ({ ...b, spend: { ...b.spend, packing: v / 100 } }))}
      />
      <SliderField
        label="Material spend"
        value={Math.round((build.spend.material ?? 0) * 100)}
        unit="%"
        min={0}
        max={100}
        onChange={(v) => set((b) => ({ ...b, spend: { ...b.spend, material: v / 100 } }))}
      />
      {build.screen && (
        <SliderField
          label="Bezel"
          value={build.screen.bezel}
          unit="mm"
          digits={1}
          min={eraFor(build.year).bezel.side}
          max={20}
          step={0.5}
          onChange={(v) => set((b) => (b.screen ? { ...b, screen: { ...b.screen, bezel: v } } : b))}
        />
      )}
      {body && (
        <Line label="Hinge">
          <Value v={HINGE_NAME[body.style.hinge]} />
        </Line>
      )}
    </>
  );
}

export function ChassisTray({ build, set }: StageProps) {
  const bodies = CONTENT.bodies.filter((b) => available(b, build.year) || b.id === build.body);
  return (
    <>
      {bodies.map((b) => (
        <Card
          key={b.id}
          width={170}
          on={b.id === build.body}
          off={!available(b, build.year)}
          top={`${EDGE_NAME[b.style.edge]}${b.style.wedge ? "  wedge" : ""}`}
          name={b.name}
          onClick={() => set((x) => toBody(x, b.id))}
        />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ inside

export function insideSlots(build: Build): Slot[] {
  const year = build.year;
  const s = (cat: Category, name: string, optional = false, index = 0): Slot => ({
    key: index ? `${cat}:${index}` : cat,
    name,
    cat,
    index,
    optional,
  });
  const out: Slot[] = [s("processor", "Processor"), s("graphics", "Graphics", true), s("memory", "Memory"), s("storage", "Storage")];
  if ((build.parts.storage?.length ?? 0) >= 1) out.push(s("storage", "Second drive", true, 1));
  out.push(s("battery", "Battery"));
  if (partsFor("hotswap", year).length > 0 || build.parts.hotswap) out.push(s("hotswap", "Swap bay", true));
  out.push(s("cooling", "Cooling"));
  if (partsFor("optical", year).length > 0 || build.parts.optical) out.push(s("optical", "Optical", true));
  out.push(s("wireless", "Wireless", true), s("speakers", "Speakers"));
  return out;
}

/** A slot shows the warning colour when it is required and empty, or its part has a problem. */
export function slotWarn(build: Build, fit: Fit) {
  return (s: Slot) => {
    const bp = build.parts[s.cat]?.[s.index];
    if (!bp) return !s.optional;
    return fit.problems.some(
      (p) =>
        (p.kind === "year" && p.ref === bp.part) ||
        (p.kind === "compat" && "part" in p && p.part === bp.part) ||
        (p.kind === "compat" && p.code === "too-many" && p.category === s.cat),
    );
  };
}

function PowerLimit({ build, set, cat }: { build: Build; set: SetBuild; cat: "processor" | "graphics" }) {
  const [open, setOpen] = useState(false);
  const part = CONTENT.parts.find((p) => p.id === build.parts[cat]?.[0]?.part);
  if (!part?.power) return null;
  const chip = cat === "processor" ? "cpu" : "gpu";
  const high = profilesOf(build).high[chip];
  return (
    <div className="bd-power-limit">
      <SliderField
        label="Power limit"
        value={high.sustained}
        unit="W"
        min={part.power.range[0]}
        max={part.power.range[1]}
        step={1}
        onChange={(v) =>
          set((b) => {
            const all = b.power ?? profilesOf(b);
            const h = all.high;
            return {
              ...b,
              power: { ...all, high: { ...h, [chip]: { sustained: v, boost: Math.max(h[chip].boost, v) } } },
            };
          })
        }
      />
      <Chips>
        <Chip caps on={open} onClick={() => setOpen(!open)}>
          Profiles
        </Chip>
      </Chips>
      {open && <Power build={build} set={set} />}
    </div>
  );
}

export function InsideColumn({
  build,
  fit,
  set,
  slot,
  onSlot,
}: StageProps & { slot: string; onSlot: (key: string) => void }) {
  const slots = insideSlots(build);
  const current = slots.find((s) => s.key === slot) ?? slots[0];
  const spend = build.spend[current.cat] ?? 0;
  const has = !!build.parts[current.cat]?.[current.index];
  return (
    <div className="bd-inside">
      <SlotList slots={slots} selected={current.key} onSelect={onSlot} warn={slotWarn(build, fit)} />
      <Options slot={current} build={build} fit={fit} set={set}>
        {has && current.index === 0 && (
          <SliderField
            label="Compact"
            value={Math.round(spend * 100)}
            unit="%"
            min={0}
            max={100}
            onChange={(v) => set((b) => ({ ...b, spend: { ...b.spend, [current.cat]: v / 100 } }))}
          />
        )}
        {(current.cat === "processor" || current.cat === "graphics") && has && (
          <PowerLimit build={build} set={set} cat={current.cat} />
        )}
      </Options>
    </div>
  );
}

// ------------------------------------------------------------------ price

function snapPrice(v: number): number {
  if (v < 100) return Math.round(v);
  return Math.max(9, Math.round(v / 10) * 10 - 1);
}

export function PriceColumn({
  build,
  fit,
  set,
  locked,
  valid,
  name,
  onName,
  onReroll,
  onReview,
  onDuplicate,
}: StageProps & {
  valid: boolean;
  name: string;
  onName: (n: string) => void;
  onReroll: () => void;
  onReview: () => void;
  onDuplicate: () => void;
}) {
  // Price and cost work as soon as the parts are in, even while fit problems remain.
  const cost = useMemo(() => {
    try {
      return costOf(build, fit).total;
    } catch {
      return 0;
    }
  }, [build, fit]);
  const priced = cost > 0;
  const price = build.price ?? snapPrice(cost * 1.45);
  const rivals = useMemo(() => {
    if (!priced) return [];
    return RIVALS.filter((r) => r.build.year === build.year)
      .sort((a, b) => Math.abs((a.build.price ?? 0) - price) - Math.abs((b.build.price ?? 0) - price))
      .slice(0, 3)
      .map((r) => ({ id: r.id, name: r.name, price: r.build.price ?? 0, kg: factsOf(rivalSubject(r)).kg }));
  }, [priced, build.year, price]);
  const lo = Math.max(1, Math.round(cost * 0.5));
  const hi = Math.max(lo + 10, Math.round(cost * 3));
  const margin = price - cost;
  return (
    <div className="bd-price">
      <div className="bd-name-row">
        <input
          className="bd-name"
          value={name}
          aria-label="model name"
          readOnly={locked}
          onChange={(e) => onName(e.target.value)}
        />
        {!locked && (
          <button type="button" className="bd-reroll" aria-label="new name" title="New name" onClick={onReroll}>
            ↻
          </button>
        )}
      </div>
      {priced && (
        <>
          <div className="bd-price-block">
            <span className="bd-price-value">{money(price)}</span>
            <Slider
              label="retail price"
              value={price}
              min={lo}
              max={hi}
              step={1}
              mark={cost}
              disabled={locked}
              onChange={(v) => set((b) => ({ ...b, price: snapPrice(v) }))}
            />
            <div className="bd-price-line">
              <span>
                Cost <b>{money(cost)}</b>
              </span>
              <span>
                Margin <b>{money(margin)}</b>
              </span>
              <span>
                <b>{price > 0 ? Math.round((margin / price) * 100) : 0}</b> %
              </span>
            </div>
          </div>
          <div className="bd-rivals">
            {rivals.map((r) => (
              <div key={r.id} className="bd-rival">
                <b>{r.name}</b>
                <span>
                  {r.kg.toFixed(2)} kg <em>{money(r.price)}</em>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="bd-price-actions">
        {locked ? (
          <>
            <button type="button" className="fd-primary" onClick={onReview}>
              Read review
            </button>
            <button type="button" className="fd-secondary" onClick={onDuplicate}>
              Duplicate
            </button>
          </>
        ) : (
          <>
            <button type="button" className="fd-primary" disabled={!valid} onClick={onReview}>
              Get reviewed
            </button>
            {!valid &&
              fit.problems.slice(0, 3).map((p) => (
                <span key={problemText(p)} className="bd-note">
                  {problemText(p)}
                </span>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
