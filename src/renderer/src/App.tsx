import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel, SavedNote, Settings } from "../../preload/store";
import { campaignSaved, queueCampaignSave } from "./app/campaignSaves";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { buildBlock } from "./builder/problems";
import { emptyBuild, toYear } from "./builder/structure";
import { WorkshopVisit } from "./builder/Visit";
import { CafeScreen } from "./cafe/CafeScreen";
import { WorldMap } from "./map/WorldMap";
import { StoreWorld } from "./storeworld/StoreWorld";
import { type Build, migrateBody, rivalsFor, screenOf, type Subject } from "./engine";
import { advanceClock, AWARD_NAMES, type CampaignState, campaignOf, DEFAULT_RUN, QUARTER_STEPS, type Quarter, release, reorder, savedCampaign, setCampaign, setPrice } from "./engine/campaign";
import { sortedModels } from "./foundry/LaptopList";
import { LoadCompany, NameCard, NewCompany, SettingsMenu, StartMenu } from "./foundry/Menus";
import { StatementView, type StatementTab } from "./foundry/Finance";
import { Ending } from "./foundry/Ending";
import { type MarketTab, MarketScreen } from "./world/MarketScreen";
import { MAKERS } from "./engine/market/makers";
import { setHonours } from "./review/honours";
import { Stage, type StageView } from "./foundry/Stage";
import { ReviewScreen } from "./review/ReviewScreen";
import { ensureMarket, FIRST_MARKET_YEAR, openMarkets } from "./market/markets";
import { bestSeller, shortFacts, subjectOf, writeShort } from "./video/script";
import { cancelShort, prepareShort, type ReadyShort, shortKey, useShort } from "./video/shorts";
import { VideoScreen } from "./video/VideoScreen";
import { SystemActions, SystemMenu, useSystemMenu } from "./foundry/SystemMenu";
import { Office } from "./office/Office";
import { OFFICE_START, type OfficeAt } from "./office/stations";
import type { OfficeActions } from "./office/Panels";

const store = () => window.api.store;

function inchesOf(b: Build): number | undefined {
  return screenOf(b)?.diag;
}

/** A save's models with their builds brought up to the current body types. */
function migrated(c: SavedCompany): SavedCompany {
  return { ...c, models: c.models.map((m) => ({ ...m, build: migrateBody(m.build as Build) })) };
}

type Menu = "start" | "new" | "load" | "settings" | "list";

/** Camera view per menu screen. The start menu orbits; the list sways. */
const VIEWS: Record<Menu, StageView> = {
  start: { azimuth: 0.2, distance: 860, shift: 0.2, mode: "orbit" },
  settings: { azimuth: -0.3, distance: 860, shift: 0.2, mode: "orbit" },
  new: { azimuth: 0.75, distance: 700, shift: 0.24, mode: "orbit" },
  load: { azimuth: -0.45, distance: 820, shift: 0.18, mode: "orbit" },
  list: { azimuth: 0, distance: 820, shift: 0.17, mode: "sway" },
};

/** A campaign's list: the laptop further back and between the rail and the side column. */
const CAMPAIGN_VIEW: StageView = { azimuth: 0, distance: 1300, shift: 0.014, mode: "sway" };

/**
 * Where the player is while a company is open: on the world map or in one of
 * its four places. The map remembers the place it was walked out of, which
 * Stay goes back into; null when it opened from the menu. The workshop and the
 * cafe hold the laptop brought along, if any; a visit made from the Office
 * goes back to the Office on Leave.
 */
type InPlace =
  | { at: "office" }
  | { at: "courts" }
  | { at: "workshop" | "cafe"; model: SavedModel | null; subject: Subject | null; office?: boolean };
type Where = InPlace | { at: "map"; from: InPlace | null };

function latestModel(c: SavedCompany | null | undefined): SavedModel | null {
  return c ? (sortedModels(c)[0] ?? null) : null;
}

