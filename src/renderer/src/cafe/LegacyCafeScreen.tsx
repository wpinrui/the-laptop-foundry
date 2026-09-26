import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTENT,
  gameEdition,
  KILNBENCH,
  colourHex,
  decorOf,
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
import { balancedProfile } from "../engine/sim/profiles";
import { lookOf } from "../review/look";
import { eraOf, ReviewIndex, ReviewSite } from "../review/ReviewSite";
import { token } from "../viewer/theme";
import { usePhotos } from "../viewer/Photos";
import { surfacesOf } from "../viewer/Scene";
import { Cafe } from "./Cafe";
import "./cafe.css";

// The cafe's screen as it was before the in-game OS, for the eras whose OS
// has not landed yet. Goes when the last era's OS does.

type App = "desktop" | "kiln" | "ash" | "web";
const BATTERY_SPEED = 30;
const INDEX = "index";
const LATEST = Math.max(...CONTENT.eras.map((e) => e.year));
const GAME_EDITIONS: number[] = [];
for (let y = 2005; y <= gameEdition(LATEST); y += 3) GAME_EDITIONS.push(y);
const PROFILE_NAME: Record<ProfileId, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

// ------------------------------------------------------------------ fan audio

/** Fan noise synthesised from filtered white noise and a faint blade tone. */
function useFanAudio(db: number, fan: number, muted: boolean) {
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
    const level = muted || db <= 23 ? 0 : 10 ** ((db - 68) / 20);
    n.gain.gain.setTargetAtTime(level, t, 0.4);
    n.toneGain.gain.setTargetAtTime(level * 0.08, t, 0.4);
    n.band.frequency.setTargetAtTime(350 + fan * 1500, t, 0.4);
    n.tone.frequency.setTargetAtTime(110 + fan * 420, t, 0.4);
  }, [db, fan, muted]);
}

// ------------------------------------------------------------------ canvases

