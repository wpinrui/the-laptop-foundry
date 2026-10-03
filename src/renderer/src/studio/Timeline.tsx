import { useEffect, useMemo, useRef, useState } from "react";
import { CARDS, type Scene, type SceneKind, SHOTS, TRACK_IDS, type TrackId, type Tracks, trackOf } from "../video/commercial";
import { SET_IDS, type SetId } from "../video/sets";
import benchThumb from "../assets/video-sets/thumbs/bench.png";
import deskThumb from "../assets/video-sets/thumbs/desk.png";
import nightThumb from "../assets/video-sets/thumbs/night.png";
import sweepThumb from "../assets/video-sets/thumbs/sweep.png";
import { ICON, Icon, LABEL } from "./icons";

// The commercial's timeline: the scene library's tiles over two lanes whose
// x-axis is the script, word by word, the lines laid end to end with a mark
// at each break. The card lane sits over the angle lane, as cards play over
// angles. A tile drags onto a word of its own kind's lane (onto a clip, it
// swaps its scene); clips move, trim at either end to any word boundary, are
// removed, and an angle takes its own set; within a lane they never overlap.
// Angle words not under a clip are the b-roll's, hatched. Lengths are design
// px, scaled by --u.

const CHAR = 8.3;
const PAD = 16;
/** The room at a line break. */
const GAP = 22;
const IS_CARD = new Set<SceneKind>(CARDS);

/** Design px to page px. */
const unit = () => Math.min(window.innerWidth / 1440, window.innerHeight / 810);
const u = (n: number) => `calc(${n} * var(--u))`;

export const SET_NAMES: Record<SetId, string> = { desk: "Desk", sweep: "Sweep", night: "Night", bench: "Bench" };

const SET_THUMBS: Record<SetId, string> = { desk: deskThumb, sweep: sweepThumb, night: nightThumb, bench: benchThumb };

/** The set as a picture of it, a laptop standing on its spot. */
/** How many words a scene dropped on the timeline covers to start with. */
const DROP_WORDS = 5;

export function SetThumb({ set, size = 14 }: { set: SetId; size?: number }) {
  return <img className="st-swatch" src={SET_THUMBS[set]} alt="" draggable={false} style={{ width: u(size), height: u(size) }} />;
}

type Drag = { kind: SceneKind; x: number; y: number; hover: number | null };

/** A clip: its lane and its index in that lane's scenes. */
export type ClipRef = { track: TrackId; i: number };

