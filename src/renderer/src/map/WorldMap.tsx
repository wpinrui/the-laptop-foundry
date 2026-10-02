import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import { type Build, colourHex, solve } from "../engine";
import { overallOf, sortedModels, yearOf } from "../foundry/LaptopList";
import "../foundry/foundry.css";
import "./map.css";

// The world map: a street plan on the left with the four places on street
// corners, and a panel on the right naming the destination, the laptop to
// bring and Go. The workshop and the cafe take a laptop; the Office and Courts
// do not.

export type Place = "workshop" | "cafe" | "office" | "courts";
/** Where the map was opened from: a place's door, or the menu. */
export type MapFrom = Place | "menu";

// Icons from Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors.
const ICON: Record<Place, ReactNode> = {
  workshop: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  cafe: (
    <>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
      <path d="M6 2v2" />
    </>
  ),
  office: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  courts: (
    <>
      <path d="M16 10a4 4 0 0 1-8 0" />
      <path d="M3.103 6.034h17.794" />
      <path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
    </>
  ),
};

/** Each place on its street corner, design px on the 1040 by 810 map. */
const PLACES: { id: Place; name: string; tip: string; x: number; y: number; bring: boolean }[] = [
  { id: "workshop", name: "Workshop", tip: "Build and edit your laptops", x: 180, y: 470, bring: true },
  { id: "cafe", name: "Cafe", tip: "Use one of your laptops", x: 470, y: 210, bring: true },
  { id: "office", name: "Office", tip: "Run the company", x: 800, y: 210, bring: false },
  { id: "courts", name: "Courts", tip: "See the laptops on sale", x: 800, y: 690, bring: false },
];
const STREETS_Y = [201, 461, 681];
const STREETS_X = [171, 461, 791];

const u = (n: number) => `calc(${n} * var(--u))`;

/** The laptops that can come along: any model to the workshop, only a working one to the cafe. */
function carried(models: SavedModel[], place: Place): SavedModel[] {
  if (place === "office" || place === "courts") return [];
  return place === "workshop" ? models : models.filter((m) => !buildBlock(m.build));
}

/** The laptop from above: its lid in its own colour, at its real footprint. */
function Thumb({ model }: { model: SavedModel | null }) {
  const look = useMemo(() => {
    if (!model) return null;
    const b = model.build as Build;
    try {
      const o = solve(b).shell.outer;
      return { w: o.x, d: o.y, lid: colourHex(b.finish.lid.colour) };
    } catch {
      return null;
    }
  }, [model]);
  if (!model) return <span className="wm-thumb none" />;
  // The largest laptops, about 420 mm wide, fill the tile.
  const w = look ? Math.min(46, (46 * look.w) / 420) : 0;
  const h = look ? Math.min(30, (w * look.d) / look.w) : 0;
  return (
    <span className="wm-thumb">
      {look && <i style={{ width: u(w), height: u(h), background: look.lid }} />}
    </span>
  );
}

