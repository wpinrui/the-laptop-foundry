import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import { type Build, scoresOf } from "../engine";
import { type CampaignState, quarterLabel } from "../engine/campaign";
import { statusOf, usdShort } from "./Release";
import "./foundry.css";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

// The laptop list: the rail of models on the left, the selected one on the
// plinth, its name large at the lower right with the actions under it.

export function yearOf(m: SavedModel): number | undefined {
  const y = (m.build as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : undefined;
}

/** A reviewed model's overall review score, or null if it cannot be scored. */
function overallOf(m: SavedModel, company: string): number | null {
  try {
    return scoresOf({ id: m.id, name: m.name, company, build: m.build as Build }).overall;
  } catch {
    return null;
  }
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
  campaign,
  onEndQuarter,
  short,
  resolving,
}: {
  company: SavedCompany;
  /** Null for a sandbox company. */
  campaign: CampaignState | null;
  onEndQuarter: () => void;
  /** The last quarter's best seller as a short video; absent before any quarter has sold. */
  short?: { quarter: string; name: string; ready: boolean; poster?: string; onWatch: () => void };
  /** The quarter's step running while it resolves, or null. */
  resolving?: { step: number; of: number; name: string } | null;
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
    () => sortedModels(company).map((m) => ({ m, block: buildBlock(m.build), score: m.reviewed ? overallOf(m, company.name) : null })),
    [company],
  );
  const [armed, setArmed] = useState<string | null>(null);
  // A finished campaign keeps its models but makes no new ones.
  const over = !!campaign?.over;
  const rows = useRef<HTMLDivElement>(null);
  const current = models.find((x) => x.m.id === selected) ?? null;
  const i = models.findIndex((x) => x.m.id === selected);
  const last = campaign?.ledger[campaign.ledger.length - 1];
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
          {!over && (
            <button type="button" className="fd-secondary" onClick={onNew}>
              New model
            </button>
          )}
        </header>
        {campaign && !campaign.bankrupt ? (
          <>
            <div className={`fd-clock${over ? " over" : ""}`}>
              <b>{quarterLabel(campaign.now)}</b>
              <span>
                <b>{usd(campaign.cash)}</b>
                {last && <small className={last.profit < 0 ? "short" : "up"}>{usdShort(last.profit)}</small>}
              </span>
            </div>
            {short && (
              <button type="button" className="fd-short" onClick={short.onWatch}>
                <i>{short.poster && <img src={short.poster} alt="" />}</i>
                <span>
                  <small>{short.quarter} short</small>
                  <b>{short.name}</b>
                </span>
                {short.ready ? <em>Watch</em> : <u aria-busy />}
              </button>
            )}
          </>
        ) : null}
        <div ref={rows} className="fd-rows">
          {models.map(({ m, block, score }) => (
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
                  {campaign && !block && <Status campaign={campaign} id={m.id} />}
                </small>
              </span>
              {score !== null && <span className="fd-score">{Math.round(score)}</span>}
            </button>
          ))}
        </div>
        {campaign && !over && (
          <footer className="fd-rail-foot">
            {resolving ? (
              <div className="fd-resolving">
                <i style={{ width: `${((resolving.step + 1) / resolving.of) * 100}%` }} />
                {resolving.name}
              </div>
            ) : (
              <button type="button" className="fd-primary" onClick={onEndQuarter}>
                End {quarterLabel(campaign.now)}
              </button>
            )}
          </footer>
        )}
      </aside>
      {!campaign && (
        <button type="button" className="fd-text fd-corner" onClick={onMenu}>
          Menu
        </button>
      )}
      {current && (
        <section className={`fd-hero fd-in${campaign ? " campaign" : ""}`} key={current.m.id}>
          <h2>{current.m.name}</h2>
          <span>
            {yearOf(current.m)}
            {current.block && <em>{current.block}</em>}
            {campaign && !current.block && <Status campaign={campaign} id={current.m.id} />}
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
            {!over && (
              <button type="button" className="fd-secondary" onClick={() => onDuplicate(current.m.id)}>
                Duplicate
              </button>
            )}
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

function Status({ campaign, id }: { campaign: CampaignState; id: string }) {
  const s = statusOf(campaign, id);
  return <em className={s.warn ? undefined : "muted"}>{s.text}</em>;
}
