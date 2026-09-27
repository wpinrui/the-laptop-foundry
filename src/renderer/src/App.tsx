import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel, SavedNote, Settings } from "../../preload/store";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { buildBlock } from "./builder/problems";
import { emptyBuild, toYear } from "./builder/structure";
import { CafeScreen } from "./cafe/CafeScreen";
import { type Build, migrateBody, rivalsFor, screenOf, type Subject } from "./engine";
import { AWARD_NAMES, type CampaignState, campaignOf, release, reorder, resolveQuarter, savedCampaign, setCampaign } from "./engine/campaign";
import { LaptopList, sortedModels } from "./foundry/LaptopList";
import { LoadCompany, NameStep, NewCompany, SettingsMenu, StartMenu } from "./foundry/Menus";
import { Bankrupt, FinancePanel } from "./foundry/Finance";
import { MarketingPanel } from "./foundry/Marketing";
import { ReleasePanel } from "./foundry/Release";
import { SalesPanel } from "./foundry/Sales";
import { AwardsPanel } from "./foundry/Awards";
import { MAKERS } from "./engine/market/makers";
import { setHonours } from "./review/honours";
import { Stage, type StageView } from "./foundry/Stage";
import { ReviewScreen } from "./review/ReviewScreen";
import { ensureMarket, FIRST_MARKET_YEAR, openMarkets } from "./market/markets";
import { bestSeller, shortFacts, subjectOf, writeShort } from "./video/script";
import { prepareShort, type ReadyShort, shortKey, useShort } from "./video/shorts";
import { VideoScreen } from "./video/VideoScreen";

const store = () => window.api.store;

function inchesOf(b: Build): number | undefined {
  return screenOf(b)?.diag;
}

/** A save's models with their builds brought up to the current body types. */
function migrated(c: SavedCompany): SavedCompany {
  return { ...c, models: c.models.map((m) => ({ ...m, build: migrateBody(m.build as Build) })) };
}

type Menu = "start" | "new" | "load" | "settings" | "list" | "name";

/** Camera view per menu screen. The start menu orbits; the list sways. */
const VIEWS: Record<Menu, StageView> = {
  start: { azimuth: 0.2, distance: 860, shift: 0.2, mode: "orbit" },
  settings: { azimuth: -0.3, distance: 860, shift: 0.2, mode: "orbit" },
  new: { azimuth: 0.75, distance: 700, shift: 0.24, mode: "orbit" },
  load: { azimuth: -0.45, distance: 820, shift: 0.18, mode: "orbit" },
  list: { azimuth: 0, distance: 820, shift: 0.17, mode: "sway" },
  name: { azimuth: 0.6, distance: 720, shift: 0.22, mode: "sway" },
};

function latestModel(c: SavedCompany | null | undefined): SavedModel | null {
  return c ? (sortedModels(c)[0] ?? null) : null;
}

