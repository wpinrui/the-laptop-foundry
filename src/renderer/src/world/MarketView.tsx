import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedModel } from "../../../preload/store";
import {
  AWARD_NAMES,
  buyersOf,
  type CampaignState,
  competitorsOf,
  type Quarter,
  quarterLabel,
  quarterSummary,
  type WorldLaptop,
  type WorldMarket,
  worldQuarters,
} from "../engine/campaign";
import { HEADLINE_STATS } from "../engine/market/types";
import { count, usd, usdShort } from "../foundry/Release";
import { pct } from "../foundry/Finance";
import { cap, inchesLabel, laptopName, makerName, points, STAT_LABEL, segmentName, useWorldMarket } from "./data";
import "./world.css";

// The market world between the rails: what happened in any kept quarter, a
// model's closest rivals and its buyers. Each panel takes a selector's values
// and lays them out; nothing here computes the market. The retailer's site
// lives on the laptop's own OS, not here.

export type MarketTab = "quarter" | "competitors" | "buyers";

const TABS: [MarketTab, string][] = [
  ["quarter", "Quarter"],
  ["competitors", "Competitors"],
  ["buyers", "Buyers"],
];

const qKey = (q: Quarter) => `${q.year}-${q.quarter}`;
const sign = (n: number | null) => (n === null ? undefined : n > 0 ? "up" : n < 0 ? "short" : undefined);

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mw-cell">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function Name({ l, company }: { l: WorldLaptop; company: string }) {
  return <th className={l.own ? "mine" : undefined}>{laptopName(l, company)}</th>;
}

