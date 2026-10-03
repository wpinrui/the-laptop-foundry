import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SavedModel } from "../../../preload/store";
import type { CampaignState } from "../engine/campaign";
import { Browser, Desktop, Screen, type TaskbarProps, Win } from "../os/Os";
import type { Power } from "../os/types";
import { wallpaperFor } from "../os/wallpapers";
import { eraOf } from "../review/ReviewSite";
import { STORE } from "../store/name";
import { StoreSite, type StoreSource, storeUrl } from "../store/StoreSite";
import { useWorldMarket } from "./data";

// The Market screen's Store tab: the laptop's OS desktop with the browser open
// on Courts' laptops department, laid out at the game's 1440 by 810 and
// scaled to the window. What is on sale now: the last played quarter's shelf.

const W = 1440;
const H = 810;

const POWER: Power = { battery: true, pct: 100, plugged: true, time: "Fully charged" };

function useFit(): number {
  const of = () => Math.min(window.innerWidth / W, window.innerHeight / H);
  const [k, setK] = useState(of);
  useEffect(() => {
    const on = () => setK(of());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return k;
}

export function MarketStore({
  campaign,
  models,
  company,
  onClose,
}: {
  campaign: CampaignState;
  models: SavedModel[];
  company: string;
  /** The browser's close: back to the Quarter tab. */
  onClose: () => void;
}) {
  const market = useWorldMarket(models);
  const shelf = campaign.shelf[campaign.shelf.length - 1];
  const era = eraOf(campaign.now.year);
  const [page, setPage] = useState<string | null>(null);
  const [minimised, setMinimised] = useState(false);
  const k = useFit();
  const source: StoreSource | null = useMemo(
    () => (shelf ? { kind: "quarter", state: campaign, market, quarter: shelf.quarter } : null),
    [shelf, campaign, market],
  );
  const bar: TaskbarProps = {
    era,
    app: "shop",
    minimised,
    onOpen: (a) => {
      if (a === "shop") setMinimised(false);
    },
    onTask: () => setMinimised((v) => !v),
    power: POWER,
    muted: true,
    year: campaign.now.year,
    now: new Date(),
  };
  // Outside the menus' root, so the foundry's button reset never reaches the OS.
  return createPortal(
    <div className="ms-os">
      <div className="ms-os-frame" style={{ width: W, height: H, transform: `scale(${k})` }}>
        <Screen era={era}>
          <Desktop {...bar} wallpaper={wallpaperFor(null, campaign.now.year)} apps={["shop"]}>
            {source && (
              <Win app="shop" title={STORE[era].name} w={99999} h={99999} hidden={minimised} onMin={() => setMinimised(true)} onClose={onClose}>
                <Browser
                  era={era}
                  title="Laptops"
                  url={storeUrl(era, page)}
                  canBack={!!page}
                  canForward={false}
                  onBack={() => setPage(null)}
                  onReload={() => setPage((p) => p)}
                >
                  <StoreSite source={source} company={company} era={era} page={page} onPage={setPage} />
                </Browser>
              </Win>
            )}
          </Desktop>
        </Screen>
      </div>
    </div>,
    document.body,
  );
}
