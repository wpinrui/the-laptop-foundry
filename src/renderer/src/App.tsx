import { useCallback, useEffect, useState } from "react";
import type { SavedData, SavedModel } from "../../preload/store";
import { CompanySetup, Models } from "./app/Models";
import { randomName } from "./app/names";
import { Builder } from "./builder/Builder";
import { emptyBuild } from "./builder/structure";
import { type Build, CONTENT } from "./engine";

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

  const model = open ? data.models.find((m) => m.id === open) : undefined;
  if (model)
    return (
      <Builder
        key={model.id}
        model={model}
        onSave={save}
        onBack={() => setOpen(null)}
        reroll={(b) => randomName(b.year, inchesOf(b))}
      />
    );

  const create = (build: Build, revisedFrom?: string) => {
    const now = Date.now();
    const m: SavedModel = {
      id: newId(),
      name: randomName(build.year, inchesOf(build)),
      build,
      created: now,
      updated: now,
      revisedFrom,
    };
    save(m).then(() => setOpen(m.id));
  };

  return (
    <Models
      data={data}
      onCompany={(name) => store().setCompany(name).then(setData)}
      onNew={() => create(emptyBuild())}
      onOpen={setOpen}
      onRevise={(id) => {
        const src = data.models.find((m) => m.id === id);
        if (src) create(structuredClone(src.build) as Build, src.id);
      }}
      onDelete={(id) => store().deleteModel(id).then(setData)}
    />
  );
}
