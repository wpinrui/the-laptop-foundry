import { type Results, results } from "../bench";
import { type Content, CONTENT } from "../content";
import { activeArea } from "../content/display";
import { type Rival, RIVALS } from "../content/rivals";
import { classify, costOf, type DeviceClass, weightOf } from "../price";
import { type Measurements, simulate } from "../sim";
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
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
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

function className(c: DeviceClass): string {
  return [c.budget ?? "", c.body, c.performance ?? ""].filter(Boolean).join(" ");
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
  const cls = className(f.cls);
  const pc = prosAndCons(f, peers);
  const value = valueWord(f, peers);
  const c = f.m.cooling;
  const perf = f.m.performance;
  const bat = f.m.battery;
  const top = f.m.top;
  const topName = top === "high" ? "High" : top === "medium" ? "Medium" : "Low";
  const balName = bat ? (bat.balanced === "high" ? "High" : bat.balanced === "medium" ? "Medium" : "Low") : "";

  // ---------------------------------------------------------------- verdict
  const verdict: string[] = [];
  verdict.push(
    say("open", [
      `The ${full} is a ${cls} laptop built around the ${cpu} and ${gpu}.`,
      `With the ${cpu} and ${gpu} inside, the ${full} lands in the ${cls} class.`,
      `${s.company} pitches the ${s.name} as a ${cls} machine, and on paper the ${cpu} and ${gpu} fit that brief.`,
      `Our test unit of the ${full} pairs the ${cpu} with ${gpu}, which puts it among ${cls} laptops.`,
    ]),
  );
  if (pc.pros.length)
    verdict.push(
      say("pros", [
        `Where it stands out: ${pc.pros.map((p) => p.toLowerCase()).join(", ")}.`,
        `Against its rivals it earns praise on these points: ${pc.pros.map((p) => p.toLowerCase()).join(", ")}.`,
        `Its strengths are clear: ${pc.pros.map((p) => p.toLowerCase()).join(", ")}.`,
      ]),
    );
  if (pc.cons.length)
    verdict.push(
      say("cons", [
        `On the other hand, the field does better on ${pc.cons.length === 1 ? "one front" : "several fronts"}: ${pc.cons.map((p) => p.toLowerCase()).join(", ")}.`,
        `Buyers should weigh the weak spots: ${pc.cons.map((p) => p.toLowerCase()).join(", ")}.`,
        `It is not flawless. Our list of complaints: ${pc.cons.map((p) => p.toLowerCase()).join(", ")}.`,
      ]),
    );
  const price = b.price ?? null;
  if (price && value) {
    const t = {
      bargain: [
        `At ${usd(price)} it is a bargain next to rivals that ask more for less.`,
        `For ${usd(price)} it undercuts the competition on value.`,
      ],
      fair: [
        `At ${usd(price)} the asking price is in line with what rivals charge.`,
        `The ${usd(price)} price tag is fair for what you get.`,
      ],
      overpriced: [
        `At ${usd(price)} it is overpriced: comparable rivals deliver more for the money.`,
        `We struggle to justify ${usd(price)} when rivals offer more for less.`,
      ],
    }[value.word as "bargain" | "fair" | "overpriced"];
    verdict.push(say("value", t));
  } else if (!price) {
    verdict.push("Pricing had not been announced when we tested it.");
  }

  // ---------------------------------------------------------------- specs
  const panel = f.panel;
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
    ["Battery", `${num(batteryWh(f), batteryWh(f) % 1 ? 1 : 0)} Wh`],
    ["Wireless", partName(content, b.parts.wireless?.[0]?.part)],
    ["Optical drive", partName(content, b.parts.optical?.[0]?.part) || "None"],
    ["Webcam", partName(content, b.parts.webcam?.[0]?.part) || "None"],
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
  sections.push({
    id: "case",
    title: "Case and connectivity",
    paragraphs: [
      say("case1", [
        `The chassis is made of ${matNames.join(" and ")} and measures ${num(f.fit.frame.x)} by ${num(f.fit.frame.y)} mm at ${num(f.thickness, 1)} mm thick. It weighs ${num(f.kg, 2)} kg.`,
        `${s.company} builds the ${s.name} from ${matNames.join(" and ")}. At ${num(f.thickness, 1)} mm and ${num(f.kg, 2)} kg it is ${f.cls.body === "thin and light" ? "easy to carry" : f.cls.body === "large" ? "a desk-bound machine" : "portable enough for the odd trip"}.`,
      ]),
      portText
        ? `${portText.charAt(0).toUpperCase()}${portText.slice(1)}.`
        : "There are no ports to speak of.",
      `Wireless duties fall to ${partName(content, b.parts.wireless?.[0]?.part) || "nothing at all: there is no wireless module"}.`,
    ],
    tables: [
      compare("Size and weight", ["Weight", "Thickness", "Ports"], f, peers, (x) => [
        `${num(x.kg, 2)} kg`,
        `${num(x.thickness, 1)} mm`,
        String(x.subject.build.ports.length),
      ]),
    ],
  });

  // ---------------------------------------------------------------- input
  const kb = b.parts.keyboard?.[0];
  const kbPart = partOf(content, b, "keyboard");
  const pad = b.parts.trackpad?.[0];
  const padPart = partOf(content, b, "trackpad");
  const light = String(kb?.opts?.light ?? kbPart?.options?.light?.[0] ?? "none");
  const stick = String(pad?.opts?.stick ?? padPart?.options?.stick?.[0] ?? "no") === "yes";
  const haptic = String(pad?.opts?.mechanism ?? padPart?.options?.mechanism?.[0] ?? "") === "haptic";
  sections.push({
    id: "input",
    title: "Input devices",
    paragraphs: [
      say("kb", [
        `The keyboard offers ${kbPart?.name.toLowerCase() ?? "unremarkable travel"}${light === "none" ? " and no lighting" : ` with ${light.replace(/-/g, " ")} lighting`}.`,
        `Typing on the ${kbPart?.name.toLowerCase() ?? ""} keyboard is ${kbPart?.name.includes("2.5") || kbPart?.name.includes("3.0") || kbPart?.name.includes("1.8") ? "a pleasure thanks to deep travel" : "fine, if shallow"}.`,
      ]),
      `The ${padPart?.name ?? "trackpad"} trackpad${haptic ? " uses haptic feedback" : " clicks mechanically"}${stick ? ", and a pointing stick sits in the keyboard" : ""}.`,
      b.parts.webcam?.length
        ? `A ${partName(content, b.parts.webcam?.[0]?.part)} webcam sits above the display.`
        : "There is no webcam.",
    ],
    tables: [],
  });

  // ---------------------------------------------------------------- display
  if (panel) {
    const area = activeArea(panel);
    const ppi = panel.res[0] / (area.x / 25.4);
    sections.push({
      id: "display",
      title: "Display",
      paragraphs: [
        say("disp", [
          `The ${panel.inches} inch ${PANEL_TYPE[panel.type] ?? panel.type} panel runs at ${panel.res[0]} x ${panel.res[1]} (${num(ppi)} ppi) and ${f.refresh} Hz.`,
          `${s.company} fits a ${panel.inches} inch ${PANEL_TYPE[panel.type] ?? panel.type} screen with ${panel.res[0]} x ${panel.res[1]} pixels, a density of ${num(ppi)} ppi.`,
        ]),
        `We measured ${panel.nits} nits in the centre and ${panel.gamut} coverage. ${
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
    sections.push({
      id: "performance",
      title: "Performance",
      paragraphs: [
        `We run every performance test on the ${topName} profile, the fastest one ${s.company} enables.`,
        bench.multi === null
          ? `${bench.name} refuses to run: the ${cpu} lacks an instruction set it needs.`
          : say("bench", [
              `In ${bench.name} the ${cpu} scores ${num(bench.single ?? 0)} points single-core and ${num(bench.multi)} points multi-core over a 30 minute loop.`,
              `Our ${bench.name} loop settles at ${num(bench.multi)} points multi-core, with ${num(bench.single ?? 0)} points single-core.`,
            ]),
        drop > 0.08
          ? say("drop", [
              `Sustained load costs it ${num(drop * 100)} percent: the processor starts at ${num(c.cpuWatts.first)} W and settles at ${num(c.cpuWatts.sustained)} W.`,
              `The cooling cannot hold the boost. Power falls from ${num(c.cpuWatts.first)} W to ${num(c.cpuWatts.sustained)} W and performance drops ${num(drop * 100)} percent.`,
            ])
          : say("hold", [
              `Performance holds steady over the loop at ${num(c.cpuWatts.sustained)} W.`,
              `The cooling keeps up: the processor sustains ${num(c.cpuWatts.sustained)} W with barely any drop.`,
            ]),
        (() => {
          const hard = f.r.games.find((g) => g.id === "ashfall");
          const run = hard?.runs?.find((x) => x.preset === "high" && !x.native);
          if (!hard) return "";
          if (!run) return `${hard.name} refuses to run on the ${gpu}.`;
          return run.fps >= 60
            ? `Demanding games are no problem: ${hard.name} runs at ${num(run.fps)} fps on high settings.`
            : run.fps >= 30
              ? `${hard.name} is playable at ${num(run.fps)} fps on high settings.`
              : `${hard.name} struggles at ${num(run.fps)} fps on high settings; lower presets are a must.`;
        })(),
      ].filter(Boolean),
      tables: [
        {
          caption: "Games (fps)",
          columns: ["", ...f.r.games.map((g) => g.name)],
          rows: (["low", "medium", "high", "ultra"] as const).map((preset) => ({
            cells: [
              preset.charAt(0).toUpperCase() + preset.slice(1),
              ...f.r!.games.map((g) => {
                const run = g.runs?.find((x) => x.preset === preset && !x.native);
                return run ? num(run.fps) : "—";
              }),
            ],
          })),
        },
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
            ])
          : c.noise.sustained < 42
            ? `Under load the fans rise to ${num(c.noise.sustained, 1)} dB(A), noticeable but not intrusive. At idle we measured ${num(c.noise.idle, 1)} dB(A).`
            : say("loud", [
                `Under sustained load the fans reach ${num(c.noise.sustained, 1)} dB(A), loud enough that headphones are advisable.`,
                `This is a loud machine: ${num(c.noise.sustained, 1)} dB(A) under load.`,
              ]),
        `During the stress test the hottest spot on the case reached ${num(c.peakSkin)} °C and the processor peaked at ${num(c.peakDie)} °C.${c.peakSkin > 48 ? " That is too hot to rest on a lap." : ""}`,
      ],
      tables: [
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

  // ---------------------------------------------------------------- energy
  if (bat) {
    const rt = bat.runtime[bat.balanced];
    const dr = bat.draw[bat.balanced];
    if (rt && dr)
      sections.push({
        id: "energy",
        title: "Energy management",
        paragraphs: [
          `We test battery life on the ${balName} profile at 150 nits. The ${num(bat.wh, bat.wh % 1 ? 1 : 0)} Wh battery lasts ${num(rt.web, 1)} hours browsing over Wi-Fi and ${num(rt.video, 1)} hours of video.`,
          `Power draw ranges from ${num(dr.idle, 1)} W at idle to ${num(dr.load, 1)} W under full load, where the battery is flat after ${num(rt.load * 60)} minutes.`,
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
