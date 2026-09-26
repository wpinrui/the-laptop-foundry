import { type Results, results } from "../bench";
import { type Content, CONTENT } from "../content";
import { activeArea } from "../content/display";
import { type Rival, RIVALS } from "../content/rivals";
import { classify, costOf, type DeviceClass, weightOf } from "../price";
import { type Measurements, simulate } from "../sim";
import { type Specs, specs as specsOf } from "../sim/specs";
import { solve } from "../solve";
import type { Build, Fit, PanelOption, Part, Side } from "../types";

// The review: dice-roll scores, pros and cons against the rivals of the same
// year and class, and text assembled from hand-written templates. Pure data;
// the review site renders it. No language model writes any of it.

// ------------------------------------------------------------------ dice

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic random numbers from a seed string. */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATEGORIES = [
  "Chassis",
  "Keyboard",
  "Pointing device",
  "Connectivity",
  "Weight",
  "Battery life",
  "Display",
  "Games performance",
  "Application performance",
  "Temperature",
  "Noise",
  "Audio",
  "Camera",
] as const;

export interface Scores {
  overall: number;
  categories: { name: string; score: number }[];
}

/** Version 0.1 scoring: every score is a roll, fixed by the model id. */
export function rollScores(id: string): Scores {
  const r = rng(`scores:${id}`);
  const roll = () => Math.round((55 + r() * 41) * 10) / 10;
  const categories = CATEGORIES.map((name) => ({ name, score: roll() }));
  return { overall: roll(), categories };
}

// ------------------------------------------------------------------ measured facts

export interface Subject {
  id: string;
  name: string;
  company: string;
  build: Build;
}

export interface Facts {
  subject: Subject;
  fit: Fit;
  m: Measurements;
  r: Results | null;
  kg: number;
  cost: number;
  cls: DeviceClass;
  panel?: PanelOption;
  refresh: number;
  thickness: number;
  specs: Specs;
  /** Sides with a port that can charge the laptop. */
  chargeSides: Side[];
  /** Sides with any port. */
  portSides: Side[];
}

const factsCache = new Map<string, Facts>();

export function factsOf(s: Subject, content: Content = CONTENT): Facts {
  const key = `${s.id}:${JSON.stringify(s.build)}`;
  const hit = factsCache.get(key);
  if (hit) return hit;
  const fit = solve(s.build);
  const m = simulate(s.build, fit, content);
  const kg = weightOf(s.build, fit, content);
  const bp = s.build.parts.display?.[0];
  const panel = bp ? content.panels.find((p) => p.id === bp.part) : undefined;
  const f: Facts = {
    subject: s,
    fit,
    m,
    r: results(s.build, m, s.build.year, content),
    kg,
    cost: costOf(s.build, fit, content).total,
    cls: classify(s.build, fit, m, kg),
    panel,
    refresh: Number(bp?.opts?.refresh ?? panel?.refresh[0] ?? 60),
    thickness: fit.frame.z + fit.lidZ,
    specs: specsOf(s.build, content),
    chargeSides: [
      ...new Set(
        s.build.ports
          .filter((p) => {
            const part = content.parts.find((x) => x.id === p.part);
            const sh = part && !Array.isArray(part.shape) ? part.shape : undefined;
            return sh?.kind === "port" && !!sh.charges;
          })
          .map((p) => p.side),
      ),
    ],
    portSides: [...new Set(s.build.ports.map((p) => p.side))],
  };
  factsCache.set(key, f);
  return f;
}

export function rivalSubject(r: Rival): Subject {
  const maker = MAKER_NAMES[r.maker] ?? r.maker;
  return { id: r.id, name: r.name, company: maker, build: r.build };
}

const MAKER_NAMES: Record<string, string> = {
  tarrant: "Tarrant",
  halbrook: "Halbrook",
  denholm: "Denholm",
  quince: "Quince",
  arvane: "Arvane",
  ecker: "Ecker",
};

/** Rivals of the same year and class, widening until there are a few to compare. */
export function peersOf(f: Facts): Facts[] {
  const all = RIVALS.filter(
    (r) => r.build.year === f.subject.build.year && r.id !== f.subject.id,
  ).map((r) => factsOf(rivalSubject(r)));
  const tiers: ((p: Facts) => boolean)[] = [
    (p) =>
      p.cls.body === f.cls.body &&
      p.cls.performance === f.cls.performance &&
      p.cls.budget === f.cls.budget,
    (p) =>
      p.cls.body === f.cls.body && p.cls.performance === f.cls.performance,
    (p) => p.cls.performance === f.cls.performance,
    () => true,
  ];
  for (const t of tiers) {
    const found = all.filter(t);
    if (found.length >= 2 || t === tiers[tiers.length - 1]) {
      const price = f.subject.build.price ?? f.cost * 1.3;
      return found
        .sort(
          (a, b) =>
            Math.abs((a.subject.build.price ?? 0) - price) -
            Math.abs((b.subject.build.price ?? 0) - price),
        )
        .slice(0, 4);
    }
  }
  return [];
}

// ------------------------------------------------------------------ metrics

interface Metric {
  key: string;
  higher: boolean;
  value: (f: Facts) => number | null;
  pro: string;
  con: string;
}

const balancedWeb = (f: Facts) => {
  const b = f.m.battery;
  return b ? (b.runtime[b.balanced]?.web ?? null) : null;
};

const METRICS: Metric[] = [
  { key: "weight", higher: false, value: (f) => f.kg, pro: "Light for its class", con: "Heavy for its class" },
  { key: "thin", higher: false, value: (f) => f.thickness, pro: "Slim chassis", con: "Thick chassis" },
  { key: "battery", higher: true, value: balancedWeb, pro: "Long battery life", con: "Short battery life" },
  { key: "multi", higher: true, value: (f) => f.m.cooling?.sustained ?? null, pro: "Strong multi-core performance", con: "Weak multi-core performance" },
  { key: "single", higher: true, value: (f) => f.m.performance?.single ?? null, pro: "Quick single-core performance", con: "Slow single-core performance" },
  { key: "graphics", higher: true, value: (f) => f.m.cooling?.graphics.sustained ?? null, pro: "Fast graphics", con: "Weak graphics" },
  { key: "throttle", higher: true, value: (f) => (f.m.cooling ? f.m.cooling.sustained / f.m.cooling.firstRun : null), pro: "Holds its performance under sustained load", con: "Throttles under sustained load" },
  { key: "noise", higher: false, value: (f) => f.m.cooling?.noise.sustained ?? null, pro: "Quiet under load", con: "Loud under load" },
  { key: "skin", higher: false, value: (f) => f.m.cooling?.peakSkin ?? null, pro: "Stays cool to the touch", con: "Gets hot to the touch" },
  { key: "nits", higher: true, value: (f) => f.panel?.nits ?? null, pro: "Bright display", con: "Dim display" },
  { key: "pixels", higher: true, value: (f) => (f.panel ? f.panel.res[0] * f.panel.res[1] : null), pro: "Sharp high-resolution display", con: "Low display resolution" },
  { key: "ports", higher: true, value: (f) => f.subject.build.ports.length, pro: "Plenty of ports", con: "Few ports" },
  { key: "durable", higher: true, value: (f) => f.m.durability.index, pro: "Sturdy, durable case", con: "Case feels flimsy" },
  { key: "charge", higher: true, value: (f) => Math.min(2, f.chargeSides.length), pro: "Charges from either side", con: "Charges from one side only" },
  { key: "spread", higher: true, value: (f) => Math.min(3, f.portSides.length), pro: "Ports spread around the case", con: "Ports crowded onto few sides" },
  { key: "travel", higher: true, value: (f) => f.specs.keyboard?.travel ?? null, pro: "Deep key travel", con: "Shallow keyboard" },
  { key: "speakers", higher: true, value: (f) => (f.specs.speakers ? f.specs.speakers.drivers + (f.specs.speakers.bass ? 1 : 0) : 0), pro: "Full-sounding speakers", con: "Thin-sounding speakers" },
  { key: "webcam", higher: true, value: (f) => (f.specs.webcam ? f.specs.webcam.res[0] * f.specs.webcam.res[1] * (f.specs.webcam.ir ? 1.2 : 1) : 0), pro: "Sharp webcam", con: "Poor or missing webcam" },
];

