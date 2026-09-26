import { useMemo, useState } from "react";
import type { SavedData, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import type { Build } from "../engine";
import { usePhotos } from "../viewer/Photos";
import "./app.css";

/** First launch: the player names the company. */
export function CompanySetup({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="screen setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onDone(name.trim());
      }}
    >
      <label className="field">
        <span>Company</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="company name"
          // biome-ignore lint/a11y/noAutofocus: the only field on the screen
          autoFocus
        />
      </label>
      <button type="submit" className="primary" disabled={!name.trim()}>
        Start
      </button>
    </form>
  );
}

/** Every new or duplicated model is named by the player before it exists. */
export function NameModel({
  roll,
  onCreate,
  onCancel,
}: {
  roll: () => string;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="screen setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <label className="field">
        <span>Model name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="model name"
          // biome-ignore lint/a11y/noAutofocus: the only field on the screen
          autoFocus
        />
      </label>
      <button type="button" onClick={() => setName(roll())}>
        Random
      </button>
      <button type="submit" className="primary" disabled={!name.trim()}>
        Create
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function yearOf(m: SavedModel): number | undefined {
  const y = (m.build as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : undefined;
}

export function Models({
  data,
  onCompany,
  onNew,
  onOpen,
  onDuplicate,
  onDelete,
  onReview,
  onUse,
}: {
  data: SavedData;
  onCompany: (name: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReview: (id: string) => void;
  onUse: (id: string) => void;
}) {
  const [company, setCompany] = useState(data.company ?? "");
  const [confirming, setConfirming] = useState<string | null>(null);
  const models = useMemo(
    () =>
      [...data.models]
        .sort((a, b) => b.updated - a.updated)
        .map((m) => ({ m, block: buildBlock(m.build) })),
    [data.models],
  );
  // Thumbnails are taken one model at a time, top of the list first.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const next = models.find(({ m }) => !thumbs[`${m.id}:${m.updated}`])?.m;
  const { photos, shoot } = usePhotos(
    next ? `${next.id}:thumb` : null,
    next ? (next.build as Build) : null,
    ["hero"],
    [320, 200],
  );
  if (next && photos && !thumbs[`${next.id}:${next.updated}`])
    setThumbs((t) => ({ ...t, [`${next.id}:${next.updated}`]: photos[0] }));

  return (
    <div className="screen models">
      <header className="models-head">
        <input
          className="company"
          value={company}
          aria-label="company name"
          onChange={(e) => setCompany(e.target.value)}
          onBlur={() => {
            if (company.trim() && company.trim() !== data.company)
              onCompany(company.trim());
            else setCompany(data.company ?? "");
          }}
        />
        <button type="button" className="primary" onClick={onNew}>
          New model
        </button>
      </header>
      <ul className="model-list">
        {models.map(({ m, block }) => (
          <li key={m.id} className="model">
            {thumbs[`${m.id}:${m.updated}`] ? (
              <img className="model-thumb" src={thumbs[`${m.id}:${m.updated}`]} alt="" />
            ) : (
              <span className="model-thumb" />
            )}
            <button
              type="button"
              className="model-open"
              onClick={() => onOpen(m.id)}
            >
              <b>{m.name}</b>
              <span>{yearOf(m)}</span>
              {block && <span className="model-block">{block}</span>}
            </button>
            <button
              type="button"
              disabled={!!block}
              onClick={() => onUse(m.id)}
            >
              Use it
            </button>
            <button
              type="button"
              disabled={!m.reviewed && !!block}
              onClick={() => onReview(m.id)}
            >
              {m.reviewed ? "Read review" : "Get reviewed"}
            </button>
            <button type="button" onClick={() => onDuplicate(m.id)}>
              Duplicate
            </button>
            {confirming === m.id ? (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirming(null);
                  onDelete(m.id);
                }}
                onBlur={() => setConfirming(null)}
              >
                Confirm
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(m.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {shoot}
    </div>
  );
}
