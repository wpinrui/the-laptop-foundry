import { useCallback, useEffect, useState } from "react";
import type { SavedData, SavedModel } from "../../preload/store";
import { CompanySetup, Models, NameModel } from "./app/Models";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { buildBlock } from "./builder/problems";
import { emptyBuild } from "./builder/structure";
import { type Build, CONTENT, type Subject } from "./engine";
import { CafeScreen } from "./cafe/CafeScreen";
import { ReviewScreen } from "./review/ReviewScreen";

const store = () => window.api.store;

function inchesOf(b: Build): number | undefined {
  const id = b.parts.display?.[0]?.part;
  return CONTENT.panels.find((p) => p.id === id)?.inches;
}

function newId(): string {
  return crypto.randomUUID();
}

export function App() {
  const [data, setData] = useState<SavedData | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Subject | null>(null);
  const [using, setUsing] = useState<Subject | null>(null);
  // The build waiting for the player to name it before it becomes a model.
  const [naming, setNaming] = useState<Build | null>(null);

  useEffect(() => {
    store().load().then(setData);
  }, []);

  const save = useCallback(
    (m: SavedModel) => store().saveModel(m).then(setData),
    [],
  );

  if (!data) return null;
  if (!data.company)
    return (
      <CompanySetup
        onDone={(name) => store().setCompany(name).then(setData)}
      />
    );

  const company = data.company;
  // The first review locks the model, so its review never changes.
  const review = (m: SavedModel) => {
    if (!m.reviewed) {
      if (buildBlock(m.build)) return;
      const now = Date.now();
      save({ ...m, reviewed: now, updated: now });
    }
    setReviewing({ id: m.id, name: m.name, company, build: m.build as Build });
  };
  if (using)
    return (
      <CafeScreen
        key={using.id}
        subject={using}
        library={data.models
          .filter((x) => x.reviewed)
          .map((x) => ({ id: x.id, name: x.name, company, build: x.build as Build }))}
        onBack={() => setUsing(null)}
      />
    );
  if (reviewing)
    return (
      <ReviewScreen
        key={reviewing.id}
        subject={reviewing}
        onBack={() => setReviewing(null)}
      />
    );

  const duplicate = (id: string) => {
    const src = data.models.find((m) => m.id === id);
    if (src) setNaming(structuredClone(src.build) as Build);
  };
  if (naming)
    return (
      <NameModel
        roll={() => randomName(naming.year, inchesOf(naming))}
        onCancel={() => setNaming(null)}
        onCreate={(name) => {
          const now = Date.now();
          const m: SavedModel = {
            id: newId(),
            name,
            build: naming,
            created: now,
            updated: now,
          };
          save(m).then(() => {
            setNaming(null);
            setOpen(m.id);
          });
        }}
      />
    );

  const model = open ? data.models.find((m) => m.id === open) : undefined;
  if (model)
    return (
      <Builder
        key={model.id}
        model={model}
        onSave={save}
        onBack={() => setOpen(null)}
        onReview={review}
        onDuplicate={() => duplicate(model.id)}
        reroll={(b) => randomName(b.year, inchesOf(b))}
      />
    );

  return (
    <Models
      data={data}
      onCompany={(name) => store().setCompany(name).then(setData)}
      onNew={() => setNaming(emptyBuild())}
      onOpen={setOpen}
      onDuplicate={duplicate}
      onDelete={(id) => store().deleteModel(id).then(setData)}
      onReview={(id) => {
        const m = data.models.find((x) => x.id === id);
        if (m) review(m);
      }}
      onUse={(id) => {
        const m = data.models.find((x) => x.id === id);
        if (m && !buildBlock(m.build))
          setUsing({ id: m.id, name: m.name, company, build: m.build as Build });
      }}
    />
  );
}
