import { type Content, CONTENT } from "../content";
import { activeArea } from "../content/display";
import { panelOf } from "../screen";
import { solve } from "../solve";
import {
  type Build,
  type Fit,
  type Part,
  type PanelOption,
  PROFILES,
  type Profile,
  type ProfileId,
  type PowerSpec,
  type Shape,
} from "../types";
import { archOf, igpuAt, scoreAt, singleAt } from "./curves";
import { balancedProfile, partOf, profilesOf, topProfile } from "./profiles";
import { type Lab, labOf } from "./lab";
import { type Surface, surfaceOf } from "./surface";

export { ARCHS, igpuAt, scoreAt, singleAt } from "./curves";
export type { Lab, MemoryLab, PanelLab, StorageLab, WifiLab } from "./lab";
export { labOf } from "./lab";
export type { Surface, SurfaceField, SurfaceReadings } from "./surface";
export {
  balancedProfile,
  defaultProfiles,
  profilesOf,
  topProfile,
} from "./profiles";

// The one simulation the builder and the reviewer share. Pure and
// deterministic: a build in, every raw measurement out.
//
// Thermals are a lumped model stepped once a second. One heat sink node holds
// the heat of the chips and the platform and sheds it to the room through the
// fans and fins (scaled by fan speed) and through the body's skin. Each die
// sits above the sink by its power times its die resistance. When a die would
// pass its limit, its power is cut to hold it there, so a poor cooler never
// fails: it throttles and runs hot.

export const AMBIENT = 22;
const DURATION = 1800;
const RUN = 60;
const TRACE = [30, 60, 300, 600, 1800];
const NOISE_FLOOR = 22;

export interface Performance {
  /** Cinebench R23 points. */
  single: number;
  multi: number;
  /** Time Spy graphics points. */
  graphics: number;
}

/** Hours on battery per activity. */
export interface Runtime {
  idle: number;
  web: number;
  video: number;
  load: number;
}

export interface Battery {
  wh: number;
  /** The profile the review's battery test uses. */
  balanced: ProfileId;
  /** Enabled profiles only. */
  runtime: Partial<Record<ProfileId, Runtime>>;
  /** Watts drawn per activity, enabled profiles only. */
  draw: Partial<Record<ProfileId, Runtime>>;
}

export interface Cooling {
  /** Profile the performance tests use. */
  profile: ProfileId;
  /** Multi-core loop: first run and after 30 minutes. */
  firstRun: number;
  sustained: number;
  cpuWatts: { first: number; sustained: number };
  /** Graphics load: first minute and after 30 minutes. */
  graphics: { first: number; sustained: number };
  /** Discrete graphics power; null on integrated graphics. */
  gpuWatts: { first: number; sustained: number } | null;
  /** Die temperature during the multi-core loop, at the listed seconds. */
  dieTemp: { at: number; c: number }[];
  peakDie: number;
  /** Hottest outer surface under combined load. */
  peakSkin: number;
  /** Surface temperature fields over the base's top and bottom at idle and under the stress test. */
  surface: Surface;
  /** dB(A). */
  noise: { idle: number; load: number; sustained: number };
}

/** Case durability from the materials and material spend. */
export interface Durability {
  /** Lid, deck and floor, 0 to 1. */
  lid: number;
  deck: number;
  floor: number;
  /** Weighted over the pieces, 0 to 1. */
  index: number;
  /** Height of the drop test the base survives, cm. */
  dropCm: number;
  /** Lid flex under a 30 N press at its centre, mm. */
  lidFlexMm: number;
}

export function durabilityOf(build: Build, content: Content = CONTENT): Durability {
  const spend = build.spend.material ?? 0;
  const of = (id: string) => {
    const base = content.materials.find((m) => m.id === id)?.durability ?? 0.35;
    return base + (1 - base) * 0.4 * spend;
  };
  const lid = of(build.materials.lid);
  const deck = of(build.materials.deck);
  const floor = of(build.materials.floor);
  const base = (deck + floor) / 2;
  return {
    lid,
    deck,
    floor,
    index: 0.4 * lid + 0.3 * deck + 0.3 * floor,
    dropCm: Math.round(30 + 70 * base),
    lidFlexMm: Math.round((6 - 5 * lid) * 10) / 10,
  };
}

