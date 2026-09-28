import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import type { Era } from "../review/Charts";
import { StoreSite, type StoreSource } from "../store/StoreSite";
import "./fox.css";

// A small Firefox look-alike that loads real sites. Each tab is a sandboxed
// iframe; the main process strips the headers that forbid framing for these
// frames only and reports where each one navigates, so the address bar and
// the tab titles follow the page even across origins. One address, the
// in-game retailer's, never reaches the network: it renders the same store
// site the laptop's desktop app shows, locally, in place of a frame.

export const FOX_HOME = "https://duckduckgo.com/";
const SEARCH = "https://duckduckgo.com/?q=";

/** What the Firefox app needs to show the retailer locally when its address is typed. */
export interface CourtsData {
  source: StoreSource;
  company: string;
  era: Era;
}

/** True for the retailer's in-game address, however it was typed: never given to a frame. */
export function isCourtsUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "courts.com";
  } catch {
    return false;
  }
}

/** What a site may do in its frame. No top navigation, no downloads. */
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

export interface FoxTab {
  id: string;
  /** Bumped on every navigation the chrome starts, remounting the frame. */
  nonce: number;
  list: string[];
  at: number;
  title: string;
  loading: boolean;
  /** The next reported URL is where the chrome sent the frame, not a new page. */
  expect: boolean;
  frame: number | null;
  /** The site asked for full screen: the frame covers the laptop's screen. */
  full: boolean;
}

let seq = 0;
const tabOf = (url: string): FoxTab => ({
  id: `fox-${++seq}`,
  nonce: 0,
  list: [url],
  at: 0,
  title: "New Tab",
  loading: true,
  expect: true,
  frame: null,
  full: false,
});

/** What the address bar's text means: an http or https URL, else a search. */
export function toUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const search = SEARCH + encodeURIComponent(s);
  const safe = (u: URL) => ((u.protocol === "http:" || u.protocol === "https:") && u.origin !== window.location.origin ? u.href : null);
  const parse = (x: string) => {
    try {
      return safe(new URL(x)) ?? search;
    } catch {
      return search;
    }
  };
  if (/^https?:\/\//i.test(s)) return parse(s);
  if (/\s/.test(s)) return search;
  const tail = "(:\\d+)?([/?#].*)?$";
  if (new RegExp(`^localhost${tail}`, "i").test(s) || new RegExp(`^\\d{1,3}(\\.\\d{1,3}){3}${tail}`).test(s))
    return parse(`http://${s}`);
  if (new RegExp(`^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}${tail}`, "i").test(s)) return parse(`https://${s}`);
  return search;
}

const bridge = () => (typeof window !== "undefined" ? window.api?.fox : undefined);

