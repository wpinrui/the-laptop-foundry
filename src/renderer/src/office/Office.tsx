import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SavedCompany } from "../../../preload/store";
import { type Prompt, Prompts } from "../cafe/Cafe";
import { type CampaignState, quarterLabel } from "../engine/campaign";
import { usd, usdShort } from "../foundry/Release";
import { token } from "../viewer/theme";
import { Lights, type OfficeData, OfficeScene, type Pick, Picker, Rig, ShadowRefresh, type Walk } from "./Room";
import { buildPanels, type OfficeActions, statusOfModel, wallOrder } from "./Panels";
import { Trophies, Wall } from "./Wall";
import { labelOf, type OfficeAt, ringOf, type StationId, stepFrom } from "./stations";
import "../foundry/foundry.css";
import "../cafe/cafe.css";
import "./office.css";

// The Office: the company's loft as a 3D menu. The arrow keys step round
// its stations, each a fixed view with its panel on the view's calm side;
// Tab walks the room in first person. A strip along the top carries the
// quarter, the cash, last quarter's profit and End quarter wherever the
// player is.

export interface OfficeProps {
  company: SavedCompany;
  campaign: CampaignState | null;
  at: OfficeAt;
  onAt: (at: OfficeAt) => void;
  onMap: () => void;
  onEndQuarter: () => void;
  resolving: { step: number; of: number; name: string } | null;
  /** Something is open over the office (the quarter report, a statement): keys are its. */
  blocked: boolean;
  /** What the stations' panels do; without it the stations have no panels. */
  actions?: OfficeActions;
}

