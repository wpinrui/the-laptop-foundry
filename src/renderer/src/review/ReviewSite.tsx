import { type CSSProperties, useMemo, useState } from "react";
import { factsOf, laptopKind, type Review, rollScores, type Subject, type Table } from "../engine";
import { ChartView, Note, Swatch } from "./Charts";
import "./review.css";

// The in-game review site, Notebookcheck (GDD: it publishes the reviews). Its look follows the model's era.

export const PUBLICATION = "Notebookcheck";

export type Era = 2006 | 2016 | 2026;

export function eraOf(year: number): Era {
  return year < 2012 ? 2006 : year < 2020 ? 2016 : 2026;
}

function Masthead({ era, onHome }: { era: Era; onHome?: () => void }) {
  if (era === 2006)
    return (
      <header className="rs-mast">
        <button type="button" className="rs-logo" onClick={onHome}>
          Notebookcheck<span>.net</span>
        </button>
        <nav>
          <span>News</span>
          <span>Reviews</span>
          <span>Forum</span>
          <span>Top 10</span>
        </nav>
      </header>
    );
  if (era === 2016)
    return (
      <header className="rs-mast">
        <button type="button" className="rs-logo" onClick={onHome}>
          {PUBLICATION}
        </button>
        <nav>
          <span>Reviews</span>
          <span>News</span>
          <span>Deals</span>
        </nav>
      </header>
    );
  return (
    <header className="rs-mast">
      <button type="button" className="rs-logo" onClick={onHome}>
        {PUBLICATION}
      </button>
    </header>
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "14 March 2026". */
export function longDate(d: Review["date"]): string {
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}

/** "14/03/2006", as the old portal printed it. */
export function shortDate(d: Review["date"]): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.day)}/${two(d.month)}/${d.year}`;
}

/** The site mid-load: the masthead and the era's own progress mark. */
export function SiteLoading({ era }: { era: Era }) {
  return (
    <div className={`rs rs-${era} rs-loading`}>
      <Masthead era={era} />
      <i className="rs-progress" />
    </div>
  );
}

function band(score: number): string {
  return score >= 90 ? "great" : score >= 80 ? "good" : score >= 70 ? "fair" : "poor";
}

/** The rating piece. Bigger, brighter and livelier the better the score. */
function Rating({ review }: { review: Review }) {
  const s = review.scores.overall;
  const t = Math.max(0, Math.min(1, (s - 55) / 41));
  const style = {
    "--rs-score": `${s}%`,
    "--rs-size": `${9 + t * 7}rem`,
  } as CSSProperties;
  return (
    <section className={`rs-rating ${band(s)}`} style={style}>
      <div className="rs-ring">
        <div className="rs-ring-inner">
          <b>{s.toFixed(1)}</b>
          <span>%</span>
        </div>
      </div>
      <ul className="rs-bars">
        {review.scores.categories.map((c) => (
          <li key={c.name} className={band(c.score)}>
            <span>{c.name}</span>
            <i style={{ width: `${c.score}%` }} />
            <b>{c.score.toFixed(0)}%</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TableView({
  table,
  onOpen,
  slots,
}: {
  table: Table;
  onOpen: (id: string) => void;
  /** Colour slot by laptop id. */
  slots?: Map<string, number>;
}) {
  const slotOf = (row: Table["rows"][number]) =>
    row.subject ? 0 : row.link !== undefined ? slots?.get(row.link) : undefined;
  return (
    <>
    <table className="rs-table">
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
                  {slotOf(row) !== undefined && <Swatch slot={slotOf(row) ?? 0} />}
                  <button
                    type="button"
                    className="rs-link"
                    onClick={() => row.link && onOpen(row.link)}
                  >
                    {cell}
                  </button>
                </td>
              ) : (
                <td
                  key={`${j}`}
                  className={row.tones?.[j] ? `rs-fps rs-fps-${row.tones[j]}` : undefined}
                >
                  {j === 0 && slotOf(row) !== undefined && <Swatch slot={slotOf(row) ?? 0} />}
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
    {table.columns.some((c) => c.endsWith("*")) && <Note />}
    </>
  );
}

/** One entry on the index page. */
export interface IndexEntry {
  subject: Subject;
  /** The player's own model. */
  own: boolean;
}

const BODIES = ["thin and light", "medium", "large"] as const;
const PERFS = ["office", "mixed-use", "gaming"] as const;
const BUDGETS = ["low", "midrange", "premium"] as const;

/** Every review on the site: the player's reviewed models and every rival. */
export function ReviewIndex({
  entries,
  era,
  onOpen,
}: {
  entries: IndexEntry[];
  era: Era;
  onOpen: (id: string) => void;
}) {
  const [year, setYear] = useState<number | "">("");
  const [body, setBody] = useState("");
  const [perf, setPerf] = useState("");
  const [budget, setBudget] = useState("");
  const [own, setOwn] = useState(false);
  const rows = useMemo(
    () =>
      entries.map((e) => {
        const f = factsOf(e.subject);
        return { ...e, cls: f.cls, kind: laptopKind(f), score: rollScores(e.subject.id).overall };
      }),
    [entries],
  );
  const years = [...new Set(rows.map((r) => r.subject.build.year))].sort();
  const shown = rows
    .filter(
      (r) =>
        (year === "" || r.subject.build.year === year) &&
        (!body || r.cls.body === body) &&
        (!perf || r.cls.performance === perf) &&
        (!budget || r.cls.budget === budget) &&
        (!own || r.own),
    )
    .sort(
      (a, b) =>
        Number(b.own) - Number(a.own) ||
        b.subject.build.year - a.subject.build.year ||
        b.score - a.score,
    );
  const pick = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: readonly string[],
  ) => (
    <select value={value} aria-label={label} onChange={(e) => set(e.target.value)}>
      <option value="">{`Any ${label}`}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
  return (
    <div className={`rs rs-${era}`}>
      <Masthead era={era} />
      <article className="rs-page">
        <p className="rs-kicker">Reviews</p>
        <h1>All laptop reviews</h1>
        <div className="rs-filters">
          <select
            value={year}
            aria-label="year"
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {pick("size", body, setBody, BODIES)}
          {pick("use", perf, setPerf, PERFS)}
          {pick("budget", budget, setBudget, BUDGETS)}
          <label>
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
            Mine only
          </label>
        </div>
        <table className="rs-table">
          <thead>
            <tr>
              <th>Laptop</th>
              <th>Year</th>
              <th>Class</th>
              <th>Price</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.subject.id} className={r.own ? "rs-me" : undefined}>
                <td>
                  <button type="button" className="rs-link" onClick={() => onOpen(r.subject.id)}>
                    {r.subject.company} {r.subject.name}
                  </button>
                </td>
                <td>{r.subject.build.year}</td>
                <td>{r.kind.charAt(0).toUpperCase() + r.kind.slice(1)}</td>
                <td>{r.subject.build.price ? `$${r.subject.build.price.toLocaleString("en-US")}` : "—"}</td>
                <td>{r.score.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p>No reviews match.</p>}
      </article>
      <footer className="rs-foot">{PUBLICATION}</footer>
    </div>
  );
}

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

/** Where the photos go: the product shots near the top, the rest in their sections. */
const PHOTOS_TOP = ["studio/hero", "studio/closed", "studio/top", "studio/left", "studio/right", "studio/rear"];
const PHOTOS_IN: Record<string, string[]> = {
  case: ["ports/left", "ports/right", "ports/rear", "ports/front", "size/top", "teardown/top"],
  display: ["viewing/grid", "outdoor/table"],
  performance: ["desk/wide", "desk/screen"],
  emissions: ["thermal/deck", "thermal/bottom"],
};

function Photos({ ids, photos }: { ids: string[]; photos?: Record<string, string> | null }) {
  const shown = photos ? ids.filter((id) => photos[id]) : [];
  if (!photos || shown.length === 0) return null;
  return (
    <div className="rs-photos">
      {shown.map((id) => (
        <figure key={id}>
          <img src={photos[id]} alt={PHOTO_CAPTIONS[id] ?? "Photo"} />
          <figcaption>{PHOTO_CAPTIONS[id]}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ReviewSite({
  review,
  onOpen,
  onHome,
  photos,
}: {
  review: Review;
  onOpen: (id: string) => void;
  onHome?: () => void;
  /** Review photos by shot id, taken automatically; absent until they are ready. */
  photos?: Record<string, string> | null;
}) {
  const era = eraOf(review.year);
  const slots = useMemo(() => new Map(review.field.map((id, i) => [id, i])), [review.field]);
  return (
    <div className={`rs rs-${era}`}>
      <Masthead era={era} onHome={onHome} />
      <article className="rs-page">
        <p className="rs-kicker">Review</p>
        <h1>{review.headline}</h1>
        <section className="rs-verdict">
          {review.verdict.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <div className="rs-proscons">
            <ul className="rs-pros">
              {review.pros.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <ul className="rs-cons">
              {review.cons.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </section>
        <Photos ids={PHOTOS_TOP} photos={photos} />
        <h2>Specifications</h2>
        <dl className="rs-specs">
          {review.specs.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {review.sections.map((s) => (
          <section key={s.id} className="rs-section">
            <h2>{s.title}</h2>
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <Photos ids={PHOTOS_IN[s.id] ?? []} photos={photos} />
            {s.charts?.map((c) => (
              <ChartView key={c.caption} chart={c} onOpen={onOpen} />
            ))}
            {s.tables.map((t) => (
              <TableView key={t.caption} table={t} onOpen={onOpen} slots={slots} />
            ))}
          </section>
        ))}
        <h2>Rating</h2>
        <Rating review={review} />
      </article>
      <footer className="rs-foot">
        {PUBLICATION} {review.year}
      </footer>
    </div>
  );
}