export interface Measurements {
  durability: Durability;
  profiles: Record<ProfileId, Profile>;
  top: ProfileId;
  performance: Performance | null;
  battery: Battery | null;
  cooling: Cooling | null;
  /** Display, drive, Wi-Fi and memory lab figures, from the parts alone. */
  lab: Lab;
}

// ------------------------------------------------------------------ build facts

interface Facts {
  year: number;
  cpu?: PowerSpec;
  gpu?: PowerSpec;
  panel?: PanelOption;
  refresh: number;
  wh: number;
  hdds: number;
  ssds: number;
  optical: boolean;
  frame: { x: number; y: number; z: number };
  materials: string[];
  fans: { d: number; h: number }[];
  finFace: number;
  chamber: boolean;
  fanCount: number;
  coolingSpend: number;
  materialSpend: number;
}

/** Discrete graphics power. A switchable part is powered down at idle, so it idles at nothing. */
function graphicsPower(build: Build, content: Content): PowerSpec | undefined {
  const part = partOf(build, "graphics", content);
  if (!part?.power) return undefined;
  const bp = build.parts.graphics?.[0];
  const switchable = String(bp?.opts?.switchable ?? part.options?.switchable?.[0] ?? "no") === "yes";
  return switchable ? { ...part.power, idle: 0 } : part.power;
}

function shapes(p: Part | undefined): Shape[] {
  if (!p) return [];
  return Array.isArray(p.shape) ? p.shape : [p.shape];
}

export function facts(build: Build, fit: Fit, content: Content): Facts {
  const part = (id: string | undefined) =>
    id ? content.parts.find((p) => p.id === id) : undefined;
  const first = (cat: keyof Build["parts"]) => build.parts[cat]?.[0];

  let wh = 0;
  const bat = first("battery");
  const batPart = part(bat?.part);
  if (batPart) {
    const sh = shapes(batPart)[0];
    if (sh?.kind === "cells") {
      const cells = Number(bat?.opts?.cells ?? batPart.options?.cells?.[0] ?? 6);
      wh = Number(batPart.info?.[`wh${cells}`] ?? cells * 8);
    } else {
      wh = Number(bat?.opts?.wh ?? batPart.options?.wh?.[0] ?? 50);
    }
  }
  const swap = part(first("hotswap")?.part);
  wh += Number(swap?.info?.wh ?? 0);

  const panel = panelOf(build, content);
  const refresh = panel?.hz ?? 60;

  let hdds = 0;
  let ssds = 0;
  for (const bp of build.parts.storage ?? []) {
    const sh = shapes(part(bp.part))[0];
    if (sh?.kind === "box") hdds++;
    else if (sh) ssds++;
  }

  const coolPart = part(first("cooling")?.part);
  const fanShape = shapes(coolPart).find((s) => s.kind === "fan");
  const fans = fit.boxes
    .filter((b) => b.role === "fan" && b.kind === "unit")
    .map((b) => ({ d: Math.min(b.size.x, b.size.y), h: b.size.z }));
  const finFace = fit.boxes
    .filter((b) => b.role === "fin" && b.kind === "unit")
    .reduce((sum, b) => sum + (Math.max(b.size.x, b.size.y) * b.size.z) / 100, 0);

  return {
    year: build.year,
    cpu: partOf(build, "processor", content)?.power,
    gpu: graphicsPower(build, content),
    panel,
    refresh,
    wh,
    hdds,
    ssds,
    optical: !!first("optical"),
    frame: fit.frame,
    materials: [build.materials.floor, build.materials.deck],
    fans,
    finFace,
    chamber: fanShape?.kind === "fan" && !!fanShape.chamber,
    fanCount: fanShape?.kind === "fan" ? fanShape.count : 0,
    coolingSpend: build.spend.cooling ?? 0,
    materialSpend: build.spend.material ?? 0,
  };
}

