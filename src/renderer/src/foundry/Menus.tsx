import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SavedCompany } from "../../../preload/store";
import "./foundry.css";

// The left-column menus: start, new company, load company, settings and the
// model name step. Entries take focus on hover, so the focused entry is the
// only accent-coloured one; the arrow keys move between them.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function laptopCount(n: number): string {
  return `${n} ${n === 1 ? "laptop" : "laptops"}`;
}

/** Arrow keys move focus between the column's entries; Escape goes back. */
export function Column({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard navigation for the menu within
    <div
      ref={ref}
      className="fd-column fd-in"
      onKeyDown={(e) => {
        if (e.key === "Escape" && onBack) {
          e.preventDefault();
          onBack();
          return;
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const all = [...(ref.current?.querySelectorAll<HTMLElement>("[data-nav]:not(:disabled)") ?? [])];
        if (all.length === 0) return;
        e.preventDefault();
        const i = all.indexOf(document.activeElement as HTMLElement);
        const step = e.key === "ArrowDown" ? 1 : -1;
        all[(i + step + all.length) % all.length]?.focus();
      }}
    >
      {children}
    </div>
  );
}

export function Entry({
  children,
  sub,
  secondary,
  valued,
  onClick,
  autoFocus,
}: {
  children: ReactNode;
  sub?: ReactNode;
  secondary?: boolean;
  valued?: boolean;
  onClick: () => void;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      data-nav
      className={`fd-entry${secondary ? " secondary" : ""}${valued ? " valued" : ""}`}
      onMouseEnter={(e) => e.currentTarget.focus()}
      onClick={onClick}
      // biome-ignore lint/a11y/noAutofocus: the first entry of a menu takes focus
      autoFocus={autoFocus}
    >
      <span>{children}</span>
      {sub !== undefined && <small>{sub}</small>}
    </button>
  );
}

export function StartMenu({
  latest,
  onContinue,
  onNew,
  onLoad,
  onSettings,
}: {
  latest: SavedCompany | null;
  onContinue: () => void;
  onNew: () => void;
  onLoad: () => void;
  onSettings: () => void;
}) {
  return (
    <Column>
      <h1 className="fd-title">
        The Laptop
        <br />
        Foundry
      </h1>
      <div className="fd-entries">
        {latest && (
          <Entry sub={latest.name} onClick={onContinue} autoFocus>
            Continue
          </Entry>
        )}
        <Entry onClick={onNew} autoFocus={!latest}>
          New company
        </Entry>
        <Entry onClick={onLoad}>Load company</Entry>
      </div>
      <div className="fd-entries">
        <Entry secondary onClick={onSettings}>
          Settings
        </Entry>
        <Entry secondary onClick={() => window.api.quit()}>
          Quit
        </Entry>
      </div>
    </Column>
  );
}

/** A large typed name on an accent underline with a block caret. */
function NameField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="fd-field">
      <span className="fd-label">{label}</span>
      <span className="fd-name">
        <input
          value={value}
          maxLength={60}
          spellCheck={false}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onSelect={(e) => {
            // The block caret is drawn after the text, so the cursor stays there.
            const t = e.currentTarget;
            if (t.selectionStart === t.selectionEnd && t.selectionEnd !== t.value.length)
              t.setSelectionRange(t.value.length, t.value.length);
          }}
          // biome-ignore lint/a11y/noAutofocus: the only field on the screen
          autoFocus
        />
        <span className="fd-caret" aria-hidden>
          <span>{value}</span>
          <i />
        </span>
      </span>
    </label>
  );
}

export function NewCompany({ onStart, onBack }: { onStart: (name: string) => void; onBack: () => void }) {
  const [name, setName] = useState("");
  return (
    <Column onBack={onBack}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onStart(name.trim());
        }}
      >
        <NameField label="Company" value={name} onChange={setName} />
        <div className="fd-actions">
          <button type="submit" className="fd-primary" disabled={!name.trim()}>
            Start
          </button>
          <button type="button" className="fd-text" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </Column>
  );
}

export function LoadCompany({
  companies,
  selected,
  onSelect,
  onLoad,
  onDelete,
  onBack,
}: {
  companies: SavedCompany[];
  selected: string | null;
  onSelect: (id: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  const i = companies.findIndex((c) => c.id === selected);
  useEffect(() => {
    rows.current?.querySelector<HTMLElement>(".selected")?.focus();
  }, []);
  return (
    <Column onBack={onBack}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys pick a save */}
      <div
        ref={rows}
        className="fd-saves"
        onKeyDown={(e) => {
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (!step || companies.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          const next = companies[(i + step + companies.length) % companies.length];
          onSelect(next.id);
          setArmed(null);
          requestAnimationFrame(() => rows.current?.querySelector<HTMLElement>(".selected")?.focus());
        }}
      >
        {companies.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`fd-save${c.id === selected ? " selected" : ""}`}
            onClick={() => {
              if (c.id === selected) onLoad(c.id);
              else {
                onSelect(c.id);
                setArmed(null);
              }
            }}
          >
            <b>{c.name}</b>
            <span>
              {laptopCount(c.models.length)}
              <br />
              {formatDate(c.played)}
            </span>
          </button>
        ))}
      </div>
      <div className="fd-actions">
        <button type="button" className="fd-primary" disabled={!selected} onClick={() => selected && onLoad(selected)}>
          Load
        </button>
        <button
          type="button"
          className="fd-text"
          disabled={!selected}
          onBlur={() => setArmed(null)}
          onClick={() => {
            if (!selected) return;
            if (armed === selected) {
              setArmed(null);
              onDelete(selected);
            } else setArmed(selected);
          }}
        >
          {armed === selected ? "Confirm" : "Delete"}
        </button>
        <button type="button" className="fd-text" onClick={onBack}>
          Back
        </button>
      </div>
    </Column>
  );
}

export function SettingsMenu({
  sound,
  onSound,
  onBack,
}: {
  sound: boolean;
  onSound: (on: boolean) => void;
  onBack: () => void;
}) {
  return (
    <Column onBack={onBack}>
      <div className="fd-entries">
        <Entry valued sub={sound ? "On" : "Off"} onClick={() => onSound(!sound)} autoFocus>
          Sound
        </Entry>
      </div>
      <div className="fd-entries">
        <Entry secondary onClick={onBack}>
          Back
        </Entry>
      </div>
    </Column>
  );
}

/** Every new or duplicated model is named before the builder opens. */
export function NameStep({
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
    <Column onBack={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <NameField label="Model" value={name} onChange={setName} />
        <div className="fd-actions">
          <button type="submit" className="fd-primary" disabled={!name.trim()}>
            Create
          </button>
          <button type="button" className="fd-secondary" onClick={() => setName(roll())}>
            Random
          </button>
          <button type="button" className="fd-text" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Column>
  );
}
