// Narration text as a voice should read it: figures, prices, years, units,
// model numbers and acronyms spelled out in words, the way a tech reviewer
// says them. Captions keep the written form; only the voice gets this.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINAL_WORD: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth",
};

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return below100(r);
  return r ? `${ONES[h]} hundred ${below100(r)}` : `${ONES[h]} hundred`;
}

const SCALES = ["", "thousand", "million", "billion", "trillion"];

/** 1234 as "one thousand two hundred thirty-four". */
export function cardinal(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `minus ${cardinal(-n)}`;
  n = Math.floor(n);
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const c = n % 1000;
    if (c) parts.unshift(SCALES[i] ? `${below1000(c)} ${SCALES[i]}` : below1000(c));
  }
  return parts.join(" ");
}

/** 22 as "twenty-second". */
export function ordinal(n: number): string {
  const words = cardinal(n);
  return words.replace(/([a-z]+)$/, (w) => ORDINAL_WORD[w] ?? (w.endsWith("y") ? `${w.slice(0, -1)}ieth` : `${w}th`));
}

/** Digits as a pair: "05" as "oh five", "50" as "fifty". */
const pair = (d: string) => (d[0] === "0" && d[1] !== "0" ? `oh ${ONES[Number(d[1])]}` : below100(Number(d)));

/**
 * A four-digit figure read in pairs, as people say years, prices and model
 * numbers: 2016 "twenty sixteen", 2006 "two thousand six", 6500 "sixty-five
 * hundred", 9350 "ninety-three fifty".
 */
export function paired(digits: string): string {
  const n = Number(digits);
  if (digits.length !== 4 || digits[0] === "0") return cardinal(n);
  const hi = digits.slice(0, 2);
  const lo = digits.slice(2);
  if (lo === "00") return n % 1000 === 0 ? cardinal(n) : `${below100(Number(hi))} hundred`;
  // 2006 "two thousand six", but 2016 "twenty sixteen" and 3050 "thirty fifty".
  if (lo[0] === "0" && hi[1] === "0" && hi[0] !== "1") return cardinal(n);
  return `${below100(Number(hi))} ${pair(lo)}`;
}

/** A model number: 520 "five twenty", 600 "six hundred", 1050 "ten fifty", 13900 "thirteen nine hundred". */
export function modelNumber(digits: string): string {
  const n = Number(digits);
  if (digits.length <= 2) return cardinal(n);
  if (digits.length === 3) {
    if (digits.slice(1) === "00") return cardinal(n);
    return `${ONES[Number(digits[0])]} ${pair(digits.slice(1))}`;
  }
  if (digits.length === 4) return paired(digits);
  if (digits.length === 5) return `${below100(Number(digits.slice(0, 2)))} ${modelNumber(digits.slice(2))}`;
  return digits.split("").map((d) => ONES[Number(d)]).join(" ");
}

/** A decimal: "11.5" as "eleven point five", "1.67" as "one point six seven". */
function decimal(s: string): string {
  const [whole, frac] = s.replace(/,/g, "").split(".");
  const w = cardinal(Number(whole || "0"));
  return frac && !/^0+$/.test(frac) ? `${w} point ${frac.split("").map((d) => ONES[Number(d)]).join(" ")}` : w;
}

/** A plain figure: commas and decimals as quantities, a bare four-digit integer in pairs. */
function figure(s: string): string {
  if (s.includes(".")) return decimal(s);
  if (s.includes(",")) return cardinal(Number(s.replace(/,/g, "")));
  if (s.length === 4 && !s.startsWith("0")) return paired(s);
  return cardinal(Number(s));
}

/** A price the short way: $1,299 "twelve ninety-nine", $1,500 "fifteen hundred dollars", $999 "nine ninety-nine". */
export function price(s: string): string {
  const [whole, cents] = s.replace(/,/g, "").split(".");
  const n = Number(whole);
  if (cents && Number(cents) > 0) return `${cardinal(n)} dollars and ${cardinal(Number(cents.padEnd(2, "0").slice(0, 2)))} cents`;
  if (n >= 100 && n < 10000 && n % 100 !== 0) {
    const d = String(n);
    if (d.length === 3) return `${ONES[Number(d[0])]} ${pair(d.slice(1))}`;
    const p = paired(d);
    return p.includes("thousand") ? `${p} dollars` : p;
  }
  if (n >= 1000 && n < 10000 && n % 1000 !== 0) return `${paired(String(n))} dollars`;
  return `${cardinal(n)} ${n === 1 ? "dollar" : "dollars"}`;
}

/** Unit symbols and how they are read after a figure: singular, plural. */
const UNITS: Record<string, [string, string]> = {
  h: ["hour", "hours"],
  hr: ["hour", "hours"],
  hrs: ["hour", "hours"],
  min: ["minute", "minutes"],
  kg: ["kilo", "kilos"],
  lb: ["pound", "pounds"],
  lbs: ["pound", "pounds"],
  mm: ["millimetre", "millimetres"],
  cm: ["centimetre", "centimetres"],
  '"': ["inch", "inches"],
  GB: ["gigabyte", "gigabytes"],
  TB: ["terabyte", "terabytes"],
  MB: ["megabyte", "megabytes"],
  Hz: ["hertz", "hertz"],
  GHz: ["gigahertz", "gigahertz"],
  MHz: ["megahertz", "megahertz"],
  nits: ["nit", "nits"],
  W: ["watt", "watts"],
  Wh: ["watt-hour", "watt-hours"],
  mAh: ["milliamp-hour", "milliamp-hours"],
  fps: ["frame per second", "frames per second"],
  dB: ["decibel", "decibels"],
  ms: ["millisecond", "milliseconds"],
  mp: ["megapixel", "megapixels"],
  MP: ["megapixel", "megapixels"],
};