const typing = () => !!(document.activeElement as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']");
const onControl = () => document.activeElement instanceof HTMLButtonElement;

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
}: OfficeProps) {
  const ring = useMemo(() => ringOf(!!campaign), [campaign]);
  const station: StationId = ring.includes(at.station) ? at.station : "desk";
  const [free, setFree] = useState(false);
  const [aim, setAim] = useState<Pick | null>(null);
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
  const boxes = useRef<{ id: string; box: THREE.Box3 }[]>([]);
  const count = Math.min(40, items.length);
  const stamp = `${items.map((i) => `${i.model.id}${i.status}${i.model.updated}`).join()}|${mine.length}`;
  const bays = Math.min(5, Math.max(1, Math.ceil(count / 8)));
  const order = useMemo(() => wallOrder(company).map((m) => m.id), [company]);
  const goRef = useRef<(id: StationId, open?: boolean) => void>(() => {});
  const panels = actions
    ? buildPanels({
        company,
        campaign,
        at,
        onAt,
        go: (id, open) => goRef.current(id, open),
        close: () => goRef.current(station),
        onEndQuarter,
        resolving,
        actions,
      })
    : {};
  const hasPanel = (id: StationId) => !!panels[id];

  // biome-ignore lint/correctness/useExhaustiveDependencies: the arrival plays once
  useEffect(() => {
    if (at.arrive) onAt({ ...at, arrive: false });
  }, []);

  const go = useCallback(
    (id: StationId, open = false) => {
      setFree(false);
      if (document.pointerLockElement) document.exitPointerLock();
      onAt({ ...at, station: id, panel: open && hasPanel(id), detail: open && id === "products" && at.detail, arrive: false });
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: panels are read as they are
    [at, onAt, panels],
  );
  goRef.current = go;
  const openPanel = () => {
    if (station === "door") onMap();
    else if (hasPanel(station)) onAt({ ...at, station, panel: true });
  };
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
    onAt({ ...at, panel: false, arrive: false });
    setFree(true);
    wrap.current?.requestPointerLock?.()?.catch?.(() => {});
  };

  const keys = useRef({ station, free, at, blocked, go, openPanel, enterFree, nearest, aim, onMap, ring, order });
  keys.current = { station, free, at, blocked, go, openPanel, enterFree, nearest, aim, onMap, ring, order };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = keys.current;
      if (k.blocked || e.defaultPrevented || typing()) return;
      if (e.key === "Tab") {
        e.preventDefault();
        if (k.free) k.go(k.nearest());
        else k.enterFree();
        return;
      }
      if (k.free) {
        if (e.key === "Escape") {
          e.preventDefault();
          k.go(k.nearest());
        } else if (e.code === "KeyE" && k.aim?.kind === "station" && k.aim.id === "door") {
          e.preventDefault();
          k.onMap();
        }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        k.go(stepFrom(k.ring, k.station, e.key === "ArrowRight" ? 1 : -1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (k.at.panel && k.at.detail) keysDetail(false);
        else if (k.at.panel) k.go(k.station);
        else if (k.station !== "desk") k.go("desk");
        return;
      }
      if (k.station === "products" && (e.key === "ArrowUp" || e.key === "ArrowDown") && k.order.length > 0) {
        e.preventDefault();
        const i = k.at.model ? k.order.indexOf(k.at.model) : -1;
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = i < 0 ? k.order[0] : k.order[(i + step + k.order.length) % k.order.length];
        onAtRef.current({ ...k.at, model: next });
        return;
      }
      if (k.station === "door" && e.code === "KeyE") {
        e.preventDefault();
        k.onMap();
        return;
      }
      if (e.key === "Enter" && !onControl()) {
        // On the product wall Enter opens the picked laptop's Model panel.
        if (k.station === "products" && k.at.model && !k.at.detail) {
          e.preventDefault();
          onAtRef.current({ ...k.at, panel: true, detail: true });
        } else if (!k.at.panel) {
          e.preventDefault();
          k.openPanel();
        }
      }
    };
    const keysDetail = (detail: boolean) => {
      const k = keys.current;
      onAtRef.current({ ...k.at, detail });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const onAtRef = useRef(onAt);
  onAtRef.current = onAt;

  // Losing the pointer lock keeps free roam: the mouse drags to look, a click on nothing locks again.
  const pick = (p: Pick | null) => {
    if (free && !p) {
      wrap.current?.requestPointerLock?.()?.catch?.(() => {});
      return;
    }
    if (!p) return;
    if (p.kind === "clock") {
      if (campaign && !campaign.over && !free) onEndQuarter();
      else go("desk");
      return;
    }
    if (p.kind === "laptop") {
      onAt({ ...at, station: "products", model: p.id, panel: hasPanel("products"), detail: true, arrive: false });
      setFree(false);
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (!ring.includes(p.id)) return;
    if (!free && p.id === station) openPanel();
    else go(p.id);
  };

  const target = free || !data ? null : (data.poses[station === "products" ? `products_${bays}` : station] ?? null);
  const side = data?.sides[station] ?? "right";
  const prompts: Prompt[] =
    free && aim?.kind === "station"
      ? aim.id === "door"
        ? [{ key: "E", label: "Leave" }]
        : [{ key: "mouse", label: labelOf(aim.id) }]
      : free && aim?.kind === "clock"
        ? [{ key: "mouse", label: labelOf("desk") }]
        : [];
  const last = campaign?.ledger[campaign.ledger.length - 1];
  const prev = stepFrom(ring, station, -1);
  const next = stepFrom(ring, station, 1);
  const panel = at.panel && !free ? panels[station] : null;

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
                    arrive={arriving}
                    walk={walk}
                    active={free && !blocked}
                  />
                  <Picker data={d} laptops={boxes} bays={bays} free={free} onPick={pick} onAim={setAim} />
                  <Bays data={d} count={count} />
                  <Wall data={d} items={items} picked={station === "products" ? at.model : null} boxes={boxes} />
                  <Trophies data={d} awards={mine} />
                  <ShadowRefresh stamp={`${stamp}:${bays}`} />
                </>
              )}
            </OfficeScene>
          </Suspense>
        </Canvas>
      </div>
      <header className="of-hud">
        <b className="of-name">{company.name}</b>
        {campaign && !campaign.bankrupt && (
          <div className="of-clock">
            <b>{quarterLabel(campaign.now)}</b>
            <b>{usd(campaign.cash)}</b>
            {last && <small className={last.profit < 0 ? "short" : "up"}>{usdShort(last.profit)}</small>}
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
          <div className="cafe-dot" />
          <Prompts list={prompts} using={false} />
        </>
      ) : (
        target && (
          <>
            {panel ? (
              <aside key={station} className={`of-panel cr ${side}${station === "market" ? " wide" : ""} fd-in`}>
                {panel}
              </aside>
            ) : (
              <button
                type="button"
                className={`of-station ${side}`}
                onClick={openPanel}
                disabled={station !== "door" && !hasPanel(station)}
              >
                {labelOf(station)}
              </button>
            )}
            <nav className="of-ring">
              <button type="button" className="fd-text" onClick={() => go(prev)}>
                <i>‹</i>
                {labelOf(prev)}
              </button>
              <button type="button" className="fd-text" onClick={() => go(next)}>
                {labelOf(next)}
                <i>›</i>
              </button>
            </nav>
          </>
        )
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
