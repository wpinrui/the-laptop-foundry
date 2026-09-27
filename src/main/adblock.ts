import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import { app, type OnBeforeRequestListenerDetails, type OnHeadersReceivedListenerDetails, type WebFrameMain } from "electron";
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

// Styles go in as a constructed stylesheet so a page's CSP cannot refuse them.
const addStyles = (css: string) =>
  `(()=>{try{const s=new CSSStyleSheet();s.replaceSync(${JSON.stringify(css)});document.adoptedStyleSheets=[...document.adoptedStyleSheets,s]}catch{}})()`;

function hostOf(url: string): { hostname: string; domain: string } {
  const p = parse(url);
  return { hostname: p.hostname || "", domain: p.domain || "" };
}

/**
 * Hiding rules for a document that has just committed. No scriptlets: from
 * here they can only run once the page's own scripts have started, and that
 * late they break sites (YouTube renders a blank page) rather than fix them.
 */
export function adblockCommit(f: WebFrameMain, url: string): void {
  if (!blocker) return;
  const { active, styles } = blocker.getCosmeticsFilters({
    url,
    ...hostOf(url),
    getBaseRules: true,
    getInjectionRules: false,
    getExtendedRules: false,
    getRulesFromHostname: true,
    getRulesFromDOM: false,
  });
  if (!active) return;
  if (styles) f.executeJavaScript(addStyles(styles)).catch(() => {});
}

const DOM_SCAN = `(()=>{const c=new Set(),i=new Set(),h=new Set();
for(const e of document.querySelectorAll('[id],[class],a[href]')){
if(e.id)i.add(e.id);for(const k of e.classList)c.add(k);
if(e.tagName==='A'&&e.href)h.add(e.href)}
return {classes:[...c].slice(0,5000),ids:[...i].slice(0,5000),hrefs:[...h].slice(0,2000)}})()`;

/** Generic hiding rules that match what the loaded page actually has. */
export function adblockLoaded(f: WebFrameMain): void {
  if (!blocker) return;
  const url = f.url;
  f.executeJavaScript(DOM_SCAN)
    .then((dom: { classes: string[]; ids: string[]; hrefs: string[] }) => {
      if (!blocker || !dom) return;
      const { active, styles } = blocker.getCosmeticsFilters({
        url,
        ...hostOf(url),
        classes: dom.classes,
        ids: dom.ids,
        hrefs: dom.hrefs,
        getBaseRules: false,
        getInjectionRules: false,
        getExtendedRules: false,
        getRulesFromHostname: false,
        getRulesFromDOM: true,
      });
      if (active && styles) f.executeJavaScript(addStyles(styles)).catch(() => {});
    })
    .catch(() => {});
}
