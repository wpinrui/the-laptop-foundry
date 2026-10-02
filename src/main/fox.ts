import { join } from "node:path";
import { type BrowserWindow, session, type WebFrameMain, webFrameMain } from "electron";
import { adblockHeaders, adblockRequest, loadAdblock, registerAdblockIpc } from "./adblock";
import { exitFull, FAKE_FULLSCREEN, FULL_TOKEN } from "./fullscreen";
import { paceWait, registerPaceIpc } from "./pace";
import { registerSpeakerIpc } from "./speaker";
import { sponsorBlock } from "./sponsorblock";

// The in-game browser: real sites load in sandboxed iframes inside the laptop
// OS's window. The main process lets those frames load (it strips the headers
// that forbid framing, for them only), tells the renderer where each one went,
// and keeps every site away from the game's own window.

const web = (url: string): boolean => /^https?:\/\//i.test(url);

/** A frame the browser owns: any frame below the game's top frame. */
function isSiteFrame(win: BrowserWindow, frame: WebFrameMain | null | undefined): boolean {
  if (!frame) return false;
  try {
    return frame.frameTreeNodeId !== win.webContents.mainFrame.frameTreeNodeId;
  } catch {
    return false;
  }
}

/** A direct child of the game's top frame: one browser tab. */
function tabFrame(win: BrowserWindow, pid: number, rid: number): WebFrameMain | null {
  try {
    const f = webFrameMain.fromId(pid, rid);
    if (!f || f.parent?.frameTreeNodeId !== win.webContents.mainFrame.frameTreeNodeId) return null;
    return f;
  } catch {
    return null;
  }
}

function siteFrame(pid: number, rid: number): WebFrameMain | null {
  try {
    return webFrameMain.fromId(pid, rid) ?? null;
  } catch {
    return null;
  }
}

/**
 * Takes document.startViewTransition away from a site's frame. A view
 * transition inside an out-of-process iframe crashes that frame's renderer on
 * its compositor thread (YouTube starts one a few seconds into a watch page),
 * and the crashed frame shows as a grey page. Without the API, sites fall back
 * to swapping content directly. Runs as each document commits, before the
 * site gets round to a transition.
 */
function noViewTransitions(pid: number, rid: number): void {
  try {
    webFrameMain
      .fromId(pid, rid)
      ?.executeJavaScript("delete Document.prototype.startViewTransition")
      .catch(() => {});
  } catch {}
}

/**
 * A request a site made, as opposed to the game: it comes from a frame below
 * the game's top frame and is not for the game's own origin. A tab's own
 * document is left alone, the way a browser never blocks the page you typed.
 */
function siteRequest(
  win: BrowserWindow,
  d: { webContentsId?: number; frame?: WebFrameMain | null; resourceType: string; url: string },
  appOrigin: (url: string) => boolean,
): boolean {
  if (win.isDestroyed() || d.webContentsId !== win.webContents.id || appOrigin(d.url)) return false;
  const f = d.frame;
  if (!f || !isSiteFrame(win, f)) return false;
  if (d.resourceType === "subFrame" && f.parent?.frameTreeNodeId === win.webContents.mainFrame.frameTreeNodeId) return false;
  return true;
}

/** Chrome's user agent for the Chromium Electron ships, without the app and Electron tokens. */
let chromeUa = "";
function chromeUA(): string {
  if (chromeUa) return chromeUa;
  const ua = session.defaultSession.getUserAgent();
  const platform = /\(([^)]*)\)/.exec(ua)?.[1] ?? "Windows NT 10.0; Win64; x64";
  const major = /Chrome\/(\d+)/.exec(ua)?.[1] ?? "148";
  chromeUa = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  return chromeUa;
}

/**
 * Google's sign-in turns away any Chromium it suspects is embedded ("this
 * browser or app may not be secure"). A Chrome user agent cannot pass, as real
 * Chrome proves itself to Google with headers Electron cannot make. Google is
 * more lenient with Firefox, so a tab on its sign-in sees a Firefox, all the
 * way down (src/preload/site.ts does the same for the page's scripts).
 */
const googleSignIn = (url: string): boolean => /^https:\/\/accounts\.google\.com\//i.test(url);

/** The address of the tab a site request belongs to. */
function tabUrl(win: BrowserWindow, d: { resourceType: string; url: string; frame?: WebFrameMain | null }): string {
  try {
    const top = win.webContents.mainFrame.frameTreeNodeId;
    let f = d.frame ?? null;
    if (d.resourceType === "subFrame" && f?.parent?.frameTreeNodeId === top) return d.url;
    while (f?.parent && f.parent.frameTreeNodeId !== top) f = f.parent;
    return f?.url ?? "";
  } catch {
    return "";
  }
}