function useCanvasLoop(
  draw: (g: CanvasRenderingContext2D, w: number, h: number, now: number) => void,
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    let id = 0;
    const loop = (now: number) => {
      const c = ref.current;
      const g = c?.getContext("2d");
      if (c && g) drawRef.current(g, c.width, c.height, now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return ref;
}

const TILES_X = 16;
const TILES_Y = 10;

/** Kilnbench: tiles render in at the processor's simulated speed. */
function Kiln({
  progress,
  result,
  refuses,
  running,
  onRun,
  name,
}: {
  progress: number;
  result: number | null;
  refuses: boolean;
  running: boolean;
  onRun: () => void;
  name: string;
}) {
  const ref = useCanvasLoop((g, w, h) => {
    const done = Math.floor(progress * TILES_X * TILES_Y);
    const tw = w / TILES_X;
    const th = h / TILES_Y;
    g.fillStyle = token("kiln-empty");
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < done; i++) {
      // Buckets spiral out from the centre, as renderers do.
      const k = ORDER[i];
      const x = k % TILES_X;
      const y = Math.floor(k / TILES_X);
      const grad = g.createLinearGradient(x * tw, y * th, (x + 1) * tw, (y + 1) * th);
      grad.addColorStop(0, token("kiln-tile-a"));
      grad.addColorStop(1, token("kiln-tile-b"));
      g.fillStyle = grad;
      g.fillRect(x * tw + 1, y * th + 1, tw - 2, th - 2);
    }
  });
  return (
    <div className="kiln">
      <canvas ref={ref} width={480} height={300} />
      <div className="kiln-side">
        <b>{name}</b>
        {refuses ? (
          <span>Unsupported</span>
        ) : (
          <>
            <button type="button" disabled={running} onClick={onRun}>
              Run
            </button>
            <span className="kiln-score">
              {result !== null ? `${Math.round(result)} pts` : running ? `${Math.round(progress * 100)} %` : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const ORDER: number[] = (() => {
  const cx = (TILES_X - 1) / 2;
  const cy = (TILES_Y - 1) / 2;
  return Array.from({ length: TILES_X * TILES_Y }, (_, i) => i).sort((a, b) => {
    const da = Math.hypot((a % TILES_X) - cx, Math.floor(a / TILES_X) - cy);
    const db = Math.hypot((b % TILES_X) - cx, Math.floor(b / TILES_X) - cy);
    return da - db;
  });
})();

/** Ashfall: a mock of the game, redrawn only as often as the simulated frame rate allows. */
function Ash({ fps, refuses }: { fps: number; refuses: boolean }) {
  const last = useRef(0);
  const frame = useRef(0);
  const shown = useRef(0);
  const counted = useRef({ at: 0, frames: 0 });
  const [measured, setMeasured] = useState(0);
  const ref = useCanvasLoop((g, w, h, now) => {
    if (refuses || fps <= 0) return;
    if (now - last.current < 1000 / fps) return;
    last.current = now;
    frame.current++;
    shown.current++;
    if (now - counted.current.at > 1000) {
      setMeasured(shown.current);
      shown.current = 0;
      counted.current.at = now;
    }
    const t = frame.current / 30;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, token("ash-sky"));
    sky.addColorStop(1, token("ash-sun"));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const ridge = (colour: string, base: number, amp: number, speed: number) => {
      g.fillStyle = token(colour);
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const u = x / w + t * speed;
        g.lineTo(x, base + Math.sin(u * 9) * amp + Math.sin(u * 23) * amp * 0.4);
      }
      g.lineTo(w, h);
      g.fill();
    };
    ridge("ash-ridge", h * 0.55, h * 0.06, 0.05);
    ridge("ash-ground", h * 0.72, h * 0.04, 0.15);
    g.fillStyle = token("ash-flake");
    for (let i = 0; i < 80; i++) {
      const x = ((i * 97 + t * 40 * (1 + (i % 3))) % w + w) % w;
      const y = ((i * 53 + t * 60 * (1 + (i % 2))) % h + h) % h;
      g.fillRect(x, y, 2, 2);
    }
  });
  return (
    <div className="ash">
      {refuses ? (
        <div className="ash-refuse">Unsupported</div>
      ) : (
        <>
          <canvas ref={ref} width={640} height={360} />
          <span className="ash-fps">{measured} fps</span>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ screen

export function LegacyCafeScreen({
  subject,
  library = [],
  onBack,
  sound,
  onSound,
}: {
  subject: Subject;
  /** The player's reviewed models, for the review site. */
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
  const benchR = useMemo(() => results(build, m, benchYear), [build, m, benchYear]);
  const gameR = useMemo(() => results(build, m, gameYear), [build, m, gameYear]);
  const enabled = PROFILES.filter((id) => m.profiles[id].enabled);
  const [profile, setProfile] = useState<ProfileId>(() => balancedProfile(m.profiles));
  const [app, setApp] = useState<App>("desktop");
  const [plugged, setPlugged] = useState(false);
  const [wh, setWh] = useState(() => m.battery?.wh ?? 0);
  const [heat, setHeat] = useState(0);
  const [kiln, setKiln] = useState({ running: false, progress: 0, elapsed: 0, result: null as number | null });
  const [history, setHistory] = useState<string[]>([INDEX]);

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
  const load: "cpu" | "gpu" | null = off ? null : kiln.running ? "cpu" : app === "ash" ? "gpu" : null;
  const i = Math.min(tl.cpu.db.length - 1, Math.floor(heat));
  const idleDb = tl.idle.db[tl.idle.db.length - 1];
  const idleFan = tl.idle.fan[tl.idle.fan.length - 1];
  const active = load ? tl[load] : tl.cpu;
  const db = off ? 0 : load ? active.db[i] : Math.max(idleDb, heat > 0 ? tl.cpu.db[i] : 0);
  const fan = off ? 0 : load ? active.fan[i] : Math.max(idleFan, heat > 0 ? tl.cpu.fan[i] : 0);
  useFanAudio(db, fan, !sound);

  const edition = KILNBENCH.find((e) => e.year === benchYear) ?? KILNBENCH[0];
  const eraRef = build.year < 2012 ? 600 : build.year < 2020 ? 5000 : 20000;
  const work = 40 * eraRef;
  const ash = gameR?.games.find((g) => g.id === "ashfall");
  const ashHigh = ash?.runs?.find((x) => x.preset === "high" && !x.native);
  const gfxRef = m.cooling?.graphics.sustained ?? 1;
  const fps = ashHigh ? (ashHigh.fps * tl.gpu.graphics[i]) / gfxRef : 0;

  // One tick a quarter second: heat, benchmark progress and battery.
  const state = useRef({ load, kiln, plugged, app, off, heat });
  state.current = { load, kiln, plugged, app, off, heat };
  useEffect(() => {
    const dt = 0.25;
    const id = setInterval(() => {
      const s = state.current;
      setHeat((h) => (s.load ? Math.min(tl.cpu.db.length - 1, h + dt) : Math.max(0, h - 2 * dt)));
      if (s.kiln.running) {
        setKiln((k) => {
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

  const plug = useCallback(() => setPlugged((v) => !v), []);

  const look = lookOf(panelOf(build));
  const era = eraOf(build.year);
  const current = history[history.length - 1];
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

  const pct = battery ? Math.round((wh / battery.wh) * 100) : 100;
  const desktop = (
    <div className={`desk desk-${era}`}>
      {off ? (
        <div className="desk-off" />
      ) : (
        <>
          <div className="desk-icons">
            <button type="button" onClick={() => setApp("kiln")}>
              <i className="ico kiln-ico" />
              Kilnbench
            </button>
            <button type="button" onClick={() => setApp("ash")}>
              <i className="ico ash-ico" />
              Ashfall
            </button>
            <button
              type="button"
              onClick={() => {
                setHistory([INDEX]);
                setApp("web");
              }}
            >
              <i className="ico web-ico" />
              Notebookcheck
            </button>
          </div>
          {app !== "desktop" && (
            <div className="win">
              <div className="win-bar">
                {app === "web" && history.length > 1 && (
                  <button type="button" onClick={() => setHistory((h) => h.slice(0, -1))}>
                    ‹
                  </button>
                )}
                <span />
                {app === "kiln" && (
                  <select
                    value={benchYear}
                    aria-label="Kilnbench edition"
                    disabled={kiln.running}
                    onChange={(e) => {
                      setBenchYear(Number(e.target.value));
                      setKiln({ running: false, progress: 0, elapsed: 0, result: null });
                    }}
                  >
                    {KILNBENCH.map((e) => (
                      <option key={e.year} value={e.year}>
                        Kilnbench {e.year}
                      </option>
                    ))}
                  </select>
                )}
                {app === "ash" && (
                  <select
                    value={gameYear}
                    aria-label="Ashfall edition"
                    onChange={(e) => setGameYear(Number(e.target.value))}
                  >
                    {GAME_EDITIONS.map((y) => (
                      <option key={y} value={y}>
                        Ashfall {y}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setApp("desktop");
                    setKiln((k) => ({ ...k, running: false }));
                  }}
                >
                  ×
                </button>
              </div>
              <div className="win-body">
                {app === "kiln" && (
                  <Kiln
                    name={benchR?.bench.name ?? `Kilnbench ${edition.year}`}
                    refuses={!benchR || benchR.bench.multi === null}
                    running={kiln.running}
                    progress={kiln.progress}
                    result={kiln.result}
                    onRun={() => setKiln({ running: true, progress: 0, elapsed: 0, result: null })}
                  />
                )}
                {app === "ash" && <Ash fps={fps} refuses={!ashHigh} />}
                {app === "web" && current === INDEX && (
                  <ReviewIndex
                    entries={entries}
                    era={era}
                    onOpen={(id) => setHistory((h) => [...h, id])}
                  />
                )}
                {app === "web" && review && (
                  <ReviewSite
                    review={review}
                    onOpen={(id) => setHistory((h) => [...h, id])}
                    onHome={() => setHistory([INDEX])}
                    photos={photos}
                  />
                )}
              </div>
            </div>
          )}
          <div className="desk-bar">
            <select
              value={profile}
              aria-label="power profile"
              onChange={(e) => setProfile(e.target.value as ProfileId)}
            >
              {enabled.map((id) => (
                <option key={id} value={id}>
                  {PROFILE_NAME[id]}
                </option>
              ))}
            </select>
            {battery && (
              <span className={pct < 15 ? "batt low" : "batt"}>
                <i style={{ width: `${pct}%` }} />
                {pct}%{plugged ? " +" : ""}
              </span>
            )}
          </div>
        </>
      )}
    </div>
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
