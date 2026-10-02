import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SavedCompany } from "../../../preload/store";
import { blurField, FullPage, type Prompt, Prompts, typing } from "../cafe/Cafe";
import { useLaptopOs } from "../cafe/CafeScreen";
import { panelOf, simulate, solve } from "../engine";
import type { CampaignState } from "../engine/campaign";
import { Column, Entry } from "../foundry/Menus";
import { SystemEntries } from "../foundry/SystemMenu";
import { lookOf as screenLook } from "../review/look";
import { bestSegments } from "../review/segments";
import { countShort } from "../world/data";
import { flagOf } from "./displays";
import { layoutOf } from "./layout";
import { type OnSale, useOnSale } from "./onSale";
import { Store, type StoreAim } from "./Store";
import "../cafe/cafe.css";
import "./storeworld.css";

// The Courts store as a place to walk around: the shell and pointer lock,
// the aim dot, the inspect card with its previous and next, and the pause
// menu. Walking out through the door calls onMap.

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** A display unit can be used when its build fits, simulates and has a screen. */
const usableCache = new WeakMap<OnSale, boolean>();
function usable(item: OnSale): boolean {
  let ok = usableCache.get(item);
  if (ok === undefined) {
    try {
      const fit = solve(item.build);
      simulate(item.build, fit);
      ok = !!screenLook(panelOf(item.build));
    } catch {
      ok = false;
    }
    usableCache.set(item, ok);
  }
  return ok;
}

/** The in-use laptop's page, handed from its OS to the screen without re-rendering the store. */
interface Slot {
  get: () => ReactNode;
  set: (n: ReactNode) => void;
  subscribe: (f: () => void) => () => void;
}

