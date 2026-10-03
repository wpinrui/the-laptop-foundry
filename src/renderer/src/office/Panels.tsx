import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import { type CampaignState, publicationQuarter, quarterLabel, worldQuarters } from "../engine/campaign";
import type { SegmentId } from "../engine/market/types";
import { AwardsTab } from "../foundry/Awards";
import { BooksTab, type StatementTab } from "../foundry/Finance";
import { overallOf, yearOf } from "../foundry/LaptopList";
import { BrandTab } from "../foundry/Marketing";
import { ConfirmDelete } from "../foundry/Menus";
import { ModelTab, statusOf, usd, usdShort } from "../foundry/Release";
import { pctLabel } from "../video/commercial";
import { type MarketTab, MarketScreen } from "../world/MarketScreen";
import { labelOf, type OfficeAt, type StationId } from "./stations";

// Each station's panel, open while the view is on the station. The Desk runs
// the business at one glance across the view; the rest sit in the calm third
// of their station's view.

/** A finished video on the TV's list. */
export interface TvVideo {
  /** Its kept file. */
  file: string;
  /** The quarter for a short, Commercial for a commercial. */
  label: string;
  /** The model it is about. */
  name: string;
  poster?: string;
}

/** The company's finished videos, newest first, and the one loaded on the TV. */
export interface TvCard {
  videos: TvVideo[];
  /** The file loaded for the TV, once it has loaded. */
  playing: string | null;
  url?: string;
  /** The newest video's model, while it is new and not yet watched. */
  fresh?: string;
  onPlay: (file: string) => void;
  /** The one on the TV, full screen. */
  onFull: () => void;
}

/** What the panels do: every change goes through the App, which owns the save. */
export interface OfficeActions {
  onNew: () => void;
  onUse: (id: string) => void;
  onReview: (id: string) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  units: (id: string) => number;
  onUnits: (id: string, units: number) => void;
  onPrice: (id: string, price: number) => void;
  /** An unreleased, unreviewed model's price, saved with its build. */
  onDraftPrice: (id: string, price: number) => void;
  onRelease: (id: string, units: number, cost: number, refresh: boolean) => void;
  onReorder: (id: string, units: number, cost: number) => void;
  onTier: (segment: SegmentId, tier: number) => void;
  onStatement: (tab: StatementTab) => void;
  /** Opens the full Market screen on a model's rivals or buyers. */
  onMarket: (tab: "rivals" | "buyers", model: string) => void;
  tv?: TvCard;
  /** Awards won since the player last looked at the cabinet. */
  newAwards: number;
  onSeenAwards: () => void;
}

/** The laptops on the wall, newest first: the order they fill the slots in. */
export function wallOrder(c: SavedCompany): SavedModel[] {
  return [...c.models].sort((a, b) => b.created - a.created);
}

export type Status = "draft" | "stock" | "soldout" | "block";

export function statusOfModel(m: SavedModel, campaign: CampaignState | null): Status {
  if (buildBlock(m.build)) return "block";
  if (!campaign) return "stock";
  const r = campaign.releases[m.id];
  if (!r) return "draft";
  return r.stock <= 0 ? "soldout" : "stock";
}

/** The laptop picked at the Desk and on the wall: the one in `at`, else the newest. */
export function pickedModel(company: SavedCompany, at: OfficeAt): SavedModel | null {
  const models = wallOrder(company);
  return models.find((m) => m.id === at.model) ?? models[0] ?? null;
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="of-panel-head">
        <h2>{title}</h2>
      </header>
      <div className="cr-body">{children}</div>
    </>
  );
}

interface Ctx {
  company: SavedCompany;
  campaign: CampaignState | null;
  at: OfficeAt;
  onAt: (at: OfficeAt) => void;
  go: (id: StationId) => void;
  actions: OfficeActions;
  /** A video is playing on the TV. */
  playing: boolean;
  onWatch: (file: string) => void;
}