function firefoxUA(): string {
  const platform = /\(([^)]*)\)/.exec(chromeUA())?.[1] ?? "Windows NT 10.0; Win64; x64";
  const major = Number(/Chrome\/(\d+)/.exec(chromeUA())?.[1] ?? "145") + 3;
  return `Mozilla/5.0 (${platform}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
}

/** The low-entropy client hints Chrome sends with every secure request. */
function clientHints(): Record<string, string> {
  const major = /Chrome\/(\d+)/.exec(chromeUA())?.[1] ?? "0";
  const platform = process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux";
  return {
    "sec-ch-ua": `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not/A)Brand";v="24"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"${platform}"`,
  };
}

/** A request from any frame below the game's top frame, the game's own pages excepted. */
function fromSite(
  win: BrowserWindow,
  d: { webContentsId?: number; frame?: WebFrameMain | null; url: string },
  appOrigin: (url: string) => boolean,
): boolean {
  if (win.isDestroyed()) return false;
  return d.webContentsId === win.webContents.id && !appOrigin(d.url) && isSiteFrame(win, d.frame);
}

/**
 * Makes a site's Set-Cookie usable inside a tab. The game's own page is the
 * top-level site, so to the browser every site in a tab is cross-site: it
 * would refuse to store Lax and Strict cookies, and never send them back.
 * SameSite=None (which needs Secure) keeps sign-ins working, and the cookies
 * persist in the default session like any browser's.
 */
function crossSiteCookies(headers: Record<string, string[]>, url: string): void {
  if (!url.startsWith("https:")) return;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() !== "set-cookie") continue;
    headers[k] = headers[k].map((c) => {
      const parts = c.split(";").filter((p) => !/^\s*samesite\s*=/i.test(p));
      if (!parts.some((p) => /^\s*secure\s*$/i.test(p))) parts.push(" Secure");
      parts.push(" SameSite=None");
      return parts.join(";");
    });
  }
}

