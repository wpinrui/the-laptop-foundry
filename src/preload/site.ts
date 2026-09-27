import { contextBridge } from "electron";

// Runs at document start in every frame of the session (registered by the
// main process with session.registerPreloadScript). It only acts in the
// browser's site frames: never in a top frame, so the game's own page is left
// alone, and only for web pages. It exposes nothing to the page; what it
// changes in the page's world is done once, before the page's own scripts.

/** A web page in a frame below some top frame: a browser tab or a frame inside one. */
const siteFrame = window.top !== window.self && /^https?:$/.test(location.protocol);

/**
 * Makes the tab look like a plain Chrome and keeps its script-set cookies.
 * The game's page is the top-level site, so every site in a tab is
 * cross-site: Chrome drops a cookie set from script unless it is
 * SameSite=None; Secure, and Google's sign-in then says cookies are off.
 * Runs in the page's world, so it must be self-contained.
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
  const nav = Navigator.prototype;
  const major = /Chrome\/(\d+)/.exec(ua)?.[1] ?? "0";
  Object.defineProperty(nav, "userAgent", { configurable: true, enumerable: true, get: () => ua });
  Object.defineProperty(nav, "appVersion", { configurable: true, enumerable: true, get: () => ua.slice(8) });
  type HighEntropy = (hints: string[]) => Promise<Record<string, unknown>>;
  if (firefox) {
    const platform = /\(([^)]*)\)/.exec(ua)?.[1]?.replace(/;\s*rv:.*$/, "") ?? "";
    const fake: Record<string, unknown> = {
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
    return;
  }
  const data = (navigator as { userAgentData?: { brands: unknown[]; getHighEntropyValues: HighEntropy } }).userAgentData;
  if (data) {
    const brands = [
      { brand: "Google Chrome", version: major },
      { brand: "Chromium", version: major },
      { brand: "Not/A)Brand", version: "24" },
    ];
    const proto = Object.getPrototypeOf(data);
    Object.defineProperty(proto, "brands", { configurable: true, enumerable: true, get: () => brands });
    const high: HighEntropy = proto.getHighEntropyValues;
    proto.getHighEntropyValues = function (this: unknown, hints: string[]) {
      return high.call(this, hints).then((v) => {
        const out = { ...v, brands };
        if ("fullVersionList" in v) {
          out.fullVersionList = brands.map((b) => ({ brand: b.brand, version: `${b.version}.0.0.0` }));
        }
        return out;
      });
    };
  }
}

if (siteFrame) {
  const platform = /\(([^)]*)\)/.exec(navigator.userAgent)?.[1] ?? "Windows NT 10.0; Win64; x64";
  const major = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? "0";
  // Google's sign-in gets a Firefox, as in the main process (fox.ts).
  const anc = location.ancestorOrigins;
  const tab = anc && anc.length >= 2 ? anc[anc.length - 2] : location.origin;
  const firefox = tab === "https://accounts.google.com";
  const ua = firefox
    ? `Mozilla/5.0 (${platform}; rv:${Number(major) + 3}.0) Gecko/20100101 Firefox/${Number(major) + 3}.0`
    : `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  try {
    contextBridge.executeInMainWorld({ func: fixSite, args: [ua, location.protocol === "https:", firefox] });
  } catch {}
}
