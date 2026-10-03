import { useEffect, useMemo, useRef, useState } from "react";
import { SCENE_KINDS, type Scene, type SceneKind } from "../video/commercial";

// The commercial's timeline: its x-axis is the script, word by word, the
// lines laid end to end with a mark at each line break. Scenes are dragged on
// from the library, moved, trimmed at either end to any word boundary and
// removed; they never overlap. A stand-in for the designer's.

/** A word's width on the axis, px. */
const wordWidth = (w: string) => Math.max(34, 14 + w.length * 8.5);
/** The extra room at a line break, px. */
const BREAK = 18;
/** A scene dropped from the library covers this many words, or as many as fit. */
const DROP_WORDS = 4;

const NAMES: Record<SceneKind, string> = {
  keyboard: "Keyboard",
  ports: "Ports",
  screen: "Screen",
  lid: "Lid",
  turn: "Turn",
  title: "Title",
  sales: "Sales",
  stats: "Stats",
  score: "Score",
};

type Drag =
  | { type: "new"; kind: SceneKind; x: number; y: number }
  | { type: "move"; index: number; grab: number }
  | { type: "trim"; index: number; edge: "start" | "end" };

export function Timeline({ words, scenes, onScenes }: {
  words: { text: string; line: number }[];
  scenes: Scene[];
  onScenes: (s: Scene[]) => void;
}) {
  const n = words.length;
  // Where each word starts on the axis, and where the last ends.
  const xs = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    words.forEach((w, i) => {
      if (i > 0 && w.line !== words[i - 1].line) x += BREAK;
      out.push(x);
      x += wordWidth(w.text);
    });
    out.push(x);
    return out;
  }, [words]);
  // A word boundary's place on the axis: between the words either side of it.
  const bx = (b: number) => (b <= 0 ? 0 : b >= n ? xs[n] : (xs[b - 1] + wordWidth(words[b - 1].text) + xs[b]) / 2);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef({ scenes, onScenes, drag, n });
  live.current = { scenes, onScenes, drag, n };

  const localX = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    return r ? clientX - r.left + (track.current?.scrollLeft ?? 0) : 0;
  };
  const wordAt = (x: number) => {
    for (let i = 0; i < n; i++) if (x < bx(i + 1)) return i;
    return n - 1;
  };
  const boundaryAt = (x: number) => {
    let best = 0;
    for (let b = 1; b <= n; b++) if (Math.abs(bx(b) - x) < Math.abs(bx(best) - x)) best = b;
    return best;
  };
  const geo = useRef({ localX, wordAt, boundaryAt });
  geo.current = { localX, wordAt, boundaryAt };

  // biome-ignore lint/correctness/useExhaustiveDependencies: listens for the whole of a drag, reading it live
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const { scenes: ss, onScenes: set, drag: d } = live.current;
      if (!d) return;
      const g = geo.current;
      if (d.type === "new") return setDrag({ ...d, x: e.clientX, y: e.clientY });
      const s = ss[d.index];
      if (!s) return;
      const prevEnd = ss[d.index - 1]?.endWord ?? 0;
      const nextStart = ss[d.index + 1]?.startWord ?? live.current.n;
      const x = g.localX(e.clientX);
      let next: Scene = s;
      if (d.type === "move") {
        const len = s.endWord - s.startWord;
        const start = Math.max(prevEnd, Math.min(nextStart - len, g.wordAt(x) - d.grab));
        next = { ...s, startWord: start, endWord: start + len };
      } else if (d.edge === "start") next = { ...s, startWord: Math.max(prevEnd, Math.min(s.endWord - 1, g.boundaryAt(x))) };
      else next = { ...s, endWord: Math.min(nextStart, Math.max(s.startWord + 1, g.boundaryAt(x))) };
      if (next.startWord !== s.startWord || next.endWord !== s.endWord) set(ss.map((o, i) => (i === d.index ? next : o)));
    };
    const up = (e: PointerEvent) => {
      const { scenes: ss, onScenes: set, drag: d, n: count } = live.current;
      setDrag(null);
      if (d?.type !== "new" || count === 0) return;
      const r = track.current?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const w = geo.current.wordAt(geo.current.localX(e.clientX));
      // Dropped on a scene: no room there.
      if (ss.some((s) => w >= s.startWord && w < s.endWord)) return;
      const nextStart = ss.find((s) => s.startWord > w)?.startWord ?? count;
      const scene: Scene = { kind: d.kind, startWord: w, endWord: Math.min(nextStart, w + DROP_WORDS) };
      set([...ss, scene].sort((a, b) => a.startWord - b.startWord));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag !== null]);

  return (
    <div className="st-timeline">
      <div className="st-library">
        {SCENE_KINDS.map((k, i) => (
          <button
            key={k}
            type="button"
            className={`st-chip${i >= 5 ? " card" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setDrag({ type: "new", kind: k, x: e.clientX, y: e.clientY });
            }}
          >
            {NAMES[k]}
          </button>
        ))}
      </div>
      <div ref={track} className="st-track">
        <div className="st-axis" style={{ width: xs[n] }}>
          {scenes.map((s, i) => (
            <div
              key={`${s.kind}-${s.startWord}`}
              className={`st-scene${SCENE_KINDS.indexOf(s.kind) >= 5 ? " card" : ""}`}
              style={{ left: bx(s.startWord), width: bx(s.endWord) - bx(s.startWord) }}
              onPointerDown={(e) => {
                e.preventDefault();
                setDrag({ type: "move", index: i, grab: geo.current.wordAt(geo.current.localX(e.clientX)) - s.startWord });
              }}
            >
              <i
                className="st-trim start"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDrag({ type: "trim", index: i, edge: "start" });
                }}
              />
              <span>{NAMES[s.kind]}</span>
              <button
                type="button"
                className="st-remove"
                aria-label="Remove"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onScenes(scenes.filter((_, j) => j !== i))}
              >
                ×
              </button>
              <i
                className="st-trim end"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDrag({ type: "trim", index: i, edge: "end" });
                }}
              />
            </div>
          ))}
          {words.map((w, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a word's place is its identity on the axis
              key={i}
              className={`st-word${i > 0 && w.line !== words[i - 1].line ? " break" : ""}`}
              style={{ left: xs[i], width: wordWidth(w.text) }}
            >
              {w.text}
            </span>
          ))}
        </div>
      </div>
      {drag?.type === "new" && (
        <div className="st-chip ghost" style={{ left: drag.x, top: drag.y }}>
          {NAMES[drag.kind]}
        </div>
      )}
    </div>
  );
}
