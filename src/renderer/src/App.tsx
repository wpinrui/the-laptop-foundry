import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel, SavedNote, SavedPlace, Settings } from "../../preload/store";
import { campaignSaved, queueCampaignSave } from "./app/campaignSaves";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { buildBlock } from "./builder/problems";
import { emptyBuild, toYear } from "./builder/structure";
import { WorkshopPlace } from "./builder/WorkshopPlace";
import { CafeScreen } from "./cafe/CafeScreen";
import { WorldMap } from "./map/WorldMap";
import { StoreWorld } from "./storeworld/StoreWorld";
import { type Build, migrateBody, rivalsFor, screenOf, type Subject } from "./engine";
import { advanceClock, AWARD_NAMES, type CampaignState, campaignOf, DEFAULT_RUN, QUARTER_STEPS, type Quarter, quarterLabel, release, reorder, savedCampaign, setCampaign, setPrice } from "./engine/campaign";
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
import { adFacts, bestSeller, shortFacts, subjectOf, writeShort } from "./video/script";
import type { Commercial } from "./video/commercial";
import { adFile, adOfFile, loadVideo, offerShort, quarterOfFile, queueAd, useAdRender, usePosters, useVideos } from "./video/queue";
import { type PlayingVideo, VideoScreen } from "./video/VideoScreen";
import { adSubject, eligibleModels } from "./studio/eligible";
import { StudioPlace } from "./studio/StudioPlace";
import { overallOf } from "./foundry/LaptopList";
import { SystemActions, SystemMenu, useSystemMenu } from "./foundry/SystemMenu";
import { Office } from "./office/Office";
import { OFFICE_START, type OfficeAt } from "./office/stations";
import type { OfficeActions, TvVideo } from "./office/Panels";

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
 * its five places. The map opened from a place lies over it, the place still
 * there underneath, and closing the map goes back into it; null when it
 * opened from the menu. The workshop and the cafe hold the laptop brought
 * along, if any; a visit made from the Office goes back to the Office on Leave.
 */
type InPlace =
  | { at: "office" }
  | { at: "courts" }
  | { at: "studio" }
  | { at: "workshop" | "cafe"; model: SavedModel | null; subject: Subject | null; office?: boolean };
type Where = InPlace | { at: "map"; from: InPlace | null };

/** When this session began: a video finished after it is new. */
const SESSION_START = Date.now();

