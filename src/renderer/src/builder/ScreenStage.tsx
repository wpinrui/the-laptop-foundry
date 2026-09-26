import { useState } from "react";
import {
  type Build,
  CONTENT,
  commonHz,
  DIAG,
  defaultScreen,
  KIND_NAME,
  KIND_YEARS,
  kindAvailable,
  madeRow,
  maxHz,
  maxPpi,
  ppiOf,
  RATIOS,
  resolveScreen,
  SCREEN_KINDS,
  type ScreenKind,
  type ScreenSpec,
  screenOf,
  screenPrice,
  standardResolutions,
} from "../engine";
import { panelLab } from "../engine/content/display";
import type { StageProps } from "./Stages";
import { Card, Chip, Chips, Label, money, Slider, Value } from "./ui";

// The Screen stage: a freely specified screen. Standard ratios and
// resolutions come first; anything the year could make but nobody sold
// becomes a custom panel at a premium. What no one could make is greyed out.

const HZ = [60, 90, 120, 144, 165, 240];

function sameRatio(a: [number, number], b: [number, number]): boolean {
  return a[0] * b[1] === a[1] * b[0];
}

/** The standard resolution nearest in pixel count, for a new ratio. */
function resFor(ratio: [number, number], diag: number, year: number, near: [number, number]): [number, number] {
  const list = standardResolutions(ratio, diag, year);
  const px = near[0] * near[1];
  if (list.length > 0)
    return list.reduce((a, b) => (Math.abs(a[0] * a[1] - px) <= Math.abs(b[0] * b[1] - px) ? a : b));
  const w = Math.round(Math.sqrt((px * ratio[0]) / ratio[1]) / 8) * 8;
  return [w, Math.round((w * ratio[1]) / ratio[0])];
}

