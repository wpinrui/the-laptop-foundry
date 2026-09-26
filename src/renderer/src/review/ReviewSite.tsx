import { type ReactNode, useMemo, useRef, useState } from "react";
import { factsOf, laptopKind, type Review, rollScores, type Subject } from "../engine";
import type { Era } from "./Charts";
import {
  band,
  bandWord,
  CategoryBars,
  Competitors,
  contentsOf,
  jump,
  PhotoRow,
  type Photos,
  Ring,
  SectionBody,
  Specs,
  slug,
} from "./blocks";
import "./review.css";

// The in-game review site, Notebookcheck (GDD: it publishes the reviews). Its
// look follows the model's era: a 2006 portal, a 2016 flat magazine, a 2026
// editorial page. Every era shows the same review in the same order.

export const PUBLICATION = "Notebookcheck";

export type { Era };
export { bandWord };

export function eraOf(year: number): Era {
  return year < 2012 ? 2006 : year < 2020 ? 2016 : 2026;
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

function Masthead({ era, onHome }: { era: Era; onHome?: () => void }) {
  if (era === 2006)
    return (
      <header className="rs-mast">
        <div className="rs-mast-top">
          <button type="button" className="rs-logo" onClick={onHome}>
            {PUBLICATION}
            <span>.net</span>
          </button>
          <span className="rs-search">
            <i />
            <b>Go</b>
          </span>
        </div>
        <nav>
          <span>News</span>
          <span className="rs-on">Reviews</span>
          <span>Forum</span>
          <span>Top 10</span>
          <span>Benchmarks</span>
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
          <span className="rs-on">Reviews</span>
          <span>News</span>
          <span>Benchmarks</span>
          <span>Deals</span>
        </nav>
        <i className="rs-search" />
      </header>
    );
  return (
    <header className="rs-mast">
      <button type="button" className="rs-logo" onClick={onHome}>
        {PUBLICATION}
      </button>
      <nav>
        <span className="rs-on">Reviews</span>
        <span>News</span>
        <span>Benchmarks</span>
        <span>Guides</span>
      </nav>
      <span className="rs-search">Search</span>
    </header>
  );
}

/** The site mid-load: the masthead and the era's own progress mark. */
export function SiteLoading({ era }: { era: Era }) {
  return (
    <div className={`rs rs-${era} rs-loading`}>
      <div className="rs-frame">
        <Masthead era={era} />
        <i className="rs-progress" />
      </div>
    </div>
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
      <div className="rs-frame">
        <Masthead era={era} />
        <article className="rs-page rs-index">
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
          <div className="rs-tablewrap">
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
          </div>
          {shown.length === 0 && <p>No reviews match.</p>}
        </article>
        <footer className="rs-foot">{PUBLICATION}</footer>
      </div>
    </div>
  );
}

interface SiteProps {
  review: Review;
  onOpen: (id: string) => void;
  onHome?: () => void;
  photos: Photos;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ------------------------------------------------------------------ 2006

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rs-box">
      <div className="rs-box-head">{title}</div>
      {children}
    </div>
  );
}

