import { available, CONTENT } from "../content";
import type { Build, KeySpec, Piece } from "../types";
import { PIECES } from "../types";
import type { Line } from "./types";

// Rival design language (GDD, "Rival generator"): every line keeps one look
// (body, colours, finish, keys) for at least 5 years and changes it only where
// the line itself was redesigned. A maker's lines share its DNA: key shape,
// legend font, bezel and key plate habits. The look is seeded by the line
// alone, so it is the same in every save, and is worked out from the line's
// own data, so any year can be opened first.

const MIN_YEARS = 5;
/** A look held longer than this splits at a redesign that leaves 5 years either side. */
const LONG_YEARS = 10;

export type Tone = "black" | "graphite" | "spacegrey" | "silver" | "platinum" | "white" | "navy" | "blue" | "gold";

/** Each tone on metal and on plastic. */
const TONES: Record<Tone, { metal: string; plastic: string }> = {
  black: { metal: "#1e1f22", plastic: "#1b1b1c" },
  graphite: { metal: "#3a3c40", plastic: "#333538" },
  spacegrey: { metal: "#6e7075", plastic: "#5d5f63" },
  silver: { metal: "#c8cacd", plastic: "#c4c6c9" },
  platinum: { metal: "#d9dadc", plastic: "#d4d5d7" },
  white: { metal: "#e6e6e4", plastic: "#eeeeec" },
  navy: { metal: "#253047", plastic: "#2b3650" },
  blue: { metal: "#3d5a80", plastic: "#3b5577" },
  gold: { metal: "#d6c3a5", plastic: "#cdb999" },
};

const LIGHT: Tone[] = ["silver", "platinum", "white", "gold"];

/** What every line of a maker shares. */
interface Dna {
  keys: KeySpec["shape"];
  font: string;
  weight: number;
  case: KeySpec["legend"]["case"];
  /** The key plate takes the deck's colour instead of the stock near-black. */
  plate: boolean;
  /** A glass trackpad in the deck's colour from 2008. */
  pad: boolean;
}

const DNA: Record<string, Dna> = {
  apple: { keys: "square", font: "Inter", weight: 400, case: "lower", plate: true, pad: true },
  lenovo: { keys: "smile", font: "IBM Plex Sans", weight: 500, case: "as", plate: false, pad: false },
  dell: { keys: "rounded", font: "Roboto", weight: 500, case: "as", plate: false, pad: false },
  hp: { keys: "rounded", font: "Open Sans", weight: 500, case: "as", plate: false, pad: false },
  asus: { keys: "rounded", font: "Manrope", weight: 500, case: "as", plate: true, pad: false },
  acer: { keys: "square", font: "Work Sans", weight: 500, case: "as", plate: false, pad: false },
  msi: { keys: "square", font: "Rubik", weight: 500, case: "upper", plate: false, pad: false },
  samsung: { keys: "rounded", font: "Poppins", weight: 500, case: "as", plate: true, pad: false },
  microsoft: { keys: "square", font: "Open Sans", weight: 400, case: "lower", plate: true, pad: true },
  razer: { keys: "square", font: "Rubik", weight: 500, case: "as", plate: false, pad: true },
  toshiba: { keys: "rounded", font: "Lato", weight: 400, case: "as", plate: false, pad: false },
  sony: { keys: "square", font: "DM Sans", weight: 500, case: "as", plate: false, pad: false },
};

/** A line's own palette, by the year its look starts. */
interface LineStyle {
  tones: [number, Tone[]][];
  /** The deck in its own tone, as the XPS's carbon deck under a silver lid. */
  deck?: [number, Tone][];
  /** Legend colour, for the gaming lines' lit keys. */
  legend?: string;
  /** Overrides the maker's key shape before a year: ThinkPad's classic caps before AccuType. */
  keysBefore?: [number, KeySpec["shape"]];
}

