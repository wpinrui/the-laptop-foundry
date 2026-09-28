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
  MAX_RUN,
  MIN_RUN,
  publicationQuarter,
  quarterLabel,
  scaleFactor,
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
  let best = 0;
  for (let u = MIN_RUN; u <= MAX_RUN; u += 100) {
    if (setup + cost * scaleFactor(u) * u <= cash) best = u;
    else break;
  }
  return best;
}

const warn = (bad: boolean) => (bad ? "short" : undefined);

// The Model tab: the selected model's stock and last sales, its review, a run
// size, the run's costs broken down and what it makes, and Release or Order.

export function ModelTab({
  campaign,
  model,
  models,
  units,
  onUnits,
  onRelease,
  onReorder,
}: {
  campaign: CampaignState;
  model: SavedModel;
  models: SavedModel[];
  units: number;
  onUnits: (units: number) => void;
  onRelease: (units: number, cost: number, refresh: boolean) => void;
  onReorder: (units: number, cost: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState<"unit" | "setup" | null>(null);
  const { released, lines, cost, refresh, price } = useRun(campaign, model, models);
  const head = (
    <div className="cr-model-head">
      <b>{model.name}</b>
      {price > 0 && <b>{usd(price)}</b>}
    </div>
  );
  if (lines === null || cost === null) return head;

  const e = economics(cost, price, units, refresh, !!released);
  const scale = Math.round((scaleFactor(units) - 1) * 100);
  const setup = e.design + e.tooling;
  const priced = price > 0;
  const short = e.total > campaign.cash;
  const sales = released ? lastSales(campaign, model.id) : null;
  const lastQ = campaign.sales[campaign.sales.length - 1]?.quarter;
  const review = campaign.reviews[model.id];
  const max = maxAffordable(cost, campaign.cash, setup);
  const presets: [string, number][] = released
    ? [["Demand", sales ? clampRun(Math.ceil(sales.demand / 100) * 100) : units]]
    : [[count(SMALL_RUN), SMALL_RUN]];
  if (max > 0) presets.push(["Max affordable", max]);
  const toggle = (k: "unit" | "setup") => setOpen((o) => (o === k ? null : k));

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
      {!campaign.over && (
        <>
          <div className="cr-rule" />
          <div className="cr-stepper">
            <button type="button" onClick={() => onUnits(stepRun(units, -1))} aria-label="Fewer">
              -
            </button>
            <input
              inputMode="numeric"
              aria-label="Units"
              value={draft ?? count(units)}
              onFocus={(ev) => {
                setDraft(String(units));
                ev.currentTarget.select();
              }}
              onChange={(ev) => setDraft(ev.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => {
                if (draft) onUnits(clampRun(Number(draft)));
                setDraft(null);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") ev.currentTarget.blur();
              }}
            />
            <button type="button" onClick={() => onUnits(stepRun(units, 1))} aria-label="More">
              +
            </button>
          </div>
          <div className="cr-presets">
            {presets.map(([label, u]) => (
              <button key={label} type="button" onClick={() => onUnits(u)}>
                {label}
              </button>
            ))}
          </div>
          <dl className="cr-costs">
            <dt>
              <button type="button" aria-expanded={open === "unit"} onClick={() => toggle("unit")}>
                Unit <i>{open === "unit" ? "-" : "+"}</i>
              </button>
            </dt>
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
            {setup > 0 && (
              <>
                <dt>
                  <button type="button" aria-expanded={open === "setup"} onClick={() => toggle("setup")}>
                    {refresh ? "Setup, refresh" : "Setup"} <i>{open === "setup" ? "-" : "+"}</i>
                  </button>
                </dt>
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
            {priced && (
              <>
                <dt className="gap">Retailers, unit</dt>
                <dd className="gap">{usd(-e.retail)}</dd>
                <dt>Margin, unit</dt>
                <dd className={warn(e.margin <= 0)}>{usd(e.margin)}</dd>
                {!released && (
                  <>
                    <dt>Break-even</dt>
                    <dd className={warn(e.breakEven === null || e.breakEven > units)}>
                      {e.breakEven === null ? "Never" : count(e.breakEven)}
                    </dd>
                  </>
                )}
                <dt>Profit, sold out</dt>
                <dd className={warn(e.profit < 0)}>{usd(e.profit)}</dd>
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