// ------------------------------------------------------------------ cooling capacity

/** How well a body material spreads heat to its outer surface, 0 to 1. */
const SPREAD: Record<string, number> = {
  plastic: 0.35,
  cfrp: 0.5,
  magnesium: 0.8,
  aluminium: 0.9,
};

interface Cooler {
  /** Sink to room through the skin, W/K. */
  passive: number;
  /** Sink to room through fans and fins at full speed, W/K. */
  active: number;
  /** Full-speed noise, dB(A). */
  loudest: number;
  /** Sink heat capacity, J/K. */
  capacity: number;
  /** Share of the sink's rise over the room seen as the case's mean rise. */
  skin: number;
  /** Die resistance multiplier: a bare spreader conducts worse than heat pipes. */
  die: number;
}

export function cooler(f: Facts): Cooler {
  const { x, y, z } = f.frame;
  const spread =
    f.materials.reduce((s, m) => s + (SPREAD[m] ?? 0.35), 0) / f.materials.length;
  const areaM2 = (2 * x * y) / 1e6;
  const passive =
    2.2 * areaM2 * spread * (1 + 0.3 * f.materialSpend) * (f.fanCount === 0 ? 1.3 : 1);

  // Airflow grows with fan diameter and thickness; the fin face sets how much
  // of it picks up heat. 2006 fin stacks and pipes are coarser.
  const tech = f.year < 2012 ? 0.9 : 1;
  let hardware = 0;
  f.fans.forEach((fan) => {
    hardware += 0.7 * (fan.d / 50) ** 1.2 * (fan.h / 10) ** 0.8;
  });
  hardware *= Math.min(1.4, Math.max(0.5, f.finFace / Math.max(1, f.fans.length) / 5)) ** 0.5;
  hardware *= tech * (f.chamber ? 1.6 : 1);
  const active =
    hardware * (1 + 0.3 * f.coolingSpend) * (1 + 0.1 * f.materialSpend);
  const loudest = hardware > 0 ? Math.max(30, 36 + 20 * Math.log10(hardware / 0.5)) : 0;

  const litres = (x * y * z) / 1e6;
  const capacity = 250 * litres + 40 * f.fans.length + 60;
  // The case's mean rise over the room is a share of the sink's: the rest
  // drops across the gap and pads between them. Thinner bodies close that gap.
  // Without a fan the sink is a spreader plate the case sees across a wider gap.
  const skin = (f.fanCount === 0 ? 0.23 : 0.37) * Math.min(1.5, (13 / z) ** 0.15);
  return {
    passive,
    active,
    loudest,
    capacity,
    skin,
    die: f.fanCount === 0 ? 1.5 : 1,
  };
}

function noise(c: Cooler, fan: number): number {
  const fanDb = fan > 0.01 && c.loudest > 0 ? c.loudest + 30 * Math.log10(fan) : -99;
  return 10 * Math.log10(10 ** (NOISE_FLOOR / 10) + 10 ** (fanDb / 10));
}

// ------------------------------------------------------------------ platform draw

const BACKLIGHT: Record<string, number> = {
  "tn-matte": 0.5,
  "tn-glossy": 0.5,
  "ips-type": 0.55,
  ips: 0.2,
  "tn-led": 0.3,
  "mini-led": 0.3,
};

/** Panel draw in watts at 150 nits, or at its lowest brightness. */
function displayWatts(f: Facts, content: "idle" | "web" | "video"): number {
  if (!f.panel) return 0;
  const a = activeArea(f.panel);
  const dm2 = (a.x * a.y) / 1e4;
  let perDm2 = BACKLIGHT[f.panel.type] ?? 0.3;
  // 2016 LED backlights are less efficient than 2026 ones.
  if (f.year >= 2012 && f.year < 2020) perDm2 *= 1.4;
  if (f.panel.type === "oled") perDm2 = content === "video" ? 0.18 : 0.3;
  const light = dm2 * perDm2 * (content === "idle" ? 0.25 : 1);
  const mp = (f.panel.res[0] * f.panel.res[1]) / 1e6;
  const fast = f.year >= 2012 ? Math.max(0, f.refresh / 60 - 1) * 0.15 : 0;
  return light + 0.3 + 0.1 * mp + fast;
}