function Site2006({ review, onOpen, onHome, photos }: SiteProps) {
  const root = useRef<HTMLDivElement>(null);
  const s = review.scores.overall;
  const casePara = review.sections.find((x) => x.id === "case")?.paragraphs[0];
  const contents = contentsOf(review, ["Specifications"], ["Verdict"]);
  const top = [
    { id: review.id, name: `${review.company} ${review.model}`, score: s, me: true },
    ...review.peers.map((p) => ({ id: p.id, name: p.name, score: p.score, me: false })),
  ].sort((a, b) => b.score - a.score);
  const pct = (n: number) => `${Math.round(n)}%`;
  return (
    <div className="rs rs-2006" ref={root}>
      <div className="rs-frame">
        <Masthead era={2006} onHome={onHome} />
        <div className="rs-body">
          <article className="rs-main">
            <div className="rs-crumbs">
              <button type="button" className="rs-link" onClick={onHome}>
                Home
              </button>
              {" > "}
              <button type="button" className="rs-link" onClick={onHome}>
                Reviews
              </button>
              {" > "}
              <span>{review.company}</span>
            </div>
            <h1>{review.headline}</h1>
            <div className="rs-date">{shortDate(review.date)}</div>
            {photos?.["studio/hero"] && (
              <figure className="rs-hero">
                <div className="rs-photo">
                  <img src={photos["studio/hero"]} alt="The test unit" />
                </div>
                <figcaption>The test unit</figcaption>
              </figure>
            )}
            <p>{review.verdict[0]}</p>
            {casePara && <p>{casePara}</p>}
            <h2 id={slug("Specifications")}>Specifications</h2>
            <table className="rs-spectable">
              <thead>
                <tr>
                  <th colSpan={2}>{`${review.company} ${review.model}`}</th>
                </tr>
              </thead>
              <tbody>
                {review.specs.map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {review.sections.map((sec) => (
              <section key={sec.id}>
                <h2 id={`rs-${sec.id}`}>{sec.title}</h2>
                <SectionBody section={sec} review={review} era={2006} photos={photos} onOpen={onOpen} />
              </section>
            ))}
            <h2 id={slug("Verdict")}>Verdict</h2>
            <div className="rs-verdict">
              <div>
                {review.verdict.slice(1).map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
              <div className={`rs-ratebox rs-${band(s)}`}>
                <div className="rs-ratebox-label">Rating</div>
                <b>{pct(s)}</b>
                <div>{bandWord(s)}</div>
              </div>
            </div>
            <table className="rs-procon">
              <tbody>
                <tr>
                  <td>
                    <div className="rs-pro">Pro</div>
                    {review.pros.map((p) => (
                      <div key={p}>{`+ ${p}`}</div>
                    ))}
                  </td>
                  <td>
                    <div className="rs-con">Contra</div>
                    {review.cons.map((p) => (
                      <div key={p}>{`- ${p}`}</div>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="rs-ratetable">
              <thead>
                <tr>
                  <th>Rating</th>
                  <th colSpan={2} />
                </tr>
              </thead>
              <tbody>
                {review.scores.categories.map((c) => (
                  <tr key={c.name} className={`rs-${band(c.score)}`}>
                    <td>{c.name}</td>
                    <td className="rs-ratebar">
                      <i style={{ width: `${c.score}%` }} />
                    </td>
                    <td>{pct(c.score)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td>{pct(s)}</td>
                </tr>
              </tfoot>
            </table>
          </article>
          <aside className="rs-side">
            <Box title={`${PUBLICATION} Rating`}>
              <div className={`rs-siderate rs-${band(s)}`}>
                <b>{pct(s)}</b>
                <div className="rs-siderate-word">{bandWord(s)}</div>
                <div className="rs-siderate-meta">
                  {`${review.company} ${review.model}`}
                  <br />
                  {review.cpu}
                  <br />
                  {review.gpu}
                </div>
              </div>
            </Box>
            <Box title={`Top 10 ${cap(review.kind)}s`}>
              <ol className="rs-top">
                {top.map((t) => (
                  <li key={t.id} className={t.me ? "rs-me" : undefined}>
                    {t.me ? (
                      t.name
                    ) : (
                      <button type="button" className="rs-link" onClick={() => onOpen(t.id)}>
                        {t.name}
                      </button>
                    )}{" "}
                    <span>{pct(t.score)}</span>
                  </li>
                ))}
              </ol>
            </Box>
            <Box title="Contents">
              <div className="rs-contents">
                {contents.map((c) => (
                  <button key={c.id} type="button" className="rs-link" onClick={() => jump(root.current, c.id)}>
                    {c.title}
                  </button>
                ))}
              </div>
            </Box>
          </aside>
        </div>
        <footer className="rs-foot">{`${PUBLICATION} ${review.year}`}</footer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 2016 and 2026

/** One column, verdict first. */
function SiteColumn({ review, onOpen, onHome, photos, era }: SiteProps & { era: Era }) {
  const s = review.scores.overall;
  return (
    <div className={`rs rs-${era}`}>
      <div className="rs-frame">
        <Masthead era={era} onHome={onHome} />
        <article className="rs-page">
          <p className="rs-kicker">Review</p>
          <h1>{review.headline}</h1>
          <p className="rs-dek">{review.dek}</p>
          <PhotoRow ids={["studio/hero"]} photos={photos} review={review} />
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
          <h2>Specifications</h2>
          <Specs review={review} />
          {review.sections.map((sec) => (
            <section key={sec.id}>
              <h2 id={`rs-${sec.id}`}>{sec.title}</h2>
              <SectionBody
                section={sec}
                review={review}
                era={era}
                photos={photos}
                onOpen={onOpen}
                slots={{ "case-intro": <p>{sec.paragraphs[0]}</p> }}
              />
            </section>
          ))}
          <h2>Rating</h2>
          <div className="rs-rating">
            <Ring score={s} size={140} decimals={era === 2026 ? 1 : 0} />
            <CategoryBars review={review} />
          </div>
          <h2>Competitors</h2>
          <Competitors review={review} onOpen={onOpen} />
        </article>
        <footer className="rs-foot">{`${PUBLICATION} ${review.year}`}</footer>
      </div>
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
  if (era === 2006) return <Site2006 review={review} onOpen={onOpen} onHome={onHome} photos={photos} />;
  return <SiteColumn review={review} onOpen={onOpen} onHome={onHome} photos={photos} era={era} />;
}
