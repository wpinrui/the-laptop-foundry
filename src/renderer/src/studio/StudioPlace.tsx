import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { Loaded } from "../app/Loaded";
import { type Prompt, Prompts, typing } from "../cafe/Cafe";
import { type Build, colourHex } from "../engine";
import type { CampaignState } from "../engine/campaign";
import { Column, Entry } from "../foundry/Menus";
import { SystemEntries } from "../foundry/SystemMenu";
import type { Commercial } from "../video/commercial";
import { adFile, useAdRender } from "../video/queue";
import type { ShortFacts } from "../video/script";
import { useStills } from "../viewer/stills";
import { ICON, Icon } from "./icons";
import { type Goal, type ScreenAt, StudioRoom } from "./Room";
import { StudioScreen } from "./StudioScreen";
import { Wheel } from "./Wheel";
import "../cafe/cafe.css";
import "./studio.css";

// The studio as a place: walked in first person, the laptop turning on the
// set. At the editing desk the screen glows and E sits under it: the camera
// glides onto the screen and the editor grows out of it to fill the window;
// leaving shrinks it back. Finish spins the wheel over the darkened room. The
// lamp over the door is lit while a commercial renders, and a chip in the
// corner shows how far it has got. Escape pauses; the door leads out.

/** How long the editor takes to shrink back into the screen, ms; studio.css times it. */
const SHRINK_MS = 400;
/** A finished render's chip stays up this long, ms. */
const DONE_MS = 6000;

const lidColour = (m: SavedModel | undefined) => {
  try {
    return m ? colourHex((m.build as Build).finish.lid.colour) : "var(--text)";
  } catch {
    return "var(--text)";
  }
};

