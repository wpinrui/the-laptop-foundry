import { useEffect, useRef, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import { sortedModels } from "../foundry/LaptopList";
import { Column, Entry } from "../foundry/Menus";
import "../foundry/foundry.css";
import "./map.css";

// The world map: a plain street plan with the three places the player can
// go. The workshop and the cafe first ask which laptop comes along.

export type Place = "workshop" | "cafe";

const NAME: Record<Place | "courts", string> = { workshop: "Workshop", cafe: "Cafe", courts: "Courts" };

/** The laptops that can come along: any model to the workshop, only a working one to the cafe. */
function carried(company: SavedCompany, place: Place): SavedModel[] {
  const all = sortedModels(company);
  return place === "workshop" ? all : all.filter((m) => !buildBlock(m.build));
}

function Picker({
  place,
  models,
  onPick,
  onBack,
}: {
  place: Place;
  models: SavedModel[];
  onPick: (m: SavedModel | null) => void;
  onBack: () => void;
}) {
  return (
    <div className="wm-pick">
      <div className="fd-scrim" />
      <Column onBack={onBack}>
        <h2 className="wm-pick-title">{NAME[place]}</h2>
        <div className="fd-entries wm-pick-list">
          <Entry onClick={() => onPick(null)} autoFocus>
            Empty handed
          </Entry>
          {models.map((m) => (
            <Entry key={m.id} sub={(m.build as { year?: number }).year} onClick={() => onPick(m)}>
              {m.name}
            </Entry>
          ))}
        </div>
        <div className="fd-actions">
          <button type="button" className="fd-text" onClick={onBack}>
            Back
          </button>
        </div>
      </Column>
    </div>
  );
}

export function WorldMap({
  company,
  onGo,
  onCourts,
  onModels,
  onMenu,
}: {
  company: SavedCompany;
  onGo: (place: Place, model: SavedModel | null) => void;
  /** Absent while the store cannot be entered. */
  onCourts?: () => void;
  onModels: () => void;
  onMenu: () => void;
}) {
  const [picking, setPicking] = useState<Place | null>(null);
  const live = useRef({ picking, onMenu });
  live.current = { picking, onMenu };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !live.current.picking) {
        e.preventDefault();
        live.current.onMenu();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const place = (p: Place | "courts", onClick: (() => void) | undefined) => (
    <button type="button" className={`wm-place wm-${p}`} disabled={!onClick} onClick={onClick}>
      <span>{NAME[p]}</span>
    </button>
  );

  return (
    <div className="fd wm">
      <div className="wm-map fd-in" inert={picking ? true : undefined}>
        <i className="wm-road wm-main" />
        <i className="wm-road wm-side" />
        {place("workshop", () => setPicking("workshop"))}
        {place("cafe", () => setPicking("cafe"))}
        {place("courts", onCourts)}
      </div>
      <div className="wm-top" inert={picking ? true : undefined}>
        <span className="wm-company">{company.name}</span>
        <button type="button" className="fd-text" onClick={onModels}>
          Models
        </button>
        <button type="button" className="fd-text" onClick={onMenu}>
          Menu
        </button>
      </div>
      {picking && (
        <Picker
          key={picking}
          place={picking}
          models={carried(company, picking)}
          onPick={(m) => onGo(picking, m)}
          onBack={() => setPicking(null)}
        />
      )}
    </div>
  );
}