export function registerFox(
  win: BrowserWindow,
  appOrigin: (url: string) => boolean,
  sitePreload = join(__dirname, "../preload/site.js"),
): void {
  loadAdblock();
  const isSite = (f: WebFrameMain | null): boolean => {
    try {
      return !win.isDestroyed() && f?.top?.frameTreeNodeId === win.webContents.mainFrame.frameTreeNodeId && isSiteFrame(win, f) && !appOrigin(f.url);
    } catch {
      return false;
    }
  };
  registerAdblockIpc(isSite);
  registerSpeakerIpc(win, isSite);
  registerPaceIpc(win);
  // Runs at document start in site frames (see src/preload/site.ts).
  if (!session.defaultSession.getPreloadScripts().some((p) => p.id === "fox-site")) {
    session.defaultSession.registerPreloadScript({ type: "frame", id: "fox-site", filePath: sitePreload });
  }
  const wc = win.webContents;
  const send = (channel: string, payload: unknown) => {
    if (!wc.isDestroyed()) wc.send(channel, payload);
  };

  // Electron keeps one listener per webRequest event, so the ad blocker runs
  // from inside these rather than registering its own.

  // Let sites be framed, but only inside the game's own window and only for
  // subframes: the game's pages keep their headers.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    if (d.webContentsId !== wc.id || appOrigin(d.url) || !d.responseHeaders) {
      cb({});
      return;
    }
    if (d.resourceType !== "subFrame") {
      if (!fromSite(win, d, appOrigin)) {
        cb({});
        return;
      }
      const headers = { ...d.responseHeaders };
      crossSiteCookies(headers, d.url);
      cb({ responseHeaders: headers });
      return;
    }
    const headers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(d.responseHeaders)) {
      const key = k.toLowerCase();
      if (key === "x-frame-options") continue;
      if (key === "content-security-policy") {
        const kept = v
          .map((p) =>
            p
              .split(";")
              .filter((dir) => !/^\s*frame-ancestors\b/i.test(dir))
              .join(";"),
          )
          .filter((p) => p.trim());
        if (kept.length) headers[k] = kept;
        continue;
      }
      headers[k] = v;
    }
    crossSiteCookies(headers, d.url);
    cb({ responseHeaders: adblockHeaders(d, headers) });
  });

  // Sites see a plain Chrome, and a tab's page loads as a page: Google answers
  // a sign-in page requested as an iframe with a 401, and turns away browsers
  // it can tell are embedded. The game's own requests keep their headers.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    if (!fromSite(win, d, appOrigin)) {
      cb({});
      return;
    }
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.requestHeaders)) {
      if (!/^(user-agent|sec-ch-.*)$/i.test(k)) h[k] = v;
    }
    if (googleSignIn(tabUrl(win, d))) {
      for (const k of Object.keys(h)) if (/^(sec-fetch-storage-access|x-client-data|x-browser-.*)$/i.test(k)) delete h[k];
      h["User-Agent"] = firefoxUA();
    }
    else {
      h["User-Agent"] = chromeUA();
      if (d.url.startsWith("https:")) Object.assign(h, clientHints());
    }
    if (d.resourceType === "subFrame" && d.frame?.parent?.frameTreeNodeId === wc.mainFrame.frameTreeNodeId) {
      for (const k of Object.keys(h)) if (k.toLowerCase() === "sec-fetch-dest") delete h[k];
      h["Sec-Fetch-Dest"] = "document";
    }
    cb({ requestHeaders: h });
  });

  // The game's own pages never load inside the browser, and sites lose their
  // ads and trackers.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    if (d.resourceType === "subFrame" && d.webContentsId === wc.id && appOrigin(d.url)) {
      cb({ cancel: true });
      return;
    }
    const verdict = siteRequest(win, d, appOrigin) ? adblockRequest(d) : {};
    // What goes through waits as long as the laptop in the game would take.
    const wait = verdict.cancel || verdict.redirectURL || !fromSite(win, d, appOrigin) ? 0 : paceWait(win, d);
    if (wait > 0) setTimeout(() => cb(verdict), wait);
    else cb(verdict);
  });

  // Sites get no permissions; the game keeps what it asks for.
  session.defaultSession.setPermissionRequestHandler((contents, _perm, cb, details) => {
    cb(contents.id !== wc.id || details.isMainFrame);
  });
  session.defaultSession.setPermissionCheckHandler((contents, _perm, _origin, details) => {
    return !contents || contents.id !== wc.id || details.isMainFrame;
  });

  // Nothing navigates the game's window away, and frames stay on the web.
  wc.on("will-navigate", (e) => {
    if (!appOrigin(e.url)) e.preventDefault();
  });
  wc.on("will-frame-navigate", (e) => {
    if (e.isMainFrame) {
      if (!appOrigin(e.url)) e.preventDefault();
      return;
    }
    if (e.url === "about:blank" || e.url === "about:srcdoc") return;
    if (!web(e.url) || appOrigin(e.url)) e.preventDefault();
  });
  wc.on("will-redirect", (e) => {
    if (e.isMainFrame && !appOrigin(e.url)) e.preventDefault();
  });

  // New windows become new browser tabs, never Electron windows.
  wc.setWindowOpenHandler(({ url }) => {
    if (web(url) && !appOrigin(url)) send("fox:open", url);
    return { action: "deny" };
  });

  // Tabs a site has put in (the stand-in) full screen, by frame.
  const full = new Map<number, WebFrameMain>();
  const setFull = (f: WebFrameMain, on: boolean) => {
    if (on) full.set(f.frameTreeNodeId, f);
    else if (!full.delete(f.frameTreeNodeId)) return;
    send("fox:full", { frame: f.frameTreeNodeId, name: f.name, on });
  };
  wc.on("console-message", (e) => {
    const { message, frame } = e;
    if (!message.startsWith(FULL_TOKEN) || !frame) return;
    if (frame.parent?.frameTreeNodeId !== wc.mainFrame.frameTreeNodeId) return;
    setFull(frame, message.slice(FULL_TOKEN.length) === "on");
  });

  // Where each tab went, so the address bar follows the page.
  const report = (f: WebFrameMain | null, url: string) => {
    if (f && web(url)) send("fox:nav", { frame: f.frameTreeNodeId, name: f.name, url });
  };
  wc.on("did-frame-navigate", (_e, url, _code, _status, main, pid, rid) => {
    if (main) return;
    noViewTransitions(pid, rid);
    const f = siteFrame(pid, rid);
    if (f) setFull(f, false);
    if (f && web(url) && !appOrigin(url)) {
      f.executeJavaScript(FAKE_FULLSCREEN).catch(() => {});
      sponsorBlock(f, url);
    }
    report(tabFrame(win, pid, rid), url);
  });
  wc.on("did-navigate-in-page", (_e, url, main, pid, rid) => {
    if (main) return;
    const f = siteFrame(pid, rid);
    if (f && web(url) && !appOrigin(url)) sponsorBlock(f, url);
    report(tabFrame(win, pid, rid), url);
  });
  wc.on("did-frame-finish-load", (_e, main, pid, rid) => {
    if (main) return;
    const f = tabFrame(win, pid, rid);
    if (!f) return;
    f.executeJavaScript("String(document.title)")
      .then((title: unknown) => {
        send("fox:title", { frame: f.frameTreeNodeId, name: f.name, title: String(title ?? "").slice(0, 200) });
      })
      .catch(() => {});
  });

  // Escape leaves a site's full screen and goes no further. Otherwise, inside
  // a site it still reaches the game, which pauses on it.
  wc.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown" || input.key !== "Escape") return;
    if (full.size) {
      e.preventDefault();
      for (const f of [...full.values()]) {
        exitFull(f);
        setFull(f, false);
      }
      return;
    }
    if (isSiteFrame(win, wc.focusedFrame)) {
      send("fox:escape", null);
      return;
    }
    // In the game itself the browser never sees Escape, so it never takes the
    // pointer away: the game pauses on it and frees the pointer itself, and
    // can take it back again without a click.
    e.preventDefault();
    send("game:escape", null);
  });
}