/** Words said as words though they are written in capitals. */
const SAID: Record<string, string> = {
  OLED: "oh-led",
  AMOLED: "ay-moled",
  RAM: "ram",
  ROM: "rom",
  SATA: "sata",
  LAN: "lan",
  WAN: "wan",
  NAND: "nand",
  II: "two",
  III: "three",
  Ti: "tie",
  NVIDIA: "en-vidia",
  Nvidia: "en-vidia",
  Xe: "X E",
  NVMe: "N V M E",
  PCIe: "P C I E",
  macOS: "mac O S",
  iOS: "eye O S",
  USB: "U S B",
  "USB-C": "U S B C",
  "Wi-Fi": "wi-fi",
  WiFi: "wi-fi",
};

/** Letters said one by one; a lone "A" would otherwise be read as the article. */
const spell = (letters: string) =>
  letters
    .split("")
    .map((c) => (c.toUpperCase() === "A" ? "ay" : c.toUpperCase()))
    .join(" ");

/** A run of letters inside a model code: short capitals spelled, words kept. */
function letters(run: string): string {
  if (SAID[run]) return SAID[run];
  if (run === "i") return "i";
  if (/^[A-Z]{1,6}$/.test(run) || run.length === 1) return spell(run);
  return run;
}

/** A token mixing letters and digits, like "i7-6500U", "RTX", "4K", "TL-52" or "1080p". */
function code(token: string): string {
  if (SAID[token]) return SAID[token];
  return token
    .split("-")
    .flatMap((part) => part.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) ?? [])
    .map((run) => (/^\d+$/.test(run) ? modelNumber(run) : /^[A-Za-z]+$/.test(run) ? letters(run) : run === "+" ? "plus" : run))
    .join(" ");
}

const FUNCTION_WORDS = new Set(["The", "A", "An", "It", "Its", "And", "But", "Or", "This", "That", "Is", "Was", "For", "With", "Just", "Only", "Up", "Over", "About"]);

/**
 * The narration line as the voice should read it. Everything a text-to-speech
 * front end tends to misread is written out: "$1,299" "twelve ninety-nine",
 * "2016" "twenty sixteen", "i7-6500U" "i seven sixty-five hundred U",
 * "14.2 h" "fourteen point two hours", "OLED" "oh-led".
 */
export function speak(text: string): string {
  let s = text;


  // Prices.
  s = s.replace(/\$(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![\d,])/g, (_, w: string, c: string | undefined) => ` ${price(w + (c ?? ""))} `);

  // Ranges between plain figures: "8-16" as "8 to 16". Model codes like "TL-52" keep their letters.
  s = s.replace(/(^|[^\w.-])(\d+(?:\.\d+)?)\s?-\s?(\d+(?:\.\d+)?)(?![\d.])/g, "$1$2 to $3");

  // Percentages, "#1", "3200+" and "&".
  s = s.replace(/(\d+(?:\.\d+)?)\s?%/g, (_, n: string) => `${figure(n)} percent`);
  s = s.replace(/#(\d)/g, "number $1");
  s = s.replace(/(\d)\+/g, "$1 plus");
  s = s.replace(/\s&\s/g, " and ");

  // Ordinals.
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, n: string) => ordinal(Number(n)));

  // Figures with units: "14.2 h", "16GB", "13.3"", "1.3 kg".
  const unitKeys = Object.keys(UNITS)
    .sort((a, b) => b.length - a.length)
    .join("|");
  s = s.replace(new RegExp(String.raw`(^|[^\w.])(\d+(?:,\d{3})*(?:\.\d+)?)\s?(${unitKeys})(?!\w)`, "g"), (_, pre: string, n: string, u: string) => {
    const [one, many] = UNITS[u];
    return `${pre}${figure(n)} ${n === "1" ? one : many}`;
  });

  // Names with a hyphen said as a unit.
  s = s.replace(/\b(USB-C|Wi-Fi)\b/g, (m) => SAID[m]);

  // Tokens mixing letters and digits, with their hyphens: "i7-6500U", "M1", "TL-52", "4K".
  s = s.replace(/\b(?=[\w-]*[A-Za-z])(?=[\w-]*\d)[A-Za-z\d]+(?:-[A-Za-z\d]+)*/g, (m) => code(m));

  // Capitals said letter by letter ("IPS", "SSDs"), or as the word they are ("OLED").
  s = s.replace(/\b[A-Za-z]*[A-Z][A-Za-z]*\b/g, (w) => {
    if (SAID[w]) return SAID[w];
    if (/^[A-Z]{2,6}$/.test(w)) return spell(w);
    if (/^[A-Z]{2,6}s$/.test(w)) return `${spell(w.slice(0, -1))}'s`;
    return w;
  });

  // A number after a capitalised name mid-sentence is part of the name: "Graphics 520", "Value 2016".
  s = s.replace(/(\S+)(\s+)(\d{3,5})\b(?![.,]\d)/g, (m, prev: string, gap: string, n: string, at: number, all: string) => {
    const sentenceStart = /(^|[.!?:]\s*)$/.test(all.slice(0, at));
    const named = (/^[A-Z]/.test(prev) && !FUNCTION_WORDS.has(prev) && !sentenceStart) || /^\d{1,2}$/.test(prev);
    return named ? `${prev}${gap}${modelNumber(n)}` : m;
  });

  // Every figure left.
  s = s.replace(/\d+(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+/g, (n) => figure(n));

  return s.replace(/\s+/g, " ").replace(/\s+([.,?!:;])/g, "$1").trim();
}
