import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

// A full colour picker: a saturation and value square, a hue strip, the hex
// value (editable) and the colours used most recently. Any colour is allowed.

type HSV = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function rgbToHsv([r, g, b]: [number, number, number]): HSV {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb([h, s, v]: HSV): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s.trim());

// Colours used this session, most recent first, shared by every picker.
const recent: string[] = [];
function remember(hex: string) {
  const i = recent.indexOf(hex);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(hex);
  recent.length = Math.min(recent.length, 6);
}

export function ColourPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  /** A shorter colour square, for tight columns. */
  compact?: boolean;
}) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value)));
  const [text, setText] = useState<string | null>(null);
  const own = useRef(value);
  // Follow the value when it changes from outside (another group or piece picked).
  useEffect(() => {
    if (value.toUpperCase() !== own.current.toUpperCase()) {
      own.current = value;
      setHsv(rgbToHsv(hexToRgb(value)));
    }
  }, [value]);
  const emit = (next: HSV) => {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    own.current = hex;
    onChange(hex);
  };
  const drag = (el: HTMLElement, e: ReactPointerEvent, f: (x: number, y: number) => void) => {
    if (disabled) return;
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      f(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      remember(own.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [h, s, v] = hsv;
  const hueHex = rgbToHex(hsvToRgb([h, 1, 1]));
  const hex = rgbToHex(hsvToRgb(hsv));
  return (
    <div className={["bd-picker", disabled ? "off" : "", compact ? "compact" : ""].join(" ")}>
      <div
        className="bd-sv"
        style={{ "--hue": hueHex } as CSSProperties}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y) => emit([h, x, 1 - y]))}
      >
        <i style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
      </div>
      <div className="bd-hue" onPointerDown={(e) => drag(e.currentTarget, e, (x) => emit([x * 359.9, s, v]))}>
        <i style={{ left: `${(h / 360) * 100}%` }} />
      </div>
      <div className="bd-hex">
        <i className="bd-swatch" style={{ background: hex }} />
        <input
          className="bd-input"
          aria-label="hex colour"
          value={text ?? hex}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const t = (text ?? "").trim();
            const full = t.startsWith("#") ? t : `#${t}`;
            if (text !== null && isHex(full)) {
              own.current = full.toUpperCase();
              setHsv(rgbToHsv(hexToRgb(full)));
              onChange(full.toUpperCase());
              remember(full.toUpperCase());
            }
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      {recent.length > 0 && (
        <div className="bd-swatches">
          {recent.map((c) => (
            <button
              type="button"
              key={c}
              title={c}
              className="bd-swatch big"
              style={{ background: c }}
              onClick={() => {
                own.current = c;
                setHsv(rgbToHsv(hexToRgb(c)));
                onChange(c);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
