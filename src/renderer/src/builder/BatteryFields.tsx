import {
  type Axis,
  type Build,
  CONTENT,
  FLIGHT_WH,
  type Fit,
  type Part,
  type PouchShape,
  pouchOf,
  pouchOpts,
  pouchShape,
  solve,
} from "../engine";
import type { SetBuild } from "./Parts";
import { Chip, Chips, FitButton, Label, Line, SliderField, Value } from "./ui";

// A pouch battery's size: length, depth and thickness sliders, the capacity
// they hold, and chips that size the length for a chosen capacity.

const NAME: Record<Axis, string> = { x: "Length", y: "Depth", z: "Thickness" };
const STEP: Record<Axis, number> = { x: 1, y: 1, z: 0.1 };
const TARGETS = [45, 60, 75, 90, FLIGHT_WH];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The build with the battery set to `size`, in place of any older capacity and thickness. */
function withSize(b: Build, part: Part, shape: PouchShape, patch: Partial<Record<Axis, number>>): Build {
  const list = [...(b.parts.battery ?? [])];
  const bp = list[0];
  if (!bp) return b;
  const cur = pouchOf(part, shape, bp, b.year, b.spend.battery ?? 0).size;
  const { wh: _wh, thickness: _t, ...rest } = bp.opts ?? {};
  list[0] = { ...bp, opts: { ...rest, ...pouchOpts({ ...cur, ...patch }) } };
  return { ...b, parts: { ...b.parts, battery: list } };
}

/** Free room around the battery in its zone, per plan axis. */
function slackOf(fit: Fit): Partial<Record<Axis, number>> {
  const unit = fit.boxes.find((b) => b.kind === "unit" && b.role === "battery" && b.id.endsWith("battery:0"));
  if (!unit) return {};
  const zone = fit.boxes.find((b) => b.kind === "zone" && b.zone === unit.zone && b.piece === unit.piece);
  if (!zone) return {};
  return { x: zone.size.x - unit.size.x, y: zone.size.y - unit.size.y };
}

/** Largest whole-mm value of `axis` up to `hi` that adds no problem and keeps the frame. */
function growTo(b: Build, fit: Fit, part: Part, shape: PouchShape, axis: Axis, from: number, hi: number): number {
  const ok = (v: number) => {
    try {
      const f = solve(withSize(b, part, shape, { [axis]: v }));
      return f.problems.length <= fit.problems.length && f.frame.x <= fit.frame.x && f.frame.y <= fit.frame.y;
    } catch {
      return false;
    }
  };
  let lo = Math.round(from);
  let top = Math.floor(hi);
  if (top <= lo) return lo;
  if (ok(top)) return top;
  while (top - lo > 1) {
    const mid = Math.floor((lo + top) / 2);
    if (ok(mid)) lo = mid;
    else top = mid;
  }
  return lo;
}

export function BatteryFields({ build, fit, set }: { build: Build; fit: Fit; set: SetBuild }) {
  const bp = build.parts.battery?.[0];
  const part = CONTENT.parts.find((p) => p.id === bp?.part);
  const shape = pouchShape(part);
  if (!bp || !part || !shape) return null;
  const spend = build.spend.battery ?? 0;
  const pack = pouchOf(part, shape, bp, build.year, spend);
  const slack = slackOf(fit);
  const capped = pack.raw > FLIGHT_WH + 0.05;
  const edit = (patch: Partial<Record<Axis, number>>) => set((b) => withSize(b, part, shape, patch));
  return (
    <>
      {(["x", "y", "z"] as Axis[]).map((a) => {
        const [lo, hi] = shape.limits[a];
        const room = slack[a] ?? 0;
        const grow = room >= 1 && pack.size[a] < hi;
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
              grow && (
                <FitButton
                  title={`Grow the ${NAME[a].toLowerCase()} to fill the free space in the battery slot`}
                  onClick={() =>
                    set((b) => {
                      const v = growTo(b, fit, part, shape, a, pack.size[a], Math.min(hi, pack.size[a] + room));
                      return withSize(b, part, shape, { [a]: v });
                    })
                  }
                />
              )
            }
            onChange={(v) => edit({ [a]: v })}
          />
        );
      })}
      <Line label="Capacity">
        <Value v={pack.wh.toFixed(1)} unit="Wh" warn={capped} />
      </Line>
      <span className="bd-note">
        {capped
          ? `Capped at ${FLIGHT_WH} Wh, the airline limit. The cells could hold ${pack.raw.toFixed(1)} Wh.`
          : `${Math.round(pack.density)} Wh per litre at this year's cells and Compact spend.`}
      </span>
      <div className="bd-field">
        <Label>Size length for</Label>
        <Chips>
          {TARGETS.map((wh) => {
            const len = (wh * 1e6) / (pack.density * pack.size.y * pack.size.z);
            const [lo, hi] = shape.limits.x;
            const fits = len >= lo && len <= hi;
            return (
              <Chip
                key={wh}
                on={Math.abs(pack.wh - wh) < 0.6}
                disabled={!fits}
                title={fits ? `${Math.round(len)} mm long` : "Out of the length range at this depth and thickness"}
                onClick={() => edit({ x: wh === FLIGHT_WH ? Math.floor(len) : Math.round(len) })}
              >
                {wh} Wh
              </Chip>
            );
          })}
        </Chips>
      </div>
    </>
  );
}
