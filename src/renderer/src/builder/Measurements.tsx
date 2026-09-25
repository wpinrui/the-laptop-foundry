import { type Measurements as M, PROFILES, type Runtime } from "../engine";
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

export function Measurements({ m }: { m: M }) {
  const { performance: perf, cooling: cool, battery } = m;
  if (!perf) return null;
  return (
    <section className="measurements">
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
    </section>
  );
}
