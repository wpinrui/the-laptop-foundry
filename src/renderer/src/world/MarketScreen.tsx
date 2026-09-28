import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedModel } from "../../../preload/store";
import { type CampaignState, type Quarter, worldQuarters } from "../engine/campaign";
import { useWorldMarket } from "./data";
import { QuarterTab } from "./QuarterTab";
import { RivalsTab } from "./RivalsTab";
import { BuyersTab } from "./BuyersTab";
import { MarketStore } from "./MarketStore";
import "./world.css";

// The Market screen, full screen over the campaign: what happened in any
// played quarter, a model's closest rivals and its buyers, with one quarter
// picker driving every tab. Each panel takes a selector's values and lays
// them out; nothing here computes the market.

export type MarketTab = "quarter" | "rivals" | "buyers" | "store";

const TABS: [MarketTab, string][] = [
  ["quarter", "Quarter"],
  ["rivals", "Rivals"],
  ["buyers", "Buyers"],
  ["store", "Store"],
];

const same = (a: Quarter, b: Quarter) => a.year === b.year && a.quarter === b.quarter;
/** The models the Rivals tab can pick: released first, newest first. */
function pickable(campaign: CampaignState, models: SavedModel[]): SavedModel[] {
  const rel = (m: SavedModel) => campaign.releases[m.id];
  return [...models].sort((a, b) => Number(!!rel(b)) - Number(!!rel(a)) || b.created - a.created);
}

/** The year between steppers that walk the played quarters, then the year's four quarters. */
function QuarterPick({ quarters, quarter, onPick }: { quarters: Quarter[]; quarter: Quarter; onPick: (q: Quarter) => void }) {
  // Played quarters, oldest first.
  const played = [...quarters].reverse();
  const at = played.findIndex((q) => same(q, quarter));
  const prev = at > 0 ? played[at - 1] : null;
  const next = at >= 0 && at < played.length - 1 ? played[at + 1] : null;
  return (
    <div className="ms-pick">
      <button type="button" className="ms-step" disabled={!prev} aria-label="Previous quarter" onClick={() => prev && onPick(prev)}>
        ‹
      </button>
      <b>{quarter.year}</b>
      <button type="button" className="ms-step" disabled={!next} aria-label="Next quarter" onClick={() => next && onPick(next)}>
        ›
      </button>
      <span className="ms-cells">
        {([1, 2, 3, 4] as const).map((n) => {
          const q = played.find((p) => p.year === quarter.year && p.quarter === n);
          return (
            <button
              key={n}
              type="button"
              className={n === quarter.quarter ? "on" : undefined}
              aria-pressed={n === quarter.quarter}
              disabled={!q}
              onClick={() => q && onPick(q)}
            >
              {`Q${n}`}
            </button>
          );
        })}
      </span>
    </div>
  );
}

/** The player's models as chips, the picked one lit. */
export function ModelChips({ models, model, onPick }: { models: SavedModel[]; model: string; onPick: (id: string) => void }) {
  if (models.length === 0) return null;
  return (
    <div className="ms-chips">
      {models.map((m) => (
        <button key={m.id} type="button" className={m.id === model ? "on" : undefined} aria-pressed={m.id === model} onClick={() => onPick(m.id)}>
          {m.name}
        </button>
      ))}
    </div>
  );
}

export function MarketScreen({
  campaign,
  models,
  company,
  tab,
  onTab,
  quarter: startQuarter,
  model: startModel,
  proceed,
  onClose,
}: {
  campaign: CampaignState;
  models: SavedModel[];
  company: string;
  tab: MarketTab;
  onTab: (tab: MarketTab) => void;
  /** The quarter it opens on; the last played one by default. */
  quarter?: Quarter;
  model?: string | null;
  /** Opened by End quarter: Continue in place of Close. */
  proceed?: boolean;
  /** Absent in an office panel: the screen stays open, with no Close and no Escape. */
  onClose?: () => void;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Escape closes the screen before it reaches the laptop list; Enter continues after End quarter.
    const k = (e: KeyboardEvent) => {
      const shut = close.current;
      if (!shut || (e.key !== "Escape" && !(proceed && e.key === "Enter"))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      shut();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [proceed]);
  const market = useWorldMarket(models);
  const quarters = useMemo(() => worldQuarters(campaign), [campaign]);
  const [picked, setPicked] = useState<Quarter | null>(startQuarter ?? null);
  const quarter = (picked && quarters.find((q) => same(q, picked))) || quarters[0];
  const choices = pickable(campaign, models);
  const [chosen, setModel] = useState(startModel ?? "");
  const model = choices.some((m) => m.id === chosen) ? chosen : (choices[0]?.id ?? "");
  if (tab === "store")
    return (
      <section className="ms">
        <MarketStore campaign={campaign} models={models} company={company} onClose={() => onTab("quarter")} />
      </section>
    );
  return (
    <section className="ms fd-in">
      <header className="ms-top">
        <nav>
          {TABS.map(([t, label]) => (
            <button key={t} type="button" className={tab === t ? "on" : undefined} aria-pressed={tab === t} onClick={() => onTab(t)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="ms-right">
          {quarter && <QuarterPick quarters={quarters} quarter={quarter} onPick={setPicked} />}
          {proceed ? (
            <button type="button" className="fd-primary ms-go" onClick={onClose}>
              Continue
            </button>
          ) : (
            onClose && (
              <button type="button" className="fd-text ms-close" onClick={onClose}>
                Close
              </button>
            )
          )}
        </div>
      </header>
      <div className="ms-body">
        {quarter && tab === "quarter" && <QuarterTab campaign={campaign} market={market} quarter={quarter} company={company} />}
        {quarter && tab === "rivals" && (
          <>
            <ModelChips models={choices} model={model} onPick={setModel} />
            <RivalsTab campaign={campaign} market={market} quarter={quarter} models={choices} model={model} company={company} />
          </>
        )}
        {quarter && tab === "buyers" && <BuyersTab campaign={campaign} quarter={quarter} />}
      </div>
    </section>
  );
}
