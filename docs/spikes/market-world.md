# Spike: making the campaign's market world viewable

The player asks: "I'm not aware what happens in any given quarter whatsoever. I'd love to be able to hit up Courts and browse laptops. It's also hard to know who I'm competing with, what demographic is buying my stuff." The designer's brief (`temp/designer-market-world.txt`) names four needs: (1) what happened this quarter, for any past quarter; (2) a retailer to browse every laptop on sale; (3) the competitors of a chosen player model; (4) the buyers of each player model.

This spike lists what the campaign keeps today, what is missing for each need, what to record per quarter, what it costs in the save, and the plan.

## What the campaign keeps today

| Kept | Where | How long |
|---|---|---|
| Player units and demand per model, rival units per maker, the market total, the top seller | `CampaignState.sales` (`SalesRecord`) | Last 20 quarters |
| Books per quarter: revenue, costs, profit, cash | `ledger` | Every quarter |
| Each release's quarter, price history per settled quarter, stock | `releases` | While the model exists; deleting a model drops it |
| Published review score and the quarter it came out | `reviews` | Every laptop reviewed |
| Awards, per year | `awards` | Every year |
| Reach and perception per segment | `brand` | Current quarter only |
| Rivals on sale | `onSale` | Current quarter only |
| Per segment outcome of each player model (units, market score, value) | `outcomes` | Dropped at the end of the quarter's marketing step |
| Every rival's build, price, headline stats, review and category scores | The company's saved markets, per year (`profile.ts`) | Every opened year |

Rival launch quarters are not saved but can be derived: `launchQuarter(company, line, year)` is a pure hash, and the sale window follows from it. The sales step already computes every seller's units per segment (`splitDemand`), then throws all of it away except the player's per segment outcomes, which are dropped a step later.

## What each need is missing

### 1. What happened this quarter

| Wanted | Today |
|---|---|
| Launches | Derivable for rivals from the launch hash, but the first quarter of a campaign opens with stand ins, so a record is simpler and exact |
| Best sellers | Only the single top seller |
| Share movement | Per maker, for 20 quarters. No per model share for rivals |
| Reviews, awards | Kept |
| How the player did | Ledger kept; units and share for 20 quarters only |

Missing: units per laptop, launches, and history past 20 quarters.

### 2. A retailer to browse every laptop on sale

| Wanted | Today |
|---|---|
| Every laptop on sale in a quarter | Current quarter only (`onSale`) |
| Price, specs, class, maker, size | Rivals from the saved market; player models from the saved build and the release's price history |
| Review score | Kept, with its publication quarter |
| Units sold | Missing per laptop |
| Suited segment | Derivable from the market score, which is deterministic given the year's market |

Missing: the shelf per quarter and units per laptop.

### 3. Competitors of a player model

Missing: which segments each laptop sold to. "Competes with" is best read as "sold to the same segments at a similar price", which needs per segment units for rivals too. Headline stats are already available for every laptop.

### 4. Buyers of a player model

Missing: per segment units per model (dropped each quarter), each segment's total units (for share won), and brand reach and perception over time. Segment priorities are static (`segments.ts` weights).

## What to record per quarter

A `ShelfRecord` per resolved quarter, kept for the whole campaign (no 20 quarter cap), filled by the sales step from numbers it already computes. Nothing else in the step changes, so no existing result moves.

```ts
interface ShelfRecord {
  quarter: Quarter;
  /** Units sold per laptop on sale, one entry per segment in SEGMENTS order. Player and rivals. */
  units: Record<string, number[]>;
  /** The player's models on sale: name, price and demand before stock. */
  own: Record<string, { name: string; price: number; demand: number }>;
  /** Laptops whose launch quarter this is. */
  launched: string[];
  /** Reach (per mille) and perception per segment, as sales saw them. */
  brand: { reach: number[]; perception: number[] };
}
```

- Per segment units are rounded so they add up exactly to the units the sales step sold (largest remainder), so the new record and `SalesRecord` agree.
- The player's model name and price are kept in the record so a deleted model's quarters still read.
- Rival price, specs and review come from the saved market and `reviews`; they never change after generation, so they are not copied.
- Segment totals, maker units and shares, best sellers and share movement are all sums over `units`, so they are derived, not stored.

## Save size

The shelf holds 15 laptops in 2006, rising to about 30 to 43 from 2012 (2,547 seller quarters over 2006 to 2026). A synthetic full campaign with real segment buyer counts and real ids measured **about 4.1 KB per quarter, 345 KB for 2006 Q1 to 2026 Q4** as JSON. A campaign started in 2016 is about half that. The campaign's save grows from tens of KB to about 0.4 MB at the very end. The markets, the big part of a save, live in their own file and are not touched.

Cheaper encodings were weighed and left out: per mille shares instead of units save about a quarter and lose precision; keeping only each rival's top segments breaks exact segment totals. The exact form is simple and small enough.

## Plan

1. **Engine**: record the `ShelfRecord` in `simulateSales` (`splitDemand` also returns every seller's per segment units), parse it in `campaignOf`, and add pure selectors in `engine/campaign/world.ts`:
   - `quarterSummary(state, market, quarter)`: total units, best sellers, maker shares with movement against the quarter before, launches, reviews published, awards, and the player's units, share, movement and books.
   - `storeListing(state, market, quarter, filters)`: every laptop on sale with maker, name, price, size, class, best suited segment, review score and units; filters by price, size, class, maker and segment.
   - `competitorsOf(state, market, modelId, quarter)`: rivals on sale ranked by segment overlap and price distance, each with its headline stats beside the player model's.
   - `buyersOf(state, modelId)`: per segment units, split, share won, the segment's top priorities, and the brand's reach and perception there.
   - `market` is `{ rivals, models }`: the loaded rivals and the player's saved models. Vitest for each.
2. **UI**, thin components over those selectors, no layout logic in the data:
   - A **Market** view between the rails with a quarter picker and four tabs: Quarter, Store, Competitors, Buyers. The quarter report gets the best seller, the player's share and a button into it.
   - The **store** as an era styled retailer site (2006 portal, 2016 flat shop, 2026 editorial) in the same way as the review site, in its own folder. It lists every laptop on sale with filters and opens a product page with specs, price, review score and units. It shows inside the Market view and as a store site in the in-game laptop's browser in a campaign. Its name sits in one constant (`STORE`), Courts for now.
   - **Competitors** and **Buyers** read the selected model and can be reached from the Model tab.
3. **Left for the mockups**: layout, charts (share over time, segment split), era art for the store, and any explanatory copy, which the GDD's frontend text rule keeps out of the build for now.