const STYLES: Record<string, LineStyle> = {
  "lenovo-ideapad": { tones: [[2008, ["black", "graphite", "white"]], [2014, ["graphite", "silver", "blue"]]] },
  "lenovo-yoga": { tones: [[2012, ["silver", "graphite"]], [2019, ["spacegrey", "navy", "silver"]]] },
  "lenovo-thinkpad": { tones: [[2006, ["black"]]], keysBefore: [2012, "square"] },
  "lenovo-legion": { tones: [[2017, ["black", "graphite"]]], legend: "#ffffff" },
  "dell-inspiron": { tones: [[2006, ["black", "silver", "blue"]], [2016, ["silver", "black", "blue"]]] },
  "dell-xps": { tones: [[2006, ["black", "silver"]], [2012, ["silver"]]], deck: [[2012, "black"]] },
  "dell-latitude": { tones: [[2006, ["black", "graphite"]], [2019, ["graphite", "silver"]]] },
  "dell-alienware": { tones: [[2006, ["black"]], [2014, ["graphite", "black"]], [2021, ["white", "black"]]], legend: "#7fd8ff" },
  "hp-pavilion": { tones: [[2006, ["black", "silver", "blue"]], [2013, ["silver", "black", "blue"]]] },
  "hp-envy": { tones: [[2009, ["black", "silver"]], [2013, ["silver", "graphite"]]] },
  "hp-spectre": { tones: [[2012, ["black", "silver"]], [2015, ["black", "navy"]]] },
  "hp-elitebook": { tones: [[2006, ["graphite", "silver"]], [2013, ["silver"]]] },
  "hp-omen": { tones: [[2014, ["black"]]], legend: "#e2231a" },
  "apple-macbook": { tones: [[2006, ["white"]], [2015, ["silver", "spacegrey", "gold"]]] },
  "apple-macbook-air": { tones: [[2008, ["silver"]], [2022, ["silver", "spacegrey"]]] },
  "apple-macbook-pro": { tones: [[2006, ["silver"]], [2016, ["spacegrey", "silver"]]] },
  "asus-vivobook": { tones: [[2006, ["black", "silver"]], [2012, ["silver", "blue", "black"]]] },
  "asus-zenbook": { tones: [[2011, ["silver"]], [2015, ["navy", "spacegrey"]], [2022, ["navy", "graphite"]]] },
  "asus-rog": { tones: [[2006, ["black"]]], legend: "#ff2b3a" },
  "acer-aspire": { tones: [[2006, ["black", "silver"]], [2012, ["silver", "black", "blue"]]] },
  "acer-swift": { tones: [[2011, ["silver"]], [2016, ["silver", "gold"]], [2021, ["silver", "gold", "navy"]]] },
  "acer-predator": { tones: [[2015, ["black"]]], legend: "#2fb5e6" },
  "msi-modern": { tones: [[2019, ["graphite", "silver"]]] },
  "msi-prestige": { tones: [[2019, ["graphite", "silver"]]] },
  "msi-titan": { tones: [[2008, ["black"]]], legend: "#e2231a" },
  "msi-katana": { tones: [[2017, ["black"]]], legend: "#e2231a" },
  "samsung-galaxy-book": { tones: [[2011, ["silver", "graphite"]], [2021, ["graphite", "silver"]]] },
  "microsoft-surface-laptop": { tones: [[2017, ["platinum", "black"]], [2021, ["platinum", "black", "navy"]]] },
  "razer-blade": { tones: [[2012, ["black"]]], legend: "#44d62c" },
  "toshiba-satellite": { tones: [[2006, ["black", "silver", "white"]]] },
  "toshiba-portege": { tones: [[2006, ["silver", "black"]]] },
  "sony-vaio": { tones: [[2006, ["black", "silver", "white"]]] },
};

const FALLBACK: LineStyle = { tones: [[2000, ["black", "silver"]]] };
const PLAIN: Dna = DNA.dell;

/** FNV-1a over the parts. */
function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lastAt<T>(rows: [number, T][], year: number): T {
  let out = rows[0][1];
  for (const [from, v] of rows) if (from <= year) out = v;
  return out;
}

const firstYear = (line: Line) => Math.min(...line.years.map((r) => r[0]));
const lastYear = (line: Line) => Math.max(...line.years.map((r) => r[1]));

/**
 * The years each of the line's looks starts. A look starts where the line was
 * redesigned (its lead body changed, or it came back after a gap) and lasts at
 * least 5 years; one longer than 10 splits at a lesser shape change.
 */
export function lookStarts(line: Line): number[] {
  const first = firstYear(line);
  const end = lastYear(line);
  const lead = (y: number) => {
    let s = line.shapes[0];
    for (const x of line.shapes) if (x.from <= y) s = x;
    return s.bodies[0];
  };
  const comebacks = line.years.map((r) => r[0]).filter((y) => y > first);
  const redesigns = line.shapes.map((s) => s.from).filter((y) => y > first && lead(y) !== lead(y - 1));
  const all = line.shapes.map((s) => s.from).filter((y) => y > first);
  const ok = (starts: number[], y: number) => y - Math.max(...starts.filter((s) => s < y)) >= MIN_YEARS && end - y + 1 >= MIN_YEARS;
  const starts = [first];
  for (const y of [...new Set([...comebacks, ...redesigns])].sort((a, b) => a - b)) if (ok(starts, y) || comebacks.includes(y)) starts.push(y);
  starts.sort((a, b) => a - b);
  for (let guard = 0; guard < 4; guard++) {
    const i = starts.findIndex((s, k) => (starts[k + 1] ?? end + 1) - s > LONG_YEARS);
    if (i < 0) break;
    const s = starts[i];
    const next = starts[i + 1] ?? end + 1;
    const mid = (s + next) / 2;
    const cut = all.filter((y) => y - s >= MIN_YEARS && next - y >= MIN_YEARS).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    if (cut === undefined) break;
    starts.push(cut);
    starts.sort((a, b) => a - b);
  }
  return starts;
}