export function App() {
  const [companies, setCompanies] = useState<SavedCompany[] | null>(null);
  const ending = useRef(false);
  const [settings, setSettings] = useState<Settings>({ sound: true });
  const [company, setCompany] = useState<SavedCompany | null>(null);
  const [menu, setMenu] = useState<Menu>("start");
  const [pickedSave, setPickedSave] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Subject | null>(null);
  const [using, setUsing] = useState<Subject | null>(null);
  // The build waiting for the player to name it before it becomes a model.
  const [naming, setNaming] = useState<Build | null>(null);
  // A year's market is being generated before a screen that needs it opens.
  const [busy, setBusy] = useState(false);
  // The marketing table is open in place of the release panel.
  const [marketing, setMarketing] = useState(false);
  // The last quarter's best seller as a short video.
  const [short, setShort] = useState<ReadyShort | null>(null);

  useEffect(() => {
    store().companies().then((all) => setCompanies(all.map(migrated)));
    store().settings().then(setSettings);
  }, []);

  const refresh = useCallback((saved: SavedCompany) => {
    const c = migrated(saved);
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
          refresh(c);
          setSelected(latestModel(c)?.id ?? null);
          setMenu("list");
          // The year the company is in opens with it.
          const year = c.campaign ? campaignOf(c.campaign).now.year : (latestModel(c)?.build as Build | undefined)?.year;
          if (year) void ensureMarket(year);
        }),
    [refresh],
  );

  // What the stage shows: the laptop that belongs to the screen.
  const stagedCompany = useMemo((): SavedCompany | null => {
    if (menu === "list" || menu === "name") return company;
    if (menu === "load") return companies?.find((c) => c.id === pickedSave) ?? null;
    return companies?.[0] ?? null;
  }, [menu, company, companies, pickedSave]);
  const staged = useMemo((): SavedModel | null => {
    if (menu === "list" || menu === "name")
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

  // The last quarter's short is made in the background from the moment the quarter ends.
  const campaignState = company?.campaign;
  const best = useMemo(() => (campaignState ? bestSeller(campaignOf(campaignState)) : null), [campaignState]);
  const shortId = company && best ? shortKey(company.id, best.record.quarter) : null;
  const shortEntry = useShort(shortId);
  const startShort = () => {
    if (!company?.campaign || !best || !shortId) return;
    const c = company;
    const state = campaignOf(company.campaign);
    const y = best.record.quarter.year;
    prepareShort(shortId, c.id, best.record.quarter, () =>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per company and quarter
  useEffect(() => {
    if (shortId) startShort();
  }, [shortId]);

  if (!companies) return null;

  const name = company?.name ?? "";
  const campaign = company?.campaign ? campaignOf(company.campaign) : null;
  // Saves a changed campaign state. One change at a time: a second click before the save lands would apply twice.
  const commit = (next: CampaignState | null) => {
    if (!company || !next || ending.current) return;
    ending.current = true;
    store()
      .saveCampaign(company.id, savedCampaign(next))
      .then(refresh)
      .finally(() => {
        ending.current = false;
      });
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
    setBusy(true);
    Promise.all([ensureMarket(y - 1), ensureMarket(y)])
      .then(() => {
        const rivals = y - 1 >= FIRST_MARKET_YEAR ? [...rivalsFor(y - 1), ...rivalsFor(y)] : rivalsFor(y);
        commit(resolveQuarter(campaign, { models: company.models, company: company.id, rivals }));
      })
      .finally(() => setBusy(false));
  };
  // Plays the short once it is made; before that, a click only makes sure it is on its way.
  const watchShort = () => {
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

  if (short) return <VideoScreen key={short.url} video={short} onBack={() => setShort(null)} />;
  if (company && using)
    return (
      <CafeScreen
        key={using.id}
        subject={using}
        library={company.models.filter((x) => x.reviewed).map(subject)}
        onBack={() => setUsing(null)}
        sound={settings.sound}
        onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
        notes={company.notes ?? []}
        onSaveNotes={saveNotes}
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

  const duplicate = (id: string) => {
    const src = company?.models.find((m) => m.id === id);
    if (src && !campaign?.over) {
      const b = structuredClone(src.build) as Build;
      // In a campaign every new model, a duplicate too, is built for the current year.
      setNaming(campaign ? toYear(b, campaign.now.year) : b);
      setMenu("name");
    }
  };

  const model = open ? company?.models.find((m) => m.id === open) : undefined;
  if (model)
    return (
      <Builder
        key={model.id}
        model={model}
        company={name}
        onSave={(m) => save(m)}
        onBack={() => setOpen(null)}
        onReview={review}
        onDuplicate={() => {
          setOpen(null);
          duplicate(model.id);
        }}
        yearLocked={!!campaign}
        released={!!campaign?.releases[model.id]}
        reroll={(b) => randomName(b.year, inchesOf(b))}
        library={(company?.models ?? []).filter((x) => x.reviewed).map(subject)}
        sound={settings.sound}
        onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
      />
    );

  const find = (id: string) => company?.models.find((x) => x.id === id);
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
        onStart={(n, start) =>
          store()
            .createCompany(n, start)
            .then((c) => {
              refresh(c);
              setSelected(null);
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
  else if (menu === "name" && naming)
    screen = (
      <NameStep
        roll={() => randomName(naming.year, inchesOf(naming))}
        onCancel={() => {
          setNaming(null);
          setMenu("list");
        }}
        onCreate={(n) => {
          const now = Date.now();
          const m: SavedModel = { id: crypto.randomUUID(), name: n, build: naming, created: now, updated: now };
          save(m).then(() => {
            setNaming(null);
            setSelected(m.id);
            setMenu("list");
            setOpen(m.id);
          });
        }}
      />
    );
  else if (company)
    screen = (
      <LaptopList
        company={company}
        campaign={campaign}
        onEndQuarter={endQuarter}
        onShort={shortId ? watchShort : undefined}
        shortBusy={shortEntry?.state !== "ready"}
        selected={selected}
        onSelect={setSelected}
        onMenu={() => {
          setCompany(null);
          setMenu("start");
        }}
        onNew={() => {
          setNaming(campaign ? toYear(emptyBuild(), campaign.now.year) : emptyBuild());
          setMenu("name");
        }}
        onUse={(id) => {
          const m = find(id);
          if (m && !buildBlock(m.build)) withMarket(subject(m), setUsing);
        }}
        onReview={(id) => {
          const m = find(id);
          if (m) review(m);
        }}
        onOpen={setOpen}
        onDuplicate={duplicate}
        onDelete={(id) =>
          store()
            .deleteModel(company.id, id)
            .then((c) => {
              refresh(c);
              setSelected(sortedModels(c)[0]?.id ?? null);
              // A deleted model's line ends and its stock is written off.
              const s = c.campaign ? campaignOf(c.campaign) : null;
              if (s?.releases[id]) {
                const { [id]: _, ...releases } = s.releases;
                return store().saveCampaign(c.id, savedCampaign({ ...s, releases })).then(refresh);
              }
            })
        }
      />
    );
  const current = company?.models.find((m) => m.id === selected);
  if (menu === "list" && company && campaign?.bankrupt)
    screen = (
      <Bankrupt
        name={company.name}
        campaign={campaign}
        onMenu={() => {
          setCompany(null);
          setMenu("start");
        }}
      />
    );
  else if (menu === "list" && company && campaign)
    screen = (
      <>
        {screen}
        <div className="fd-side">
          <FinancePanel campaign={campaign} />
          <SalesPanel campaign={campaign} models={company.models} />
          <AwardsPanel campaign={campaign} models={company.models} />
          <MarketingPanel
            campaign={campaign}
            open={marketing}
            onToggle={() => setMarketing((m) => !m)}
            onTier={(segment, tier) => commit({ ...campaign, brand: setCampaign(campaign.brand, segment, tier) })}
          />
          {current && !marketing && (
            <ReleasePanel
              key={current.id}
              campaign={campaign}
              model={current}
              models={company.models}
              onRelease={(units, cost, re) =>
                commit(release(campaign, current.id, (current.build as Build).price, cost, units, re))
              }
              onReorder={(units, cost) => commit(reorder(campaign, current.id, cost, units))}
            />
          )}
        </div>
      </>
    );

  return (
    <div className="fd" style={busy ? { cursor: "progress" } : undefined}>
      <Stage
        build={staged ? (staged.build as Build) : null}
        stageKey={staged ? `${staged.id}:${staged.updated}` : "stock"}
        maker={stagedCompany?.name ?? ""}
        model={staged?.name ?? ""}
        view={VIEWS[menu]}
      />
      {(menu !== "list" || campaign?.bankrupt) && <div className="fd-scrim" />}
      <div key={menu}>{screen}</div>
    </div>
  );
}