export interface ProCon {
  pros: string[];
  cons: string[];
}

/** Standouts against the peers: best or worst of the field by a clear margin. */
export function prosAndCons(f: Facts, peers: Facts[]): ProCon {
  type Hit = { text: string; margin: number };
  const pros: Hit[] = [];
  const cons: Hit[] = [];
  const nearPros: Hit[] = [];
  const nearCons: Hit[] = [];
  for (const mt of METRICS) {
    const mine = mt.value(f);
    if (mine === null) continue;
    const others = peers
      .map((p) => mt.value(p))
      .filter((v): v is number => v !== null);
    if (others.length === 0) continue;
    const better = (a: number, b: number) => (mt.higher ? a > b : a < b);
    const best = others.reduce((a, b) => (better(a, b) ? a : b));
    const worst = others.reduce((a, b) => (better(a, b) ? b : a));
    // Capped so a yes-or-no metric against a zero does not drown out the rest.
    const rel = (a: number, b: number) =>
      Math.min(1, Math.abs(a - b) / Math.max(1e-9, Math.abs(b)));
    if (better(mine, best) && rel(mine, best) >= 0.02)
      pros.push({ text: mt.pro, margin: rel(mine, best) });
    else if (better(worst, mine) && rel(mine, worst) >= 0.02)
      cons.push({ text: mt.con, margin: rel(mine, worst) });
    else {
      // Near the top or bottom of the field still counts when nothing stands out further.
      const sorted = [...others].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const lead = rel(mine, median) * (better(mine, median) ? 1 : -1);
      if (lead > 0.02) nearPros.push({ text: mt.pro, margin: lead });
      if (lead < -0.02) nearCons.push({ text: mt.con, margin: -lead });
    }
  }
  if (pros.length === 0) pros.push(...nearPros.sort((a, b) => b.margin - a.margin).slice(0, 2));
  if (cons.length === 0) cons.push(...nearCons.sort((a, b) => b.margin - a.margin).slice(0, 2));
  const top = (xs: Hit[]) =>
    xs
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 4)
      .map((x) => x.text);
  return { pros: top(pros), cons: top(cons) };
}

// ------------------------------------------------------------------ text

export interface Table {
  caption: string;
  columns: string[];
  rows: { link?: string; subject?: boolean; cells: string[] }[];
}

export interface Section {
  id: string;
  title: string;
  paragraphs: string[];
  tables: Table[];
}

export interface Review {
  id: string;
  title: string;
  company: string;
  model: string;
  year: number;
  headline: string;
  verdict: string[];
  pros: string[];
  cons: string[];
  specs: [string, string][];
  sections: Section[];
  scores: Scores;
  price: number | null;
}

const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (n: number) => `$${num(n)}`;

/** Pick one of the variants, stable per review and slot, so text rarely repeats across reviews. */
function phraser(seed: string) {
  return (slot: string, variants: string[]) =>
    variants[Math.floor(rng(`${seed}:${slot}`)() * variants.length)];
}

function partName(content: Content, id: string | undefined): string {
  if (!id) return "";
  return content.parts.find((p) => p.id === id)?.name ?? id;
}

function partOf(content: Content, b: Build, cat: keyof Build["parts"]): Part | undefined {
  const id = b.parts[cat]?.[0]?.part;
  return id ? content.parts.find((p) => p.id === id) : undefined;
}

const PANEL_TYPE: Record<string, string> = {
  "tn-matte": "matte TN",
  "tn-glossy": "glossy TN",
  "ips-type": "wide-angle",
  "tn-led": "TN",
  ips: "IPS",
  oled: "OLED",
  "mini-led": "mini-LED",
};

const SIDE_NAME: Record<Side, string> = {
  left: "left",
  right: "right",
  rear: "rear",
  front: "front",
};

/**
 * What a real review would call this laptop, from the class, screen size and
 * era. Varied per model; the class names themselves never appear.
 */
export function laptopKind(f: Facts): string {
  const { budget, body, performance } = f.cls;
  const year = f.subject.build.year;
  const old = year < 2012;
  const inches = f.panel ? Math.round(f.panel.inches) : 0;
  const size = inches ? `${inches}-inch` : "";
  const incher = inches ? `${inches}-incher` : "";
  const thin = body === "thin and light";
  const large = body === "large";
  const premium = budget === "premium";
  const low = budget === "low";
  let kinds: string[];
  if (performance === "gaming") {
    kinds = premium
      ? ["high-end gaming notebook", "high-end gaming laptop", `${size} gaming flagship`]
      : low
        ? ["entry-level gaming laptop", "budget gaming notebook", `affordable ${size} gaming laptop`]
        : ["gaming laptop", `${size} gaming notebook`, "mid-range gaming laptop"];
    if (large) kinds.push(old ? "gaming desktop replacement" : `${size} gaming laptop`);
    if (thin) kinds.push(old ? "compact gaming notebook" : "thin gaming laptop");
  } else if (thin) {
    kinds = old
      ? [`${size} subnotebook`, "subnotebook", premium ? "business subnotebook" : low ? "budget subnotebook" : "compact notebook"]
      : premium
        ? ["premium ultrabook", `${size} ultraportable`, performance === "mixed-use" ? "creator ultrabook" : "business ultrabook"]
        : low
          ? ["affordable ultrabook", `budget ${size} ultraportable`, "entry-level subnotebook"]
          : ["ultrabook", `${size} ultraportable`, `${size} subnotebook`];
  } else if (large) {
    kinds =
      performance === "mixed-use"
        ? premium && !old
          ? [`workstation-class ${incher}`, "creator laptop", "desktop replacement"]
          : [old ? "multimedia desktop replacement" : "desktop replacement", `${size} multimedia laptop`, "big-screen all-rounder"]
        : [low ? "budget desktop replacement" : "desktop replacement", `big-screen ${size} office laptop`, `${size} office notebook`];
  } else if (performance === "mixed-use") {
    kinds = premium
      ? [old ? "premium multimedia notebook" : "creator laptop", `premium ${size} all-rounder`, `high-end ${size} notebook`]
      : low
        ? [`affordable ${size} all-rounder`, "budget multimedia laptop", `entry-level ${size} notebook`]
        : [old ? "multimedia notebook" : "multimedia laptop", `${size} all-rounder`, `mainstream ${incher}`];
  } else {
    kinds = premium
      ? ["business laptop", `${size} business notebook`, `premium ${size} office laptop`]
      : low
        ? ["budget office notebook", `affordable ${size} office laptop`, `entry-level ${incher}`]
        : ["office notebook", `${size} everyday laptop`, `mainstream ${size} office laptop`];
  }
  // Size-led wording needs a screen to size by.
  const pool = kinds.filter((k) => inches || (k === k.trim() && !k.includes("  ")));
  if (pool.length === 0) return "laptop";
  return pool[Math.floor(rng(`kind:${f.subject.id}`)() * pool.length)];
}

