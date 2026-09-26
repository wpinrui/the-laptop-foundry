import type { CSSProperties } from "react";
import type { AppId } from "./types";

// The OS's icons, drawn in CSS so every era can restyle them: 2006 bevelled
// and saturated, 2016 glossy, 2026 soft. None copies a real product's icon.

const size = (s: number) => ({ "--s": `${s}px` }) as CSSProperties;

/** The OS mark: a rounded square holding a diamond. */
export function Mark({ s }: { s: number }) {
  return (
    <i className="os-mark" style={size(s)}>
      <b />
    </i>
  );
}

const DIM = [2, 6, 8];

export function Glyph({ app, s }: { app: AppId; s: number }) {
  if (app === "kiln")
    return (
      <i className="osi osi-kiln" style={size(s)}>
        <span>
          {Array.from({ length: 9 }, (_, k) => (
            <b key={k} className={DIM.includes(k) ? "dim" : undefined} />
          ))}
        </span>
      </i>
    );
  if (app === "ash")
    return (
      <i className="osi osi-ash" style={size(s)}>
        <b className="sun" />
        <b className="ridge" />
      </i>
    );
  if (app === "web")
    return (
      <i className="osi osi-web" style={size(s)}>
        <b className="ring" />
        <b className="meridian" />
        <b className="equator" />
      </i>
    );
  return (
    <i className="osi osi-sys" style={size(s)}>
      <b className="dash" />
      <b className="core" />
    </i>
  );
}

/** A battery outline filled to its level, with a bolt while charging. */
export function Battery({ pct, low, charging, s }: { pct: number; low?: boolean; charging?: boolean; s: number }) {
  return (
    <i className={`os-batt${low ? " low" : ""}${charging ? " chg" : ""}`} style={size(s)}>
      <b style={{ width: `calc(${Math.max(0, Math.min(100, pct))}% - var(--bi) * 2)` }} />
      {charging && (
        <svg viewBox="0 0 10 16" aria-hidden>
          <path d="M6.2 0 0.8 9h3.6L3.4 16l5.8-9.4H5.6Z" />
        </svg>
      )}
    </i>
  );
}

export function Speaker({ muted, s }: { muted: boolean; s: number }) {
  return (
    <svg className="os-snd" viewBox="0 0 20 16" width={s * 1.25} height={s} aria-hidden>
      <path className="fill" d="M1 5h3.5L9 1.2v13.6L4.5 11H1Z" />
      {muted ? (
        <path className="line" d="M12.5 5.5l5 5m0-5-5 5" />
      ) : (
        <>
          <path className="line" d="M11.6 5.2a3.6 3.6 0 0 1 0 5.6" />
          <path className="line" d="M13.8 2.8a7 7 0 0 1 0 10.4" />
        </>
      )}
    </svg>
  );
}

export function Warn({ s }: { s: number }) {
  return (
    <svg className="os-warn" viewBox="0 0 18 16" width={s * 1.1} height={s} aria-hidden>
      <path d="M9 .8 17.4 15.2H.6Z" className="tri" />
      <path d="M9 5.4v5M9 12.2v1.2" className="bang" />
    </svg>
  );
}

export function ErrorIcon({ s }: { s: number }) {
  return (
    <i className="os-err" style={size(s)}>
      <svg viewBox="0 0 10 10" aria-hidden>
        <path d="M3 3l4 4m0-4-4 4" />
      </svg>
    </i>
  );
}

export function PowerGlyph({ s }: { s: number }) {
  return (
    <svg className="os-pwr" viewBox="0 0 16 16" width={s} height={s} aria-hidden>
      <path d="M5.2 3.6a5.6 5.6 0 1 0 5.6 0" />
      <path d="M8 1.4v6" />
    </svg>
  );
}
