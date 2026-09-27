import { useSyncExternalStore } from "react";
import type { Quarter } from "../engine/campaign";
import { Cancelled, renderShort } from "./render";
import { quarterCaption, type Short } from "./script";
import { lookFor } from "./sets";

// Each company's last quarter's short, made in the background as soon as the
// quarter ends: script, voice, then an offline render. One job at a time; a
// newer quarter cancels an older one still rendering. Finished videos stay in
// memory for the session and on disk in the company's folder, so a reopened
// save plays at once.

export interface ReadyShort {
  url: string;
  blob: Blob;
  /** The file name offered when saving. */
  name: string;
}

type Entry = { state: "busy" } | ({ state: "ready" } & ReadyShort);

/** Bumped when the video changes, so a short kept on disk from before is made again. */
const VERSION = 2;

/** Ready videos kept in memory; older ones fall out. */
const KEEP = 6;

const cache = new Map<string, Entry>();
const subs = new Set<() => void>();
let current: { key: string; cancel: () => void } | null = null;

const notify = () => {
  for (const s of subs) s();
};

function set(key: string, e: Entry | null) {
  if (e) cache.set(key, e);
  else cache.delete(key);
  const ready = [...cache.entries()].filter(([, v]) => v.state === "ready");
  for (const [k, v] of ready.slice(0, Math.max(0, ready.length - KEEP))) {
    if (v.state === "ready") URL.revokeObjectURL(v.url);
    cache.delete(k);
  }
  notify();
}

export function shortKey(company: string, q: Quarter): string {
  return `${company}:${q.year}q${q.quarter}`;
}

export function saveName(short: Short): string {
  const f = short.facts;
  return `${f.subject.company} ${f.subject.name} ${quarterCaption(f.quarter)}`;
}

/** The short's state for a key: undefined before it is asked for. */
export function useShort(key: string | null): Entry | undefined {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => (key ? cache.get(key) : undefined),
  );
}

/**
 * Starts making the short for `key` unless it is ready or on its way. `make`
 * writes the script; null means there is nothing to show. `index` counts the
 * company's quarters from 0 and picks the set.
 */
export function prepareShort(key: string, company: string, quarter: Quarter, index: number, make: () => Promise<Short | null>): void {
  if (cache.has(key)) return;
  if (current && current.key !== key) {
    current.cancel();
    set(current.key, null);
  }
  let cancelled = false;
  current = {
    key,
    cancel: () => {
      cancelled = true;
    },
  };
  set(key, { state: "busy" });
  const file = `${quarter.year}q${quarter.quarter}-v${VERSION}`;
  (async () => {
    const short = await make();
    if (!short || cancelled) return null;
    const name = saveName(short);
    const kept = await window.api.video.kept(company, file).catch(() => null);
    if (kept) return { blob: new Blob([kept as Uint8Array<ArrayBuffer>], { type: "video/mp4" }), name };
    const voice = await window.api.video.say(short.lines.map((l) => l.say)).catch(() => null);
    if (cancelled) return null;
    const blob = await renderShort(short, lookFor(index), voice, () => cancelled);
    void blob
      .arrayBuffer()
      .then((b) => window.api.video.keep(company, file, new Uint8Array(b)))
      .catch((e) => console.error("short: could not keep", e));
    return { blob, name };
  })()
    .then(
      (r) => {
        if (cancelled) return;
        set(key, r ? { state: "ready", blob: r.blob, name: r.name, url: URL.createObjectURL(r.blob) } : null);
      },
      (e) => {
        if (!(e instanceof Cancelled)) console.error("short: could not render", e);
        if (!cancelled) set(key, null);
      },
    )
    .finally(() => {
      if (current?.key === key && cancelled === false) current = null;
    });
}
