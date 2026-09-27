import { contextBridge, ipcRenderer, webFrame } from "electron";

// Runs at document start in every frame of the session (registered by the
// main process with session.registerPreloadScript). It only acts in the
// browser's site frames: never in a top frame, so the game's own page is left
// alone, and only for web pages. It exposes nothing to the page; what it
// changes in the page's world is done once, before the page's own scripts.
// Its IPC stays here in the isolated world, out of the page's reach.

/** A web page in a frame below some top frame: a browser tab or a frame inside one. */
const siteFrame = window.top !== window.self && /^https?:$/.test(location.protocol);

/**
 * Keeps a tab's script-set cookies, and dresses Google's sign-in as Firefox.
 * The game's page is the top-level site, so every site in a tab is
 * cross-site: Chrome drops a cookie set from script unless it is
 * SameSite=None; Secure, and Google's sign-in then says cookies are off.
 * Other sites keep the real navigator: spoofing it in the page trips bot
 * checks such as Cloudflare's. Runs in the page's world, so it must be
 * self-contained.
 */
function fixSite(ua: string, secure: boolean, firefox: boolean): void {
  const cross = (c: string): string => {
    if (!secure) return c;
    const parts = String(c)
      .split(";")
      .filter((p) => !/^\s*samesite\s*=/i.test(p));
    if (!parts.some((p) => /^\s*secure\s*$/i.test(p))) parts.push(" Secure");
    parts.push(" SameSite=None");
    return parts.join(";");
  };
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  if (cookie?.get && cookie.set) {
    const { get, set } = cookie;
    Object.defineProperty(Document.prototype, "cookie", {
      configurable: true,
      enumerable: cookie.enumerable,
      get() {
        return get.call(this);
      },
      set(v: string) {
        set.call(this, cross(v));
      },
    });
  }
  const store = (globalThis as { CookieStore?: { prototype: { set: (...a: unknown[]) => Promise<void> } } }).CookieStore;
  if (store && secure) {
    const orig = store.prototype.set;
    store.prototype.set = function (this: unknown, a: unknown, b?: unknown) {
      const opts = typeof a === "string" ? { name: a, value: b } : { ...(a as object) };
      return orig.call(this, { ...opts, sameSite: "none" });
    };
  }
  if (!firefox) return;
  const nav = Navigator.prototype;
  const platform = /\(([^)]*)\)/.exec(ua)?.[1]?.replace(/;\s*rv:.*$/, "") ?? "";
  const fake: Record<string, unknown> = {
    userAgent: ua,
    appVersion: "5.0 (Windows)",
    userAgentData: undefined,
    vendor: "",
    productSub: "20100101",
    oscpu: platform,
    buildID: "20181001000000",
  };
  for (const [k, v] of Object.entries(fake)) {
    Object.defineProperty(nav, k, { configurable: true, enumerable: true, get: () => v });
  }
  try {
    delete (window as { chrome?: unknown }).chrome;
  } catch {}
}

if (siteFrame) {
  const platform = /\(([^)]*)\)/.exec(navigator.userAgent)?.[1] ?? "Windows NT 10.0; Win64; x64";
  const major = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? "0";
  // Google's sign-in gets a Firefox, as in the main process (fox.ts).
  const anc = location.ancestorOrigins;
  const tab = anc && anc.length >= 2 ? anc[anc.length - 2] : location.origin;
  const firefox = tab === "https://accounts.google.com";
  const ua = `Mozilla/5.0 (${platform}; rv:${Number(major) + 3}.0) Gecko/20100101 Firefox/${Number(major) + 3}.0`;
  try {
    contextBridge.executeInMainWorld({ func: fixSite, args: [ua, location.protocol === "https:", firefox] });
  } catch {}
  adblock();
}

/**
 * The ad blocker's part in the page: the blocker's hiding rules and
 * scriptlets for this document, applied before the page's own scripts run
 * (scriptlets only work that early), then more hiding rules as the page adds
 * classes, ids and links. The main process picks the rules for this frame's
 * own address (src/main/adblock.ts).
 */
function adblock(): void {
  let start: { styles: string; scripts: string[] } | null = null;
  try {
    start = ipcRenderer.sendSync("fox-adblock:start");
  } catch {}
  if (!start) return;
  if (start.styles) webFrame.insertCSS(start.styles, { cssOrigin: "user" });
  // Each scriptlet in its own scope: several declare the same top-level names.
  for (const script of start.scripts) webFrame.executeJavaScript(`(function(){${script}\n})()`).catch(() => {});

  const seen = { classes: new Set<string>(), ids: new Set<string>(), hrefs: new Set<string>() };
  let pending = new Set<Element>();
  const scan = (roots: Iterable<Element>) => {
    const fresh = { classes: [] as string[], ids: [] as string[], hrefs: [] as string[] };
    const add = (kind: keyof typeof seen, v: string | null) => {
      if (v && !seen[kind].has(v) && seen[kind].size < 20000) {
        seen[kind].add(v);
        fresh[kind].push(v);
      }
    };
    const visit = (e: Element) => {
      add("ids", e.id);
      for (const c of e.classList) add("classes", c);
      add("hrefs", e.getAttribute("href"));
    };
    for (const root of roots) {
      if (!root.isConnected) continue;
      visit(root);
      for (const e of root.querySelectorAll("[id],[class],[href]")) visit(e);
    }
    if (!fresh.classes.length && !fresh.ids.length && !fresh.hrefs.length) return;
    ipcRenderer
      .invoke("fox-adblock:dom", fresh)
      .then((styles: unknown) => {
        if (typeof styles === "string" && styles) webFrame.insertCSS(styles, { cssOrigin: "user" });
      })
      .catch(() => {});
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    timer = deadline = undefined;
    const roots = pending;
    pending = new Set();
    scan(roots);
  };
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      scan([document.documentElement]);
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "attributes" && r.target instanceof Element) pending.add(r.target);
          for (const n of r.addedNodes) if (n instanceof Element) pending.add(n);
        }
        if (!pending.size) return;
        clearTimeout(timer);
        timer = setTimeout(flush, 50);
        deadline ??= setTimeout(flush, 1000);
      }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "id", "href"],
      });
    },
    { once: true },
  );
}
