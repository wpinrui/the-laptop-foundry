import { useEffect, useMemo, useState } from "react";
import { pctLabel, WHEEL } from "../video/commercial";

// The commercial's wheel: each wedge as wide as its chance, spun to land on
// the wedge already drawn, the pointer at the top. A stand-in for the
// designer's.

const R = 140;
const TURNS = 6;

const point = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${R + Math.cos(a) * r} ${R + Math.sin(a) * r}`;
};

export function Wheel({ landed, onDone }: { landed: number; onDone: () => void }) {
  const wedges = useMemo(() => {
    let at = 0;
    return WHEEL.map((w, i) => {
      const from = at;
      at += (w.p / 100) * 360;
      return { i, from, to: at, pct: w.pct };
    });
  }, []);
  const [turn, setTurn] = useState(0);
  const [done, setDone] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: spun once, on the wedge drawn
  useEffect(() => {
    const w = wedges[landed];
    // Somewhere inside the wedge, not on its edge.
    const inside = w.from + (w.to - w.from) * (0.2 + Math.random() * 0.6);
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setTurn(TURNS * 360 + (360 - inside))));
    return () => cancelAnimationFrame(f);
  }, []);
  return (
    <div className="st-wheel">
      <svg viewBox={`0 0 ${R * 2} ${R * 2 + 16}`} aria-hidden="true">
        <g
          style={{ transform: `rotate(${turn}deg)`, transformOrigin: `${R}px ${R}px` }}
          className="st-wheel-spin"
          onTransitionEnd={() => {
            setDone(true);
            onDone();
          }}
        >
          {wedges.map((w) => {
            const big = w.to - w.from > 180 ? 1 : 0;
            const mid = (w.from + w.to) / 2;
            const [x, y] = point(mid, R * 0.7).split(" ").map(Number);
            return (
              <g key={w.i} className={w.pct < 0 ? "neg" : w.pct === 0 ? "zero" : "pos"}>
                <path d={`M ${R} ${R} L ${point(w.from, R)} A ${R} ${R} 0 ${big} 1 ${point(w.to, R)} Z`} />
                <text x={x} y={y} transform={`rotate(${mid} ${x} ${y})`} textAnchor="middle" dominantBaseline="middle">
                  {pctLabel(1 + w.pct / 100)}
                </text>
              </g>
            );
          })}
        </g>
        <path className="st-wheel-pin" d={`M ${R - 10} 0 L ${R + 10} 0 L ${R} 20 Z`} />
      </svg>
      <b className={done ? "on" : undefined}>{done ? pctLabel(1 + WHEEL[landed].pct / 100) : ""}</b>
    </div>
  );
}
