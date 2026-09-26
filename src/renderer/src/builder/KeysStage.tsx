import type { Build, KeySpec } from "../engine";
import { token } from "../viewer/theme";
import { ColourPicker } from "./ColourPicker";
import type { StageProps } from "./Stages";
import { Card, Chip, Chips, Label, SliderField, TraySep } from "./ui";

// The Keys stage: keycap shape, three colour groups (letters, modifiers, and
// the accent keys Esc and Enter) and the legends' colour, font, alignment,
// case, size and weight. Any colour is allowed in every year.

export type KeyGroup = "letters" | "mods" | "accent" | "legend";

const GROUPS: [KeyGroup, string][] = [
  ["letters", "Letters"],
  ["mods", "Modifiers"],
  ["accent", "Accent"],
  ["legend", "Legend"],
];

export const LEGEND_FONTS: [string, string][] = [
  ["IBM Plex Sans", "Plex"],
  ["Space Mono", "Space"],
  ["Rubik", "Rubik"],
  ["Barlow Condensed", "Barlow"],
];

/** The Keys stage starts from the stock caps. */
export function stockKeys(): KeySpec {
  const cap = token("keycap").toUpperCase();
  return {
    shape: "rounded",
    colours: { letters: cap, mods: cap, accent: cap },
    legend: { font: "IBM Plex Sans", colour: token("keycap-legend").toUpperCase(), align: "c", case: "as", size: 1, weight: 500 },
  };
}

function withKeys(b: Build, f: (k: KeySpec) => KeySpec): Build {
  return { ...b, keys: f(b.keys ?? stockKeys()) };
}

export function KeysColumn({ build, set, locked, group, onGroup }: StageProps & { group: KeyGroup; onGroup: (g: KeyGroup) => void }) {
  const k = build.keys ?? stockKeys();
  const value = group === "legend" ? k.legend.colour : k.colours[group];
  return (
    <>
      <Chips>
        {GROUPS.map(([g, name]) => (
          <Chip caps key={g} on={g === group} onClick={() => onGroup(g)}>
            {name}
          </Chip>
        ))}
      </Chips>
      <ColourPicker
        value={value}
        disabled={locked}
        onChange={(hex) =>
          set((b) =>
            withKeys(b, (x) =>
              group === "legend" ? { ...x, legend: { ...x.legend, colour: hex } } : { ...x, colours: { ...x.colours, [group]: hex } },
            ),
          )
        }
      />
      {group === "legend" && (
        <>
          <div className="bd-field">
            <Label>Case</Label>
            <Chips>
              {(
                [
                  ["as", "As is"],
                  ["upper", "Capitals"],
                  ["lower", "Lower case"],
                ] as const
              ).map(([c, name]) => (
                <Chip caps key={c} on={k.legend.case === c} onClick={() => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, case: c } })))}>
                  {name}
                </Chip>
              ))}
            </Chips>
          </div>
          <SliderField
            label="Size"
            value={Math.round(k.legend.size * 100)}
            unit="%"
            min={60}
            max={140}
            onChange={(v) => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, size: v / 100 } })))}
          />
          <div className="bd-field">
            <Label>Weight</Label>
            <Chips>
              {[400, 500, 700].map((w) => (
                <Chip key={w} on={k.legend.weight === w} onClick={() => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, weight: w } })))}>
                  {w === 400 ? "Regular" : w === 500 ? "Medium" : "Bold"}
                </Chip>
              ))}
            </Chips>
          </div>
        </>
      )}
    </>
  );
}

const ALIGN_NEXT = { c: "tl", tl: "bl", bl: "c" } as const;

export function KeysTray({ build, set }: StageProps) {
  const k = build.keys ?? stockKeys();
  const radius = { square: "2px", rounded: "6px", round: "50%" } as const;
  return (
    <>
      {(["square", "rounded", "round"] as const).map((shape) => (
        <Card
          key={shape}
          width={112}
          on={!!build.keys && k.shape === shape}
          top={
            <span className="bd-keycaps">
              {[k.colours.letters, k.colours.mods, k.colours.accent].map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: three fixed preview caps
                <i key={i} style={{ background: c, borderRadius: radius[shape] }} />
              ))}
            </span>
          }
          name={shape}
          onClick={() => set((b) => withKeys(b, (x) => ({ ...x, shape })))}
        />
      ))}
      <TraySep />
      {LEGEND_FONTS.map(([font, name]) => (
        <Card
          key={font}
          width={112}
          on={!!build.keys && k.legend.font === font}
          top={
            <span className="bd-aa" style={{ fontFamily: `"${font}"`, fontWeight: font === "Rubik" ? 500 : 400 }}>
              Aa
            </span>
          }
          name={name}
          onClick={() => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, font } })))}
        />
      ))}
      <Card
        width={112}
        top={
          <span className="bd-aligns">
            {(["c", "tl", "bl"] as const).map((a) => (
              <i key={a} className={k.legend.align === a ? `${a} on` : a} />
            ))}
          </span>
        }
        name="Align"
        onClick={() => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, align: ALIGN_NEXT[x.legend.align] } })))}
      />
    </>
  );
}
