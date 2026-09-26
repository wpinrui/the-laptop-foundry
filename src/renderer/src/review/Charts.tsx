import type { BarChart, Chart, DisplayBox, LineChart, ScaleChart } from "../engine";

// The review's charts, drawn as inline SVG from the review's chart data.
// Colour follows the laptop: slot 0 is the reviewed model, each rival keeps
// its slot everywhere on the page.

const tone = (slot: number) => `var(--rs-s${Math.min(slot, 4)})`;

const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const hm = (h: number) => {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}min`;
};

export function Swatch({ slot }: { slot: number }) {
  return <i className="rs-swatch" style={{ background: tone(slot) }} />;
}

export function Note() {
  return <p className="rs-note">* Smaller is better</p>;
}

/** A tidy step for about `count` ticks over a range. */
function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

const W = 640;
const PANEL_H = 110;
const LEFT = 48;
const RIGHT = 14;
const TOP = 22;
const AXIS = 26;

function Lines({ chart }: { chart: LineChart }) {
  const names = new Map<number, string>();
  for (const p of chart.panels) for (const s of p.series) names.set(s.slot, s.name);
  const legend = [...names.entries()].sort((a, b) => a[0] - b[0]);
  const plotW = W - LEFT - RIGHT;
  const height = chart.panels.length * (PANEL_H + TOP) + AXIS;
  const xAt = (x: number) => LEFT + (x / chart.xMax) * plotW;
  const xTicks: number[] = [];
  for (let x = 0; x <= chart.xMax + 1e-9; x += chart.xStep) xTicks.push(x);
  const lower = chart.panels.some((p) => p.lower);
  return (
    <figure className="rs-chart">
      <figcaption>{chart.caption}</figcaption>
      {legend.length > 1 && (
        <ul className="rs-legend">
          {legend.map(([slot, name]) => (
            <li key={slot} className={slot === 0 ? "rs-me" : undefined}>
              <Swatch slot={slot} />
              {name}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={chart.caption}>
        {chart.panels.map((p, pi) => {
          const all = p.series.flatMap((s) => s.values);
          const lo0 = Math.min(...all);
          const hi0 = Math.max(...all);
          const step = niceStep(Math.max(hi0 - lo0, Math.abs(hi0) * 0.1, 1e-6), 3);
          const lo = Math.floor(lo0 / step) * step;
          const hi = Math.max(lo + step, Math.ceil(hi0 / step) * step);
          const y0 = pi * (PANEL_H + TOP) + TOP;
          const yAt = (v: number) => y0 + PANEL_H - ((v - lo) / (hi - lo)) * PANEL_H;
          const yTicks: number[] = [];
          for (let v = lo; v <= hi + step * 1e-6; v += step) yTicks.push(v);
          const n = Math.max(...p.series.map((s) => s.values.length));
          const xOf = (i: number, len: number) => ((i + 1) / len) * chart.xMax;
          const ordered = [...p.series].sort((a, b) => b.slot - a.slot);
          return (
            <g key={p.label}>
              <text x={LEFT} y={y0 - 7} className="rs-axis-title">
                {p.label}
              </text>
              {yTicks.map((v) => (
                <g key={v}>
                  <line x1={LEFT} x2={W - RIGHT} y1={yAt(v)} y2={yAt(v)} className="rs-grid" />
                  <text x={LEFT - 6} y={yAt(v) + 4} textAnchor="end" className="rs-tick">
                    {num(v, step < 1 ? 1 : 0)}
                  </text>
                </g>
              ))}
              {ordered.map((s) => (
                <polyline
                  key={s.slot}
                  fill="none"
                  style={{ stroke: tone(s.slot) }}
                  strokeWidth={s.slot === 0 ? 2.5 : 1.5}
                  strokeLinejoin="round"
                  points={s.values.map((v, i) => `${xAt(xOf(i, s.values.length)).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ")}
                >
                  <title>{s.name}</title>
                </polyline>
              ))}
              {Array.from({ length: n }, (_, i) => {
                const x0 = xAt((i / n) * chart.xMax);
                const x1 = xAt(((i + 1) / n) * chart.xMax);
                return (
                  <rect key={i} x={x0} y={y0} width={x1 - x0} height={PANEL_H} className="rs-hit">
                    <title>
                      {[
                        `${chart.xLabel} ${num(xOf(i, n), chart.xMax === n ? 0 : 1)}`,
                        ...p.series
                          .filter((s) => i < s.values.length)
                          .map((s) => `${s.name}: ${num(s.values[i], p.decimals)}`),
                      ].join("\n")}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {xTicks.map((x) => (
          <text key={x} x={xAt(x)} y={height - 8} textAnchor="middle" className="rs-tick">
            {num(x)}
          </text>
        ))}
        <text x={W - RIGHT} y={height - 8} textAnchor="end" className="rs-axis-title">
          {chart.xLabel}
        </text>
      </svg>
      {lower && <Note />}
    </figure>
  );
}

function Bars({ chart, onOpen }: { chart: BarChart; onOpen: (id: string) => void }) {
  const max = Math.max(...chart.rows.map((r) => r.value), 1e-9);
  const mine = chart.rows.find((r) => r.subject)?.value ?? 0;
  const fmt = (v: number) => (chart.hours ? hm(v) : num(v, chart.decimals));
  return (
    <figure className="rs-chart">
      <table className="rs-barchart">
        <caption>
          {chart.caption}
          {chart.unit ? ` (${chart.unit})` : ""}
          {chart.lower ? "*" : ""}
        </caption>
        <thead>
          <tr>
            <th />
            <th />
            <th />
            <th>% vs this laptop</th>
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r) => {
            const pct = mine > 0 ? (r.value / mine - 1) * 100 : 0;
            return (
              <tr key={`${r.slot}-${r.name}`} className={r.subject ? "rs-me" : undefined}>
                <td>
                  <Swatch slot={r.slot} />
                  {r.link ? (
                    <button type="button" className="rs-link" onClick={() => r.link && onOpen(r.link)}>
                      {r.name}
                    </button>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="rs-bar">
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                    <rect x={0} y={1} width={Math.max(0.5, (r.value / max) * 100)} height={8} rx={1} style={{ fill: tone(r.slot) }}>
                      <title>{`${r.name}: ${fmt(r.value)}`}</title>
                    </rect>
                  </svg>
                </td>
                <td>{fmt(r.value)}</td>
                <td>{r.subject || !mine ? "" : `${pct >= 0 ? "+" : ""}${num(pct)} %`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {chart.lower && <Note />}
    </figure>
  );
}

const BAND_TONES = ["var(--score-great)", "var(--score-good)", "var(--score-fair)", "var(--score-poor)", "var(--rs-loud)"];

function Scale({ chart }: { chart: ScaleChart }) {
  const plotW = W - 2 * 12;
  const xAt = (v: number) => 12 + ((Math.min(chart.max, Math.max(chart.min, v)) - chart.min) / (chart.max - chart.min)) * plotW;
  const own = chart.marks.filter((m) => m.subject);
  const others = chart.marks.filter((m) => !m.subject);
  let from = chart.min;
  return (
    <figure className="rs-chart">
      <figcaption>
        {chart.caption} ({chart.unit})*
      </figcaption>
      <svg viewBox={`0 0 ${W} 92`} role="img" aria-label={chart.caption}>
        {chart.bands.map((b, i) => {
          const x0 = xAt(from);
          const x1 = xAt(b.to);
          from = b.to;
          return (
            <g key={b.label}>
              <rect x={x0} y={34} width={Math.max(0, x1 - x0 - 2)} height={14} rx={2} style={{ fill: BAND_TONES[i % BAND_TONES.length] }} opacity={0.35} />
              <text x={(x0 + x1) / 2} y={62} textAnchor="middle" className="rs-tick">
                {b.label}
              </text>
            </g>
          );
        })}
        {others.map((m) => (
          <line key={`${m.slot}-${m.label}`} x1={xAt(m.value)} x2={xAt(m.value)} y1={31} y2={51} strokeWidth={3} style={{ stroke: tone(m.slot) }}>
            <title>{`${m.label}: ${num(m.value, 1)} ${chart.unit}`}</title>
          </line>
        ))}
        {own.map((m, i) => (
          <g key={m.label}>
            <line x1={xAt(m.value)} x2={xAt(m.value)} y1={i % 2 ? 22 : 12} y2={51} strokeWidth={3} style={{ stroke: tone(0) }} />
            <text x={xAt(m.value)} y={i % 2 ? 18 : 8} textAnchor="middle" className="rs-mark">
              {`${m.label} ${num(m.value, 1)}`}
            </text>
          </g>
        ))}
        {[chart.min, chart.max].map((v) => (
          <text key={v} x={xAt(v)} y={82} textAnchor={v === chart.min ? "start" : "end"} className="rs-tick">
            {num(v)}
          </text>
        ))}
      </svg>
      {others.length > 0 && (
        <ul className="rs-legend">
          {others.map((m) => (
            <li key={`${m.slot}-${m.label}`}>
              <Swatch slot={m.slot} />
              {`${m.label} ${num(m.value, 1)}`}
            </li>
          ))}
        </ul>
      )}
      <Note />
    </figure>
  );
}

function Display({ chart }: { chart: DisplayBox }) {
  const max = Math.max(...chart.grid, 1);
  return (
    <figure className="rs-chart rs-display">
      <figcaption>{chart.caption}</figcaption>
      <div className="rs-display-body">
        <svg viewBox="0 0 160 100" role="img" aria-label="Brightness distribution">
          {chart.grid.map((v, i) => {
            const x = (i % 3) * 53;
            const y = Math.floor(i / 3) * 33;
            return (
              <g key={`${i}-${v}`}>
                <rect x={x} y={y} width={51} height={31} rx={2} className="rs-zone" style={{ opacity: 0.25 + 0.75 * (v / max) }} />
                <text x={x + 25.5} y={y + 20} textAnchor="middle" className="rs-zone-text">
                  {num(v)}
                </text>
              </g>
            );
          })}
        </svg>
        <dl>
          {chart.rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Note />
    </figure>
  );
}

export function ChartView({ chart, onOpen }: { chart: Chart; onOpen: (id: string) => void }) {
  if (chart.kind === "lines") return <Lines chart={chart} />;
  if (chart.kind === "bars") return <Bars chart={chart} onOpen={onOpen} />;
  if (chart.kind === "scale") return <Scale chart={chart} />;
  return <Display chart={chart} />;
}
