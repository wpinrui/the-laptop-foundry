import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  panelOf,
  RIVALS,
  type Review,
  reviewOf,
  rivalSubject,
  type Subject,
  solve,
} from "../engine";
import { usePhotos } from "../viewer/Photos";
import "../foundry/foundry.css";
import { type Beat, RevealStage, type Tone } from "./RevealStage";
import { eraOf, longDate, PUBLICATION, ReviewSite, SiteLoading } from "./ReviewSite";

// The review opens on the laptop's own screen, on the Foundry plinth. The
// first time a review opens it is revealed: the laptop arrives shut, the lid
// lifts, the site loads and the score lands. After that, and for every rival,
// it opens straight onto the article. The page is filtered by the panel:
// resolution, brightness, colour and surface. F shows it full screen, clean,
// with no panel simulation.

import { lookOf } from "./look";

export { type Look, lookOf } from "./look";

/** The score's word, as the reveal and the sites print it. */
export function bandWord(score: number): string {
  return score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 70 ? "Average" : "Poor";
}

const toneOf = (score: number): Tone => (score >= 90 ? "great" : score >= 70 ? "good" : "poor");

/** From Open: the lid lifts, the screen wakes, the page loads, then the score lands. */
const SCREEN_ON_MS = 700;
const LOADED_MS = 3000;
const SCORE_MS = 4400;
const COUNT_MS = 900;
const BAR_STEP_MS = 40;

/** Counts up to `to` over COUNT_MS once `run` turns true. */
function useCount(to: number, run: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / COUNT_MS);
      setV(to * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run]);
  return v;
}

function Published({ review, onOpen, onLater }: { review: Review; onOpen: () => void; onLater: () => void }) {
  return (
    <div className="fd-column fd-in rv-column">
      <span className="rv-publication">{PUBLICATION}</span>
      <h1 className="rv-model">
        {review.company}
        <br />
        {review.model}
      </h1>
      <span className="rv-date">{longDate(review.date)}</span>
      <div className="fd-actions rv-actions">
        <button type="button" className="fd-primary" onClick={onOpen} autoFocus>
          Open
        </button>
        <button type="button" className="fd-text" onClick={onLater}>
          Later
        </button>
      </div>
    </div>
  );
}

function Score({ review, onRead, onLater }: { review: Review; onRead: () => void; onLater: () => void }) {
  const overall = review.scores.overall;
  const shown = useCount(overall, true);
  const tone = toneOf(overall);
  return (
    <div className={`fd-column fd-in rv-column rv-score-col rv-${tone}`}>
      <span className="rv-score">{shown.toFixed(1)}</span>
      <span className="rv-band">{bandWord(overall)}</span>
      <p className="rv-headline">{review.headline}</p>
      <ul className="rv-bars">
        {review.scores.categories.map((c, i) => (
          <li key={c.name} style={{ "--rv-delay": `${COUNT_MS * 0.4 + i * BAR_STEP_MS}ms` } as CSSProperties}>
            <span>{c.name}</span>
            <b>{Math.round(c.score)}</b>
            <i>
              <i style={{ width: `${c.score}%` }} />
            </i>
          </li>
        ))}
      </ul>
      <div className="fd-actions rv-actions">
        <button type="button" className="fd-primary" onClick={onRead} autoFocus>
          Read review
        </button>
        <button type="button" className="fd-text" onClick={onLater}>
          Later
        </button>
      </div>
    </div>
  );
}

export function ReviewScreen({
  subject,
  reveal,
  onRevealed,
  onBack,
}: {
  subject: Subject;
  /** Play the reveal: this review has never been opened. */
  reveal?: boolean;
  /** The score has landed; the reveal need not play again. */
  onRevealed?: () => void;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<string[]>([subject.id]);
  const [full, setFull] = useState(false);
  const build = subject.build;
  const panel = panelOf(build);
  const look = lookOf(panel);
  // No screen to reveal on: straight to the article.
  const [beat, setBeat] = useState<Beat>(reveal && look ? "published" : "read");
  const [screenOn, setScreenOn] = useState(beat !== "published");
  const [loaded, setLoaded] = useState(beat !== "published");
  const current = history[history.length - 1];

  const shown = useMemo(() => {
    if (current === subject.id) return subject;
    const r = RIVALS.find((x) => x.id === current);
    return r ? rivalSubject(r) : subject;
  }, [current, subject]);
  const review = useMemo(() => reviewOf(shown), [shown]);
  const own = useMemo(() => reviewOf(subject), [subject]);
  const { photos, shoot } = usePhotos(shown);
  const fit = useMemo(() => solve(build), [build]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (beat !== "read") return;
      if (e.key === "f" || e.key === "F") setFull((v) => !v);
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beat]);

  // The reveal's clock, from Open.
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const open = () => {
    setBeat("open");
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    at(SCREEN_ON_MS, () => setScreenOn(true));
    at(LOADED_MS, () => setLoaded(true));
    at(SCORE_MS, () => {
      setBeat("score");
      onRevealed?.();
    });
  };

  const go = (id: string) => setHistory((h) => [...h, id]);
  const home = () => setHistory([subject.id]);
  const site = <ReviewSite review={review} onOpen={go} onHome={home} photos={photos} />;
  const era = eraOf(review.year);

  const page =
    look && screenOn ? (
      <div
        className="panel-page"
        style={{ width: look.width, height: look.height, pointerEvents: beat === "read" ? undefined : "none" } as CSSProperties}
      >
        <div className="scroller" style={{ filter: look.filter }}>
          {loaded ? site : <SiteLoading era={era} />}
        </div>
        {look.shift > 0 && <div className="shift" style={{ opacity: look.shift }} />}
        {look.glare > 0 && <div className="glare" style={{ opacity: look.glare }} />}
      </div>
    ) : null;

  const back = () => (history.length > 1 ? setHistory((h) => h.slice(0, -1)) : onBack());
  return (
    <div className="fd review-screen">
      <RevealStage
        build={build}
        fit={fit}
        beat={beat}
        tone={toneOf(own.scores.overall)}
        screen={look && page ? { node: page, width: look.width, mm: look.mm } : undefined}
      />
      {(beat === "published" || beat === "score") && <div className="fd-scrim" />}
      {beat === "published" && <Published review={own} onOpen={open} onLater={onBack} />}
      {beat === "score" && <Score review={own} onRead={() => setBeat("read")} onLater={onBack} />}
      {beat === "read" && (
        <div className={`rv-bar fd-in${look ? "" : " rv-bar-top"}`}>
          <button type="button" className="rv-back" onClick={back}>
            Back
          </button>
          <button type="button" className="rv-key" onClick={() => setFull(true)} aria-label="Full screen">
            F
          </button>
        </div>
      )}
      {beat === "read" && (full || !look) && <div className="fullscreen-page">{site}</div>}
      {shoot}
    </div>
  );
}
