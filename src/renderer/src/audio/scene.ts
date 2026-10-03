import { type Loop, loop, play } from "./engine";

// What plays under the current place: its ambience on the effects bus and its
// music on the music bus, each crossfading into the next place's.

const FADE_S = 1.5;
let ambience: { name: string; loop: Loop; extra?: ReturnType<typeof setTimeout> } | null = null;

/** The cafe's espresso machine, now and then. */
function espresso(): ReturnType<typeof setTimeout> {
  return setTimeout(
    () => {
      play("sfx/espresso_machine", { volume: 0.25 });
      if (ambience?.name === "cafe") ambience.extra = espresso();
    },
    30_000 + Math.random() * 60_000,
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
  if (ambience?.name === "cafe") ambience.extra = espresso();
}
