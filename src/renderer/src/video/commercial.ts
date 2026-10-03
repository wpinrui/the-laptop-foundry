import type { SavedCommercial, SavedScene } from "../../../preload/store";
import { rng } from "../engine/review";
import { timelineFor, type Voice } from "./render";
import { type CardSpan, type Cut, FRAMES, PANS, type Program, type Ratio, type Timeline, timelineOf } from "./scene";
import { type Look, lookFor, SET_IDS, type SetId } from "./sets";
import type { Card, ShortFacts, Shot } from "./script";
import { speak } from "./speech";

// A commercial made in the studio: the player's script, read line by line,
// with scenes laid over its words on two tracks. The angle track holds camera
// shots of the laptop; wherever none covers a word the video cuts to b-roll,
// slow pans round the laptop. The card track holds number cards, drawn over
// whatever the angle track is playing. This module is the logic only: the
// studio's screens and the render queue build on it.

export type Commercial = SavedCommercial;
export type SceneKind =
  | "hero"
  | "keyboard"
  | "ports"
  | "screen"
  | "glance"
  | "lid"
  | "side"
  | "top"
  | "turn"
  | "orbit"
  | "push"
  | "title"
  | "sales"
  | "stats"
  | "score"
  | "price"
  | "spec"
  | "quote"
  | "chips"
  | "launch"
  | "logo";
export interface Scene {
  kind: SceneKind;
  startWord: number;
  endWord: number;
  /** Its own set; the commercial's scene set when absent. */
  set?: SetId;
}

/** Where a commercial is filmed: its scenes' set, the b-roll's, and the sweep's paper colour. */
export interface Sets {
  set: SetId;
  brollSet: SetId;
  paper: number;
}

const isSet = (x: unknown): x is SetId => typeof x === "string" && (SET_IDS as readonly string[]).includes(x);

/** A commercial's sets, the defaults filled in for one saved before it had them: the `index`th commercial's look. */
export function setsOf(c: { set?: string; brollSet?: string; paper?: number }, index: number): Sets {
  const d = lookFor(index);
  const set = isSet(c.set) ? c.set : d.set;
  return { set, brollSet: isSet(c.brollSet) ? c.brollSet : set, paper: typeof c.paper === "number" ? c.paper : d.paper };
}

/** The scene library, in order: the camera shots, then the cards. */
export const SHOTS: SceneKind[] = ["hero", "keyboard", "ports", "screen", "glance", "lid", "side", "top", "turn", "orbit", "push"];
export const CARDS: SceneKind[] = ["title", "price", "spec", "stats", "chips", "sales", "score", "quote", "launch", "logo"];
export const SCENE_KINDS: SceneKind[] = [...SHOTS, ...CARDS];

/** The timeline's tracks: within one, scenes never overlap; across them, a card plays over an angle. */
export type TrackId = "cards" | "angles";
/** Top to bottom, as the timeline stacks them: the cards over the angles they play on. */
export const TRACK_IDS: TrackId[] = ["cards", "angles"];
/** The kinds each track takes. A new kind joins its track's list. */
export const TRACK_KINDS: Record<TrackId, SceneKind[]> = { angles: SHOTS, cards: CARDS };
export type Tracks = Record<TrackId, Scene[]>;
export const NO_TRACKS: Tracks = { angles: [], cards: [] };

/** The track a kind goes on. */
export const trackOf = (k: SceneKind): TrackId => (TRACK_IDS.find((t) => TRACK_KINDS[t].includes(k)) ?? "angles");
export const RATIOS: Ratio[] = ["9:16", "1:1", "16:9"];

/** The longest a commercial may run, seconds. */
export const MAX_SECONDS = 90;
/** The most lines a script may have, as the voice takes them. */
export const MAX_LINES = 24;
export const MAX_LINE = 400;
/** A long stretch of b-roll is cut into pans of about this long, seconds. */
const PAN_SECONDS = 4.5;
/** The lid angles the b-roll pans take, degrees: from partly shut to fully open. */
const PAN_LIDS = [48, 70, 92, 112, 128];
/** A voice's reading rate before it has been heard, words per second. */
const VOICE_WPS = 2.9;

const isShot = (k: SceneKind): k is SceneKind & Shot => SHOTS.includes(k);

/** The script as it is read: its lines with any blank ones dropped. */
export function scriptLines(lines: string[]): string[] {
  return lines.map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/** Every word of the script, end to end, with the line it is on. */
export function wordsOf(lines: string[]): { text: string; line: number }[] {
  return scriptLines(lines).flatMap((l, line) => l.split(" ").map((text) => ({ text, line })));
}

/** Every track's scenes kept within `n` words. */
export function fitTracks(t: Tracks, n: number): Tracks {
  return { angles: fitScenes(t.angles, n), cards: fitScenes(t.cards, n) };
}

/** Scenes kept within `n` words, in order, none overlapping: what a shorter script leaves of them. */
export function fitScenes(scenes: Scene[], n: number): Scene[] {
  const out: Scene[] = [];
  for (const s of [...scenes].sort((a, b) => a.startWord - b.startWord)) {
    const start = Math.max(s.startWord, out[out.length - 1]?.endWord ?? 0);
    const end = Math.min(s.endWord, n);
    if (end > start) out.push({ ...s, startWord: start, endWord: end });
  }
  return out;
}

// Each voice's reading rate, measured from its preview line once it has been heard.
const rates = new Map<string, number>();

/** Records how fast a narrator read `text` in `seconds`. */
export function heard(voice: string, text: string, seconds: number): void {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 0 && seconds > 0.5) rates.set(voice, words / Math.max(0.1, seconds - 0.3));
}

/** How fast a narrator reads, words per second, once heard; null before. */
export function rateOf(voice: string): number | null {
  return rates.get(voice) ?? null;
}

