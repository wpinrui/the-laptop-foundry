import { Fragment, useCallback, useMemo, useState } from "react";
import {
  available,
  type Axis,
  type Build,
  CONTENT,
  type Category,
  compactable,
  costOf,
  eraFor,
  factsOf,
  type Fit,
  type PartPin,
  partsFor,
  profilesOf,
  rivalsFor,
  rivalSubject,
  type PerimSides,
  type Signature,
  solve,
  perimBand,
  perimZones,
  SIDE_RANGE,
  taperDepth,
  YEARS,
} from "../engine";
import { insideLitres, Silhouette, silhouetteExtent } from "./bodyShape";
import { useMarket } from "../market/markets";
import { BatteryFields } from "./BatteryFields";
import { FanField, GrillField } from "./FanField";
import { SpeakerGrillField } from "./SpeakerGrillField";
import { QualityField, type SetBuild, type Slot, Options, SlotList } from "./Parts";
import { Power } from "./Power";
import { problemText } from "./problems";
import { toBody, toYear } from "./structure";
import { useSettled } from "../viewer/stable";
import {
  Card,
  Chip,
  Chips,
  FitButton,
  Label,
  Line,
  SliderField,
  Slider,
  money,
  Toggle,
  Value,
} from "./ui";

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

/** `only` locks the pick to one year, as in a campaign. */
export function YearColumn({ build, set, only }: StageProps & { only?: number }) {
  return (
    <div className="bd-years">
      {(only === undefined ? YEARS : [only]).map((y) => (
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

const AXIS_NAME: Record<Axis, string> = {
  x: "Width",
  y: "Depth",
  z: "Thickness",
};
/** What each body's signature slider moves. */
const SIGNATURE_NAME: Record<Signature, string> = {
  corner: "Corners",
  profile: "Roundness",
  drop: "Spine",
  bumper: "Bumpers",
  taper: "Taper",
  undercut: "Undercut",
  shelf: "Shelf",
  lip: "Lift",
  slant: "End slant",
  round: "End radius",
  wrap: "Taper",
  edge: "Base radius",
  facet: "Facet",
};
/** The per-side inset sliders of a body whose sides the player sets. */
const SIDE_FIELDS: [keyof PerimSides, string][] = [
  ["f", "Front"],
  ["s", "Sides"],
  ["r", "Rear"],
];
const AXIS_STEP: Record<Axis, number> = { x: 0.5, y: 0.5, z: 0.1 };
const tenth = (v: number) => Math.round(v * 10) / 10;
const snap = (v: number, lo: number, step: number) =>
  tenth(lo + Math.round((v - lo) / step) * step);

/** The smallest value on the slider's grid at or over `need`. Null when even the largest size is short. */
function fitMinimum(
  need: number,
  lo: number,
  hi: number,
  step: number,
): number | null {
  let v = tenth(lo + Math.ceil((need - lo) / step - 1e-9) * step);
  if (v < need) v = tenth(v + step);
  v = Math.max(lo, v);
  return v <= hi ? v : null;
}

/**
 * The build with this axis at the smallest size that fits. The body's shape
 * follows its size, so the minimum moves a little with it: sized until it holds.
 */
function fitAxis(b: Build, a: Axis, lo: number, hi: number): Build {
  let out = b;
  for (let i = 0; i < 4; i++) {
    const v = fitMinimum(solve(out).min[a], lo, hi, AXIS_STEP[a]);
    if (v === null || v === out.size[a]) break;
    out = { ...out, size: { ...out.size, [a]: v } };
  }
  return out;
}

/** The Chassis stage's look-ahead: a body the pointer is on, or the section view while the signature slider is held. */
export interface ChassisPreview {
  body?: string;
  section?: boolean;
}

export function ChassisColumn({
  build,
  fit,
  set,
  onPreview,
}: StageProps & { onPreview?: (p: ChassisPreview) => void }) {
  const [lock, setLock] = useState(false);
  const body = CONTENT.bodies.find((b) => b.id === build.body);
  const layouts = CONTENT.layouts.filter(
    (l) => available(l, build.year) && body?.layouts.includes(l.id),
  );
  const geo = fit.problems.filter((p) => p.kind === "geometry");
  const style = fit.shell.style;
  const litres = useMemo(() => insideLitres(fit), [fit]);
  const setSize = (axis: Axis, v: number) =>
    set((b) => {
      if (!body) return b;
      if (!lock || b.size[axis] <= 0)
        return { ...b, size: { ...b.size, [axis]: v } };
      const k = v / b.size[axis];
      const size = { ...b.size };
      for (const a of ["x", "y", "z"] as Axis[]) {
        const [l, h] = body.limits[a];
        size[a] =
          a === axis
            ? v
            : Math.min(h, Math.max(l, snap(b.size[a] * k, l, AXIS_STEP[a])));
      }
      return { ...b, size };
    });
  const Z = fit.shell.outer.z;
  // The thinnest edge: the taper's front, or a perimeter body's edge band.
  const taper = style.pm ? perimBand(style.pm, Z)[0] : taperDepth(style, Z);
  const section = useCallback((on: boolean) => onPreview?.({ section: on }), [onPreview]);
  return (
    <>
      {body &&
        (["x", "y", "z"] as Axis[]).map((a) => {
          const [lo, hi] = body.limits[a];
          const problem = geo.find((p) => p.axis === a);
          const short = geo.some((p) => p.axis === a && p.code === "short");
          const fitTo = fitMinimum(fit.min[a], lo, hi, AXIS_STEP[a]);
          return (
            <Fragment key={a}>
              <SliderField
                label={AXIS_NAME[a]}
                value={fit.shell.outer[a]}
                unit="mm"
                digits={a === "z" ? 1 : 0}
                shown={a === "z" && taper > 0 ? `${(Z - taper).toFixed(1)}–${Z.toFixed(1)}` : undefined}
                min={lo}
                max={hi}
                step={AXIS_STEP[a]}
                mark={fit.min[a]}
                warn={!!problem}
                note={problem ? problemText(problem) : undefined}
                action={
                  fitTo !== null && (
                    <FitButton
                      warn={short}
                      title={`Smallest ${AXIS_NAME[a].toLowerCase()} that fits, ${fitTo.toFixed(fitTo % 1 ? 1 : 0)} mm`}
                      onClick={() => set((b) => fitAxis(b, a, lo, hi))}
                    />
                  )
                }
                onChange={(v) => setSize(a, v)}
              />
              {a === "z" && (
                <SliderField
                  label={SIGNATURE_NAME[style.signature]}
                  value={Math.round(style.sig * 100)}
                  shown={style.sigMm.toFixed(1)}
                  unit="mm"
                  min={0}
                  max={100}
                  onHover={section}
                  onChange={(v) =>
                    set((b) => ({ ...b, shape: { ...b.shape, [b.body]: v / 100 } }))
                  }
                />
              )}
              {a === "z" &&
                style.pm?.tune &&
                SIDE_FIELDS.map(([k, name]) => {
                  const pm = style.pm;
                  if (!pm) return null;
                  return (
                    <SliderField
                      key={k}
                      label={name}
                      value={Math.round(pm.m[k] * 100)}
                      shown={perimZones(pm, pm.m[k]).dB.toFixed(1)}
                      unit="mm"
                      min={SIDE_RANGE[0] * 100}
                      max={SIDE_RANGE[1] * 100}
                      onHover={section}
                      onChange={(v) =>
                        set((b) => ({
                          ...b,
                          sides: { ...b.sides, [b.body]: { ...b.sides?.[b.body], [k]: v / 100 } },
                        }))
                      }
                    />
                  );
                })}
              {a === "z" && body.style.taper?.curve && (
                <div className="bd-field">
                  <Label>Underside</Label>
                  <Chips>
                    {[false, true].map((c) => (
                      <Chip
                        key={String(c)}
                        on={!!build.curve?.[body.id] === c}
                        onClick={() => set((b) => ({ ...b, curve: { ...b.curve, [b.body]: c } }))}
                      >
                        {c ? "Curved" : "Flat"}
                      </Chip>
                    ))}
                  </Chips>
                </div>
              )}
            </Fragment>
          );
        })}
      <Line label="Inside">
        <Value v={litres.toFixed(2)} unit="L" />
      </Line>
      <Chips>
        <Toggle on={lock} onClick={() => setLock(!lock)}>
          Keep proportions
        </Toggle>
      </Chips>
      <div className="bd-field">
        <Label>Layout</Label>
        <Chips>
          {layouts.map((l) => (
            <Chip
              caps
              key={l.id}
              on={l.id === build.layout}
              onClick={() => set((b) => ({ ...b, layout: l.id }))}
            >
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
        onChange={(v) =>
          set((b) => ({ ...b, spend: { ...b.spend, packing: v / 100 } }))
        }
      />
      <SliderField
        label="Material spend"
        value={Math.round((build.spend.material ?? 0) * 100)}
        unit="%"
        min={0}
        max={100}
        onChange={(v) =>
          set((b) => ({ ...b, spend: { ...b.spend, material: v / 100 } }))
        }
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
          onChange={(v) =>
            set((b) =>
              b.screen ? { ...b, screen: { ...b.screen, bezel: v } } : b,
            )
          }
        />
      )}
    </>
  );
}

/** Card silhouettes: one scale for all, the height stretched up to twice so thin bodies read. */
const SIL_W = 140;
const SIL_H = 30;

export function ChassisTray({
  build,
  set,
  onPreview,
}: StageProps & { onPreview?: (p: ChassisPreview) => void }) {
  const bodies = useMemo(
    () => CONTENT.bodies.filter((b) => available(b, build.year) || b.id === build.body),
    [build.year, build.body],
  );
  // Each body solved with this build: its shape at this size, and how far it
  // would come up short. A solve per body is too much for every step of a
  // drag, so the cards follow once the build holds still.
  const settled = useSettled(build);
  const fits = useMemo(
    () =>
      bodies.map((b) => {
        try {
          return solve(toBody(settled, b.id));
        } catch {
          return null;
        }
      }),
    [settled, bodies],
  );
  const ext = fits.map((f) => (f ? silhouetteExtent(f) : null));
  const deep = Math.max(1, ...ext.map((e) => e?.y ?? 0));
  const tall = Math.max(1, ...ext.map((e) => (e ? e.top - e.bottom : 0)));
  const k = SIL_W / deep;
  const vx = Math.min(2, SIL_H / (tall * k));
  return (
    <>
      {bodies.map((b, i) => {
        const f = fits[i];
        const short = f
          ? Math.max(0, ...f.problems.map((p) => (p.kind === "geometry" && p.code === "short" ? p.by : 0)))
          : 0;
        return (
          <Card
            key={b.id}
            width={196}
            on={b.id === build.body}
            off={!available(b, build.year)}
            top={f && <Silhouette fit={f} k={k} vx={vx} w={SIL_W + 4} h={SIL_H + 2} on={b.id === build.body} />}
            name={b.name}
            aside={short > 0.05 ? <Value v={`+${short.toFixed(1)}`} unit="mm" warn /> : undefined}
            onHover={(on) => onPreview?.({ body: on ? b.id : undefined })}
            onClick={() => {
              onPreview?.({});
              set((x) => toBody(x, b.id));
            }}
          />
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ inside

export function insideSlots(build: Build): Slot[] {
  const year = build.year;
  const s = (
    cat: Category,
    name: string,
    optional = false,
    index = 0,
  ): Slot => ({
    key: index ? `${cat}:${index}` : cat,
    name,
    cat,
    index,
    optional,
  });
  const out: Slot[] = [
    s("processor", "Processor"),
    s("graphics", "Graphics", true),
    s("memory", "Memory"),
    s("storage", "Storage"),
  ];
  if ((build.parts.storage?.length ?? 0) >= 1)
    out.push(s("storage", "Second drive", true, 1));
  out.push(s("battery", "Battery"));
  if (partsFor("hotswap", year).length > 0 || build.parts.hotswap)
    out.push(s("hotswap", "Swap bay", true));
  out.push(s("cooling", "Cooling"));
  if (partsFor("optical", year).length > 0 || build.parts.optical)
    out.push(s("optical", "Optical", true));
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

function PowerLimit({
  build,
  set,
  cat,
}: {
  build: Build;
  set: SetBuild;
  cat: "processor" | "graphics";
}) {
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
              power: {
                ...all,
                high: {
                  ...h,
                  [chip]: { sustained: v, boost: Math.max(h[chip].boost, v) },
                },
              },
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

/** Pin one field of a movable part's place, or give it back to auto with undefined. */
function withPin<K extends keyof PartPin>(
  b: Build,
  key: string,
  field: K,
  v: PartPin[K] | undefined,
): Build {
  const all = { ...b.place?.parts };
  const pin: PartPin = { ...all[key] };
  if (v === undefined) delete pin[field];
  else pin[field] = v;
  if (Object.keys(pin).length > 0) all[key] = pin;
  else delete all[key];
  const place = { ...b.place };
  if (Object.keys(all).length > 0) place.parts = all;
  else delete place.parts;
  return { ...b, place };
}

/** Where a movable floor part sits and whether it is turned: auto, or pinned by the player. */
function PlaceChips({
  build,
  fit,
  set,
  slotKey,
}: {
  build: Build;
  fit: Fit;
  set: SetBuild;
  slotKey: string;
}) {
  const at = fit.place.parts?.[slotKey];
  if (!at) return null;
  const pin = build.place?.parts?.[slotKey] ?? {};
  return (
    <>
      {at.zones.length > 1 && (
        <div className="bd-field">
          <Label>Place</Label>
          <Chips>
            <Chip
              caps
              on={pin.zone === undefined}
              onClick={() => set((b) => withPin(b, slotKey, "zone", undefined))}
            >
              Auto
            </Chip>
            {at.zones.map((z) => (
              <Chip
                key={z.id}
                on={pin.zone === z.id}
                onClick={() => set((b) => withPin(b, slotKey, "zone", z.id))}
              >
                {z.name}
              </Chip>
            ))}
          </Chips>
        </div>
      )}
      {at.turns && (
        <div className="bd-field">
          <Label>Turn</Label>
          <Chips>
            <Chip
              caps
              on={typeof pin.turn !== "boolean"}
              onClick={() => set((b) => withPin(b, slotKey, "turn", undefined))}
            >
              Auto
            </Chip>
            <Chip
              on={pin.turn === false}
              onClick={() => set((b) => withPin(b, slotKey, "turn", false))}
            >
              0°
            </Chip>
            <Chip
              on={pin.turn === true}
              onClick={() => set((b) => withPin(b, slotKey, "turn", true))}
            >
              90°
            </Chip>
          </Chips>
        </div>
      )}
      {at.rows && (
        <div className="bd-field">
          <Label>Arrange</Label>
          <Chips>
            <Chip
              caps
              on={pin.row === undefined}
              onClick={() => set((b) => withPin(b, slotKey, "row", undefined))}
            >
              Auto
            </Chip>
            {(
              [
                ["bunch", "Bunch"],
                ["x", "Line across"],
                ["y", "Line along"],
              ] as const
            ).map(([r, label]) => (
              <Chip
                key={r}
                on={pin.row === r}
                onClick={() => set((b) => withPin(b, slotKey, "row", r))}
              >
                {label}
              </Chip>
            ))}
          </Chips>
        </div>
      )}
    </>
  );
}

export function InsideColumn({
  build,
  fit,
  set,
  slot,
  onSlot,
  onGrillView,
}: StageProps & { slot: string; onSlot: (key: string) => void; onGrillView?: (on: boolean) => void }) {
  const slots = insideSlots(build);
  const current = slots.find((s) => s.key === slot) ?? slots[0];
  const spend = build.spend[current.cat] ?? 0;
  const has = !!build.parts[current.cat]?.[current.index];
  // Standard form factors have nothing to compact.
  const squeezable = compactable(CONTENT.parts.find((p) => p.id === build.parts[current.cat]?.[0]?.part));
  return (
    <div className="bd-inside">
      <SlotList
        slots={slots}
        selected={current.key}
        onSelect={onSlot}
        warn={slotWarn(build, fit)}
      />
      <Options slot={current} build={build} fit={fit} set={set}>
        {has && current.cat === "battery" && current.index === 0 && (
          <BatteryFields build={build} fit={fit} set={set} />
        )}
        {has && current.cat === "cooling" && current.index === 0 && (
          <>
            <FanField build={build} fit={fit} set={set} />
            <GrillField build={build} fit={fit} set={set} />
          </>
        )}
        {has && current.cat === "speakers" && current.index === 0 && (
          <SpeakerGrillField build={build} fit={fit} set={set} onView={onGrillView} />
        )}
        {has && current.cat === "speakers" && current.index === 0 && <QualityField area="speakers" build={build} set={set} />}
        {has && current.index === 0 && squeezable && (
          <SliderField
            label="Compact"
            value={Math.round(spend * 100)}
            unit="%"
            min={0}
            max={100}
            onChange={(v) =>
              set((b) => ({
                ...b,
                spend: { ...b.spend, [current.cat]: v / 100 },
              }))
            }
          />
        )}
        {has && (
          <PlaceChips
            build={build}
            fit={fit}
            set={set}
            slotKey={`${current.cat}:${current.index}`}
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
  const opened = useMarket(build.year);
  const rivals = useMemo(() => {
    if (!priced || !opened) return [];
    return [...rivalsFor(build.year)]
      .sort(
        (a, b) =>
          Math.abs((a.build.price ?? 0) - price) -
          Math.abs((b.build.price ?? 0) - price),
      )
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        name: r.name,
        price: r.build.price ?? 0,
        kg: factsOf(rivalSubject(r)).kg,
      }));
  }, [priced, opened, build.year, price]);
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
          <button
            type="button"
            className="bd-reroll"
            aria-label="new name"
            title="New name"
            onClick={onReroll}
          >
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
            <button
              type="button"
              className="fd-secondary"
              onClick={onDuplicate}
            >
              Duplicate
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="fd-primary"
              disabled={!valid}
              onClick={onReview}
            >
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
