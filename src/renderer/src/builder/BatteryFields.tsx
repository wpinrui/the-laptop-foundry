import {
  type Axis,
  type Build,
  CONTENT,
  type Fit,
  FLIGHT_WH,
  type Part,
  type PouchShape,
  pouchOf,
  pouchOpts,
  pouchShape,
  solve,
} from "../engine";
import type { SetBuild } from "./Parts";
import { FitButton, Line, SliderField, Value } from "./ui";

// A pouch battery's size: length, depth and thickness sliders, and the capacity
// they hold.

const NAME: Record<Axis, string> = { x: "Length", y: "Depth", z: "Thickness" };
const STEP: Record<Axis, number> = { x: 1, y: 1, z: 0.1 };

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The build with the battery set to `size`, in place of any older capacity and thickness. */
function withSize(
  b: Build,
  part: Part,
  shape: PouchShape,
  patch: Partial<Record<Axis, number>>,
): Build {
  const list = [...(b.parts.battery ?? [])];
  const bp = list[0];
  if (!bp) return b;
  const cur = pouchOf(part, shape, bp, b.year, b.spend.battery ?? 0).size;
  const { wh: _wh, thickness: _t, ...rest } = bp.opts ?? {};
  list[0] = { ...bp, opts: { ...rest, ...pouchOpts({ ...cur, ...patch }) } };
  return { ...b, parts: { ...b.parts, battery: list } };
}

/**
 * The largest value of `axis`, on the slider's steps, at which the build is
 * still valid; when it is already invalid, the largest that stays inside the
 * chassis and adds no problem.
 */
function largestFit(b: Build, fit: Fit, part: Part, shape: PouchShape, axis: Axis): number {
  const [lo, hi] = shape.limits[axis];
  const step = STEP[axis];
  const valid = fit.problems.length === 0;
  const ok = (v: number) => {
    try {
      const f = solve(withSize(b, part, shape, { [axis]: v }));
      const inside = f.frame.x <= fit.frame.x && f.frame.y <= fit.frame.y && f.frame.z <= fit.frame.z;
      return inside && (valid ? f.problems.length === 0 : f.problems.length <= fit.problems.length);
    } catch {
      return false;
    }
  };
  const at = (i: number) => Math.round((lo + i * step) * 10) / 10;
  let good = 0;
  let bad = Math.floor((hi - lo) / step + 1e-6);
  if (ok(at(bad))) return at(bad);
  if (!ok(at(good))) return at(good);
  while (bad - good > 1) {
    const mid = Math.floor((good + bad) / 2);
    if (ok(at(mid))) good = mid;
    else bad = mid;
  }
  return at(good);
}

export function BatteryFields({
  build,
  fit,
  set,
}: {
  build: Build;
  fit: Fit;
  set: SetBuild;
}) {
  const bp = build.parts.battery?.[0];
  const part = CONTENT.parts.find((p) => p.id === bp?.part);
  const shape = pouchShape(part);
  if (!bp || !part || !shape) return null;
  const spend = build.spend.battery ?? 0;
  const pack = pouchOf(part, shape, bp, build.year, spend);
  const capped = pack.raw > FLIGHT_WH + 0.05;
  const edit = (patch: Partial<Record<Axis, number>>) =>
    set((b) => withSize(b, part, shape, patch));
  return (
    <>
      {(["x", "y", "z"] as Axis[]).map((a) => {
        const [lo, hi] = shape.limits[a];
        return (
          <SliderField
            key={a}
            label={NAME[a]}
            value={a === "z" ? round1(pack.size[a]) : Math.round(pack.size[a])}
            unit="mm"
            digits={a === "z" ? 1 : 0}
            min={lo}
            max={hi}
            step={STEP[a]}
            action={
              <FitButton
                title={`Largest ${NAME[a].toLowerCase()} that fits`}
                onClick={() => set((b) => withSize(b, part, shape, { [a]: largestFit(b, fit, part, shape, a) }))}
              />
            }
            onChange={(v) => edit({ [a]: v })}
          />
        );
      })}
      <Line label="Capacity">
        <Value v={pack.wh.toFixed(1)} unit="Wh" warn={capped} />
      </Line>
      {capped && (
        <span className="bd-note">
          Capped at {FLIGHT_WH} Wh, the airline limit
        </span>
      )}
    </>
  );
}
