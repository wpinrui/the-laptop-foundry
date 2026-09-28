import { useMemo, useState } from "react";
import type { SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import type { Build } from "../engine";
import {
  buildCostLines,
  type CampaignState,
  clampRun,
  economics,
  isRefresh,
  marketingCost,
  outlook,
  MIN_RUN,
  publicationQuarter,
  quarterLabel,
  scaleFactor,
  stepPrice,
  stepRun,
} from "../engine/campaign";
import type { CostLine } from "../engine/price";
import "./campaign.css";

export const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

export const count = (n: number) => Math.round(n).toLocaleString("en-US");

/** Money in a few characters: $1.24M, $450k, $900. */
export function usdShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

/** A model's run as the campaign sees it: its cost lines, whether it is a refresh, its release. */
export function useRun(campaign: CampaignState, model: SavedModel, models: SavedModel[]) {
  const build = model.build as Build;
  const released = campaign.releases[model.id];
  const block = useMemo(() => buildBlock(build), [build]);
  const lines = useMemo(() => {
    if (block) return null;
    try {
      return buildCostLines(build);
    } catch {
      return null;
    }
  }, [build, block]);
  const refresh = useMemo(
    () =>
      !released &&
      isRefresh(
        build,
        models.filter((m) => m.id !== model.id && campaign.releases[m.id]).map((m) => m.build as Build),
      ),
    [build, models, model.id, campaign.releases, released],
  );
  const cost = lines ? lines.reduce((s, l) => s + l.usd, 0) : null;
  const price = released ? released.price : build.price && build.price > 0 ? build.price : 0;
  return { build, released, lines, cost, refresh, price };
}

/** The model's sold and demanded units in the latest quarter, or null when it did not sell then. */
export function lastSales(campaign: CampaignState, id: string): { sold: number; demand: number } | null {
  const last = campaign.sales[campaign.sales.length - 1];
  if (!last || last.units[id] === undefined) return null;
  return { sold: last.units[id], demand: last.demand[id] ?? last.units[id] };
}

/** A model's status beside its year: Draft, Sold out, or its stock. */
export function statusOf(campaign: CampaignState, id: string): { text: string; warn: boolean } {
  const r = campaign.releases[id];
  if (!r) return { text: "Draft", warn: false };
  if (r.stock <= 0) return { text: "Sold out", warn: true };
  return { text: `${count(r.stock)} in stock`, warn: false };
}

export const PART_NAMES: Record<CostLine["what"], string> = {
  processor: "Processor",
  graphics: "Graphics",
  memory: "Memory",
  storage: "Storage",
  display: "Screen",
  battery: "Battery",
  hotswap: "Swap battery",
  cooling: "Cooling",
  optical: "Optical drive",
  wireless: "Wireless",
  keyboard: "Keyboard",
  trackpad: "Trackpad",
  webcam: "Webcam",
  speakers: "Speakers",
  port: "Ports",
  board: "Board",
  body: "Body",
  spend: "Engineering",
  assembly: "Assembly",
};

/** The small fixed run offered to a draft. */
const SMALL_RUN = 2_000;

/** The largest run the cash pays for, or 0 when not even the smallest does. */
function maxAffordable(cost: number, cash: number, setup: number): number {
  // The run's total cost rises with its size, so search the 100-unit steps.
  const fits = (u: number) => setup + cost * scaleFactor(u) * u <= cash;
  if (!fits(MIN_RUN)) return 0;
  let lo = MIN_RUN / 100;
  let hi = lo;
  while (fits(hi * 200)) hi *= 2;
  hi *= 2;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid * 100)) lo = mid;
    else hi = mid - 1;
  }
  return lo * 100;
}

const warn = (bad: boolean) => (bad ? "short" : undefined);

