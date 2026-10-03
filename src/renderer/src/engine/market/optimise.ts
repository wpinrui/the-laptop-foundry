import { DEMAND_SCALE, RETAILER_CUT, STARTING_PERCEPTION } from "../campaign/constants";

// A nominal small reach to rank with: a new company starts at none, which scores every candidate zero.
const RANKING_REACH = 0.02;
import { MAX_PRICE, scaleFactor } from "../campaign/release";
import { criticsFactor, hasOptical, noveltyFactor, opticalFactor, packFactor, priceFactor, rivalBrand, scoreFactor } from "../campaign/sales";
import { available, CONTENT } from "../content";
import { costOf } from "../price";
import { solve } from "../solve";
import type { Build, Part, Side } from "../types";
import type { Rival } from "./field";
import { generateModel, hashOf, rngOf } from "./generate";
import { LINES, linesIn, priceFor, shapeFor } from "./makers";
import { type Pack, packAverage, profileOf, rivalProfile } from "./profile";
import { mapToScore, marketAverage, marketScore, statRatio, weightedRatio } from "./score";
import { population, priceCeiling, screenFit, segmentById } from "./segments";
import type { HeadlineValues } from "./stats";
import { HEADLINE_STATS, type Line, type Segment, type SegmentId, type StatWeights } from "./types";

// A dev tool: the most profitable build and price for one buyer segment in a
// year. Restarts the rival generator from every class cell the year's lines
// use, with the segment's weights as the line's priorities, then polishes the
// best by nudging one priority at a time. Each build is priced by an exact
// search under the sales model: one quarter of the segment's buyers split by
// appeal against the year's rivals, less the retailers' cut and the unit cost.

/** Rivals are taken this many quarters into their life, the player's model at launch. */
const RIVAL_AGE = 2;
/** How far a priority moves in one polish step. */
const NUDGE = 0.06;
/** Wall-clock budget for the whole search, ms. */
const BUDGET_MS = 90_000;
/** Inches either side of the segment's screen range the generator may pick from. */
const SCREEN_SLACK = 0.6;
/** Range positions each class cell restarts from. */
const POSITIONS = [0.25, 0.75];

export interface Optimised {
  segment: SegmentId;
  build: Build;
  price: number;
  /** Units the segment buys in a quarter at that price. */
  units: number;
  /** One quarter's profit from the segment: revenue after the retailers' cut, less unit cost. */
  profit: number;
  /** Builds measured. */
  tried: number;
  ms: number;
}

interface Field {
  /** The rivals' mean packaging. */
  pack: Pack | null;
  seg: Segment;
  avg: HeadlineValues;
  /** The rivals' summed appeal in the segment. */
  rivals: number;
  buyers: number;
  ceiling: number;
  brand: number;
}

function fieldOf(seg: Segment, year: number, rivals: Rival[], brand: number): Field {
  const profiles = rivals.map((r) => ({ r, p: rivalProfile(r) }));
  const pack = packAverage(profiles.map((x) => x.p.pack));
  const basis = profiles.map((x) => x.p.stats);
  const ceiling = priceCeiling(seg, year);
  let sum = 0;
  for (const { r, p } of profiles) {
    const ms = marketScore({ id: r.id, stats: p.stats }, basis, [seg]).segments[seg.id];
    const score = Math.min(10, Math.max(1, ms.base + ms.noise));
    sum +=
      scoreFactor(score) *
      priceFactor(r.build.price ?? 0, ceiling) *
      screenFit(seg, p.inches) *
      packFactor(p.pack, pack, seg) *
      opticalFactor(hasOptical(r.build), year, seg) *
      noveltyFactor(RIVAL_AGE, seg) *
      criticsFactor(p.review) *
      Math.max(0, rivalBrand(r.maker, seg.id));
  }
  return {
    seg,
    avg: marketAverage(basis),
    pack,
    rivals: sum,
    buyers: (population(seg, year) / seg.replacementYears / 4) * DEMAND_SCALE,
    ceiling,
    brand,
  };
}

/** Prices on the builder's grid: $10 steps ending in 9 under $1,000, $25 steps from there. */
function* pricesFrom(lo: number, hi: number): Generator<number> {
  let p = Math.max(9, Math.ceil((lo + 1) / 10) * 10 - 1);
  while (p <= hi) {
    yield p;
    p += p < 1000 ? 10 : 25;
  }
}

