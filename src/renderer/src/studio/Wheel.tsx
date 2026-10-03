import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../audio/sfx";
import { pctLabel, WHEEL } from "../video/commercial";

// The commercial's wheel, over the darkened studio: each wedge as wide as its
// chance, spun to land on the wedge already drawn under the pointer at the
// top. Beside it the laptop and, once it lands, what it won: in a sandbox the
// figure is struck through, since nothing sells there.

const TURNS = 6;
/** The wheel waits a beat, spins this long, then the result shows. */
const DELAY_MS = 450;
const SPIN_MS = 5200;

const pctOf = (i: number) => 1 + WHEEL[i].pct / 100;

/** WHEEL indices in the order they go round the wheel: gains alternate with the losses and the flat wedge. */
const DRAW = [3, 0, 5, 1, 6, 2, 4, 7];

export function Wheel({ landed, name, colour, sandbox, onDone }: {
  landed: number;
  name: string;
  /** The laptop's lid colour, for its swatch. */
  colour: string;
  sandbox: boolean;
  onDone: () => void;
}) {
  // Kept by WHEEL index, so the landed wedge is found by its index, but laid out in DRAW order.
  const wedges = useMemo(() => {
    let at = 0;
    const out: { i: number; from: number; to: number; mid: number; p: number; pct: number }[] = [];
    for (const i of DRAW) {
      const w = WHEEL[i];
      const from = at;
      at += w.p * 3.6;
      out[i] = { i, from, to: at, mid: (from + at) / 2, p: w.p, pct: w.pct };
    }
    return out;
  }, []);
  const [turn, setTurn] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: spun once, on the wedge drawn
  useEffect(() => {
    const w = wedges[landed];
    // Somewhere inside the wedge, not on its edge.
    const jitter = (Math.random() - 0.5) * (w.to - w.from) * 0.6;
    const a = setTimeout(() => {
      setSpinning(true);
      setTurn(TURNS * 360 - w.mid - jitter);
    }, DELAY_MS);
    const b = setTimeout(() => setShown(true), DELAY_MS + SPIN_MS + 200);
    const c = setTimeout(() => sfx("wheel_land", { volume: 0.7 }), DELAY_MS + SPIN_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
    };
  }, []);
  // A tick each time a wedge edge passes the pointer, read from the face's turn as the transition runs it.
  const face = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!spinning) return;
    const edges = DRAW.map((i) => wedges[i].to);
    const wedgeAt = (deg: number) => {
      const a = (((-deg) % 360) + 360) % 360;
      return edges.findIndex((e) => a < e);
    };
    let was = -1;
    let raf = 0;
    const end = performance.now() + SPIN_MS;
    const frame = () => {
      const el = face.current;
      if (el) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        const w = wedgeAt((Math.atan2(m.b, m.a) * 180) / Math.PI);
        if (was >= 0 && w !== was) sfx("wheel_tick", { volume: 0.5, gap: 25 });
        was = w;
      }
      if (performance.now() < end) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spinning, wedges]);
  const stops = DRAW.map((i) => wedges[i]).map((w) => `var(--vs-w${w.i}) ${w.from}deg ${w.to - 0.6}deg, var(--ground) ${w.to - 0.6}deg ${w.to}deg`).join(", ");
  const m = pctOf(landed);
  const pct = WHEEL[landed].pct;
  const tone = sandbox ? "void" : pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return (
    <div className="st-wheel">
      <div className="st-wheel-disc">
        <div
          ref={face}
          className="st-wheel-face"
          style={{
            background: `conic-gradient(${stops})`,
            transform: `rotate(${turn}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.68,.08,1)` : "none",
          }}
        >
          {wedges.map((w) => {
            const at = (((w.mid + turn) % 360) + 360) % 360;
            return (
              <div key={w.i} className="st-wheel-at" style={{ transform: `rotate(${w.mid}deg) translateY(calc(${w.p < 5 ? -262 : -236} * var(--u)))` }}>
                <b
                  className={`${w.i >= 6 ? "dark" : ""} ${w.p < 5 ? "small" : w.p < 10 ? "mid" : ""}`}
                  style={{ transform: `translate(-50%, -50%) rotate(${at > 180 ? 90 : -90}deg)` }}
                >
                  {pctLabel(1 + w.pct / 100)}
                </b>
              </div>
            );
          })}
        </div>
        <div className="st-wheel-hub">
          <i style={{ background: colour }} />
        </div>
        <div className="st-wheel-pin" />
      </div>
      <div className="st-wheel-side">
        <div className="st-name big">
          <i style={{ background: colour }} />
          <b>{name}</b>
        </div>
        {shown && (
          <div className="st-result st-in">
            <div className="st-result-figure">
              <b className={tone}>{pctLabel(m)}</b>
              {sandbox && <i />}
            </div>
            <div className="st-bars">
              <i className="st-bar-base" />
              <i className={`st-bar ${tone}`} style={{ width: `calc(${sandbox ? 150 : 150 * m} * var(--u))` }} />
            </div>
            <button type="button" className="st-cta big" onClick={onDone}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
