import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { type Build, colourHex } from "../engine";
import { type CampaignState, quarterLabel } from "../engine/campaign";
import { overallOf, yearOf } from "../foundry/LaptopList";
import {
  type Commercial,
  commercialProgram,
  estimateTimeline,
  fitScenes,
  heard,
  MAX_LINE,
  MAX_LINES,
  MAX_SECONDS,
  multiplierOf,
  rateOf,
  type Scene,
  scriptLines,
  setsOf,
  spinWheel,
  WHEEL,
  wordsOf,
  wordTimes,
} from "../video/commercial";
import { adFile, loadVideo, usePosters, useVideos } from "../video/queue";
import type { Ratio } from "../video/scene";
import { adFacts, type ShortFacts } from "../video/script";
import { SET_IDS, type SetId } from "../video/sets";
import { adSubject } from "./eligible";
import { ICON, Icon } from "./icons";
import { frameSize, Preview } from "./Preview";
import { SET_NAMES, SetSwatch, Timeline } from "./Timeline";

// The editing desk's screen, grown out of the monitor to fill the window:
// pick the laptop, then write the script, lay scenes on its words, pick the
// shape, the sets and the voice, and Finish; or, when every laptop has had
// its commercial, the last one made. The logic is in video/commercial.ts;
// this is its face, after the designer's Studio.dc.html.

const PREVIEW_LINE = "This is how I sound reading your commercial.";
const u = (n: number) => `calc(${n} * var(--u))`;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lidColour = (m: SavedModel) => {
  try {
    return colourHex((m.build as Build).finish.lid.colour);
  } catch {
    return "var(--text)";
  }
};

/** How brisk a narrator is, one to three bars, once heard. */
function pace(voice: string): number {
  const r = rateOf(voice);
  if (r === null) return 0;
  return r < 2.7 ? 1 : r < 3.1 ? 2 : 3;
}

/** Plays a narrator's line; resolves when it has finished. Records how fast they read it. */
async function hear(voice: string, line: string): Promise<void> {
  const v = await window.api.video.say([line], voice).catch(() => null);
  const clip = v?.clips[0];
  if (!v || !clip) return;
  heard(voice, line, clip.length / v.sampleRate);
  const ctx = new AudioContext();
  const b = ctx.createBuffer(1, Math.max(1, clip.length), v.sampleRate);
  b.copyToChannel(new Float32Array(clip), 0);
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.connect(ctx.destination);
  await new Promise<void>((r) => {
    src.onended = () => r();
    src.start();
  });
  void ctx.close();
}

/** A dropdown in the editor's bar: the button, and its menu under it while open. */
function Drop({ open, onOpen, button, children, wide = false }: {
  open: boolean;
  onOpen: (on: boolean) => void;
  button: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="st-drop-wrap">
      <button type="button" className={`st-pick${open ? " open" : ""}`} onClick={() => onOpen(!open)}>
        {button}
        <span className="st-chev">
          <Icon d={ICON.down} size={14} width={2.5} />
        </span>
      </button>
      {open && <div className={`st-menu st-in${wide ? " wide" : ""}`}>{children}</div>}
    </div>
  );
}

/** A finished video in a box, painted from a hidden element as the TV does, so no overlay is lifted over the page. */
function BoxVideo({ url }: { url: string }) {
  const v = useRef<HTMLVideoElement>(null);
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let f = 0;
    const draw = () => {
      f = requestAnimationFrame(draw);
      const el = v.current;
      const cv = c.current;
      if (!el || !cv || el.readyState < 2 || !el.videoWidth) return;
      if (cv.width !== el.videoWidth) {
        cv.width = el.videoWidth;
        cv.height = el.videoHeight;
      }
      cv.getContext("2d")?.drawImage(el, 0, 0, cv.width, cv.height);
    };
    f = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(f);
  }, []);
  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: the captions are burnt into the video */}
      <video ref={v} className="st-src" src={url} autoPlay playsInline />
      <canvas ref={c} className="st-box-video" />
    </>
  );
}