/** The look a line's model of the year wears. */
export interface Look {
  /** The year the look started. */
  from: number;
  maker: string;
  /** The body the look is built on: the one the line's shapes over the look's years favour most. */
  body: string;
  /** The body's signature slider. */
  sig: number;
  tone: Tone;
  deck?: Tone;
  keys: KeySpec;
  plate: boolean;
  pad: boolean;
  /** Aluminium texture: anodised on premium metal, brushed before 2012 on the rest. */
  metal: "anodised" | "brushed";
  /** Plastic texture, fixed for the look. */
  plastic: "glossy" | "matte" | "soft-touch";
}

export function lookFor(line: Line, year: number): Look {
  const starts = lookStarts(line);
  let from = starts[0];
  for (const s of starts) if (s <= year) from = s;
  const to = (starts.find((s) => s > from) ?? Math.max(lastYear(line), from) + 1) - 1;
  // The body every shape over the look's years offers, favouring the one most often listed first.
  const tally = new Map<string, { years: number; rank: number }>();
  for (let y = from; y <= to; y++) {
    let shape = line.shapes[0];
    for (const x of line.shapes) if (x.from <= y) shape = x;
    shape.bodies.forEach((b, i) => {
      const body = CONTENT.bodies.find((x) => x.id === b);
      if (!body || !available(body, y)) return;
      const t = tally.get(b) ?? { years: 0, rank: 0 };
      tally.set(b, { years: t.years + 1, rank: t.rank + i });
    });
  }
  // One the first year has, offered the most years, most often listed first.
  const atStart = (b: string) => {
    const x = CONTENT.bodies.find((k) => k.id === b);
    return x && available(x, from) ? 0 : 1;
  };
  const common = [...tally.entries()].sort((a, b) => atStart(a[0]) - atStart(b[0]) || b[1].years - a[1].years || a[1].rank / a[1].years - b[1].rank / b[1].years || a[0].localeCompare(b[0]));
  let lead = line.shapes[0];
  for (const x of line.shapes) if (x.from <= from) lead = x;
  const body = common[0]?.[0] ?? lead.bodies[0];
  const h = hash("look", line.id, from);
  const style = STYLES[line.id] ?? FALLBACK;
  const tones = lastAt(style.tones, from);
  // The line's signature tone, listed first, half the time.
  const tone = h % 2 === 0 || tones.length < 2 ? tones[0] : tones[1 + ((h >>> 1) % (tones.length - 1))];
  const deck = style.deck ? lastAt(style.deck, from) : undefined;
  const dna = DNA[line.maker] ?? PLAIN;
  const shape = style.keysBefore && from < style.keysBefore[0] ? style.keysBefore[1] : dna.keys;
  const lightCaps = tone === "white";
  const cap = lightCaps ? "#F2F2F0" : "#1A1A1C";
  const legend = style.legend ?? (lightCaps ? "#2A2A2C" : "#E8E8E8");
  const premium = lead.class.budget === "premium";
  return {
    from,
    maker: line.maker,
    body,
    sig: Math.round(((h >>> 8) % 8) * 0.05 * 100) / 100,
    tone,
    deck,
    keys: {
      shape,
      colours: { letters: cap, mods: cap, accent: cap },
      legend: { font: dna.font, colour: legend.toUpperCase(), align: "c", case: line.maker === "apple" && from >= 2016 ? "as" : dna.case, size: 1, weight: dna.weight },
    },
    plate: dna.plate,
    pad: dna.pad,
    metal: premium || from >= 2012 ? "anodised" : "brushed",
    plastic: lead.class.performance === "office" && premium ? "soft-touch" : from <= 2010 && !premium ? "glossy" : "matte",
  };
}

function toneHex(tone: Tone, material: string): string {
  return (material === "plastic" ? TONES[tone].plastic : TONES[tone].metal).toUpperCase();
}

/** The build in the look's colours, finish, keys, key plate and pad. Nothing here moves a part. */
export function dress(build: Build, look: Look, textures: (material: string) => string[]): Build {
  const finish = {} as Build["finish"];
  for (const piece of PIECES as Piece[]) {
    const material = build.materials[piece];
    const tone = piece === "deck" && look.deck ? look.deck : look.tone;
    // The underside is darker on anything that is not one colour all round.
    const colour = piece === "floor" && material !== build.materials.lid ? "#1D1D1F" : toneHex(tone, material);
    const want = material === "aluminium" ? look.metal : material === "plastic" ? look.plastic : build.finish[piece].texture;
    const ok = textures(material);
    finish[piece] = { colour, texture: ok.includes(want) ? want : build.finish[piece].texture };
  }
  const deckHex = finish.deck.colour;
  const out: Build = { ...build, finish, keys: look.keys, bezel: "#111112" };
  if (look.tone === "white" && build.materials.lid === "plastic" && look.maker === "apple") out.bezel = finish.lid.colour;
  if (look.plate) out.keyDeck = deckHex;
  if (look.pad && build.year >= 2008) out.pad = { colour: deckHex, finish: "glass" };
  return out;
}

export const isLight = (t: Tone) => LIGHT.includes(t);