function QuarterPanel({ campaign, market, quarter, company }: { campaign: CampaignState; market: WorldMarket; quarter: Quarter; company: string }) {
  const s = useMemo(() => quarterSummary(campaign, market, quarter), [campaign, market, quarter]);
  const p = s.player;
  return (
    <div className="mw-scroll">
      <div className="mw-cells">
        <Cell label="Market" value={count(s.total)} />
        <Cell label="Sold" value={count(p.units)} />
        <Cell label="Share" value={pct(p.share)} />
        <Cell label="Share change" value={points(p.change)} tone={sign(p.change)} />
        <Cell label="Profit" value={p.entry ? usdShort(p.entry.profit) : ""} tone={p.entry && p.entry.profit < 0 ? "short" : undefined} />
        <Cell label="Cash" value={p.entry ? usdShort(p.entry.cash) : ""} />
      </div>
      <div className="mw-cols">
        <table className="fd-books-table mw-table">
          <caption>Best sellers</caption>
          <thead>
            <tr>
              <th />
              <th>Units</th>
              <th>Share</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {s.best.map((b) => (
              <tr key={b.id}>
                <Name l={b} company={company} />
                <td>{count(b.units)}</td>
                <td>{pct(b.share)}</td>
                <td>{usd(b.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="fd-books-table mw-table">
          <caption>Makers</caption>
          <thead>
            <tr>
              <th />
              <th>Units</th>
              <th>Share</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {s.makers.map((m) => (
              <tr key={m.maker ?? "own"}>
                <th className={m.maker === null ? "mine" : undefined}>{makerName(m.maker, company)}</th>
                <td>{count(m.units)}</td>
                <td>{pct(m.share)}</td>
                <td className={sign(m.change)}>{points(m.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mw-cols">
        {p.models.length > 0 && (
          <table className="fd-books-table mw-table">
            <caption>{company}</caption>
            <thead>
              <tr>
                <th />
                <th>Sold</th>
                <th>Wanted</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {p.models.map((m) => (
                <tr key={m.id}>
                  <th className="mine">{m.name}</th>
                  <td>{count(m.units)}</td>
                  <td className={m.demand > m.units ? "short" : undefined}>{count(m.demand)}</td>
                  <td>{usd(m.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.launches.length > 0 && (
          <table className="fd-books-table mw-table">
            <caption>Launches</caption>
            <tbody>
              {s.launches.map((l) => (
                <tr key={l.id}>
                  <Name l={l} company={company} />
                  <td>{usd(l.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.reviews.length > 0 && (
          <table className="fd-books-table mw-table">
            <caption>Reviews</caption>
            <tbody>
              {s.reviews.map((l) => (
                <tr key={l.id}>
                  <Name l={l} company={company} />
                  <td>{l.review === null ? "" : `${l.review.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.awards.length > 0 && (
          <table className="fd-books-table mw-table">
            <caption>Awards</caption>
            <tbody>
              {s.awards.map((a) => (
                <tr key={a.award}>
                  <th>{AWARD_NAMES[a.award]}</th>
                  <td className={a.maker === null ? "mine" : undefined}>{`${makerName(a.maker, company)} ${a.name}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.segments.length > 0 && (
          <table className="fd-books-table mw-table">
            <caption>Segments</caption>
            <tbody>
              {[...s.segments]
                .sort((a, b) => b.units - a.units)
                .map((g) => (
                  <tr key={g.segment}>
                    <th>{segmentName(g.segment)}</th>
                    <td>{count(g.units)}</td>
                    <td>{pct(s.total > 0 ? g.units / s.total : 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CompetitorsPanel({
  campaign,
  market,
  quarter,
  model,
  company,
}: {
  campaign: CampaignState;
  market: WorldMarket;
  quarter: Quarter;
  model: string;
  company: string;
}) {
  const c = useMemo(() => competitorsOf(campaign, market, model, quarter), [campaign, market, model, quarter]);
  if (!c.model) return null;
  const cols = [c.model, ...c.rivals];
  const idx = (v: number | undefined) => (v === undefined ? "" : Math.round(v).toString());
  return (
    <div className="mw-scroll">
      <table className="fd-books-table mw-table mw-versus">
        <thead>
          <tr>
            <th />
            {cols.map((l) => (
              <th key={l.id} className={l.own ? "mine" : undefined}>
                {laptopName(l, company)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Price</th>
            {cols.map((l) => (
              <td key={l.id}>{usd(l.price)}</td>
            ))}
          </tr>
          <tr>
            <th>Units</th>
            {cols.map((l) => (
              <td key={l.id}>{count(l.units)}</td>
            ))}
          </tr>
          <tr>
            <th>Rating</th>
            {cols.map((l) => (
              <td key={l.id}>{l.review === null ? "" : `${l.review.toFixed(1)}%`}</td>
            ))}
          </tr>
          <tr>
            <th>Overlap</th>
            <td />
            {c.rivals.map((r) => (
              <td key={r.id}>{pct(r.overlap)}</td>
            ))}
          </tr>
          <tr>
            <th>Screen</th>
            {cols.map((l) => (
              <td key={l.id}>{inchesLabel(l.inches)}</td>
            ))}
          </tr>
          <tr>
            <th>Weight</th>
            {cols.map((l) => (
              <td key={l.id}>{l.kg === null ? "" : `${l.kg.toFixed(2)} kg`}</td>
            ))}
          </tr>
          <tr>
            <th>Class</th>
            {cols.map((l) => (
              <td key={l.id}>{[cap(l.body), cap(l.performance)].filter(Boolean).join(", ")}</td>
            ))}
          </tr>
          {HEADLINE_STATS.filter((k) => k !== "price").map((k) => (
            <tr key={k}>
              <th>{STAT_LABEL[k]}</th>
              {cols.map((l) => {
                const v = l.index?.[k];
                const mine = c.model?.index?.[k];
                const tone = !l.own && v !== undefined && mine !== undefined ? (v > mine * 1.05 ? "short" : v < mine * 0.95 ? "up" : undefined) : undefined;
                return (
                  <td key={l.id} className={tone}>
                    {idx(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuyersPanel({ campaign, quarter, model, scope }: { campaign: CampaignState; quarter: Quarter; model: string; scope: "all" | "quarter" }) {
  const b = useMemo(() => buyersOf(campaign, model, scope === "quarter" ? quarter : undefined), [campaign, model, quarter, scope]);
  return (
    <div className="mw-scroll">
      <div className="mw-cells">
        <Cell label="Sold" value={count(b.units)} />
        <Cell label="Quarters" value={String(b.quarters)} />
      </div>
      <table className="fd-books-table mw-table mw-buyers">
        <thead>
          <tr>
            <th />
            <th>Units</th>
            <th>Split</th>
            <th>Share won</th>
            <th className="left">Wants</th>
            <th>Reach</th>
            <th>Rep</th>
          </tr>
        </thead>
        <tbody>
          {b.segments.map((g) => (
            <tr key={g.segment} className={g.units > 0 ? undefined : "off"}>
              <th>{segmentName(g.segment)}</th>
              <td>{count(g.units)}</td>
              <td>
                <span className="mw-bar">
                  <i style={{ width: `${g.split * 100}%` }} />
                </span>
                {pct(g.split)}
              </td>
              <td>{pct(g.won)}</td>
              <td className="left">{g.priorities.map((k) => STAT_LABEL[k]).join(", ")}</td>
              <td>{`${Math.round(g.reach * 100)}%`}</td>
              <td className={g.perception < 0 ? "short" : g.perception > 0 ? "up" : undefined}>
                {`${g.perception > 0 ? "+" : ""}${Math.round(g.perception)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The models the Competitors and Buyers tabs can pick: released first, newest first. */
function pickable(campaign: CampaignState, models: SavedModel[]): SavedModel[] {
  const rel = (m: SavedModel) => campaign.releases[m.id];
  return [...models].sort((a, b) => Number(!!rel(b)) - Number(!!rel(a)) || b.created - a.created);
}

export function MarketView({
  campaign,
  models,
  company,
  tab,
  onTab,
  quarter: startQuarter,
  model: startModel,
  onClose,
}: {
  campaign: CampaignState;
  models: SavedModel[];
  company: string;
  tab: MarketTab;
  onTab: (tab: MarketTab) => void;
  quarter?: Quarter;
  model?: string | null;
  onClose: () => void;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Escape closes the view before it reaches the laptop list.
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  const market = useWorldMarket(models);
  const quarters = useMemo(() => worldQuarters(campaign), [campaign]);
  const [picked, setPicked] = useState(startQuarter ? qKey(startQuarter) : "");
  const quarter = quarters.find((q) => qKey(q) === picked) ?? quarters[0];
  const choices = pickable(campaign, models);
  const [model, setModel] = useState(startModel ?? choices[0]?.id ?? "");
  const [scope, setScope] = useState<"all" | "quarter">("all");
  const needsModel = tab === "competitors" || tab === "buyers";
  return (
    <section className="fd-books mw fd-in">
      <header>
        {TABS.map(([t, label]) => (
          <button key={t} type="button" className={`fd-text${tab === t ? " on" : ""}`} aria-pressed={tab === t} onClick={() => onTab(t)}>
            {label}
          </button>
        ))}
        <span className="mw-picks">
          {needsModel && (
            <select value={model} aria-label="Model" onChange={(e) => setModel(e.target.value)}>
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {tab === "buyers" && (
            <select value={scope} aria-label="Quarters" onChange={(e) => setScope(e.target.value as "all" | "quarter")}>
              <option value="all">All quarters</option>
              <option value="quarter">{quarter ? quarterLabel(quarter) : ""}</option>
            </select>
          )}
          {quarters.length > 0 && (tab !== "buyers" || scope === "quarter") && (
            <select value={quarter ? qKey(quarter) : ""} aria-label="Quarter" onChange={(e) => setPicked(e.target.value)}>
              {quarters.map((q) => (
                <option key={qKey(q)} value={qKey(q)}>
                  {quarterLabel(q)}
                </option>
              ))}
            </select>
          )}
        </span>
        <button type="button" className="fd-text fd-books-close" onClick={onClose}>
          Close
        </button>
      </header>
      {quarter && tab === "quarter" && <QuarterPanel campaign={campaign} market={market} quarter={quarter} company={company} />}
      {quarter && tab === "competitors" && model && (
        <CompetitorsPanel campaign={campaign} market={market} quarter={quarter} model={model} company={company} />
      )}
      {quarter && tab === "buyers" && model && <BuyersPanel campaign={campaign} quarter={quarter} model={model} scope={scope} />}
    </section>
  );
}
