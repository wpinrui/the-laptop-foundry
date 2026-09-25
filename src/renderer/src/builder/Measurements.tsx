import {
  type Build,
  classify,
  costOf,
  type DeviceClass,
  type Fit,
  type Measurements as M,
  PRESETS,
  PROFILES,
  type Results,
  type Runtime,
  results,
  weightOf,
} from "../engine";
import { PROFILE_NAME } from "./Power";

// Raw measurements only, each shown once it can be computed. No ratings.

const int = (n: number) => Math.round(n).toLocaleString("en-US");
const one = (n: number) => n.toFixed(1);

function time(s: number): string {
  return s < 60 ? `${s} s` : `${s / 60} min`;
}

const ACTIVITIES: (keyof Runtime)[] = ["idle", "web", "video", "load"];
const ACTIVITY_NAME: Record<keyof Runtime, string> = {
  idle: "Idle",
  web: "Web",
  video: "Video",
  load: "Load",
};

function className(c: DeviceClass): string {
  const words = [
    c.budget === "midrange" ? "Midrange" : c.budget === "low" ? "Low" : c.budget === "premium" ? "Premium" : "",
    c.body,
    c.performance ?? "",
  ].filter(Boolean);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PRESET_NAME = { low: "Low", medium: "Medium", high: "High", ultra: "Ultra" };

/** Kilnbench and the three games, at the model year's editions. */
function Bench({ r }: { r: Results | null }) {
  if (!r) return null;
  const { bench, games } = r;
  const native = games.find((g) => g.runs?.some((x) => x.native))?.runs?.find(
    (x) => x.native,
  );
  const rows: { key: string; label: string; native: boolean }[] = PRESETS.map(
    (p) => ({ key: p, label: PRESET_NAME[p], native: false }),
  );
  if (native)
    rows.push({ key: "native", label: `${native.res[0]} x ${native.res[1]}`, native: true });
  return (
    <>
      <div className="m-grid">
        <span>{bench.name}</span>
        <b>{bench.single === null ? "—" : int(bench.single)}</b>
        <b>{bench.multi === null ? "—" : int(bench.multi)}</b>
      </div>
      <div className="m-games">
        <span />
        {games.map((g) => (
          <span key={g.id} className="m-head">
            {g.name}
          </span>
        ))}
        {rows.map((row) => [
          <span key={row.key}>{row.label}</span>,
          ...games.map((g) => {
            const run = g.runs?.find((x) =>
              row.native ? x.native : !x.native && x.preset === row.key,
            );
            return <b key={`${row.key}-${g.id}`}>{run ? int(run.fps) : "—"}</b>;
          }),
        ])}
      </div>
    </>
  );
}

function Price({
  build,
  fit,
  m,
  set,
}: {
  build: Build;
  fit: Fit;
  m: M;
  set: (f: (b: Build) => Build) => void;
}) {
  const cost = costOf(build, fit);
  const kg = weightOf(build, fit);
  const cls = classify(build, fit, m, kg);
  return (
    <>
      <b className="m-class">{className(cls)}</b>
      <div className="m-grid">
        <span>Cost</span>
        <b>${int(cost.total)}</b>
        <span />
        <span>Retail</span>
        <input
          className="watts price"
          type="number"
          min={0}
          step={10}
          aria-label="retail price"
          value={build.price ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? undefined : Number(e.target.value);
            set((b) => ({ ...b, price: v !== undefined && Number.isFinite(v) ? v : undefined }));
          }}
        />
        <span>Weight</span>
        <b>{kg.toFixed(2)} kg</b>
        <span />
      </div>
    </>
  );
}

export function Measurements({
  m,
  build,
  fit,
  set,
}: {
  m: M;
  build: Build;
  fit: Fit;
  set: (f: (b: Build) => Build) => void;
}) {
  const { performance: perf, cooling: cool, battery } = m;
  return (
    <section className="measurements">
      <Price build={build} fit={fit} m={m} set={set} />
      {perf && (
      <>
      <div className="m-grid">
        {cool && (
          <>
            <span />
            <span className="m-head">First</span>
            <span className="m-head">30 min</span>
          </>
        )}
        <span>Single-core</span>
        <b>{int(perf.single)}</b>
        <span />
        <span>Multi-core</span>
        <b>{int(cool ? cool.firstRun : perf.multi)}</b>
        <b>{cool ? int(cool.sustained) : ""}</b>
        <span>Graphics</span>
        <b>{int(cool ? cool.graphics.first : perf.graphics)}</b>
        <b>{cool ? int(cool.graphics.sustained) : ""}</b>
        {cool && (
          <>
            <span>CPU W</span>
            <b>{int(cool.cpuWatts.first)}</b>
            <b>{int(cool.cpuWatts.sustained)}</b>
          </>
        )}
        {cool?.gpuWatts && (
          <>
            <span>GPU W</span>
            <b>{int(cool.gpuWatts.first)}</b>
            <b>{int(cool.gpuWatts.sustained)}</b>
          </>
        )}
      </div>

      {cool && (
        <>
          <div className="m-trace">
            {cool.dieTemp.map((d) => (
              <div key={d.at}>
                <b>{int(d.c)} °C</b>
                <span>{time(d.at)}</span>
              </div>
            ))}
          </div>
          <div className="m-grid">
            <span>Skin</span>
            <b>{int(cool.peakSkin)} °C</b>
            <span />
          </div>
          <div className="m-trace">
            {(["idle", "load", "sustained"] as const).map((k) => (
              <div key={k}>
                <b>{one(cool.noise[k])} dB(A)</b>
                <span>{k === "idle" ? "Idle" : k === "load" ? "Load" : "30 min"}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {cool && <Bench r={results(build, m)} />}

      {battery && (
        <div className="m-battery">
          <span>{one(battery.wh)} Wh</span>
          {ACTIVITIES.map((a) => (
            <span key={a}>{ACTIVITY_NAME[a]}</span>
          ))}
          {PROFILES.map((id) => {
            const r = battery.runtime[id];
            if (!r) return null;
            return [
              <span key={id} className={id === battery.balanced ? "on" : ""}>
                {PROFILE_NAME[id]}
              </span>,
              ...ACTIVITIES.map((a) => <b key={`${id}-${a}`}>{one(r[a])} h</b>),
            ];
          })}
        </div>
      )}
      </>
      )}
    </section>
  );
}