export function StudioPlace({
  company,
  campaign,
  models,
  sound,
  onSound,
  onMap,
  onReady,
  onFinish,
  away = false,
}: {
  company: SavedCompany;
  campaign: CampaignState | null;
  /** The laptops that can still have their commercial, newest first. */
  models: SavedModel[];
  sound: boolean;
  onSound: (on: boolean) => void;
  /** To the world map: out through the door, or Map from the pause menu. */
  onMap: () => void;
  onReady?: () => void;
  onFinish: (c: Commercial, facts: ShortFacts) => void;
  /** The world map is open over the studio: it stands still, the pointer free, until the map closes. */
  away?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const at = useRef<ScreenAt | null>(null);
  // The pick cards' stills are taken while the studio loads: the travel card waits for the last one.
  const subjects = useMemo(() => models.map((m) => ({ id: m.id, name: m.name, company: company.name, build: m.build as Build })), [models, company.name]);
  const stills = useStills(subjects);
  const shot = models.every((m) => m.id in stills);
  const [paused, setPaused] = useState(false);
  const [goal, setGoal] = useState<Goal>("walk");
  const [ui, setUi] = useState<"screen" | "wheel" | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
  const [aim, setAim] = useState<"desk" | "door" | null>(null);
  const door = aim === "door";
  const [spun, setSpun] = useState<{ landed: number; model: SavedModel | undefined } | null>(null);
  const expectUnlock = useRef(false);
  const pausedAt = useRef(0);
  const walking = goal === "walk" && !ui;
  const active = walking && !paused && !away;
  // On the turntable: the newest laptop still to have its commercial, else the last one filmed.
  const lastAd = company.commercials?.[company.commercials.length - 1];
  const shown = models[0] ?? company.models.find((m) => m.id === lastAd?.model) ?? null;

  const rendering = useAdRender(company.id);
  const [finished, setFinished] = useState<string | null>(null);
  const was = useRef<string | null>(null);
  useEffect(() => {
    const now = rendering?.file ?? null;
    if (was.current && was.current !== now) setFinished(was.current);
    was.current = now;
  }, [rendering?.file]);
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => setFinished(null), DONE_MS);
    return () => clearTimeout(t);
  }, [finished]);

  const pause = useCallback(() => {
    pausedAt.current = performance.now();
    setPaused(true);
  }, []);
  const lock = useCallback(() => {
    // Refused (as just after Escape): the next click takes the pointer.
    Promise.resolve(root.current?.requestPointerLock()).catch(() => {});
  }, []);
  const unlock = useCallback(() => {
    if (!document.pointerLockElement) return;
    expectUnlock.current = true;
    document.exitPointerLock();
  }, []);

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
    if (goal === "walk" && !ui) lock();
  }, [goal, ui, lock]);
  // Under the map the pointer is free; it is taken again once the map closes.
  const wasAway = useRef(away);
  useEffect(() => {
    if (wasAway.current === away) return;
    wasAway.current = away;
    if (away) unlock();
    else if (!paused && walking) lock();
  }, [away, paused, walking, lock, unlock]);
  // The pause menu's Map: the map closes back onto the studio, not the menu.
  const toMap = () => {
    setPaused(false);
    onMap();
  };
  // At the desk: onto the screen; the editor grows out of it once the camera is there.
  const sit = useCallback(() => {
    unlock();
    setGoal("screen");
  }, [unlock]);
  const arrive = useCallback(
    (g: Goal) => {
      if (g === "screen") {
        const r = at.current?.rect;
        if (r) setOrigin(r);
        setUi("screen");
        requestAnimationFrame(() => requestAnimationFrame(() => setZoomed(true)));
      } else if (g === "desk" && !ui) {
        setGoal("walk");
        lock();
      }
    },
    [ui, lock],
  );
  // Out of the editor: it shrinks into the screen, then the camera backs off to the desk view.
  const stand = useCallback(() => {
    setZoomed(false);
    setTimeout(() => {
      setUi(null);
      setGoal("desk");
    }, SHRINK_MS);
  }, []);
  const finish = useCallback(
    (c: Commercial, facts: ShortFacts, landed: number) => {
      onFinish(c, facts);
      setSpun({ landed, model: company.models.find((m) => m.id === c.model) });
      setZoomed(false);
      setTimeout(() => {
        setUi("wheel");
        setGoal("desk");
      }, SHRINK_MS);
    },
    [onFinish, company.models],
  );
  const wheelDone = useCallback(() => {
    setSpun(null);
    setUi(null);
    setGoal("walk");
    lock();
  }, [lock]);

  const state = useRef({ paused, walking, door, resume, sit, onMap, away });
  state.current = { paused, walking, door, resume, sit, onMap, away };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = state.current;
      if (s.away) return;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) s.resume();
        } else if (s.walking) {
          unlock();
          pause();
        }
        return;
      }
      if (s.paused || e.repeat || !s.walking || typing(e)) return;
      if (e.code === "KeyM" || (e.code === "KeyE" && s.door)) s.onMap();
      else if (e.code === "KeyE" && at.current?.near) s.sit();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pause, unlock]);

  const prompts: Prompt[] = !active ? [] : door ? [{ key: "E", label: "Leave" }] : aim === "desk" ? [{ key: "E", label: "Make commercial" }] : [];
  const chip = rendering ?? (finished ? { file: finished, progress: 1 } : null);
  const chipAd = chip ? company.commercials?.find((c) => adFile(c.id) === chip.file) : undefined;
  const chipModel = chipAd ? company.models.find((m) => m.id === chipAd.model) : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="cafe st-room"
      onMouseDown={() => {
        if (active && !document.pointerLockElement) lock();
      }}
    >
      <div className={`cafe-world${paused ? " paused" : ""}${ui === "wheel" ? " st-dim" : ""}`}>
        <Canvas
          shadows={{ enabled: true, type: THREE.PCFSoftShadowMap }}
          dpr={[1, 1.5]}
          frameloop={ui === "screen" && zoomed ? "never" : "always"}
          gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1 }}
          camera={{ fov: 50, near: 30, far: 80000 }}
        >
          <Suspense fallback={null}>
            <StudioRoom
              model={shown}
              company={company.name}
              goal={goal}
              active={active}
              onAir={!!rendering}
              onArrive={arrive}
              onAim={setAim}
              at={at}
            />
            {onReady && shot && <Loaded onReady={onReady} />}
          </Suspense>
        </Canvas>
      </div>
      {active && <i className="cafe-dot" />}
      {active && <Prompts list={prompts} using={false} />}
      {ui === "screen" && (
        <StudioScreen
          company={company}
          campaign={campaign}
          models={models}
          stills={stills}
          zoomed={zoomed}
          origin={origin}
          onLeave={stand}
          onFinish={finish}
        />
      )}
      {ui === "wheel" && spun && (
        <div className="fd st st-over">
          <Wheel landed={spun.landed} name={spun.model?.name ?? ""} colour={lidColour(spun.model)} sandbox={!campaign} onDone={wheelDone} />
        </div>
      )}
      {chip && ui !== "screen" && (
        <div className="fd st-chip st-in">
          <div className="st-chip-ring" style={{ background: `conic-gradient(var(--accent) 0 ${chip.progress * 360}deg, color-mix(in srgb, var(--text) 14%, transparent) 0)` }}>
            <div className={chip.progress >= 1 ? "done" : undefined}>
              <Icon d={chip.progress >= 1 ? ICON.tv : ICON.film} size={22} />
            </div>
          </div>
          <i style={{ background: lidColour(chipModel) }} />
          <b>{chipModel?.name ?? ""}</b>
        </div>
      )}
      {paused && (
        <div className="fd fd-over">
          <div className="fd-scrim" />
          <Column>
            <div className="fd-entries">
              <Entry onClick={resume} autoFocus>
                Resume
              </Entry>
              <Entry valued sub={sound ? "On" : "Off"} onClick={() => onSound(!sound)}>
                Sound
              </Entry>
              <Entry onClick={toMap}>Map</Entry>
              <SystemEntries />
            </div>
          </Column>
        </div>
      )}
    </div>
  );
}
