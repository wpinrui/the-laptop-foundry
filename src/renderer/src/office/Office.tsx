import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SavedCompany } from "../../../preload/store";
import { Loaded } from "../app/Loaded";
import { FreeOs, makeSlot, type PageLook, SlotView } from "../builder/Free";
import { blurField, FullPage, type Prompt, Prompts } from "../cafe/Cafe";
import type { Shop } from "../cafe/CafeScreen";
import { yearOf } from "../foundry/LaptopList";
import type { Subject } from "../engine";
import { type CampaignState, quarterLabel } from "../engine/campaign";
import { Short } from "../ui/Short";
import { token } from "../viewer/theme";
import { DESK_PC_ID, Lights, type OfficeData, OfficeScene, type Pick, Picker, Rig, ShadowRefresh, type Walk } from "./Room";
import { buildPanels, type OfficeActions, statusOfModel, wallOrder } from "./Panels";
import { buildOf, DESK_PC, DeskScreen, deskAspect, deskLean, fitOf, leanFor, TvShort, UsedLaptop } from "./Use";
import { Trophies, Wall, SETTLE as WALL_SETTLE } from "./Wall";
import { labelOf, type OfficeAt, ringOf, type StationId, stepFrom } from "./stations";
import "../foundry/foundry.css";
import "../cafe/cafe.css";
import "./office.css";

// The Office: the company's loft as a 3D menu. The arrow keys step round its
// stations, each a fixed view with its panel open on the view's calm side. Tab
// walks the room in first person, where the laptops on the product wall can
// be used as in the cafe, and Tab again comes back to the nearest station.
// M opens the world map over the office. Escape opens the system menu. A
// strip along the top carries the quarter, the cash, last quarter's profit
// and End quarter wherever the player is.

export interface OfficeProps {
  company: SavedCompany;
  campaign: CampaignState | null;
  at: OfficeAt;
  onAt: (at: OfficeAt) => void;
  onMap: () => void;
  onEndQuarter: () => void;
  resolving: { step: number; of: number; name: string } | null;
  /** Something is open over the office (the quarter report, a statement, the system menu, the map): keys are its. */
  blocked: boolean;
  /** What the stations' panels do; without it the stations have no panels. */
  actions?: OfficeActions;
  /** The player's reviewed models, for the review site on a laptop's own screen. */
  library: Subject[];
  sound: boolean;
  onSound: (on: boolean) => void;
  /** Opens the system menu. */
  onSystem: () => void;
  /** Once the room and its wall have loaded, for the travel card over it. */
  onReady?: () => void;
}

