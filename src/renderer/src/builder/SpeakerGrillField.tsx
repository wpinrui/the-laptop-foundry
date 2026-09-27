import { useEffect, useRef, useState } from "react";
import {
  type Build,
  type Fit,
  SPEAKER_PATTERNS,
  SPEAKER_PLACES,
  type SpeakerPattern,
  type SpeakerPlace,
  speakerHoles,
  withSpeakerGrill,
} from "../engine";
import type { SetBuild } from "./Parts";
import { Chip, Chips, Label, SliderField } from "./ui";

// Speaker grill: where the sound leaves (none, the deck beside the keyboard,
// or the front wall on older laptops), its hole pattern and its hole size.

const PLACE_NAMES: Record<SpeakerPlace, string> = { none: "None", deck: "Deck", front: "Front" };
const PATTERN_NAMES: Record<SpeakerPattern, string> = { dots: "Dots", slots: "Slots", bars: "Bars", hex: "Hex" };
/** The swatch's patch, mm, and the hole each pattern shows in it. */
const SWATCH = { s: 7, l: 13 };
const SWATCH_HOLE: Record<SpeakerPattern, number> = { dots: 0.9, slots: 0.8, bars: 0.8, hex: 1.2 };

/** A pattern's look, drawn from the engine's own holes: long side across, in the chip's text colour. */
function Swatch({ pattern }: { pattern: SpeakerPattern }) {
  const { polys } = speakerHoles(pattern, SWATCH_HOLE[pattern], 2011, SWATCH.s, SWATCH.l);
  const k = 2;
  return (
    <svg width={26} height={14} viewBox={`0 0 ${SWATCH.l * k} ${SWATCH.s * k}`} aria-hidden>
      {polys.map((p, i) => (
        <polygon
          // biome-ignore lint/suspicious/noArrayIndexKey: holes are fixed for the pattern
          key={i}
          fill="currentColor"
          points={p.map(([s, l]) => `${((l + SWATCH.l / 2) * k).toFixed(2)},${((s + SWATCH.s / 2) * k).toFixed(2)}`).join(" ")}
        />
      ))}
    </svg>
  );
}

export function SpeakerGrillField({
  build: _build,
  fit,
  set,
  onView,
}: {
  build: Build;
  fit: Fit;
  set: SetBuild;
  /** True from a click on the grill's fields until a click elsewhere. */
  onView?: (on: boolean) => void;
}) {
  const sg = fit.shell.speakerGrill;
  // Clicking a grill field frames the grill; a click anywhere else lets the camera go.
  const box = useRef<HTMLDivElement>(null);
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    onView?.(viewing);
    if (!viewing) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setViewing(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [viewing, onView]);
  useEffect(() => () => onView?.(false), [onView]);
  if (!sg) return null;
  const r = sg.range[sg.pattern];
  const places = SPEAKER_PLACES.filter((p) => p !== "front" || sg.frontOffered);
  return (
    <div
      ref={box}
      className="bd-spk-grill"
      onPointerDown={() => setViewing(true)}
    >
      <div className="bd-field">
        <Label>Grill</Label>
        <Chips>
          {places.map((p) => (
            <Chip
              key={p}
              caps
              on={sg.place === p}
              disabled={p !== "none" && !sg.fits[p]}
              onClick={() => set((b) => withSpeakerGrill(b, { place: p }))}
            >
              {PLACE_NAMES[p]}
            </Chip>
          ))}
        </Chips>
      </div>
      {sg.place !== "none" && (
        <>
          <div className="bd-field">
            <Label>Pattern</Label>
            <Chips>
              {SPEAKER_PATTERNS.map((p) => (
                <button
                  type="button"
                  key={p}
                  disabled={!sg.range[p].ok}
                  className={sg.pattern === p ? "bd-chip bd-visual caps on" : "bd-chip bd-visual caps"}
                  onClick={() => set((b) => withSpeakerGrill(b, { pattern: p }))}
                >
                  <Swatch pattern={p} />
                  {PATTERN_NAMES[p]}
                </button>
              ))}
            </Chips>
          </div>
          {r.max > r.min && (
            <SliderField
              label="Hole size"
              value={sg.hole}
              digits={1}
              unit="mm"
              min={r.min}
              max={r.max}
              step={0.1}
              onChange={(v) => set((b) => withSpeakerGrill(b, { hole: v }))}
            />
          )}
        </>
      )}
    </div>
  );
}