/** What a commercial's cards show, gathered when its render's turn comes; null once its laptop is gone. */
async function adFactsFor(c: SavedCompany, ad: Commercial) {
  const m = c.models.find((x) => x.id === ad.model);
  if (!m) return null;
  await ensureMarket((m.build as Build).year);
  const state = c.campaign ? campaignOf(c.campaign) : null;
  const score = state ? null : m.reviewed ? overallOf(m, c.name) : null;
  return adFacts(adSubject(m, c.name, state), state, score);
}

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
  // Arriving in a 3D place, by its key: the travel card shows over it until the place has loaded, then fades.
  const [arrival, setArrival] = useState<{ key: string | null; stage: "loading" | "here" | "done" }>({
    key: null,
    stage: "done",
  });
  // A place has loaded. Only the place on screen can call it: the one before has unmounted.
  const ready = useCallback(() => setArrival((a) => (a.stage === "loading" ? { ...a, stage: "here" } : a)), []);
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
  // A finished video full screen, and the one loaded for the Office TV.
  const [full, setFull] = useState<PlayingVideo | null>(null);
  const [tv, setTv] = useState<PlayingVideo | null>(null);
  // Videos watched this session: a new one is flagged at the Desk until then.
  const [watched, setWatched] = useState<Set<string>>(() => new Set());

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
          // Back where the company was left; the office when that is gone or unknown.
          const p = c.place;
          const m = p?.model ? (c.models.find((x) => x.id === p.model) ?? null) : null;
          if (p?.at === "map") setWhere({ at: "map", from: null });
          else if (p?.at === "courts") setWhere({ at: "courts" });
          else if (p?.at === "studio") setWhere({ at: "studio" });
          else if (p?.at === "workshop") setWhere({ at: "workshop", model: m, subject: null });
          else if (p?.at === "cafe" && m && !buildBlock(m.build)) {
            const s: Subject = { id: m.id, name: m.name, company: c.name, build: m.build as Build };
            setWhere({ at: "office" });
            void ensureMarket((m.build as Build).year).then(() => setWhere({ at: "cafe", model: m, subject: s }));
          } else setWhere({ at: "office" });
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

  // Each quarter's short is made in the background once it resolves; the queue takes the newest quarter still without one.
  const campaignState = company?.campaign;
  const best = useMemo(() => (campaignState ? bestSeller(campaignOf(campaignState)) : null), [campaignState]);
  const bestKey = company && best ? `${company.id}:${best.record.quarter.year}q${best.record.quarter.quarter}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: offered once per company and quarter
  useEffect(() => {
    if (!company?.campaign || !best) return;
    const c = company;
    const state = campaignOf(company.campaign);
    const y = best.record.quarter.year;
    offerShort(c.id, best.record.quarter, state.sales.length - 1, () =>
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
  }, [bestKey]);

  // Every finished commercial is queued for its render, in order; one already on disk is skipped.
  const adsKey = company ? `${company.id}:${company.commercials?.length ?? 0}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: queued when the company or its commercials change
  useEffect(() => {
    if (!company) return;
    const c = company;
    (c.commercials ?? []).forEach((ad, i) => queueAd(c.id, ad, () => adFactsFor(c, ad), i));
  }, [adsKey]);

  // The company's finished videos for the Office TV, newest first.
  const kept = useVideos(company?.id ?? null);
  const tvVideos = useMemo((): Omit<TvVideo, "poster">[] => {
    if (!company || !kept) return [];
    const state = company.campaign ? campaignOf(company.campaign) : null;
    const nameOf = (id: string) => company.models.find((m) => m.id === id)?.name ?? subjectOf(id, [])?.subject.name ?? "";
    const out: (Omit<TvVideo, "poster"> & { time: number })[] = [];
    for (const [file, time] of kept) {
      const q = quarterOfFile(file);
      if (q) {
        const r = state?.sales.find((x) => x.quarter.year === q.year && x.quarter.quarter === q.quarter);
        const top = r?.top?.id ?? (r ? Object.entries(r.units).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined);
        out.push({ file, label: quarterLabel(q), name: top ? nameOf(top) : "", time });
        continue;
      }
      const ad = company.commercials?.find((c) => c.id === adOfFile(file));
      if (ad) out.push({ file, label: "Commercial", name: nameOf(ad.model), time });
    }
    return out.sort((a, b) => b.time - a.time).map(({ time: _, ...v }) => v);
  }, [company, kept]);
  // Commercials not finished yet, for the TV to show as coming: the one rendering with its progress.
  const adRender = useAdRender(company?.id ?? null);
  const tvPending = useMemo(() => {
    if (!company || !kept) return [];
    return (company.commercials ?? [])
      .filter((c) => !kept.has(adFile(c.id)))
      .map((c) => ({
        file: adFile(c.id),
        name: company.models.find((m) => m.id === c.model)?.name ?? "",
        progress: adRender?.file === adFile(c.id) ? adRender.progress : null,
      }));
  }, [company, kept, adRender]);
  const posters = usePosters(company?.id ?? null, tvVideos.map((v) => v.file));
  const newest = tvVideos[0];
  const newestTime = newest ? (kept?.get(newest.file) ?? 0) : 0;

  // The studio needs the markets of the laptops it can film: their reviews compare them with their year.
  const studioModels = useMemo(
    () => (company ? eligibleModels(company, company.campaign ? campaignOf(company.campaign) : null) : []),
    [company],
  );
  // The place the player is in: under the map while the map is open over it.
  const here: Where = where.at === "map" && where.from ? where.from : where;
  const away = here !== where;
  const inStudio = here.at === "studio";
  // biome-ignore lint/correctness/useExhaustiveDependencies: on the way into the studio
  useEffect(() => {
    if (inStudio) for (const y of new Set(studioModels.map((m) => (m.build as Build).year))) void ensureMarket(y);
  }, [inStudio, companyId]);

  // Wherever the player goes, the company remembers it for the next time it opens.
  const placeSaved = useRef("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: saved when the place changes, not the company's contents
  useEffect(() => {
    if (!company) return;
    // The map over a place is no place of its own: the place underneath is saved.
    const p: SavedPlace = open
      ? { at: "workshop", model: open }
      : here.at === "map" || here.at === "office" || here.at === "courts" || here.at === "studio"
        ? { at: here.at }
        : here.model
          ? { at: here.at, model: here.model.id }
          : { at: here.at };
    const key = `${company.id}:${p.at}:${p.model ?? ""}`;
    const had = company.place ? `${company.id}:${company.place.at}:${company.place.model ?? ""}` : "";
    if (key === placeSaved.current || (!placeSaved.current && key === had)) return;
    placeSaved.current = key;
    void store().savePlace(company.id, p);
  }, [company?.id, where, open]);

  if (!companies) return null;

  // The 3D place on screen, as the view below picks it; a new key is a fresh arrival. Null for 2D screens.
  const run = company?.campaign ? campaignOf(company.campaign) : null;
  const placeKey = ((): string | null => {
    if (!company) return null;
    // A review or a video over the place is no trip: closing it is no arrival.
    if (full || reviewing) return arrival.key;
    // The map over a place is no trip either: the place is still there, and only Go to another place is one.
    if (here.at === "cafe") return `cafe:${here.model?.id ?? ""}`;
    if (here.at === "courts") return "courts";
    if (here.at === "studio") return "studio";
    if (here.at === "map") return null;
    // The workshop and its builder are one place: going between them is no arrival.
    if (here.at === "workshop") return "workshop";
    if (here.at === "office" && menu === "list" && !(run?.over && run.bankrupt)) return "office";
    return null;
  })();
  if (placeKey !== arrival.key) setArrival({ key: placeKey, stage: placeKey ? "loading" : "done" });
  const loading = arrival.stage === "loading";


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
  // Loads a finished video for the TV, in place of the one before.
  const playOnTv = (file: string) => {
    if (!company) return;
    const id = company.id;
    const v = tvVideos.find((x) => x.file === file);
    setWatched((w) => new Set(w).add(file));
    if (!v) return;
    // Watching plays full screen, over the place; the TV shows it too.
    if (tv?.file === file) {
      setFull(tv);
      return;
    }
    void loadVideo(id, file).then((blob) => {
      if (!blob) return;
      const next = { file, url: URL.createObjectURL(blob), blob, name: `${name} ${v.name} ${v.label}`.trim(), label: v.label, model: v.name };
      setTv((was) => {
        if (was && was !== full) URL.revokeObjectURL(was.url);
        return next;
      });
      setFull(next);
    });
  };
  // A finished commercial: recorded with the company, its wheel result on the laptop's next quarter, its render queued.
  const finishAd = (c: Commercial, facts: ReturnType<typeof adFacts>) => {
    if (!company) return;
    const id = company.id;
    void store().saveCommercial(id, c).then(refresh);
    if (campaign)
      commit((s) => ({ ...s, boosts: { ...s.boosts, [c.model]: c.multiplier }, advertised: [...s.advertised, c.model] }));
    queueAd(id, c, () => Promise.resolve(facts), company.commercials?.length ?? 0);
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

  // The world map over a place, the place paused underneath it as it was, the builder too; closing the map goes back into it.
  const toMap = (from: InPlace) => setWhere({ at: "map", from });
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
  // Deleting a model, from the office or the workshop: its line ends and its stock is written off.
  const removeModel = (id: string) => {
    if (!company) return;
    void store()
      .deleteModel(company.id, id)
      .then((c) => {
        refresh(c);
        setOfficeAt((a) => ({ ...a, model: null }));
        commit((s) => {
          if (!s.releases[id]) return null;
          const { [id]: _, ...releases } = s.releases;
          return { ...s, releases };
        });
      });
  };
  const newModel = () => setNaming(campaign ? toYear(emptyBuild(), campaign.now.year) : emptyBuild());
  // From the Office or the store a new model, or a copy, goes to the workshop, the travel card up until the room is in.
  const toWorkshop = (m: SavedModel | null, office = true) => {
    setWhere({ at: "workshop", model: m, subject: null, office });
  };
  // The builder on a laptop: on the workshop's turntable, wherever the player was.
  const build = (m: SavedModel) => {
    setWhere((w) => (w.at === "workshop" ? { ...w, model: m } : { at: "workshop", model: m, subject: null, office: w.at === "office" }));
    setOpen(m.id);
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
          if (here.at === "courts") {
            toWorkshop(m, false);
            return;
          }
          build(m);
        });
      }}
    />
  );

  // The world map: over the place it opened from, or on its own when it opened from the menu.
  const map = company && where.at === "map" && (
    <WorldMap
      key={where.from?.at ?? "menu"}
      company={company}
      from={where.from?.at ?? "menu"}
      studio={studioModels.length > 0}
      onGo={(to, m) => {
        // Going is the trip: the place under the map, the builder too, is left for the next.
        setOpen(null);
        if (to === "office") {
          setOfficeAt(OFFICE_START);
          setWhere({ at: "office" });
        }
        else if (to === "courts") setWhere({ at: "courts" });
        else if (to === "studio") setWhere({ at: "studio" });
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

  if (map && !away) return map;
  // Each place keeps the same shape with the map over it or not, so opening the map never remounts the place.
  if (company && here.at === "studio")
    return (
      <>
        <StudioPlace
          company={company}
          campaign={campaign}
          models={studioModels}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          onMap={() => toMap({ at: "studio" })}
          onReady={ready}
          onFinish={finishAd}
          away={away}
        />
        {map}
      </>
    );
  if (company && here.at === "cafe")
    return (
      <>
        <CafeScreen
          key={here.model?.id ?? "empty"}
          subject={here.subject}
          library={company.models.filter((x) => x.reviewed).map(subject)}
          onMap={() => toMap(here)}
          atDoor
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          notes={company.notes ?? []}
          onSaveNotes={saveNotes}
          shop={campaign ? { state: campaign, models: company.models, company: company.name } : undefined}
          onReady={ready}
          away={away}
        />
        {map}
      </>
    );
  if (company && here.at === "courts")
    return (
      <>
        <StoreWorld
          company={company}
          onMap={() => toMap(here)}
          onClone={campaign?.over ? undefined : (item) => nameCopy(item.build)}
          onReady={ready}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          away={away}
        />
        {nameCard}
        {map}
      </>
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

  // The workshop: free roam round the turntable's laptop, and the builder on it in the same scene.
  if (company && here.at === "workshop") {
    const at = here;
    // As saved now: it may have changed in the builder since it was brought along.
    const onTable = at.model && (company.models.find((x) => x.id === at.model?.id) ?? null);
    return (
      <>
        <WorkshopPlace
          model={onTable}
          models={company.models}
          company={company.name}
          shop={campaign ? { state: campaign, models: company.models, company: company.name } : undefined}
          library={company.models.filter((x) => x.reviewed).map(subject)}
          onMap={() => toMap(at)}
          onReady={ready}
          held={!!naming || away}
          building={!!onTable && open === onTable.id}
          onTable={(m) => setWhere({ ...at, model: m })}
          onBuild={build}
          onLeaveBuild={() => setOpen(null)}
          onNew={campaign?.over ? undefined : newModel}
          onDuplicate={campaign?.over ? undefined : duplicate}
          onDelete={removeModel}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          builder={(canvas, exit) =>
            onTable && (
              <Builder
                key={onTable.id}
                canvas={canvas}
                model={onTable}
                company={name}
                onSave={(m) => save(m)}
                onExit={exit}
                onReview={review}
                onDuplicate={() => duplicate(onTable.id)}
                yearLocked={!!campaign}
                released={!!campaign?.releases[onTable.id]}
                reroll={(b) => randomName(b.year, inchesOf(b))}
                // What a stage can load from: every saved laptop, newest first.
                sources={sortedModels(company)}
              />
            )
          }
        />
        {!loading && nameCard}
        {map}
      </>
    );
  }

  // The Office: the 3D room, its stations' panels and the quarter report over it. Leaving it opens the map over it.
  const leaveOffice = () => {
    // Free roam's pointer goes free under the map, as under the system menu.
    if (document.pointerLockElement) document.exitPointerLock();
    toMap({ at: "office" });
  };
  const find = (id: string) => company?.models.find((x) => x.id === id);
  if (company && here.at === "office" && menu === "list" && !(campaign?.over && campaign.bankrupt)) {
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
      onOpen: (id) => {
        const m = find(id);
        if (m) build(m);
      },
      onDuplicate: (id) => {
        const src = duplicate(id);
        if (src) toWorkshop(src);
      },
      onDelete: removeModel,
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
      tv: {
        videos: tvVideos.map((v) => ({ ...v, poster: posters[v.file] })),
        pending: tvPending,
        playing: tv?.file ?? null,
        url: tv?.url,
        fresh: newest && newestTime > SESSION_START && !watched.has(newest.file) ? newest.name || newest.label : undefined,
        onPlay: playOnTv,
        onFull: () => tv && setFull(tv),
      },
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
          blocked={!!marketView || !!statement || system || away || !!full}
          actions={actions}
          library={company.models.filter((x) => x.reviewed).map(subject)}
          sound={settings.sound}
          onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
          onSystem={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            setSystem(true);
          }}
          onReady={ready}
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
        {map}
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
    setFull(null);
    setTv(null);
    setOpen(null);
    setReviewing(null);
    setCompany(null);
    if (to === "load") setPickedSave(companies[0]?.id ?? null);
    setMenu(to);
  };
  return (
    <SystemActions.Provider value={company ? { onNew: () => leaveCompany("new"), onLoad: () => leaveCompany("load") } : null}>
      {view}
      {/* A video full screen, over the place: closing it is straight back, nothing reloaded. */}
      {full && <VideoScreen key={full.url} video={full} onBack={() => setFull(null)} />}
      {arrival.key && arrival.stage !== "done" && (
        <Travel
          key={arrival.key}
          to={placeName(arrival.key)}
          here={arrival.stage === "here"}
          onDone={() => setArrival((a) => ({ ...a, stage: "done" }))}
        />
      )}
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
                  setWhere({ at: "map", from: where });
                }
          }
        />
      )}
    </SystemActions.Provider>
  );
}

/** What the travel card calls a place, by its arrival key. The builder is in the workshop. */
function placeName(key: string): string {
  const at = key.split(":")[0];
  if (at === "builder") return "the workshop";
  if (at === "courts") return "Courts";
  return `the ${at}`;
}

/** However long a place takes, the travel card lifts after this: a missed ready signal never leaves it up. */
const TRAVEL_MAX_MS = 15000;

/** A full-screen card naming where the player is headed, faded out once the place underneath is `here`. */
function Travel({ to, here, onDone }: { to: string; here: boolean; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), TRAVEL_MAX_MS);
    return () => clearTimeout(t);
  }, []);
  const out = here || late;
  useEffect(() => {
    if (!out) return;
    const end = setTimeout(() => done.current(), 400);
    return () => clearTimeout(end);
  }, [out]);
  return (
    <div className={`fd fd-travel${out ? " out" : ""}`}>
      <b>Going to {to}</b>
    </div>
  );
}
