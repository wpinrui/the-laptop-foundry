import { useMemo, useState } from "react";
import type { SavedModel } from "../../../preload/store";
import { buildBlock } from "../builder/problems";
import type { Build } from "../engine";
import {
  buildCost,
  type CampaignState,
  DEFAULT_RUN,
  isRefresh,
  publicationQuarter,
  quarterLabel,
  releaseQuote,
  reorderQuote,
  stepRun,
} from "../engine/campaign";
import "./campaign.css";

export const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

// The selected model's release in a campaign: before release a run size, its
// costs and Release; after, its stock and a reorder.

export function ReleasePanel({
  campaign,
  model,
  models,
  onRelease,
  onReorder,
}: {
  campaign: CampaignState;
  model: SavedModel;
  models: SavedModel[];
  onRelease: (units: number, cost: number, refresh: boolean) => void;
  onReorder: (units: number, cost: number) => void;
}) {
  const [units, setUnits] = useState(DEFAULT_RUN);
  const build = model.build as Build;
  const released = campaign.releases[model.id];
  const block = useMemo(() => buildBlock(build), [build]);
  const cost = useMemo(() => {
    if (block) return null;
    try {
      return buildCost(build);
    } catch {
      return null;
    }
  }, [build, block]);
  const refresh = useMemo(
    () =>
      !released &&
      isRefresh(
        build,
        models
          .filter((m) => m.id !== model.id && campaign.releases[m.id])
          .map((m) => m.build as Build),
      ),
    [build, models, model.id, campaign.releases, released],
  );
  if (campaign.over || cost === null) return null;

  const q = released
    ? reorderQuote(cost, units)
    : releaseQuote(cost, units, refresh);
  const short = q.total > campaign.cash;
  const priced = !!build.price && build.price > 0;
  const can = !short && (released || priced);

  return (
    <section className="fd-release fd-in">
      {released && (
        <div className="fd-release-stock">
          <small>Stock</small>
          <b>{released.stock.toLocaleString("en-US")}</b>
        </div>
      )}
      {released && (
        <div className="fd-release-stock">
          <small>Review</small>
          <b>
            {campaign.reviews[model.id]
              ? campaign.reviews[model.id].score.toFixed(1)
              : quarterLabel(publicationQuarter(released.quarter))}
          </b>
        </div>
      )}
      <div className="fd-release-run">
        <button
          type="button"
          className="fd-text"
          onClick={() => setUnits((u) => stepRun(u, -1))}
        >
          -
        </button>
        <b>{units.toLocaleString("en-US")}</b>
        <button
          type="button"
          className="fd-text"
          onClick={() => setUnits((u) => stepRun(u, 1))}
        >
          +
        </button>
      </div>
      <dl>
        <dt>Unit</dt>
        <dd>{usd(q.unit)}</dd>
        {!released && (
          <>
            <dt>Setup</dt>
            <dd>{usd(q.setup)}</dd>
          </>
        )}
        <dt>Total</dt>
        <dd className={short ? "short" : undefined}>{usd(q.total)}</dd>
      </dl>
      <button
        type="button"
        className="fd-primary"
        disabled={!can}
        onClick={() =>
          released ? onReorder(units, cost) : onRelease(units, cost, refresh)
        }
      >
        {released ? "Order" : "Release"}
      </button>
    </section>
  );
}
