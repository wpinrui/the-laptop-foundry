import { type Content, CONTENT } from "../content";
import { type Load, timeline, type Timeline } from "../sim";
import { partOf } from "../sim/profiles";
import { PROFILES, type ProfileId } from "../types";
import type { Facts, Section, Table } from "./index";

// Charts for the review, as plain data the site draws. Everything comes from
// the simulation of the reviewed model and its rivals. Slot 0 is the reviewed
// model; each rival keeps its slot, and so its colour, across the whole page.

export interface LineSeries {
  slot: number;
  name: string;
  values: number[];
}

export interface LinePanel {
  label: string;
  decimals: number;
  lower?: boolean;
  series: LineSeries[];
}

export interface LineChart {
  kind: "lines";
  caption: string;
  xLabel: string;
  /** Value at the last sample on the x axis. */
  xMax: number;
  /** Where the x axis ticks go. */
  xStep: number;
  panels: LinePanel[];
}

export interface BarRow {
  slot: number;
  name: string;
  link?: string;
  subject?: boolean;
  value: number;
}

export interface BarChart {
  kind: "bars";
  caption: string;
  unit: string;
  decimals: number;
  lower: boolean;
  /** Hours shown as hours and minutes. */
  hours?: boolean;
  rows: BarRow[];
}

export interface ScaleChart {
  kind: "scale";
  caption: string;
  unit: string;
  min: number;
  max: number;
  bands: { to: number; label: string }[];
  marks: { slot: number; label: string; value: number; subject?: boolean }[];
}

export interface DisplayBox {
  kind: "display";
  caption: string;
  /** Nine zones, row by row from the top left, cd/m². */
  grid: number[];
  rows: [label: string, value: string][];
}

export type Chart = LineChart | BarChart | ScaleChart | DisplayBox;

const STEP = 10;
const LOOP_RUN = 60;
const PROFILE_NAME: Record<ProfileId, string> = { high: "High", medium: "Medium", low: "Low" };

/** All-core clock at the processor's boost limit, GHz, per architecture. */
const CLOCK: Record<string, number> = {
  yonah: 2.0,
  merom: 2.2,
  k8: 2.0,
  "skylake-y": 1.9,
  "skylake-u": 2.7,
  "skylake-h": 3.1,
  "bristol-ridge": 3.0,
  "raptor-lake-u": 3.4,
  "lunar-lake": 3.7,
  "panther-lake": 3.8,
  "arrow-lake-hx": 4.6,
  "zen5-mobile": 4.3,
  "strix-halo": 4.5,
  "fire-range": 4.8,
  oryon: 3.8,
};

const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

/** Mean over consecutive buckets of `size` samples. */
function buckets(xs: number[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < xs.length; i += size) out.push(mean(xs.slice(i, i + size)));
  return out;
}

const fullName = (x: Facts) => `${x.subject.company} ${x.subject.name}`;

interface Entry {
  f: Facts;
  slot: number;
}

