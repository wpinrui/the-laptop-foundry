import { factsOf, reviewOf, rivalById, rivalSubject, type Subject } from "../engine";
import { AWARD_NAMES, type CampaignState, type Quarter, type SalesRecord } from "../engine/campaign";
import { rng } from "../engine/review";
import { speak } from "./speech";

// The quarter's best seller as a short video: a narration script from
// hand-written sentence templates, each line tied to a camera shot and, for
// the numbers, a card. No language model: every sentence is a template, picked
// per laptop and quarter so two videos rarely read the same.

export type Shot = "title" | "orbit" | "keyboard" | "ports" | "screen" | "lid" | "turn";
export type Card = "title" | "sales" | "stats" | "score" | null;

export interface Line {
  /** The caption. */
  text: string;
  /** What the voice reads: the caption with its figures spelled for speech. */
  say: string;
  shot: Shot;
  card: Card;
}

/** Everything the video shows and says about the laptop. */
export interface ShortFacts {
  subject: Subject;
  quarter: Quarter;
  mine: boolean;
  units: number;
  share: number;
  price: number | null;
  /** The published review score, or null before the critics are out. */
  score: number | null;
  kind: string;
  cpu: string;
  gpu: string;
  pros: string[];
  cons: string[];
  /** Short figures for the stats card and the stats line, notable first. */
  stats: { caption: string; say: string; label: string }[];
  awards: string[];
  /** The side with the most ports, for the ports shot. */
  portSide: "left" | "right";
}

export interface Short {
  facts: ShortFacts;
  lines: Line[];
}

const an = (word: string) => `${/^(?:[aeiou]|8|1[18](?:\D|$))/i.test(word) ? "an" : "a"} ${word}`;
const ORDINAL = ["first", "second", "third", "fourth"];

