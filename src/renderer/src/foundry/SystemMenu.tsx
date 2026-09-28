import { useEffect, useRef, useState } from "react";
import "./foundry.css";

// The system menu, over any place while a company is open: M opens it and M
// again (or Escape, or Resume) closes it, leaving the place exactly as it was.
// It holds what the start menu offers: the companies, settings and Quit.

const typing = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']");

/** Opens and closes the menu with M, anywhere but in a text field. */
export function useSystemMenu(enabled: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  const live = useRef({ enabled, open });
  live.current = { enabled, open };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = live.current;
      if (!s.enabled || e.code !== "KeyM" || e.repeat || typing(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!s.open && document.pointerLockElement) document.exitPointerLock();
      setOpen(!s.open);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);
  return [open, setOpen];
}

export function SystemMenu({
  company,
  sound,
  onSound,
  onResume,
  onNew,
  onLoad,
}: {
  company: string;
  sound: boolean;
  onSound: (on: boolean) => void;
  onResume: () => void;
  onNew: () => void;
  onLoad: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const entries: { label: string; value?: string; run: () => void; secondary?: boolean }[] = [
    { label: "Resume", value: company, run: onResume },
    { label: "New company", run: onNew },
    { label: "Load company", run: onLoad },
    { label: "Sound", value: sound ? "On" : "Off", run: () => onSound(!sound), secondary: true },
    { label: "Quit", run: () => window.api.quit(), secondary: true },
  ];
  const live = useRef({ entries, at, onResume });
  live.current = { entries, at, onResume };
  useEffect(() => {
    // The place under the menu gets no keys while it is open.
    const key = (e: KeyboardEvent) => {
      if (e.code === "KeyM") return;
      e.stopImmediatePropagation();
      const s = live.current;
      const n = s.entries.length;
      if (e.key === "Escape") {
        e.preventDefault();
        s.onResume();
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
    const up = (e: KeyboardEvent) => {
      if (e.code !== "KeyM") e.stopImmediatePropagation();
    };
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
        {[entries.slice(0, 3), entries.slice(3)].map((group, g) => (
          <div key={g === 0 ? "main" : "more"} className="fd-entries">
            {group.map((e) => {
              const i = entries.indexOf(e);
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
