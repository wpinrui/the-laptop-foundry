import { useState } from "react";
import type { SavedData, SavedModel } from "../../../preload/store";
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

function yearOf(m: SavedModel): number | undefined {
  const y = (m.build as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : undefined;
}

export function Models({
  data,
  onCompany,
  onNew,
  onOpen,
  onRevise,
  onDelete,
  onReview,
}: {
  data: SavedData;
  onCompany: (name: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRevise: (id: string) => void;
  onDelete: (id: string) => void;
  onReview: (id: string) => void;
}) {
  const [company, setCompany] = useState(data.company ?? "");
  const [confirming, setConfirming] = useState<string | null>(null);
  const models = [...data.models].sort((a, b) => b.updated - a.updated);
  const nameOf = (id: string | undefined) =>
    data.models.find((m) => m.id === id)?.name;

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
        {models.map((m) => (
          <li key={m.id} className="model">
            <button
              type="button"
              className="model-open"
              onClick={() => onOpen(m.id)}
            >
              <b>{m.name}</b>
              <span>
                {[yearOf(m), nameOf(m.revisedFrom)].filter(Boolean).join(", ")}
              </span>
            </button>
            <button type="button" onClick={() => onReview(m.id)}>
              Get reviewed
            </button>
            <button type="button" onClick={() => onRevise(m.id)}>
              Revise
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
                Confirm delete
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(m.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