interface Priced {
  price: number;
  units: number;
  profit: number;
}

/** The most profitable price for a measured build. Stats but price do not move with the price. */
function bestPrice(stats: HeadlineValues, review: number, inches: number, pack: Pack, cost: number, f: Field, extra = 1): Priced {
  const ratios = {} as Record<(typeof HEADLINE_STATS)[number], number>;
  for (const k of HEADLINE_STATS) ratios[k] = statRatio(stats[k], f.avg[k]);
  const fixed = screenFit(f.seg, inches) * packFactor(pack, f.pack, f.seg) * noveltyFactor(0, f.seg) * criticsFactor(review) * f.brand * extra;
  const net = 1 - RETAILER_CUT;
  const hi = Math.min(MAX_PRICE, Math.max(f.ceiling * 1.6, cost * 3));
  let best: Priced = { price: 0, units: 0, profit: Number.NEGATIVE_INFINITY };
  for (const p of pricesFrom(cost / net, hi)) {
    ratios.price = statRatio(1000 / p, f.avg.price);
    const score = mapToScore(weightedRatio(ratios, f.seg.weights));
    const a = scoreFactor(score) * priceFactor(p, f.ceiling) * fixed;
    const units = a > 0 ? (f.buyers * a) / (a + f.rivals) : 0;
    const unit = cost * scaleFactor(Math.min(100_000, Math.max(100, Math.round(units))));
    const profit = units * (p * net - unit);
    if (profit > best.profit) best = { price: p, units, profit };
  }
  return best;
}

interface Template {
  key: string;
  line: Line;
  low: number;
  high: number;
}

/** One template per class cell the year's lines use, Apple's own excepted. */
function templatesFor(year: number): Template[] {
  const lines = linesIn(year).filter((l) => l.maker !== "apple");
  const pool = lines.length > 0 ? lines : LINES.filter((l) => l.maker !== "apple");
  const seen = new Map<string, Template>();
  for (const line of [...pool].sort((a, b) => a.id.localeCompare(b.id))) {
    const shape = shapeFor(line, year);
    const key = `${shape.class.budget}|${shape.class.body}|${shape.class.performance}`;
    if (seen.has(key)) continue;
    const [low, high] = priceFor(line, year);
    seen.set(key, { key, line, low, high });
  }
  return [...seen.values()];
}

/** The template rebuilt as the segment's own line. */
function lineFor(t: Template, seg: Segment, year: number, priorities: StatWeights): Line {
  const shape = shapeFor(t.line, year);
  const cpu = shape.cpu.filter((v) => v !== "apple");
  return {
    id: `optimise-${seg.id}-${t.line.id}`,
    maker: "foundry",
    name: "Optimised",
    years: [[year, year]],
    shapes: [
      {
        ...shape,
        from: year,
        screen: [seg.screen.min - SCREEN_SLACK, seg.screen.max + SCREEN_SLACK],
        cpu: cpu.length > 0 ? cpu : ["intel", "amd"],
      },
    ],
    price: [{ year, low: t.low, high: t.high }],
    priorities,
  };
}

interface Candidate extends Priced {
  build: Build;
  t: Template;
  pos: number;
  priorities: StatWeights;
}

/** Most passes the port and optical search makes. */
const IO_PASSES = 6;

function portShape(p: Part | undefined) {
  return p && !Array.isArray(p.shape) && p.shape.kind === "port" ? p.shape : undefined;
}

/**
 * Every one-step change to the ports and the optical drive: drop a port, swap
 * one for another of its group, add one on any wall the layout has, or add or
 * drop the drive. A build keeps at least one port that charges it. The fit
 * decides what physically fits.
 */
