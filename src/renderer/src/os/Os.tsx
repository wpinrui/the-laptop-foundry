import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { Preset } from "../engine/bench";
import type { ProfileId } from "../engine";
import { BOOT_MS, paintAsh, paintBoot, paintKiln } from "./art";
import { installOsFonts, osFontsReady } from "./fonts";
import { Battery, ErrorIcon, Glyph, Mark, PowerGlyph, Speaker, Warn } from "./Icons";
import { type AppId, clockOf, type Era, type Owner, type Power } from "./types";
import "./os.css";

// The laptop's own operating system, one look per era: 2006 classic blue,
// 2016 glass and 2026 dark. Everything is laid out in logical pixels, the
// panel's resolution after its display scaling, so a window sized here reads
// the same on every screen. Pure view: the cafe owns the state, and the
// pictures in textures and photos render the same components still.

/** The look an era's laptop shows: its own era's. */
export const lookOf = (era: Era): Era => era;

export const APP_NAME: Record<AppId, string> = {
  kiln: "Kilnbench",
  ash: "Ashfall",
  web: "Notebookcheck",
  sys: "System",
};
const DESK_APPS: AppId[] = ["kiln", "ash", "web", "sys"];

const PROFILE_NAME: Record<ProfileId, string> = { high: "High", medium: "Medium", low: "Low" };
const PRESET_NAME: Record<Preset, string> = { low: "Low", medium: "Medium", high: "High", ultra: "Ultra" };
export const PRESETS_SHOWN: Preset[] = ["low", "medium", "high", "ultra"];

const vars = (v: Record<string, string | number>) =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "number" ? `${x}px` : x])) as CSSProperties;

// ------------------------------------------------------------------ shell

/** The screen: every OS picture sits in one of these. */
export function Screen({ era, children, onPointerDown }: { era: Era; children: ReactNode; onPointerDown?: (e: PointerEvent) => void }) {
  installOsFonts();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: closes the flyout on a click elsewhere, as an OS does
    <div className={`os os-${lookOf(era)}`} onPointerDown={onPointerDown}>
      {children}
    </div>
  );
}