export function chartsFor(sections: Section[], f: Facts, peers: Facts[], content: Content = CONTENT): void {
  const field: Entry[] = [f, ...peers].map((x, slot) => ({ f: x, slot }));
  const cache = new Map<string, Timeline>();
  const run = (x: Facts, profile: ProfileId, load: Load) => {
    const key = `${x.subject.id}:${profile}:${load}`;
    let t = cache.get(key);
    if (!t) {
      t = timeline(x.subject.build, x.fit, profile, load, undefined, content);
      cache.set(key, t);
    }
    return t;
  };
  const top = (x: Facts) => x.m.cooling?.profile ?? x.m.top;
  const section = (id: string) => sections.find((s) => s.id === id);
  const add = (id: string, ...charts: Chart[]) => {
    const s = section(id);
    if (s) s.charts = [...(s.charts ?? []), ...charts];
  };
  const bars = (
    caption: string,
    unit: string,
    decimals: number,
    value: (x: Facts) => number | null | undefined,
    lower = false,
    hours = false,
  ): BarChart | null => {
    const rows: BarRow[] = [];
    for (const e of field) {
      const v = value(e.f);
      if (v == null || !Number.isFinite(v)) continue;
      rows.push({
        slot: e.slot,
        name: fullName(e.f),
        link: e.slot === 0 ? undefined : e.f.subject.id,
        subject: e.slot === 0,
        value: v,
      });
    }
    if (!rows.some((r) => r.subject)) return null;
    rows.sort((a, b) => (lower ? a.value - b.value : b.value - a.value));
    return { kind: "bars", caption, unit, decimals, lower, hours, rows };
  };
  const some = (...cs: (Chart | null)[]) => cs.filter((c): c is Chart => c !== null);

  // ---------------------------------------------------------------- display
  const d = f.m.lab.display;
  if (d) {
    const rows: [string, string][] = [
      ["Maximum", `${num(Math.max(...d.distribution))} cd/m²`],
      ["Average", `${num(d.average)} cd/m²`],
      ["Brightness distribution", `${num(d.uniformity)} %`],
      ["Centre", `${num(d.centre)} cd/m²`],
      ["Black level*", `${num(d.black, 2)} cd/m²`],
      ["Contrast", Number.isFinite(d.contrast) ? `${num(d.contrast)}:1` : "Infinite"],
      ["ColorChecker DeltaE avg*", num(d.deltaE.avg, 2)],
      ["ColorChecker DeltaE max*", num(d.deltaE.max, 2)],
      ["sRGB coverage", `${num(d.coverage.srgb, 1)} %`],
      ["DCI-P3 coverage", `${num(d.coverage.p3, 1)} %`],
      ["Response black to white*", `${num(d.response.blackWhite, 1)} ms`],
      ["Response grey to grey*", `${num(d.response.greyGrey, 1)} ms`],
      ["PWM", d.pwm ? `${num(d.pwm.hz)} Hz at ${num(d.pwm.below)} % brightness and below` : "Not detected"],
    ];
    if (d.dimmingZones) rows.push(["Local dimming zones", num(d.dimmingZones)]);
    add("display", { kind: "display", caption: "Display measurements", grid: d.distribution, rows });
  }

  // ---------------------------------------------------------------- performance
  const c = f.m.cooling;
  if (c && f.r) {
    const benchName = f.r.bench.name;
    // The loop: the benchmark run back to back for 30 minutes.
    const loop: LineSeries[] = [];
    for (const e of field.slice(0, 4)) {
      const x = e.f;
      if (!x.m.cooling || x.r?.bench.multi == null) continue;
      const scale = x.r.bench.multi / x.m.cooling.sustained;
      const t = run(x, top(x), "cpu");
      loop.push({ slot: e.slot, name: fullName(x), values: buckets(t.multi, LOOP_RUN).map((v) => v * scale) });
    }
    const perf = some(
      loop.some((s) => s.slot === 0)
        ? {
            kind: "lines",
            caption: `${benchName} multi-core loop`,
            xLabel: "Run",
            xMax: loop[0].values.length,
            xStep: 5,
            panels: [{ label: "Points", decimals: 0, series: loop }],
          }
        : null,
      bars(`${benchName} single-core`, "Points", 0, (x) => x.r?.bench.single),
      bars(`${benchName} multi-core`, "Points", 0, (x) => x.r?.bench.multi),
      bars("Graphics score", "Points", 0, (x) => x.m.cooling?.graphics.sustained),
      bars("Storage sequential read", "MB/s", 0, (x) => x.m.lab.storage[0]?.seqRead),
      bars("Storage sequential write", "MB/s", 0, (x) => x.m.lab.storage[0]?.seqWrite),
      bars("Memory read bandwidth", "GB/s", 1, (x) => x.m.lab.memory?.read),
      bars("Wi-Fi send", "Mbit/s", 0, (x) => x.m.lab.wifi?.send),
      bars("Wi-Fi receive", "Mbit/s", 0, (x) => x.m.lab.wifi?.receive),
    );
    add("performance", ...perf);

    // ---------------------------------------------------------------- emissions
    const cpu = partOf(f.subject.build, "processor", content)?.power;
    const stress = run(f, c.profile, "stress");
    const boost = f.m.profiles[c.profile].cpu.boost;
    const peak = cpu ? (CLOCK[cpu.arch] ?? 3) : 0;
    const clock = stress.cpuW.map((w) =>
      boost > 0 ? peak * Math.min(1, Math.max(0.15, w / boost)) ** (1 / 3) : 0,
    );
    const me = (values: number[]) => [{ slot: 0, name: fullName(f), values: buckets(values, STEP) }];
    const xMax = stress.cpuW.length / 60;
    add("emissions", {
      kind: "lines",
      caption: "Stress test",
      xLabel: "Minutes",
      xMax,
      xStep: 5,
      panels: [
        { label: "Processor power (W)", decimals: 0, series: me(stress.cpuW) },
        { label: "Processor clock (GHz)", decimals: 1, series: me(clock) },
        { label: "Processor temperature (°C)", decimals: 0, series: me(stress.cpuDie) },
        { label: "Fan speed (%)", decimals: 0, series: me(stress.fan.map((v) => v * 100)) },
      ],
    });
    const noise: LineSeries[] = field
      .filter((e) => e.f.m.cooling)
      .map((e) => ({ slot: e.slot, name: fullName(e.f), values: buckets(run(e.f, top(e.f), "stress").db, STEP) }));
    add(
      "emissions",
      {
        kind: "lines",
        caption: "Noise under the stress test",
        xLabel: "Minutes",
        xMax,
        xStep: 5,
        panels: [{ label: "dB(A)*", decimals: 0, lower: true, series: noise }],
      },
      {
        kind: "scale",
        caption: "Noise level",
        unit: "dB(A)",
        min: 20,
        max: 60,
        bands: [
          { to: 30, label: "Silent" },
          { to: 36, label: "Quiet" },
          { to: 42, label: "Audible" },
          { to: 50, label: "Loud" },
          { to: 60, label: "Very loud" },
        ],
        marks: [
          { slot: 0, label: "Idle", value: c.noise.idle, subject: true },
          { slot: 0, label: "Load", value: c.noise.sustained, subject: true },
          ...field
            .slice(1)
            .filter((e) => e.f.m.cooling)
            .map((e) => ({ slot: e.slot, label: e.f.subject.name, value: e.f.m.cooling?.noise.sustained ?? 0 })),
        ],
      },
    );
  }

  // ---------------------------------------------------------------- energy
  const bat = f.m.battery;
  if (bat) {
    const energy = section("energy");
    if (energy) {
      const rows: Table["rows"] = [];
      for (const e of field) {
        const b = e.f.m.battery;
        if (!b) continue;
        for (const id of PROFILES) {
          const dr = b.draw[id];
          if (!dr) continue;
          const pkg = (t: Timeline, pick: (xs: number[]) => number) =>
            pick(t.cpuW.map((w, i) => (w + t.gpuW[i]) / 0.9));
          let loadAvg = dr.load;
          let loadMax = dr.load;
          if (e.f.m.cooling) {
            loadAvg = dr.web + pkg(run(e.f, id, "gpu"), mean);
            loadMax = dr.web + Math.max(pkg(run(e.f, id, "gpu"), (xs) => Math.max(...xs)), pkg(run(e.f, id, "stress"), (xs) => Math.max(...xs)));
          }
          rows.push({
            link: e.slot === 0 ? undefined : e.f.subject.id,
            subject: e.slot === 0,
            cells: [
              fullName(e.f),
              PROFILE_NAME[id],
              num(dr.idle, 1),
              num((dr.idle + dr.web) / 2, 1),
              num(dr.web, 1),
              num(loadAvg, 1),
              num(loadMax, 1),
            ],
          });
        }
      }
      energy.tables = [
        {
          caption: "Power consumption (W)",
          columns: ["", "Profile", "Idle min*", "Idle avg*", "Idle max*", "Load avg*", "Load max*"],
          rows,
        },
        ...energy.tables,
      ];
      const hours = (pick: "web" | "video" | "idle" | "load") => (x: Facts) => {
        const b = x.m.battery;
        return b ? b.runtime[b.balanced]?.[pick] : null;
      };
      add(
        "energy",
        ...some(
          bars("Battery life: Wi-Fi browsing", "", 1, hours("web"), false, true),
          bars("Battery life: video", "", 1, hours("video"), false, true),
          bars("Battery life: idle", "", 1, hours("idle"), false, true),
          bars("Battery life: load", "", 1, hours("load"), false, true),
        ),
      );
    }
  }
}

