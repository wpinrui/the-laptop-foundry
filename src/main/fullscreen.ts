import type { WebFrameMain } from "electron";

// Full screen for sites, kept inside the laptop's screen. Real element full
// screen would take the whole game window, so a site's frame gets a stand-in
// Fullscreen API instead: the element it asks for fills the frame, the page
// sees itself as full screen, and the game makes the tab's frame cover the
// laptop's screen. The frame has no fullscreen permission, so the real API
// never reaches the window.

/** What the stand-in writes to the console when it enters or leaves. */
export const FULL_TOKEN = "fox-fullscreen-3f9a:";

export const FAKE_FULLSCREEN = `(() => {
  if (window.__foxFull) return;
  const log = console.debug.bind(console);
  const TOKEN = ${JSON.stringify(FULL_TOKEN)};
  let cur = null;
  let sheet = null;
  const css = () => {
    if (sheet) return;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync("[data-fox-full]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;box-sizing:border-box!important;transform:none!important;z-index:2147483647!important;background:#000;object-fit:contain}");
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {}
  };
  const fire = (el) => {
    for (const t of ["fullscreenchange", "webkitfullscreenchange"]) {
      const target = el && el.isConnected ? el : document;
      target.dispatchEvent(new Event(t, { bubbles: true, composed: true }));
    }
  };
  const enter = function () {
    const el = this;
    if (!(el instanceof Element) || !el.isConnected) return Promise.reject(new TypeError("Not connected"));
    if (cur === el) return Promise.resolve();
    const old = cur;
    if (old) old.removeAttribute("data-fox-full");
    css();
    cur = el;
    el.setAttribute("data-fox-full", "");
    if (!old) log(TOKEN + "on");
    fire(el);
    return Promise.resolve();
  };
  const exit = () => {
    const old = cur;
    if (!old) return Promise.resolve();
    cur = null;
    old.removeAttribute("data-fox-full");
    log(TOKEN + "off");
    fire(old);
    return Promise.resolve();
  };
  window.__foxFull = exit;
  const E = Element.prototype;
  const D = Document.prototype;
  for (const k of ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen"])
    Object.defineProperty(E, k, { value: enter, configurable: true, writable: true });
  for (const k of ["exitFullscreen", "webkitExitFullscreen", "webkitCancelFullScreen"])
    Object.defineProperty(D, k, { value: exit, configurable: true, writable: true });
  const get = (v) => ({ get: v, configurable: true });
  for (const k of ["fullscreenElement", "webkitFullscreenElement", "webkitCurrentFullScreenElement"])
    Object.defineProperty(D, k, get(() => (cur && cur.isConnected ? cur : null)));
  for (const k of ["fullscreen", "webkitIsFullScreen"]) Object.defineProperty(D, k, get(() => !!cur));
  for (const k of ["fullscreenEnabled", "webkitFullscreenEnabled"]) Object.defineProperty(D, k, get(() => true));
  const fp = document.featurePolicy;
  if (fp && fp.allowsFeature) {
    const allows = fp.allowsFeature.bind(fp);
    fp.allowsFeature = (f, o) => f === "fullscreen" || allows(f, o);
  }
})()`;

/** Leaves the stand-in full screen in a frame. */
export function exitFull(f: WebFrameMain): void {
  try {
    if (!f.isDestroyed()) f.executeJavaScript("window.__foxFull && window.__foxFull()").catch(() => {});
  } catch {}
}
