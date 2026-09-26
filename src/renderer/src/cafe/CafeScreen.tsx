import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import wallpaper from "../assets/os/wallpaper.jpg";
import {
  CONTENT,
  colourHex,
  decorOf,
  factsOf,
  gameEdition,
  KILNBENCH,
  panelOf,
  PROFILES,
  type ProfileId,
  RIVALS,
  results,
  reviewOf,
  rivalSubject,
  type Subject,
  simulate,
  solve,
  timeline,
} from "../engine";
import type { Preset } from "../engine/bench";
import { balancedProfile } from "../engine/sim/profiles";
import { BOOT_MS } from "../os/art";
import {
  AshApp,
  Boot,
  Browser,
  Desktop,
  Empty,
  Flyout,
  KilnApp,
  lookOf as osLook,
  type RankRow,
  Screen,
  SysApp,
  Toast,
  Win,
} from "../os/Os";
import { SYS_SIZE, SYS_TITLE } from "../os/shots";
import { sysGroups } from "../os/sys";
import { type AppId, duration, ownerOf, type Power } from "../os/types";
import { lookOf } from "../review/look";
import { eraOf, ReviewIndex, ReviewSite } from "../review/ReviewSite";
import { usePhotos } from "../viewer/Photos";
import { surfacesOf } from "../viewer/Scene";
import { Cafe } from "./Cafe";
import "./cafe.css";

// The cafe: the laptop on a table, running its own OS and what the
// simulation says it can. Time runs one to one, except the battery, which
// drains 30 times faster.

const BATTERY_SPEED = 30;
const INDEX = "index";
const LATEST = Math.max(...CONTENT.eras.map((e) => e.year));
const GAME_EDITIONS: number[] = [];
for (let y = 2005; y <= gameEdition(LATEST); y += 3) GAME_EDITIONS.push(y);
const BENCH_EDITIONS = KILNBENCH.map((e) => e.year);
/** The low battery notice: at this level, for this long. */
const LOW_PCT = 10;
const LOW_MS = 6000;

// What the graphics lacks, in the words an error box would use.
const FEATURE: Record<string, string> = {
  dx9: "pixel shader 2.0",
  dx9c: "shader model 3.0",
  dx10: "unified shaders",
  dx11: "hardware tessellation",
  dx12: "low-level rendering",
  dx12u: "mesh shaders",
  rt: "hardware ray tracing",
};

const slug = (s: string) =>
  s
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Kilnbench's ranking: this laptop among rivals of the edition's era, closest scores first. */
function rankingOf(own: string, ownScore: number | null, edition: number): RankRow[] {
  const era = eraOf(edition);
  const best = new Map<string, number>();
  for (const r of RIVALS) {
    if (eraOf(r.build.year) !== era) continue;
    try {
      const f = factsOf(rivalSubject(r));
      const score = results(r.build, f.m, edition)?.bench.multi;
      const id = r.build.parts.processor?.[0]?.part;
      const name = CONTENT.parts.find((p) => p.id === id)?.name;
      if (!score || !name || name === own) continue;
      best.set(name, Math.max(best.get(name) ?? 0, score));
    } catch {}
  }
  const rivals = [...best].map(([name, score]) => ({ name, score, own: false }));
  const near = ownScore === null ? rivals.sort((a, b) => b.score - a.score) : rivals.sort((a, b) => Math.abs(a.score - ownScore) - Math.abs(b.score - ownScore));
  const rows: RankRow[] = [...near.slice(0, 3), { name: own, score: ownScore, own: true }];
  return rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// ------------------------------------------------------------------ fan audio

/** Fan noise synthesised from filtered white noise and a faint blade tone. */
function useFanAudio(db: number, fan: number, muted: boolean, volume: number) {
  const nodes = useRef<{
    ctx: AudioContext;
    gain: GainNode;
    band: BiquadFilterNode;
    tone: OscillatorNode;
    toneGain: GainNode;
  } | null>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(band).connect(gain).connect(ctx.destination);
    const tone = ctx.createOscillator();
    tone.type = "triangle";
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0;
    tone.connect(toneGain).connect(ctx.destination);
    src.start();
    tone.start();
    nodes.current = { ctx, gain, band, tone, toneGain };
    // Browsers hold audio until the first gesture.
    const resume = () => ctx.resume();
    window.addEventListener("pointerdown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      ctx.close();
      nodes.current = null;
    };
  }, []);

  useEffect(() => {
    const n = nodes.current;
    if (!n) return;
    const t = n.ctx.currentTime;
    // The OS volume slider scales the fan; 60 is as loud as it really is.
    const level = muted || db <= 23 ? 0 : 10 ** ((db - 68) / 20) * (volume / 60);
    n.gain.gain.setTargetAtTime(level, t, 0.4);
    n.toneGain.gain.setTargetAtTime(level * 0.08, t, 0.4);
    n.band.frequency.setTargetAtTime(350 + fan * 1500, t, 0.4);
    n.tone.frequency.setTargetAtTime(110 + fan * 420, t, 0.4);
  }, [db, fan, muted, volume]);
}

