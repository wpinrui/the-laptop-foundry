import { useEffect } from "react";
import type { ReactNode } from "react";
import { type Build, costOf, type Fit, type Measurements, results, weightOf } from "../engine";
import { Label } from "./ui";

// Raw measurements only: weight, thickness, battery, a benchmark figure,
// surface temperature and fan noise. No ratings, no review score. They exist
// once the laptop is valid, after it has powered on.

export interface Stat {
  key: "weight" | "thickness" | "battery" | "bench" | "skin" | "noise" | "cost";
  label: string;
  value: string;
  unit: string;
  warn: boolean;
}

const hmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

export function statsOf(build: Build, fit: Fit, m: Measurements): Stat[] {
  const kg = weightOf(build, fit);
  const b = m.battery;
  const web = b ? (b.runtime[b.balanced]?.web ?? null) : null;
  const bench = results(build, m)?.bench.multi ?? null;
  const skin = m.cooling?.peakSkin ?? null;
  const noise = m.cooling?.noise.load ?? null;
  let cost = 0;
  try {
    cost = costOf(build, fit).total;
  } catch {}
  return [
    { key: "weight", label: "Weight", value: kg.toFixed(2), unit: "kg", warn: false },
    { key: "thickness", label: "Thickness", value: (fit.frame.z + fit.lidZ).toFixed(1), unit: "mm", warn: false },
    { key: "battery", label: "Battery", value: web === null ? "—" : hmm(web), unit: "h", warn: web !== null && web < 4 },
    {
      key: "bench",
      label: "Kilnbench",
      value: bench === null ? "—" : Math.round(bench).toLocaleString("en-US"),
      unit: "",
      warn: false,
    },
    { key: "skin", label: "Surface temp", value: skin === null ? "—" : String(Math.round(skin)), unit: "°C", warn: skin !== null && skin >= 45 },
    { key: "noise", label: "Fan noise", value: noise === null ? "—" : String(Math.round(noise)), unit: "dB", warn: noise !== null && noise >= 45 },
    { key: "cost", label: "Cost", value: `$${Math.round(cost).toLocaleString("en-US")}`, unit: "", warn: false },
  ];
}

// Icons from Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors.
const ICON: Partial<Record<Stat["key"], ReactNode>> = {
  weight: (
    <>
      <circle cx="12" cy="5" r="3" />
      <path d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z" />
    </>
  ),
  battery: (
    <>
      <rect width="16" height="10" x="2" y="7" rx="2" ry="2" />
      <line x1="22" x2="22" y1="11" y2="13" />
      <line x1="6" x2="6" y1="11" y2="13" />
      <line x1="10" x2="10" y1="11" y2="13" />
    </>
  ),
  bench: (
    <>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </>
  ),
  skin: <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  cost: (
    <>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </>
  ),
};

function Icon({ k }: { k: Stat["key"] }) {
  const d = ICON[k];
  if (!d) return null;
  return (
    <svg className="bd-strip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

/** The four figures top right, after power on. */
export function StatStrip({ stats, onOpen }: { stats: Stat[]; onOpen: () => void }) {
  const shown = stats.filter((s) => ["weight", "battery", "bench", "skin", "cost"].includes(s.key));
  return (
    <button type="button" className="bd-strip" onClick={onOpen} title="Measurements">
      {shown.map((s) => (
        <span key={s.key} className={s.warn ? "warn" : ""} title={s.label}>
          <Icon k={s.key} />
          <b>{s.value}</b>
          {s.unit && ` ${s.unit}`}
        </span>
      ))}
    </button>
  );
}

/** The power on moment: the name and six big figures, then they settle into the strip. */
export function PowerOn({ name, stats, onDone }: { name: string; stats: Stat[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <button type="button" className="bd-power fd-in" onClick={onDone}>
      <span className="bd-power-name">{name}</span>
      <span className="bd-power-grid">
        {stats.map((s) => (
          <span key={s.key} className="bd-power-stat">
            <Label>{s.label}</Label>
            <span className={s.warn ? "bd-value big warn" : "bd-value big"}>
              {s.value}
              {s.unit && <small> {s.unit}</small>}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}