const typing = () => !!(document.activeElement as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']");

/** Key prompts along the bottom of the view. */
function Keys({ list }: { list: Prompt[] }) {
  return (
    <div className="of-keys">
      {list.map((p) => (
        <div key={p.label} className="cafe-prompt">
          <span className="cafe-key">{p.key}</span>
          <span>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The desk computer's id among the things in use. */
const DESK = DESK_PC_ID;

export function Office({
  company,
  campaign,
  at,
  onAt,
  onMap,
  onEndQuarter,
  resolving,
  blocked,
  actions,
  library,
  sound,
  onSound,
  onSystem,
  onReady,
}: OfficeProps) {
  const ring = useMemo(() => ringOf(!!campaign), [campaign]);
  const station: StationId = ring.includes(at.station) ? at.station : "desk";
  const [free, setFree] = useState(false);
  const [aim, setAim] = useState<Pick | null>(null);
  // In free roam: the wall laptop whose OS runs, whether its screen has the pointer, and full screen.
  const [used, setUsed] = useState<string | null>(null);
  const [using, setUsing] = useState(false);
  const [full, setFull] = useState(false);
  const [look, setLook] = useState<PageLook | null>(null);
  const slot = useMemo(makeSlot, []);
  const overlay = useRef<HTMLDivElement>(null);
  // A video on the TV, and each Watch or Replay.
  const [playing, setPlaying] = useState(false);
  const [take, setTake] = useState(0);
  const walk = useRef<Walk>({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 });
  // Read once: the room loads after the arrival is marked played.
  const arriving = useRef(at.arrive).current;
  const wrap = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<OfficeData | null>(null);
  // The wall's laptops, newest first, with their status as the shelf shows it.
  const items = useMemo(
    () => wallOrder(company).map((model) => ({ model, status: statusOfModel(model, campaign) })),
    [company, campaign],
  );
  const mine = useMemo(() => (campaign ? campaign.awards.filter((a) => a.maker === null) : []), [campaign]);
  // The retailer's site on the desk computer or a used laptop lists the campaign's shelf, the player's laptops with it.
  const shop = useMemo(
    (): Shop | undefined => (campaign ? { state: campaign, models: company.models, company: company.name } : undefined),
    [campaign, company],
  );
  const boxes = useRef<{ id: string; box: THREE.Box3 }[]>([]);
  const count = Math.min(40, items.length);
  const stamp = `${items.map((i) => `${i.model.id}${i.status}${i.model.updated}`).join()}|${mine.length}`;
  const bays = Math.min(5, Math.max(1, Math.ceil(count / 8)));
  const order = useMemo(() => items.map((i) => i.model.id), [items]);
  const picked = order.includes(at.model ?? "") ? at.model : (order[0] ?? null);

  // The laptop in use: its build, its fit and its slot, and where the camera leans in to it.
  const usedIndex = used ? order.indexOf(used) : -1;
  const usedModel = usedIndex >= 0 ? items[usedIndex].model : null;
  const usedBuild = useMemo(() => (usedModel ? buildOf(usedModel) : null), [usedModel]);
  const usedFit = useMemo(() => (usedBuild ? fitOf(usedBuild) : null), [usedBuild]);
  // The desk computer: an ideal machine, not one of the company's laptops.
  const atDesk = used === DESK;
  const lean = useMemo(
    () =>
      data && atDesk
        ? deskLean(data, window.innerWidth / window.innerHeight)
        : data && usedFit && usedIndex >= 0
          ? leanFor(data, usedIndex, usedFit, window.innerWidth / window.innerHeight)
          : null,
    [data, atDesk, usedFit, usedIndex],
  );
  const usedSubject = useMemo<Subject | null>(
    () =>
      atDesk
        ? { id: DESK, name: "", company: company.name, build: DESK_PC }
        : usedModel && usedBuild
          ? { id: usedModel.id, name: usedModel.name, company: company.name, build: usedBuild }
          : null,
    [atDesk, usedModel, usedBuild, company.name],
  );
  /** A laptop on the wall that runs: a valid build within the wall's slots. */
  const runs = useMemo(
    () =>
      new Set(
        items
          .slice(0, 40)
          .filter((i) => i.status !== "block" && !!fitOf(buildOf(i.model)))
          .map((i) => i.model.id),
      ),
    [items],
  );
  const usable = (id: string) => runs.has(id);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the arrival plays once
  useEffect(() => {
    if (at.arrive) onAt({ ...at, arrive: false });
  }, []);

  // Leaving pointer lock on purpose (a laptop, full screen, the stations) is not a pause.
  const expectUnlock = useRef(false);
  const lock = useCallback(() => {
    wrap.current?.requestPointerLock?.()?.catch?.(() => {});
  }, []);
  const unlock = useCallback(() => {
    if (!document.pointerLockElement) return;
    expectUnlock.current = true;
    document.exitPointerLock();
  }, []);
  const stopUsing = () => {
    setUsed(null);
    setUsing(false);
    setFull(false);
    blurField();
  };

  const go = useCallback(
    (id: StationId) => {
      setFree(false);
      stopUsing();
      unlock();
      onAt({ ...at, station: id, arrive: false });
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: stopUsing only sets state
    [at, onAt, unlock],
  );
  // Free roam ends at the station nearest where the player stands.
  const nearest = (): StationId => {
    if (!data) return "desk";
    let best: StationId = "desk";
    let d = Number.POSITIVE_INFINITY;
    for (const id of ring) {
      const s = data.stands[id];
      if (!s) continue;
      const k = Math.hypot(s.x - walk.current.pos.x, s.z - walk.current.pos.z);
      if (k < d) {
        d = k;
        best = id;
      }
    }
    return best;
  };
  const enterFree = () => {
    onAt({ ...at, arrive: false });
    setFree(true);
    lock();
  };

  // The TV stops when the view leaves it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the station and free roam are the triggers
  useEffect(() => setPlaying(false), [station, free]);

  const aimed =
    aim?.kind === "laptop" && (aim.id === DESK || usable(aim.id)) ? aim.id : null;
  // An archived laptop on the wall, aimed at in free roam, can be unarchived where it stands.
  const shut = free && !used && aim?.kind === "laptop" ? company.models.find((m) => m.id === aim.id && m.archived) : undefined;
  const unarchive = shut && actions ? () => actions.onUnarchive(shut.id) : undefined;
  const keys = useRef({ station, free, at, blocked, go, enterFree, nearest, aim, aimed, onMap, ring, order, picked, used, using, full, onSystem, unarchive });
  keys.current = { station, free, at, blocked, go, enterFree, nearest, aim, aimed, onMap, ring, order, picked, used, using, full, onSystem, unarchive };
  const onAtRef = useRef(onAt);
  onAtRef.current = onAt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reads the latest through keys
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = keys.current;
      if (k.blocked || e.defaultPrevented) return;
      // Escape opens the system menu; on a laptop's screen too, as in the cafe.
      if (e.key === "Escape" && (k.used || !typing())) {
        e.preventDefault();
        k.onSystem();
        return;
      }
      if (typing()) return;
      if (e.key === "Tab") {
        if (k.used) return;
        // Tab toggles free roam here; it never moves the focus.
        e.preventDefault();
        if (e.repeat) return;
        if (k.free) k.go(k.nearest());
        else k.enterFree();
        return;
      }
      if (e.code === "KeyM") {
        if (e.repeat || k.used) return;
        e.preventDefault();
        k.onMap();
        return;
      }
      if (k.free) {
        if (e.repeat) return;
        if (e.code === "KeyF") {
          if (k.full) {
            setFull(false);
            if (!k.using) {
              setUsed(null);
              lock();
            }
          } else if (k.using) setFull(true);
          else if (k.aimed) {
            unlock();
            setUsed(k.aimed);
            setFull(true);
          }
        } else if (e.code === "KeyX" && !k.used && k.unarchive) k.unarchive();
        else if (e.code === "KeyE" && !k.full) {
          if (k.using) {
            stopUsing();
            lock();
          } else if (k.aimed) {
            unlock();
            setUsed(k.aimed);
            setUsing(true);
          } else if (k.aim?.kind === "station" && k.aim.id === "door") k.onMap();
          // Aiming at a station's part of the room opens it: back to its view, its panel up.
          else if (k.aim?.kind === "station" && k.ring.includes(k.aim.id)) k.go(k.aim.id);
        }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        k.go(stepFrom(k.ring, k.station, e.key === "ArrowRight" ? 1 : -1));
        return;
      }
      if ((k.station === "products" || k.station === "desk") && (e.key === "ArrowUp" || e.key === "ArrowDown") && k.order.length > 0) {
        e.preventDefault();
        const i = Math.max(0, k.picked ? k.order.indexOf(k.picked) : 0);
        const step = e.key === "ArrowDown" ? 1 : -1;
        onAtRef.current({ ...k.at, model: k.order[(i + step + k.order.length) % k.order.length] });
        return;
      }
      if (k.station === "door" && e.code === "KeyE") {
        e.preventDefault();
        k.onMap();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // In free roam, losing the pointer (Escape) opens the system menu, as the cafe pauses.
  useEffect(() => {
    const change = () => {
      if (document.pointerLockElement) return;
      if (expectUnlock.current) {
        expectUnlock.current = false;
        return;
      }
      const k = keys.current;
      if (k.free && !k.blocked) k.onSystem();
    };
    document.addEventListener("pointerlockchange", change);
    return () => document.removeEventListener("pointerlockchange", change);
  }, []);
  // Back from the system menu into free roam: the pointer is taken again.
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    if (wasBlocked.current && !blocked && free && !used) lock();
    wasBlocked.current = blocked;
  }, [blocked, free, used, lock]);
  useEffect(
    () => () => {
      expectUnlock.current = true;
      if (document.pointerLockElement) document.exitPointerLock();
    },
    [],
  );

  const panels = actions
    ? buildPanels({
        company,
        campaign,
        at,
        onAt,
        go,
        actions,
        playing,
        onWatch: (file) => {
          actions.tv?.onPlay(file);
          setPlaying(true);
          setTake((t) => t + 1);
        },
      })
    : {};

  const target = free || !data ? null : (data.poses[station === "products" ? `products_${bays}` : station] ?? null);
  const side = data?.sides[station] ?? "right";
  const last = campaign?.ledger[campaign.ledger.length - 1];
  const prev = stepFrom(ring, station, -1);
  const next = stepFrom(ring, station, 1);
  const panel = free ? null : panels[station];
  const wide = station === "market" || station === "desk";
  const tv = !free && station === "tv" && playing ? actions?.tv?.url : undefined;

  const screen = { key: "F", label: "Full screen" };
  // A laptop on the product wall is named over its prompts, as everywhere a laptop is aimed at.
  const shelved = free && aim?.kind === "laptop" ? company.models.find((m) => m.id === (used ?? aim.id)) : undefined;
  const shelfTitle = shelved ? { name: `${company.name} ${shelved.name}`, year: yearOf(shelved) } : undefined;
  let prompts: Prompt[] = [];
  if (free && using && !full) prompts = [{ key: "E", label: "Stop using" }, screen];
  else if (free && !used && aimed) prompts = [{ key: "E", label: "Use" }, screen];
  else if (free && !used && aim?.kind === "station" && aim.id === "door") prompts = [{ key: "E", label: "Leave" }];
  else if (free && !used && aim?.kind === "station" && ring.includes(aim.id)) prompts = [{ key: "E", label: labelOf(aim.id) }];
  if (unarchive) prompts = [...prompts, { key: "X", label: "Unarchive" }];
  const stationKeys: Prompt[] = [
    { key: "←", label: labelOf(prev) },
    { key: "→", label: labelOf(next) },
  ];
  if ((station === "desk" || station === "products") && order.length > 1) stationKeys.push({ key: "↑↓", label: "Laptops" });
  if (station === "door") stationKeys.push({ key: "E", label: "Leave" });
  stationKeys.push({ key: "Tab", label: "Free roam" });
  const osPage = look && usedSubject ? { node: <SlotView slot={slot} />, width: look.width, height: look.height, mm: look.mm } : null;

  return (
    <div className={`fd of${free ? " free" : ""}`}>
      <div ref={wrap} className="of-scene">
        <Canvas
          shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: false }}
          dpr={[1, 1.5]}
          gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 0.95 }}
          camera={{ fov: 50, near: 20, far: 40000 }}
        >
          <color attach="background" args={[token("office-shade")]} />
          <Lights />
          <Suspense fallback={null}>
            <OfficeScene>
              {(d) => (
                <>
                  <Ready data={d} onData={setData} />
                  <Rig
                    data={d}
                    target={free ? null : (d.poses[station === "products" ? `products_${bays}` : station] ?? null)}
                    lean={free ? lean : null}
                    arrive={arriving}
                    walk={walk}
                    active={free && !blocked && !used}
                  />
                  <Picker data={d} laptops={boxes} bays={bays} free={free && !used && !blocked} onLock={lock} onAim={setAim} />
                  <Bays data={d} count={count} />
                  <Wall
                    data={d}
                    items={items}
                    picked={free ? used : station === "products" ? picked : null}
                    hidden={free && usedFit ? used : null}
                    boxes={boxes}
                  />
                  {free && usedBuild && usedFit && usedIndex >= 0 && (
                    <UsedLaptop
                      data={d}
                      index={usedIndex}
                      build={usedBuild}
                      fit={usedFit}
                      page={osPage && !full ? osPage : undefined}
                      portal={overlay}
                    />
                  )}
                  {free && atDesk && <DeskScreen data={d} page={osPage && !full ? osPage : undefined} portal={overlay} />}
                  {tv && <TvShort data={d} url={tv} sound={sound} take={take} />}
                  <Trophies data={d} awards={mine} />
                  <ShadowRefresh stamp={`${stamp}:${bays}`} />
                  {/* After the wall's laptops are baked and the held shadows redrawn over them. */}
                  {onReady && <Loaded onReady={onReady} frames={WALL_SETTLE + 4} />}
                </>
              )}
            </OfficeScene>
          </Suspense>
        </Canvas>
        <div
          ref={overlay}
          className={`cafe-overlay${using ? " using" : ""}`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
        />
      </div>
      <header className="of-hud" style={full ? { display: "none" } : undefined}>
        <b className="of-name">{company.name}</b>
        {campaign && !campaign.bankrupt && (
          <div className="of-clock">
            <b>{quarterLabel(campaign.now)}</b>
            <b>
              <Short value={campaign.cash} money />
            </b>
            {last && (
              <small className={last.profit < 0 ? "short" : "up"}>
                <Short value={last.profit} money />
              </small>
            )}
            {!campaign.over &&
              (resolving ? (
                <div className="of-resolving">
                  <i style={{ width: `${((resolving.step + 1) / resolving.of) * 100}%` }} />
                  {resolving.name}
                </div>
              ) : (
                <button type="button" className="fd-primary of-end" onClick={onEndQuarter} disabled={blocked}>
                  End {quarterLabel(campaign.now)}
                </button>
              ))}
          </div>
        )}
      </header>
      {free ? (
        <>
          {!used && <div className="cafe-dot" />}
          <Prompts list={prompts} using={using} title={shelfTitle} />
          {!used && <Keys list={[{ key: "Tab", label: "Stations" }]} />}
          {full && osPage && (
            <div className="cafe-world">
              <FullPage page={osPage} />
            </div>
          )}
        </>
      ) : (
        target && (
          <>
            {panel ? (
              <aside key={station} className={`of-panel cr ${side}${wide ? " wide" : ""}${station === "desk" ? " desk" : ""} fd-in`}>
                {panel}
              </aside>
            ) : (
              <div className={`of-station ${side}`}>{labelOf(station)}</div>
            )}
            <Keys list={stationKeys} />
          </>
        )
      )}
      {free && usedSubject && (
        <FreeOs
          key={usedSubject.id}
          subject={usedSubject}
          library={library}
          sound={sound}
          onSound={onSound}
          slot={slot}
          onLook={setLook}
          perfect={atDesk}
          aspect={atDesk && data ? deskAspect(data) : undefined}
          shop={shop}
        />
      )}
    </div>
  );
}

/** Hands the loaded room up to the screen, for the stations' sides and spots. */
function Ready({ data, onData }: { data: OfficeData; onData: (d: OfficeData) => void }) {
  useEffect(() => onData(data), [data, onData]);
  return null;
}

/** Shows as many product bays as the laptops fill, at least one, each slot's filler standing until a laptop takes it. */
function Bays({ data, count }: { data: OfficeData; count: number }) {
  useEffect(() => {
    const shown = Math.min(5, Math.max(1, Math.ceil(count / 8)));
    data.bays.forEach((b, i) => {
      b.visible = i < shown;
    });
    data.slotNodes.forEach((s, i) => {
      const f = s.getObjectByName(`filler_${String(i).padStart(2, "0")}`);
      if (f) f.visible = i >= count;
    });
  }, [data, count]);
  return null;
}
