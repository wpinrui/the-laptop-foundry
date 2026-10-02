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
  allRivals,
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
import { BOOT_MS, paintAsh } from "../os/art";
import { paintRally, paintTiles } from "../os/games";
import { paceOf, setPace } from "../os/pace";
import {
  APP_NAME,
  AshApp,
  Boot,
  Browser,
  Desktop,
  Empty,
  Flyout,
  type GamePaint,
  KilnApp,
  lookOf as osLook,
  type RankRow,
  Screen,
  SysApp,
  Toast,
  Win,
} from "../os/Os";
import { FoxApp, isCourtsUrl, useFox } from "../os/Fox";
import { type NoteDoc, NoteApp, useNote } from "../os/Note";
import { SYS_SIZE, SYS_TITLE } from "../os/shots";
import { sysGroups } from "../os/sys";
import { type AppId, duration, ownerOf, type Power } from "../os/types";
import { lookOf } from "../review/look";
import { panelFx } from "../panel/fx";
import { PanelPage } from "../panel/PanelPage";
import { setSpeakerOs, speakerOf } from "../panel/speaker";
import type { Room } from "../panel/tuning";
import { eraOf, ReviewIndex, ReviewSite } from "../review/ReviewSite";
import type { CampaignState } from "../engine/campaign";
import type { SavedModel } from "../../../preload/store";
import { StoreSite, type StoreSource } from "../store/StoreSite";
import { STORE } from "../store/name";
import { useWorldMarket } from "../world/data";
import { quarterIndex } from "../engine/campaign/rivals";
import { rivalsFor } from "../engine/market/field";
import { useMarket, useMarkets } from "../market/markets";
import { usePhotos } from "../viewer/Photos";
import { surfacesOf } from "../viewer/Scene";
import { Cafe } from "./Cafe";
import "./cafe.css";

// The cafe: the laptop on a table, running its own OS and what the
// simulation says it can. Time runs one to one, except the battery, which
// drains 30 times faster.

const BATTERY_SPEED = 30;
const INDEX = "index";
const NO_MODELS: SavedModel[] = [];
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

/** The games on the laptop: the engine's id for each app, and how it draws. */
const GAME_APPS: Partial<Record<AppId, { id: string; paint: GamePaint }>> = {
  ash: { id: "ashfall", paint: paintAsh },
  rally: { id: "coastline-rally", paint: paintRally },
  tiles: { id: "tavern-tiles", paint: paintTiles },
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
  for (const r of allRivals()) {
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
  /** None: the player came empty handed. */
  subject: Subject | null;
  /** The player's reviewed models, for the review site. */
  library?: Subject[];
  /** Back to the models screen; absent on a visit from the map. */
  onBack?: () => void;
  onMap: () => void;
  /** Arrives through the street entrance. */
  atDoor?: boolean;
  sound: boolean;
  onSound: (on: boolean) => void;
  /** The open company's saved Notepad documents. */
  notes?: NoteDoc[];
  onSaveNotes?: (docs: NoteDoc[]) => void;
  /** In a campaign, the retailer's site the laptop can browse. */
  shop?: Shop;
  /** Once the cafe has loaded, for the travel card over it. */
  onReady?: () => void;
}) {
  const { subject } = props;
  if (!subject)
    return (
      <Cafe shoot={null} plugged={false} onPlug={noop} sound={props.sound} onSound={props.onSound} onLeave={props.onBack} onMap={props.onMap} atDoor={props.atDoor} onReady={props.onReady} />
    );
  return <OsCafeScreen {...props} subject={subject} />;
}

const noop = () => {};

/** What the retailer's site on the laptop reads: the campaign, the player's models and the company's name. */
export interface Shop {
  state: CampaignState;
  models: SavedModel[];
  company: string;
}

function OsCafeScreen({
  subject,
  library = [],
  onBack,
  onMap,
  atDoor,
  sound,
  onSound,
  notes,
  onSaveNotes,
  shop,
  onReady,
}: {
  subject: Subject;
  library?: Subject[];
  onBack?: () => void;
  onMap: () => void;
  atDoor?: boolean;
  sound: boolean;
  onSound: (on: boolean) => void;
  notes?: NoteDoc[];
  onSaveNotes?: (docs: NoteDoc[]) => void;
  shop?: Shop;
  onReady?: () => void;
}) {
  const { build, fit, page, shoot, plugged, plug } = useLaptopOs({ subject, library, sound, onSound, notes, onSaveNotes, shop });
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
      laptop={{ fit, year: build.year, colours, decor: decorOf(build), surfaces }}
      page={page}
      shoot={shoot}
      plugged={plugged}
      onPlug={plug}
      sound={sound}
      onSound={onSound}
      onLeave={onBack}
      onMap={onMap}
      atDoor={atDoor}
      onReady={onReady}
    />
  );
}

/** The laptop's page as its screen shows it, with its size in px and mm. */
export interface OsPage {
  node: ReactNode;
  width: number;
  height: number;
  mm: { x: number; y: number };
}