function ioVariants(b: Build): Build[] {
  const ports = CONTENT.parts.filter((p) => p.category === "port" && p.id !== "dc-jack" && available(p, b.year));
  const sides: Side[] = CONTENT.layouts.find((l) => l.id === b.layout)?.portSides ?? ["left", "right"];
  const byId = (id: string) => CONTENT.parts.find((p) => p.id === id);
  const charges = (list: Build["ports"]) => list.some((x) => portShape(byId(x.part))?.charges);
  const out: Build[] = [];
  b.ports.forEach((bp, i) => {
    const rest = b.ports.filter((_, j) => j !== i);
    if (charges(rest)) out.push({ ...b, ports: rest });
    const group = portShape(byId(bp.part))?.group;
    for (const p of ports) {
      if (p.id === bp.part || portShape(p)?.group !== group) continue;
      const swapped = b.ports.map((x, j) => (j === i ? { ...x, part: p.id } : x));
      if (charges(swapped)) out.push({ ...b, ports: swapped });
    }
  });
  for (const p of ports) for (const side of sides) out.push({ ...b, ports: [...b.ports, { part: p.id, side }] });
  if (b.parts.optical?.length) {
    const { optical: _, ...parts } = b.parts;
    out.push({ ...b, parts });
  } else {
    const odd = CONTENT.parts.find((p) => p.category === "optical" && available(p, b.year));
    if (odd) out.push({ ...b, parts: { ...b.parts, optical: [{ part: odd.id }] } });
  }
  return out;
}

function nudged(w: StatWeights, k: keyof StatWeights, d: number): StatWeights | null {
  const next = { ...w, [k]: Math.max(0, w[k] + d) };
  if (next[k] === w[k]) return null;
  const sum = HEADLINE_STATS.reduce((a, x) => a + next[x], 0);
  if (!(sum > 0)) return null;
  for (const x of HEADLINE_STATS) next[x] /= sum;
  return next;
}

/**
 * The most profitable build and price for the segment in the year, against
 * the year's rivals. `brand` is the player's brand factor in the segment; a
 * new company's by default.
 */
export function optimiseFor(
  segment: SegmentId,
  year: number,
  rivals: Rival[],
  brand = RANKING_REACH * (1 + STARTING_PERCEPTION / 100),
): Optimised | null {
  const start = performance.now();
  const seg = segmentById(segment);
  const field = fieldOf(seg, year, rivals, brand);
  let tried = 0;
  const evaluate = (build: Build, t: Template, pos: number, priorities: StatWeights): Candidate | null => {
    try {
      const fit = solve(build);
      if (fit.problems.length > 0) return null;
      const cost = costOf(build, fit).total;
      const p = profileOf(`optimise-${seg.id}`, build);
      const priced = bestPrice(p.stats, p.review, p.inches, p.pack, cost, field, opticalFactor(hasOptical(build), year, seg));
      return { ...priced, build: { ...build, price: priced.price }, t, pos, priorities };
    } catch {
      return null;
    }
  };
  const measure = (t: Template, pos: number, priorities: StatWeights): Candidate | null => {
    tried++;
    const line = lineFor(t, seg, year, priorities);
    const g = generateModel(line, year, rngOf(hashOf(seg.id, t.line.id, year)), { pos });
    return g.valid ? evaluate(g.build, t, pos, priorities) : null;
  };
  const over = () => performance.now() - start > BUDGET_MS;

  let best: Candidate | null = null;
  for (const t of templatesFor(year)) {
    for (const pos of POSITIONS) {
      if (over() && best) break;
      const c = measure(t, pos, seg.weights);
      if (c && (!best || c.profit > best.profit)) best = c;
    }
  }
  if (!best) return null;

  // Polish: one priority or the range position at a time, keeping any gain, until a pass gains nothing.
  let improved = true;
  while (improved && !over()) {
    improved = false;
    for (const pos of [best.pos - 0.15, best.pos + 0.15]) {
      if (over() || pos < 0 || pos > 1) continue;
      const c = measure(best.t, pos, best.priorities);
      if (c && c.profit > best.profit) {
        best = c;
        improved = true;
      }
    }
    for (const k of HEADLINE_STATS) {
      for (const d of [NUDGE, -NUDGE]) {
        if (over()) break;
        const w = nudged(best.priorities, k, d);
        if (!w) continue;
        const c = measure(best.t, best.pos, w);
        if (c && c.profit > best.profit) {
          best = c;
          improved = true;
        }
      }
    }
  }

  // Then the ports and the drive: the best single change each pass, until none gains.
  for (let pass = 0; pass < IO_PASSES && !over(); pass++) {
    const from: Candidate = best;
    let next: Candidate | null = null;
    for (const b of ioVariants(from.build)) {
      if (over()) break;
      tried++;
      const c = evaluate(b, from.t, from.pos, from.priorities);
      if (c && c.profit > (next ?? from).profit) next = c;
    }
    if (!next) break;
    best = next;
  }
  return {
    segment,
    build: best.build,
    price: best.price,
    units: best.units,
    profit: best.profit,
    tried,
    ms: performance.now() - start,
  };
}
