import { type Loop, loop, play } from "./engine";

// What plays under the current place: its ambience on the effects bus and its
// music on the music bus, each crossfading into the next place's.

const FADE_S = 1.5;
let ambience: { name: string; loop: Loop; extra?: ReturnType<typeof setTimeout> } | null = null;

/** The empty cafe, now and then: a cup or a spoon, and rarely the espresso machine. */
function cafe(): ReturnType<typeof setTimeout> {
  return setTimeout(
    () => {
      if (Math.random() < 0.12) play("sfx/espresso_machine", { volume: 0.15 });
      else play(`sfx/cafe_cup_${1 + Math.floor(Math.random() * 4)}`, { volume: 0.18, rate: 0.95 + Math.random() * 0.1 });
      if (ambience?.name === "cafe") ambience.extra = cafe();
    },
    15_000 + Math.random() * 30_000,
  );
}

/** Crossfades to a place's ambience loop; null fades it out. */
export function setAmbience(name: string | null) {
  if ((ambience?.name ?? null) === name) return;
  if (ambience) {
    ambience.loop.stop(FADE_S);
    if (ambience.extra) clearTimeout(ambience.extra);
  }
  ambience = name ? { name, loop: loop(`ambience/${name}`, "sfx", 1, FADE_S) } : null;
  if (ambience?.name === "cafe") ambience.extra = cafe();
}

let music: { name: string; loop: Loop } | null = null;

/** Crossfades to a track from assets/audio/music; null fades it out. */
export function setMusic(name: string | null) {
  if ((music?.name ?? null) === name) return;
  music?.loop.stop(FADE_S);
  music = name ? { name, loop: loop(`music/${name}`, "music", 1, FADE_S, true) } : null;
}
