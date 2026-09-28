import type { ReactNode } from "react";
import "./campaign.css";

export type RailTab = "model" | "books" | "brand" | "awards";

const TABS: [RailTab, string][] = [
  ["model", "Model"],
  ["books", "Books"],
  ["brand", "Brand"],
  ["awards", "Awards"],
];

// The campaign's right rail: Market and Menu on top, then the Model, Books,
// Brand and Awards tabs over the active tab's content.
export function CampaignRail({
  tab,
  onTab,
  onMenu,
  onMarket,
  dot,
  children,
}: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  onMenu: () => void;
  /** Opens the Market screen; absent before any quarter has been played. */
  onMarket?: () => void;
  /** Tabs with something new, marked with a dot. */
  dot?: RailTab[];
  children: ReactNode;
}) {
  return (
    <aside className="cr fd-in">
      <div className="cr-top">
        <button type="button" className="fd-text cr-market" disabled={!onMarket} onClick={onMarket}>
          Market
        </button>
        <button type="button" className="fd-text" onClick={onMenu}>
          Menu
        </button>
      </div>
      <nav className="cr-tabs">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={t === tab ? "on" : undefined}
            aria-pressed={t === tab}
            onClick={() => onTab(t)}
          >
            {label}
            {dot?.includes(t) && <i />}
          </button>
        ))}
      </nav>
      <div className="cr-body">{children}</div>
    </aside>
  );
}
