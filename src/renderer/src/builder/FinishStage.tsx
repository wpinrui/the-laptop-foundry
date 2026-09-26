import { available, type Build, CONTENT, colourHex, type Fit, type Piece, pieceOf } from "../engine";
import { ColourPicker } from "./ColourPicker";
import type { StageProps } from "./Stages";
import { materialsFor } from "./structure";
import { type DropOption, Dropdown } from "./Dropdown";
import { Chip, Chips, Label, Line, money, Value } from "./ui";

// The Finish stage: lid, deck, bottom and bezel, each any colour; material
// and surface finish per shell piece, and what the piece adds.

export type FinishPiece = Piece | "bezel";

const PIECE_NAME: Record<FinishPiece, string> = { lid: "Lid", deck: "Deck", floor: "Bottom", bezel: "Bezel" };
const ORDER: FinishPiece[] = ["lid", "deck", "floor", "bezel"];

function colourOf(b: Build, p: FinishPiece): string {
  if (p === "bezel") return (b.bezel ?? colourHex(b.finish.lid.colour)).toUpperCase();
  return colourHex(b.finish[p].colour).toUpperCase();
}

function flagged(build: Build, fit: Fit, p: FinishPiece): boolean {
  if (p === "bezel") return false;
  return fit.problems.some(
    (x) =>
      (x.kind === "compat" && (x.code === "wrong-piece" || x.code === "wrong-finish") && x.piece === p) ||
      (x.kind === "year" && (x.ref === build.materials[p] || x.ref === build.finish[p].texture)),
  );
}

export function FinishColumn({
  build,
  fit,
  set,
  locked,
  piece,
  onPiece,
}: StageProps & { piece: FinishPiece; onPiece: (p: FinishPiece) => void }) {
  const shell = piece === "bezel" ? null : piece;
  const mat = shell ? CONTENT.materials.find((m) => m.id === build.materials[shell]) : undefined;
  const finishes = (mat?.finishes ?? []).filter((f) => {
    const fin = CONTENT.finishes.find((x) => x.id === f);
    return !fin || available(fin, build.year);
  });
  const adds = shell ? pieceOf(build, fit, shell) : null;
  return (
    <>
      <div className="bd-pieces">
        {ORDER.map((p) => (
          <button
            type="button"
            key={p}
            className={["bd-row-item", "bd-piece", p === piece ? "on" : "", flagged(build, fit, p) ? "warn" : ""].join(" ")}
            onClick={() => onPiece(p)}
          >
            {PIECE_NAME[p]}
            <span className="bd-swatch-line">
              {colourOf(build, p)}
              <i className="bd-swatch" style={{ background: colourOf(build, p) }} />
            </span>
          </button>
        ))}
      </div>
      <div className="bd-rule" />
      <div key={piece} className="bd-finish-detail fd-in">
        {shell && mat && (
          <>
            <Line label="Material">
              <Dropdown
                label="Material"
                value={mat.id}
                options={materialOptions(build, shell)}
                onChange={(id) =>
                  set((b) => {
                    const m = CONTENT.materials.find((x) => x.id === id);
                    if (!m) return b;
                    return {
                      ...b,
                      materials: { ...b.materials, [shell]: m.id },
                      finish: { ...b.finish, [shell]: { ...b.finish[shell], texture: m.finishes[0] ?? b.finish[shell].texture } },
                    };
                  })
                }
              />
            </Line>
            <div className="bd-line">
              <Label>Finish</Label>
              <Chips>
                {finishes.map((f) => (
                  <Chip
                    caps
                    key={f}
                    on={build.finish[shell].texture === f}
                    onClick={() => set((b) => ({ ...b, finish: { ...b.finish, [shell]: { ...b.finish[shell], texture: f } } }))}
                  >
                    {CONTENT.finishes.find((x) => x.id === f)?.name ?? f}
                  </Chip>
                ))}
              </Chips>
            </div>
            {adds && (
              <Line label="Adds">
                <Value v={`${Math.round(adds.grams)} g  ${money(adds.usd)}`} />
              </Line>
            )}
          </>
        )}
        <ColourPicker
          compact
          value={colourOf(build, piece)}
          disabled={locked}
          onChange={(hex) =>
            set((b) =>
              piece === "bezel"
                ? { ...b, bezel: hex }
                : { ...b, finish: { ...b.finish, [piece]: { ...b.finish[piece], colour: hex } } },
            )
          }
        />
      </div>
    </>
  );
}

/** The year's materials; those the piece cannot take stay listed but unavailable. */
function materialOptions(build: Build, piece: Piece): DropOption[] {
  const allowed = materialsFor(build.year, piece);
  return CONTENT.materials
    .filter((m) => available(m, build.year) || m.id === build.materials[piece])
    .map((m) => ({ key: m.id, label: m.name.replace(/ \(.*\)$/, ""), disabled: !allowed.includes(m.id) && m.id !== build.materials[piece] }));
}