/** The script's timing before it is voiced: each line at the narrator's rate, or caption timing with no voice. */
export function estimateTimeline(lines: string[], voice: string | null): Timeline {
  const ls = scriptLines(lines);
  if (!voice) return timelineFor(ls, null);
  const wps = rates.get(voice) ?? VOICE_WPS;
  return timelineOf(ls.map((l) => 0.3 + l.split(" ").length / wps));
}

/** How long the script runs, seconds, as estimated. */
export function estimate(lines: string[], voice: string | null): number {
  return scriptLines(lines).length === 0 ? 0 : estimateTimeline(lines, voice).total;
}

/** When each word starts, seconds, from the lines' timeline: words share a line by length. */
export function wordTimes(lines: string[], tl: Timeline): number[] {
  const out: number[] = [];
  scriptLines(lines).forEach((l, i) => {
    const words = l.split(" ");
    const total = words.reduce((a, w) => a + w.length + 1, 0);
    let acc = 0;
    for (const w of words) {
      out.push(tl.starts[i] + (tl.durs[i] * acc) / total);
      acc += w.length + 1;
    }
  });
  return out;
}

/**
 * The commercial as a program: its angles at their words' times, b-roll
 * between them, its cards over both, its lines as captions. A scene starting
 * on the first word starts at 0, and one ending on the last word runs to the end.
 */
export function commercialProgram(
  c: Pick<Commercial, "id" | "lines" | "ratio"> & { angles: SavedScene[]; cards: SavedScene[] } & Sets,
  facts: ShortFacts,
  tl: Timeline,
): Program {
  const lines = scriptLines(c.lines);
  const times = wordTimes(lines, tl);
  const n = times.length;
  const at = (w: number) => (w <= 0 ? 0 : w >= n ? tl.total : times[w]);
  const scenes = fitScenes(c.angles as Scene[], n);
  const random = rng(`commercial:${c.id}`);
  let last: { pan: number; lid: number } | null = null;
  const pan = () => {
    // Never the same angle, or lid, twice in a row.
    const pick = (len: number, not: number | undefined) => {
      const i = Math.floor(random() * (not === undefined ? len : len - 1));
      return not !== undefined && i >= not ? i + 1 : i;
    };
    const p = pick(PANS.length, last?.pan);
    const lid = pick(PAN_LIDS.length, last ? PAN_LIDS.indexOf(last.lid) : undefined);
    last = { pan: p, lid: PAN_LIDS[lid] };
    return last;
  };
  const cuts: Cut[] = [];
  const look = (set: SetId): Look => ({ set, paper: c.paper });
  const broll = (start: number, end: number, on: Look) => {
    const count = Math.max(1, Math.round((end - start) / PAN_SECONDS));
    for (let i = 0; i < count; i++)
      cuts.push({ start: start + ((end - start) * i) / count, end: start + ((end - start) * (i + 1)) / count, look: on, view: pan(), card: null, cardFrom: start });
  };
  let t = 0;
  for (const s of scenes) {
    const start = at(s.startWord);
    const end = at(s.endWord);
    // A placed scene is on its own set; the b-roll between them on the b-roll's.
    const on = look(isSet(s.set) ? s.set : c.set);
    if (start > t + 0.05) broll(t, start, look(c.brollSet));
    if (isShot(s.kind)) cuts.push({ start, end, look: on, view: s.kind, card: null, cardFrom: start });
    else broll(start, end, on);
    t = end;
  }
  if (t < tl.total - 0.05 || cuts.length === 0) broll(t, tl.total, look(c.brollSet));
  const cards: CardSpan[] = fitScenes(c.cards as Scene[], n)
    .filter((s) => CARDS.includes(s.kind))
    .map((s) => ({ card: s.kind as Card, start: at(s.startWord), end: at(s.endWord) }));
  return {
    frame: FRAMES[c.ratio],
    facts,
    kicker: facts.price ? `$${Math.round(facts.price).toLocaleString("en-US")}` : "New",
    cuts,
    cards,
    captions: lines.map((text, i) => ({ text, start: tl.starts[i], dur: tl.durs[i] })),
    total: tl.total,
    poster: cuts[0] ? (cuts[0].start + cuts[0].end) / 2 : 0,
  };
}

/** The narration for a commercial in its narrator's voice, one clip per line; null for no voice or none installed. */
export function voiceOver(c: Commercial): Promise<Voice | null> {
  if (!c.voice) return Promise.resolve(null);
  return window.api.video.say(scriptLines(c.lines).map(speak), c.voice).catch(() => null);
}

// ------------------------------------------------------------------ the wheel

/** The wheel's wedges: the sales change and its chance in percent. Its expected value is +20%. */
export const WHEEL: { pct: number; p: number }[] = [
  { pct: -50, p: 8 },
  { pct: -25, p: 12 },
  { pct: 0, p: 19 },
  { pct: 10, p: 20 },
  { pct: 25, p: 18 },
  { pct: 50, p: 11 },
  { pct: 100, p: 9 },
  { pct: 200, p: 3 },
];

/** Draws a wedge by its chance: its index in WHEEL. */
export function spinWheel(r = Math.random()): number {
  let acc = 0;
  for (const [i, w] of WHEEL.entries()) {
    acc += w.p / 100;
    if (r < acc) return i;
  }
  return WHEEL.length - 1;
}

/** A wedge's sales multiplier: -50% halves, +200% triples. */
export const multiplierOf = (i: number) => 1 + WHEEL[i].pct / 100;

/** A multiplier as the wheel's figure: 1.5 as "+50%". */
export function pctLabel(multiplier: number): string {
  const p = Math.round((multiplier - 1) * 100);
  return p > 0 ? `+${p}%` : `${p}%`;
}
