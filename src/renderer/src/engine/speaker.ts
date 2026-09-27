import { BASS_K, BASS_RANGE, DSP_BASS, DSP_FROM, SPEAKER_WATTS, SPEAKER_WATTS_DEFAULT } from "../panel/tuning";
import { type Content, CONTENT } from "./content";
import { qualityEffect } from "./quality";
import type { Build } from "./types";

// The build's speakers as a physical system: driver area, amplifier power and
// the bass cutoff they give. The in-game sound and the spec sheet both read it.
// Speaker quality buys stiffer, longer-throw drivers in sealed boxes and a
// better amplifier: the bass reaches lower and the set plays louder.

export interface SpeakerModel {
  /** Total driver area, mm2. */
  area: number;
  count: number;
  /** Makers' tuning from 2018. */
  dsp: boolean;
  /** Bass cutoff, Hz. */
  hp: number;
  /** Amplifier power, W. */
  watts: number;
  /** 0 for the biggest set, 1 for the smallest. */
  small: number;
}

export function speakerModel(build: Build, content: Content = CONTENT): SpeakerModel | undefined {
  const id = build.parts.speakers?.[0]?.part;
  const part = id ? content.parts.find((p) => p.id === id) : undefined;
  if (!part) return undefined;
  const shapes = Array.isArray(part.shape) ? part.shape : [part.shape];
  const units = shapes.flatMap((s) => (s.kind === "box" ? s.units : []));
  let area = 0;
  let count = 0;
  for (const u of units) {
    const s = [u.size.x, u.size.y, u.size.z].sort((a, b) => b - a);
    area += s[0] * s[1] * (u.count ?? 1);
    count += u.count ?? 1;
  }
  area = Math.max(area, 200);
  const e = qualityEffect(build, "speakers");
  const dsp = part.from >= DSP_FROM;
  const [lo, hi] = BASS_RANGE;
  const hp = Math.min(hi, Math.max(lo, (BASS_K / Math.sqrt(area)) * (dsp ? DSP_BASS : 1) * (1 - 0.3 * e)));
  const watts = (SPEAKER_WATTS[part.id] ?? SPEAKER_WATTS_DEFAULT) * (1 + 0.75 * e);
  return { area, count, dsp, hp, watts, small: Math.min(1, Math.max(0, (hp - lo) / (hi - lo))) };
}

/** Loudest level at 50 cm, dB(A): about 76 dB from a watt, more from more watts and better drivers. */
export function speakerLoudness(m: SpeakerModel, e: number): number {
  return Math.round(76 + 10 * Math.log10(m.watts) + 2 * e);
}
