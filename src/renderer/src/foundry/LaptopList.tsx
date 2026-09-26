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
  useEffect(() => {
    rows.current?.querySelector<HTMLElement>(".selected")?.focus();
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
        {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys pick a model */}
        <div
          ref={rows}
          className="fd-rows"
          onKeyDown={(e) => {
            const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
            if (!step || models.length === 0) return;
            e.preventDefault();
            onSelect(models[(i + step + models.length) % models.length].m.id);
            setArmed(null);
            requestAnimationFrame(() => {
              const el = rows.current?.querySelector<HTMLElement>(".selected");
              el?.focus();
              el?.scrollIntoView({ block: "nearest" });
            });
          }}
        >
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
