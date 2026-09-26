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
  type Specs,
  specs,
  weightOf,
} from "../engine";
import { formatOption } from "./format";
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
  locked,
}: {
  build: Build;
  fit: Fit;
  m: M;
  set: (f: (b: Build) => Build) => void;
  locked?: boolean;
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
          disabled={locked}
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

const PANEL_TYPE: Record<string, string> = {
  "tn-matte": "TN matte",
  "tn-glossy": "TN glossy",
  "ips-type": "IPS",
  ips: "IPS",
  oled: "OLED",
  "mini-led": "Mini-LED",
};

const SIDE: Record<string, string> = {
  left: "Left",
  right: "Right",
  rear: "Rear",
  front: "Front",
};

/** Figures that need only the chosen parts: they appear first. */
function Early({ s, d: dur }: { s: Specs; d: M["durability"] }) {
  const rows: [string, string][] = [
    ["Drop test", `${dur.dropCm} cm`],
    ["Lid flex", `${one(dur.lidFlexMm)} mm`],
  ];
  const d = s.display;
  if (d) {
    rows.push(["Display", `${d.inches}" ${d.res[0]} x ${d.res[1]}, ${d.ppi} ppi`]);
    rows.push(["Panel", `${PANEL_TYPE[d.type] ?? d.type}, ${d.aspect[0]}:${d.aspect[1]}`]);
    rows.push(["Brightness", `${int(d.nits)} nits`]);
    rows.push(["Refresh", `${d.refresh} Hz`]);
    rows.push(["Gamut", d.gamut]);
  }
  const k = s.keyboard;
  if (k) {
    rows.push(["Key travel", `${one(k.travel)} mm${k.mechanical ? ", mechanical" : ""}`]);
    rows.push(["Key pitch", `${k.pitch} mm`]);
    rows.push(["Layout", k.numpad ? "With numpad" : "No numpad"]);
    rows.push(["Keyboard light", formatOption("light", k.light)]);
  }
  const w = s.webcam;
  if (w)
    rows.push([
      "Webcam",
      [
        `${w.res[0]} x ${w.res[1]}, ${one(w.megapixels)} MP`,
        w.ir ? "IR" : "",
        w.shutter ? "shutter" : "",
      ]
        .filter(Boolean)
        .join(", "),
    ]);
  const sp = s.speakers;
  if (sp)
    rows.push([
      "Speakers",
      `${sp.channels === "mono" ? "Mono" : "Stereo"}, ${sp.drivers} ${sp.drivers === 1 ? "driver" : "drivers"}${sp.bass ? ", bass" : ""}`,
    ]);
  const p = s.ports;
  if (p) {
    rows.push(["Ports", `${p.total}`]);
    for (const side of p.sides)
      rows.push([
        SIDE[side.side] ?? side.side,
        `${side.connectors}${side.charges ? ", charges" : ""}`,
      ]);
  }
  if (rows.length === 0) return null;
  return (
    <div className="m-spec">
      {rows.map(([label, value]) => [
        <span key={`${label}-l`}>{label}</span>,
        <b key={`${label}-v`}>{value}</b>,
      ])}
    </div>
  );
}

export function Measurements({
  m,
  build,
  fit,
  set,
  locked,
}: {
  m: M;
  build: Build;
  fit: Fit;
  set: (f: (b: Build) => Build) => void;
  locked?: boolean;
}) {
  const { performance: perf, cooling: cool, battery } = m;
  return (
    <section className="measurements">
      <Price build={build} fit={fit} m={m} set={set} locked={locked} />
      <Early s={specs(build)} d={m.durability} />
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