function Pick<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  width,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange?: (v: T) => void;
  label: string;
  disabled?: boolean;
  width?: number;
}) {
  const shown = options.find((o) => o.value === value)?.label ?? "";
  return (
    <span className={`os-pick${disabled ? " off" : ""}`} style={width ? { width } : undefined}>
      <span className="os-pick-text">{shown}</span>
      <i className="os-pick-arrow" />
      {onChange && (
        <select
          value={String(value)}
          aria-label={label}
          disabled={disabled}
          onChange={(e) => {
            const o = options.find((x) => String(x.value) === e.target.value);
            if (o) onChange(o.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

function Btn({ children, onClick, primary, disabled, on }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; on?: boolean }) {
  return (
    <button
      type="button"
      className={`os-btn${primary ? " def" : ""}${on ? " on" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ desktop

export interface TaskbarProps {
  era: Era;
  /** The running app, if any, and whether it is minimised. */
  app: AppId | null;
  minimised?: boolean;
  onOpen?: (app: AppId) => void;
  onTask?: () => void;
  power: Power;
  muted: boolean;
  low?: boolean;
  year: number;
  now: Date;
  trayOpen?: boolean;
  onTray?: () => void;
}

function Tray({ era, power, muted, year, now, trayOpen, onTray }: TaskbarProps) {
  const c = clockOf(now, year);
  const look = lookOf(era);
  const low = power.battery && power.pct < 15 && !power.plugged;
  return (
    <div className="os-tray">
      <button type="button" className={`os-tray-btn${trayOpen ? " on" : ""}`} onClick={onTray} aria-label="Power and sound">
        {look === 2026 && <Speaker muted={muted} s={16} />}
        {power.battery && <Battery pct={power.pct} low={low} charging={power.plugged} s={24} />}
        {look !== 2026 && <Speaker muted={muted} s={16} />}
      </button>
      <span className="os-clock">
        <span>{c.time}</span>
        {look !== 2006 && <span>{c.date}</span>}
      </span>
    </div>
  );
}

const PINNED: AppId[] = ["web", "kiln", "ash", "sys"];

export function Taskbar(p: TaskbarProps) {
  const { era, app, minimised, onOpen, onTask } = p;
  if (lookOf(era) === 2026)
    return (
      <div className="os-bar">
        <span className="os-dock">
          <button type="button" className="os-start" aria-label="Start">
            <span className="os-start-tile">
              <Mark s={14} />
            </span>
          </button>
          {PINNED.map((a) => (
            <button
              key={a}
              type="button"
              className={`os-pin${a === app ? (minimised ? " run" : " on") : ""}`}
              onClick={() => (a === app ? onTask?.() : onOpen?.(a))}
              aria-label={APP_NAME[a]}
            >
              <Glyph app={a} s={26} />
              <i />
            </button>
          ))}
        </span>
        <Tray {...p} era={era} />
        <span className="os-show" />
      </div>
    );
  return (
    <div className="os-bar">
      <button type="button" className="os-start" aria-label="Start">
        <Mark s={18} />
        <span>start</span>
      </button>
      <span className="os-quick">
        {(["web", "sys"] as AppId[]).map((a) => (
          <button key={a} type="button" onClick={() => onOpen?.(a)} aria-label={APP_NAME[a]}>
            <Glyph app={a} s={18} />
          </button>
        ))}
      </span>
      <span className="os-tasks">
        {app && (
          <button type="button" className={`os-task${minimised ? "" : " on"}`} onClick={onTask}>
            <Glyph app={app} s={16} />
            <span>{APP_NAME[app]}</span>
          </button>
        )}
      </span>
      <Tray {...p} era={era} />
      <span className="os-show" />
    </div>
  );
}

export function Desktop({
  wallpaper,
  children,
  ...bar
}: TaskbarProps & { wallpaper: string; children?: ReactNode }) {
  return (
    <>
      <img className="os-wall" src={wallpaper} alt="" draggable={false} />
      <div className="os-icons">
        {DESK_APPS.map((a) => (
          <button key={a} type="button" className="os-icon" onClick={() => bar.onOpen?.(a)}>
            <Glyph app={a} s={44} />
            <span>{APP_NAME[a]}</span>
          </button>
        ))}
      </div>
      <div className="os-area">{children}</div>
      <Taskbar {...bar} />
    </>
  );
}

// ------------------------------------------------------------------ windows

export function Win({
  app,
  title,
  w,
  h,
  onMin,
  onClose,
  children,
  hidden,
  className,
}: {
  app: AppId;
  title: string;
  /** The window's cap; it shrinks to the free space. */
  w: number;
  h: number;
  onMin?: () => void;
  onClose?: () => void;
  children: ReactNode;
  hidden?: boolean;
  className?: string;
}) {
  return (
    <div className={`os-win os-win-${app}${className ? ` ${className}` : ""}`} style={{ ...vars({ "--ww": w, "--wh": h }), display: hidden ? "none" : undefined }}>
      <div className="os-title">
        <Glyph app={app} s={16} />
        <span className="os-title-text">{title}</span>
        <span className="os-caps">
          <button type="button" className="os-cap min" onClick={onMin} aria-label="Minimise">
            <b />
          </button>
          <button type="button" className="os-cap max" aria-label="Maximise">
            <b />
          </button>
          <button type="button" className="os-cap close" onClick={onClose} aria-label="Close">
            <b />
          </button>
        </span>
      </div>
      <div className="os-body">{children}</div>
    </div>
  );
}

/** An OS message box, centred on its parent. */
export function MsgBox({ app, title, text, onOk }: { app: AppId; title: string; text: string; onOk?: () => void }) {
  return (
    <div className="os-msg-wrap">
      <Win app={app} title={title} w={500} h={190} className="os-msg" onClose={onOk}>
        <div className="os-msg-body">
          <ErrorIcon s={32} />
          <span>{text}</span>
        </div>
        <div className="os-msg-foot">
          <Btn primary onClick={onOk}>
            OK
          </Btn>
        </div>
      </Win>
    </div>
  );
}

// ------------------------------------------------------------------ canvases

/** A canvas sized to its box in device pixels, repainted by `paint`. */
function useSizedCanvas(paint: (g: CanvasRenderingContext2D, w: number, h: number, u: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setSize([c.clientWidth, c.clientHeight]));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: repaints on the caller's own inputs
  useEffect(() => {
    const c = ref.current;
    const [w, h] = size;
    if (!c || !w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext("2d");
    if (g) paintRef.current(g, w, h, 1);
  }, [size, ...deps]);
  return ref;
}

/** Kilnbench's render area. */
function KilnArt({ era, progress }: { era: Era; progress: number }) {
  const ref = useSizedCanvas((g, w, h, u) => paintKiln(g, w, h, progress, lookOf(era), u), [progress, era]);
  return <canvas ref={ref} className="kb-art" />;
}

// ------------------------------------------------------------------ Kilnbench

export interface RankRow {
  name: string;
  score: number | null;
  own: boolean;
}

const pts = (n: number) => Math.round(n).toLocaleString("en-US");

export function KilnApp({
  era,
  editions,
  edition,
  onEdition,
  running,
  progress,
  result,
  refuses,
  onRun,
  onStop,
  ranking,
}: {
  era: Era;
  editions: number[];
  edition: number;
  onEdition?: (y: number) => void;
  running: boolean;
  progress: number;
  result: number | null;
  refuses: boolean;
  onRun?: () => void;
  onStop?: () => void;
  ranking: RankRow[];
}) {
  const top = Math.max(1, ...ranking.map((r) => (r.own ? (result ?? 0) : (r.score ?? 0))));
  return (
    <div className="os-kiln">
      <div className="kb-side">
        <div className="kb-head">
          <Glyph app="kiln" s={34} />
          <span>Kilnbench</span>
        </div>
        <Pick
          label="Kilnbench edition"
          value={edition}
          options={editions.map((y) => ({ value: y, label: `Kilnbench ${y}` }))}
          onChange={onEdition}
          disabled={running}
        />
        <div className="kb-card">
          <span className="kb-label">CPU multi core</span>
          <div className="kb-row">
            <span className="kb-score">
              {refuses ? (
                <span className="kb-unsup">Unsupported</span>
              ) : running ? (
                <>
                  {Math.round(progress * 100)}
                  <small> %</small>
                </>
              ) : result !== null ? (
                <>
                  {pts(result)}
                  <small> pts</small>
                </>
              ) : (
                <span className="kb-idle">Ready</span>
              )}
            </span>
            {running ? (
              <Btn onClick={onStop}>Stop</Btn>
            ) : (
              <Btn primary onClick={onRun} disabled={refuses}>
                Run
              </Btn>
            )}
          </div>
          {running && (
            <div className="kb-prog">
              <b style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
        {ranking.length > 0 && (
          <div className="kb-rank">
            <span className="kb-label">Ranking</span>
            {ranking.map((r) => {
              const v = r.own ? result : r.score;
              return (
                <div key={`${r.name}${r.own}`} className={`kb-rrow${r.own ? " own" : ""}`}>
                  <div>
                    <span>{r.name}</span>
                    <span>{v !== null ? pts(v) : ""}</span>
                  </div>
                  <i>
                    <b style={{ width: `${((v ?? 0) / top) * 100}%` }} />
                  </i>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="kb-view">
        <KilnArt era={era} progress={result !== null && !running ? 1 : progress} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Ashfall

/** The fps overlay: the only monospace on screen, as a real game overlay would be. */
function Fps({ fps, history }: { fps: number; history: number[] }) {
  const peak = Math.max(1, ...history);
  return (
    <span className="as-fps">
      <span className="as-fps-n">{Math.round(fps)}</span>
      <span className="as-fps-u"> FPS</span>
      <span className="as-fps-bars">
        {history.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length rolling history
          <b key={i} style={{ height: `${Math.max(8, (v / peak) * 100)}%` }} />
        ))}
      </span>
    </span>
  );
}

/** The live game: redrawn only as often as the simulated frame rate allows. */
function AshLive({ fps, detail, preset }: { fps: number; detail: Era; preset: Preset }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [shown, setShown] = useState({ fps: 0, history: [] as number[] });
  const live = useRef({ fps, detail, preset });
  live.current = { fps, detail, preset };
  useEffect(() => {
    let id = 0;
    let last = 0;
    let frames = 0;
    let at = performance.now();
    let clock = 0;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      const c = ref.current;
      const s = live.current;
      if (!c || s.fps <= 0) return;
      if (now - last < 1000 / s.fps) return;
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      frames++;
      if (now - at >= 1000) {
        const n = (frames * 1000) / (now - at);
        setShown((p) => ({ fps: n, history: [...p.history, n].slice(-14) }));
        frames = 0;
        at = now;
      }
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext("2d");
      if (g) paintAsh(g, w, h, s.detail, s.preset, clock);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <>
      <canvas ref={ref} className="as-art" />
      <Fps fps={shown.fps} history={shown.history} />
    </>
  );
}

export function AshApp({
  editions,
  edition,
  onEdition,
  preset,
  onPreset,
  fps,
  detail,
  refusal,
  onOk,
  still,
}: {
  era: Era;
  editions: number[];
  edition: number;
  onEdition?: (y: number) => void;
  preset: Preset;
  onPreset?: (p: Preset) => void;
  /** The simulated frame rate right now; 0 when the game cannot run. */
  fps: number;
  /** The edition's era: how detailed the game looks. */
  detail: Era;
  /** Why the edition will not start, while its message box is up. */
  refusal: string | null;
  onOk?: () => void;
  /** A frame and a reading, for pictures of the screen. */
  still?: { image: string; fps: number };
}) {
  return (
    <div className="os-ash">
      <div className="as-tools">
        <Pick
          label="Ashfall edition"
          value={edition}
          options={editions.map((y) => ({ value: y, label: `Ashfall ${y}` }))}
          onChange={onEdition}
          width={170}
        />
        <span className="as-presets">
          {PRESETS_SHOWN.map((p) => (
            <Btn key={p} on={p === preset} onClick={() => onPreset?.(p)}>
              {PRESET_NAME[p]}
            </Btn>
          ))}
        </span>
      </div>
      <div className="as-view">
        {fps > 0 &&
          (still ? (
            <>
              <img className="as-art" src={still.image} alt="" />
              <Fps fps={still.fps} history={Array.from({ length: 14 }, (_, i) => still.fps * (0.9 + ((i * 7) % 5) * 0.04))} />
            </>
          ) : (
            <AshLive fps={fps} detail={detail} preset={preset} />
          ))}
        {refusal && <MsgBox app="ash" title={`Ashfall ${edition}`} text={refusal} onOk={onOk} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ browser

export function Browser({
  era,
  title,
  url,
  canBack,
  canForward,
  onBack,
  onForward,
  onReload,
  children,
}: {
  era: Era;
  title: string;
  url: string;
  canBack: boolean;
  canForward: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onReload?: () => void;
  children: ReactNode;
}) {
  if (lookOf(era) === 2026)
    return (
      <div className="os-web">
        <div className="wb-tabs">
          <span className="wb-tab">
            <Glyph app="web" s={14} />
            <span>{title}</span>
            <i className="wb-x" />
          </span>
          <span className="wb-new" />
        </div>
        <div className="wb-nav">
          <button type="button" className="wb-back" disabled={!canBack} onClick={onBack} aria-label="Back">
            <i />
          </button>
          <button type="button" className="wb-fwd" disabled={!canForward} onClick={onForward} aria-label="Forward">
            <i />
          </button>
          <button type="button" className="wb-reload" onClick={onReload} aria-label="Reload">
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
            </svg>
          </button>
          <span className="wb-url">
            <span>{url}</span>
          </span>
        </div>
        <div className="wb-page">{children}</div>
      </div>
    );
  if (lookOf(era) === 2016)
    return (
      <div className="os-web">
        <div className="wb-nav">
          <button type="button" className="wb-back" disabled={!canBack} onClick={onBack} aria-label="Back">
            <i />
          </button>
          <button type="button" className="wb-fwd" disabled={!canForward} onClick={onForward} aria-label="Forward">
            <i />
          </button>
          <span className="wb-url">
            <Glyph app="web" s={14} />
            <span>{url}</span>
          </span>
          <span className="wb-search" />
        </div>
        <div className="wb-tabs">
          <span className="wb-tab">
            <Glyph app="web" s={14} />
            <span>{title}</span>
          </span>
        </div>
        <div className="wb-page">{children}</div>
      </div>
    );
  return (
    <div className="os-web">
      <div className="wb-nav">
        <button type="button" className="wb-back" disabled={!canBack} onClick={onBack} aria-label="Back">
          <i />
        </button>
        <span className="wb-back-label">Back</span>
        <button type="button" className="wb-fwd" disabled={!canForward} onClick={onForward} aria-label="Forward">
          <i />
        </button>
        <span className="wb-sep" />
        <button type="button" className="wb-reload" onClick={onReload} aria-label="Reload">
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
          </svg>
        </button>
      </div>
      <div className="wb-addr">
        <span className="wb-addr-label">Address</span>
        <span className="wb-url">
          <Glyph app="web" s={14} />
          <span>{url}</span>
        </span>
        <span className="wb-go">
          <i />
          Go
        </span>
      </div>
      <div className="wb-page">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ system

export interface SysGroup {
  title: string;
  /** Which tab of the 2006 dialog holds it. */
  tab: "general" | "hardware" | "power";
  rows: [string, string][];
}

const TABS: { id: SysGroup["tab"]; label: string }[] = [
  { id: "general", label: "General" },
  { id: "hardware", label: "Hardware" },
  { id: "power", label: "Power" },
];

/** 2016's side pane: each link shows its groups; the first shows them all. */
const PANES: { label: string; shows: string[] | null }[] = [
  { label: "System", shows: null },
  { label: "Display", shows: ["Display"] },
  { label: "Power Options", shows: ["Battery"] },
  { label: "Storage", shows: ["Storage", "Memory"] },
];

/** 2026's side list: About shows everything, the rest their own cards. */
const SETTINGS: { label: string; shows: string[] | null }[] = [
  { label: "About", shows: null },
  { label: "Display", shows: ["Display"] },
  { label: "Battery", shows: ["Battery"] },
  { label: "Storage", shows: ["Storage", "Memory"] },
];

function SysSettings({ groups }: { groups: SysGroup[] }) {
  const [pane, setPane] = useState(0);
  const shows = SETTINGS[pane].shows;
  const shown = shows ? groups.filter((g) => shows.includes(g.title)) : groups;
  return (
    <div className="os-sys">
      <div className="sy-nav">
        {SETTINGS.map((p, k) => (
          <button key={p.label} type="button" className={k === pane ? "on" : undefined} onClick={() => setPane(k)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="sy-page">
        <div className="sy-title">{SETTINGS[pane].label}</div>
        <div className="sy-cards">
          {shown.map((g) => (
            <div key={g.title} className="sy-group">
              <span className="sy-head">{g.title}</span>
              {g.rows.map(([k, v]) => (
                <div key={k} className="sy-row">
                  <span>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SysPanes({ groups }: { groups: SysGroup[] }) {
  const [pane, setPane] = useState(0);
  const shows = PANES[pane].shows;
  const shown = shows ? groups.filter((g) => shows.includes(g.title)) : groups;
  return (
    <div className="os-sys">
      <div className="sy-nav">
        {PANES.map((p, k) => (
          <button key={p.label} type="button" className={k === pane ? "on" : undefined} onClick={() => setPane(k)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="sy-page">
        {shown.map((g) => (
          <div key={g.title} className="sy-group">
            <div className="sy-head">
              <span>{g.title}</span>
              <i />
            </div>
            {g.rows.map(([k, v]) => (
              <div key={k} className="sy-row">
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SysApp({ era, groups, onOk }: { era: Era; groups: SysGroup[]; onOk?: () => void }) {
  const [tab, setTab] = useState<SysGroup["tab"]>("general");
  if (lookOf(era) === 2016) return <SysPanes groups={groups} />;
  if (lookOf(era) === 2026) return <SysSettings groups={groups} />;
  const shown = tab === "general" ? groups : groups.filter((g) => g.tab === tab);
  return (
    <div className="os-sys">
      <div className="sy-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? "on" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="sy-page">
        {shown.map((g) => (
          <fieldset key={g.title} className="sy-group">
            <legend>{g.title}</legend>
            {g.rows.map(([k, v]) => (
              <div key={k} className="sy-row">
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="sy-foot">
        <Btn primary onClick={onOk}>
          OK
        </Btn>
        <Btn onClick={onOk}>Cancel</Btn>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tray

export function Flyout({
  era,
  power,
  profiles,
  profile,
  onProfile,
  volume,
  onVolume,
  muted,
  onMute,
}: {
  era: Era;
  power: Power;
  profiles: ProfileId[];
  profile: ProfileId;
  onProfile: (p: ProfileId) => void;
  volume: number;
  onVolume: (v: number) => void;
  muted: boolean;
  onMute: () => void;
}) {
  const low = power.battery && power.pct < 15 && !power.plugged;
  if (lookOf(era) === 2026)
    return (
      <div className="os-fly">
        <div className="fl-head">
          {power.battery && <Battery pct={power.pct} low={low} charging={power.plugged} s={48} />}
          <span className="fl-level">
            <b>{power.battery ? `${power.pct}%` : "Mains power"}</b>
            {power.battery && <span>{power.time}</span>}
          </span>
        </div>
        <div className="fl-mode">
          <span>Power mode</span>
          <span className="os-seg" role="radiogroup" aria-label="Power mode">
            {(["low", "medium", "high"] as ProfileId[])
              .filter((p) => profiles.includes(p))
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={p === profile}
                  className={p === profile ? "on" : undefined}
                  onClick={() => onProfile(p)}
                >
                  {PROFILE_NAME[p]}
                </button>
              ))}
          </span>
        </div>
        <div className="fl-sound">
          <button type="button" onClick={onMute} aria-label={muted ? "Unmute" : "Mute"}>
            <Speaker muted={muted} s={16} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            aria-label="Volume"
            style={vars({ "--v": `${muted ? 0 : volume}%` })}
            onChange={(e) => onVolume(Number(e.target.value))}
          />
          <span className="fl-vol">{muted ? 0 : volume}</span>
        </div>
      </div>
    );
  return (
    <div className="os-fly">
      <div className="fl-head">
        {power.battery && <Battery pct={power.pct} low={low} charging={power.plugged} s={38} />}
        <span>{power.battery ? `${power.pct}%, ${power.time}` : "On mains power"}</span>
      </div>
      <div className="fl-profiles" role="radiogroup" aria-label="Power profile">
        {(["high", "medium", "low"] as ProfileId[])
          .filter((p) => profiles.includes(p))
          .map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === profile}
              className={p === profile ? "on" : undefined}
              onClick={() => onProfile(p)}
            >
              <i />
              {PROFILE_NAME[p]}
            </button>
          ))}
      </div>
      <div className="fl-sound">
        <button type="button" onClick={onMute} aria-label={muted ? "Unmute" : "Mute"}>
          <Speaker muted={muted} s={16} />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          aria-label="Volume"
          style={vars({ "--v": `${muted ? 0 : volume}%` })}
          onChange={(e) => onVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export function Toast({ era, pct }: { era: Era; pct: number }) {
  if (lookOf(era) === 2026)
    return (
      <div className="os-toast">
        <span className="to-tile">
          <Battery pct={pct} low s={24} />
        </span>
        <span className="to-words">
          <b>Battery low</b>
          <span>{pct}% left. Plug in soon.</span>
        </span>
      </div>
    );
  return (
    <div className="os-toast">
      <div className="to-head">
        <Warn s={16} />
        <b>Battery low</b>
      </div>
      <div className="to-text">{pct}% left. Plug in soon.</div>
    </div>
  );
}

// ------------------------------------------------------------------ boot, lock, off

/** The boot screen, playing from the moment it mounts. */
export function Boot({ era, owner }: { era: Era; owner: Owner }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let id = 0;
    let start = 0;
    let ready = false;
    osFontsReady(lookOf(era)).then(() => {
      ready = true;
    });
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      const c = ref.current;
      if (!c) return;
      if (!start) start = now;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext("2d");
      if (!g) return;
      // Hold black until the faces load, so the name never flashes in a fallback font.
      if (!ready) {
        g.fillStyle = "#000";
        g.fillRect(0, 0, w, h);
        return;
      }
      paintBoot(g, w, h, lookOf(era), owner.maker, owner.wordmark, Math.min(BOOT_MS, now - start), 1);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [era, owner.maker, owner.wordmark]);
  return <canvas ref={ref} className="os-boot" />;
}

/** The battery ran out: an empty outline for a moment, then nothing. */
export function Empty() {
  return (
    <div className="os-empty">
      <i className="os-empty-batt" />
    </div>
  );
}

export function Lock({ era, owner, wallpaper, power, now, year }: { era: Era; owner: Owner; wallpaper: string; power: Power; now: Date; year: number }) {
  if (lookOf(era) === 2026) {
    const c = clockOf(now, year);
    return (
      <div className="os-lock">
        <img className="os-wall" src={wallpaper} alt="" />
        <div className="lk-scrim" />
        <div className="lk-time">
          <span>{c.long}</span>
          <b>{c.short}</b>
        </div>
        <span className="lk-status">
          <Speaker muted={false} s={16} />
          {power.battery && <Battery pct={power.pct} charging={power.plugged} s={24} />}
        </span>
      </div>
    );
  }
  if (lookOf(era) === 2016)
    return (
      <div className="os-lock">
        <div className="lk-user">
          <span className="lk-tile">
            <span>
              <img src={wallpaper} alt="" />
            </span>
          </span>
          <span className="lk-name">{owner.maker || "Owner"}</span>
          <span className="lk-pass">
            <span className="lk-field">{"\u25CF".repeat(5)}</span>
            <span className="lk-go">
              <i />
            </span>
          </span>
        </div>
        {power.battery && (
          <span className="lk-batt">
            <Battery pct={power.pct} charging={power.plugged} s={24} />
            {power.pct}%
          </span>
        )}
        <span className="lk-power">
          <PowerGlyph s={14} />
        </span>
      </div>
    );
  return (
    <div className="os-lock">
      <div className="lk-band top" />
      <div className="lk-line top" />
      <div className="lk-mid" />
      <div className="lk-line bottom" />
      <div className="lk-band bottom" />
      <div className="lk-divider" />
      <div className="lk-brand">
        <Mark s={72} />
        <span>{owner.wordmark}</span>
      </div>
      <div className="lk-user">
        <span className="lk-tile">
          <img src={wallpaper} alt="" />
        </span>
        <div className="lk-who">
          <span className="lk-name">{owner.maker || "Owner"}</span>
          <span className="lk-pass">
            <span className="lk-field">{"●".repeat(5)}</span>
            <span className="lk-go">
              <i />
            </span>
          </span>
        </div>
      </div>
      <span className="lk-power">
        <PowerGlyph s={14} />
      </span>
      {power.battery && (
        <span className="lk-batt">
          <Battery pct={power.pct} charging={power.plugged} s={24} />
          {power.pct}%
        </span>
      )}
    </div>
  );
}