export function buildPanels(c: Ctx): Partial<Record<StationId, ReactNode>> {
  const { campaign } = c;
  const out: Partial<Record<StationId, ReactNode>> = {
    desk: <Desk {...c} />,
    products: <Products {...c} />,
  };
  if (campaign) {
    out.finance = (
      <Frame title={labelOf("finance")}>
        <BooksTab campaign={campaign} onOpen={c.actions.onStatement} />
      </Frame>
    );
    out.marketing = (
      <Frame title={labelOf("marketing")}>
        <BrandTab campaign={campaign} onTier={c.actions.onTier} />
      </Frame>
    );
    if (worldQuarters(campaign).length > 0) out.market = <Market {...c} campaign={campaign} />;
  }
  if (c.actions.tv && c.actions.tv.videos.length > 0)
    out.tv = (
      <Frame title={labelOf("tv")}>
        <Videos card={c.actions.tv} playing={c.playing} onWatch={c.onWatch} />
      </Frame>
    );
  const reviewed = c.company.models.some((m) => (campaign ? campaign.reviews[m.id] : m.reviewed));
  if (campaign || reviewed)
    out.trophies = (
      <Frame title={labelOf("trophies")}>
        <Trophies {...c} />
      </Frame>
    );
  return out;
}

/**
 * The Desk, where the business is run at one glance: the company's overview,
 * its laptops with their status, and for the picked one everything that
 * decides its production and price.
 */
