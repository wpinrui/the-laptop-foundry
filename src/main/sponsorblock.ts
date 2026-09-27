import { createHash } from "node:crypto";
import type { WebFrameMain } from "electron";

// SponsorBlock for YouTube in the in-game browser. The main process looks up
// a video's segments with the hashed endpoint (only a 4-character hash prefix
// leaves the machine), then hands them to the frame, where a small script
// jumps past a segment when playback enters it.

const API = "https://sponsor.ajay.app/api/skipSegments/";
const CATEGORIES = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic"];

type Segment = [number, number];
const cache = new Map<string, Promise<Segment[]>>();

/** The YouTube video a URL plays, if any. */
export function videoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube(-nocookie)?\.com$/i.test(u.hostname)) return null;
    const id = u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(shorts|embed|live)\/([^/?#]+)/.exec(u.pathname)?.[2];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function segments(id: string): Promise<Segment[]> {
  const hit = cache.get(id);
  if (hit) return hit;
  const prefix = createHash("sha256").update(id).digest("hex").slice(0, 4);
  const url = `${API}${prefix}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`;
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: { videoID: string; segments: { segment: Segment; actionType?: string }[] }[]) => {
      const v = Array.isArray(list) ? list.find((x) => x.videoID === id) : undefined;
      return (v?.segments ?? [])
        .filter((s) => (s.actionType ?? "skip") === "skip" && s.segment[1] > s.segment[0])
        .map((s) => s.segment);
    })
    .catch(() => {
      cache.delete(id);
      return [] as Segment[];
    });
  cache.set(id, p);
  return p;
}

// Installed once per document, then fed the segments of whichever video the
// page is on. It only skips while the page's URL still names that video, so
// a late answer for the previous video never applies to the next.
const SKIPPER = `(() => {
  const vidOf = () => {
    const u = new URL(location.href);
    return u.pathname === "/watch" ? u.searchParams.get("v") : (/^\\/(shorts|embed|live)\\/([^/?#]+)/.exec(u.pathname) || [])[2];
  };
  if (!window.__foxSkip) {
    const state = { vid: null, segs: [] };
    window.__foxSkip = state;
    document.addEventListener("timeupdate", (e) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || !state.segs.length || vidOf() !== state.vid) return;
      if (v.closest(".ad-showing")) return;
      const t = v.currentTime;
      for (const [s, end] of state.segs) {
        if (t >= s && t < end - 0.3) {
          v.currentTime = Math.min(end, v.duration || end);
          return;
        }
      }
    }, true);
  }
  return (vid, segs) => { window.__foxSkip.vid = vid; window.__foxSkip.segs = segs; };
})()`;

/** Loads and applies the skip segments for the video a frame is on now. */
export function sponsorBlock(f: WebFrameMain, url: string): void {
  const id = videoId(url);
  if (!id) return;
  segments(id)
    .then((segs) => {
      if (f.isDestroyed() || videoId(f.url) !== id) return;
      return f.executeJavaScript(`(${SKIPPER})(${JSON.stringify(id)}, ${JSON.stringify(segs)})`);
    })
    .catch(() => {});
}
