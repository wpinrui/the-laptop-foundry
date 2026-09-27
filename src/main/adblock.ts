import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import {
  app,
  ipcMain,
  type OnBeforeRequestListenerDetails,
  type OnHeadersReceivedListenerDetails,
  type WebFrameMain,
} from "electron";
import { parse } from "tldts-experimental";

// uBlock-style blocking for the in-game browser's sites, from Ghostery's
// prebuilt ads and tracking lists. The engine is cached under userData so a
// start only reads a file; it refetches when the cache is missing or older
// than a few days. fox.ts decides which requests are a site's and hands only
// those here, so the game's own pages are never matched.

const STALE_MS = 4 * 24 * 60 * 60 * 1000;

let blocker: ElectronBlocker | null = null;

export function loadAdblock(): void {
  const path = join(app.getPath("userData"), "adblock-engine.bin");
  const fresh = () =>
    ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then(async (engine) => {
      await writeFile(path, engine.serialize()).catch(() => {});
      return engine;
    });
  const load = async () => {
    try {
      if (Date.now() - (await stat(path)).mtimeMs > STALE_MS) throw new Error("stale");
      return ElectronBlocker.deserialize(await readFile(path));
    } catch {
      // Offline: an old engine still beats none.
      return fresh().catch(async () => ElectronBlocker.deserialize(await readFile(path)));
    }
  };
  load()
    .then((engine) => {
      blocker = engine;
    })
    .catch((e) => console.error("adblock: could not load filter lists", e));
}

type Verdict = { cancel?: boolean; redirectURL?: string };

/** Blocks or redirects a site's subresource. Empty when it may load. */
export function adblockRequest(d: OnBeforeRequestListenerDetails): Verdict {
  if (!blocker) return {};
  let out: Verdict = {};
  blocker.onBeforeRequest(d, (r) => {
    out = r;
  });
  return out;
}

/** Adds any CSP a filter asks for to a site document's response headers. */
export function adblockHeaders(
  d: OnHeadersReceivedListenerDetails,
  headers: Record<string, string[]>,
): Record<string, string[]> {
  if (!blocker) return headers;
  let out = headers;
  blocker.onHeadersReceived({ ...d, responseHeaders: { ...headers } }, (r) => {
    if (r.responseHeaders) out = r.responseHeaders as Record<string, string[]>;
  });
  return out;
}

function hostOf(url: string): { hostname: string; domain: string } {
  const p = parse(url);
  return { hostname: p.hostname || "", domain: p.domain || "" };
}

/** What the site frame preload applies at document start. */
export interface AdblockStart {
  styles: string;
  scripts: string[];
}

/**
 * Hiding rules and scriptlets for a document that is just starting. The site
 * frame preload (src/preload/site.ts) asks for these synchronously and runs
 * the scriptlets before any of the page's own scripts, which is the only time
 * they work: later, they break sites instead of fixing them.
 */
function startRules(url: string): AdblockStart | null {
  if (!blocker) return null;
  const { active, styles, scripts } = blocker.getCosmeticsFilters({
    url,
    ...hostOf(url),
    getBaseRules: true,
    getInjectionRules: true,
    getExtendedRules: false,
    getRulesFromHostname: true,
    getRulesFromDOM: false,
  });
  return active ? { styles, scripts } : null;
}

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length < 1000).slice(0, max) : [];

/** Generic hiding rules for the classes, ids and links a page has shown so far. */
function domRules(url: string, dom: unknown): string {
  if (!blocker || !dom || typeof dom !== "object") return "";
  const d = dom as Record<string, unknown>;
  const { active, styles } = blocker.getCosmeticsFilters({
    url,
    ...hostOf(url),
    classes: strings(d.classes, 5000),
    ids: strings(d.ids, 5000),
    hrefs: strings(d.hrefs, 2000),
    getBaseRules: false,
    getInjectionRules: false,
    getExtendedRules: false,
    getRulesFromHostname: false,
    getRulesFromDOM: true,
  });
  return active ? styles : "";
}

/**
 * Answers the site frame preload, and only it: a request must come from a
 * site frame (isSite), and the rules are for that frame's own document, never
 * for an address the caller names.
 */
export function registerAdblockIpc(isSite: (f: WebFrameMain | null) => boolean): void {
  const frameUrl = (f: WebFrameMain | null): string | null => {
    try {
      return f && isSite(f) && /^https?:\/\//i.test(f.url) ? f.url : null;
    } catch {
      return null;
    }
  };
  ipcMain.removeAllListeners("fox-adblock:start");
  ipcMain.removeHandler("fox-adblock:dom");
  ipcMain.on("fox-adblock:start", (e) => {
    const url = frameUrl(e.senderFrame);
    e.returnValue = url ? startRules(url) : null;
  });
  ipcMain.handle("fox-adblock:dom", (e, dom: unknown) => {
    const url = frameUrl(e.senderFrame);
    return url ? domRules(url, dom) : "";
  });
}
