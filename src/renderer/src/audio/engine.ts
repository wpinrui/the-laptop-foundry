import { useSyncExternalStore } from "react";
import type { Settings } from "../../../preload/store";

// The game's own audio: one AudioContext, a master gain feeding a music bus and
// an effects bus (ambience plays on effects). Files load on first use and stay
// decoded. Volumes persist through the main process's settings file.

export type Bus = "music" | "sfx";

const FILES = import.meta.glob<string>("../assets/audio/**/*.ogg", { query: "?url", import: "default" });

let volumes: Settings = { master: 0.8, music: 0.6, sfx: 0.8 };
const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buses: Partial<Record<Bus, GainNode>> = {};

function graph(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const b of ["music", "sfx"] as const) {
      const g = ctx.createGain();
      g.connect(master);
      buses[b] = g;
    }
    apply();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function apply() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(volumes.master, t, 0.03);
  buses.music?.gain.setTargetAtTime(volumes.music, t, 0.03);
  buses.sfx?.gain.setTargetAtTime(volumes.sfx, t, 0.03);
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** A decoded file by its path under assets/audio without the extension, such as "sfx/ui_click". */
export function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    const url = FILES[`../assets/audio/${name}.ogg`];
    p = url
      ? url()
          .then((u) => fetch(u))
          .then((r) => r.arrayBuffer())
          .then((b) => graph().decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(name, p);
  }
  return p;
}

/** Plays a one-shot on a bus. Silent while that bus or the master is at zero. */
export function play(name: string, opts: { volume?: number; rate?: number; bus?: Bus } = {}) {
  const bus = opts.bus ?? "sfx";
  if (volumes.master === 0 || volumes[bus] === 0) return;
  void load(name).then((buf) => {
    if (!buf) return;
    const c = graph();
    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = c.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(buses[bus] as GainNode);
    src.start();
  });
}

/** Plays one of name_0 .. name_(count - 1) at random. */
export function playAny(name: string, count: number, opts?: Parameters<typeof play>[1]) {
  play(`${name}_${Math.floor(Math.random() * count)}`, opts);
}

export interface Loop {
  /** Fades to a level over some seconds. */
  fade: (to: number, seconds: number) => void;
  /** Fades out and stops. */
  stop: (seconds?: number) => void;
}

/** A looping file on a bus, faded in from silence. */
export function loop(name: string, bus: Bus, level = 1, fadeIn = 1.5): Loop {
  let src: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let stopped = false;
  let target = level;
  void load(name).then((buf) => {
    if (!buf || stopped) return;
    const c = graph();
    src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(target, c.currentTime + fadeIn);
    src.connect(gain).connect(buses[bus] as GainNode);
    src.start(0, Math.random() * buf.duration);
  });
  const ramp = (to: number, seconds: number) => {
    if (!ctx || !gain) return;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(to, t + Math.max(seconds, 0.01));
  };
  return {
    fade: (to, seconds) => {
      target = to;
      ramp(to, seconds);
    },
    stop: (seconds = 1.5) => {
      stopped = true;
      ramp(0, seconds);
      const s = src;
      if (s && ctx) s.stop(ctx.currentTime + seconds + 0.05);
    },
  };
}

export function getVolumes(): Settings {
  return volumes;
}

/** Sets the volumes from the saved settings, without saving them back. */
export function initVolumes(v: Settings) {
  volumes = v;
  apply();
  for (const l of listeners) l();
}

let saving: ReturnType<typeof setTimeout> | null = null;

/** Changes the volumes now and saves them shortly after the last change. */
export function setVolumes(patch: Partial<Settings>) {
  initVolumes({ ...volumes, ...patch });
  if (saving) clearTimeout(saving);
  saving = setTimeout(() => {
    saving = null;
    void window.api.store.setSettings(volumes);
  }, 300);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useVolumes(): Settings {
  return useSyncExternalStore(subscribe, getVolumes);
}