// ------------------------------------------------------------------ screen

type Phase = "boot" | "on" | "off";

export function CafeScreen(props: {
  subject: Subject;
  /** The player's reviewed models, for the review site. */
  library?: Subject[];
  onBack: () => void;
  sound: boolean;
  onSound: (on: boolean) => void;
}) {
  return <OsCafeScreen {...props} />;
}

function OsCafeScreen({
  subject,
  library = [],
  onBack,
  sound,
  onSound,
}: {
  subject: Subject;
  library?: Subject[];
  onBack: () => void;
  sound: boolean;
  onSound: (on: boolean) => void;
}) {
  const build = subject.build;
  const fit = useMemo(() => solve(build), [build]);
  const m = useMemo(() => simulate(build, fit), [build, fit]);
  // Any edition up to the latest can run; its feature checks decide whether it does.
  const [benchYear, setBenchYear] = useState(
    () => [...KILNBENCH].reverse().find((e) => e.year <= build.year)?.year ?? KILNBENCH[0].year,
  );
  const [gameYear, setGameYear] = useState(() => gameEdition(build.year));
  const [preset, setPreset] = useState<Preset>("high");
  const benchR = useMemo(() => results(build, m, benchYear), [build, m, benchYear]);
  const gameR = useMemo(() => results(build, m, gameYear), [build, m, gameYear]);
  const enabled = PROFILES.filter((id) => m.profiles[id].enabled);
  const [profile, setProfile] = useState<ProfileId>(() => balancedProfile(m.profiles));
  const [app, setApp] = useState<AppId | null>(null);
  const [minimised, setMinimised] = useState(false);
  const [phase, setPhase] = useState<Phase>("boot");
  const [trayOpen, setTrayOpen] = useState(false);
  const [volume, setVolume] = useState(60);
  const [toast, setToast] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [plugged, setPlugged] = useState(false);
  const [wh, setWh] = useState(() => m.battery?.wh ?? 0);
  const [heat, setHeat] = useState(0);
  const [kiln, setKiln] = useState({ running: false, progress: 0, elapsed: 0, result: null as number | null });
  const [web, setWeb] = useState({ list: [INDEX], at: 0, n: 0 });
  const now = useNow();

  const tl = useMemo(
    () => ({
      cpu: timeline(build, fit, profile, "cpu"),
      gpu: timeline(build, fit, profile, "gpu"),
      idle: timeline(build, fit, profile, "idle", 600),
    }),
    [build, fit, profile],
  );

  const battery = m.battery;
  const off = !!battery && wh <= 0 && !plugged;
  const ash = gameR?.games.find((g) => g.id === "ashfall");
  const ashRun = ash?.runs?.find((x) => x.preset === preset && !x.native);
  const running = phase === "on" && !off;
  const load: "cpu" | "gpu" | null = !running ? null : kiln.running ? "cpu" : app === "ash" && ashRun ? "gpu" : null;
  const i = Math.min(tl.cpu.db.length - 1, Math.floor(heat));
  const last = (a: number[]) => a[a.length - 1] ?? 0;
  const active = load ? tl[load] : tl.cpu;
  const db = off ? 0 : load ? active.db[i] : Math.max(last(tl.idle.db), heat > 0 ? tl.cpu.db[i] : 0);
  const fan = off ? 0 : load ? active.fan[i] : Math.max(last(tl.idle.fan), heat > 0 ? tl.cpu.fan[i] : 0);
  useFanAudio(db, fan, !sound, volume);

  const edition = KILNBENCH.find((e) => e.year === benchYear) ?? KILNBENCH[0];
  const eraRef = build.year < 2012 ? 600 : build.year < 2020 ? 5000 : 20000;
  const work = 40 * eraRef;
  const gfxRef = m.cooling?.graphics.sustained ?? 1;
  const fps = ashRun ? (ashRun.fps * tl.gpu.graphics[i]) / gfxRef : 0;

  // One tick a quarter second: heat, benchmark progress and battery.
  const state = useRef({ load, kiln, plugged, app, heat });
  state.current = { load, kiln, plugged, app, heat };
  useEffect(() => {
    const dt = 0.25;
    const id = setInterval(() => {
      const s = state.current;
      setHeat((h) => (s.load ? Math.min(tl.cpu.db.length - 1, h + dt) : Math.max(0, h - 2 * dt)));
      if (s.kiln.running) {
        setKiln((k) => {
          if (!k.running) return k;
          const score = tl.cpu.multi[Math.min(tl.cpu.multi.length - 1, Math.floor(s.heat))];
          const progress = Math.min(1, k.progress + (score * dt) / work);
          const elapsed = k.elapsed + dt;
          if (progress >= 1)
            return { running: false, progress: 1, elapsed, result: (work / elapsed) * edition.scale };
          return { ...k, progress, elapsed };
        });
      }
      if (battery) {
        const d = battery.draw[profile] ?? battery.draw[battery.balanced];
        const draw = !d ? 0 : s.load ? d.load : s.app === "web" ? d.web : d.idle;
        setWh((w) =>
          s.plugged
            ? Math.min(battery.wh, w + (battery.wh / 120) * dt)
            : Math.max(0, w - (draw * BATTERY_SPEED * dt) / 3600),
        );
      }
    }, 250);
    return () => clearInterval(id);
  }, [tl, work, edition.scale, battery, profile]);

  // The battery running out shuts everything; power back boots it again.
  useEffect(() => {
    if (off) {
      setPhase("off");
      setApp(null);
      setTrayOpen(false);
      setToast(false);
      setKiln((k) => ({ ...k, running: false }));
    } else setPhase((p) => (p === "off" ? "boot" : p));
  }, [off]);
  useEffect(() => {
    if (phase !== "boot") return;
    const id = setTimeout(() => setPhase("on"), BOOT_MS + 300);
    return () => clearTimeout(id);
  }, [phase]);

  const plug = useCallback(() => setPlugged((v) => !v), []);

  const pct = battery ? Math.round((wh / battery.wh) * 100) : 100;
  // The low battery notice shows once each time the level first drops under 10%.
  const warned = useRef(false);
  useEffect(() => {
    if (!battery) return;
    if (pct >= LOW_PCT) warned.current = false;
    else if (!plugged && !warned.current && phase === "on") {
      warned.current = true;
      setToast(true);
    }
  }, [pct, plugged, battery, phase]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(false), LOW_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const d = battery ? (battery.draw[profile] ?? battery.draw[battery.balanced]) : undefined;
  const drawW = !d ? 0 : load ? d.load : app === "web" ? d.web : d.idle;
  const power: Power = {
    battery: !!battery,
    pct,
    plugged,
    time: !battery
      ? ""
      : plugged
        ? wh >= battery.wh - 0.01
          ? "fully charged"
          : `${duration((battery.wh - wh) / (battery.wh / 120) / 60)} to full`
        : drawW > 0
          ? `${duration(((wh / drawW) * 60) / BATTERY_SPEED)} left`
          : "",
  };

  const look = lookOf(panelOf(build));
  const era = eraOf(build.year);
  const owner = useMemo(() => ownerOf(build, subject.company), [build, subject.company]);
  const model = `${subject.company} ${subject.name}`.trim();
  const current = web.list[web.at];
  const entries = useMemo(() => {
    // Only reviewed models have a review; an unreviewed one is not listed.
    return [
      ...library.map((x) => ({ subject: x, own: true })),
      ...RIVALS.map((x) => ({ subject: rivalSubject(x), own: false })),
    ];
  }, [library]);
  const shown = useMemo(() => {
    if (app !== "web" || current === INDEX) return null;
    return entries.find((x) => x.subject.id === current)?.subject ?? subject;
  }, [app, current, subject, entries]);
  const review = useMemo(() => (shown ? reviewOf(shown) : null), [shown]);
  const { photos, shoot } = usePhotos(shown);

  const cpuName = useMemo(() => {
    const id = build.parts.processor?.[0]?.part;
    return CONTENT.parts.find((p) => p.id === id)?.name ?? "This laptop";
  }, [build]);
  const ranking = useMemo(
    () => rankingOf(cpuName, benchR?.bench.multi ?? null, benchYear),
    [cpuName, benchR, benchYear],
  );
  const gpuName = useMemo(() => {
    const g = CONTENT.parts.find((p) => p.id === build.parts.graphics?.[0]?.part);
    const c = CONTENT.parts.find((p) => p.id === build.parts.processor?.[0]?.part);
    return g?.name ?? String(c?.info?.igpu ?? "integrated graphics");
  }, [build]);
  const missing = (ash?.missing ?? []).map((f) => FEATURE[f] ?? f);
  const refusal =
    app === "ash" && !ashRun && dismissed !== gameYear
      ? `Ashfall ${gameYear} needs a graphics processor with ${missing.length ? missing.join(" and ") : "newer features"}. This laptop's ${gpuName} does not have ${missing.length > 1 ? "them" : "it"}.`
      : null;

  const open = (a: AppId) => {
    if (a === app) {
      setMinimised(false);
      return;
    }
    // One app at a time: opening another closes the last.
    setKiln((k) => ({ ...k, running: false }));
    setMinimised(false);
    setDismissed(null);
    if (a === "web") setWeb((w) => ({ list: [INDEX], at: 0, n: w.n + 1 }));
    setApp(a);
  };
  const close = () => {
    setKiln((k) => ({ ...k, running: false }));
    setApp(null);
  };
  const go = (id: string) => setWeb((w) => ({ list: [...w.list.slice(0, w.at + 1), id], at: w.at + 1, n: w.n }));

  const osEra = osLook(era);
  const webTitle = shown ? `${shown.company} ${shown.name} review` : "Notebookcheck";
  const webUrl = `${osEra === 2026 ? "" : "http://www."}notebookcheck.net${shown ? `/${slug(`${shown.company} ${shown.name}`)}-review` : ""}`;
  const live = {
    cpuGhz: load === "cpu" ? tl.cpu.cpuClock[i] : last(tl.idle.cpuClock),
    gpuMhz: load === "gpu" ? tl.gpu.gpuClock[i] : last(tl.idle.gpuClock),
  };

  const bar = {
    era,
    app,
    minimised,
    onOpen: open,
    onTask: () => setMinimised((v) => !v),
    power,
    muted: !sound,
    year: build.year,
    now,
    trayOpen,
    onTray: () => setTrayOpen((v) => !v),
  };
  const winProps = { hidden: minimised, onMin: () => setMinimised(true), onClose: close };

  let win: ReactNode = null;
  if (app === "kiln")
    win = (
      <Win app="kiln" title={`Kilnbench ${benchYear}`} w={1220} h={650} {...winProps}>
        <KilnApp
          era={era}
          editions={BENCH_EDITIONS}
          edition={benchYear}
          onEdition={(y) => {
            setBenchYear(y);
            setKiln({ running: false, progress: 0, elapsed: 0, result: null });
          }}
          running={kiln.running}
          progress={kiln.progress}
          result={kiln.result}
          refuses={!benchR || benchR.bench.multi === null}
          onRun={() => setKiln({ running: true, progress: 0, elapsed: 0, result: null })}
          onStop={() => setKiln({ running: false, progress: 0, elapsed: 0, result: null })}
          ranking={ranking}
        />
      </Win>
    );
  else if (app === "ash")
    win = (
      <Win app="ash" title={`Ashfall ${gameYear}`} w={99999} h={99999} {...winProps}>
        <AshApp
          era={era}
          editions={GAME_EDITIONS}
          edition={gameYear}
          onEdition={(y) => {
            setGameYear(y);
            setDismissed(null);
          }}
          preset={preset}
          onPreset={setPreset}
          fps={fps}
          detail={eraOf(gameYear)}
          refusal={refusal}
          onOk={() => setDismissed(gameYear)}
        />
      </Win>
    );
  else if (app === "web")
    win = (
      <Win app="web" title={osEra === 2026 ? "Notebookcheck" : webTitle} w={99999} h={99999} {...winProps}>
        <Browser
          era={era}
          title={webTitle}
          url={webUrl}
          canBack={web.at > 0}
          canForward={web.at < web.list.length - 1}
          onBack={() => setWeb((w) => ({ ...w, at: Math.max(0, w.at - 1) }))}
          onForward={() => setWeb((w) => ({ ...w, at: Math.min(w.list.length - 1, w.at + 1) }))}
          onReload={() => setWeb((w) => ({ ...w, n: w.n + 1 }))}
        >
          <div key={`${web.at}:${web.n}`}>
            {current === INDEX && <ReviewIndex entries={entries} era={era} onOpen={go} />}
            {review && <ReviewSite review={review} onOpen={go} onHome={() => go(INDEX)} photos={photos} />}
          </div>
        </Browser>
      </Win>
    );
  else if (app === "sys") {
    const [w, h] = SYS_SIZE[osEra];
    win = (
      <Win app="sys" title={SYS_TITLE[osEra]} w={w} h={h} {...winProps}>
        <SysApp era={era} groups={sysGroups(model, build, m, live, power)} onOk={close} />
      </Win>
    );
  }

  const desktop = (
    <Screen
      era={era}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (trayOpen && !t.closest(".os-fly, .os-tray-btn")) setTrayOpen(false);
      }}
    >
      {phase === "off" ? (
        <Empty />
      ) : (
        <>
          <Desktop {...bar} wallpaper={wallpaper}>
            {win}
            {trayOpen && (
              <Flyout
                era={era}
                power={power}
                profiles={enabled}
                profile={profile}
                onProfile={setProfile}
                volume={volume}
                onVolume={(v) => {
                  setVolume(v);
                  if (!sound && v > 0) onSound(true);
                }}
                muted={!sound}
                onMute={() => onSound(!sound)}
              />
            )}
            {toast && <Toast era={era} pct={pct} />}
          </Desktop>
          {phase === "boot" && <Boot era={era} owner={owner} />}
        </>
      )}
    </Screen>
  );

  const page = look ? (
    <div className="panel-page" style={{ width: look.width, height: look.height }}>
      <div className="scroller" style={{ filter: look.filter, overflow: "hidden" }}>
        {desktop}
      </div>
      {look.shift > 0 && <div className="shift" style={{ opacity: look.shift }} />}
      {look.glare > 0 && <div className="glare" style={{ opacity: look.glare }} />}
    </div>
  ) : null;

  const colour = (id: string) => colourHex(id);
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  const colours = useMemo(
    () => ({
      floor: colour(build.finish.floor.colour),
      deck: colour(build.finish.deck.colour),
      lid: colour(build.finish.lid.colour),
    }),
    [build],
  );
  return (
    <Cafe
      fit={fit}
      year={build.year}
      colours={colours}
      decor={decorOf(build)}
      surfaces={surfaces}
      page={look && page ? { node: page, width: look.width, height: look.height, mm: look.mm } : undefined}
      shoot={shoot}
      plugged={plugged}
      onPlug={plug}
      sound={sound}
      onSound={onSound}
      onLeave={onBack}
    />
  );
}
