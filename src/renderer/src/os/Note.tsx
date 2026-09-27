import { type ChangeEvent, useCallback, useRef, useState } from "react";
import "./note.css";

// A plain text editor, one look in every era, in the same shape as Fox: a
// hook holding the state and a component drawing it. Documents save with the
// open company, passed in and written back through onSave.

export interface NoteDoc {
  name: string;
  text: string;
  updated: number;
}

const BLANK: NoteDoc = { name: "", text: "", updated: 0 };

/** The editor's open document and the company's saved ones. */
export function useNote(saved: NoteDoc[] = [], onSave?: (docs: NoteDoc[]) => void) {
  const [docs, setDocs] = useState<NoteDoc[]>(saved);
  const [doc, setDoc] = useState<NoteDoc>(BLANK);

  const setText = useCallback((text: string) => setDoc((d) => ({ ...d, text })), []);
  const setName = useCallback((name: string) => setDoc((d) => ({ ...d, name })), []);
  const newDoc = useCallback(() => setDoc(BLANK), []);

  const save = useCallback(() => {
    const name = doc.name.trim() || "Untitled.txt";
    const next = { name, text: doc.text, updated: Date.now() };
    setDocs((ds) => {
      const at = ds.findIndex((x) => x.name === name);
      const nextDocs = at < 0 ? [...ds, next] : ds.map((x, i) => (i === at ? next : x));
      onSave?.(nextDocs);
      return nextDocs;
    });
    setDoc(next);
  }, [doc, onSave]);

  const open = useCallback(
    (name: string) => {
      const found = docs.find((x) => x.name === name);
      if (found) setDoc(found);
    },
    [docs],
  );

  return { docs, doc, setText, setName, newDoc, save, open };
}

export type Note = ReturnType<typeof useNote>;

// ------------------------------------------------------------------ icon

/** A spiral notepad with a pencil, no real product's mark. */
export function NoteIcon({ s }: { s: number }) {
  return (
    <svg className="nt-icon" viewBox="0 0 48 48" width={s} height={s} aria-hidden>
      <rect x="8" y="10" width="30" height="34" rx="2.5" fill="#fefefe" stroke="#9a9a9a" strokeWidth="1.5" />
      {[15, 20, 25].map((x) => (
        <circle key={x} cx={x} cy="10" r="1.6" fill="#8a8f98" />
      ))}
      <path d="M13 20h20M13 25h20M13 30h20M13 35h13" stroke="#4a86c8" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 4.5 40 14.5l-3.2 3.2-10-10Z" fill="#ffd34d" stroke="#c99a20" strokeWidth="1" />
      <path d="M27.5 7 30 4.5l3 3-2.5 2.5Z" fill="#c99a20" />
    </svg>
  );
}

// ------------------------------------------------------------------ app

/** Line and column of a caret in some text, 1-based as an editor reads it. */
function caretOf(text: string, at: number): { line: number; col: number } {
  const head = text.slice(0, at);
  const lines = head.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

export function NoteApp({ note }: { note: Note }) {
  const { docs, doc } = note;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState({ line: 1, col: 1 });

  const place = () => {
    const el = ref.current;
    if (el) setCaret(caretOf(el.value, el.selectionStart));
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    note.setText(e.target.value);
    setCaret(caretOf(e.target.value, e.target.selectionStart));
  };

  const openDoc = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!e.target.value) return;
    note.open(e.target.value);
    e.target.value = "";
    setCaret({ line: 1, col: 1 });
  };

  return (
    <div className="os-note">
      <div className="nt-bar">
        <button
          type="button"
          className="nt-btn"
          onClick={() => {
            note.newDoc();
            setCaret({ line: 1, col: 1 });
          }}
        >
          New
        </button>
        <button type="button" className="nt-btn" onClick={note.save}>
          Save
        </button>
        <select className="nt-open" aria-label="Open" value="" onChange={openDoc} disabled={docs.length === 0}>
          <option value="" disabled>
            Open
          </option>
          {docs.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          className="nt-name"
          aria-label="Document name"
          placeholder="Untitled.txt"
          value={doc.name}
          spellCheck={false}
          onChange={(e) => note.setName(e.target.value)}
        />
      </div>
      <textarea
        ref={ref}
        className="nt-area"
        aria-label="Document text"
        value={doc.text}
        spellCheck={false}
        wrap="soft"
        onChange={onChange}
        onClick={place}
        onKeyUp={place}
        onSelect={place}
      />
      <div className="nt-status">
        <span>
          Ln {caret.line}, Col {caret.col}
        </span>
      </div>
    </div>
  );
}
