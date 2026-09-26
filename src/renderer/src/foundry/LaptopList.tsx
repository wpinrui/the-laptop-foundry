import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import { rollScores } from "../engine";
import "./foundry.css";

// The laptop list: the rail of models on the left, the selected one on the
// plinth, its name large at the lower right with the actions under it.

export function yearOf(m: SavedModel): number | undefined {
  const y = (m.build as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : undefined;
}

/** Models, most recently changed first. */
export function sortedModels(c: SavedCompany): SavedModel[] {
  return [...c.models].sort((a, b) => b.updated - a.updated);
}

export function LaptopList({
  company,
  selected,
  onSelect,
  onMenu,
  onNew,
  onUse,
  onReview,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  company: SavedCompany;
  selected: string | null;
  onSelect: (id: string) => void;
  onMenu: () => void;
  onNew: () => void;
  onUse: (id: string) => void;
  onReview: (id: string) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const models = useMemo(
    () => sortedModels(company).map((m) => ({ m, block: buildBlock(m.build) })),
    [company],
  );
  const [armed, setArmed] = useState<string | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  const current = models.find((x) => x.m.id === selected) ?? null;
  const i = models.findIndex((x) => x.m.id === selected);
  const keys = useRef({ models, i, current, onSelect, onUse, onMenu });
  keys.current = { models, i, current, onSelect, onUse, onMenu };
  useEffect(() => {
    // Up and down pick a model, Enter uses it, Escape goes to the menu.
    const key = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === "Escape") {
        e.preventDefault();
        k.onMenu();
        return;
      }
      const step = e.key === "ArrowDown" || e.code === "KeyS" ? 1 : e.key === "ArrowUp" || e.code === "KeyW" ? -1 : 0;
      if (step && k.models.length > 0) {
        e.preventDefault();
        setArmed(null);
        k.onSelect(k.models[(k.i + step + k.models.length) % k.models.length].m.id);
        requestAnimationFrame(() =>
          rows.current?.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" }),
        );
        return;
      }
      const onButton = document.activeElement instanceof HTMLButtonElement;
      if (e.key === "Enter" && !onButton && k.current && !k.current.block) {
        e.preventDefault();
        k.onUse(k.current.m.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <>
      <div className="fd-scrim-bottom" />
      <aside className="fd-rail fd-in">
        <header className="fd-rail-head">
          <h1>{company.name}</h1>
          <button type="button" className="fd-secondary" onClick={onNew}>
            New model
          </button>
        </header>
        <div ref={rows} className="fd-rows">
          {models.map(({ m, block }) => (
            <button
              key={m.id}
              type="button"
              className={`fd-row${m.id === selected ? " selected" : ""}`}
              onClick={() => {
                onSelect(m.id);
                setArmed(null);
              }}
              onDoubleClick={() => onOpen(m.id)}
            >
              <span>
                <b>{m.name}</b>
                <small>
                  {yearOf(m)}
                  {block && <em>{block}</em>}
                </small>
              </span>
              {m.reviewed && <span className="fd-score">{Math.round(rollScores(m.id).overall)}</span>}
            </button>
          ))}
        </div>
      </aside>
      <button type="button" className="fd-text fd-corner" onClick={onMenu}>
        Menu
      </button>
      {current && (
        <section className="fd-hero fd-in" key={current.m.id}>
          <h2>{current.m.name}</h2>
          <span>
            {yearOf(current.m)}
            {current.block && <em>{current.block}</em>}
          </span>
          <div className="fd-bar">
            <button
              type="button"
              className="fd-primary"
              disabled={!!current.block}
              onClick={() => onUse(current.m.id)}
            >
              Use
            </button>
            <button
              type="button"
              className="fd-secondary"
              disabled={!current.m.reviewed && !!current.block}
              onClick={() => onReview(current.m.id)}
            >
              {current.m.reviewed ? "Read review" : "Get reviewed"}
            </button>
            <button type="button" className="fd-secondary" onClick={() => onOpen(current.m.id)}>
              Open
            </button>
            <button type="button" className="fd-secondary" onClick={() => onDuplicate(current.m.id)}>
              Duplicate
            </button>
            <button
              type="button"
              className="fd-secondary muted"
              onBlur={() => setArmed(null)}
              onClick={() => {
                if (armed === current.m.id) {
                  setArmed(null);
                  onDelete(current.m.id);
                } else setArmed(current.m.id);
              }}
            >
              {armed === current.m.id ? "Confirm" : "Delete"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
