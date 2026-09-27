import { CONTENT, type Fit, speakerModel } from "../engine";
import type { Build } from "../engine/types";
import {
  BASS_Q,
  DRIVE_1W,
  DSP_DRIVE,
  GRILL_LOSS,
  GRILL_TREBLE,
  LOUD_WATTS,
  PRESENCE_DB,
  PRESENCE_HZ,
  SPEAKER_HZ,
} from "./tuning";

// The build's speakers as a filter every sound the laptop plays goes
// through, and the bus that carries it, with where the player is, to the
// browser's tabs (through the main process, to site frames only).

/** What the speaker chain in a tab is set to. Levels are linear gains. */
export interface SpeakerParams {
  /** Bass cutoff, Hz, and its resonance. */
  hp: number;
  hpQ: number;
  /** Presence peak, Hz and dB. */
  peakHz: number;
  peakDb: number;
  /** Treble cutoff past the grill, Hz. */
  lp: number;
  /** Gain into the soft clip at full volume. */
  drive: number;
  /** Full-scale level. 0: no speakers, no sound. */
  level: number;
  stereo: boolean;
}

/** Everything a tab needs: the chain, the OS volume (0 when muted), and where the player is. */
export interface SpeakerState {
  p: SpeakerParams;
  vol: number;
  /** Distance fall-off, 0 to 1. */
  dist: number;
  /** Where the laptop is, left -1 to right 1. */
  pan: number;
  /** Stereo width, 0 (mono) to 1. */
  width: number;
}

const SILENT: SpeakerParams = { hp: 200, hpQ: 0.7, peakHz: PRESENCE_HZ, peakDb: 0, lp: 16000, drive: 1, level: 0, stereo: false };

export function speakerOf(build: Build, fit: Fit): SpeakerParams {
  const model = speakerModel(build, CONTENT);
  if (!model) return SILENT;
  const { hp, watts, dsp, small, count } = model;
  const place = fit.shell.speakerGrill?.place ?? "none";
  return {
    hp,
    hpQ: BASS_Q[0] + (BASS_Q[1] - BASS_Q[0]) * small,
    peakHz: PRESENCE_HZ,
    peakDb: PRESENCE_DB[0] + (PRESENCE_DB[1] - PRESENCE_DB[0]) * small,
    lp: GRILL_TREBLE[place],
    drive: (DRIVE_1W / Math.sqrt(watts)) * (dsp ? DSP_DRIVE : 1),
    level: Math.sqrt(Math.min(1, watts / LOUD_WATTS)) * 10 ** (GRILL_LOSS[place] / 20),
    stereo: count >= 2,
  };
}

// ------------------------------------------------------------------ bus

const bus = {
  p: null as SpeakerParams | null,
  vol: 0,
  space: { dist: 1, pan: 0, width: 1 },
  full: false,
  sent: "",
  timer: undefined as ReturnType<typeof setInterval> | undefined,
};

function send() {
  if (!bus.p) return;
  const s = bus.full ? { dist: 1, pan: 0, width: 1 } : bus.space;
  const state: SpeakerState = {
    p: bus.p,
    vol: bus.vol,
    dist: Math.round(s.dist * 1000) / 1000,
    pan: Math.round(s.pan * 100) / 100,
    width: Math.round(s.width * 100) / 100,
  };
  const key = JSON.stringify(state);
  if (key === bus.sent) return;
  bus.sent = key;
  window.api?.fox?.speaker?.(state);
}

/** The running OS's speakers and volume; null when it stops. */
export function setSpeakerOs(p: SpeakerParams | null, vol: number) {
  bus.p = p;
  bus.vol = vol;
  if (p && !bus.timer) bus.timer = setInterval(send, 1000 / SPEAKER_HZ);
  if (!p && bus.timer) {
    clearInterval(bus.timer);
    bus.timer = undefined;
    bus.sent = "";
  }
}

/** Where the player is from the laptop, from the 3D screen. */
export function setSpeakerSpace(dist: number, pan: number, width: number) {
  bus.space.dist = dist;
  bus.space.pan = pan;
  bus.space.width = width;
}

/** Full screen puts the player at the laptop. */
export function setSpeakerFull(on: boolean) {
  bus.full = on;
}
