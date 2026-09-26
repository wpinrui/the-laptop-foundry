import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { SavedCompany, SavedModel, Settings } from "../../preload/store";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { buildBlock } from "./builder/problems";
import { emptyBuild } from "./builder/structure";
import { CafeScreen } from "./cafe/CafeScreen";
import { type Build, CONTENT, type Subject } from "./engine";
import { LaptopList, sortedModels } from "./foundry/LaptopList";
import { LoadCompany, NameStep, NewCompany, SettingsMenu, StartMenu } from "./foundry/Menus";
import { Stage, type StageView } from "./foundry/Stage";
import { ReviewScreen } from "./review/ReviewScreen";

const store = () => window.api.store;

function inchesOf(b: Build): number | undefined {
  const id = b.parts.display?.[0]?.part;
  return CONTENT.panels.find((p) => p.id === id)?.inches;
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
    store().companies().then(setCompanies);
    store().settings().then(setSettings);
  }, []);

  const refresh = useCallback((c: SavedCompany) => {
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
  const staged = useMemo((): SavedModel | null => {
    if (menu === "list" || menu === "name")
      return company?.models.find((m) => m.id === selected) ?? null;
    if (menu === "load") return latestModel(companies?.find((c) => c.id === pickedSave));
    return latestModel(companies?.[0]);
  }, [menu, company, selected, companies, pickedSave]);

  if (!companies) return null;

  const name = company?.name ?? "";
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
  if (reviewing)
    return <ReviewScreen key={reviewing.id} subject={reviewing} onBack={() => setReviewing(null)} />;

  const duplicate = (id: string) => {
    const src = company?.models.find((m) => m.id === id);
    if (src) {
      setNaming(structuredClone(src.build) as Build);
      setMenu("name");
    }
  };

  const model = open ? company?.models.find((m) => m.id === open) : undefined;
  if (model)
    return (
      <Builder
        key={model.id}
        model={model}
        onSave={(m) => save(m)}
        onBack={() => setOpen(null)}
        onReview={review}
        onDuplicate={() => {
          setOpen(null);
          duplicate(model.id);
        }}
        reroll={(b) => randomName(b.year, inchesOf(b))}
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
        onStart={(n) =>
          store()
            .createCompany(n)
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
              setCompanies(all);
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
        selected={selected}
        onSelect={setSelected}
        onMenu={() => {
          setCompany(null);
          setMenu("start");
        }}
        onNew={() => {
          setNaming(emptyBuild());
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
        view={VIEWS[menu]}
      />
      {menu !== "list" && <div className="fd-scrim" />}
      <div key={menu}>{screen}</div>
    </div>
  );
}
