// Name randomiser: invented series names with era-flavoured suffixes. No
// real product lines or trademarks.

const SERIES = [
  "Kestrel",
  "Halcyon",
  "Meridian",
  "Corvid",
  "Tessera",
  "Solstice",
  "Quillon",
  "Aldera",
  "Marlin",
  "Veltra",
  "Oriel",
  "Brisa",
  "Lumen",
  "Northway",
  "Ardent",
  "Calder",
  "Everline",
  "Tamber",
  "Sorrel",
  "Wrenfield",
  "Pallas",
  "Cobalt",
  "Ostara",
  "Fenwick",
];

const OLD_WORDS = ["", "", "Pro", "Media", "Tour", "Executive", "Mobile"];
const OLD_LETTERS = ["T", "M", "X", "R", "S", "V"];
const MID_WORDS = ["", "Pro", "Slim", "Plus", "Studio", "Sport"];
const NEW_WORDS = ["", "Air", "Pro", "Studio", "Neo", "Edge", "Plus", "Carbon"];

function pick<T>(list: T[], r: () => number): T {
  return list[Math.floor(r() * list.length)];
}

/** A plausible model name for the year. `inches` adds a size where the era used one. */
export function randomName(
  year: number,
  inches?: number,
  r: () => number = Math.random,
): string {
  const series = pick(SERIES, r);
  if (year < 2012) {
    const word = pick(OLD_WORDS, r);
    const num = `${pick(OLD_LETTERS, r)}${Math.floor(r() * 9 + 1)}${Math.floor(r() * 9)}${pick(["0", "5"], r)}`;
    return [series, word, num].filter(Boolean).join(" ");
  }
  if (year < 2020) {
    const word = pick(MID_WORDS, r);
    return [series, String(Math.floor(r() * 8 + 2) * 100 + 10), word]
      .filter(Boolean)
      .join(" ");
  }
  const word = pick(NEW_WORDS, r);
  const size = inches ? String(Math.round(inches)) : "";
  return [series, word, size].filter(Boolean).join(" ");
}
