import type { CSSProperties } from "react";
import type { Review, Table } from "../engine";
import "./review.css";

// The in-game review site, Notebook Ledger. Its look follows the model's era.

export const PUBLICATION = "Notebook Ledger";

export type Era = 2006 | 2016 | 2026;

export function eraOf(year: number): Era {
  return year < 2012 ? 2006 : year < 2020 ? 2016 : 2026;
}

function Masthead({ era, onHome }: { era: Era; onHome?: () => void }) {
  if (era === 2006)
    return (
      <header className="rs-mast">
        <button type="button" className="rs-logo" onClick={onHome}>
          NotebookLedger<span>.com</span>
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
        Ledger
      </button>
    </header>
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
}: {
  table: Table;
  onOpen: (id: string) => void;
}) {
  return (
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
                  <button
                    type="button"
                    className="rs-link"
                    onClick={() => row.link && onOpen(row.link)}
                  >
                    {cell}
                  </button>
                </td>
              ) : (
                <td key={`${j}`}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReviewSite({
  review,
  onOpen,
  onHome,
}: {
  review: Review;
  onOpen: (id: string) => void;
  onHome?: () => void;
}) {
  const era = eraOf(review.year);
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
            {s.tables.map((t) => (
              <TableView key={t.caption} table={t} onOpen={onOpen} />
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
