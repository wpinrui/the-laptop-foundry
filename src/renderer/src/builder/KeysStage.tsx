import type { Build, KeySpec } from "../engine";
import { token } from "../viewer/theme";
import { ColourPicker } from "./ColourPicker";
import type { StageProps } from "./Stages";
import { Dropdown } from "./Dropdown";
import { Chip, Chips, Label, SliderField, Toggle } from "./ui";

// The Keys stage: keycap shape, three colour groups (letters, modifiers, and
// the accent keys Esc and Enter) and the legends' colour, font, alignment,
// case, size and weight. The colour groups are multi-select: a picked colour
// goes to every selected group. Any colour is allowed in every year.

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

/** The weights each legend font actually ships in this app. */
const FONT_WEIGHTS: Record<string, number[]> = {
  "IBM Plex Sans": [300, 400, 500, 600, 700],
  "Space Mono": [400, 700],
  Rubik: [400, 500, 700],
  "Barlow Condensed": [500, 600, 700],
};
const WEIGHT_NAME: Record<number, string> = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };

function weightsOf(font: string): number[] {
  return FONT_WEIGHTS[font] ?? [400];
}

/** The font's shipped weight nearest to the one asked for. */
function snapWeight(font: string, w: number): number {
  return weightsOf(font).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
}

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

export function KeysColumn({
  build,
  set,
  locked,
  groups,
  onGroups,
}: StageProps & { groups: KeyGroup[]; onGroups: (g: KeyGroup[]) => void }) {
  const k = build.keys ?? stockKeys();
  const first = GROUPS.find(([g]) => groups.includes(g))?.[0] ?? "letters";
  const value = first === "legend" ? k.legend.colour : k.colours[first];
  const legend = groups.includes("legend");
  const toggle = (g: KeyGroup) => {
    const next = groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g];
    if (next.length > 0) onGroups(GROUPS.map(([x]) => x).filter((x) => next.includes(x)));
  };
  const radius = { square: "2px", rounded: "6px", round: "50%" } as const;
  return (
    <>
      <Chips>
        {GROUPS.map(([g, name]) => (
          <Toggle key={g} on={groups.includes(g)} onClick={() => toggle(g)}>
            {name}
          </Toggle>
        ))}
      </Chips>
      <ColourPicker
        value={value}
        disabled={locked}
        onChange={(hex) =>
          set((b) =>
            withKeys(b, (x) => {
              const colours = { ...x.colours };
              for (const g of groups) if (g !== "legend") colours[g] = hex;
              return { ...x, colours, legend: legend ? { ...x.legend, colour: hex } : x.legend };
            }),
          )
        }
      />
      <div className="bd-line">
        <Label>Shape</Label>
        <Chips>
          {(["square", "rounded", "round"] as const).map((shape) => (
            <button
              type="button"
              key={shape}
              title={shape}
              aria-label={shape}
              className={k.shape === shape ? "bd-chip bd-visual on" : "bd-chip bd-visual"}
              onClick={() => set((b) => withKeys(b, (x) => ({ ...x, shape })))}
            >
              <span className="bd-keycaps">
                {[k.colours.letters, k.colours.mods, k.colours.accent].map((c, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: three fixed preview caps
                  <i key={i} style={{ background: c, borderRadius: radius[shape] }} />
                ))}
              </span>
            </button>
          ))}
        </Chips>
      </div>
      {legend && (
        <>
          <div className="bd-line">
            <Label>Font</Label>
            <Dropdown
              label="Legend font"
              value={k.legend.font}
              options={LEGEND_FONTS.map(([font, name]) => ({
                key: font,
                label: name,
                style: { fontFamily: `"${font}"`, fontWeight: font === "Rubik" ? 500 : 400 },
              }))}
              onChange={(font) =>
                set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, font, weight: snapWeight(font, x.legend.weight) } })))
              }
            />
          </div>
          <div className="bd-line">
            <Label>Align</Label>
            <Chips>
              {(["c", "tl", "bl"] as const).map((a) => (
                <button
                  type="button"
                  key={a}
                  aria-label={ALIGN_NAME[a]}
                  title={ALIGN_NAME[a]}
                  className={k.legend.align === a ? "bd-chip bd-visual on" : "bd-chip bd-visual"}
                  onClick={() => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, align: a } })))}
                >
                  <span className="bd-aligns">
                    <i className={k.legend.align === a ? `${a} on` : a} />
                  </span>
                </button>
              ))}
            </Chips>
          </div>
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
              {weightsOf(k.legend.font).map((w) => (
                <Chip
                  key={w}
                  on={snapWeight(k.legend.font, k.legend.weight) === w}
                  style={{ fontFamily: `"${k.legend.font}"`, fontWeight: w, textTransform: "none" }}
                  onClick={() => set((b) => withKeys(b, (x) => ({ ...x, legend: { ...x.legend, weight: w } })))}
                >
                  {WEIGHT_NAME[w] ?? w}
                </Chip>
              ))}
            </Chips>
          </div>
        </>
      )}
    </>
  );
}

const ALIGN_NAME = { c: "Centred", tl: "Top left", bl: "Bottom left" } as const;
