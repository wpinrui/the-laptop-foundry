import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Decor, Fit } from "../engine";
import { Column, Entry } from "../foundry/Menus";
import type { Surfaces } from "../viewer/Scene";
import { type Aim, World } from "./World";

// The cafe's first-person shell: pointer lock, the aim dot and prompts, the
// seated and full-screen modes, and the pause menu. The laptop's own screen
// (battery, power profile, apps) stays inside the in-game OS.

interface Page {
  node: ReactNode;
  width: number;
  height: number;
  mm: { x: number; y: number };
}

type Prompt = { key: string; label: string };

function MouseGlyph() {
  return (
    <svg viewBox="0 0 12 18" width="44%" height="60%" aria-hidden>
      <rect x="0.75" y="0.75" width="10.5" height="16.5" rx="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 0.75 V7.5 M0.75 7.5 H6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.4 6.8 V5 A4.6 4.6 0 0 1 5.3 1.4 V6.8 Z" fill="currentColor" />
    </svg>
  );
}

function Prompts({ list }: { list: Prompt[] }) {
  // The last prompts stay drawn while they fade out.
  const [shown, setShown] = useState(list);
  if (list.length > 0 && list !== shown && JSON.stringify(list) !== JSON.stringify(shown)) setShown(list);
  return (
    <div className={`cafe-prompts${list.length > 0 ? " on" : ""}`}>
      {shown.map((p) => (
        <div key={p.label} className="cafe-prompt">
          <span className="cafe-key">{p.key === "mouse" ? <MouseGlyph /> : p.key}</span>
          <span>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

function useWindowSize(): [number, number] {
  const [size, setSize] = useState<[number, number]>([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const on = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

export function Cafe({
  fit,
  year,
  colours,
  decor,
  surfaces,
  page,
  shoot,
  plugged,
  onPlug,
  sound,
  onSound,
  onLeave,
}: {
  fit: Fit;
  year: number;
  colours: { floor: string; deck: string; lid: string };
  decor?: Decor;
  surfaces: Surfaces;
  page?: Page;
  shoot: ReactNode;
  plugged: boolean;
  onPlug: () => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  onLeave: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [seated, setSeated] = useState(false);
  const [full, setFull] = useState(false);
  const [paused, setPaused] = useState(false);
  const [aim, setAim] = useState<Aim>(null);
  const aimRef = useRef<Aim>(null);
  // Leaving pointer lock on purpose (full screen, leaving) is not a pause.
  const expectUnlock = useRef(false);
  const pausedAt = useRef(0);
  const [w, h] = useWindowSize();
  const active = !paused && !full;

  const pause = useCallback(() => {
    pausedAt.current = performance.now();
    setPaused(true);
  }, []);

  const lock = useCallback(() => {
    const el = root.current;
    if (!el) return;
    Promise.resolve(el.requestPointerLock()).catch(pause);
  }, [pause]);

  useEffect(() => {
    lock();
    const change = () => {
      if (document.pointerLockElement === root.current) return;
      if (expectUnlock.current) {
        expectUnlock.current = false;
        return;
      }
      pause();
    };
    document.addEventListener("pointerlockchange", change);
    document.addEventListener("pointerlockerror", pause);
    return () => {
      document.removeEventListener("pointerlockchange", change);
      document.removeEventListener("pointerlockerror", pause);
      expectUnlock.current = true;
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [lock, pause]);

  const resume = useCallback(() => {
    setPaused(false);
    if (!full) lock();
  }, [full, lock]);

  const state = useRef({ seated, full, paused, aim, active, resume });
  state.current = { seated, full, paused, aim, active, resume };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = state.current;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) s.resume();
        } else if (s.full) pause();
        return;
      }
      if (e.repeat || s.paused) return;
      if (e.code === "KeyF") {
        if (s.full) {
          setFull(false);
          lock();
        } else if (s.active && (s.aim || s.seated)) {
          expectUnlock.current = true;
          document.exitPointerLock();
          setFull(true);
        }
      } else if (e.code === "KeyE" && s.active) {
        if (s.seated) setSeated(false);
        else if (s.aim === "laptop") setSeated(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [lock, pause]);

  let prompts: Prompt[] = [];
  if (active && seated && aim === "port")
    prompts = [
      { key: "mouse", label: plugged ? "Unplug" : "Plug in" },
      { key: "E", label: "Stand" },
    ];
  else if (active && seated && aim)
    prompts = [
      { key: "E", label: "Stand" },
      { key: "F", label: "Full screen" },
    ];
  else if (active && aim)
    prompts = [
      { key: "E", label: "Sit" },
      { key: "F", label: "Full screen" },
    ];

  const k = page ? Math.min(w / page.width, h / page.height) : 1;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="cafe"
      onMouseDown={(e) => {
        if (!active) return;
        if (!document.pointerLockElement) {
          lock();
          return;
        }
        if (e.button === 0 && aimRef.current === "port") onPlug();
      }}
    >
      {shoot}
      <div className={`cafe-world${paused ? " paused" : ""}`}>
        <World
          fit={fit}
          year={year}
          colours={colours}
          decor={decor}
          surfaces={surfaces}
          screen={page && !full ? page : undefined}
          seated={seated}
          active={active}
          onAim={setAim}
          aimRef={aimRef}
        />
        {full && page && (
          <div className="cafe-full">
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: page.width,
                height: page.height,
                transform: `translate(-50%, -50%) scale(${k})`,
              }}
            >
              {page.node}
            </div>
          </div>
        )}
      </div>
      {active && (
        <>
          <i className="cafe-dot" />
          <Prompts list={prompts} />
        </>
      )}
      {paused && (
        <div className="fd fd-over">
          <div className="fd-scrim" />
          {/* Escape resumes through the cafe's own key handler. */}
          <Column>
            <div className="fd-entries">
              <Entry onClick={resume} autoFocus>
                Resume
              </Entry>
              <Entry valued sub={sound ? "On" : "Off"} onClick={() => onSound(!sound)}>
                Sound
              </Entry>
              <Entry onClick={onLeave}>Leave</Entry>
            </div>
          </Column>
        </div>
      )}
    </div>
  );
}
