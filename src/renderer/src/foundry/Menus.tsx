import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SavedCompany } from "../../../preload/store";
import { ASSETS } from "../viewer/reviewScenes";
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

const typing = () => document.activeElement instanceof HTMLInputElement;

/**
 * Up and down (arrows, W and S) move among the column's entries, Enter or
 * Space picks one, Escape goes back. There is always exactly one focused
 * entry: the first on open, then wherever the keys or the mouse last put it.
 * Leaving an entry with the mouse keeps it focused.
 */
export function Column({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const entries = () => [...root.querySelectorAll<HTMLElement>("[data-nav]:not(:disabled)")];
    let current: HTMLElement | null = null;
    const mark = (el: HTMLElement | undefined) => {
      if (!el) return;
      for (const e of root.querySelectorAll("[data-focus]")) e.removeAttribute("data-focus");
      el.setAttribute("data-focus", "");
      current = el;
      if (document.activeElement !== el && !typing()) el.focus({ preventScroll: true });
    };
    mark(entries()[0]);
    const focusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches("[data-nav]")) mark(t);
    };
    const over = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-nav]");
      if (t && root.contains(t) && !t.matches(":disabled") && t !== current) mark(t);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (back.current) {
          e.preventDefault();
          back.current();
        }
        return;
      }
      if (typing()) return;
      const down = e.key === "ArrowDown" || e.code === "KeyS";
      const up = e.key === "ArrowUp" || e.code === "KeyW";
      if (down || up) {
        const all = entries();
        if (all.length === 0) return;
        e.preventDefault();
        const i = current ? all.indexOf(current) : -1;
        mark(all[(i + (down ? 1 : -1) + all.length) % all.length]);
        return;
      }
      // A focused button activates itself; otherwise the focused entry is clicked here.
      if ((e.key === "Enter" || e.key === " ") && current && document.activeElement !== current) {
        e.preventDefault();
        current.click();
      }
    };
    root.addEventListener("focusin", focusIn);
    root.addEventListener("mouseover", over);
    window.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("focusin", focusIn);
      root.removeEventListener("mouseover", over);
      window.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div ref={ref} className="fd-column fd-in">
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
  const keys = useRef({ companies, i, selected, onSelect, onLoad });
  keys.current = { companies, i, selected, onSelect, onLoad };
  useEffect(() => {
    // Up and down pick a save, Enter loads it. Escape is the column's Back.
    const key = (e: KeyboardEvent) => {
      const k = keys.current;
      const step = e.key === "ArrowDown" || e.code === "KeyS" ? 1 : e.key === "ArrowUp" || e.code === "KeyW" ? -1 : 0;
      if (step && k.companies.length > 0) {
        e.preventDefault();
        setArmed(null);
        const next = k.companies[(k.i + step + k.companies.length) % k.companies.length];
        k.onSelect(next.id);
        return;
      }
      const onButton = document.activeElement instanceof HTMLButtonElement;
      if (e.key === "Enter" && !onButton && k.selected) {
        e.preventDefault();
        k.onLoad(k.selected);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <Column onBack={onBack}>
      <div ref={rows} className="fd-saves">
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
  const [credits, setCredits] = useState(false);
  if (credits)
    return (
      <Column key="credits" onBack={() => setCredits(false)}>
        <ul className="fd-credits">
          {Object.values(ASSETS).map((a) => (
            <li key={a.name}>
              <span>{a.name}</span>
              <small>{a.by}</small>
            </li>
          ))}
          <li>
            <span>Poly Haven</span>
            <small>CC0</small>
          </li>
          <li>
            <span>Space Mono</span>
            <small>The Space Mono Project Authors, SIL Open Font License 1.1</small>
          </li>
          <li>
            <span>Rubik</span>
            <small>The Rubik Project Authors, SIL Open Font License 1.1</small>
          </li>
          <li>
            <span>Source Sans 3</span>
            <small>Adobe, SIL Open Font License 1.1</small>
          </li>
        </ul>
        <div className="fd-entries">
          <Entry secondary onClick={() => setCredits(false)} autoFocus>
            Back
          </Entry>
        </div>
      </Column>
    );
  return (
    <Column key="settings" onBack={onBack}>
      <div className="fd-entries">
        <Entry valued sub={sound ? "On" : "Off"} onClick={() => onSound(!sound)} autoFocus>
          Sound
        </Entry>
        <Entry secondary onClick={() => setCredits(true)}>
          Credits
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