export function StudioScreen({ company, campaign, models, stills, zoomed, origin, onLeave, onFinish }: {
  company: SavedCompany;
  campaign: CampaignState | null;
  /** The laptops that can still have their commercial. */
  models: SavedModel[];
  /** The pick cards' laptop stills, by model id, taken while the studio loaded. */
  stills: Record<string, string>;
  /** Grown to the full window; false shrinks it back into the screen. */
  zoomed: boolean;
  /** The desk screen on the page, px: where it grows out of. */
  origin: { x: number; y: number; w: number; h: number };
  onLeave: () => void;
  /** Records the commercial, carrying the wheel's result, and queues its render; the wheel then spins to `landed`. */
  onFinish: (c: Commercial, facts: ShortFacts, landed: number) => void;
}) {
  const [step, setStep] = useState<"pick" | "edit" | "done">(models.length > 0 ? "pick" : "done");
  const [picked, setPicked] = useState<string | null>(null);
  const model = models.find((m) => m.id === picked) ?? null;
  const index = company.commercials?.length ?? 0;
  const sandbox = !campaign;

  // ---------------------------------------------------------------- the editor's commercial
  const [id, setId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const defaults = setsOf({}, index);
  const [sceneSet, setSceneSet] = useState<SetId>(defaults.set);
  const [brollSet, setBrollSet] = useState<SetId>(defaults.set);
  const [voices, setVoices] = useState<string[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const [menu, setMenu] = useState<"voice" | "set" | "broll" | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const time = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    void window.api.video
      .voices()
      .catch((): string[] => [])
      .then((v) => {
        setVoices(v);
        setVoice((cur) => cur ?? (v.includes("michael") ? "michael" : (v[0] ?? null)));
      });
  }, []);
  // While it plays, the playhead and the clock follow the preview's time.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => tick((n) => n + 1), 50);
    return () => clearInterval(t);
  }, [playing]);

  const lines = useMemo(() => text.split("\n"), [text]);
  const words = useMemo(() => wordsOf(lines), [lines]);
  const kept = useMemo(() => fitScenes(scenes, words.length), [scenes, words.length]);
  const tl = estimateTimeline(lines, voice);
  const total = words.length ? tl.total : 0;
  const starts = useMemo(() => wordTimes(scriptLines(lines), tl), [lines, tl]);
  const facts = useMemo(() => {
    if (!model) return null;
    try {
      const score = campaign ? null : model.reviewed ? overallOf(model, company.name) : null;
      return adFacts(adSubject(model, company.name, campaign), campaign, score);
    } catch {
      return null;
    }
  }, [model, company.name, campaign]);
  const sets = { set: sceneSet, brollSet, paper: defaults.paper };
  const program = facts ? commercialProgram({ id, lines, scenes: kept, ratio, ...sets }, facts, tl) : null;
  const can = !!model && !!facts && words.length > 0 && total <= MAX_SECONDS;

  // The word under the playhead, and how far through it.
  const t = Math.min(time.current, Math.max(0, total - 0.01));
  let current = starts.findIndex((s, i) => t >= s && t < (starts[i + 1] ?? total));
  if (current < 0) current = Math.max(0, words.length - 1);
  const wordEnd = starts[current + 1] ?? total;
  const head = starts[current] !== undefined ? Math.min(1, (t - starts[current]) / Math.max(0.01, wordEnd - starts[current])) : 0;

  const togglePlay = () => {
    if (!words.length) return;
    if (!playing && time.current >= total - 0.05) time.current = 0;
    setPlaying((p) => !p);
  };
  const pick = (m: SavedModel) => {
    setPicked(m.id);
    setId(crypto.randomUUID());
    setText("");
    setScenes([]);
    setSelected(null);
    time.current = 0;
    setPlaying(false);
    setStep("edit");
  };
  const finish = () => {
    if (!can || !model || !facts) return;
    setPlaying(false);
    const landed = spinWheel();
    const c: Commercial = {
      id,
      model: model.id,
      lines: scriptLines(lines),
      scenes: kept,
      ratio,
      voice,
      made: Date.now(),
      multiplier: multiplierOf(landed),
      ...sets,
    };
    onFinish(c, facts, landed);
  };
  const preview = (v: string) => {
    if (previewing) return;
    setPreviewing(v);
    void hear(v, scriptLines(lines)[0] ?? PREVIEW_LINE).finally(() => setPreviewing(null));
  };

  // The desk's keys; the studio underneath hears none of them.
  const live = useRef({ step, menu, selected, togglePlay, onLeave, models });
  live.current = { step, menu, selected, togglePlay, onLeave, models };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      const s = live.current;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("textarea, input")) {
        if (e.key === "Escape") target.blur();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (s.menu) setMenu(null);
        else if (s.step === "edit") {
          setPlaying(false);
          setStep(s.models.length ? "pick" : "done");
        } else s.onLeave();
      } else if (s.step === "edit" && (e.key === "Delete" || e.key === "Backspace") && s.selected !== null) {
        const i = s.selected;
        setScenes((ss) => fitScenes(ss, Number.POSITIVE_INFINITY).filter((_, j) => j !== i));
        setSelected(null);
      } else if (s.step === "edit" && e.key === " ") {
        e.preventDefault();
        s.togglePlay();
      }
    };
    const up = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);

  // ---------------------------------------------------------------- the last commercial, when there is none left to make
  const last = company.commercials?.[company.commercials.length - 1] ?? null;
  const lastModel = last ? company.models.find((m) => m.id === last.model) : undefined;
  const lastFile = last ? adFile(last.id) : "";
  const videos = useVideos(company.id);
  const posters = usePosters(step === "done" && last ? company.id : null, lastFile ? [lastFile] : []);
  const [playingLast, setPlayingLast] = useState<string | null>(null);
  useEffect(() => () => void (playingLast && URL.revokeObjectURL(playingLast)), [playingLast]);
  const playLast = () => {
    if (!last || !videos?.has(lastFile)) return;
    void loadVideo(company.id, lastFile).then((b) => b && setPlayingLast(URL.createObjectURL(b)));
  };

  const back = (
    <button type="button" className="st-square" onClick={step === "edit" ? () => setStep(models.length ? "pick" : "done") : onLeave}>
      <Icon d={ICON.back} size={22} width={2} />
    </button>
  );
  const grow = zoomed
    ? "none"
    : `translate(${origin.x}px, ${origin.y}px) scale(${origin.w / window.innerWidth}, ${origin.h / window.innerHeight})`;

  let body: ReactNode = null;
  if (step === "pick")
    body = (
      <div className="st-page">
        <div className="st-top">{back}</div>
        <div className="st-cards">
          {models.map((m) => {
            const r = campaign?.releases[m.id];
            return (
              <button key={m.id} type="button" className="st-card st-in" onClick={() => pick(m)}>
                <span className="st-card-view">{stills[m.id] && <img src={stills[m.id]} alt="" />}</span>
                <span className="st-card-name">
                  <b>{m.name}</b>
                  <span>{r ? quarterLabel(r.quarter) : yearOf(m)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  else if (step === "done") {
    const box = { "16:9": [480, 270], "1:1": [380, 380], "9:16": [270, 480] }[last?.ratio ?? "9:16"] ?? [270, 480];
    const mult = last?.multiplier ?? 1;
    const pct = Math.round((mult - 1) * 100);
    const wedge = Math.max(0, WHEEL.findIndex((w) => w.pct === pct));
    const from = WHEEL.slice(0, wedge).reduce((a, w) => a + w.p, 0) * 3.6;
    const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    const poster = posters[lastFile];
    body = (
      <div className="st-page">
        <div className="st-top">{back}</div>
        {last && (
          <div className="st-done">
            <button type="button" className="st-done-view" style={{ width: u(box[0]), height: u(box[1]) }} onClick={playLast}>
              {playingLast ? <BoxVideo url={playingLast} /> : poster && <img src={poster} alt="" />}
              {!playingLast && (
                <>
                  <i className="st-done-shade" />
                  <i className="st-done-line" />
                  <span className="st-done-tv">
                    <Icon d={videos?.has(lastFile) ? ICON.tv : ICON.film} size={22} />
                  </span>
                  {videos?.has(lastFile) && (
                    <span className="st-done-play">
                      <Icon d={ICON.play} size={34} fill />
                    </span>
                  )}
                </>
              )}
            </button>
            <div className="st-done-side">
              <div className="st-name huge">
                <i style={{ background: lastModel ? lidColour(lastModel) : "var(--text)" }} />
                <b>{lastModel?.name ?? ""}</b>
              </div>
              {!sandbox && (
                <>
                  <div className="st-done-result">
                    <b className={tone}>{pct > 0 ? `+${pct}%` : `${pct}%`}</b>
                    <i
                      className="st-dial"
                      style={{ background: `conic-gradient(from ${from}deg, var(--accent) 0 ${WHEEL[wedge].p * 3.6}deg, color-mix(in srgb, var(--text) 16%, transparent) 0)` }}
                    />
                  </div>
                  <div className="st-bars">
                    <i className="st-bar-base wide" />
                    <i className={`st-bar ${tone}`} style={{ width: u(180 * mult) }} />
                  </div>
                </>
              )}
              {models.length > 0 && (
                <button type="button" className="st-cta" onClick={() => setStep("pick")}>
                  <Icon d={ICON.plus} size={22} width={2} />
                  <span className="st-swatches">
                    {models.map((m) => (
                      <i key={m.id} style={{ background: lidColour(m) }} />
                    ))}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  } else if (model) {
    const over = total > MAX_SECONDS;
    const f = program ? frameSize(program.frame.w, program.frame.h) : frameSize(16, 9);
    body = (
      <div className="st-page" onPointerDown={() => menu && setMenu(null)}>
        <div className="st-topbar" onPointerDown={(e) => e.stopPropagation()}>
          {back}
          <div className="st-name">
            <i style={{ background: lidColour(model) }} />
            <b>{model.name}</b>
          </div>
          <div className="st-fill" />
          <Drop
            open={menu === "set"}
            onOpen={(o) => setMenu(o ? "set" : null)}
            button={
              <>
                <SetSwatch set={sceneSet} size={18} />
                <span>{SET_NAMES[sceneSet]}</span>
              </>
            }
          >
            {SET_IDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`st-row${s === sceneSet ? " on" : ""}`}
                onClick={() => {
                  if (brollSet === sceneSet) setBrollSet(s);
                  setSceneSet(s);
                  setMenu(null);
                }}
              >
                <SetSwatch set={s} size={18} />
                <span>{SET_NAMES[s]}</span>
              </button>
            ))}
          </Drop>
          <Drop
            open={menu === "broll"}
            onOpen={(o) => setMenu(o ? "broll" : null)}
            button={
              <>
                <span className="st-broll-swatch">
                  <SetSwatch set={brollSet} size={18} />
                </span>
                <span>{SET_NAMES[brollSet]}</span>
              </>
            }
          >
            {SET_IDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`st-row${s === brollSet ? " on" : ""}`}
                onClick={() => {
                  setBrollSet(s);
                  setMenu(null);
                }}
              >
                <span className="st-broll-swatch">
                  <SetSwatch set={s} size={18} />
                </span>
                <span>{SET_NAMES[s]}</span>
              </button>
            ))}
          </Drop>
          <div className="st-ratios">
            {(["9:16", "1:1", "16:9"] as Ratio[]).map((r) => (
              <button key={r} type="button" className={`st-square${r === ratio ? " on" : ""}`} onClick={() => setRatio(r)}>
                <i className={`st-ratio r${r.replace(":", "x")}`} />
              </button>
            ))}
          </div>
          <Drop
            open={menu === "voice"}
            onOpen={(o) => setMenu(o ? "voice" : null)}
            wide
            button={
              <>
                <Icon d={voice ? ICON.speaker : ICON.mute} size={22} />
                <span className="st-voice-name">{voice ? capital(voice) : ""}</span>
              </>
            }
          >
            {[...voices, null].map((v) => {
              const on = v === voice;
              const bars = v ? pace(v) : 0;
              return (
                <div key={v ?? "none"} className={`st-voice${on ? " on" : ""}`}>
                  <button type="button" className="st-voice-hear" disabled={!v} onClick={() => v && preview(v)}>
                    {previewing === v && v ? (
                      <>
                        <i />
                        <i />
                        <i />
                      </>
                    ) : (
                      <Icon d={v ? ICON.play : ICON.mute} size={18} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="st-voice-pick"
                    onClick={() => {
                      setVoice(v);
                      setMenu(null);
                    }}
                  >
                    <span>{v ? capital(v) : ""}</span>
                    <span className="st-pace">
                      <i style={{ height: u(bars ? 6 : 0) }} />
                      <i style={{ height: u(bars > 1 ? 11 : 0) }} />
                      <i style={{ height: u(bars > 2 ? 16 : 0) }} />
                    </span>
                  </button>
                </div>
              );
            })}
          </Drop>
          <div className={`st-dur${over ? " over" : words.length ? "" : " empty"}`}>
            <b>{fmt(total)}</b>
            <div>
              <i className="fill" style={{ width: `${Math.min(100, (total / MAX_SECONDS) * 100)}%` }} />
              <i className="max" />
              <i className="spill" style={{ width: u(Math.max(0, ((total - MAX_SECONDS) / MAX_SECONDS) * 150)) }} />
            </div>
          </div>
          <button type="button" className="st-finish" disabled={!can} onClick={finish}>
            Finish
          </button>
        </div>
        <textarea
          className="st-script"
          value={text}
          spellCheck={false}
          onFocus={() => {
            setSelected(null);
            setMenu(null);
          }}
          onChange={(e) =>
            setText(
              e.target.value
                .split("\n")
                .slice(0, MAX_LINES)
                .map((l) => l.slice(0, MAX_LINE))
                .join("\n"),
            )
          }
        />
        <div className="st-view">
          <div className="st-view-box">
            {program ? (
              <Preview program={program} time={time} playing={playing} onEnd={() => setPlaying(false)} />
            ) : (
              <div className="st-frame" style={{ width: u(f.w), height: u(f.h) }} />
            )}
          </div>
          <div className="st-play">
            <button type="button" onClick={togglePlay}>
              <Icon d={playing ? ICON.pause : ICON.play} size={18} fill />
            </button>
            <span>{fmt(t)}</span>
          </div>
        </div>
        <Timeline
          words={words}
          scenes={kept}
          onScenes={setScenes}
          selected={selected}
          onSelect={setSelected}
          current={current}
          head={head}
          onSeek={(w) => {
            time.current = (starts[w] ?? 0) + 0.001;
            tick((n) => n + 1);
          }}
          sceneSet={sceneSet}
        />
      </div>
    );
  }

  return (
    <div className="fd st" style={{ transform: grow, opacity: zoomed ? 1 : 0 }}>
      {body}
    </div>
  );
}
