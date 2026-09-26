import { useEffect } from "react";
import { type Build, type Fit, type Measurements, results, weightOf } from "../engine";
import { Label } from "./ui";

// Raw measurements only: weight, thickness, battery, a benchmark figure,
// surface temperature and fan noise. No ratings, no review score. They exist
// once the laptop is valid, after it has powered on.

export interface Stat {
  key: "weight" | "thickness" | "battery" | "bench" | "skin" | "noise";
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
  ];
}

/** The four figures top right, after power on. */
export function StatStrip({ stats, onOpen }: { stats: Stat[]; onOpen: () => void }) {
  const shown = stats.filter((s) => s.key === "weight" || s.key === "battery" || s.key === "bench" || s.key === "skin");
  return (
    <button type="button" className="bd-strip" onClick={onOpen} title="Measurements">
      {shown.map((s) => (
        <span key={s.key} className={s.warn ? "warn" : ""}>
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
