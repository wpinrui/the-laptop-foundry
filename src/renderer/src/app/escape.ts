// When the game last heard Escape. Chromium can drop the pointer lock on the
// same press (its key up), after a place has already handled the key and taken
// the pointer back; a place ignores a pointer lock loss this soon after, so
// that one press is never also read as a pause.

const RECENT_MS = 500;
let last = Number.NEGATIVE_INFINITY;

/** Escape reached the game. */
export function markEscape() {
  last = performance.now();
}

/** Escape reached the game within the last half second. */
export function isRecentEscape(): boolean {
  return performance.now() - last < RECENT_MS;
}
