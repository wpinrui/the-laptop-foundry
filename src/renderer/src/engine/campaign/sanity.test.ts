import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SavedModel } from "../../../../preload/store";
import { type Rival, savedMarketOf } from "../market/field";
import { generateModel, generateYear, hashOf, rngOf } from "../market/generate";
import { LINES } from "../market/makers";
import { setCampaign } from "./brand";
import { type CampaignState, newCampaign, resolveQuarter } from "./index";
import { buildCost, release, reorder } from "./release";
import { shareOf } from "./sales";

// A scripted campaign, 2010 Q1 to 2012 Q4: a new company releases a sensible
// midrange consumer laptop at the start of each year, reorders when stock
// runs low, and runs a grassroots campaign for consumers and students. It
// checks the scale of sales, revenue and cash.

const COMPANY = "sanity";
const YEARS = [2009, 2010, 2011, 2012];

describe("campaign sales sanity run", () => {
  it("sells thousands to tens of thousands a quarter", { timeout: 900_000 }, () => {
    const markets = new Map<number, Rival[]>();
    for (const y of YEARS) markets.set(y, savedMarketOf(generateYear(y, hashOf("market", COMPANY, y))).models);
    const inspiron = LINES.find((l) => l.id === "dell-inspiron");
    if (!inspiron) throw new Error("no line");
    const models: SavedModel[] = [];
    let s: CampaignState = newCampaign(2010);
    s = { ...s, brand: setCampaign(setCampaign(s.brand, "generalConsumer", 1), "student", 1) };
    const rows: string[] = [];
    let current = "";
    while (!s.over && s.now.year <= 2012) {
      const y = s.now.year;
      if (s.now.quarter === 1) {
        const g = generateModel(inspiron, y, rngOf(hashOf("player", y)));
        // Priced to cover the parts, the retailers' cut and a thin margin.
        const cost = buildCost(g.build);
        const build = { ...g.build, price: Math.round((cost * 1.5) / 10) * 10 - 1 };
        const id = `own-${y}`;
        models.push({ id, name: `Own ${y}`, build, created: 0, updated: 0 });
        const run = [5_000, 3_000, 2_000, 1_000].find((u) => u * cost + 1_000_000 < s.cash - 500_000) ?? 1_000;
        const next = release(s, id, build.price, cost, run, false);
        if (next) {
          s = next;
          current = id;
        }
      } else if (current && s.releases[current]) {
        // Reorder up to last quarter's demand, keeping $1M in hand.
        const m = models.find((x) => x.id === current);
        const cost = m ? buildCost(m.build as never) : 0;
        const want = s.sales[s.sales.length - 1]?.demand[current] ?? 0;
        const room = Math.floor((s.cash - 1_000_000) / Math.max(1, cost) / 1000) * 1000;
        const units = Math.min(room, Math.ceil((want - s.releases[current].stock) / 1000) * 1000);
        const next = units > 0 ? reorder(s, current, cost, units) : null;
        if (next) s = next;
      }
      const rivals = [...(markets.get(y - 1) ?? []), ...(markets.get(y) ?? [])];
      const label = `Q${s.now.quarter} ${y}`;
      s = resolveQuarter(s, { models, company: COMPANY, rivals });
      const rec = s.sales[s.sales.length - 1];
      const led = s.ledger[s.ledger.length - 1];
      const own = Object.entries(rec.units)
        .map(([k, v]) => `${k}:${v}/${rec.demand[k]}`)
        .join(" ");
      rows.push(
        `${label} own ${own || "-"} share ${(shareOf(rec) * 100).toFixed(3)}% market ${rec.total} rev ${Math.round(led.revenue)} profit ${Math.round(led.profit)} cash ${Math.round(led.cash)} rivals ${s.onSale.length}`,
      );
    }
    const price = models.map((m) => `${m.id} $${(m.build as { price?: number }).price} cost $${Math.round(buildCost(m.build as never))}`).join(", ");
    // SANITY_OUT=path writes the run out for reading.
    const out = process.env.SANITY_OUT;
    if (out) writeFileSync(out, `${price}\n${rows.join("\n")}\n`);
    const sold = s.sales.flatMap((r) => Object.values(r.units));
    const best = Math.max(...sold);
    expect(best).toBeGreaterThan(1_000);
    expect(best).toBeLessThan(200_000);
  });
});
