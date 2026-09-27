import { type Build, CONTENT, type Fit, fanRange, fanSizeOf, withFanSize } from "../engine";
import type { SetBuild } from "./Parts";
import { Chip, SliderField } from "./ui";

// Fan size: a diameter slider for every fan, with Auto to hand it back to the fit.

export function FanField({ build, fit, set }: { build: Build; fit: Fit; set: SetBuild }) {
  const part = CONTENT.parts.find((p) => p.id === build.parts.cooling?.[0]?.part);
  const shape = part && (Array.isArray(part.shape) ? part.shape[0] : part.shape);
  if (shape?.kind !== "fan" || shape.count === 0) return null;
  const manual = fanSizeOf(build);
  const fan = fit.boxes.find((b) => b.kind === "unit" && b.role === "fan");
  const shown = manual ?? (fan ? Math.min(fan.size.x, fan.size.y) : fanRange(build.year)[0]);
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
        <Chip caps on={manual === undefined} onClick={() => set((b) => withFanSize(b, undefined))}>
          Auto
        </Chip>
      }
      onChange={(v) => set((b) => withFanSize(b, v))}
    />
  );
}
