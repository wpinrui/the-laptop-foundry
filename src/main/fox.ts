import { type BrowserWindow, session, type WebFrameMain, webFrameMain } from "electron";
import { adblockCommit, adblockHeaders, adblockLoaded, adblockRequest, loadAdblock } from "./adblock";

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
  if (d.webContentsId !== win.webContents.id || appOrigin(d.url)) return false;
  const f = d.frame;
  if (!f || !isSiteFrame(win, f)) return false;
  if (d.resourceType === "subFrame" && f.parent?.frameTreeNodeId === win.webContents.mainFrame.frameTreeNodeId) return false;
  return true;
}

export function registerFox(win: BrowserWindow, appOrigin: (url: string) => boolean): void {
  loadAdblock();
  const wc = win.webContents;
  const send = (channel: string, payload: unknown) => {
    if (!wc.isDestroyed()) wc.send(channel, payload);
  };

  // Electron keeps one listener per webRequest event, so the ad blocker runs
  // from inside these rather than registering its own.

  // Let sites be framed, but only inside the game's own window and only for
  // subframes: the game's pages keep their headers.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    if (d.resourceType !== "subFrame" || d.webContentsId !== wc.id || appOrigin(d.url) || !d.responseHeaders) {
      cb({});
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
    cb({ responseHeaders: adblockHeaders(d, headers) });
  });

  // The game's own pages never load inside the browser, and sites lose their
  // ads and trackers.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    if (d.resourceType === "subFrame" && d.webContentsId === wc.id && appOrigin(d.url)) {
      cb({ cancel: true });
      return;
    }
    cb(siteRequest(win, d, appOrigin) ? adblockRequest(d) : {});
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

  // Where each tab went, so the address bar follows the page.
  const report = (f: WebFrameMain | null, url: string) => {
    if (f && web(url)) send("fox:nav", { frame: f.frameTreeNodeId, name: f.name, url });
  };
  wc.on("did-frame-navigate", (_e, url, _code, _status, main, pid, rid) => {
    if (main) return;
    noViewTransitions(pid, rid);
    const f = siteFrame(pid, rid);
    if (f && web(url) && !appOrigin(url)) adblockCommit(f, url);
    report(tabFrame(win, pid, rid), url);
  });
  wc.on("did-navigate-in-page", (_e, url, main, pid, rid) => {
    if (!main) report(tabFrame(win, pid, rid), url);
  });
  wc.on("did-frame-finish-load", (_e, main, pid, rid) => {
    if (main) return;
    const sf = siteFrame(pid, rid);
    if (sf && web(sf.url) && !appOrigin(sf.url)) adblockLoaded(sf);
    const f = tabFrame(win, pid, rid);
    if (!f) return;
    f.executeJavaScript("String(document.title)")
      .then((title: unknown) => {
        send("fox:title", { frame: f.frameTreeNodeId, name: f.name, title: String(title ?? "").slice(0, 200) });
      })
      .catch(() => {});
  });

  // Escape inside a site still reaches the game, which pauses on it.
  wc.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && isSiteFrame(win, wc.focusedFrame)) send("fox:escape", null);
  });
}
