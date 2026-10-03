import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Settings } from "../../../preload/store";
import { setVolumes, useVolumes } from "../audio/engine";
import { Entry } from "./Menus";
import { VOLUMES, VolumeEntry } from "./Volume";
import "./foundry.css";

// The system menu: in the Office's free roam, Escape opens it and Escape again (or
// Resume) closes it, leaving the office exactly as it was. It holds what the
// start menu offers: the companies, settings and Quit. The other places keep
// their own Escape pause menus, which end with the same company entries.

/** Opens and closes the menu; it closes when no company is open. */
export function useSystemMenu(enabled: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);
  return [open, setOpen];
}

/** Leaving the open company, for the places' pause menus. */
export const SystemActions = createContext<{ onNew: () => void; onLoad: () => void } | null>(null);

/** New company, Load company and Quit, at the end of a place's pause menu. */
export function SystemEntries() {
  const sys = useContext(SystemActions);
  if (!sys) return null;
  return (
    <>
      <Entry onClick={sys.onNew}>New company</Entry>
      <Entry onClick={sys.onLoad}>Load company</Entry>
      <Entry secondary onClick={() => window.api.quit()}>
        Quit
      </Entry>
    </>
  );
}

export function SystemMenu({
  company,
  onResume,
  onNew,
  onLoad,
  onMap,
}: {
  company: string;
  /** Out to the world map; absent when already on it. */
  onMap?: () => void;
  onResume: () => void;
  onNew: () => void;
  onLoad: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [sounds, setSounds] = useState(false);
  const volumes = useVolumes();
  const view = (open: boolean) => {
    setSounds(open);
    setAt(0);
  };
  const entries: { label: string; value?: string; run: () => void; secondary?: boolean; volume?: keyof Settings }[] = sounds
    ? [
        ...VOLUMES.map((v) => ({ label: v.label, run: () => {}, volume: v.key })),
        { label: "Back", run: () => view(false), secondary: true },
      ]
    : [
        { label: "Resume", value: company, run: onResume },
        ...(onMap ? [{ label: "Map", run: onMap }] : []),
        { label: "New company", run: onNew },
        { label: "Load company", run: onLoad },
        { label: "Sound", run: () => view(true), secondary: true },
        { label: "Quit", run: () => window.api.quit(), secondary: true },
      ];
  const back = sounds ? () => view(false) : onResume;
  const live = useRef({ entries, at, back, volumes });
  live.current = { entries, at, back, volumes };
  useEffect(() => {
    // The place under the menu gets no keys while it is open.
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      const s = live.current;
      const n = s.entries.length;
      const turn = e.key === "ArrowRight" || e.code === "KeyD" ? 1 : e.key === "ArrowLeft" || e.code === "KeyA" ? -1 : 0;
      const vol = s.entries[s.at]?.volume;
      if (e.key === "Escape") {
        e.preventDefault();
        s.back();
      } else if (turn && vol) {
        e.preventDefault();
        setVolumes({ [vol]: Math.round(Math.min(1, Math.max(0, s.volumes[vol] + turn * 0.1)) * 10) / 10 });
      } else if (e.key === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        setAt((s.at + 1) % n);
      } else if (e.key === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        setAt((s.at - 1 + n) % n);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        s.entries[s.at].run();
      }
    };
    const up = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);
  return (
    <div className="fd sm">
      <div className="sm-scrim" />
      <div ref={root} className="fd-column fd-in">
        <h1 className="fd-title">
          The Laptop
          <br />
          Foundry
        </h1>
        {[entries.filter((e) => !e.secondary), entries.filter((e) => e.secondary)].map((group, g) => (
          <div key={g === 0 ? "main" : "more"} className="fd-entries">
            {group.map((e) => {
              const i = entries.indexOf(e);
              const vol = e.volume;
              if (vol)
                return (
                  <VolumeEntry
                    key={e.label}
                    label={e.label}
                    value={volumes[vol]}
                    onChange={(x) => setVolumes({ [vol]: x })}
                    focused={i === at}
                    onHover={() => setAt(i)}
                  />
                );
              return (
                <button
                  key={e.label}
                  type="button"
                  className={`fd-entry${e.secondary ? " secondary" : ""}${e.value ? " valued" : ""}`}
                  data-focus={i === at ? "" : undefined}
                  onMouseEnter={() => setAt(i)}
                  onClick={e.run}
                >
                  <span>{e.label}</span>
                  {e.value !== undefined && <small>{e.value}</small>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