function Desk(c: Ctx) {
  const { company, campaign, actions, at, onAt } = c;
  const models = useMemo(() => wallOrder(company), [company]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scored when the models change
  const scores = useMemo(
    () => new Map(models.map((m) => [m.id, m.reviewed ? overallOf(m, company.name) : null])),
    [company.models, company.name],
  );
  const current = pickedModel(company, at);
  const currentId = current?.id;
  // The picked laptop stays in view as Up and Down move through the list.
  useEffect(() => {
    if (currentId) document.querySelector(".of-desk .of-rows .selected")?.scrollIntoView({ block: "nearest" });
  }, [currentId]);
  const over = !!campaign?.over;
  return (
    <>
      <header className="of-panel-head">
        <h2>{labelOf("desk")}</h2>
      </header>
      <div className="of-desk">
        <section className="of-desk-over">
          <Overview {...c} />
        </section>
        <section className="of-desk-models">
          {!over && (
            <button type="button" className="fd-secondary of-new" onClick={actions.onNew}>
              New model
            </button>
          )}
          <div className="of-rows">
            {models.map((m) => {
              const block = buildBlock(m.build);
              const s = campaign && !block ? statusOf(campaign, m.id) : null;
              const score = scores.get(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`fd-row${m.id === currentId ? " selected" : ""}`}
                  onClick={() => onAt({ ...at, model: m.id })}
                >
                  <span>
                    <b>{m.name}</b>
                    <small>
                      {yearOf(m)}
                      {block && <em>{block}</em>}
                      {s && <em className={s.warn ? undefined : "muted"}>{s.text}</em>}
                    </small>
                  </span>
                  {score != null && <span className="fd-score">{Math.round(score)}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section className="of-desk-model">
          {current && (
            <Detail
              key={current.id}
              model={current}
              models={company.models}
              campaign={campaign}
              score={scores.get(current.id) ?? null}
              actions={actions}
            />
          )}
        </section>
      </div>
    </>
  );
}

function Overview({ company, campaign, actions, go, at, onAt }: Ctx) {
  if (!campaign) {
    const scores = company.models.filter((m) => m.reviewed).map((m) => overallOf(m, company.name) ?? 0);
    return (
      <div className="cr-cells">
        <div>
          <span>Laptops</span>
          <b>{company.models.length}</b>
        </div>
        <div>
          <span>Reviewed</span>
          <b>{scores.length}</b>
        </div>
        <div>
          <span>Best</span>
          <b>{scores.length ? Math.round(Math.max(...scores)) : ""}</b>
        </div>
      </div>
    );
  }
  const ledger = campaign.ledger.slice(-8);
  const last = ledger[ledger.length - 1];
  const top = Math.max(1, ...ledger.map((e) => Math.abs(e.profit)));
  const alerts: { kind: string; text: string; to?: StationId; model?: string; warn?: boolean }[] = [];
  const soldOut: SavedModel[] = [];
  const due: SavedModel[] = [];
  for (const m of company.models) {
    const r = campaign.releases[m.id];
    if (!r) continue;
    if (r.stock <= 0) soldOut.push(m);
    const pub = publicationQuarter(r.quarter);
    if (!campaign.reviews[m.id] && pub.year === campaign.now.year && pub.quarter === campaign.now.quarter) due.push(m);
  }
  // One line each: a laptop's line picks it at the Desk.
  const line = (kind: string, ms: SavedModel[], warn = false) => {
    if (ms.length > 0) alerts.push({ kind, text: ms.map((m) => m.name).join(", "), model: ms[0].id, warn });
  };
  line("Sold out", soldOut, true);
  line("Review", due);
  if (actions.newAwards > 0) alerts.push({ kind: "Awards", text: String(actions.newAwards), to: "trophies" });
  if (actions.tv?.fresh) alerts.push({ kind: "Video", text: actions.tv.fresh, to: "tv" });
  return (
    <>
      <div className="of-desk-clock">
        <b>{quarterLabel(campaign.now)}</b>
        <span>
          <b className={campaign.cash < 0 ? "short" : undefined}>{usd(campaign.cash)}</b>
          {last && <small className={last.profit < 0 ? "short" : "up"}>{usdShort(last.profit)}</small>}
        </span>
      </div>
      {ledger.length > 0 && (
        <div className="of-trend">
          {ledger.map((e) => (
            <div key={`${e.quarter.year}-${e.quarter.quarter}`} title={`${quarterLabel(e.quarter)} ${usdShort(e.profit)}`}>
              <i className={e.profit < 0 ? "down" : "up"} style={{ height: `${(Math.abs(e.profit) / top) * 50}%` }} />
              <small>{`Q${e.quarter.quarter}`}</small>
            </div>
          ))}
        </div>
      )}
      {alerts.length > 0 && (
        <div className="of-alerts">
          {alerts.map((a) => (
            <button
              key={`${a.kind}-${a.text}`}
              type="button"
              className={a.warn ? "warn" : undefined}
              onClick={() => (a.model ? onAt({ ...at, model: a.model }) : a.to && go(a.to))}
            >
              <span>{a.kind}</span>
              <b>{a.text}</b>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** The product wall at a glance: the picked laptop as it stands, and the rest along the wall. */
function Products({ company, campaign, at }: Ctx) {
  const models = useMemo(() => wallOrder(company), [company]);
  const current = pickedModel(company, at);
  const currentId = current?.id;
  useEffect(() => {
    if (currentId) document.querySelector(".of-panel .of-rows .selected")?.scrollIntoView({ block: "nearest" });
  }, [currentId]);
  const score = (m: SavedModel) =>
    campaign ? (campaign.reviews[m.id]?.score ?? null) : m.reviewed ? overallOf(m, company.name) : null;
  const price = (m: SavedModel) => campaign?.releases[m.id]?.price ?? (m.build as { price?: number }).price ?? 0;
  return (
    <Frame title={labelOf("products")}>
      {current && (
        <div className="cr-model-head">
          <b>{current.name}</b>
          {price(current) > 0 && <b>{usd(price(current))}</b>}
        </div>
      )}
      <div className="of-rows">
        {models.map((m) => {
          const block = buildBlock(m.build);
          const s = campaign && !block ? statusOf(campaign, m.id) : null;
          const sc = score(m);
          return (
            <div key={m.id} className={`fd-row${m.id === currentId ? " selected" : ""}`}>
              <span>
                <b>{m.name}</b>
                <small>
                  {yearOf(m)}
                  {block && <em>{block}</em>}
                  {s && <em className={s.warn ? undefined : "muted"}>{s.text}</em>}
                </small>
              </span>
              {sc != null && <span className="fd-score">{campaign ? sc.toFixed(1) : Math.round(sc)}</span>}
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function Detail({
  model,
  models,
  campaign,
  score,
  actions,
}: {
  model: SavedModel;
  models: SavedModel[];
  campaign: CampaignState | null;
  score: number | null;
  actions: OfficeActions;
}) {
  const [doomed, setDoomed] = useState(false);
  const block = buildBlock(model.build);
  const over = !!campaign?.over;
  // A commercial's wheel result, waiting on the next quarter's sales.
  const boost = campaign?.boosts[model.id];
  return (
    <>
      {!campaign && (
        <div className="cr-model-head">
          <b>{model.name}</b>
          {score != null && <b>{Math.round(score)}</b>}
        </div>
      )}
      {boost !== undefined && (
        <div className={`of-boost${boost < 1 ? " down" : ""}`}>
          {pctLabel(boost)}
        </div>
      )}
      <div className="of-actions">
        <button type="button" className="fd-primary" disabled={!!block} onClick={() => actions.onUse(model.id)}>
          Use
        </button>
        <button
          type="button"
          className="fd-secondary"
          disabled={!model.reviewed && !!block}
          onClick={() => actions.onReview(model.id)}
        >
          {model.reviewed ? "Read review" : "Get reviewed"}
        </button>
        <button type="button" className="fd-secondary" onClick={() => actions.onOpen(model.id)}>
          Open
        </button>
        {!over && (
          <button type="button" className="fd-secondary" onClick={() => actions.onDuplicate(model.id)}>
            Duplicate
          </button>
        )}
        <button
          type="button"
          className="fd-secondary muted"
          onClick={() => setDoomed(true)}
        >
          Delete
        </button>
      </div>
      {doomed && (
        <ConfirmDelete
          name={model.name}
          onConfirm={() => {
            setDoomed(false);
            actions.onDelete(model.id);
          }}
          onCancel={() => setDoomed(false)}
        />
      )}
      {block && <div className="cr-short">{block}</div>}
      {campaign && (
        <div className="of-model-tab">
          <ModelTab
            key={model.id}
            campaign={campaign}
            model={model}
            models={models}
            units={actions.units(model.id)}
            onUnits={(u) => actions.onUnits(model.id, u)}
            onPrice={(p) => actions.onPrice(model.id, p)}
            onDraftPrice={model.reviewed ? undefined : (p) => actions.onDraftPrice(model.id, p)}
            onRelease={(u, cost, re) => actions.onRelease(model.id, u, cost, re)}
            onReorder={(u, cost) => actions.onReorder(model.id, u, cost)}
            onMarket={worldQuarters(campaign).length > 0 ? (t) => actions.onMarket(t, model.id) : undefined}
          />
        </div>
      )}
    </>
  );
}

function Market({ company, campaign }: Ctx & { campaign: CampaignState }) {
  const [tab, setTab] = useState<MarketTab>("quarter");
  return <MarketScreen campaign={campaign} models={company.models} company={company.name} tab={tab} onTab={setTab} />;
}

function Videos({ card, playing, onWatch }: { card: TvCard; playing: boolean; onWatch: (file: string) => void }) {
  return (
    <div className="of-videos">
      {card.videos.map((v) => {
        const on = playing && card.playing === v.file;
        return (
          <button key={v.file} type="button" className={`of-short${on ? " on" : ""}`} onClick={() => onWatch(v.file)}>
            {v.poster && (
              <i>
                <img src={v.poster} alt="" />
              </i>
            )}
            <span>
              <small>{v.label}</small>
              <b>{v.name}</b>
            </span>
            <em>{on ? "Replay" : "Watch"}</em>
          </button>
        );
      })}
      {playing && card.url && (
        <button type="button" className="fd-text" onClick={card.onFull}>
          Full screen
        </button>
      )}
    </div>
  );
}

function Trophies({ company, campaign, actions }: Ctx) {
  const reviewed = company.models
    .map((m) => ({
      m,
      score: campaign ? (campaign.reviews[m.id]?.score ?? null) : m.reviewed ? overallOf(m, company.name) : null,
    }))
    .filter((x): x is { m: SavedModel; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score);
  return (
    <>
      {campaign && <AwardsTab campaign={campaign} models={company.models} />}
      {reviewed.length > 0 && (
        <>
          <span className="cr-label">Reviews</span>
          <div className="of-reviews">
            {reviewed.map(({ m, score }) => (
              <button key={m.id} type="button" onClick={() => actions.onReview(m.id)}>
                <span>{m.name}</span>
                <b>{campaign ? score.toFixed(1) : Math.round(score)}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
