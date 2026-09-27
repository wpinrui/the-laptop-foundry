import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCompany, SavedModel, Settings } from "../../preload/store";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { buildBlock } from "./builder/problems";
import { emptyBuild, toYear } from "./builder/structure";
import { CafeScreen } from "./cafe/CafeScreen";
import { type Build, migrateBody, screenOf, type Subject } from "./engine";
import { campaignOf, resolveQuarter, savedCampaign } from "./engine/campaign";
import { LaptopList, sortedModels } from "./foundry/LaptopList";
import { LoadCompany, NameStep, NewCompany, SettingsMenu, StartMenu } from "./foundry/Menus";
import { Stage, type StageView } from "./foundry/Stage";
import { ReviewScreen } from "./review/ReviewScreen";

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

  useEffect(() => {
    store().companies().then((all) => setCompanies(all.map(migrated)));
    store().settings().then(setSettings);
  }, []);

  const refresh = useCallback((saved: SavedCompany) => {
    const c = migrated(saved);
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

  const enter = useCallback(
    (id: string) =>
      store()
        .openCompany(id)
        .then((c) => {
          refresh(c);
          setSelected(latestModel(c)?.id ?? null);
          setMenu("list");
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

  if (!companies) return null;

  const name = company?.name ?? "";
  const campaign = company?.campaign ? campaignOf(company.campaign) : null;
  const subject = (m: SavedModel): Subject => ({ id: m.id, name: m.name, company: name, build: m.build as Build });
  // The first review locks the model, so its review never changes.
  const review = (m: SavedModel) => {
    if (!m.reviewed) {
      if (buildBlock(m.build)) return;
      const now = Date.now();
      save({ ...m, reviewed: now, updated: now });
    }
    setReviewing(subject(m));
  };

  if (company && using)
    return (
      <CafeScreen
        key={using.id}
        subject={using}
        library={company.models.filter((x) => x.reviewed).map(subject)}
        onBack={() => setUsing(null)}
        sound={settings.sound}
        onSound={(sound) => store().setSettings({ ...settings, sound }).then(setSettings)}
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
        onEndQuarter={() => {
          // One quarter per click: a second click before the save lands would resolve the same quarter again.
          if (!campaign || ending.current) return;
          ending.current = true;
          const next = resolveQuarter(campaign, { models: company.models });
          store()
            .saveCampaign(company.id, savedCampaign(next))
            .then(refresh)
            .finally(() => {
              ending.current = false;
            });
        }}
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
          if (m && !buildBlock(m.build)) setUsing(subject(m));
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
            })
        }
      />
    );

  return (
    <div className="fd">
      <Stage
        build={staged ? (staged.build as Build) : null}
        stageKey={staged ? `${staged.id}:${staged.updated}` : "stock"}
        maker={stagedCompany?.name ?? ""}
        model={staged?.name ?? ""}
        view={VIEWS[menu]}
      />
      {menu !== "list" && <div className="fd-scrim" />}
      <div key={menu}>{screen}</div>
    </div>
  );
}
