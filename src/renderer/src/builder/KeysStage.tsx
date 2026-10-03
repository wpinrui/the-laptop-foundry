import type { Build, KeySpec } from "../engine";
import { token } from "../viewer/theme";
import { ColourPicker } from "./ColourPicker";
import type { StageProps } from "./Stages";
import { Dropdown } from "./Dropdown";
import { fontOptions, snapWeight, WEIGHT_NAME, weightsOf } from "./fonts";
import { Chip, Chips, Label, SliderField, Toggle } from "./ui";

// The keycaps, on the Keyboard stage: keycap shape, three colour groups (letters, modifiers, and
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

const SHAPES: [KeySpec["shape"], string][] = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["round", "Round"],
  ["smile", "Smile"],
];

/**
 * One cap seen from above, front edge down, on a 15.5 by 15 mm cap: white so
 * it reads on the dark tile. The smile's front edge sags 1.2 mm between its
 * 1.5 mm corners; its back corners are 1 mm.
 */
function CapIcon({ shape }: { shape: KeySpec["shape"] }) {
  return (
    <svg viewBox="0 0 15.5 15" aria-hidden="true">
      {shape === "smile" ? (
        <path
          fill="#fff"
          d="M1 0H14.5A1 1 0 0 1 15.5 1V12.3A1.5 1.5 0 0 1 14 13.8Q7.75 16.2 1.5 13.8A1.5 1.5 0 0 1 0 12.3V1A1 1 0 0 1 1 0Z"
        />
      ) : (
        <rect width="15.5" height="15" fill="#fff" rx={shape === "square" ? 0.6 : shape === "round" ? 7.5 : 2.5} />
      )}
    </svg>
  );
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
          {SHAPES.map(([shape, name]) => (
            <button
              type="button"
              key={shape}
              title={name}
              aria-label={name}
              className={k.shape === shape ? "bd-chip bd-visual on" : "bd-chip bd-visual"}
              onClick={() => set((b) => withKeys(b, (x) => ({ ...x, shape })))}
            >
              <span className="bd-keycaps">
                {[0, 1, 2].map((i) => (
                  <i key={i}>
                    <CapIcon shape={shape} />
                  </i>
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
              options={fontOptions()}
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
