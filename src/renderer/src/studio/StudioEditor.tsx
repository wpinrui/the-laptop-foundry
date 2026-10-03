import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import type { CampaignState } from "../engine/campaign";
import { overallOf, yearOf } from "../foundry/LaptopList";
import { Thumb } from "../map/WorldMap";
import {
  type Commercial,
  commercialProgram,
  estimate,
  estimateTimeline,
  fitScenes,
  heard,
  MAX_LINE,
  MAX_LINES,
  MAX_SECONDS,
  multiplierOf,
  RATIOS,
  type Scene,
  scriptLines,
  spinWheel,
  wordsOf,
} from "../video/commercial";
import type { Ratio } from "../video/scene";
import { adFacts, type ShortFacts } from "../video/script";
import { lookFor } from "../video/sets";
import { adSubject } from "./eligible";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Wheel } from "./Wheel";

// The studio's editing desk: pick the laptop, write the script, lay scenes
// over its words, pick the shape and the voice, then Finish spins the wheel.
// A plain stand-in: the designer's screens replace it, on the same logic in
// video/commercial.ts.

const PREVIEW_LINE = "This is how I sound reading your commercial.";

/** Plays a narrator's preview line and records how fast they read it. */
async function hear(voice: string): Promise<void> {
  const v = await window.api.video.say([PREVIEW_LINE], voice).catch(() => null);
  const clip = v?.clips[0];
  if (!v || !clip) return;
  heard(voice, PREVIEW_LINE, clip.length / v.sampleRate);
  const ctx = new AudioContext();
  const b = ctx.createBuffer(1, Math.max(1, clip.length), v.sampleRate);
  b.copyToChannel(new Float32Array(clip), 0);
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.connect(ctx.destination);
  src.onended = () => void ctx.close();
  src.start();
}

const seconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function StudioEditor({
  company,
  campaign,
  models,
  picked,
  onPick,
  onFinish,
  onClose,
}: {
  company: SavedCompany;
  campaign: CampaignState | null;
  /** The laptops that can still have their commercial. */
  models: SavedModel[];
  picked: string | null;
  onPick: (id: string) => void;
  /** Records the commercial, already carrying the wheel's result, and queues its render. */
  onFinish: (c: Commercial, facts: ShortFacts) => void;
  onClose: () => void;
}) {
  const model = models.find((m) => m.id === picked) ?? models[0] ?? null;
  // Its id from the start: the b-roll's angles are drawn from it, so the preview's are the render's.
  const [id] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [voices, setVoices] = useState<string[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  // Bumped once a voice is heard: its reading rate is known from then.
  const [, setHeard] = useState(0);
  const [spun, setSpun] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const live = useRef({ onClose, spinning });
  live.current = { onClose, spinning };

  useEffect(() => {
    void window.api.video
      .voices()
      .catch((): string[] => [])
      .then((v) => {
        setVoices(v);
        setVoice((cur) => cur ?? (v.includes("michael") ? "michael" : (v[0] ?? null)));
      });
  }, []);

  // The studio underneath hears none of the keys; Escape closes the desk, but not mid-spin.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        if (!live.current.spinning) live.current.onClose();
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

  const lines = useMemo(() => text.split("\n"), [text]);
  const words = useMemo(() => wordsOf(lines), [lines]);
  const kept = useMemo(() => fitScenes(scenes, words.length), [scenes, words.length]);
  const secs = estimate(lines, voice);
  const over = secs > MAX_SECONDS;
  const index = company.commercials?.length ?? 0;
  const look = useMemo(() => lookFor(index), [index]);
  const facts = useMemo(() => {
    if (!model) return null;
    try {
      const score = campaign ? null : model.reviewed ? overallOf(model, company.name) : null;
      return adFacts(adSubject(model, company.name, campaign), campaign, score);
    } catch {
      return null;
    }
  }, [model, company.name, campaign]);
  const draft = { id, lines, scenes: kept, ratio };
  const program = facts ? commercialProgram(draft, facts, estimateTimeline(lines, voice)) : null;
  const canFinish = !!model && !!facts && words.length > 0 && !over;

  const finish = () => {
    if (!canFinish || !model || !facts) return;
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
    };
    onFinish(c, facts);
    setSpun(landed);
    setSpinning(true);
  };

  if (spun !== null)
    return createPortal(
      <div className="fd fd-over st" style={{ zIndex: 999 }}>
        <div className="fd-scrim" />
        <div className="st-spin">
          <Wheel landed={spun} onDone={() => setSpinning(false)} />
          <button type="button" className="fd-primary" disabled={spinning} onClick={onClose}>
            Done
          </button>
        </div>
      </div>,
      document.body,
    );

  return createPortal(
    <div className="fd fd-over st" style={{ zIndex: 999 }}>
      <div className="fd-scrim" />
      <div className="st-desk">
        <aside className="st-side">
          <div className="wm-list">
            {models.map((m) => (
              <button key={m.id} type="button" className={`wm-row${m.id === model?.id ? " on" : ""}`} onClick={() => onPick(m.id)}>
                <Thumb model={m} />
                <span>
                  <b>{m.name}</b>
                  <small>{yearOf(m)}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="st-ratios">
            {RATIOS.map((r) => (
              <button key={r} type="button" className={`fd-secondary${r === ratio ? " on" : ""}`} onClick={() => setRatio(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="st-voice">
            <select value={voice ?? ""} onChange={(e) => setVoice(e.target.value || null)}>
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
              <option value="">No voice</option>
            </select>
            {voice && (
              <button type="button" className="fd-text" onClick={() => void hear(voice).then(() => setHeard((h) => h + 1))}>
                Preview
              </button>
            )}
          </div>
          <b className={`st-time${over ? " over" : ""}`}>
            {seconds(secs)}
            <small>{seconds(MAX_SECONDS)}</small>
          </b>
          <div className="st-end">
            <button type="button" className="fd-primary" disabled={!canFinish} onClick={finish}>
              Finish
            </button>
            <button type="button" className="fd-secondary muted" onClick={onClose}>
              Close
            </button>
          </div>
        </aside>
        <div className="st-main">
          <textarea
            className="st-script"
            value={text}
            spellCheck
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
          {program && <Preview program={program} look={look} />}
        </div>
        <Timeline words={words} scenes={kept} onScenes={setScenes} />
      </div>
    </div>,
    document.body,
  );
}