/**
 * The laptop's own OS, running what the simulation says it can: the page its
 * screen shows, the hidden photo shoot the review site needs, and the charger.
 */
export function useLaptopOs({
  subject,
  library = [],
  sound,
  onSound,
  startPlugged = false,
  startOn = false,
  room = "cafe",
  notes,
  onSaveNotes,
  shop,
  perfect = false,
}: {
  subject: Subject;
  library?: Subject[];
  shop?: Shop;
  sound: boolean;
  onSound: (on: boolean) => void;
  startPlugged?: boolean;
  /** Already running, as when its screen was showing the desktop before: no boot. */
  startOn?: boolean;
  /** The room the laptop is in, for how its screen holds up against the light. */
  room?: Room;
  /** The open company's saved Notepad documents. Session-only when absent. */
  notes?: NoteDoc[];
  onSaveNotes?: (docs: NoteDoc[]) => void;
  /** An ideal machine: no panel simulation, no speaker model, no page pacing. */
  perfect?: boolean;
}): {
  build: Subject["build"];
  fit: ReturnType<typeof solve>;
  page: OsPage | undefined;
  shoot: ReactNode;
  plugged: boolean;
  plug: () => void;
} {
  const build = subject.build;
  const fit = useMemo(() => solve(build), [build]);
  const m = useMemo(() => simulate(build, fit), [build, fit]);
  // Any edition up to the latest can run; its feature checks decide whether it does.
  const [benchYear, setBenchYear] = useState(
    () => [...KILNBENCH].reverse().find((e) => e.year <= build.year)?.year ?? KILNBENCH[0].year,
  );
  const [gameYear, setGameYear] = useState(() => gameEdition(build.year));
  const markets = useMarkets();
  useMarket(build.year, benchYear);
  const [preset, setPreset] = useState<Preset>("high");
  const benchR = useMemo(() => results(build, m, benchYear), [build, m, benchYear]);
  const gameR = useMemo(() => results(build, m, gameYear), [build, m, gameYear]);
  const enabled = PROFILES.filter((id) => m.profiles[id].enabled);
  const [profile, setProfile] = useState<ProfileId>(() => balancedProfile(m.profiles));
  const [app, setApp] = useState<AppId | null>(null);
  const [minimised, setMinimised] = useState(false);
  const [phase, setPhase] = useState<Phase>(startOn ? "on" : "boot");
  const [trayOpen, setTrayOpen] = useState(false);
  const [volume, setVolume] = useState(60);
  const [toast, setToast] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [plugged, setPlugged] = useState(startPlugged);
  const [wh, setWh] = useState(() => m.battery?.wh ?? 0);
  const [heat, setHeat] = useState(0);
  const [kiln, setKiln] = useState({ running: false, progress: 0, elapsed: 0, result: null as number | null });
  const [web, setWeb] = useState({ list: [INDEX], at: 0, n: 0 });
  // The retailer's site: the product open, or null for the listing.
  const [shopPage, setShopPage] = useState<string | null>(null);
  const shopMarket = useWorldMarket(shop?.models ?? NO_MODELS);
  const shopQuarter = shop?.state.shelf.length ? shop.state.shelf[shop.state.shelf.length - 1].quarter : null;
  // Its market: the campaign's last finished quarter once there is one, else the laptop's own generated year.
  const storeSource: StoreSource = useMemo(
    () =>
      shop && shopQuarter
        ? { kind: "quarter", state: shop.state, market: shopMarket, quarter: shopQuarter }
        : { kind: "year", rivals: rivalsFor(build.year), year: build.year },
    [shop, shopQuarter, shopMarket, build.year, markets],
  );
  const fox = useFox(app === "fox", () => setApp(null));
  const note = useNote(notes, onSaveNotes);
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
  const gameApp = app ? GAME_APPS[app] : undefined;
  const game = gameApp ? gameR?.games.find((g) => g.id === gameApp.id) : undefined;
  const gameRun = game?.runs?.find((x) => x.preset === preset && !x.native);
  const running = phase === "on" && !off;
  const load: "cpu" | "gpu" | null = !running ? null : kiln.running ? "cpu" : gameRun ? "gpu" : null;
  const i = Math.min(tl.cpu.db.length - 1, Math.floor(heat));
  const last = (a: number[]) => a[a.length - 1] ?? 0;
  const active = load ? tl[load] : tl.cpu;
  const db = off ? 0 : load ? active.db[i] : Math.max(last(tl.idle.db), heat > 0 ? tl.cpu.db[i] : 0);
  const fan = off ? 0 : load ? active.fan[i] : Math.max(last(tl.idle.fan), heat > 0 ? tl.cpu.fan[i] : 0);
  useFanAudio(db, fan, !sound, volume);
  const speaker = useMemo(() => speakerOf(build, fit), [build, fit]);
  useEffect(() => {
    if (!perfect) setSpeakerOs(speaker, sound ? volume / 100 : 0);
  }, [speaker, sound, volume, perfect]);
  useEffect(() => () => setSpeakerOs(null, 0), []);
  const pace = useMemo(() => paceOf(build, m), [build, m]);
  useEffect(() => setPace(running && !perfect ? pace : null), [pace, running, perfect]);
  useEffect(() => () => setPace(null), []);

  const edition = KILNBENCH.find((e) => e.year === benchYear) ?? KILNBENCH[0];
  const eraRef = build.year < 2012 ? 600 : build.year < 2020 ? 5000 : 20000;
  const work = 40 * eraRef;
  const gfxRef = m.cooling?.graphics.sustained ?? 1;
  const fps = gameRun ? (gameRun.fps * tl.gpu.graphics[i]) / gfxRef : 0;

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
        const draw = !d ? 0 : s.load ? d.load : s.app === "web" || s.app === "fox" ? d.web : d.idle;
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
  const drawW = !d ? 0 : load ? d.load : app === "web" || app === "fox" ? d.web : d.idle;
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

  const panel = useMemo(() => panelOf(build), [build]);
  const look = useMemo(() => lookOf(panel), [panel]);
  const fx = useMemo(
    () => (panel && look ? panelFx(panel, look.width / panel.res[0], room) : null),
    [panel, look, room],
  );
  const era = eraOf(build.year);
  const owner = useMemo(() => ownerOf(build, subject.company), [build, subject.company]);
  const model = `${subject.company} ${subject.name}`.trim();
  const current = web.list[web.at];
  const entries = useMemo(() => {
    // Only reviewed models have a review; an unreviewed one is not listed.
    return [
      ...library.map((x) => ({ subject: x, own: true })),
      ...allRivals().map((x) => ({ subject: rivalSubject(x), own: false })),
    ];
  }, [library, markets]);
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
    [cpuName, benchR, benchYear, markets],
  );
  const gpuName = useMemo(() => {
    const g = CONTENT.parts.find((p) => p.id === build.parts.graphics?.[0]?.part);
    const c = CONTENT.parts.find((p) => p.id === build.parts.processor?.[0]?.part);
    return g?.name ?? String(c?.info?.igpu ?? "integrated graphics");
  }, [build]);
  const missing = (game?.missing ?? []).map((f) => FEATURE[f] ?? f);
  const refusal =
    app && gameApp && !gameRun && dismissed !== gameYear
      ? `${APP_NAME[app]} ${gameYear} needs a graphics processor with ${missing.length ? missing.join(" and ") : "newer features"}. This laptop's ${gpuName} does not have ${missing.length > 1 ? "them" : "it"}.`
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
    if (a === "shop") setShopPage(null);
    if (a === "fox") fox.reset();
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
  else if (app && gameApp)
    win = (
      <Win app={app} title={`${APP_NAME[app]} ${gameYear}`} w={99999} h={99999} {...winProps}>
        <AshApp
          key={app}
          app={app}
          paint={gameApp.paint}
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
  else if (app === "shop")
    win = (
      <Win app="shop" title={STORE[era].name} w={99999} h={99999} {...winProps}>
        <Browser
          era={era}
          title={STORE[era].name}
          url={`${STORE[era].domain}/laptops${shopPage ? `/${shopPage}` : ""}`}
          canBack={!!shopPage}
          canForward={false}
          onBack={() => setShopPage(null)}
          onReload={() => setShopPage((p) => p)}
        >
          <StoreSite
            key={storeSource.kind === "quarter" ? quarterIndex(storeSource.quarter) : storeSource.year}
            source={storeSource}
            company={shop?.company ?? subject.company}
            era={era}
            page={shopPage}
            onPage={setShopPage}
          />
        </Browser>
      </Win>
    );
  else if (app === "fox")
    win = (
      <Win
        app="fox"
        title={isCourtsUrl(fox.tab.list[fox.tab.at]) ? STORE[era].name : fox.tab.title === "New Tab" ? "Mozilla Firefox" : fox.tab.title}
        w={99999}
        h={99999}
        {...winProps}
      >
        <FoxApp fox={fox} courts={{ source: storeSource, company: shop?.company ?? subject.company, era }} />
      </Win>
    );
  else if (app === "note")
    win = (
      <Win app="note" title={`${note.doc.name || "Untitled"} - Notepad`} w={680} h={520} {...winProps}>
        <NoteApp note={note} />
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

  const page = perfect && look ? (
    <div style={{ width: look.width, height: look.height, overflow: "hidden" }}>{desktop}</div>
  ) : look && fx ? (
      <PanelPage fx={fx} width={look.width} height={look.height}>
        {desktop}
      </PanelPage>
    ) : null;

  return {
    build,
    fit,
    page: look && page ? { node: page, width: look.width, height: look.height, mm: look.mm } : undefined,
    shoot,
    plugged,
    plug,
  };
}
