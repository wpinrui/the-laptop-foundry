import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The builder's one dropdown: a square Foundry trigger that opens a list over
// the scene. The list is portalled to the .fd root so the scrolling column
// cannot clip it. Keyboard: Enter, Space or the arrows open it; the arrows,
// Home and End move; Enter picks; Escape and Tab close.

export interface DropOption {
  key: string;
  label: ReactNode;
  /** Muted text on the right, such as a ppi or a price. */
  aside?: ReactNode;
  disabled?: boolean;
  /** Shown in the option's own style, such as a font preview. */
  style?: CSSProperties;
  /** A heading shown above the first option of each run of the same group. */
  group?: string;
}

export function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
  warn,
  disabled,
}: {
  /** The accessible name. */
  label: string;
  value: string | null;
  options: DropOption[];
  onChange: (key: string) => void;
  placeholder?: ReactNode;
  warn?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});
  const selected = options.find((o) => o.key === value);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const show = () => {
    if (disabled) return;
    const at = options.findIndex((o) => o.key === value && !o.disabled);
    setActive(at >= 0 ? at : (enabled[0] ?? 0));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.key);
    close();
  };

  // Place the list under the trigger, or above it when the room below is short.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const root = trigger.current.closest(".fd") ?? document.body;
    const r = trigger.current.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const below = box.bottom - r.bottom - 8;
    const above = r.top - box.top - 8;
    const up = below < 240 && above > below;
    setPlace({
      left: r.left - box.left,
      width: r.width,
      ...(up ? { bottom: box.bottom - r.top + 2, maxHeight: above } : { top: r.bottom - box.top + 2, maxHeight: below }),
    });
    list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const away = () => close(false);
    const scrolled = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close(false);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", scrolled, true);
    };
  });

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (step: number) => {
    if (enabled.length === 0) return;
    const at = enabled.indexOf(active);
    const next = at < 0 ? 0 : Math.min(enabled.length - 1, Math.max(0, at + step));
    setActive(enabled[next]);
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Home":
        setActive(enabled[0] ?? 0);
        break;
      case "End":
        setActive(enabled[enabled.length - 1] ?? 0);
        break;
      case "Enter":
      case " ":
        pick(active);
        break;
      case "Escape":
        close();
        break;
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  };

  const root = open ? (trigger.current?.closest(".fd") ?? document.body) : null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={["bd-drop", open ? "open" : "", warn ? "warn" : ""].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKey}
      >
        <span className="bd-drop-value" style={selected?.style}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.aside !== undefined && <small>{selected.aside}</small>}
        <i className="bd-drop-caret" />
      </button>
      {root &&
        createPortal(
          <div
            ref={list}
            className="bd-drop-list"
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={`${id}-${active}`}
            style={place}
            onKeyDown={onListKey}
          >
            {options.map((o, i) => [
              o.group && o.group !== options[i - 1]?.group && (
                <div key={`group:${o.group}`} className="bd-drop-group" role="presentation">
                  {o.group}
                </div>
              ),
              <div
                key={o.key}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.key === value}
                aria-disabled={o.disabled || undefined}
                className={["bd-drop-item", o.key === value ? "on" : "", i === active ? "active" : "", o.disabled ? "off" : ""].join(" ")}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onClick={() => pick(i)}
              >
                <span style={o.style}>{o.label}</span>
                {o.aside !== undefined && <small>{o.aside}</small>}
              </div>,
            ])}
          </div>,
          root,
        )}
    </>
  );
}
