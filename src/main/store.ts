import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, ipcMain } from "electron";
import type { SavedData, SavedModel } from "../preload/store";

// The company and its models live in one JSON file in the user data folder.
// Writes go to a temporary file first and are renamed over the old one, one
// at a time, so a crash never leaves a half-written file.

const file = () => join(app.getPath("userData"), "foundry.json");
const EMPTY: SavedData = { version: 1, company: null, models: [] };

let data: SavedData | null = null;
let queue: Promise<void> = Promise.resolve();

async function load(): Promise<SavedData> {
  if (data) return data;
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as SavedData;
    data = {
      version: 1,
      company: typeof parsed.company === "string" ? parsed.company : null,
      models: Array.isArray(parsed.models) ? parsed.models : [],
    };
  } catch {
    data = { ...EMPTY, models: [] };
  }
  return data;
}

function persist(next: SavedData): Promise<void> {
  data = next;
  const text = JSON.stringify(next, null, 2);
  queue = queue.then(async () => {
    const tmp = `${file()}.${randomUUID()}.tmp`;
    await writeFile(tmp, text, "utf8");
    await rename(tmp, file());
  });
  return queue;
}

function isModel(m: unknown): m is SavedModel {
  const x = m as SavedModel;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.created === "number" &&
    typeof x.updated === "number"
  );
}

export function registerStore(): void {
  ipcMain.handle("store:load", () => load());
  ipcMain.handle("store:set-company", async (_e, name: unknown) => {
    if (typeof name !== "string") throw new Error("company name must be text");
    const d = await load();
    await persist({ ...d, company: name.trim() || null });
    return data;
  });
  ipcMain.handle("store:save-model", async (_e, model: unknown) => {
    if (!isModel(model)) throw new Error("not a model");
    const d = await load();
    const models = d.models.some((m) => m.id === model.id)
      ? d.models.map((m) => (m.id === model.id ? model : m))
      : [...d.models, model];
    await persist({ ...d, models });
    return data;
  });
  ipcMain.handle("store:delete-model", async (_e, id: unknown) => {
    if (typeof id !== "string") throw new Error("model id must be text");
    const d = await load();
    await persist({ ...d, models: d.models.filter((m) => m.id !== id) });
    return data;
  });
}