/** The browser's tabs. Lives with the screen, so moving between the laptop and full screen keeps them. */
export function useFox(open: boolean, onEmpty: () => void) {
  const [tabs, setTabs] = useState<FoxTab[]>(() => [tabOf(FOX_HOME)]);
  const [sel, setSel] = useState(() => tabs[0].id);
  const live = useRef({ open, onEmpty });
  live.current = { open, onEmpty };

  const edit = useCallback((id: string, f: (t: FoxTab) => FoxTab) => setTabs((ts) => ts.map((t) => (t.id === id ? f(t) : t))), []);

  const newTab = useCallback((url: string = FOX_HOME) => {
    const t = tabOf(url);
    setTabs((ts) => [...ts, t]);
    setSel(t.id);
  }, []);

  const reset = useCallback(() => {
    const t = tabOf(FOX_HOME);
    setTabs([t]);
    setSel(t.id);
  }, []);

  const close = useCallback(
    (id: string) => {
      const k = tabs.findIndex((t) => t.id === id);
      if (k < 0) return;
      const rest = tabs.filter((t) => t.id !== id);
      if (!rest.length) {
        live.current.onEmpty();
        return;
      }
      setTabs(rest);
      if (id === sel) setSel(rest[Math.min(k, rest.length - 1)].id);
    },
    [tabs, sel],
  );

  const go = useCallback(
    (url: string) =>
      edit(sel, (t) => ({ ...t, list: [...t.list.slice(0, t.at + 1), url], at: t.at + 1, nonce: t.nonce + 1, expect: true, loading: true })),
    [edit, sel],
  );
  const step = useCallback(
    (d: number) =>
      edit(sel, (t) => {
        const at = t.at + d;
        if (at < 0 || at >= t.list.length) return t;
        return { ...t, at, nonce: t.nonce + 1, expect: true, loading: true };
      }),
    [edit, sel],
  );
  const reload = useCallback(() => edit(sel, (t) => ({ ...t, nonce: t.nonce + 1, expect: true, loading: true })), [edit, sel]);
  const loaded = useCallback((id: string) => edit(id, (t) => ({ ...t, loading: false })), [edit]);

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    const find = (ts: FoxTab[], frame: number, name: string) => ts.find((t) => t.id === name) ?? ts.find((t) => t.frame === frame);
    const offNav = api.onNav(({ frame, name, url }) =>
      setTabs((ts) => {
        const hit = find(ts, frame, name);
        if (!hit) return ts;
        return ts.map((t) => {
          if (t !== hit) return t;
          if (t.expect) {
            const list = [...t.list];
            list[t.at] = url;
            return { ...t, list, expect: false, frame };
          }
          if (url === t.list[t.at]) return { ...t, frame };
          return { ...t, list: [...t.list.slice(0, t.at + 1), url], at: t.at + 1, frame };
        });
      }),
    );
    const offTitle = api.onTitle(({ frame, name, title }) =>
      setTabs((ts) => {
        const hit = find(ts, frame, name);
        return hit ? ts.map((t) => (t === hit ? { ...t, title: title.trim() || t.list[t.at], loading: false } : t)) : ts;
      }),
    );
    const offFull = api.onFull(({ frame, name, on }) =>
      setTabs((ts) => {
        const hit = find(ts, frame, name);
        return hit ? ts.map((t) => (t === hit ? { ...t, full: on } : t)) : ts;
      }),
    );
    const offOpen = api.onOpen((url) => {
      if (live.current.open && /^https?:\/\//i.test(url)) newTab(url);
    });
    // Escape inside a site: hand focus back to the game and let it see the key.
    const offEsc = api.onEscape(() => {
      const a = document.activeElement;
      if (!(a instanceof HTMLIFrameElement) || !a.classList.contains("fx-frame")) return;
      a.blur();
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
    });
    return () => {
      offNav();
      offTitle();
      offFull();
      offOpen();
      offEsc();
    };
  }, [newTab]);

  const tab = tabs.find((t) => t.id === sel) ?? tabs[0];
  return { tabs, tab, sel, setSel, newTab, reset, close, go, step, reload, loaded };
}

export type Fox = ReturnType<typeof useFox>;

// ------------------------------------------------------------------ icon