export function quarterCaption(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

function quarterSay(q: Quarter): string {
  return `the ${ORDINAL[q.quarter - 1]} quarter of ${q.year}`;
}

/** 1,234,567 as "1.2M" for captions. */
export function unitsCaption(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toLocaleString("en-US");
}

function unitsSay(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  if (n >= 1e4) return `${Math.round(n / 1e3)} thousand`;
  return String(Math.round(n));
}

export function shareCaption(s: number): string {
  const p = s * 100;
  return `${p >= 10 ? p.toFixed(0) : p.toFixed(1)}%`;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The best-selling laptop of the campaign's last resolved quarter, or null when there is none to show. */
export function bestSeller(campaign: CampaignState): { record: SalesRecord; id: string; units: number } | null {
  const record = campaign.sales[campaign.sales.length - 1];
  if (!record) return null;
  if (record.top) return { record, id: record.top.id, units: record.top.units };
  // Saves from before the record named its best seller: the player's best model.
  const own = Object.entries(record.units).sort((a, b) => b[1] - a[1])[0];
  return own && own[1] > 0 ? { record, id: own[0], units: own[1] } : null;
}

/** The subject for a model or rival id: the player's own model first. */
export function subjectOf(id: string, own: Subject[]): { subject: Subject; mine: boolean } | null {
  const m = own.find((s) => s.id === id);
  if (m) return { subject: m, mine: true };
  const r = rivalById(id);
  return r ? { subject: rivalSubject(r), mine: false } : null;
}

function standouts(subject: Subject): ShortFacts["stats"] {
  const f = factsOf(subject);
  const out: { caption: string; say: string; label: string; rank: number }[] = [];
  const kg = Math.round(f.kg * 100) / 100;
  out.push({ caption: `${kg.toFixed(2)} kg`, say: `${kg.toFixed(1)} kilos`, label: "Weight", rank: kg < 1.3 ? 3 : kg < 2 ? 1 : 0.5 });
  const mm = Math.round(f.thickness);
  out.push({ caption: `${mm} mm`, say: `${mm} millimetres thin`, label: "Thickness", rank: mm < 16 ? 2.5 : mm < 20 ? 1 : 0.2 });
  const bat = f.m.battery;
  const web = bat?.runtime[bat.balanced]?.web;
  if (web && web > 0) {
    const h = Math.round(web * 2) / 2;
    out.push({ caption: `${h} h`, say: `${h} hours of browsing`, label: "Battery", rank: h >= 10 ? 3 : h >= 6 ? 1.5 : 0.4 });
  }
  if (f.refresh >= 90)
    out.push({ caption: `${f.refresh} Hz`, say: `a ${f.refresh} hertz screen`, label: "Refresh", rank: f.refresh >= 144 ? 2 : 1 });
  const inches = f.panel?.inches;
  if (inches) out.push({ caption: `${inches}"`, say: `${inches} inches of screen`, label: "Screen", rank: 0.3 });
  const cool = f.m.cooling;
  if (cool) {
    const db = Math.round(cool.noise.load);
    out.push({ caption: `${db} dB`, say: `${db} decibels under load`, label: "Noise", rank: db < 35 ? 1.2 : 0.1 });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 3).map(({ rank: _, ...s }) => s);
}

/** Gathers what the video needs from the campaign, the review and the sales record. */
export function shortFacts(
  subject: Subject,
  mine: boolean,
  campaign: CampaignState,
  record: SalesRecord,
  units: number,
): ShortFacts {
  const review = reviewOf(subject);
  const published = campaign.reviews[subject.id];
  const left = subject.build.ports.filter((p) => p.side === "left").length;
  const right = subject.build.ports.filter((p) => p.side === "right").length;
  return {
    subject,
    quarter: record.quarter,
    mine,
    units,
    share: record.total > 0 ? units / record.total : 0,
    price: review.price,
    score: published ? Math.round(published.score) : null,
    kind: review.kind,
    cpu: review.cpu,
    gpu: review.gpu,
    pros: review.pros,
    cons: review.cons,
    stats: standouts(subject),
    awards: campaign.awards.filter((a) => a.id === subject.id).map((a) => `${AWARD_NAMES[a.award]} ${a.year}`),
    portSide: right > left ? "right" : "left",
  };
}

/**
 * What a commercial's cards show about one of the player's own laptops: its
 * latest quarter's sales and its published review in a campaign; in a sandbox,
 * no sales and the review's own score once it has been reviewed.
 */
export function adFacts(subject: Subject, campaign: CampaignState | null, score: number | null): ShortFacts {
  if (campaign) {
    const record = [...campaign.sales].reverse().find((r) => (r.units[subject.id] ?? 0) > 0) ?? {
      quarter: { ...campaign.now },
      units: {},
      demand: {},
      makers: {},
      total: 0,
    };
    return shortFacts(subject, true, campaign, record, record.units[subject.id] ?? 0);
  }
  const review = reviewOf(subject);
  const left = subject.build.ports.filter((p) => p.side === "left").length;
  const right = subject.build.ports.filter((p) => p.side === "right").length;
  return {
    subject,
    quarter: { year: subject.build.year, quarter: 1 },
    mine: true,
    units: 0,
    share: 0,
    price: review.price,
    score: score === null ? null : Math.round(score),
    kind: review.kind,
    cpu: review.cpu,
    gpu: review.gpu,
    pros: review.pros,
    cons: review.cons,
    stats: standouts(subject),
    awards: [],
    portSide: right > left ? "right" : "left",
  };
}

/** The close-up that shows a pro or con best. */
function shotFor(point: string): Shot {
  const p = point.toLowerCase();
  if (/keyboard|trackpad|speaker/.test(p)) return "keyboard";
  if (/port|connectivity|charges/.test(p)) return "ports";
  if (/display|webcam/.test(p)) return "screen";
  if (/case|flimsy|sturdy/.test(p)) return "lid";
  if (/light|heavy|battery/.test(p)) return "turn";
  return "orbit";
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The narration, one line per shot, about 30 to 60 seconds read aloud. */
export function writeShort(facts: ShortFacts): Short {
  const s = facts.subject;
  const pick = (slot: string, variants: [string, string][] | string[]): [string, string] => {
    const r = rng(`short:${s.id}:${facts.quarter.year}:${facts.quarter.quarter}:${slot}`)();
    const v = variants[Math.floor(r * variants.length)];
    return typeof v === "string" ? [v, v] : v;
  };
  const full = `${s.company} ${s.name}`;
  const qc = quarterCaption(facts.quarter);
  const qs = quarterSay(facts.quarter);
  const lines: Line[] = [];
  const add = (shot: Shot, card: Card, [text, say]: [string, string]) => lines.push({ text, say: speak(say), shot, card });

  // Hook.
  add(
    "title",
    "title",
    facts.mine
      ? pick("hook-mine", [
          [`The best-selling laptop of ${qc}? Yours. The ${s.name}.`, `The best-selling laptop of ${qs}? Yours. The ${s.name}.`],
          [`Your ${s.name} just outsold every laptop on the market in ${qc}.`, `Your ${s.name} just outsold every laptop on the market in ${qs}.`],
          [`${qc} has a winner, and you built it. The ${s.name}.`, `${qs} has a winner, and you built it. The ${s.name}.`],
        ])
      : pick("hook", [
          [`The best-selling laptop of ${qc}? The ${full}.`, `The best-selling laptop of ${qs}? The ${full}.`],
          [`Nothing sold more in ${qc} than the ${full}.`, `Nothing sold more in ${qs} than the ${full}.`],
          [`Guess what topped the charts in ${qc}? The ${full}.`, `Guess what topped the charts in ${qs}? The ${full}.`],
          [`This is the ${full}, and it just won ${qc}.`, `This is the ${full}, and it just won ${qs}.`],
        ]),
  );

  // Sales.
  const uc = unitsCaption(facts.units);
  const us = unitsSay(facts.units);
  const sc = shareCaption(facts.share);
  const ss = sc.replace("%", " percent");
  add(
    "orbit",
    "sales",
    pick("sales", [
      [`${uc} units sold. That's ${sc} of every laptop out there.`, `${us} units sold. That's ${ss} of every laptop out there.`],
      [`It moved ${uc} units, ${an(sc)} slice of the whole market.`, `It moved ${us} units, ${an(ss)} slice of the whole market.`],
      [`${uc} people walked out with one. That's ${sc} of all sales.`, `${us} people walked out with one. That's ${ss} of all sales.`],
    ]),
  );

  // The pitch. speak() reads the part names, prices and model numbers out for the voice.
  const price = facts.price;
  if (price)
    add(
      "orbit",
      null,
      pick("pitch", [
        [`It's ${an(facts.kind)} for ${usd(price)}, running the ${facts.cpu} with ${facts.gpu}.`, `It's ${an(facts.kind)} for ${usd(price)}, running the ${facts.cpu} with ${facts.gpu}.`],
        [`${usd(price)} gets you ${an(facts.kind)} with the ${facts.cpu} and ${facts.gpu} inside.`, `${usd(price)} gets you ${an(facts.kind)} with the ${facts.cpu} and ${facts.gpu} inside.`],
        [`On paper: ${an(facts.kind)}, the ${facts.cpu}, ${facts.gpu}, ${usd(price)}.`, `On paper: ${an(facts.kind)}, the ${facts.cpu}, ${facts.gpu}, ${usd(price)}.`],
      ]),
    );

  // The good.
  const pros = facts.pros.slice(0, 2);
  const proLeads = [
    ["First, the good stuff.", "What's good?", "Big win:", "Why's it selling?"],
    ["And there's more.", "Plus:", "On top of that,", "Also,"],
  ];
  pros.forEach((p, i) => {
    const [lead] = pick(`pro${i}`, proLeads[i]);
    const text = lead.endsWith(",") ? `${lead} ${lowerFirst(p)}.` : `${lead} ${p}.`;
    add(shotFor(p), null, [text, text]);
  });

  // The numbers.
  if (facts.stats.length > 0) {
    // The spoken figures read well as captions too.
    const says = facts.stats.map((x) => x.say);
    const caps = says;
    add(
      "turn",
      "stats",
      pick("stats", [
        [`By the numbers: ${list(caps)}.`, `By the numbers: ${list(says)}.`],
        [`The numbers? ${list(caps)}.`, `The numbers? ${list(says)}.`],
        [`${list(caps)}. Not bad at all.`, `${list(says)}. Not bad at all.`],
      ]).map((x) => x.charAt(0).toUpperCase() + x.slice(1)) as [string, string],
    );
  }

  // The catch.
  const con = facts.cons[0];
  if (con) {
    const [lead] = pick("con", ["The catch?", "Not perfect, though.", "One complaint:", "Here's the downside:"]);
    const text = `${lead} ${con}.`;
    add(shotFor(con) === "orbit" ? "lid" : shotFor(con), null, [text, text]);
  } else add("lid", null, pick("nocon", ["Honestly? We couldn't find much to complain about.", "Complaints? We looked. Hard."]));

  // The critics and the awards.
  if (facts.score !== null) {
    const n = facts.score;
    const [t, v] = pick("score", [
      [`Critics gave it ${n} out of 100.`, `Critics gave it ${n} out of 100.`],
      [`The critics' verdict: ${n} out of 100.`, `The critics' verdict: ${n} out of 100.`],
      [`Reviewers scored it ${n}.`, `Reviewers scored it ${n}.`],
    ]);
    const award = facts.awards[facts.awards.length - 1];
    const tail = award ? ` And it took home ${award}.` : "";
    add("screen", "score", [t + tail, v + tail]);
  } else
    add("screen", "score", pick("noscore", ["The reviews aren't even out yet, and it's selling anyway.", "Critics haven't weighed in yet. Buyers didn't wait."]));

  // Sign-off.
  add(
    "turn",
    "title",
    facts.mine
      ? pick("outro-mine", ["Not bad for your own design. Now do it again next quarter.", "That's the one to beat, and it's yours. See you next quarter."])
      : pick("outro", [
          ["That's the one to beat. See you next quarter.", "That's the one to beat. See you next quarter."],
          price ? [`Is it worth ${usd(price)}? The market says yes.`, `Is it worth ${usd(price)}? The market says yes.`] : ["Would you buy one?", "Would you buy one?"],
          ["Would you buy one? See you next quarter.", "Would you buy one? See you next quarter."],
        ]),
  );
  return { facts, lines };
}
