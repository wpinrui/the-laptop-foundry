import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Column, Entry } from "../foundry/Menus";
import { SystemEntries } from "../foundry/SystemMenu";
import { setSpeakerFull } from "../panel/speaker";
import { type Aim, type LaptopLook, World } from "./World";

// The cafe's first-person shell: pointer lock, the aim dot and prompts, the
// sit (seated, looking and zooming), use (seated, free cursor on the screen)
// and full-screen modes, and the pause menu. The laptop's own screen
// (battery, power profile, apps) stays inside the in-game OS.

interface Page {
  node: ReactNode;
  width: number;
  height: number;
  mm: { x: number; y: number };
}

export type Prompt = { key: string; label: string };

function MouseGlyph() {
  return (
    <svg viewBox="0 0 12 18" width="44%" height="60%" aria-hidden>
      <rect x="0.75" y="0.75" width="10.5" height="16.5" rx="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 0.75 V7.5 M0.75 7.5 H6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.4 6.8 V5 A4.6 4.6 0 0 1 5.3 1.4 V6.8 Z" fill="currentColor" />
    </svg>
  );
}

export function Prompts({ list, using }: { list: Prompt[]; using: boolean }) {
  // The last prompts stay drawn while they fade out.
  const [shown, setShown] = useState(list);
  if (list.length > 0 && list !== shown && JSON.stringify(list) !== JSON.stringify(shown)) setShown(list);
  return (
    <div className={`cafe-prompts${list.length > 0 ? " on" : ""}${using ? " using" : ""}`}>
      {shown.map((p) => (
        <div key={p.label} className="cafe-prompt">
          <span className="cafe-key">{p.key === "mouse" ? <MouseGlyph /> : p.key}</span>
          <span>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Keys typed into a text field in the OS belong to the OS. */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.("input, textarea, [contenteditable='true']");
}

export function blurField() {
  const a = document.activeElement as HTMLElement | null;
  if (a?.closest?.("input, textarea, [contenteditable='true']")) a.blur();
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

/** The OS page filling the game window, scaled to fit. */
export function FullPage({ page }: { page: { node: ReactNode; width: number; height: number } }) {
  const [w, h] = useWindowSize();
  const k = Math.min(w / page.width, h / page.height);
  useEffect(() => {
    setSpeakerFull(true);
    return () => setSpeakerFull(false);
  }, []);
  return (
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
  );
}

export function Cafe({
  laptop,
  page,
  shoot,
  plugged,
  onPlug,
  sound,
  onSound,
  onLeave,
  onMap,
  atDoor,
  onReady,
}: {
  /** None: the player came empty handed. */
  laptop?: LaptopLook;
  page?: Page;
  shoot: ReactNode;
  plugged: boolean;
  onPlug: () => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  /** Back to the models screen; absent on a visit from the map. */
  onLeave?: () => void;
  /** To the world map, from the pause menu or out through the entrance. */
  onMap: () => void;
  /** Arrives through the street entrance. */
  atDoor?: boolean;
  /** Once the cafe has loaded. */
  onReady?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Sitting: seated, pointer locked, looking around. Using: seated with the
  // pointer free to work the laptop's screen.
  const [pose, setPose] = useState<"stand" | "sit" | "use">("stand");
  const using = pose === "use";
  const [full, setFull] = useState(false);
  const [paused, setPaused] = useState(false);
  const [aim, setAim] = useState<Aim>(null);
  const aimRef = useRef<Aim>(null);
  // Leaving pointer lock on purpose (full screen, leaving) is not a pause.
  const expectUnlock = useRef(false);
  const pausedAt = useRef(0);
  const active = !paused && !full;

  const pause = useCallback(() => {
    pausedAt.current = performance.now();
    setPaused(true);
  }, []);

  const lock = useCallback(() => {
    const el = root.current;
    if (!el) return;
    // Refused (as just after Escape): the next click takes the pointer, the menu stays shut.
    Promise.resolve(el.requestPointerLock()).catch(() => {});
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
    return () => {
      document.removeEventListener("pointerlockchange", change);
      expectUnlock.current = true;
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [lock, pause]);

  const resume = useCallback(() => {
    setPaused(false);
    if (!full && !using) lock();
  }, [full, using, lock]);

  const unlock = useCallback(() => {
    if (!document.pointerLockElement) return;
    expectUnlock.current = true;
    document.exitPointerLock();
  }, []);

  const state = useRef({ pose, using, full, paused, aim, active, resume, onPlug, onMap });
  state.current = { pose, using, full, paused, aim, active, resume, onPlug, onMap };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = state.current;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) s.resume();
        } else if (s.full || s.using) pause();
        return;
      }
      if (e.repeat || s.paused || typing(e)) return;
      if (e.code === "KeyF") {
        if (s.full) {
          setFull(false);
          if (!s.using) {
            blurField();
            lock();
          }
        } else if (s.active && (s.aim === "laptop" || s.using)) {
          unlock();
          setFull(true);
        }
      } else if (e.code === "KeyE" && s.active && s.aim === "door" && s.pose === "stand") {
        s.onMap();
      } else if (e.code === "KeyE" && s.active) {
        if (s.using) {
          setPose("sit");
          blurField();
          lock();
        } else if (s.aim === "laptop") {
          if (s.pose === "sit") {
            unlock();
            setPose("use");
          } else setPose("sit");
        }
      } else if (e.code === "KeyQ" && s.active && s.pose !== "stand") {
        if (s.using) {
          blurField();
          lock();
        }
        setPose("stand");
      } else if (e.code === "KeyC" && (s.using || s.full || (s.active && (s.aim === "laptop" || s.aim === "power")))) {
        s.onPlug();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [lock, unlock, pause]);

  let prompts: Prompt[] = [];
  const charge = { key: "C", label: plugged ? "Unplug" : "Plug in" };
  const stand = { key: "Q", label: "Stand" };
  const screen = { key: "F", label: "Full screen" };
  if (active && using) prompts = [{ key: "E", label: "Stop using" }, stand, charge, screen];
  else if (active && pose === "sit") {
    if (aim === "laptop") prompts = [{ key: "E", label: "Use" }, stand, charge, screen];
    else if (aim === "power") prompts = [stand, charge];
    else prompts = [stand];
  } else if (active && aim === "laptop") prompts = [{ key: "E", label: "Sit" }, charge, screen];
  else if (active && aim === "power") prompts = [charge];
  else if (active && aim === "door") prompts = [{ key: "E", label: "Leave" }];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="cafe"
      onMouseDown={() => {
        // In use, clicks belong to the laptop's screen.
        if (!active || using) return;
        if (!document.pointerLockElement) lock();
      }}
    >
      {shoot}
      <div className={`cafe-world${paused ? " paused" : ""}`}>
        <World
          laptop={laptop}
          atDoor={atDoor}
          onDoor={onMap}
          onReady={onReady}
          screen={page && !full ? page : undefined}
          seated={pose !== "stand"}
          using={using}
          active={active}
          onAim={setAim}
          aimRef={aimRef}
        />
        {full && page && <FullPage page={page} />}
      </div>
      {active && (
        <>
          {!using && <i className="cafe-dot" />}
          <Prompts list={prompts} using={using} />
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
              {onLeave && <Entry onClick={onLeave}>Leave</Entry>}
              <Entry onClick={onMap}>Map</Entry>
              <SystemEntries />
            </div>
          </Column>
        </div>
      )}
    </div>
  );
}