function memoryText(content: Content, b: Build): string {
  const bp = b.parts.memory?.[0];
  const part = partOf(content, b, "memory");
  if (!part) return "";
  const gb = bp?.opts?.capacity ?? part.options?.capacity?.[0];
  const cpu = partOf(content, b, "processor");
  const size = gb ?? cpu?.info?.onPackageGb;
  return `${size ? `${size} GB ` : ""}${part.name}`;
}

function storageText(content: Content, b: Build): string {
  return (b.parts.storage ?? [])
    .map((bp) => {
      const p = content.parts.find((x) => x.id === bp.part);
      const cap = Number(bp.opts?.capacity ?? p?.options?.capacity?.[0] ?? 0);
      const size = cap >= 1024 ? `${cap / 1024} TB` : `${cap} GB`;
      return `${size} ${p?.name ?? bp.part}`;
    })
    .join(", ");
}

function batteryWh(f: Facts): number {
  return f.m.battery?.wh ?? 0;
}

function valueWord(f: Facts, peers: Facts[]): { word: string; ratio: number } | null {
  const price = f.subject.build.price;
  const prices = peers.map((p) => p.subject.build.price ?? 0).filter((p) => p > 0);
  if (!price || prices.length === 0) return null;
  const perf = (x: Facts) =>
    (x.m.cooling?.sustained ?? 1) ** 0.5 * (x.m.cooling?.graphics.sustained ?? 1) ** 0.5;
  const mine = perf(f) / price;
  const theirs = peers.reduce((s, p) => s + perf(p) / (p.subject.build.price || price), 0) / peers.length;
  const ratio = mine / theirs;
  const word = ratio > 1.15 ? "bargain" : ratio < 0.8 ? "overpriced" : "fair";
  return { word, ratio };
}

function peerRow(p: Facts, cells: (x: Facts) => string[], subject = false) {
  return {
    link: subject ? undefined : p.subject.id,
    subject,
    cells: [`${p.subject.company} ${p.subject.name}`, ...cells(p)],
  };
}

