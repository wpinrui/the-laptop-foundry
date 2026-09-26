import type { CSSProperties, ReactNode } from "react";

// The builder's small Foundry controls: labels, values, sliders, chips, tray
// cards and list rows. Styles live in builder.css under the bd- prefix.

export function Label({ children }: { children: ReactNode }) {
  return <span className="bd-label">{children}</span>;
}

/** A value with its unit in muted text after it. */
export function Value({
  v,
  unit,
  big,
  warn,
}: {
  v: ReactNode;
  unit?: string;
  big?: boolean;
  warn?: boolean;
}) {
  return (
    <span className={["bd-value", big ? "big" : "", warn ? "warn" : ""].join(" ")}>
      {v}
      {unit && <small> {unit}</small>}
    </span>
  );
}

/** Label on the left, value on the right. */
export function Line({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="bd-line">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  mark,
  warn,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  /** A tick on the track, as a value. */
  mark?: number;
  warn?: boolean;
  disabled?: boolean;
}) {
  const at = (v: number) => (max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0);
  return (
    <div className={warn ? "bd-slider warn" : "bd-slider"} style={{ "--fill": `${at(value) * 100}%` } as CSSProperties}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {mark !== undefined && <i className="bd-tick" style={{ left: `${at(mark) * 100}%` }} />}
    </div>
  );
}

/** A labelled slider with its value top right. */
export function SliderField({
  label,
  value,
  unit,
  digits = 0,
  warn,
  note,
  ...slider
}: Parameters<typeof Slider>[0] & { unit?: string; digits?: number; note?: ReactNode }) {
  return (
    <div className="bd-field">
      <div className="bd-line">
        <Label>{label}</Label>
        <Value v={value.toFixed(digits)} unit={unit} warn={warn} />
      </div>
      <Slider label={label} value={value} warn={warn} {...slider} />
      {note && <span className="bd-note">{note}</span>}
    </div>
  );
}

export function Chip({
  on,
  warn,
  dashed,
  caps,
  onClick,
  children,
  title,
  disabled,
  style,
}: {
  on?: boolean;
  warn?: boolean;
  dashed?: boolean;
  /** Barlow capitals instead of a value face. */
  caps?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      style={style}
      className={["bd-chip", on ? "on" : "", warn ? "warn" : "", dashed ? "dashed" : "", caps ? "caps" : ""].join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A multi-select chip: a check square before the label, so it never reads as a single choice. */
export function Toggle({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button type="button" title={title} aria-pressed={on} className={on ? "bd-chip caps bd-toggle on" : "bd-chip caps bd-toggle"} onClick={onClick}>
      <i className="bd-check" />
      {children}
    </button>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className="bd-chips">{children}</div>;
}

export function Card({
  on,
  off,
  width,
  top,
  name,
  aside,
  onClick,
  dashed,
  title,
}: {
  on?: boolean;
  /** Unavailable: shown at 45%. */
  off?: boolean;
  width?: number;
  top?: ReactNode;
  name: ReactNode;
  aside?: ReactNode;
  onClick?: () => void;
  dashed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={["bd-card", on ? "on" : "", off ? "off" : "", dashed ? "dashed" : ""].join(" ")}
      style={width ? ({ "--w": width } as CSSProperties) : undefined}
      onClick={onClick}
    >
      {dashed ? (
        <b className="bd-card-centre">{name}</b>
      ) : (
        <>
          <span className="bd-card-top">{top}</span>
          <span className="bd-card-foot">
            <b>{name}</b>
            {aside !== undefined && <small>{aside}</small>}
          </span>
        </>
      )}
    </button>
  );
}

export function TraySep() {
  return <i className="bd-tray-sep" />;
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