export function WorldMap({
  company,
  from,
  onGo,
  onBack,
}: {
  company: SavedCompany;
  from: MapFrom;
  onGo: (to: Place, laptop: SavedModel | null) => void;
  /** Stay from a place, Menu from the menu. */
  onBack: () => void;
}) {
  const open = (p: Place) => p !== from;
  const [dest, setDest] = useState<Place>(() => PLACES.find((p) => open(p.id))?.id ?? "workshop");
  const [bring, setBring] = useState<string | null>(null);
  const all = useMemo(() => sortedModels(company), [company]);
  const laptops = useMemo(() => carried(all, dest), [all, dest]);
  // Scores only for reviewed laptops, as on the models screen.
  const scores = useMemo(
    () => new Map(all.map((m) => [m.id, m.reviewed ? overallOf(m, company.name) : null])),
    [all, company.name],
  );
  const here = PLACES.find((p) => p.id === from);
  const to = PLACES.find((p) => p.id === dest) ?? PLACES[0];
  const canBring = to.bring && laptops.length > 0;
  const chosen = canBring ? (laptops.find((m) => m.id === bring) ?? null) : null;

  const live = useRef({ go: () => {}, onBack });
  live.current = { go: () => onGo(dest, chosen), onBack };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        live.current.onBack();
      } else if (e.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        live.current.go();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // The route from here: along here's street, then down the destination's.
  const route: { left: number; top: number; width: number; height: number; across: boolean }[] = [];
  if (here) {
    const x0 = Math.min(here.x, to.x);
    const x1 = Math.max(here.x, to.x);
    const y0 = Math.min(here.y, to.y);
    const y1 = Math.max(here.y, to.y);
    if (x1 > x0) route.push({ left: x0, top: here.y - 1.5, width: x1 - x0, height: 3, across: true });
    if (y1 > y0) route.push({ left: to.x - 1.5, top: y0, width: 3, height: y1 - y0, across: false });
  }

  return (
    <div className="fd wm">
      <div className="wm-map">
        <div className="wm-glow" />
        {STREETS_Y.map((y) => (
          <i key={`y${y}`} className="wm-street" style={{ left: 0, right: 0, top: u(y), height: u(18) }} />
        ))}
        {STREETS_X.map((x) => (
          <i key={`x${x}`} className="wm-street" style={{ top: 0, bottom: 0, left: u(x), width: u(18) }} />
        ))}
        <i className="wm-park" style={{ left: u(560), top: u(520), width: u(180), height: u(110) }} />
        <i className="wm-park faint" style={{ left: u(230), top: u(40), width: u(180), height: u(120) }} />
        {route.map((r) => (
          <i
            key={r.across ? "across" : "down"}
            className={`wm-route${r.across ? " across" : ""}`}
            style={{ left: u(r.left), top: u(r.top), width: u(r.width), height: u(r.height) }}
          />
        ))}
        {PLACES.map((p) => {
          const isHere = p.id === from;
          const on = p.id === dest;
          return (
            <div
              key={p.id}
              className={`wm-place${isHere ? " here" : ""}${on ? " on" : ""}${!isHere && !open(p.id) ? " shut" : ""}`}
              style={{ left: u(p.x), top: u(p.y) }}
            >
              {isHere && <i className="wm-ping" />}
              <i className="wm-dot" />
              <button type="button" disabled={!open(p.id)} onClick={() => setDest(p.id)}>
                <span className="wm-tile">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {ICON[p.id]}
                  </svg>
                </span>
                <b>{p.name}</b>
                <span className="wm-tip">{p.tip}</span>
              </button>
            </div>
          );
        })}
      </div>

      <aside className="wm-panel">
        <div className="wm-dest">{to.name}</div>
        {canBring ? (
          <>
            <div className="wm-bring">
              <span>Bring</span>
              <span>{laptops.length}</span>
            </div>
            <div className="wm-list">
              {[null, ...laptops].map((m) => {
                const score = m ? scores.get(m.id) : null;
                return (
                  <button
                    key={m?.id ?? "none"}
                    type="button"
                    className={`wm-row${(m?.id ?? null) === (chosen?.id ?? null) ? " on" : ""}${m ? "" : " none"}`}
                    onClick={() => setBring(m?.id ?? null)}
                  >
                    <Thumb model={m} />
                    <span>
                      <b>{m ? m.name : "None"}</b>
                      {m && <small>{yearOf(m)}</small>}
                    </span>
                    {score != null && <em>{Math.round(score)}</em>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="wm-fill" />
        )}
        <footer className="wm-foot">
          <button type="button" className="fd-primary" onClick={() => onGo(dest, chosen)}>
            Go
          </button>
          <button type="button" className="fd-secondary muted" onClick={onBack}>
            {from === "menu" ? "Menu" : "Stay"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
