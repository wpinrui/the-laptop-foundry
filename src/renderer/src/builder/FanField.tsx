import {
  type Build,
  CONTENT,
  type Fit,
  fanRange,
  fanSizeOf,
  GRILL_MIN,
  GRILL_STYLES,
  type GrillStyle,
  grillOf,
  WRAP_MAX,
  WRAP_MIN,
  withFanSize,
  withGrill,
} from "../engine";
import type { SetBuild } from "./Parts";
import { Chip, Chips, Label, SliderField, Toggle } from "./ui";

// Fan size: a diameter slider for every fan, with Auto to hand it back to the fit.

export function FanField({
  build,
  fit,
  set,
}: {
  build: Build;
  fit: Fit;
  set: SetBuild;
}) {
  const part = CONTENT.parts.find(
    (p) => p.id === build.parts.cooling?.[0]?.part,
  );
  const shape =
    part && (Array.isArray(part.shape) ? part.shape[0] : part.shape);
  if (shape?.kind !== "fan" || shape.count === 0) return null;
  const manual = fanSizeOf(build);
  const fan = fit.boxes.find((b) => b.kind === "unit" && b.role === "fan");
  const shown =
    manual ??
    (fan ? Math.min(fan.size.x, fan.size.y) : fanRange(build.year)[0]);
  const [lo, hi] = fanRange(build.year);
  return (
    <SliderField
      label="Fan size"
      value={Math.round(shown)}
      unit="mm"
      min={lo}
      max={hi}
      step={1}
      action={
        <Chip
          caps
          on={manual === undefined}
          onClick={() => set((b) => withFanSize(b, undefined))}
        >
          Auto
        </Chip>
      }
      onChange={(v) => set((b) => withFanSize(b, v))}
    />
  );
}

const GRILL_NAMES: Record<GrillStyle, string> = {
  stock: "Stock",
  none: "None",
  uniform: "Uniform",
  bottom: "Uniform bottom",
};

// Fan grill: its style, then the height of a uniform one, and whether and at what angle it wraps under.

export function GrillField({
  build,
  fit,
  set,
}: {
  build: Build;
  fit: Fit;
  set: SetBuild;
}) {
  const gf = fit.shell.grill;
  if (!gf) return null;
  const g = grillOf(build);
  const flat = g.style === "uniform" || g.style === "bottom";
  const maxH = Math.max(GRILL_MIN, Math.floor(gf.maxH * 2) / 2);
  const wrap = g.style === "bottom" && g.wrap && gf.wrapOk;
  return (
    <>
      <div className="bd-field">
        <Label>Grill</Label>
        <Chips>
          {GRILL_STYLES.map((s) => (
            <Chip
              key={s}
              caps
              on={g.style === s}
              disabled={(s === "uniform" || s === "bottom") && !gf.faceOk}
              onClick={() => set((b) => withGrill(b, { style: s }))}
            >
              {GRILL_NAMES[s]}
            </Chip>
          ))}
        </Chips>
      </div>
      {flat && gf.faceOk && (
        <SliderField
          label="Grill height"
          value={Math.min(g.height, maxH)}
          digits={1}
          unit="mm"
          min={GRILL_MIN}
          max={maxH}
          step={0.5}
          onChange={(v) => set((b) => withGrill(b, { height: v }))}
        />
      )}
      {g.style === "bottom" && gf.faceOk && (
        <div className="bd-field">
          <Chips>
            <Toggle
              on={wrap}
              disabled={!gf.wrapOk}
              onClick={() =>
                set((b) => withGrill(b, { wrap: !grillOf(b).wrap }))
              }
            >
              Wrap under
            </Toggle>
          </Chips>
        </div>
      )}
      {wrap && (
        <SliderField
          label="Wrap angle"
          value={g.angle}
          unit="°"
          min={WRAP_MIN}
          max={WRAP_MAX}
          step={1}
          onChange={(v) => set((b) => withGrill(b, { angle: v }))}
        />
      )}
    </>
  );
}
