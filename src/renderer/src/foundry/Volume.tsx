import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import type { Settings } from "../../../preload/store";
import { setVolumes, useVolumes } from "../audio/engine";
import { Column, Entry } from "./Menus";

const STEP = 0.1;
const NAMES: { key: keyof Settings; label: string }[] = [
  { key: "master", label: "Master" },
  { key: "music", label: "Music" },
  { key: "sfx", label: "Effects" },
];

/** A menu entry with a level bar: left and right (or A and D) step it, the bar takes clicks and drags. */
export function VolumeEntry({
  label,
  value,
  onChange,
  focused,
  onHover,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** For menus that track focus themselves; absent lets the Column do it. */
  focused?: boolean;
  onHover?: () => void;
}) {
  const bar = useRef<HTMLSpanElement>(null);
  const at = (e: PointerEvent) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 20) / 20);
  };
  const key = (e: KeyboardEvent) => {
    const left = e.key === "ArrowLeft" || e.code === "KeyA";
    const right = e.key === "ArrowRight" || e.code === "KeyD";
    if (!left && !right) return;
    e.preventDefault();
    onChange(Math.round(Math.min(1, Math.max(0, value + (right ? STEP : -STEP))) * 10) / 10);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a slider inside a menu entry, not a native range
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      data-nav
      data-focus={focused ? "" : undefined}
      className="fd-entry valued fd-volume"
      onKeyDown={key}
      onMouseEnter={onHover}
    >
      <span>{label}</span>
      <span
        ref={bar}
        className="fd-volume-bar"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) at(e);
        }}
      >
        <i style={{ width: `${value * 100}%` }} />
      </span>
    </div>
  );
}

/** Master, Music and Effects, then Back. */
export function SoundColumn({ onBack }: { onBack: () => void }) {
  const v = useVolumes();
  return (
    <Column key="sound" onBack={onBack}>
      <div className="fd-entries">
        {NAMES.map((n) => (
          <VolumeEntry key={n.key} label={n.label} value={v[n.key]} onChange={(x) => setVolumes({ [n.key]: x })} />
        ))}
      </div>
      <div className="fd-entries">
        <Entry secondary onClick={onBack}>
          Back
        </Entry>
      </div>
    </Column>
  );
}

export const VOLUMES = NAMES;