function makeSlot(): Slot {
  let node: ReactNode = null;
  const subs = new Set<() => void>();
  return {
    get: () => node,
    set: (n) => {
      if (n === node) return;
      node = n;
      for (const f of subs) f();
    },
    subscribe: (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

function SlotView({ slot }: { slot: Slot }) {
  return <>{useSyncExternalStore(slot.subscribe, slot.get)}</>;
}

interface PageLook {
  width: number;
  height: number;
  mm: { x: number; y: number };
}

/** The display unit's OS: a store demo account, on mains power, already running. */
function StoreOs({
  item,
  sound,
  onSound,
  slot,
  onLook,
}: {
  item: OnSale;
  sound: boolean;
  onSound: (on: boolean) => void;
  slot: Slot;
  onLook: (l: PageLook | null) => void;
}) {
  const subject = useMemo(
    () => ({ id: item.id, name: item.name, company: item.brand, build: item.build }),
    [item],
  );
  const os = useLaptopOs({ subject, sound, onSound, startPlugged: true, startOn: true });
  const node = os.page?.node ?? null;
  useLayoutEffect(() => slot.set(node));
  useEffect(() => () => slot.set(null), [slot]);
  const w = os.page?.width ?? 0;
  const h = os.page?.height ?? 0;
  const mx = os.page?.mm.x ?? 0;
  const my = os.page?.mm.y ?? 0;
  useEffect(() => {
    onLook(w && h ? { width: w, height: h, mm: { x: mx, y: my } } : null);
  }, [w, h, mx, my, onLook]);
  useEffect(() => () => onLook(null), [onLook]);
  return <>{os.shoot}</>;
}

const noSound = () => {};

export interface StoreWorldProps {
  /** The open company: its campaign's last quarter is on sale, or for a sandbox the market of `year`. */
  company: SavedCompany;
  /** The campaign's newest state, when it is ahead of the company's save. */
  campaign?: CampaignState | null;
  /** A sandbox company's year; its latest model's year when absent. Ignored in a campaign. */
  year?: number;
  sound?: boolean;
  onSound?: (on: boolean) => void;
  /** To the world map: out through the door, or Map from the pause menu. */
  onMap: () => void;
  /** Names a copy of the inspected laptop as the company's own; absent when no more can be made. */
  onClone?: (item: OnSale) => void;
  /** Once the store has loaded with its stock on the tables, for the travel card over it. */
  onReady?: () => void;
}

export function StoreWorld({
  company,
  campaign,
  year,
  sound,
  onSound,
  onMap,
  onClone,
  onReady,
}: StoreWorldProps) {
  const stock = useOnSale(company, campaign, year);
  // Each laptop's best buyer segment, and its share of the units sold by everything on sale in that class.
  const classes = useMemo(() => {
    const best = bestSegments(stock.items.map((i) => ({ id: i.id, name: i.name, company: i.brand, build: i.build })));
    const sold = new Map<string, number>();
    for (const i of stock.items) {
      const c = best.get(i.id)?.segment;
      if (c) sold.set(c, (sold.get(c) ?? 0) + i.units);
    }
    const out = new Map<string, { name: string; share: number | null }>();
    for (const i of stock.items) {
      const c = best.get(i.id)?.segment;
      if (!c) continue;
      const all = sold.get(c) ?? 0;
      out.set(i.id, { name: c, share: i.units > 0 && all > 0 ? Math.round((i.units / all) * 100) : null });
    }
    return out;
  }, [stock.items]);
  const layout = useMemo(() => layoutOf(stock.items), [stock.items]);
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [aim, setAim] = useState<StoreAim>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [using, setUsing] = useState(false);
  const [full, setFull] = useState(false);
  const [look, setLook] = useState<PageLook | null>(null);
  const slot = useMemo(makeSlot, []);
  const [shift, setShift] = useState(0);
  const expectUnlock = useRef(false);
  const pausedAt = useRef(0);
  const leaving = useRef(false);
  const active = !paused && !full;

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    onMap();
  }, [onMap]);

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

  const n = layout.seats.length;
  const open = useCallback(
    (i: number) => {
      unlock();
      setInspect(i);
    },
    [unlock],
  );
  const close = useCallback(() => {
    setInspect(null);
    setUsing(false);
    setFull(false);
    lock();
  }, [lock]);
  const step = useCallback(
    (d: number) =>
      setInspect((i) => (i === null || n === 0 ? i : (((i + d) % n) + n) % n)),
    [n],
  );

  const resume = useCallback(() => {
    setPaused(false);
    if (inspect === null) lock();
  }, [inspect, lock]);

  const seat = inspect !== null ? layout.seats[inspect] : undefined;
  const canUse = !!seat && usable(seat.item);

  const state = useRef({ paused, aim, inspect, using, full, canUse, resume, open, close, step, leave });
  state.current = { paused, aim, inspect, using, full, canUse, resume, open, close, step, leave };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = state.current;
      if (e.code === "Escape") {
        if (s.paused) {
          if (performance.now() - pausedAt.current > 300) s.resume();
        } else if (s.full || s.using) pause();
        else if (s.inspect !== null) s.close();
        return;
      }
      if (s.paused || e.repeat || typing(e)) return;
      if (s.full) {
        if (e.code === "KeyF") setFull(false);
        return;
      }
      if (s.using) {
        if (e.code === "KeyE") {
          blurField();
          setUsing(false);
        } else if (e.code === "KeyF") setFull(true);
        return;
      }
      if (s.inspect !== null) {
        if (e.code === "ArrowLeft" || e.code === "KeyA") s.step(-1);
        else if (e.code === "ArrowRight" || e.code === "KeyD") s.step(1);
        else if (e.code === "KeyE" && s.canUse) setUsing(true);
        else if (e.code === "KeyE" || e.code === "Backspace") s.close();
      } else if (e.code === "KeyE" && s.aim === "door") s.leave();
      else if (e.code === "KeyE" && typeof s.aim === "number") s.open(s.aim);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pause]);

  // A new market while inspecting starts the walk again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the layout
  useEffect(() => {
    setInspect(null);
    setUsing(false);
    setFull(false);
    setAim(null);
  }, [layout]);

  useLayoutEffect(() => {
    if (inspect === null) return;
    const on = () => setShift(Math.round((card.current?.offsetWidth ?? 0) / 2));
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [inspect]);

  let prompts: Prompt[] = [];
  if (active && using)
    prompts = [
      { key: "E", label: "Stop using" },
      { key: "F", label: "Full screen" },
    ];
  else if (active && inspect !== null && canUse)
    prompts = [{ key: "E", label: "Use" }];
  else if (active && inspect === null && aim === "door")
    prompts = [{ key: "E", label: "Leave" }];
  else if (active && inspect === null && aim !== null)
    prompts = [{ key: "E", label: "Inspect" }];
  const page = using && look ? { node: <SlotView slot={slot} />, ...look } : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: first-person input goes to the locked pointer
    <div
      ref={root}
      className="cafe sw"
      onMouseDown={() => {
        if (!active || inspect !== null) return;
        if (!document.pointerLockElement) lock();
        else if (typeof aim === "number") open(aim);
      }}
    >
      <div className={`cafe-world${paused ? " paused" : ""}`}>
        <Store
          layout={layout}
          era={stock.era}
          active={active}
          inspect={inspect}
          using={using}
          screen={page && !full ? page : undefined}
          shift={inspect !== null && !using ? shift : 0}
          onAim={setAim}
          // Only the market's own stock: before it loads the tables stand empty.
          onReady={stock.ready ? onReady : undefined}
        />
        {full && page && <FullPage page={page} />}
      </div>
      {seat && using && (
        <StoreOs
          key={seat.item.id}
          item={seat.item}
          sound={sound ?? true}
          onSound={onSound ?? noSound}
          slot={slot}
          onLook={setLook}
        />
      )}
      {active && inspect === null && <i className="cafe-dot" />}
      {active && <Prompts list={prompts} using={inspect !== null} />}
      {seat && !using && (
        <Card
          ref={card}
          item={seat.item}
          cls={classes.get(seat.item.id)}
          onClone={onClone && (() => onClone(seat.item))}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onBack={close}
        />
      )}
      {paused && (
        <div className="fd fd-over">
          <div className="fd-scrim" />
          <Column>
            <div className="fd-entries">
              <Entry onClick={resume} autoFocus>
                Resume
              </Entry>
              {sound !== undefined && onSound && (
                <Entry
                  valued
                  sub={sound ? "On" : "Off"}
                  onClick={() => onSound(!sound)}
                >
                  Sound
                </Entry>
              )}
              <Entry onClick={leave}>Map</Entry>
              <SystemEntries />
            </div>
          </Column>
        </div>
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={dir < 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function Card({
  ref,
  item,
  cls,
  onClone,
  onPrev,
  onNext,
  onBack,
}: {
  ref: Ref<HTMLElement>;
  item: OnSale;
  /** Its best buyer segment, and its share of that class's units. */
  cls?: { name: string; share: number | null };
  onClone?: () => void;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const s = item.spec;
  const rows: [string, string][] = [
    ["Processor", s.cpu],
    ["Graphics", s.gpu],
    ["Memory", s.memory],
    ["Storage", s.storage],
    ["Display", s.display],
    ["Battery", s.battery],
    ["Weight", item.kg ? `${Math.round(item.kg * 100) / 100} kg` : ""],
    ["Released", item.released],
  ];
  if (item.stock !== null)
    rows.push(["Stock", item.stock.toLocaleString("en-US")]);
  const flag = flagOf(item);
  const cells: [string, string, string?][] = [];
  if (item.units > 0) cells.push(["Sold", countShort(item.units)]);
  if (item.rank !== null) cells.push(["Rank", `${item.rank}`]);
  if (cls) cells.push(["Class", cls.name]);
  if (cls?.share != null) cells.push(["Class share", `${cls.share}%`]);
  return (
    <aside ref={ref} className="sw-card">
      <div>
        <div className="sw-mk">
          {item.brand}
          {flag && (
            <i
              className="sw-flag"
              style={{ background: flag.bg, color: flag.fg }}
            >
              {flag.text}
            </i>
          )}
        </div>
        <div className="sw-nm">{item.name}</div>
      </div>
      <div className="sw-price">{usd(item.price)}</div>
      {cells.length > 0 && (
        <div
          className="sw-cells"
          style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
        >
          {cells.map(([k, v, colour]) => (
            <div key={k}>
              <span>{k}</span>
              <b style={colour ? { color: colour } : undefined}>{v}</b>
            </div>
          ))}
        </div>
      )}
      <div className="sw-specs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="sw-row">
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
      </div>
      {onClone && (
        <div className="sw-nav sw-clone">
          <button type="button" className="sw-back" onClick={onClone}>
            Create clone
          </button>
        </div>
      )}
      <div className="sw-nav">
        <button
          type="button"
          className="sw-step"
          aria-label="Previous"
          onClick={onPrev}
        >
          <Chevron dir={-1} />
        </button>
        <button type="button" className="sw-back" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="sw-step"
          aria-label="Next"
          onClick={onNext}
        >
          <Chevron dir={1} />
        </button>
      </div>
    </aside>
  );
}
