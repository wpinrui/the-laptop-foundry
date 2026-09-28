import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import { type CampaignState, publicationQuarter, quarterLabel, worldQuarters } from "../engine/campaign";
import type { SegmentId } from "../engine/market/types";
import { AwardsTab } from "../foundry/Awards";
import { BooksTab, type StatementTab } from "../foundry/Finance";
import { overallOf, yearOf } from "../foundry/LaptopList";
import { BrandTab } from "../foundry/Marketing";
import { ModelTab, statusOf, usd, usdShort } from "../foundry/Release";
import { type MarketTab, MarketScreen } from "../world/MarketScreen";
import { labelOf, type OfficeAt, type StationId } from "./stations";

// Each station's panel: the data views the campaign already has, laid out
// in the calm third of the station's view.

export interface ShortCard {
  quarter: string;
  name: string;
  state: "idle" | "busy" | "ready";
  poster?: string;
  onClick: () => void;
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
  onRelease: (id: string, units: number, cost: number, refresh: boolean) => void;
  onReorder: (id: string, units: number, cost: number) => void;
  onTier: (segment: SegmentId, tier: number) => void;
  onStatement: (tab: StatementTab) => void;
  /** Opens the full Market screen on a model's rivals or buyers. */
  onMarket: (tab: "rivals" | "buyers", model: string) => void;
  short?: ShortCard;
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

function Frame({
  title,
  onClose,
  onBack,
  foot,
  children,
}: {
  title: string;
  onClose: () => void;
  /** A level up within the panel: the title becomes its way back. */
  onBack?: () => void;
  /** Kept in view under the scrolling content. */
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="of-panel-head">
        {onBack ? (
          <button type="button" className="of-up" onClick={onBack}>
            <i>‹</i>
            <h2>{title}</h2>
          </button>
        ) : (
          <h2>{title}</h2>
        )}
        <button type="button" className="fd-text" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="cr-body">{children}</div>
      {foot && <footer className="of-panel-foot">{foot}</footer>}
    </>
  );
}

interface Ctx {
  company: SavedCompany;
  campaign: CampaignState | null;
  at: OfficeAt;
  onAt: (at: OfficeAt) => void;
  go: (id: StationId, open?: boolean) => void;
  close: () => void;
  onEndQuarter: () => void;
  resolving: { step: number; of: number; name: string } | null;
  actions: OfficeActions;
}

export function buildPanels(c: Ctx): Partial<Record<StationId, ReactNode>> {
  const { campaign, close } = c;
  const out: Partial<Record<StationId, ReactNode>> = {
    desk: (
      <Frame title={labelOf("desk")} onClose={close} foot={<EndQuarter {...c} />}>
        <Desk {...c} />
      </Frame>
    ),
    products: <Products {...c} />,
  };
  if (campaign) {
    out.finance = (
      <Frame title={labelOf("finance")} onClose={close}>
        <BooksTab campaign={campaign} onOpen={c.actions.onStatement} />
      </Frame>
    );
    out.marketing = (
      <Frame title={labelOf("marketing")} onClose={close}>
        <BrandTab campaign={campaign} onTier={c.actions.onTier} />
      </Frame>
    );
    if (worldQuarters(campaign).length > 0) out.market = <Market {...c} campaign={campaign} />;
  }
  if (c.actions.short)
    out.tv = (
      <Frame title={labelOf("tv")} onClose={close}>
        <Short card={c.actions.short} />
      </Frame>
    );
  const reviewed = c.company.models.some((m) => (campaign ? campaign.reviews[m.id] : m.reviewed));
  if (campaign || reviewed)
    out.trophies = (
      <Frame title={labelOf("trophies")} onClose={close}>
        <Trophies {...c} />
      </Frame>
    );
  return out;
}

function Desk({ company, campaign, actions, go, at, onAt }: Ctx) {
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
  const alerts: { kind: string; text: string; to: StationId; model?: string; warn?: boolean }[] = [];
  const soldOut: SavedModel[] = [];
  const due: SavedModel[] = [];
  for (const m of company.models) {
    const r = campaign.releases[m.id];
    if (!r) continue;
    if (r.stock <= 0) soldOut.push(m);
    const pub = publicationQuarter(r.quarter);
    if (!campaign.reviews[m.id] && pub.year === campaign.now.year && pub.quarter === campaign.now.quarter) due.push(m);
  }
  // One line each: a single laptop opens its Model panel, several open the wall's list.
  const line = (kind: string, ms: SavedModel[], warn = false) => {
    if (ms.length === 1) alerts.push({ kind, text: ms[0].name, to: "products", model: ms[0].id, warn });
    else if (ms.length > 1) alerts.push({ kind, text: ms.map((m) => m.name).join(", "), to: "products", warn });
  };
  line("Sold out", soldOut, true);
  line("Review", due);
  if (actions.newAwards > 0)
    alerts.push({ kind: "Awards", text: String(actions.newAwards), to: "trophies" });
  if (actions.short?.state === "ready") alerts.push({ kind: "Short", text: actions.short.name, to: "tv" });
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
        <>
          <span className="cr-label">Profit</span>
          <div className="of-trend">
            {ledger.map((e) => (
              <div key={`${e.quarter.year}-${e.quarter.quarter}`} title={`${quarterLabel(e.quarter)} ${usdShort(e.profit)}`}>
                <i
                  className={e.profit < 0 ? "down" : "up"}
                  style={{ height: `${(Math.abs(e.profit) / top) * 50}%` }}
                />
                <small>{`Q${e.quarter.quarter}`}</small>
              </div>
            ))}
          </div>
        </>
      )}
      {alerts.length > 0 && (
        <div className="of-alerts">
          {alerts.map((a) => (
            <button
              key={`${a.kind}-${a.text}`}
              type="button"
              className={a.warn ? "warn" : undefined}
              onClick={() =>
                a.model
                  ? onAt({ ...at, station: "products", panel: true, model: a.model, detail: true, arrive: false })
                  : go(a.to, true)
              }
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

function EndQuarter({ campaign, resolving, onEndQuarter }: Ctx) {
  if (!campaign || campaign.over) return null;
  return resolving ? (
    <div className="of-resolving big">
      <i style={{ width: `${((resolving.step + 1) / resolving.of) * 100}%` }} />
      {resolving.name}
    </div>
  ) : (
    <button type="button" className="fd-primary" onClick={onEndQuarter}>
      End {quarterLabel(campaign.now)}
    </button>
  );
}

function Products({ company, campaign, at, onAt, close, actions }: Ctx) {
  const models = useMemo(() => wallOrder(company), [company]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scored when the models change
  const scores = useMemo(
    () => new Map(models.map((m) => [m.id, m.reviewed ? overallOf(m, company.name) : null])),
    [company.models, company.name],
  );
  const current = models.find((m) => m.id === at.model) ?? null;
  // The picked laptop stays in view as the arrow keys move along the wall.
  useEffect(() => {
    if (at.model) document.querySelector(".of-rows .selected")?.scrollIntoView({ block: "nearest" });
  }, [at.model]);
  const over = !!campaign?.over;
  if (at.detail && current)
    return (
      <Frame title={labelOf("products")} onClose={close} onBack={() => onAt({ ...at, detail: false })}>
        <Detail
          model={current}
          models={company.models}
          campaign={campaign}
          score={scores.get(current.id) ?? null}
          actions={actions}
        />
      </Frame>
    );
  return (
    <Frame title={labelOf("products")} onClose={close}>
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
              className={`fd-row${m.id === at.model ? " selected" : ""}`}
              onClick={() => onAt({ ...at, model: m.id, detail: true })}
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
  const [armed, setArmed] = useState(false);
  const block = buildBlock(model.build);
  const over = !!campaign?.over;
  return (
    <>
      {!campaign && (
        <div className="cr-model-head">
          <b>{model.name}</b>
          {score != null && <b>{Math.round(score)}</b>}
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
          onBlur={() => setArmed(false)}
          onClick={() => {
            if (armed) {
              setArmed(false);
              actions.onDelete(model.id);
            } else setArmed(true);
          }}
        >
          {armed ? "Confirm" : "Delete"}
        </button>
      </div>
      {block && <div className="cr-short">{block}</div>}
      {campaign && (
        <ModelTab
          key={model.id}
          campaign={campaign}
          model={model}
          models={models}
          units={actions.units(model.id)}
          onUnits={(u) => actions.onUnits(model.id, u)}
          onPrice={(p) => actions.onPrice(model.id, p)}
          onRelease={(u, cost, re) => actions.onRelease(model.id, u, cost, re)}
          onReorder={(u, cost) => actions.onReorder(model.id, u, cost)}
          onMarket={worldQuarters(campaign).length > 0 ? (t) => actions.onMarket(t, model.id) : undefined}
        />
      )}
    </>
  );
}

function Market({ company, campaign, close }: Ctx & { campaign: CampaignState }) {
  const [tab, setTab] = useState<MarketTab>("quarter");
  return (
    <MarketScreen
      campaign={campaign}
      models={company.models}
      company={company.name}
      tab={tab}
      onTab={setTab}
      onClose={close}
    />
  );
}

function Short({ card }: { card: ShortCard }) {
  return (
    <button type="button" className="of-short" onClick={card.onClick} disabled={card.state === "busy"}>
      {card.poster && (
        <i>
          <img src={card.poster} alt="" />
        </i>
      )}
      <span>
        <small>{card.quarter}</small>
        <b>{card.name}</b>
      </span>
      {card.state === "busy" ? <u aria-busy /> : <em>{card.state === "ready" ? "Watch" : "Make"}</em>}
    </button>
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
