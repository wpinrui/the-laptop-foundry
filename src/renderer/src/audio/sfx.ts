import { useEffect, useRef } from "react";
import type { Build } from "../engine/types";
import { play } from "./engine";

// The game's named sound effects and the few hooks that play them. Every
// button click gets a soft click, unless something more specific sounds for
// the same action within a moment.

let lastSpecific = Number.NEGATIVE_INFINITY;
const lastBy = new Map<string, number>();

/** Plays an effect from assets/audio/sfx, at most once per gap in milliseconds. */
export function sfx(name: string, opts: { volume?: number; gap?: number; rate?: number } = {}) {
  const now = performance.now();
  if (now - (lastBy.get(name) ?? Number.NEGATIVE_INFINITY) < (opts.gap ?? 40)) return;
  lastBy.set(name, now);
  lastSpecific = now;
  play(`sfx/${name}`, { volume: opts.volume, rate: opts.rate });
}

/** One of name_1 .. name_count, or name_0 .. name_(count - 1) when from is 0. */
export function sfxAny(name: string, count: number, from = 1, opts?: Parameters<typeof sfx>[1]) {
  sfx(`${name}_${from + Math.floor(Math.random() * count)}`, opts);
}

const HOVER = ".fd-entry, .bd-option, .bd-chip, .bd-card";

/** Clicks, hovers and toggles anywhere in the window. */
export function useUiSounds() {
  useEffect(() => {
    let hovered: Element | null = null;
    const click = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.("button, [role='button'], a, input[type='checkbox']");
      if (!t || (t as HTMLButtonElement).disabled) return;
      const pressed = t.getAttribute("aria-pressed");
      if (pressed !== null || t instanceof HTMLInputElement) {
        const on = t instanceof HTMLInputElement ? t.checked : pressed !== "true";
        sfx(on ? "ui_toggle_on" : "ui_toggle_off", { volume: 0.7 });
        return;
      }
      const at = performance.now();
      setTimeout(() => {
        if (lastSpecific < at - 150) sfx("ui_click", { volume: 0.55 });
      }, 60);
    };
    const over = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.(HOVER) ?? null;
      if (t === hovered) return;
      hovered = t;
      if (t && !(t as HTMLButtonElement).disabled) {
        play("sfx/ui_hover", { volume: 0.25 });
      }
    };
    // The laptop's own screen: a trackpad click for a press, a key for each key typed.
    const press = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(".os")) sfx("trackpad_click", { volume: 0.5 });
    };
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !(e.target as Element | null)?.closest?.(".os")) return;
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") sfxAny("key", 5, 0, { volume: 0.45, gap: 0 });
    };
    document.addEventListener("click", click, true);
    document.addEventListener("mouseover", over, true);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
}

/** Open and close sounds for a panel that is open while mounted, or while open is true. */
export function usePanelSound(open = true) {
  const was = useRef(false);
  useEffect(() => {
    if (open !== was.current) sfx(open ? "ui_panel_open" : "ui_panel_close", { volume: 0.6 });
    was.current = open;
  }, [open]);
  useEffect(
    () => () => {
      if (was.current) sfx("ui_panel_close", { volume: 0.6 });
    },
    [],
  );
}

const count = (b: Build) =>
  Object.values(b.parts).reduce((n, list) => n + (list ?? []).filter((p) => p.part).length, 0) +
  b.ports.length +
  (b.marks?.length ?? 0);
const json = (x: unknown) => JSON.stringify(x ?? null);

/** The sound of one edit to a build: a part in or out, a new colour or material. */
export function buildSound(prev: Build, next: Build) {
  const a = count(prev);
  const b = count(next);
  if (b > a) return sfxAny("builder_part_snap", 3, 1, { volume: 0.8 });
  if (b < a) return sfx("builder_part_remove", { volume: 0.8 });
  if (json(prev.materials) !== json(next.materials) || prev.body !== next.body || prev.layout !== next.layout)
    return sfx("builder_material_change", { volume: 0.7 });
  if (
    json(prev.finish) !== json(next.finish) ||
    prev.bezel !== next.bezel ||
    prev.keyDeck !== next.keyDeck ||
    json(prev.pad) !== json(next.pad) ||
    json(prev.keys) !== json(next.keys)
  )
    return sfx("builder_colour_change", { volume: 0.5, gap: 120 });
  if (json(prev.parts) !== json(next.parts) || json(prev.marks) !== json(next.marks))
    return sfxAny("builder_part_snap", 3, 1, { volume: 0.6, gap: 120 });
}

/** Builder edits, new problems and the moment the laptop becomes complete. */
export function useBuilderSounds(build: Build, problems: number) {
  const prev = useRef(build);
  useEffect(() => {
    if (prev.current !== build) buildSound(prev.current, build);
    prev.current = build;
  }, [build]);
  const had = useRef(problems);
  useEffect(() => {
    if (problems > had.current && had.current >= 0) sfx("builder_invalid", { volume: 0.6, gap: 300 });
    if (problems === 0 && had.current > 0) sfx("builder_model_complete", { volume: 0.8 });
    had.current = problems;
  }, [problems]);
}

/** Footsteps for one place: a step every so far walked, on its floor. */
export function stepper(floor: "wood" | "carpet" | "tile") {
  let last: { x: number; z: number } | null = null;
  let walked = 0;
  let at = 0;
  return (p: { x: number; z: number }) => {
    const now = performance.now();
    const d = last ? Math.hypot(p.x - last.x, p.z - last.z) : 0;
    // A pause, or a jump the walking did not make, starts the count again, nearly a step in.
    if (!last || d > 300 || now - at > 250) walked = 550;
    else walked += d;
    last = { x: p.x, z: p.z };
    at = now;
    if (walked >= 700) {
      walked = 0;
      sfxAny(`step_${floor}`, 5, 0, { volume: 0.4, gap: 0, rate: 0.92 + Math.random() * 0.16 });
    }
  };
}