function compare(
  caption: string,
  columns: string[],
  f: Facts,
  peers: Facts[],
  cells: (x: Facts) => string[],
): Table {
  return {
    caption,
    columns: ["", ...columns],
    rows: [peerRow(f, cells, true), ...peers.map((p) => peerRow(p, cells))],
  };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const an = (word: string) => `${/^(?:[aeiou]|8|1[18](?:\D|$))/i.test(word) ? "an" : "a"} ${word}`;

/** Build the whole review for a model or a rival. */
export function reviewOf(s: Subject, content: Content = CONTENT): Review {
  const f = factsOf(s, content);
  const peers = peersOf(f);
  const say = phraser(s.id);
  const b = s.build;
  const full = `${s.company} ${s.name}`;
  const cpu = partName(content, b.parts.processor?.[0]?.part);
  const gpuPart = partOf(content, b, "graphics");
  const cpuPart = partOf(content, b, "processor");
  const gpu = gpuPart?.name ?? String(cpuPart?.info?.igpu ?? "integrated graphics");
  const kind = laptopKind(f);
  const pc = prosAndCons(f, peers);
  const value = valueWord(f, peers);
  const c = f.m.cooling;
  const perf = f.m.performance;
  const bat = f.m.battery;
  const sp = f.specs;
  const lower = (xs: string[]) => xs.map((p) => p.toLowerCase()).join(", ");

  // ---------------------------------------------------------------- verdict
  const verdict: string[] = [];
  verdict.push(
    say("open", [
      `The ${full} is ${an(kind)} built around the ${cpu} and ${gpu}.`,
      `With the ${cpu} and ${gpu} inside, the ${full} makes for ${an(kind)}.`,
      `${s.company} pitches the ${s.name} as ${an(kind)}, and on paper the ${cpu} and ${gpu} fit that brief.`,
      `Our test unit of the ${full} pairs the ${cpu} with ${gpu}, which makes it ${an(kind)}.`,
      `${s.company} enters the ${kind} market with the ${s.name}, powered by the ${cpu} and ${gpu}.`,
      `The ${s.name} is ${s.company}'s take on ${an(kind)}: ${cpu} for the processor, ${gpu} for graphics.`,
    ]),
  );
  if (pc.pros.length)
    verdict.push(
      say("pros", [
        `Where it stands out: ${lower(pc.pros)}.`,
        `Against its rivals it earns praise on these points: ${lower(pc.pros)}.`,
        `Its strengths are clear: ${lower(pc.pros)}.`,
        `Next to the competition, a few things impress: ${lower(pc.pros)}.`,
        `There is plenty to like here: ${lower(pc.pros)}.`,
      ]),
    );
  if (pc.cons.length)
    verdict.push(
      say("cons", [
        `On the other hand, the field does better on ${pc.cons.length === 1 ? "one front" : "several fronts"}: ${lower(pc.cons)}.`,
        `Buyers should weigh the weak spots: ${lower(pc.cons)}.`,
        `It is not flawless. Our list of complaints: ${lower(pc.cons)}.`,
        `Rivals have the edge in places: ${lower(pc.cons)}.`,
        `A few things hold it back: ${lower(pc.cons)}.`,
      ]),
    );
  const price = b.price ?? null;
  if (price && value) {
    const t = {
      bargain: [
        `At ${usd(price)} it is a bargain next to rivals that ask more for less.`,
        `For ${usd(price)} it undercuts the competition on value.`,
        `${usd(price)} buys a lot of laptop here. Few rivals match it for the money.`,
        `Priced at ${usd(price)}, it makes the competition look expensive.`,
        `The ${usd(price)} asking price is the icing on the cake: this is strong value.`,
      ],
      fair: [
        `At ${usd(price)} the asking price is in line with what rivals charge.`,
        `The ${usd(price)} price tag is fair for what you get.`,
        `${usd(price)} is about what we expected for this class.`,
        `For ${usd(price)} it neither undercuts nor overcharges its rivals.`,
        `Its ${usd(price)} price sits squarely in the middle of the field.`,
      ],
      overpriced: [
        `At ${usd(price)} it is overpriced: comparable rivals deliver more for the money.`,
        `We struggle to justify ${usd(price)} when rivals offer more for less.`,
        `${usd(price)} is a steep ask for what is inside.`,
        `The ${usd(price)} price is hard to defend against cheaper, faster rivals.`,
        `For ${usd(price)} we expected more. Rivals offer better value.`,
      ],
    }[value.word as "bargain" | "fair" | "overpriced"];
    verdict.push(say("value", t));
  } else if (!price) {
    verdict.push(
      say("noprice", [
        "Pricing had not been announced when we tested it.",
        `${s.company} had not set a price at the time of testing.`,
        "We will update this verdict once pricing is known.",
        "No price was available for our review unit.",
        "Without a price, we cannot yet judge its value.",
      ]),
    );
  }

  // ---------------------------------------------------------------- specs
  const panel = f.panel;
  const kbSpec = sp.keyboard;
  const camSpec = sp.webcam;
  const spkSpec = sp.speakers;
  const lightWord = (l: string) =>
    ({
      none: "no backlight",
      "lid-light": "a lid-mounted keyboard light",
      backlit: "a backlight",
      white: "a white backlight",
      "rgb-zones": "RGB zone lighting",
      "rgb-per-key": "per-key RGB lighting",
    })[l] ?? l;
  const portList = [...f.portSides]
    .map((side) => {
      const n = b.ports.filter((p) => p.side === side).length;
      return `${n} ${SIDE_NAME[side]}`;
    })
    .join(", ");
  const specs: [string, string][] = [
    ["Processor", cpu],
    ["Graphics", gpu],
    ["Memory", memoryText(content, b)],
    ["Storage", storageText(content, b)],
    [
      "Display",
      panel
        ? `${panel.inches} inch, ${panel.res[0]} x ${panel.res[1]}, ${PANEL_TYPE[panel.type] ?? panel.type}, ${f.refresh} Hz, ${panel.nits} nits, ${panel.gamut}`
        : "",
    ],
    [
      "Keyboard",
      kbSpec
        ? `${num(kbSpec.travel, 1)} mm travel, ${kbSpec.pitch} mm pitch, ${kbSpec.numpad ? "numpad" : "no numpad"}, ${lightWord(kbSpec.light).replace(/^a /, "")}`
        : "",
    ],
    ["Battery", `${num(batteryWh(f), batteryWh(f) % 1 ? 1 : 0)} Wh`],
    ["Wireless", partName(content, b.parts.wireless?.[0]?.part)],
    ["Ports", b.ports.length ? `${b.ports.length} (${portList})` : "None"],
    ["Optical drive", partName(content, b.parts.optical?.[0]?.part) || "None"],
    [
      "Webcam",
      camSpec
        ? `${camSpec.res[0]} x ${camSpec.res[1]}${camSpec.ir ? ", IR" : ""}${camSpec.shutter ? ", privacy shutter" : ""}`
        : "None",
    ],
    [
      "Speakers",
      spkSpec
        ? `${spkSpec.channels === "mono" ? "Mono" : "Stereo"}, ${spkSpec.drivers} ${spkSpec.drivers === 1 ? "driver" : "drivers"}${spkSpec.bass ? " with bass" : ""}`
        : "None",
    ],
    [
      "Size",
      `${num(f.fit.frame.x)} x ${num(f.fit.frame.y)} x ${num(f.thickness, 1)} mm`,
    ],
    ["Weight", `${num(f.kg, 2)} kg`],
    ["Price", price ? usd(price) : "Not announced"],
  ];

  const sections: Section[] = [];

  // ---------------------------------------------------------------- case
  const mats = new Set([b.materials.floor, b.materials.deck, b.materials.lid]);
  const matNames = [...mats].map(
    (id) =>
      content.materials
        .find((m) => m.id === id)
        ?.name.replace(/\s*\(.*\)/, "")
        .toLowerCase() ?? id,
  );
  const bySide = new Map<Side, string[]>();
  for (const p of b.ports) {
    const list = bySide.get(p.side) ?? [];
    list.push(partName(content, p.part));
    bySide.set(p.side, list);
  }
  const portText = [...bySide.entries()]
    .map(([side, list]) => `the ${SIDE_NAME[side]} side has ${list.join(", ")}`)
    .join("; ");
  const dur = f.m.durability;
  const lidName = content.materials
    .find((m) => m.id === b.materials.lid)
    ?.name.replace(/\s*\(.*\)/, "")
    .toLowerCase();
  const durText =
    dur.index >= 0.65
      ? say("durable", [
          `The case feels built to last. The base survived our ${dur.dropCm} cm drop test, and the ${lidName} lid flexes only ${num(dur.lidFlexMm, 1)} mm under a firm press.`,
          `Build quality is excellent: barely ${num(dur.lidFlexMm, 1)} mm of lid flex, and no damage after a ${dur.dropCm} cm drop.`,
          `This is a sturdy machine. It shrugged off a ${dur.dropCm} cm drop, and the lid gives just ${num(dur.lidFlexMm, 1)} mm when pressed.`,
          `Nothing creaks. The ${lidName} lid bends a mere ${num(dur.lidFlexMm, 1)} mm, and the base came through a ${dur.dropCm} cm drop intact.`,
          `${s.company} has built this one to take a beating: ${dur.dropCm} cm drops and ${num(dur.lidFlexMm, 1)} mm of lid flex.`,
        ])
      : dur.index >= 0.45
        ? say("durable", [
            `Build quality is decent. The base survived a ${dur.dropCm} cm drop, though the lid flexes ${num(dur.lidFlexMm, 1)} mm under pressure.`,
            `The case is solid enough for daily use: ${dur.dropCm} cm in our drop test and ${num(dur.lidFlexMm, 1)} mm of lid flex.`,
            `Sturdiness is average for the class. The lid gives ${num(dur.lidFlexMm, 1)} mm, and the base came through a ${dur.dropCm} cm drop.`,
            `Nothing about the build worries us, nor does it impress: ${num(dur.lidFlexMm, 1)} mm of lid flex, ${dur.dropCm} cm drop survived.`,
            `The ${lidName} lid flexes ${num(dur.lidFlexMm, 1)} mm when pressed. The base survived our ${dur.dropCm} cm drop.`,
          ])
        : say("durable", [
            `Build quality is a weak point. The lid flexes ${num(dur.lidFlexMm, 1)} mm under a light press, and the base cracked above ${dur.dropCm} cm.`,
            `The case feels cheap. It creaks when lifted by a corner, and the lid gives ${num(dur.lidFlexMm, 1)} mm under pressure.`,
            `Durability is a concern: the base only survived a ${dur.dropCm} cm drop, and the ${lidName} lid bends ${num(dur.lidFlexMm, 1)} mm.`,
            `We would not toss this one in a bag carelessly. It failed our drop test above ${dur.dropCm} cm.`,
            `Flex is everywhere. The lid gives ${num(dur.lidFlexMm, 1)} mm, and the base cracked in a drop from above ${dur.dropCm} cm.`,
          ]);
  const chargeText =
    f.chargeSides.length >= 2
      ? say("charge", [
          `It charges from either side, so the cable always reaches.`,
          `A welcome touch: charging works from the ${f.chargeSides.map((x) => SIDE_NAME[x]).join(" and ")} sides.`,
          `Since it can charge from ${f.chargeSides.length} sides, desk placement is never a problem.`,
          `Charge-capable ports on both sides mean the power cable goes wherever the socket is.`,
          `We appreciate being able to plug the charger into either side.`,
        ])
      : f.chargeSides.length === 1
        ? say("charge", [
            `Charging only works from the ${SIDE_NAME[f.chargeSides[0]]} side.`,
            `The charger has to go into the ${SIDE_NAME[f.chargeSides[0]]} side, which can be awkward on some desks.`,
            `Power comes in on the ${SIDE_NAME[f.chargeSides[0]]} side only.`,
            `There is one place to charge from: the ${SIDE_NAME[f.chargeSides[0]]} side.`,
            `All charging happens on the ${SIDE_NAME[f.chargeSides[0]]} side.`,
          ])
        : "";
  const wireless = partName(content, b.parts.wireless?.[0]?.part);
  sections.push({
    id: "case",
    title: "Case and connectivity",
    paragraphs: [
      say("case1", [
        `The chassis is made of ${matNames.join(" and ")} and measures ${num(f.fit.frame.x)} by ${num(f.fit.frame.y)} mm at ${num(f.thickness, 1)} mm thick. It weighs ${num(f.kg, 2)} kg.`,
        `${s.company} builds the ${s.name} from ${matNames.join(" and ")}. At ${num(f.thickness, 1)} mm and ${num(f.kg, 2)} kg it is ${f.cls.body === "thin and light" ? "easy to carry" : f.cls.body === "large" ? "a desk-bound machine" : "portable enough for the odd trip"}.`,
        `Measuring ${num(f.fit.frame.x)} by ${num(f.fit.frame.y)} by ${num(f.thickness, 1)} mm and weighing ${num(f.kg, 2)} kg, the ${s.name} uses ${matNames.join(" and ")} for its case.`,
        `The ${s.name} tips the scales at ${num(f.kg, 2)} kg. Its ${matNames.join(" and ")} case is ${num(f.thickness, 1)} mm thick.`,
        `In the hand, the ${num(f.kg, 2)} kg ${s.name} feels ${f.kg < 1.6 ? "light" : f.kg > 2.8 ? "hefty" : "reasonable"}. The case is ${matNames.join(" and ")}, ${num(f.thickness, 1)} mm thick.`,
      ]),
      durText,
      [
        portText
          ? `${portText.charAt(0).toUpperCase()}${portText.slice(1)}.`
          : "There are no ports to speak of.",
        chargeText,
      ]
        .filter(Boolean)
        .join(" "),
      wireless
        ? say("wireless", [
            `Wireless duties fall to ${wireless}.`,
            `For wireless, ${s.company} fits ${wireless}.`,
            `The wireless module is ${wireless}.`,
            `Networking without cables is handled by ${wireless}.`,
            `${wireless} takes care of wireless connections.`,
          ])
        : "There is no wireless module at all.",
    ],
    tables: [
      compare("Size and weight", ["Weight", "Thickness", "Ports"], f, peers, (x) => [
        `${num(x.kg, 2)} kg`,
        `${num(x.thickness, 1)} mm`,
        String(x.subject.build.ports.length),
      ]),
      compare("Durability", ["Drop test", "Lid flex"], f, peers, (x) => [
        `${x.m.durability.dropCm} cm`,
        `${num(x.m.durability.lidFlexMm, 1)} mm`,
      ]),
    ],
  });

  // ---------------------------------------------------------------- input
  const pad = b.parts.trackpad?.[0];
  const padPart = partOf(content, b, "trackpad");
  const stick = String(pad?.opts?.stick ?? padPart?.options?.stick?.[0] ?? "no") === "yes";
  const haptic = String(pad?.opts?.mechanism ?? padPart?.options?.mechanism?.[0] ?? "") === "haptic";
  const deep = (kbSpec?.travel ?? 0) >= 1.8;
  const kbText = kbSpec
    ? say("kb", [
        `The keyboard offers ${num(kbSpec.travel, 1)} mm of travel on a ${kbSpec.pitch} mm pitch, ${kbSpec.numpad ? "with a numpad" : "without a numpad"}, and ${lightWord(kbSpec.light)}.`,
        `Typing on the ${num(kbSpec.travel, 1)} mm keyboard is ${deep ? "a pleasure thanks to deep travel" : "fine, if shallow"}. ${kbSpec.light === "none" ? "There is no backlight." : `It has ${lightWord(kbSpec.light)}.`}`,
        `${deep ? "Key travel is generous" : "Key travel is short"} at ${num(kbSpec.travel, 1)} mm${kbSpec.mechanical ? ", and the switches are mechanical" : ""}. ${kbSpec.numpad ? "A numpad sits to the right." : "There is no numpad."}`,
        `With ${num(kbSpec.travel, 1)} mm travel and ${kbSpec.pitch} mm keys, ${kbSpec.pitch < 19 ? "the layout feels cramped" : "the layout is full size"}. Lighting: ${lightWord(kbSpec.light)}.`,
        `${kbSpec.mechanical ? "Mechanical switches" : "The keys"} give ${num(kbSpec.travel, 1)} mm of travel${deep ? ", deep by laptop standards" : ", on the shallow side"}. ${kbSpec.light === "none" ? "Typing in the dark is guesswork." : `${cap(lightWord(kbSpec.light))} helps in the dark.`}`,
      ])
    : "";
  const padText = say("pad", [
    `The ${padPart?.name ?? "trackpad"} trackpad${haptic ? " uses haptic feedback" : " clicks mechanically"}${stick ? ", and a pointing stick sits in the keyboard" : ""}.`,
    `Below the keys sits a ${padPart?.name ?? ""} ${haptic ? "haptic" : "mechanical"} trackpad${stick ? ", backed up by a pointing stick" : ""}.`,
    `Pointing duties go to a ${padPart?.name ?? ""} trackpad that ${haptic ? "simulates its click with haptics" : "clicks mechanically"}${stick ? ", plus a pointing stick" : ""}.`,
    `The ${haptic ? "haptic" : "mechanical"} trackpad measures ${padPart?.name ?? "a modest size"}${stick ? ". Pointing stick fans are catered for too" : ""}.`,
    `${stick ? "Alongside a pointing stick, the" : "The"} ${padPart?.name ?? ""} trackpad ${haptic ? "clicks anywhere thanks to haptics" : "has a physical click"}.`,
  ]);
  sections.push({
    id: "input",
    title: "Input devices",
    paragraphs: [kbText, padText].filter(Boolean),
    tables: [],
  });

  // ---------------------------------------------------------------- camera
  const camText = camSpec
    ? say("cam", [
        `The webcam records at ${camSpec.res[0]} x ${camSpec.res[1]} (${num(camSpec.megapixels, 1)} MP). ${camSpec.megapixels >= 2 ? "Video calls look crisp" : camSpec.megapixels >= 0.9 ? "Video calls look acceptable in good light" : "Images are grainy and soft"}.${camSpec.ir ? " An IR sensor enables face login." : ""}${camSpec.shutter ? " A physical shutter covers the lens when not in use." : ""}`,
        `Above the display sits a ${num(camSpec.megapixels, 1)} MP camera. ${camSpec.megapixels >= 2 ? "It is among the better laptop webcams we have tested" : "It is adequate for video chat but little more"}.${camSpec.ir ? " Face login via IR works quickly." : ""}${camSpec.shutter ? " Privacy is covered by a sliding shutter." : ""}`,
        `${camSpec.megapixels >= 2 ? "Webcam quality is good" : "Webcam quality is middling"}: ${camSpec.res[0]} x ${camSpec.res[1]} pixels${camSpec.ir ? ", with IR for face recognition" : ""}.${camSpec.shutter ? " A shutter lets you block it physically." : ""}`,
        `The ${camSpec.res[0]} x ${camSpec.res[1]} webcam ${camSpec.megapixels >= 2 ? "delivers sharp, well-exposed video" : camSpec.megapixels >= 0.9 ? "is fine for calls" : "produces noisy, washed-out images"}.${camSpec.ir ? " IR face login is included." : ""}${camSpec.shutter ? " There is a privacy shutter." : " There is no privacy shutter."}`,
        `For video calls, ${s.company} fits a ${num(camSpec.megapixels, 1)} MP sensor${camSpec.ir ? " with IR" : ""}. ${camSpec.megapixels >= 2 ? "Colleagues will see you clearly" : "Do not expect much detail"}.${camSpec.shutter ? " A shutter keeps it private." : ""}`,
      ])
    : say("cam", [
        "There is no webcam, so video calls need an external camera.",
        `${s.company} leaves out the webcam entirely.`,
        "No webcam is fitted.",
        "Video calls will need a USB camera: none is built in.",
        "The bezel holds no webcam.",
      ]);
  sections.push({
    id: "camera",
    title: "Webcam",
    paragraphs: [camText],
    tables: [
      compare("Webcam", ["Resolution", "IR"], f, peers, (x) => [
        x.specs.webcam ? `${x.specs.webcam.res[0]} x ${x.specs.webcam.res[1]}` : "None",
        x.specs.webcam?.ir ? "Yes" : "No",
      ]),
    ],
  });

  // ---------------------------------------------------------------- display
  if (panel) {
    const area = activeArea(panel);
    const ppi = panel.res[0] / (area.x / 25.4);
    const typeName = PANEL_TYPE[panel.type] ?? panel.type;
    sections.push({
      id: "display",
      title: "Display",
      paragraphs: [
        say("disp", [
          `The ${panel.inches} inch ${typeName} panel runs at ${panel.res[0]} x ${panel.res[1]} (${num(ppi)} ppi) and ${f.refresh} Hz.`,
          `${s.company} fits a ${panel.inches} inch ${typeName} screen with ${panel.res[0]} x ${panel.res[1]} pixels, a density of ${num(ppi)} ppi.`,
          `${cap(an(typeName))} display of ${panel.inches} inches shows ${panel.res[0]} x ${panel.res[1]} pixels at up to ${f.refresh} Hz.`,
          `The screen measures ${panel.inches} inches across. It is ${an(typeName)} panel with ${panel.res[0]} x ${panel.res[1]} pixels, or ${num(ppi)} ppi.`,
          `Resolution is ${panel.res[0]} x ${panel.res[1]} on a ${panel.inches} inch ${typeName} panel refreshing at ${f.refresh} Hz.`,
        ]),
        `${say("nits", [
          `We measured ${panel.nits} nits in the centre and ${panel.gamut} coverage.`,
          `Brightness peaks at ${panel.nits} nits, and colours cover ${panel.gamut}.`,
          `Our colorimeter reads ${panel.nits} nits and ${panel.gamut}.`,
          `At ${panel.nits} nits it is ${panel.nits >= 400 ? "bright enough for outdoor use" : panel.nits >= 250 ? "fine indoors" : "dim even indoors"}. Coverage is ${panel.gamut}.`,
          `The panel reaches ${panel.nits} nits with ${panel.gamut} colour coverage.`,
        ])} ${
          panel.type.startsWith("tn")
            ? "As a TN panel, colours shift quickly when viewed off axis."
            : panel.type === "oled"
              ? "Blacks are perfect, as expected from OLED."
              : "Viewing angles are wide."
        }${panel.type.includes("glossy") || panel.type === "oled" ? " The glossy surface reflects bright surroundings." : ""}`,
      ],
      tables: [
        compare("Display", ["Brightness", "Resolution", "Gamut"], f, peers, (x) => [
          x.panel ? `${x.panel.nits} nits` : "",
          x.panel ? `${x.panel.res[0]} x ${x.panel.res[1]}` : "",
          x.panel?.gamut ?? "",
        ]),
      ],
    });
  }

  // ---------------------------------------------------------------- performance
  if (perf && c && f.r) {
    const bench = f.r.bench;
    const drop = 1 - c.sustained / c.firstRun;
    const native = f.r.games.find((g) => g.runs?.some((x) => x.native))?.runs?.find((x) => x.native);
    const gameRows: Table["rows"] = (["low", "medium", "high", "ultra"] as const).map((preset) => ({
      cells: [
        preset.charAt(0).toUpperCase() + preset.slice(1),
        ...f.r!.games.map((g) => {
          const run = g.runs?.find((x) => x.preset === preset && !x.native);
          return run ? num(run.fps) : "—";
        }),
      ],
    }));
    if (native)
      gameRows.push({
        cells: [
          `Native ${native.res[0]} x ${native.res[1]}`,
          ...f.r.games.map((g) => {
            const run = g.runs?.find((x) => x.native);
            return run ? num(run.fps) : "—";
          }),
        ],
      });
    sections.push({
      id: "performance",
      title: "Performance",
      paragraphs: [
        bench.multi === null
          ? `${bench.name} refuses to run: the ${cpu} lacks an instruction set it needs.`
          : say("bench", [
              `In ${bench.name} the ${cpu} scores ${num(bench.single ?? 0)} points single-core and ${num(bench.multi)} points multi-core over a 30 minute loop.`,
              `Our ${bench.name} loop settles at ${num(bench.multi)} points multi-core, with ${num(bench.single ?? 0)} points single-core.`,
              `${bench.name} gives ${num(bench.single ?? 0)} points on one core and ${num(bench.multi)} on all of them.`,
              `The ${cpu} manages ${num(bench.multi)} points in the ${bench.name} multi-core loop and ${num(bench.single ?? 0)} single-core.`,
              `Single-core, ${bench.name} reports ${num(bench.single ?? 0)} points. Multi-core, the loop averages ${num(bench.multi)}.`,
            ]),
        drop > 0.08
          ? say("drop", [
              `Sustained load costs it ${num(drop * 100)} percent: the processor starts at ${num(c.cpuWatts.first)} W and settles at ${num(c.cpuWatts.sustained)} W.`,
              `The cooling cannot hold the boost. Power falls from ${num(c.cpuWatts.first)} W to ${num(c.cpuWatts.sustained)} W and performance drops ${num(drop * 100)} percent.`,
              `After a strong start at ${num(c.cpuWatts.first)} W, the processor throttles to ${num(c.cpuWatts.sustained)} W, losing ${num(drop * 100)} percent.`,
              `Performance fades under load: ${num(drop * 100)} percent down by the end of the loop, at ${num(c.cpuWatts.sustained)} W.`,
              `Heat takes its toll. The chip drops from ${num(c.cpuWatts.first)} W to ${num(c.cpuWatts.sustained)} W, and scores fall ${num(drop * 100)} percent.`,
            ])
          : say("hold", [
              `Performance holds steady over the loop at ${num(c.cpuWatts.sustained)} W.`,
              `The cooling keeps up: the processor sustains ${num(c.cpuWatts.sustained)} W with barely any drop.`,
              `There is no throttling to speak of. The chip holds ${num(c.cpuWatts.sustained)} W throughout.`,
              `Scores stay flat across the loop, with the processor at a steady ${num(c.cpuWatts.sustained)} W.`,
              `The ${cpu} keeps its ${num(c.cpuWatts.sustained)} W for the full 30 minutes.`,
            ]),
        (() => {
          const hard = f.r.games.find((g) => g.id === "ashfall");
          const run = hard?.runs?.find((x) => x.preset === "high" && !x.native);
          if (!hard) return "";
          if (!run) return `${hard.name} refuses to run on the ${gpu}.`;
          return run.fps >= 60
            ? say("game", [
                `Demanding games are no problem: ${hard.name} runs at ${num(run.fps)} fps on high settings.`,
                `${hard.name} flies at ${num(run.fps)} fps on high.`,
                `Even ${hard.name} on high settings holds ${num(run.fps)} fps.`,
                `The ${gpu} handles ${hard.name} at ${num(run.fps)} fps on high with ease.`,
                `Gamers will be pleased: ${num(run.fps)} fps in ${hard.name} on high.`,
              ])
            : run.fps >= 30
              ? say("game", [
                  `${hard.name} is playable at ${num(run.fps)} fps on high settings.`,
                  `On high, ${hard.name} manages ${num(run.fps)} fps: playable, not smooth.`,
                  `${hard.name} runs at ${num(run.fps)} fps on high, good enough for casual play.`,
                  `The ${gpu} gets ${hard.name} to ${num(run.fps)} fps on high settings.`,
                  `Expect around ${num(run.fps)} fps in ${hard.name} on high.`,
                ])
              : say("game", [
                  `${hard.name} struggles at ${num(run.fps)} fps on high settings; lower presets are a must.`,
                  `At ${num(run.fps)} fps on high, ${hard.name} is a slideshow.`,
                  `The ${gpu} is out of its depth in ${hard.name}: ${num(run.fps)} fps on high.`,
                  `${hard.name} on high manages only ${num(run.fps)} fps.`,
                  `Only the low presets make ${hard.name} playable. High gives ${num(run.fps)} fps.`,
                ]);
        })(),
      ].filter(Boolean),
      tables: [
        { caption: "Games (fps)", columns: ["", ...f.r.games.map((g) => g.name)], rows: gameRows },
        compare(bench.name, ["Single-core", "Multi-core", "Graphics"], f, peers, (x) => [
          x.r?.bench.single == null ? "—" : num(x.r.bench.single),
          x.r?.bench.multi == null ? "—" : num(x.r.bench.multi),
          x.m.cooling ? num(x.m.cooling.graphics.sustained) : "",
        ]),
      ],
    });

    // ---------------------------------------------------------------- emissions
    sections.push({
      id: "emissions",
      title: "Emissions",
      paragraphs: [
        c.noise.sustained < 30
          ? say("quiet", [
              "The fans are all but inaudible, even under load.",
              `Even under sustained load it stays at ${num(c.noise.sustained, 1)} dB(A), close to silent.`,
              `We measured just ${num(c.noise.sustained, 1)} dB(A) under load. A library would not mind.`,
              `Noise is a non-issue at ${num(c.noise.sustained, 1)} dB(A) under load.`,
              `The cooling works quietly: ${num(c.noise.sustained, 1)} dB(A) at most.`,
            ])
          : c.noise.sustained < 42
            ? say("mid", [
                `Under load the fans rise to ${num(c.noise.sustained, 1)} dB(A), noticeable but not intrusive. At idle we measured ${num(c.noise.idle, 1)} dB(A).`,
                `At idle it hums at ${num(c.noise.idle, 1)} dB(A). Under load that climbs to ${num(c.noise.sustained, 1)} dB(A).`,
                `The fans are audible under load at ${num(c.noise.sustained, 1)} dB(A), but never shrill.`,
                `Expect ${num(c.noise.sustained, 1)} dB(A) when working hard and ${num(c.noise.idle, 1)} dB(A) at rest.`,
                `Noise stays moderate: ${num(c.noise.sustained, 1)} dB(A) under sustained load.`,
              ])
            : say("loud", [
                `Under sustained load the fans reach ${num(c.noise.sustained, 1)} dB(A), loud enough that headphones are advisable.`,
                `This is a loud machine: ${num(c.noise.sustained, 1)} dB(A) under load.`,
                `The fans roar at ${num(c.noise.sustained, 1)} dB(A) under load.`,
                `At ${num(c.noise.sustained, 1)} dB(A), it will not go unnoticed in a quiet office.`,
                `Load sends the fans to ${num(c.noise.sustained, 1)} dB(A). Bring headphones.`,
              ]),
        say("temp", [
          `During the stress test the hottest spot on the case reached ${num(c.peakSkin)} °C and the processor peaked at ${num(c.peakDie)} °C.`,
          `The case peaks at ${num(c.peakSkin)} °C under combined load, with the processor at ${num(c.peakDie)} °C.`,
          `Surface temperatures top out at ${num(c.peakSkin)} °C. Inside, the processor reaches ${num(c.peakDie)} °C.`,
          `Our thermal camera finds a ${num(c.peakSkin)} °C hotspot, while the processor hits ${num(c.peakDie)} °C.`,
          `Under stress, the processor reaches ${num(c.peakDie)} °C and the case ${num(c.peakSkin)} °C.`,
        ]) + (c.peakSkin > 48 ? " That is too hot to rest on a lap." : ""),
      ],
      tables: [
        {
          caption: "Surface temperature under load (°C)",
          columns: ["", "Left", "Centre", "Right"],
          rows: (["top", "bottom"] as const).flatMap((face) =>
            c.surface.readings.load[face].map((row, i) => ({
              cells: [
                `${face === "top" ? "Top" : "Bottom"}, ${["rear", "middle", "front"][i]}`,
                ...row.map((v) => num(v, 1)),
              ],
            })),
          ),
        },
        compare("Noise and temperature", ["Idle", "Load", "Surface"], f, peers, (x) =>
          x.m.cooling
            ? [
                `${num(x.m.cooling.noise.idle, 1)} dB(A)`,
                `${num(x.m.cooling.noise.sustained, 1)} dB(A)`,
                `${num(x.m.cooling.peakSkin)} °C`,
              ]
            : ["", "", ""],
        ),
      ],
    });
  }

  // ---------------------------------------------------------------- speakers
  const drivers = spkSpec ? spkSpec.drivers + (spkSpec.bass ? 1 : 0) : 0;
  const audio = spkSpec
    ? drivers >= 5
      ? say("spk", [
          `The ${spkSpec.drivers}-driver speaker system is excellent for a laptop, with real bass and plenty of volume.`,
          `Sound is a highlight: ${spkSpec.drivers} drivers deliver full, room-filling audio.`,
          `With ${spkSpec.drivers} drivers, music and films sound rich and loud.`,
          `${s.company} has not skimped on audio. The ${spkSpec.drivers} drivers produce deep bass and clear highs.`,
          `The speakers impress: ${spkSpec.drivers} drivers, noticeable bass, no distortion at full volume.`,
        ])
      : drivers >= 3
        ? say("spk", [
            `The ${spkSpec.channels} speakers ${spkSpec.bass ? "get help from dedicated bass drivers" : "are loud enough"}, making films enjoyable.`,
            `Audio is above average. ${spkSpec.drivers} drivers${spkSpec.bass ? ", including bass," : ""} give sound some body.`,
            `The ${spkSpec.drivers} speakers sound fuller than most in this class.`,
            `Sound is decent: ${spkSpec.bass ? "there is some bass" : "clear mids"} from ${spkSpec.drivers} drivers.`,
            `For casual listening, the ${spkSpec.drivers}-driver system does the job well.`,
          ])
        : say("spk", [
            `The ${spkSpec.channels} speakers sound thin, with no bass to speak of.`,
            `Audio comes from ${spkSpec.drivers === 1 ? "a single small speaker" : `${spkSpec.drivers} small speakers`}. Headphones are recommended.`,
            `The speakers are fine for system sounds and calls, little more.`,
            `Sound is tinny and distorts at high volume.`,
            `${spkSpec.channels === "mono" ? "Mono sound" : "The stereo speakers"} lack depth.`,
          ])
    : "There are no speakers.";
  sections.push({
    id: "audio",
    title: "Speakers",
    paragraphs: [audio],
    tables: [
      compare("Speakers", ["Channels", "Drivers"], f, peers, (x) => [
        x.specs.speakers ? (x.specs.speakers.channels === "mono" ? "Mono" : "Stereo") : "None",
        x.specs.speakers ? String(x.specs.speakers.drivers) : "0",
      ]),
    ],
  });

  // ---------------------------------------------------------------- energy
  if (bat) {
    const rt = bat.runtime[bat.balanced];
    const dr = bat.draw[bat.balanced];
    const wh = num(bat.wh, bat.wh % 1 ? 1 : 0);
    if (rt && dr)
      sections.push({
        id: "energy",
        title: "Energy management",
        paragraphs: [
          say("energy1", [
            `We test battery life at 150 nits. The ${wh} Wh battery lasts ${num(rt.web, 1)} hours browsing over Wi-Fi and ${num(rt.video, 1)} hours of video.`,
            `At 150 nits, the ${wh} Wh pack gives ${num(rt.web, 1)} hours of web browsing and ${num(rt.video, 1)} hours of video.`,
            `Battery tests run at 150 nits. Browsing lasts ${num(rt.web, 1)} hours, video ${num(rt.video, 1)} hours, from ${wh} Wh.`,
            `With its ${wh} Wh battery, the ${s.name} browses for ${num(rt.web, 1)} hours and plays video for ${num(rt.video, 1)} hours.`,
            `${num(rt.web, 1)} hours of Wi-Fi browsing and ${num(rt.video, 1)} hours of video: that is what ${wh} Wh buys at 150 nits.`,
          ]),
          say("energy2", [
            `Power draw ranges from ${num(dr.idle, 1)} W at idle to ${num(dr.load, 1)} W under full load, where the battery is flat after ${num(rt.load * 60)} minutes.`,
            `At idle it draws ${num(dr.idle, 1)} W. Under full load that rises to ${num(dr.load, 1)} W, emptying the battery in ${num(rt.load * 60)} minutes.`,
            `Full load pulls ${num(dr.load, 1)} W and drains the battery in ${num(rt.load * 60)} minutes. Idle draw is ${num(dr.idle, 1)} W.`,
            `Consumption spans ${num(dr.idle, 1)} to ${num(dr.load, 1)} W. Flat out, the battery lasts ${num(rt.load * 60)} minutes.`,
            `Under maximum load the battery gives up after ${num(rt.load * 60)} minutes, with the system drawing ${num(dr.load, 1)} W.`,
          ]),
        ],
        tables: [
          compare("Battery life (hours)", ["Idle", "Web", "Video", "Load"], f, peers, (x) => {
            const b2 = x.m.battery;
            const r2 = b2?.runtime[b2.balanced];
            return r2 ? [num(r2.idle, 1), num(r2.web, 1), num(r2.video, 1), num(r2.load, 1)] : ["", "", "", ""];
          }),
        ],
      });
  }

  const headline = say("headline", [
    `${full} review: ${pc.pros[0]?.toLowerCase() ?? "a solid effort"}`,
    `${full} review: ${value?.word === "overpriced" ? "asks too much" : value?.word === "bargain" ? "a lot for the money" : "a capable contender"}`,
    `Review of the ${full}`,
    `${full} in review: ${pc.cons[0] ? `strong, but ${pc.cons[0].toLowerCase()}` : "hard to fault"}`,
    `${full} laptop review`,
    `Tested: the ${full}, ${an(kind)}`,
  ]);

  return {
    id: s.id,
    title: headline,
    company: s.company,
    model: s.name,
    year: b.year,
    headline,
    verdict,
    pros: pc.pros,
    cons: pc.cons,
    specs,
    sections,
    scores: rollScores(s.id),
    price,
  };
}