export function App() {
  const [companies, setCompanies] = useState<SavedCompany[] | null>(null);
  // The open company's newest campaign state, ahead of its save landing.
  const live = useRef<{ id: string; state: CampaignState } | null>(null);
  // While a quarter resolves, campaign changes are held off: the quarter's result would overwrite them.
  const resolvingRef = useRef(false);
  const [settings, setSettings] = useState<Settings>({ sound: true });
  const [company, setCompany] = useState<SavedCompany | null>(null);
  const [menu, setMenu] = useState<Menu>("start");
  const [pickedSave, setPickedSave] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Subject | null>(null);
  // Where the player is: the one place, or the map, that every screen of an open company hangs off.
  const [where, setWhere] = useState<Where>({ at: "map", from: null });
  // The build waiting for the player to name it on the name card before it becomes a model.
  const [naming, setNaming] = useState<Build | null>(null);
  // On the way to the workshop: the travel card shows over it until the room has loaded.
  const [going, setGoing] = useState<"loading" | "here" | null>(null);
  // A year's market is being generated before a screen that needs it opens.
  const [busy, setBusy] = useState(false);
  // The statement view open between the rails, on this tab.
  const [statement, setStatement] = useState<StatementTab | null>(null);
  // The run size picked per model.
  const [runs, setRuns] = useState<Record<string, number>>({});
  // The quarter's step running while it resolves.
  const [resolving, setResolving] = useState<{ step: number; of: number; name: string } | null>(null);
  // Awards the player has seen on the Awards tab; more than that marks the tab.
  const [seenAwards, setSeenAwards] = useState<number | null>(null);
  // The Market screen, when open: its tab, the quarter and model it opened on, and whether End quarter opened it.
  const [marketView, setMarketView] = useState<{ tab: MarketTab; quarter?: Quarter; model?: string | null; proceed?: boolean } | null>(null);
  // Where the Office stands: its station and panel, kept while the player is in the builder, a review or the cafe.
  const [officeAt, setOfficeAt] = useState<OfficeAt>(OFFICE_START);
  // The system menu, over wherever the player is while a company is open.
  const [system, setSystem] = useSystemMenu(!!company && menu === "list");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the statement closes when the screen or company changes
  useEffect(() => {
    setStatement(null);
    setMarketView(null);
  }, [menu, company?.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a loaded company's awards so far count as seen
  useEffect(() => {
    setSeenAwards(company?.campaign ? campaignOf(company.campaign).awards.length : null);
  }, [company?.id]);
  // The last quarter's best seller as a short video.
  const [short, setShort] = useState<ReadyShort | null>(null);

  useEffect(() => {
    store().companies().then((all) => setCompanies(all.map(migrated)));
    store().settings().then(setSettings);
  }, []);

  const refresh = useCallback((saved: SavedCompany) => {
    let c = migrated(saved);
    // A campaign change still on its way to disk is newer than what the save returned.
    const l = live.current;
    if (l && l.id === c.id && c.campaign) c = { ...c, campaign: savedCampaign(l.state) };
    openMarkets(c);
    setCompany(c);
    setCompanies((all) => [c, ...(all ?? []).filter((x) => x.id !== c.id)]);
    return c;
  }, []);

  const companyId = company?.id;
  const save = useCallback(
    (m: SavedModel) =>
      companyId ? store().saveModel(companyId, m).then(refresh) : Promise.resolve(null),
    [companyId, refresh],
  );
  const saveNotes = useCallback(
    (notes: SavedNote[]) =>
      companyId ? store().saveNotes(companyId, notes).then(refresh) : Promise.resolve(null),
    [companyId, refresh],
  );

  const enter = useCallback(
    (id: string) =>
      store()
        .openCompany(id)
        .then((c) => {
          if (live.current?.id !== c.id) live.current = null;
          refresh(c);
          setSelected(latestModel(c)?.id ?? null);
          setOfficeAt(OFFICE_START);
          setWhere({ at: "office" });
          setMenu("list");
          // The year the company is in opens with it.
          const year = c.campaign ? campaignOf(c.campaign).now.year : (latestModel(c)?.build as Build | undefined)?.year;
          if (year) void ensureMarket(year);
        }),
    [refresh],
  );

  // What the stage shows: the laptop that belongs to the screen.
  const stagedCompany = useMemo((): SavedCompany | null => {
    if (menu === "list") return company;
    if (menu === "load") return companies?.find((c) => c.id === pickedSave) ?? null;
    return companies?.[0] ?? null;
  }, [menu, company, companies, pickedSave]);
  const staged = useMemo((): SavedModel | null => {
    if (menu === "list")
      return company?.models.find((m) => m.id === selected) ?? null;
    return latestModel(stagedCompany);
  }, [menu, company, selected, stagedCompany]);

  // A campaign opens each year's market as its clock reaches it.
  const campaignYear = company?.campaign ? campaignOf(company.campaign).now.year : null;
  useEffect(() => {
    if (campaignYear) void ensureMarket(campaignYear);
  }, [companyId, campaignYear]);

  // The review site prints the open campaign's awards.
  useEffect(() => {
    const awards = company?.campaign ? campaignOf(company.campaign).awards : [];
    setHonours(
      awards.map((a) => ({
        year: a.year,
        award: AWARD_NAMES[a.award],
        id: a.id,
        company: a.maker === null ? (company?.name ?? "") : (MAKERS.find((m) => m.id === a.maker)?.name ?? a.maker),
        name: a.name,
      })),
    );
  }, [company]);

  // The last quarter's short: made only when the player asks for it, from the Short card.
  const campaignState = company?.campaign;
  const best = useMemo(() => (campaignState ? bestSeller(campaignOf(campaignState)) : null), [campaignState]);
  const shortId = company && best ? shortKey(company.id, best.record.quarter) : null;
  const shortEntry = useShort(shortId);
  // Leaving the company, or its short moving to a new quarter, cancels a render still on its way.
  useEffect(() => {
    return () => cancelShort();
  }, [shortId]);
  const startShort = () => {
    if (!company?.campaign || !best || !shortId) return;
    const c = company;
    const state = campaignOf(company.campaign);
    const y = best.record.quarter.year;
    prepareShort(shortId, c.id, best.record.quarter, state.sales.length - 1, () =>
      Promise.all([ensureMarket(y - 1), ensureMarket(y)]).then(() => {
        // The player's models at the price they were released at.
        const own = c.models.map((m): Subject => {
          const s: Subject = { id: m.id, name: m.name, company: c.name, build: m.build as Build };
          const r = state.releases[m.id];
          return r ? { ...s, build: { ...s.build, price: r.price } } : s;
        });
        const found = subjectOf(best.id, own);
        return found ? writeShort(shortFacts(found.subject, found.mine, state, best.record, best.units)) : null;
      }),
    );
  };

  if (!companies) return null;
  const view = (() => {

  const name = company?.name ?? "";
  const campaign = company?.campaign ? campaignOf(company.campaign) : null;
  // Shows a new campaign state at once and saves it in the background; resolves once it is on disk.
  const apply = (next: CampaignState): Promise<void> => {
    if (!company) return Promise.resolve();
    const id = company.id;
    live.current = { id, state: next };
    const saved = savedCampaign(next);
    const played = Date.now();
    setCompany((c) => (c && c.id === id ? { ...c, campaign: saved, played } : c));
    setCompanies((all) => {
      const c = all?.find((x) => x.id === id);
      return c ? [{ ...c, campaign: saved, played }, ...(all ?? []).filter((x) => x.id !== id)] : all;
    });
    return queueCampaignSave(id, saved);
  };
  // Applies a change to the newest campaign state. Every click lands, however fast, and the saves follow.
  const commit = (change: (s: CampaignState) => CampaignState | null) => {
    if (!company || !campaign || resolvingRef.current) return;
    const next = change(live.current?.id === company.id ? live.current.state : campaign);
    if (next) void apply(next);
  };
  const subject = (m: SavedModel): Subject => ({ id: m.id, name: m.name, company: name, build: m.build as Build });
  // Opens the subject's year first: its review and apps compare it with that year's market.
  const withMarket = (s: Subject, then: (s: Subject) => void) => {
    if (busy) return;
    setBusy(true);
    ensureMarket(s.build.year)
      .then(() => then(s))
      .finally(() => setBusy(false));
  };
  // Ends the quarter once the year's market and the year before's are open: rivals from both are on sale.
  const endQuarter = () => {
    if (!campaign || !company || busy) return;
    const y = campaign.now.year;
    const of = QUARTER_STEPS.length;
    resolvingRef.current = true;
    setBusy(true);
    setResolving({ step: 0, of, name: QUARTER_STEPS[0].name });
    // Every change made so far is on disk before the quarter resolves.
    campaignSaved()
      .then(() => Promise.all([ensureMarket(y - 1), ensureMarket(y)]))
      .then(async () => {
        const rivals = y - 1 >= FIRST_MARKET_YEAR ? [...rivalsFor(y - 1), ...rivalsFor(y)] : rivalsFor(y);
        const ctx = { models: company.models, company: company.id, rivals };
        // Step by step, each named on the End button while it runs.
        let s = live.current?.id === company.id ? live.current.state : campaign;
        for (const [i, step] of QUARTER_STEPS.entries()) {
          setResolving({ step: i, of, name: step.name });
          await new Promise((r) => setTimeout(r, 140));
          s = step.run(s, ctx);
        }
        const next = advanceClock(s);
        // The Market screen opens on the quarter just played, with Continue.
        const played = s.ledger[s.ledger.length - 1]?.quarter;
        if (!next.over && played) {
          setStatement(null);
          setMarketView({ tab: "quarter", quarter: played, proceed: true });
        }
        await apply(next);
      })
      .finally(() => {
        resolvingRef.current = false;
        setBusy(false);
        setResolving(null);
      });
  };
  // Plays the short if it is ready; otherwise the click starts making it.
  const shortAction = () => {
    if (shortEntry?.state === "ready") setShort(shortEntry);
    else if (!shortEntry) startShort();
  };
  // The first review locks the model, so its review never changes.
  const review = (m: SavedModel) => {
    if (!m.reviewed) {
      if (buildBlock(m.build)) return;
      const now = Date.now();
      save({ ...m, reviewed: now, updated: now });
    }
    withMarket(subject(m), setReviewing);
  };

  // Out of a place to the world map; Stay there goes back into the same place.
  const toMap = (from: InPlace) => {
    setOpen(null);
    setWhere({ at: "map", from });
  };
  const visit = (place: "workshop" | "cafe", m: SavedModel | null, office = false) => {
    if (m && !buildBlock(m.build)) withMarket(subject(m), (s) => setWhere({ at: place, model: m, subject: s, office }));
    else setWhere({ at: place, model: m, subject: null, office });
  };

  // A copy of a build to name. In a campaign every new model, a copy too, is built for the current year.
  const nameCopy = (build: Build) => {
    const b = structuredClone(build);
    setNaming(campaign ? toYear(b, campaign.now.year) : b);
  };
  const duplicate = (id: string) => {
    const src = company?.models.find((m) => m.id === id);
    if (!src || campaign?.over) return null;
    nameCopy(src.build as Build);
    return src;
  };
  const newModel = () => setNaming(campaign ? toYear(emptyBuild(), campaign.now.year) : emptyBuild());
  // From the Office or the store a new model, or a copy, goes to the workshop, the travel card up until the room is in.
  const toWorkshop = (m: SavedModel | null, office = true) => {
    setGoing("loading");
    setWhere({ at: "workshop", model: m, subject: null, office });
  };
  // The named build becomes a model and opens in the builder; leaving it, a workshop visit has it on the turntable.
  // A clone named in the store goes to the workshop's turntable instead.
  const nameCard = naming && (
    <NameCard
      roll={() => randomName(naming.year, inchesOf(naming))}
      onCancel={() => setNaming(null)}
      onCreate={(n) => {
        const now = Date.now();
        const m: SavedModel = { id: crypto.randomUUID(), name: n, build: naming, created: now, updated: now };
        save(m).then(() => {
          setNaming(null);
          setSelected(m.id);
          setOfficeAt((a) => ({ ...a, station: "desk", model: m.id, arrive: false }));
          if (where.at === "courts") {
            toWorkshop(m, false);
            return;
          }
          setWhere((w) => (w.at === "workshop" ? { ...w, model: m } : w));
          setOpen(m.id);
        });
      }}
    />
  );

  if (short) return <VideoScreen key={short.url} video={short} onBack={() => setShort(null)} />;
  if (company && where.at === "cafe")
    return (
      <CafeScreen
        key={where.model?.id ?? "empty"}
        subject={where.subject}
        library={company.models.filter((x) => x.reviewed).map(subject)}
        onMap={() => toMap(where)}
        atDoor
        sound={settings.sound}
        onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
        notes={company.notes ?? []}
        onSaveNotes={saveNotes}
        shop={campaign ? { state: campaign, models: company.models, company: company.name } : undefined}
      />
    );
  // The builder, opened from the workshop, stands in for it until it is left.
  if (company && where.at === "workshop" && !open) {
    const at = where;
    return (
      <>
        <WorkshopVisit
          key={at.model?.id ?? "empty"}
          // As saved now: it may have changed in the builder since it was brought along.
          model={at.model && (company.models.find((x) => x.id === at.model?.id) ?? null)}
          models={company.models}
          company={company.name}
          library={company.models.filter((x) => x.reviewed).map(subject)}
          onMap={() => toMap(at)}
          onReady={going ? () => setGoing("here") : undefined}
          held={!!naming}
          onNew={campaign?.over ? undefined : newModel}
          onEdit={(id) => {
            const m = company.models.find((x) => x.id === id);
            if (!m) return;
            setWhere({ ...at, model: m });
            setOpen(id);
          }}
          onDuplicate={campaign?.over ? undefined : duplicate}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
        />
        {going !== "loading" && nameCard}
        {going && <Travel to="workshop" here={going === "here"} onDone={() => setGoing(null)} />}
      </>
    );
  }
  if (company && where.at === "courts")
    return (
      <>
        <StoreWorld
          company={company}
          onMap={() => toMap(where)}
          onClone={campaign?.over ? undefined : (item) => nameCopy(item.build)}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
        />
        {nameCard}
      </>
    );
  if (company && where.at === "map")
    return (
      <WorldMap
        key={where.from?.at ?? "menu"}
        company={company}
        from={where.from?.at ?? "menu"}
        onGo={(to, m) => {
          if (to === "office") {
            setOfficeAt(OFFICE_START);
            setWhere({ at: "office" });
          }
          else if (to === "courts") setWhere({ at: "courts" });
          else visit(to, m);
        }}
        onBack={() => {
          if (where.from) setWhere(where.from);
          else {
            setCompany(null);
            setMenu("start");
          }
        }}
      />
    );
  if (reviewing) {
    const saved = company?.models.find((x) => x.id === reviewing.id);
    return (
      <ReviewScreen
        key={reviewing.id}
        subject={reviewing}
        reveal={!saved?.revealed}
        onRevealed={() => {
          const m = company?.models.find((x) => x.id === reviewing.id);
          if (m && !m.revealed) save({ ...m, revealed: Date.now() });
        }}
        onBack={() => setReviewing(null)}
      />
    );
  }

  const model = open ? company?.models.find((m) => m.id === open) : undefined;
  if (model)
    return (
      <>
      <Builder
        key={model.id}
        model={model}
        company={name}
        onSave={(m) => save(m)}
        onReady={going ? () => setGoing("here") : undefined}
        onMap={() => toMap({ at: "workshop", model, subject: null })}
        onReview={review}
        onDuplicate={() => duplicate(model.id)}
        onOpen={setOpen}
        yearLocked={!!campaign}
        released={!!campaign?.releases[model.id]}
        reroll={(b) => randomName(b.year, inchesOf(b))}
        models={company?.models ?? []}
        library={(company?.models ?? []).filter((x) => x.reviewed).map(subject)}
        sound={settings.sound}
        onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
      />
      {nameCard}
      {going && <Travel to="workshop" here={going === "here"} onDone={() => setGoing(null)} />}
      </>
    );

  // The Office: the 3D room, its stations' panels and the quarter report over it. Leaving it goes to the map.
  const leaveOffice = () => toMap({ at: "office" });
  const find = (id: string) => company?.models.find((x) => x.id === id);
  if (company && where.at === "office" && menu === "list" && !(campaign?.over && campaign.bankrupt)) {
    const actions: OfficeActions = {
      onNew: () => toWorkshop(null),
      onUse: (id) => {
        const m = find(id);
        if (m && !buildBlock(m.build)) visit("cafe", m, true);
      },
      onReview: (id) => {
        const m = find(id);
        if (m) review(m);
      },
      onOpen: setOpen,
      onDuplicate: (id) => {
        const src = duplicate(id);
        if (src) toWorkshop(src);
      },
      onDelete: (id) =>
        store()
          .deleteModel(company.id, id)
          .then((c) => {
            refresh(c);
            setOfficeAt((a) => ({ ...a, model: null }));
            // A deleted model's line ends and its stock is written off.
            commit((s) => {
              if (!s.releases[id]) return null;
              const { [id]: _, ...releases } = s.releases;
              return { ...s, releases };
            });
          }),
      units: (id) => runs[id] || DEFAULT_RUN,
      onUnits: (id, u) => setRuns((r) => ({ ...r, [id]: u })),
      onPrice: (id, p) => commit((s) => setPrice(s, id, p)),
      onDraftPrice: (id, p) => {
        const m = find(id);
        const price = Math.max(1, Math.round(p));
        if (m && !m.reviewed && Number.isFinite(price)) save({ ...m, build: { ...(m.build as Build), price }, updated: Date.now() });
      },
      onRelease: (id, units, cost, re) => {
        const m = find(id);
        if (m) commit((s) => release(s, id, (m.build as Build).price, cost, units, re));
      },
      onReorder: (id, units, cost) => commit((s) => reorder(s, id, cost, units)),
      onTier: (segment, t) => commit((s) => ({ ...s, brand: setCampaign(s.brand, segment, t) })),
      onStatement: (t) => {
        setMarketView(null);
        setStatement(t);
      },
      onMarket: (t, id) => {
        setStatement(null);
        setMarketView({ tab: t, model: id });
      },
      short:
        shortId && best
          ? {
              quarter: `Q${best.record.quarter.quarter} ${best.record.quarter.year}`,
              name: company.models.find((m) => m.id === best.id)?.name ?? subjectOf(best.id, [])?.subject.name ?? "",
              state: shortEntry?.state === "ready" ? "ready" : shortEntry?.state === "busy" ? "busy" : "idle",
              poster: shortEntry?.state === "ready" ? shortEntry.poster : undefined,
              url: shortEntry?.state === "ready" ? shortEntry.url : undefined,
              onClick: shortAction,
            }
          : undefined,
      newAwards: campaign && seenAwards !== null ? Math.max(0, campaign.awards.length - seenAwards) : 0,
      onSeenAwards: () => campaign && setSeenAwards(campaign.awards.length),
    };
    return (
      <>
        <Office
          company={company}
          campaign={campaign}
          at={officeAt}
          onAt={(next) => {
            // Opening the cabinet counts its awards as seen.
            if (campaign && next.station === "trophies") setSeenAwards(campaign.awards.length);
            setOfficeAt(next);
          }}
          onMap={leaveOffice}
          onEndQuarter={endQuarter}
          resolving={resolving}
          blocked={!!marketView || !!statement || system}
          actions={actions}
          library={company.models.filter((x) => x.reviewed).map(subject)}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          onSystem={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            setSystem(true);
          }}
        />
        {campaign && statement && (
          <div className="fd of-over">
            <div className="fd-scrim fd-books-scrim" />
            <StatementView
              campaign={campaign}
              models={company.models}
              tab={statement}
              onTab={setStatement}
              onClose={() => setStatement(null)}
            />
          </div>
        )}
        {campaign && marketView && (
          <div className="fd of-over">
            <MarketScreen
              key={`${marketView.quarter?.year}-${marketView.quarter?.quarter}-${marketView.model}`}
              campaign={campaign}
              models={company.models}
              company={company.name}
              tab={marketView.tab}
              onTab={(t) => setMarketView((v) => (v ? { ...v, tab: t } : v))}
              quarter={marketView.quarter}
              model={marketView.model}
              proceed={marketView.proceed}
              onClose={() => {
                // After End quarter's report, back to the desk.
                if (marketView.proceed) setOfficeAt((a) => ({ ...a, station: "desk" }));
                setMarketView(null);
              }}
            />
          </div>
        )}
      </>
    );
  }

  let screen: ReactNode = null;
  if (menu === "start")
    screen = (
      <StartMenu
        latest={companies[0] ?? null}
        onContinue={() => companies[0] && enter(companies[0].id)}
        onNew={() => setMenu("new")}
        onLoad={() => {
          setPickedSave(companies[0]?.id ?? null);
          setMenu("load");
        }}
        onSettings={() => setMenu("settings")}
      />
    );
  else if (menu === "new")
    screen = (
      <NewCompany
        onBack={() => setMenu("start")}
        onStart={(n, start, cash) =>
          store()
            .createCompany(n, start, cash)
            .then((c) => {
              refresh(c);
              setSelected(null);
              setOfficeAt(OFFICE_START);
              setWhere({ at: "office" });
              setMenu("list");
            })
        }
      />
    );
  else if (menu === "load")
    screen = (
      <LoadCompany
        companies={companies}
        selected={pickedSave}
        onSelect={setPickedSave}
        onLoad={enter}
        onBack={() => setMenu("start")}
        onDelete={(id) =>
          store()
            .deleteCompany(id)
            .then((all) => {
              setCompanies(all.map(migrated));
              if (company?.id === id) setCompany(null);
              setPickedSave(all[0]?.id ?? null);
            })
        }
      />
    );
  else if (menu === "settings")
    screen = (
      <SettingsMenu
        sound={settings.sound}
        onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
        onBack={() => setMenu("start")}
      />
    );
  // Only bankruptcy ends a campaign; otherwise the clock runs on past 2026.
  const ended = menu === "list" && !!campaign?.over && campaign.bankrupt;
  if (ended && company && campaign)
    screen = (
      <Ending
        name={company.name}
        campaign={campaign}
        onMenu={() => {
          setCompany(null);
          setMenu("start");
        }}
      />
    );

  return (
    <div className="fd" style={busy ? { cursor: "progress" } : undefined}>
      <Stage
        build={staged ? (staged.build as Build) : null}
        stageKey={staged ? `${staged.id}:${staged.updated}` : "stock"}
        maker={stagedCompany?.name ?? ""}
        model={staged?.name ?? ""}
        view={menu === "list" && campaign && !ended ? CAMPAIGN_VIEW : VIEWS[menu]}
      />
      {(menu !== "list" || ended) &&<div className="fd-scrim" />}
      <div key={menu}>{screen}</div>
    </div>
  );
  })();

  // Over the Office, and from the places' pause menus: the place stays mounted underneath the system menu.
  const leaveCompany = (to: Menu) => {
    setSystem(false);
    if (document.pointerLockElement) document.exitPointerLock();
    setShort(null);
    setOpen(null);
    setReviewing(null);
    setCompany(null);
    if (to === "load") setPickedSave(companies[0]?.id ?? null);
    setMenu(to);
  };
  return (
    <SystemActions.Provider value={company ? { onNew: () => leaveCompany("new"), onLoad: () => leaveCompany("load") } : null}>
      {view}
      {system && company && (
        <SystemMenu
          company={company.name}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          onResume={() => setSystem(false)}
          onNew={() => leaveCompany("new")}
          onLoad={() => leaveCompany("load")}
          onMap={
            where.at === "map"
              ? undefined
              : () => {
                  setSystem(false);
                  toMap(where);
                }
          }
        />
      )}
    </SystemActions.Provider>
  );
}

/** A full-screen card naming where the player is headed, faded out once the place underneath is `here`. */
function Travel({ to, here, onDone }: { to: string; here: boolean; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!here) return;
    const end = setTimeout(() => done.current(), 400);
    return () => clearTimeout(end);
  }, [here]);
  return (
    <div className={`fd fd-travel${here ? " out" : ""}`}>
      <b>Going to the {to}</b>
    </div>
  );
}
