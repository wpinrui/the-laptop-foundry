import { useSyncExternalStore } from "react";
import type { Quarter } from "../engine/campaign";
import { type Commercial, commercialProgram, scriptLines, setsOf, voiceOver } from "./commercial";
import { type Rendered, renderVideo, timelineFor, voiceFor } from "./render";
import { shortProgram } from "./scene";
import type { Short, ShortFacts } from "./script";
import { lookFor } from "./sets";

// The videos, rendered in the background wherever the player is, in two
// queues that run side by side, each one video at a time. The shorts queue
// makes each quarter's short once it resolves: it always finishes the one in
// progress, then takes the newest quarter still without one, skipping older
// ones. The commercials queue renders every finished commercial in turn.
// Finished videos are kept on disk in the company's folder; the TV plays them
// from there, so nothing waits on a render.

/** Bumped when the short changes, so a short kept on disk from before is made again. */
const SHORT_VERSION = 6;
/** Bumped when the commercial's render changes. */
const AD_VERSION = 2;

export const shortFile = (q: Quarter) => `${q.year}q${q.quarter}-v${SHORT_VERSION}`;
export const adFile = (id: string) => `ad-${id}-v${AD_VERSION}`;
/** A short's file back to its quarter, or null for any other file. */
export function quarterOfFile(file: string): Quarter | null {
  const m = new RegExp(`^(\\d{4})q([1-4])-v${SHORT_VERSION}$`).exec(file);
  return m ? { year: Number(m[1]), quarter: Number(m[2]) as Quarter["quarter"] } : null;
}
/** A commercial's file back to its id, or null for any other file. */
export function adOfFile(file: string): string | null {
  const m = new RegExp(`^ad-([0-9a-f-]{36})-v${AD_VERSION}$`, "i").exec(file);
  return m ? m[1] : null;
}

// Each company's finished videos: file to when it was written.
const kept = new Map<string, Map<string, number>>();
const listing = new Map<string, Promise<Map<string, number>>>();
// Renders that failed this session are not tried again until the next.
const failed = new Set<string>();
// Commercials deleted with their laptop: never queued again, and one rendering now is not kept.
const dropped = new Set<string>();
const subs = new Set<() => void>();
let stamp = 0;

const notify = () => {
  stamp++;
  for (const s of subs) s();
};

/** The company's kept videos, read from disk once per session. */
function keptOf(company: string): Promise<Map<string, number>> {
  let p = listing.get(company);
  if (!p) {
    p = window.api.video
      .list(company)
      .catch(() => [])
      .then((files) => {
        const m = kept.get(company) ?? new Map<string, number>();
        for (const f of files) if (!m.has(f.file)) m.set(f.file, f.time);
        kept.set(company, m);
        notify();
        return m;
      });
    listing.set(company, p);
  }
  return p;
}

/** The company's finished videos, file to when it was written; updates as renders finish. Undefined until read. */
export function useVideos(company: string | null): ReadonlyMap<string, number> | undefined {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => stamp,
  );
  if (company) void keptOf(company);
  return company ? kept.get(company) : undefined;
}

interface Job {
  company: string;
  file: string;
  /** Orders the shorts: the newest quarter wins. */
  order: string;
  run: (progress: (p: number) => void) => Promise<Rendered | null>;
}

/** The commercial rendering now, and how far through it is, 0 to 1. */
let rendering: { company: string; file: string; progress: number } | null = null;

const same = (a: Job, b: Job) => a.company === b.company && a.file === b.file;

/**
 * One video at a time. `newest`: only the newest job offered waits; otherwise
 * every one does, in turn. `tracked`: the job in progress is what
 * useAdRender reports.
 */