/** The Firefox mark: a flame-coloured fox curled round a violet globe. */
export function FoxIcon({ s }: { s: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="fx-icon" viewBox="0 0 64 64" width={s} height={s} aria-hidden>
      <defs>
        <radialGradient id={`${id}g`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#c688ff" />
          <stop offset="0.5" stopColor="#9059ff" />
          <stop offset="1" stopColor="#3a2aa8" />
        </radialGradient>
        <radialGradient id={`${id}f`} cx="0.85" cy="0.1" r="1.1">
          <stop offset="0" stopColor="#fff44f" />
          <stop offset="0.3" stopColor="#ffbd4f" />
          <stop offset="0.55" stopColor="#ff8a16" />
          <stop offset="0.8" stopColor="#ff3750" />
          <stop offset="1" stopColor="#e31587" />
        </radialGradient>
        <linearGradient id={`${id}t`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff980e" />
          <stop offset="1" stopColor="#fff44f" />
        </linearGradient>
      </defs>
      <circle cx="33" cy="32" r="21" fill={`url(#${id}g)`} />
      <path
        fill={`url(#${id}f)`}
        fillRule="evenodd"
        d="M49 6c1 5 0 9-2 12 7 4 12 11 12 20 0 13-12 23-27 23S5 51 5 37c0-7 3-13 7-17-1 5 0 8 2 10 1-6 5-11 11-13-2 4-2 7 0 9 3-2 7-3 11-2 2-7 7-13 13-18ZM33 16a15 15 0 1 0 0.1 0Z"
      />
      <path fill={`url(#${id}t)`} d="M8 25c3-10 12-17 23-17 5 0 9 1 13 4-5-1-10-1-15 1-6 2-11 6-13 12-3-1-6-1-8 0Z" />
      <path fill="#ff980e" opacity="0.7" d="M47 18c3 2 6 5 8 9-4-2-8-3-12-3 2-2 3-4 4-6Z" />
    </svg>
  );
}

// ------------------------------------------------------------------ app

function Favicon({ url, loading }: { url: string; loading: boolean }) {
  const [bad, setBad] = useState(false);
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {}
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new site gets a fresh try
  useEffect(() => setBad(false), [origin]);
  if (loading) return <i className="fx-spin" />;
  if (bad || !origin)
    return (
      <svg className="fx-fav" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1.5 8h13M8 1.5c-2.5 3-2.5 10 0 13M8 1.5c2.5 3 2.5 10 0 13" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  return <img className="fx-fav" src={`${origin}/favicon.ico`} alt="" onError={() => setBad(true)} draggable={false} />;
}

function Frame({ tab, shown, onLoad }: { tab: FoxTab; shown: boolean; onLoad: () => void }) {
  // Where the frame starts, fixed at mount: later in-frame navigation must not reload it.
  const [src] = useState(() => tab.list[tab.at]);
  return (
    <iframe
      className={`fx-frame${tab.full && shown ? " fx-full" : ""}`}
      name={tab.id}
      title={tab.title}
      src={src}
      sandbox={SANDBOX}
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ visibility: shown ? "visible" : "hidden" }}
      onLoad={onLoad}
    />
  );
}

const Arrow = ({ flip }: { flip?: boolean }) => (
  <svg viewBox="0 0 16 16" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M13.5 8h-11M7 3.5 2.5 8 7 12.5" />
  </svg>
);

export function FoxApp({ fox, courts }: { fox: Fox; courts?: CourtsData }) {
  const { tabs, tab, sel } = fox;
  const url = tab.list[tab.at];
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  // A new or switched tab shows its own address.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets on tab change only
  useEffect(() => setDraft(null), [sel]);

  const submit = () => {
    const u = draft === null ? null : toUrl(draft);
    if (u) fox.go(u);
    setDraft(null);
    input.current?.blur();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") {
      e.stopPropagation();
      setDraft(null);
      input.current?.blur();
    }
  };

  return (
    <div className="os-fox">
      <div className="fx-tabs">
        {tabs.map((t) => (
          // biome-ignore lint/a11y/useSemanticElements: a tab strip, as a browser draws it
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={t.id === sel}
            className={`fx-tab${t.id === sel ? " on" : ""}`}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                fox.close(t.id);
              } else if (e.button === 0) fox.setSel(t.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") fox.setSel(t.id);
            }}
          >
            {isCourtsUrl(t.list[t.at]) ? (
              <i className="osi osi-shop fx-fav" style={{ "--s": "14px" } as CSSProperties}>
                <b className="handle" />
                <b className="bag" />
              </i>
            ) : (
              <Favicon url={t.list[t.at]} loading={t.loading} />
            )}
            <span className="fx-tab-title">{isCourtsUrl(t.list[t.at]) ? "Courts" : t.title}</span>
            <button
              type="button"
              className="fx-tab-x"
              aria-label="Close tab"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => fox.close(t.id)}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M4 4l8 8m0-8-8 8" />
              </svg>
            </button>
          </div>
        ))}
        <button type="button" className="fx-new" aria-label="Open a new tab" onClick={() => fox.newTab()}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M8 2.5v11M2.5 8h11" />
          </svg>
        </button>
      </div>
      <div className="fx-nav">
        <button type="button" className="fx-btn" aria-label="Back" disabled={tab.at <= 0} onClick={() => fox.step(-1)}>
          <Arrow />
        </button>
        <button type="button" className="fx-btn" aria-label="Forward" disabled={tab.at >= tab.list.length - 1} onClick={() => fox.step(1)}>
          <Arrow flip />
        </button>
        <button type="button" className="fx-btn" aria-label="Reload" onClick={fox.reload}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M13.2 8.5a5.2 5.2 0 1 1-1.6-4.3M13 2v3.5H9.5" />
          </svg>
        </button>
        <label className="fx-url">
          <svg className="fx-lock" viewBox="0 0 16 16" aria-hidden>
            {url.startsWith("https:") ? (
              <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9Z" />
            ) : (
              <path d="M8 1.8 14.5 13.5h-13ZM8 6v3.5M8 11.2v.8" />
            )}
          </svg>
          <input
            ref={input}
            value={draft ?? url}
            spellCheck={false}
            aria-label="Search or enter address"
            placeholder="Search with DuckDuckGo or enter address"
            onFocus={(e) => {
              setDraft(url);
              e.currentTarget.select();
            }}
            onBlur={() => setDraft(null)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
          />
        </label>
        <span className="fx-menu" aria-hidden>
          <svg viewBox="0 0 16 16">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
          </svg>
        </span>
      </div>
      <div className="fx-page">
        {tabs.map((t) => {
          if (isCourtsUrl(t.list[t.at]) && courts)
            return t.id === sel ? (
              <div key={`${t.id}:${t.nonce}`} className="fx-courts">
                <StoreSite source={courts.source} company={courts.company} era={courts.era} />
              </div>
            ) : null;
          return <Frame key={`${t.id}:${t.nonce}`} tab={t} shown={t.id === sel} onLoad={() => fox.loaded(t.id)} />;
        })}
      </div>
    </div>
  );
}