/** A value between - and + that can also be typed. */
function Stepper({
  value,
  show,
  label,
  onStep,
  onSet,
  className,
}: {
  value: number;
  show: (n: number) => string;
  label: string;
  onStep: (dir: 1 | -1) => void;
  onSet: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={`cr-stepper${className ? ` ${className}` : ""}`}>
      <button type="button" onClick={() => onStep(-1)} aria-label={`${label} down`}>
        -
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={draft ?? show(value)}
        onFocus={(ev) => {
          setDraft(String(value));
          ev.currentTarget.select();
        }}
        onChange={(ev) => setDraft(ev.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => {
          if (draft) onSet(Number(draft));
          setDraft(null);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") ev.currentTarget.blur();
        }}
      />
      <button type="button" onClick={() => onStep(1)} aria-label={`${label} up`}>
        +
      </button>
    </div>
  );
}

type Open = "unit" | "setup" | "overhead";

// The Model tab: the selected model's stock and last sales, its review, its
// price once released, a run size, then every cost of the run and the
// quarter per unit and in all, the quarter's projected profit, and Release
// or Order.

export function ModelTab({
  campaign,
  model,
  models,
  units,
  onUnits,
  onPrice,
  onRelease,
  onReorder,
  onMarket,
  onDraftPrice,
}: {
  campaign: CampaignState;
  model: SavedModel;
  models: SavedModel[];
  units: number;
  onUnits: (units: number) => void;
  onPrice: (price: number) => void;
  /** Sets the price of a model not yet released; without it the price is set in the builder. */
  onDraftPrice?: (price: number) => void;
  onRelease: (units: number, cost: number, refresh: boolean) => void;
  onReorder: (units: number, cost: number) => void;
  /** Opens the Market screen on the model's rivals or buyers. */
  onMarket?: (tab: "rivals" | "buyers") => void;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const { released, lines, cost, refresh, price } = useRun(campaign, model, models);
  const head = (
    <>
      {onMarket && (
        <div className="cr-links">
          <button type="button" className="fd-text" onClick={() => onMarket("rivals")}>
            Rivals
          </button>
          <button type="button" className="fd-text" onClick={() => onMarket("buyers")}>
            Buyers
          </button>
        </div>
      )}
      <div className="cr-model-head">
        <b>{model.name}</b>
        {price > 0 && <b>{usd(price)}</b>}
      </div>
    </>
  );
  if (lines === null || cost === null) return head;

  const e = economics(cost, price, units, refresh, !!released);
  const scale = Math.round((scaleFactor(units) - 1) * 100);
  const setup = e.design + e.tooling;
  const priced = price > 0;
  const short = e.total > campaign.cash;
  const sales = released ? lastSales(campaign, model.id) : null;
  const o = outlook(
    e,
    units,
    released ?? null,
    marketingCost(campaign.brand, campaign.now.year),
    sales ? sales.demand : null,
  );
  const lastQ = campaign.sales[campaign.sales.length - 1]?.quarter;
  const review = campaign.reviews[model.id];
  const max = maxAffordable(cost, campaign.cash, setup);
  const presets: [string, number][] = released
    ? [["Demand", sales ? clampRun(Math.ceil(sales.demand / 100) * 100) : units]]
    : [[count(SMALL_RUN), SMALL_RUN]];
  if (max > 0) presets.push(["Max affordable", max]);
  const toggle = (k: Open) => setOpen((x) => (x === k ? null : k));
  const more = (k: Open, label: string) => (
    <dt>
      <button type="button" aria-expanded={open === k} onClick={() => toggle(k)}>
        {label} <i>{open === k ? "-" : "+"}</i>
      </button>
    </dt>
  );
  const overhead = o.overheadBase + o.overheadModel;

  return (
    <>
      {head}
      {released && (
        <div className="cr-cells">
          <div>
            <span>Stock</span>
            <b className={warn(released.stock <= 0)}>{count(released.stock)}</b>
          </div>
          <div>
            <span>Sold {lastQ ? `Q${lastQ.quarter}` : ""}</span>
            <b>{sales ? count(sales.sold) : "0"}</b>
          </div>
          <div>
            <span>Wanted {lastQ ? `Q${lastQ.quarter}` : ""}</span>
            <b className={warn(!!sales && sales.demand > sales.sold)}>{sales ? count(sales.demand) : "0"}</b>
          </div>
        </div>
      )}
      <div className="cr-line">
        <span>Review</span>
        <b>
          {review
            ? review.score.toFixed(1)
            : quarterLabel(publicationQuarter(released ? released.quarter : campaign.now))}
        </b>
      </div>
      {(released || onDraftPrice) && !campaign.over && (
        <div className="cr-line cr-price">
          <span>Price</span>
          <Stepper
            className="small"
            label="Price"
            value={price}
            show={usd}
            onStep={(d) => (released ? onPrice : (onDraftPrice ?? onPrice))(stepPrice(price, d))}
            onSet={released ? onPrice : (onDraftPrice ?? onPrice)}
          />
        </div>
      )}
      {!campaign.over && (
        <>
          <div className="cr-rule" />
          <Stepper
            label="Units"
            value={units}
            show={count}
            onStep={(d) => onUnits(stepRun(units, d))}
            onSet={(n) => onUnits(clampRun(n))}
          />
          <div className="cr-presets">
            {presets.map(([label, u]) => (
              <button key={label} type="button" onClick={() => onUnits(u)}>
                {label}
              </button>
            ))}
          </div>
          <dl className="cr-costs">
            {more("unit", "Unit")}
            <dd>
              {scale !== 0 && <small className={scale > 0 ? "short" : "up"}>{`${scale > 0 ? "+" : ""}${scale}%`}</small>}
              {usd(e.unit)}
            </dd>
            {open === "unit" && (
              <>
                {lines.map((l) => (
                  <Sub key={l.what} label={PART_NAMES[l.what]} value={usd(l.usd)} />
                ))}
                <Sub label={`Run size ${count(units)}`} value={`${e.unit >= cost ? "+" : ""}${usd(e.unit - cost)}`} />
              </>
            )}
            {priced && (
              <>
                <dt>Retailers, unit</dt>
                <dd>{usd(-e.retail)}</dd>
                <dt>Margin, unit</dt>
                <dd className={warn(e.margin <= 0)}>{usd(e.margin)}</dd>
              </>
            )}
            <dt className="head">Run</dt>
            <dd className="head" />
            <dt>Production</dt>
            <dd>{usd(units * e.unit)}</dd>
            {setup > 0 && (
              <>
                {more("setup", refresh ? "Setup, refresh" : "Setup")}
                <dd>{usd(setup)}</dd>
                {open === "setup" && (
                  <>
                    <Sub label="Design and certification" value={usd(e.design)} />
                    <Sub label="Tooling" value={usd(e.tooling)} />
                  </>
                )}
              </>
            )}
            <dt className="total">Total</dt>
            <dd className={`total${short ? " short" : ""}`}>{usd(e.total)}</dd>
            <dt className="head">Quarter</dt>
            <dd className="head" />
            {more("overhead", "Overhead")}
            <dd>{usd(-overhead)}</dd>
            {open === "overhead" && (
              <>
                <Sub label="Company" value={usd(-o.overheadBase)} />
                <Sub label="This model" value={usd(-o.overheadModel)} />
              </>
            )}
            <dt>Marketing</dt>
            <dd>{usd(-o.marketing)}</dd>
            {o.atDemand && (
              <>
                <dt>Holding, at demand</dt>
                <dd>{usd(-o.atDemand.holding)}</dd>
              </>
            )}
            {priced && (
              <>
                <dt className="total">Profit, sold out</dt>
                <dd className={`total${o.profitSoldOut < 0 ? " short" : ""}`}>{usdShort(o.profitSoldOut)}</dd>
                {o.atDemand && (
                  <>
                    <dt>{`Profit, ${count(o.atDemand.sold)} sold`}</dt>
                    <dd className={warn(o.atDemand.profit < 0)}>{usdShort(o.atDemand.profit)}</dd>
                  </>
                )}
                <dt>Break-even</dt>
                <dd className={warn(o.breakEven === null || o.breakEven > o.available)}>
                  {o.breakEven === null ? "Never" : count(o.breakEven)}
                </dd>
              </>
            )}
          </dl>
          {short ? (
            <div className="cr-short">Short {usdShort(e.total - campaign.cash)}</div>
          ) : (
            <button
              type="button"
              className="fd-primary cr-action"
              disabled={!released && !priced}
              onClick={() => (released ? onReorder(units, cost) : onRelease(units, cost, refresh))}
            >
              {released ? "Order" : "Release"}
            </button>
          )}
        </>
      )}
    </>
  );
}

function Sub({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="sub">{label}</dt>
      <dd className="sub">{value}</dd>
    </>
  );
}