export function Timeline({ words, tracks, onTracks, selected, onSelect, current, head, onSeek, sceneSet }: {
  words: { text: string; line: number }[];
  tracks: Tracks;
  onTracks: (t: Tracks) => void;
  selected: ClipRef | null;
  onSelect: (c: ClipRef | null) => void;
  /** The word playing, and how far through it the playhead is, 0 to 1. */
  current: number;
  head: number;
  onSeek: (word: number) => void;
  /** The commercial's scene set: what a clip without its own is filmed on. */
  sceneSet: SetId;
}) {
  const n = words.length;
  const geo = useMemo(() => {
    const out: { x: number; w: number; first: boolean }[] = [];
    let x = 0;
    words.forEach((w, i) => {
      const first = i === 0 || w.line !== words[i - 1].line;
      if (i > 0 && first) x += GAP;
      const width = Math.max(30, w.text.length * CHAR + PAD);
      out.push({ x, w: width, first });
      x += width;
    });
    return { words: out, width: x };
  }, [words]);
  const inner = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = useRef<Drag | null>(null);
  dragging.current = drag;
  // The selected clip's set menu, where it opens on the page.
  const [setMenu, setSetMenu] = useState<{ x: number; y: number } | null>(null);
  const live = useRef({ tracks, onTracks, n, geo });
  live.current = { tracks, onTracks, n, geo };
  const setTrack = (track: TrackId, ss: Scene[]) => live.current.onTracks({ ...live.current.tracks, [track]: ss });

  const tlX = (clientX: number) => (clientX - (inner.current?.getBoundingClientRect().left ?? 0)) / unit();
  const wordAt = (x: number) => {
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    live.current.geo.words.forEach((w, i) => {
      const d = x < w.x ? w.x - x : x > w.x + w.w ? x - w.x - w.w : 0;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const boundaryAt = (x: number, end: boolean) => {
    const ws = live.current.geo.words;
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= ws.length; i++) {
      const px = end ? (i ? ws[i - 1].x + ws[i - 1].w : Number.NEGATIVE_INFINITY) : i < ws.length ? ws[i].x : Number.POSITIVE_INFINITY;
      const d = Math.abs(px - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  const over = (e: PointerEvent) => {
    const r = track.current?.getBoundingClientRect();
    return !!r && e.clientY >= r.top - 30 && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right;
  };
  /** Where a tile dropped on word `w` goes: onto the clip there, or DROP_WORDS words from it, stopping at the next clip or the line's end. */
  const placement = (track: TrackId, w: number): { replace?: number; a: number; b: number } => {
    const { n: count } = live.current;
    const ss = live.current.tracks[track];
    const hit = ss.findIndex((s) => w >= s.startWord && w < s.endWord);
    if (hit >= 0) return { replace: hit, a: ss[hit].startWord, b: ss[hit].endWord };
    const next = ss.filter((s) => s.startWord > w).reduce((m, s) => Math.min(m, s.startWord), count);
    let lineEnd = w;
    while (lineEnd < count && words[lineEnd].line === words[w].line) lineEnd++;
    return { a: w, b: Math.max(w + 1, Math.min(next, lineEnd, w + DROP_WORDS)) };
  };

  const tileDown = (kind: SceneKind, e: React.PointerEvent) => {
    e.preventDefault();
    onSelect(null);
    setDrag({ kind, x: e.clientX, y: e.clientY, hover: null });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens for the whole of a drag, reading it live
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const hover = live.current.n && over(e) ? wordAt(tlX(e.clientX)) : null;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, hover } : d));
    };
    const up = () => {
      const d = dragging.current;
      setDrag(null);
      if (!d || d.hover === null) return;
      const track = trackOf(d.kind);
      const ss = live.current.tracks[track];
      const p = placement(track, d.hover);
      if (p.replace !== undefined) {
        setTrack(
          track,
          ss.map((s, i) => (i === p.replace ? { ...s, kind: d.kind } : s)),
        );
        onSelect({ track, i: p.replace });
      } else {
        const next = [...ss, { kind: d.kind, startWord: p.a, endWord: p.b }].sort((a, b) => a.startWord - b.startWord);
        setTrack(track, next);
        onSelect({ track, i: next.findIndex((s) => s.startWord === p.a) });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag !== null]);

  const clipDown = (track: TrackId, i: number, mode: "move" | "a" | "b", e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSetMenu(null);
    const ss = live.current.tracks[track];
    const me = ss[i];
    if (!me) return;
    const lo = ss[i - 1]?.endWord ?? 0;
    const hi = ss[i + 1]?.startWord ?? n;
    const i0 = wordAt(tlX(e.clientX));
    const len = me.endWord - me.startWord;
    onSelect({ track, i });
    const move = (ev: PointerEvent) => {
      const x = tlX(ev.clientX);
      let a = me.startWord;
      let b = me.endWord;
      if (mode === "a") a = Math.max(lo, Math.min(me.endWord - 1, boundaryAt(x, false)));
      else if (mode === "b") b = Math.min(hi, Math.max(me.startWord + 1, boundaryAt(x, true)));
      else {
        a = Math.max(lo, Math.min(hi - len, me.startWord + wordAt(x) - i0));
        b = a + len;
      }
      const cur = live.current.tracks[track];
      if (cur[i] && (cur[i].startWord !== a || cur[i].endWord !== b))
        setTrack(
          track,
          cur.map((s, j) => (j === i ? { ...s, startWord: a, endWord: b } : s)),
        );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ws = geo.words;
  const seg = (a: number, b: number) => ({ left: u(ws[a].x), width: u(ws[b - 1].x + ws[b - 1].w - ws[a].x) });
  const gaps: { a: number; b: number }[] = [];
  let at = 0;
  for (const s of [...tracks.angles, { startWord: n, endWord: n }]) {
    if (s.startWord > at) gaps.push({ a: at, b: s.startWord });
    at = Math.max(at, s.endWord);
  }
  const dropTrack = drag ? trackOf(drag.kind) : null;
  const drop = drag && dropTrack && drag.hover !== null && n ? placement(dropTrack, drag.hover) : null;
  const sel = selected ? tracks[selected.track][selected.i] : undefined;
  const cw = ws[current];
  const headX = cw ? cw.x + cw.w * head : 0;

  return (
    <>
      <div className="st-tiles">
        <div>
          <em className="st-label">Shots</em>
          <div>
          {SHOTS.map((k) => (
            <div key={k} className="st-tile" onPointerDown={(e) => tileDown(k, e)}>
              <Icon d={ICON[k as keyof typeof ICON]} size={24} width={1.6} />
              <span>{LABEL[k]}</span>
            </div>
          ))}
          </div>
        </div>
        <div>
          <em className="st-label">Cards</em>
          <div>
          {CARDS.map((k) => (
            <div key={k} className="st-tile card" onPointerDown={(e) => tileDown(k, e)}>
              <Icon d={ICON[k as keyof typeof ICON]} size={24} width={1.6} />
              <span>{LABEL[k]}</span>
            </div>
          ))}
          </div>
        </div>
      </div>
      <em className="st-label st-at-track">Timeline</em>
      <div ref={track} className="st-track">
        <div ref={inner} className="st-track-in" style={{ width: u(geo.width + 40) }}>
          {TRACK_IDS.map((t) => (
            <div key={t} className={`st-lane ${t}`} />
          ))}
          {gaps.map((g) => (
            <div key={`g${g.a}`} className="st-broll angles" style={seg(g.a, g.b)} />
          ))}
          {drop && dropTrack && <div className={`st-drop ${dropTrack}`} style={seg(drop.a, drop.b)} />}
          {TRACK_IDS.flatMap((t) =>
            tracks[t].map((s, i) => {
              const card = t === "cards";
              const on = selected?.track === t && selected.i === i;
              if (!ws[s.startWord] || !ws[s.endWord - 1]) return null;
              const px = ws[s.endWord - 1].x + ws[s.endWord - 1].w - ws[s.startWord].x;
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: clips in a lane are ordered and never overlap: the index is the clip
                  key={`${t}${i}`}
                  className={`st-clip ${t}${card ? " card" : ""}${on ? " on" : ""}`}
                  style={seg(s.startWord, s.endWord)}
                  onPointerDown={(e) => clipDown(t, i, "move", e)}
                >
                  <div className="st-clip-name">
                    <Icon d={ICON[s.kind as keyof typeof ICON]} size={20} width={1.6} />
                    <span style={{ opacity: px > (on ? (card ? 140 : 170) : 96) ? 1 : 0 }}>{LABEL[s.kind]}</span>
                  </div>
                  <div className="st-trim a" onPointerDown={(e) => clipDown(t, i, "a", e)}>
                    <i />
                  </div>
                  <div className="st-trim b" onPointerDown={(e) => clipDown(t, i, "b", e)}>
                    <i />
                  </div>
                  {!card && s.set && !on && <span className="st-clip-set">{<SetThumb set={s.set} size={10} />}</span>}
                  {on && (
                    <>
                      {!card && (
                        <button
                          type="button"
                          className={`st-clip-btn set${s.set ? " own" : ""}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setSetMenu((m) => (m ? null : { x: r.left, y: r.top }));
                          }}
                        >
                          <SetThumb set={s.set ?? sceneSet} size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="st-clip-btn remove"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onTracks({ ...tracks, [t]: tracks[t].filter((_, j) => j !== i) });
                          onSelect(null);
                        }}
                      >
                        <Icon d={ICON.close} size={14} width={2.5} />
                      </button>
                    </>
                  )}
                </div>
              );
            }),
          )}
          {ws.map((w, i) =>
            w.first && i > 0 ? <i key={`m${w.x}`} className="st-mark" style={{ left: u(w.x - GAP / 2) }} /> : null,
          )}
          {words.map((w, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the playhead also moves from the preview's controls
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a word's place is its identity on the axis
              key={i}
              className={`st-word${i === current ? " now" : i < current ? " past" : ""}`}
              style={{ left: u(ws[i].x), width: u(ws[i].w) }}
              onClick={() => onSeek(i)}
            >
              {w.text}
            </span>
          ))}
          {n > 0 && (
            <div className="st-head" style={{ left: u(headX) }}>
              <i />
            </div>
          )}
        </div>
      </div>
      {setMenu && selected?.track === "angles" && sel && (
        <div className="st-menu st-clip-menu" style={{ left: setMenu.x, top: setMenu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {[null, ...SET_IDS].map((id) => {
            const on = (sel.set ?? null) === id;
            return (
              <button
                key={id ?? "scene"}
                type="button"
                className={on ? "on" : undefined}
                onClick={() => {
                  onTracks({ ...tracks, angles: tracks.angles.map((s, j) => (j === selected.i ? { ...s, set: id ?? undefined } : s)) });
                  setSetMenu(null);
                }}
              >
                <SetThumb set={id ?? sceneSet} size={26} />
                <span>{id ? SET_NAMES[id] : `${SET_NAMES[sceneSet]}`}</span>
                {!id && <Icon d={ICON.film} size={16} />}
              </button>
            );
          })}
        </div>
      )}
      {drag && (
        <div className={`st-tile ghost${IS_CARD.has(drag.kind) ? " card" : ""}`} style={{ left: drag.x, top: drag.y }}>
          <Icon d={ICON[drag.kind as keyof typeof ICON]} size={24} width={1.6} />
          <span>{LABEL[drag.kind]}</span>
        </div>
      )}
    </>
  );
}