function NumberBox({
  value,
  onCommit,
  width = 64,
  label,
}: {
  value: number | "";
  onCommit: (v: number) => void;
  width?: number;
  label: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="bd-input"
      style={{ width: `calc(${width} * var(--u))` }}
      aria-label={label}
      inputMode="numeric"
      placeholder="____"
      value={text ?? String(value)}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => {
        const v = Number(text);
        if (text !== null && text !== "" && Number.isFinite(v) && v > 0) onCommit(v);
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function ScreenColumn({ build, set }: StageProps) {
  const year = build.year;
  const current = screenOf(build);
  const spec: ScreenSpec = current ?? defaultScreen(year);
  const put = (f: (s: ScreenSpec) => ScreenSpec) =>
    set((b) => {
      const parts = { ...b.parts };
      delete parts.display;
      return { ...b, parts, screen: f(screenOf(b) ?? defaultScreen(b.year)) };
    });
  const [customRatio, setCustomRatio] = useState(false);
  const [customRes, setCustomRes] = useState(false);
  const [customHz, setCustomHz] = useState(false);

  const ratioStandard = RATIOS.some((r) => sameRatio(r, spec.ratio));
  const list = standardResolutions(spec.ratio, spec.diag, year);
  const resStandard = list.some((r) => r[0] === spec.res[0] && r[1] === spec.res[1]);
  const panel = resolveScreen(spec, year);
  const cap = maxHz(year);
  const ppiCap = maxPpi(year);
  const common = commonHz(year);
  const hzList = [...new Set([...HZ, ...common])].sort((a, b) => a - b);
  // Which choice made it custom: the refresh when the size and resolution were sold at another rate.
  const soldAt = CONTENT.panels.filter(
    (p) =>
      p.from <= year &&
      year <= p.until &&
      Math.abs(p.inches - spec.diag) < 0.051 &&
      p.res[0] === spec.res[0] &&
      p.res[1] === spec.res[1] &&
      !!madeRow({ ...spec, hz: p.refresh[0] }, year),
  );
  const hzWarn = !!current && panel.custom && soldAt.length > 0;
  const resWarn = !!current && panel.custom && !hzWarn;

  return (
    <>
      <div className="bd-field">
        <div className="bd-line">
          <Label>Diagonal</Label>
          <Value big v={spec.diag.toFixed(1)} unit="in" />
        </div>
        <Slider
          label="diagonal"
          value={spec.diag}
          min={DIAG[0]}
          max={DIAG[1]}
          step={0.1}
          onChange={(v) => put((s) => ({ ...s, diag: Math.round(v * 10) / 10 }))}
        />
      </div>

      <div className="bd-field">
        <Label>Ratio</Label>
        <Chips>
          {RATIOS.map((r) => (
            <Chip
              key={r.join(":")}
              on={!!current && !customRatio && sameRatio(r, spec.ratio)}
              onClick={() => {
                setCustomRatio(false);
                put((s) => ({ ...s, ratio: r, res: resFor(r, s.diag, year, s.res) }));
              }}
            >
              {r[0]}:{r[1]}
            </Chip>
          ))}
          {customRatio || (!!current && !ratioStandard) ? (
            <span className="bd-chip on bd-chip-edit">
              <NumberBox
                width={34}
                label="ratio width"
                value={spec.ratio[0]}
                onCommit={(v) => put((s) => ({ ...s, ratio: [v, s.ratio[1]], res: resFor([v, s.ratio[1]], s.diag, year, s.res) }))}
              />
              :
              <NumberBox
                width={34}
                label="ratio height"
                value={spec.ratio[1]}
                onCommit={(v) => put((s) => ({ ...s, ratio: [s.ratio[0], v], res: resFor([s.ratio[0], v], s.diag, year, s.res) }))}
              />
            </span>
          ) : (
            <Chip dashed onClick={() => setCustomRatio(true)}>
              __:__
            </Chip>
          )}
        </Chips>
      </div>

      <div className="bd-field bd-res">
        <Label>Resolution</Label>
        <div className="bd-res-rows">
          {list.map((r) => {
            const on = !!current && !customRes && r[0] === spec.res[0] && r[1] === spec.res[1];
            return (
              <button
                type="button"
                key={r.join("x")}
                className={["bd-res-row", on ? "on" : "", on && resWarn ? "warn" : ""].join(" ")}
                onClick={() => {
                  setCustomRes(false);
                  put((s) => ({ ...s, res: r }));
                }}
              >
                <span>
                  {r[0]} × {r[1]}
                </span>
                <span>{ppiOf(spec.diag, r)} ppi</span>
              </button>
            );
          })}
          <div className={["bd-res-row", customRes || (!!current && !resStandard) ? "on" : "", resWarn && !resStandard ? "warn" : ""].join(" ")}>
            <span>
              <NumberBox
                label="resolution width"
                value={customRes || (current && !resStandard) ? spec.res[0] : ""}
                onCommit={(v) => {
                  setCustomRes(true);
                  put((s) => ({ ...s, res: [v, s.res[1]] }));
                }}
              />
              {" × "}
              <NumberBox
                label="resolution height"
                value={customRes || (current && !resStandard) ? spec.res[1] : ""}
                onCommit={(v) => {
                  setCustomRes(true);
                  put((s) => ({ ...s, res: [s.res[0], v] }));
                }}
              />
            </span>
            <span className={ppiOf(spec.diag, spec.res) > ppiCap && !resStandard ? "warn" : ""}>
              {!resStandard && current ? `${ppiOf(spec.diag, spec.res)} ppi` : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="bd-field">
        <Label>Refresh</Label>
        <Chips>
          {hzList.map((h) => {
            const on = !!current && !customHz && spec.hz === h;
            return (
              <Chip
                key={h}
                on={on && !hzWarn}
                warn={on && hzWarn}
                disabled={h > cap}
                style={h > cap ? { opacity: 0.45 } : undefined}
                onClick={() => {
                  setCustomHz(false);
                  put((s) => ({ ...s, hz: h }));
                }}
              >
                {h}
              </Chip>
            );
          })}
          {customHz || (!!current && !hzList.includes(spec.hz)) ? (
            <span className={hzWarn ? "bd-chip warn bd-chip-edit" : "bd-chip on bd-chip-edit"}>
              <NumberBox width={44} label="refresh" value={spec.hz} onCommit={(v) => put((s) => ({ ...s, hz: v }))} />
            </span>
          ) : (
            <Chip dashed onClick={() => setCustomHz(true)}>
              ___
            </Chip>
          )}
        </Chips>
        {current && panel.custom && (
          <span className="bd-note">
            {spec.hz} Hz at {spec.res[0]} × {spec.res[1]}: custom panel{"  "}+{money(panel.premium)}
          </span>
        )}
        {current && spec.panel === "tn" && year < 2010 && (
          <Chips>
            {(["matte", "glossy"] as const).map((f) => (
              <Chip caps key={f} on={(spec.surface ?? "matte") === f} onClick={() => put((s) => ({ ...s, surface: f }))}>
                {f}
              </Chip>
            ))}
          </Chips>
        )}
      </div>
    </>
  );
}

function kindTop(kind: ScreenKind, spec: ScreenSpec, year: number): string {
  if (!kindAvailable(kind, year)) {
    const [a, b] = KIND_YEARS[kind];
    return b >= 2099 ? `from ${a}` : `${Math.max(a, 2006)} to ${b}`;
  }
  const p = resolveScreen({ ...spec, panel: kind }, year);
  const lab = panelLab(p);
  if (lab.dimmingZones) return `${lab.dimmingZones} zones  ${p.nits} nits`;
  const contrast = Number.isFinite(lab.contrast) ? `${lab.contrast}:1` : "1000000:1";
  return `${contrast}  ${p.nits} nits`;
}

export function ScreenTray({ build, set }: StageProps) {
  const year = build.year;
  const current = screenOf(build);
  const spec = current ?? defaultScreen(year);
  return (
    <>
      {SCREEN_KINDS.map((k) => {
        const ok = kindAvailable(k, year);
        const priced = ok ? screenPrice(resolveScreen({ ...spec, panel: k }, year)) : null;
        return (
          <Card
            key={k}
            width={170}
            on={!!current && current.panel === k}
            off={!ok}
            top={kindTop(k, spec, year)}
            name={KIND_NAME[k]}
            aside={priced === null ? undefined : money(priced)}
            onClick={
              ok
                ? () =>
                    set((b: Build) => {
                      const parts = { ...b.parts };
                      delete parts.display;
                      return { ...b, parts, screen: { ...(screenOf(b) ?? defaultScreen(b.year)), panel: k } };
                    })
                : undefined
            }
          />
        );
      })}
    </>
  );
}
