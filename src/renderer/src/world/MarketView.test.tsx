import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SavedModel } from "../../../preload/store";
import { type CampaignState, newCampaign, resolveQuarter } from "../engine/campaign";
import { buildCost, release } from "../engine/campaign/release";
import { addMarket, loadMarkets, type Rival } from "../engine/market/field";
import { generateModel, hashOf, rngOf } from "../engine/market/generate";
import { LINES } from "../engine/market/makers";
import { StoreSite } from "../store/StoreSite";
import { MarketRail } from "./MarketRail";
import { MarketView } from "./MarketView";

// Renders the market views over a short real campaign, to catch what breaks at runtime.

const COMPANY = "views";
const LINE_IDS = ["dell-inspiron", "lenovo-thinkpad", "apple-macbook-pro", "asus-rog"];

function rivalOf(lineId: string, year: number): Rival {
  const line = LINES.find((l) => l.id === lineId);
  if (!line) throw new Error(lineId);
  const g = generateModel(line, year, rngOf(hashOf("market", COMPANY, lineId, year)));
  return { id: `${lineId}-${year}`, maker: line.maker, line: line.id, name: `${line.name} ${year}`, build: g.build };
}

let s: CampaignState;
let models: SavedModel[];

beforeAll(() => {
  const rivals = [2011, 2012].flatMap((y) => LINE_IDS.map((id) => rivalOf(id, y)));
  loadMarkets(COMPANY, {});
  for (const y of [2011, 2012]) addMarket(COMPANY, { year: y, seed: 0, models: rivals.filter((r) => r.build.year === y) });
  const own = rivalOf("dell-inspiron", 2012);
  const cost = buildCost(own.build);
  const build = { ...own.build, price: Math.round(cost * 1.6) };
  models = [{ id: "own", name: "Own One", build, created: 0, updated: 0 }];
  s = newCampaign(2012);
  const next = release(s, "own", build.price, cost, 5_000, false);
  if (!next) throw new Error("no release");
  s = next;
  for (let i = 0; i < 3; i++) s = resolveQuarter(s, { models, company: COMPANY, rivals });
}, 300_000);

afterEach(cleanup);

describe("market views", () => {
  for (const tab of ["quarter", "store", "competitors", "buyers"] as const)
    it(`renders the ${tab} tab`, () => {
      const r = render(<MarketView campaign={s} models={models} company="Acme" tab={tab} onTab={() => {}} onClose={() => {}} />);
      expect(r.container.textContent).toContain(tab === "store" ? "Courts" : "Q3 2012");
      if (tab !== "store") expect(r.container.textContent).toContain("Own One");
    });

  it("renders the rail tab", () => {
    const r = render(<MarketRail campaign={s} models={models} company="Acme" onOpen={() => {}} />);
    expect(r.container.textContent).toContain("Best sellers");
  });

  for (const era of [2006, 2016, 2026] as const)
    it(`opens a product in the ${era} store`, () => {
      const r = render(
        <StoreSite state={s} market={{ rivals: [], models }} quarter={s.shelf[2].quarter} company="Acme" era={era} />,
      );
      const card = r.container.querySelector(".st-own");
      expect(card).not.toBeNull();
      if (card) fireEvent.click(card);
      expect(r.container.querySelector(".st-product h1")?.textContent).toBe("Own One");
    });
});