/** Board, memory, storage and radios at idle. */
function baseWatts(f: Facts): number {
  const old = f.year < 2012;
  let w = old ? 4.5 : f.year < 2020 ? 2 : 1;
  if (!old && f.cpu && f.cpu.range[0] >= 45) w += 4.5;
  w += f.hdds * (old ? 1 : 0.8) + f.ssds * 0.1;
  return w;
}

// ------------------------------------------------------------------ time stepping

type Load = "idle" | "cpu" | "gpu" | "stress";

interface Trace {
  cpuW: number[];
  gpuW: number[];
  cpuDie: number[];
  sink: number[];
  fan: number[];
}

function run(f: Facts, c: Cooler, p: Profile, load: Load, seconds: number): Trace {
  const cpu = f.cpu;
  const gpu = f.gpu;
  const ca = cpu ? archOf(cpu) : undefined;
  const ga = gpu ? archOf(gpu) : undefined;
  const base = baseWatts(f);
  const out: Trace = { cpuW: [], gpuW: [], cpuDie: [], sink: [], fan: [] };
  let sink = AMBIENT + 5;
  let fan = 0;
  for (let t = 0; t < seconds; t++) {
    let cpuWant = cpu?.idle ?? 0;
    let gpuWant = gpu?.idle ?? 0;
    if (cpu && ca && (load === "cpu" || load === "stress" || (load === "gpu" && !gpu))) {
      cpuWant = t < ca.boostSeconds ? p.cpu.boost : p.cpu.sustained;
    } else if (cpu && load === "gpu") {
      cpuWant = Math.max(cpu.idle, 0.3 * p.cpu.sustained);
    }
    if (gpu && load === "gpu") gpuWant = p.gpu.boost;
    if (gpu && load === "stress") gpuWant = p.gpu.sustained;

    const cap = (want: number, r: number, tj: number) => {
      const room = (tj - sink) / r;
      return Math.max(Math.min(want, room), 0.05 * want);
    };
    const rCpu = (ca?.rDie ?? 0) * c.die;
    const rGpu = (ga?.rDie ?? 0) * c.die;
    const cpuW = ca ? cap(cpuWant, rCpu, ca.tj) : 0;
    const gpuW = ga ? cap(gpuWant, rGpu, ga.tj) : 0;
    const cpuDie = sink + cpuW * rCpu;
    const gpuDie = sink + gpuW * rGpu;

    // Fans chase the hottest die, capped by the profile.
    // 2006 fans never stop; later ones rest when the dies are cool.
    let demand = f.year < 2012 ? 0.3 : 0;
    if (ca) demand = Math.max(demand, (cpuDie - 40) / (ca.tj - 15 - 40));
    if (ga) demand = Math.max(demand, (gpuDie - 40) / (ga.tj - 10 - 40));
    const target = c.active > 0 ? Math.min(p.fan, Math.max(0, demand)) : 0;
    fan += Math.max(-0.02, Math.min(0.02, target - fan));

    const heat = cpuW + gpuW + base;
    const g = c.passive + c.active * Math.max(0, fan) ** 0.8;
    sink += (heat - g * (sink - AMBIENT)) / c.capacity;

    out.cpuW.push(cpuW);
    out.gpuW.push(gpuW);
    out.cpuDie.push(cpuDie);
    out.sink.push(sink);
    out.fan.push(fan);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const head = (xs: number[]) => xs.slice(0, RUN);
const tail = (xs: number[]) => xs.slice(-RUN);

function graphicsAt(f: Facts, cpuW: number, gpuW: number): number {
  if (f.gpu) return scoreAt(f.gpu, gpuW);
  return f.cpu ? igpuAt(f.cpu, cpuW) : 0;
}

function coolingFor(
  f: Facts,
  c: Cooler,
  profiles: Record<ProfileId, Profile>,
  fit: Fit,
  build: Build,
): Cooling {
  const id = topProfile(profiles);
  const p = profiles[id];
  const cpu = f.cpu as PowerSpec;
  const loop = run(f, c, p, "cpu", DURATION);
  const game = run(f, c, p, "gpu", DURATION);
  const stress = run(f, c, p, "stress", DURATION);
  const idle = run(f, c, p, "idle", DURATION);
  const multi = (ws: number[]) => mean(ws.map((w) => scoreAt(cpu, w)));
  const gfx = (i: number) => graphicsAt(f, game.cpuW[i], game.gpuW[i]);
  const gfxRun = (from: number) =>
    mean(Array.from({ length: RUN }, (_, i) => gfx(from + i)));
  const fanPeak = Math.max(...head(stress.fan));
  const meanAt = (t: Trace, i: number) => AMBIENT + c.skin * (t.sink[i] - AMBIENT);
  const loadMean = Math.max(...stress.sink.map((_, i) => meanAt(stress, i)));
  const carried = (fan: number) => {
    const g = c.active * Math.max(0, fan) ** 0.8;
    return g > 0 ? Math.min(0.9, g / (g + c.passive)) : 0;
  };
  const base = baseWatts(f);
  const idleFan = idle.fan[idle.fan.length - 1];
  const loadFan = mean(tail(stress.fan));
  const walls = fit.shell.walls;
  const surface = surfaceOf(
    fit,
    {
      spread: {
        top: SPREAD[build.materials.deck] ?? 0.35,
        bottom: SPREAD[build.materials.floor] ?? 0.35,
      },
      thickness: { top: walls.top, bottom: walls.bottom },
    },
    {
      cpuW: idle.cpuW[idle.cpuW.length - 1],
      gpuW: idle.gpuW[idle.gpuW.length - 1],
      base,
      fan: idleFan,
      carried: carried(idleFan),
      mean: meanAt(idle, idle.sink.length - 1),
    },
    {
      cpuW: mean(tail(stress.cpuW)),
      gpuW: mean(tail(stress.gpuW)),
      base,
      fan: loadFan,
      carried: carried(loadFan),
      mean: loadMean,
    },
    AMBIENT,
  );
  const peakSkin = Math.max(...surface.load.top, ...surface.load.bottom);
  return {
    profile: id,
    firstRun: multi(head(loop.cpuW)),
    sustained: multi(tail(loop.cpuW)),
    cpuWatts: { first: mean(head(loop.cpuW)), sustained: mean(tail(loop.cpuW)) },
    graphics: { first: gfxRun(0), sustained: gfxRun(DURATION - RUN) },
    gpuWatts: f.gpu
      ? { first: mean(head(game.gpuW)), sustained: mean(tail(game.gpuW)) }
      : null,
    dieTemp: TRACE.map((at) => ({ at, c: loop.cpuDie[at - 1] })),
    peakDie: Math.max(...loop.cpuDie, ...stress.cpuDie),
    peakSkin,
    surface,
    noise: {
      idle: noise(c, idle.fan[idle.fan.length - 1]),
      load: noise(c, fanPeak),
      sustained: noise(c, stress.fan[stress.fan.length - 1]),
    },
  };
}

// ------------------------------------------------------------------ battery

function batteryFor(
  f: Facts,
  c: Cooler,
  profiles: Record<ProfileId, Profile>,
  thermal: boolean,
): Battery {
  const runtime: Battery["runtime"] = {};
  const draw: Battery["draw"] = {};
  const cpu = f.cpu as PowerSpec;
  const old = f.year < 2012;
  const base = baseWatts(f);
  const gpuIdle = f.gpu?.idle ?? 0;
  for (const id of PROFILES) {
    const p = profiles[id];
    if (!p.enabled) continue;
    // Package power reaches the battery through the regulators at about 90 percent.
    const pkg = (w: number) => w / 0.9;
    const idle = base + pkg(cpu.idle + gpuIdle) + displayWatts(f, "idle");
    const web =
      base +
      0.4 +
      pkg(cpu.idle + gpuIdle + 0.05 * p.cpu.sustained) +
      displayWatts(f, "web");
    const video =
      base +
      pkg(cpu.idle + gpuIdle + (old ? 0.2 * p.cpu.sustained : 0.8)) +
      (old && f.optical ? 2 : 0) +
      displayWatts(f, "video");
    let loadPkg = p.cpu.sustained + (f.gpu ? p.gpu.sustained : 0);
    if (thermal) {
      const s = run(f, c, p, "stress", DURATION);
      loadPkg = mean(tail(s.cpuW)) + mean(tail(s.gpuW));
    }
    // A pack cannot deliver much past 1.5 C; the machine caps itself on battery.
    const load = Math.min(1.5 * f.wh, base + pkg(loadPkg) + displayWatts(f, "web"));
    const d = { idle, web, video, load };
    draw[id] = d;
    const usable = f.wh * 0.95;
    runtime[id] = {
      idle: usable / idle,
      web: usable / web,
      video: usable / video,
      load: usable / load,
    };
  }
  return { wh: f.wh, balanced: balancedProfile(profiles), runtime, draw };
}

// ------------------------------------------------------------------ entry point

/** Every raw measurement of a build. Each is null until it can be computed. */
export function simulate(
  build: Build,
  fit: Fit = solve(build),
  content: Content = CONTENT,
): Measurements {
  const profiles = profilesOf(build, content);
  const top = topProfile(profiles);
  const f = facts(build, fit, content);
  const out: Measurements = {
    durability: durabilityOf(build, content),
    profiles,
    top,
    performance: null,
    battery: null,
    cooling: null,
    lab: labOf(build, content),
  };
  if (!f.cpu) return out;
  const p = profiles[top];
  out.performance = {
    single: singleAt(f.cpu, p.cpu.boost),
    multi: scoreAt(f.cpu, p.cpu.boost),
    graphics: f.gpu ? scoreAt(f.gpu, p.gpu.boost) : igpuAt(f.cpu, p.cpu.sustained),
  };
  // Cooling results wait until every required part is in.
  const complete = !fit.problems.some(
    (q) => q.kind === "compat" && q.code === "missing",
  );
  const c = cooler(f);
  if (f.wh > 0 && f.panel) out.battery = batteryFor(f, c, profiles, complete);
  if (complete) out.cooling = coolingFor(f, c, profiles, fit, build);
  return out;
}

// ------------------------------------------------------------------ timelines

export interface Timeline {
  cpuW: number[];
  gpuW: number[];
  fan: number[];
  cpuDie: number[];
  /** Fan noise, dB(A). */
  db: number[];
  /** Multi-core score (Cinebench R23 scale) each second. */
  multi: number[];
  /** Graphics score (Time Spy scale) each second. */
  graphics: number[];
}

/**
 * Second-by-second run of one load on one profile, from a cool start. The
 * cafe plays these back so a poorly cooled build slows as it heats up.
 */
export function timeline(
  build: Build,
  fit: Fit,
  profile: ProfileId,
  load: "idle" | "cpu" | "gpu",
  seconds: number = DURATION,
  content: Content = CONTENT,
): Timeline {
  const f = facts(build, fit, content);
  const c = cooler(f);
  const p = profilesOf(build, content)[profile];
  const t = run(f, c, p, load, seconds);
  return {
    cpuW: t.cpuW,
    gpuW: t.gpuW,
    fan: t.fan,
    cpuDie: t.cpuDie,
    db: t.fan.map((x) => noise(c, x)),
    multi: t.cpuW.map((w) => (f.cpu ? scoreAt(f.cpu, w) : 0)),
    graphics: t.cpuW.map((w, i) => graphicsAt(f, w, t.gpuW[i])),
  };
}