function lane(newest: boolean, tracked = false) {
  let running: Job | null = null;
  let pending: Job[] = [];
  const pump = async () => {
    if (running) return;
    pending = pending.filter((p) => !dropped.has(`${p.company}:${p.file}`));
    const job = pending.shift();
    if (!job) return;
    running = job;
    const key = `${job.company}:${job.file}`;
    const progress = (p: number) => {
      if (!tracked) return;
      rendering = { company: job.company, file: job.file, progress: p };
      notify();
    };
    try {
      const have = await keptOf(job.company);
      if (!have.has(job.file)) {
        progress(0);
        const r = await job.run(progress);
        if (r && !dropped.has(key)) {
          const b = new Uint8Array(await r.video.arrayBuffer());
          await window.api.video.keep(job.company, job.file, b);
          const still = await r.poster?.arrayBuffer().catch(() => null);
          if (still) await window.api.video.keepPoster(job.company, job.file, new Uint8Array(still)).catch(() => {});
          have.set(job.file, Date.now());
          // A new map, so whatever holds the old one sees the list change; and the
          // video's still asked for again, in case it was asked for before it existed.
          kept.set(job.company, new Map(have));
          for (const [k, v] of posters) if (v === null) posters.delete(k);
          notify();
        }
      }
    } catch (e) {
      failed.add(key);
      console.error(`video: could not make ${job.file}`, e);
    } finally {
      running = null;
      if (tracked && rendering) {
        rendering = null;
        notify();
      }
      void pump();
    }
  };
  return (job: Job) => {
    const key = `${job.company}:${job.file}`;
    if (failed.has(key) || dropped.has(key) || kept.get(job.company)?.has(job.file)) return;
    if ((running && same(running, job)) || pending.some((p) => same(p, job))) return;
    if (newest) {
      const waiting = pending[0];
      if (!waiting || job.order > waiting.order || waiting.company !== job.company) pending = [job];
    } else pending.push(job);
    void pump();
  };
}

const shorts = lane(true);
const ads = lane(false, true);

/** The company's commercial rendering now, by its file, and how far through it is; null while none is. */
export function useAdRender(company: string | null): { file: string; progress: number } | null {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => stamp,
  );
  return rendering && rendering.company === company ? { file: rendering.file, progress: rendering.progress } : null;
}

/**
 * Offers the short for a company's quarter to the shorts queue. `make` writes
 * its script once its turn comes; null means there is nothing to show.
 * `index` counts the company's quarters from 0 and picks the set.
 */
export function offerShort(company: string, quarter: Quarter, index: number, make: () => Promise<Short | null>): void {
  const file = shortFile(quarter);
  shorts({
    company,
    file,
    order: `${quarter.year}q${quarter.quarter}`,
    run: async () => {
      const short = await make();
      if (!short) return null;
      // Two narrators, taking turns by quarter.
      const narrator = index % 2 === 0 ? "michael" : "heart";
      const said = await window.api.video.say(short.lines.map((l) => l.say), narrator).catch(() => null);
      const voice = voiceFor(short.lines.length, said);
      const program = shortProgram(short, timelineFor(short.lines.map((l) => l.text), voice), lookFor(index));
      return renderVideo(program, voice);
    },
  });
}

/**
 * Queues a finished commercial's render. `facts` gathers what its cards show
 * once its turn comes; null means its laptop is gone. `index` counts the
 * company's commercials from 0 and picks the sets of one saved before it had its own.
 */
export function queueAd(company: string, c: Commercial, facts: () => Promise<ShortFacts | null>, index: number): void {
  ads({
    company,
    file: adFile(c.id),
    order: String(c.made),
    run: async (progress) => {
      const f = await facts();
      if (!f) return null;
      const lines = scriptLines(c.lines);
      const voice = voiceFor(lines.length, await voiceOver(c));
      const program = commercialProgram({ ...c, ...setsOf(c, index) }, f, timelineFor(lines, voice));
      return renderVideo(program, voice, undefined, progress);
    },
  });
}

/** Forgets a company's deleted commercials: their renders are dropped, queued or running, and their files leave the TV's list. */
export function forgetAds(company: string, ids: string[]): void {
  if (ids.length === 0) return;
  const have = kept.get(company);
  for (const id of ids) {
    const file = adFile(id);
    dropped.add(`${company}:${file}`);
    have?.delete(file);
  }
  if (have) kept.set(company, new Map(have));
  notify();
}

/** A kept video's file as a blob, or null when it cannot be read. */
export async function loadVideo(company: string, file: string): Promise<Blob | null> {
  const b = await window.api.video.kept(company, file).catch(() => null);
  return b ? new Blob([b as Uint8Array<ArrayBuffer>], { type: "video/mp4" }) : null;
}

// Poster stills as object URLs, by company and file, kept for the session.
const posters = new Map<string, string | null>();

/** The poster stills of the listed videos, as object URLs, loading the ones not yet read. */
export function usePosters(company: string | null, files: string[]): Record<string, string> {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => stamp,
  );
  const out: Record<string, string> = {};
  if (!company) return out;
  for (const f of files) {
    const key = `${company}:${f}`;
    if (!posters.has(key)) {
      posters.set(key, null);
      void window.api.video
        .poster(company, f)
        .catch(() => null)
        .then((b) => {
          if (!b) return;
          posters.set(key, URL.createObjectURL(new Blob([b as Uint8Array<ArrayBuffer>], { type: "image/jpeg" })));
          notify();
        });
    }
    const url = posters.get(key);
    if (url) out[f] = url;
  }
  return out;
}
