import { type CSSProperties, Fragment, type ReactNode, type RefObject, useEffect, useState } from "react";
import type { Review, Section, Table } from "../engine";
import { ChartView, type Era, num } from "./Charts";

// Building blocks the three era sites share: the order of each section's
// text, photos, tables and charts, and the pieces every era draws its own way
// in CSS (tables, photos, rating bars, pros and cons, competitors).

export type Band = "great" | "good" | "fair" | "poor";

export function band(score: number): Band {
  return score >= 90 ? "great" : score >= 80 ? "good" : score >= 70 ? "fair" : "poor";
}

/** The score's word, as the reveal and the sites print it. */
export function bandWord(score: number): string {
  return score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 70 ? "Average" : "Poor";
}

export const usd = (n: number) => `$${num(n)}`;

/** Captions for the review photos, by shot id ("scene/shot"). */
const PHOTO_CAPTIONS: Record<string, string> = {
  "studio/hero": "The test unit",
  "studio/closed": "Closed",
  "studio/top": "Keyboard and touchpad",
  "studio/left": "Left side",
  "studio/right": "Right side",
  "studio/rear": "Rear",
  "ports/left": "Ports on the left",
  "ports/right": "Ports on the right",
  "ports/rear": "Ports at the back",
  "ports/front": "Ports at the front",
  "size/top": "Footprint next to an A4 sheet, with rivals outlined",
  "teardown/top": "With the bottom cover removed",
  "viewing/grid": "Viewing angles",
  "outdoor/table": "Outdoors in daylight",
  "desk/wide": "In use",
  "desk/screen": "System information",
  "thermal/deck": "Surface temperatures on top under load",
  "thermal/bottom": "Surface temperatures underneath under load",
};

const SIDE_WORD: Record<string, string> = { left: "Left", right: "Right", rear: "Rear", front: "Front" };

function captionOf(id: string, review: Review): string {
  const [scene, side] = id.split("/");
  const list = scene === "ports" ? review.ports[side as keyof Review["ports"]] : undefined;
  if (list?.length) return `${SIDE_WORD[side]}: ${list.join(", ")}`;
  return PHOTO_CAPTIONS[id] ?? "";
}

export type Photos = Record<string, string> | null | undefined;

/** A row of photos; each era lays the row out its own way. */
export function PhotoRow({ ids, photos, review }: { ids: string[]; photos: Photos; review: Review }) {
  const shown = photos ? ids.filter((id) => photos[id]) : [];
  if (!photos || shown.length === 0) return null;
  return (
    <div className={`rs-photos rs-photos-${Math.min(shown.length, 2)}`}>
      {shown.map((id) => (
        <figure key={id}>
          <div className="rs-photo">
            <img src={photos[id]} alt={captionOf(id, review) || "Photo"} />
          </div>
          <figcaption>{captionOf(id, review)}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function TableView({ table, onOpen }: { table: Table; onOpen: (id: string) => void }) {
  return (
    <div className="rs-tablewrap">
      <table className={`rs-table${table.caption.startsWith("Games") ? " rs-games" : ""}`}>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={`${c}-${i}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={`${row.cells[0]}-${i}`} className={row.subject ? "rs-me" : undefined}>
              {row.cells.map((cell, j) =>
                j === 0 && row.link ? (
                  <td key={`${j}`}>
                    <button type="button" className="rs-link" onClick={() => row.link && onOpen(row.link)}>
                      {cell}
                    </button>
                  </td>
                ) : (
                  <td
                    key={`${j}`}
                    className={row.tones?.[j] ? `rs-fps rs-fps-${row.tones[j]}` : undefined}
                    style={row.tones?.[j] ? ({ "--rs-fps": fpsHeat(cell) } as CSSProperties) : undefined}
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 2026's games grid: pale to green by frame rate, reddish below 30 fps. */
function fpsHeat(cell: string): string {
  const fps = Number.parseFloat(cell.replace(/,/g, ""));
  if (!Number.isFinite(fps)) return "transparent";
  if (fps < 30) return `oklch(${(0.9 + (fps / 30) * 0.04).toFixed(3)} ${(0.06 - (fps / 30) * 0.02).toFixed(3)} 30)`;
  const k = Math.min(1, (fps - 30) / 120);
  return `oklch(${(0.93 - 0.16 * k).toFixed(3)} ${(0.045 + 0.075 * k).toFixed(3)} 150)`;
}

export function Specs({ review }: { review: Review }) {
  return (
    <dl className="rs-specs">
      {review.specs.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One step of a section: a paragraph, a photo row, a table, a chart or an era's own block. */
type Step =
  | { p: number | "rest" }
  | { photos: string[] }
  | { table: string }
  | { chart: string }
  | { slot: string };

/** Each section's order, shared by the eras. Anything a recipe misses is appended, never dropped. */
const RECIPES: Record<string, Step[]> = {
  case: [
    { slot: "case-intro" },
    { p: 1 },
    { photos: ["studio/closed", "studio/rear"] },
    { photos: ["studio/left", "studio/right"] },
    { photos: ["size/top"] },
    { table: "Size and weight" },
    { p: 2 },
    { p: 3 },
    { photos: ["ports/left", "ports/right"] },
    { photos: ["ports/rear", "ports/front"] },
    { photos: ["teardown/top"] },
    { table: "Durability" },
  ],
  input: [{ p: "rest" }, { photos: ["studio/top"] }],
  camera: [{ p: "rest" }, { table: "Webcam" }],
  display: [{ p: "rest" }, { table: "Display" }, { chart: "display" }, { photos: ["viewing/grid", "outdoor/table"] }],
  performance: [
    { p: 0 },
    { chart: "multi" },
    { chart: "single" },
    { p: 1 },
    { chart: "loop" },
    { chart: "graphics" },
    { chart: "storage-read" },
    { chart: "storage-write" },
    { chart: "memory" },
    { chart: "wifi-send" },
    { chart: "wifi-receive" },
    { p: 2 },
    { table: "Games (fps)" },
    { photos: ["desk/screen", "desk/wide"] },
  ],
  emissions: [
    { p: 0 },
    { chart: "noise-scale" },
    { chart: "noise-load" },
    { chart: "noise-time" },
    { p: 1 },
    { chart: "surface" },
    { photos: ["thermal/deck", "thermal/bottom"] },
    { chart: "stress" },
    { table: "Noise and temperature" },
  ],
  audio: [{ p: "rest" }, { table: "Speakers" }],
  energy: [
    { p: 0 },
    { slot: "energy" },
    { p: 1 },
    { table: "Power consumption (W)" },
    { chart: "battery-web" },
    { chart: "battery-video" },
    { chart: "battery-idle" },
    { chart: "battery-load" },
  ],
};

/** A section's body in recipe order. `slots` fills the era's own blocks; a missing slot renders nothing. */
export function SectionBody({
  section,
  review,
  era,
  photos,
  onOpen,
  slots,
}: {
  section: Section;
  review: Review;
  era: Era;
  photos: Photos;
  onOpen: (id: string) => void;
  slots?: Record<string, ReactNode>;
}) {
  const recipe = RECIPES[section.id] ?? [{ p: "rest" }];
  const usedP = new Set<number>();
  const usedT = new Set<string>();
  const usedC = new Set<string>();
  // Paragraph 0 of the case section is the size paragraph; an era may lift it into its intro.
  if (section.id === "case") usedP.add(0);
  const out: ReactNode[] = [];
  const para = (i: number) => {
    const text = section.paragraphs[i];
    if (text === undefined || usedP.has(i)) return;
    usedP.add(i);
    out.push(<p key={`p${i}`}>{text}</p>);
  };
  for (const [k, step] of recipe.entries()) {
    if ("p" in step) {
      if (step.p === "rest") section.paragraphs.forEach((_, i) => para(i));
      else para(step.p);
    } else if ("photos" in step) {
      out.push(<PhotoRow key={`ph${k}`} ids={step.photos} photos={photos} review={review} />);
    } else if ("table" in step) {
      const t = section.tables.find((x) => x.caption === step.table);
      if (t) {
        usedT.add(t.caption);
        out.push(<TableView key={`t${k}`} table={t} onOpen={onOpen} />);
      }
    } else if ("chart" in step) {
      const c = section.charts?.find((x) => x.id === step.chart);
      if (c) {
        usedC.add(c.id);
        out.push(<ChartView key={`c${k}`} chart={c} onOpen={onOpen} era={era} />);
      }
    } else if (slots?.[step.slot] !== undefined) {
      out.push(<Fragment key={`s${k}`}>{slots[step.slot]}</Fragment>);
    }
  }
  section.paragraphs.forEach((_, i) => para(i));
  for (const t of section.tables)
    if (!usedT.has(t.caption)) out.push(<TableView key={`t-${t.caption}`} table={t} onOpen={onOpen} />);
  for (const c of section.charts ?? [])
    if (!usedC.has(c.id)) out.push(<ChartView key={`c-${c.id}`} chart={c} onOpen={onOpen} era={era} />);
  return <>{out}</>;
}

/** The thirteen category scores as bars, coloured by band. */
export function CategoryBars({ review, className }: { review: Review; className?: string }) {
  return (
    <ul className={`rs-cats${className ? ` ${className}` : ""}`}>
      {review.scores.categories.map((c) => (
        <li key={c.name} className={`rs-${band(c.score)}`}>
          <span>{c.name}</span>
          <i>
            <i style={{ width: `${c.score}%` }} />
          </i>
          <b>{Math.round(c.score)}</b>
        </li>
      ))}
    </ul>
  );
}

/** A conic score ring. */
export function Ring({ score, size, decimals = 0 }: { score: number; size: number; decimals?: number }) {
  return (
    <div
      className={`rs-ring rs-${band(score)}`}
      style={{ "--rs-score": `${score}%`, "--rs-size": `${size}px` } as CSSProperties}
    >
      <div className="rs-ring-inner">
        <b>{num(score, decimals)}</b>
        {decimals === 0 && <span>%</span>}
      </div>
    </div>
  );
}

/** Rival cards with their price, weight and score. */
export function Competitors({ review, onOpen, decimals = 0 }: { review: Review; onOpen: (id: string) => void; decimals?: number }) {
  if (review.peers.length === 0) return null;
  return (
    <div className="rs-peers">
      {review.peers.map((p) => (
        <div key={p.id} className="rs-peer">
          <div>
            <button type="button" className="rs-link rs-peer-name" onClick={() => onOpen(p.id)}>
              {p.name}
            </button>
            <div className="rs-peer-meta">{[p.price ? usd(p.price) : null, `${num(p.kg, 2)} kg`].filter(Boolean).join(", ")}</div>
          </div>
          <div className={`rs-peer-score rs-${band(p.score)}`}>{`${num(p.score, decimals)}${decimals ? "" : "%"}`}</div>
        </div>
      ))}
    </div>
  );
}

/** The sections a contents list offers, in page order. */
export function contentsOf(review: Review, lead: string[], tail: string[]): { id: string; title: string }[] {
  return [
    ...lead.map((t) => ({ id: slug(t), title: t })),
    ...review.sections.map((s) => ({ id: `rs-${s.id}`, title: s.title })),
    ...tail.map((t) => ({ id: slug(t), title: t })),
  ];
}

export const slug = (t: string) => `rs-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** The nearest ancestor that scrolls: the laptop screen, the full-screen page or a window. */
function scrollerOf(el: HTMLElement | null | undefined): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

/** Scrolls the page's own scroller to a section, whether on the laptop screen or full screen. */
export function jump(from: HTMLElement | null, id: string) {
  const root = from?.closest(".rs");
  const el = root?.querySelector<HTMLElement>(`#${id}`);
  const sc = scrollerOf(el);
  if (!el || !sc) return;
  // The page on the laptop screen is scaled by a CSS transform; measure in its own pixels.
  const box = sc.getBoundingClientRect();
  const scale = sc.clientHeight ? box.height / sc.clientHeight : 1;
  const top = (el.getBoundingClientRect().top - box.top) / (scale || 1) + sc.scrollTop - 16;
  sc.scrollTo({ top, behavior: "smooth" });
}

/** The section the reader is in, tracked from the page's scroller. */
export function useCurrent(root: RefObject<HTMLElement | null>, ids: string[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(ids[0]);
  const key = ids.join("|");
  useEffect(() => {
    const el = root.current;
    const sc = scrollerOf(el);
    if (!el || !sc) return;
    const all = key.split("|");
    const onScroll = () => {
      const box = sc.getBoundingClientRect();
      const scale = sc.clientHeight ? box.height / sc.clientHeight : 1;
      let hit = all[0];
      for (const id of all) {
        const s = el.querySelector(`#${id}`);
        if (s && (s.getBoundingClientRect().top - box.top) / (scale || 1) < sc.clientHeight * 0.3) hit = id;
      }
      setCurrent(hit);
    };
    onScroll();
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => sc.removeEventListener("scroll", onScroll);
  }, [root, key]);
  return current;
}
