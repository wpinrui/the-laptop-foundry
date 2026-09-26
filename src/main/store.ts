import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, ipcMain } from "electron";
import type { SavedCompany, SavedModel, Settings } from "../preload/store";

// Each company is one save: one JSON file in the companies folder of the user
// data folder. Settings live in their own file. Writes go to a temporary file
// first and are renamed over the old one, one at a time, so a crash never
// leaves a half-written file.

const dir = () => join(app.getPath("userData"), "companies");
const fileOf = (id: string) => join(dir(), `${id}.json`);
const settingsFile = () => join(app.getPath("userData"), "settings.json");
/** The single save used before companies became separate saves. */
const legacyFile = () => join(app.getPath("userData"), "foundry.json");

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NAME = 60;

let companies: Map<string, SavedCompany> | null = null;
let settings: Settings | null = null;
let queue: Promise<void> = Promise.resolve();

function atomicWrite(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2);
  // A failed write must not stop the ones queued after it.
  queue = queue.catch(() => {}).then(async () => {
    await mkdir(dir(), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, text, "utf8");
    await rename(tmp, path);
  });
  return queue;
}

function isModel(m: unknown): m is SavedModel {
  const x = m as SavedModel;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    x.name.trim() !== "" &&
    typeof x.created === "number" &&
    typeof x.updated === "number"
  );
}

function readCompany(raw: unknown, id: string): SavedCompany | null {
  const x = raw as Partial<SavedCompany> | null;
  if (!x || typeof x.name !== "string" || !x.name.trim()) return null;
  const now = Date.now();
  return {
    version: 1,
    id,
    name: x.name.trim(),
    created: typeof x.created === "number" ? x.created : now,
    played: typeof x.played === "number" ? x.played : now,
    models: Array.isArray(x.models) ? x.models.filter(isModel) : [],
  };
}

/** Turns the old single save into one company save, once, keeping the old file as a backup. */
async function migrate(into: Map<string, SavedCompany>): Promise<void> {
  let parsed: { company?: unknown; models?: unknown };
  try {
    parsed = JSON.parse(await readFile(legacyFile(), "utf8"));
  } catch {
    return;
  }
  const models = Array.isArray(parsed.models) ? parsed.models.filter(isModel) : [];
  const name = typeof parsed.company === "string" ? parsed.company.trim() : "";
  if (name || models.length > 0) {
    const latest = Math.max(0, ...models.map((m) => m.updated));
    const c: SavedCompany = {
      version: 1,
      id: randomUUID(),
      // A save always has a name; the old file could hold models without one.
      name: name || "Foundry",
      created: Math.min(Date.now(), ...models.map((m) => m.created)),
      played: latest || Date.now(),
      models,
    };
    await atomicWrite(fileOf(c.id), c);
    into.set(c.id, c);
  }
  await queue;
  await rename(legacyFile(), `${legacyFile()}.migrated`);
}

let loading: Promise<Map<string, SavedCompany>> | null = null;

/** Every save, read from disk once. Concurrent first calls share one read, so the migration runs once. */
function all(): Promise<Map<string, SavedCompany>> {
  if (companies) return Promise.resolve(companies);
  loading ??= readAll().finally(() => {
    loading = null;
  });
  return loading;
}

async function readAll(): Promise<Map<string, SavedCompany>> {
  const found = new Map<string, SavedCompany>();
  let names: string[] = [];
  try {
    names = await readdir(dir());
  } catch {}
  for (const n of names) {
    const id = n.replace(/\.json$/, "");
    if (!n.endsWith(".json") || !ID.test(id)) continue;
    try {
      const c = readCompany(JSON.parse(await readFile(fileOf(id), "utf8")), id);
      if (c) found.set(id, c);
    } catch {}
  }
  await migrate(found);
  companies = found;
  return found;
}

function list(map: Map<string, SavedCompany>): SavedCompany[] {
  return [...map.values()].sort((a, b) => b.played - a.played);
}

async function company(id: unknown): Promise<SavedCompany> {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("bad company id");
  const c = (await all()).get(id);
  if (!c) throw new Error("no such company");
  return c;
}

async function put(c: SavedCompany): Promise<SavedCompany> {
  (await all()).set(c.id, c);
  await atomicWrite(fileOf(c.id), c);
  return c;
}

async function loadSettings(): Promise<Settings> {
  if (settings) return settings;
  try {
    const x = JSON.parse(await readFile(settingsFile(), "utf8")) as Partial<Settings>;
    settings = { sound: typeof x.sound === "boolean" ? x.sound : true };
  } catch {
    settings = { sound: true };
  }
  return settings;
}

export function registerStore(): void {
  ipcMain.handle("store:companies", async () => list(await all()));
  ipcMain.handle("store:create-company", async (_e, name: unknown) => {
    if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME)
      throw new Error("company name must be text");
    const now = Date.now();
    return put({ version: 1, id: randomUUID(), name: name.trim(), created: now, played: now, models: [] });
  });
  ipcMain.handle("store:open-company", async (_e, id: unknown) => {
    const c = await company(id);
    return put({ ...c, played: Date.now() });
  });
  ipcMain.handle("store:delete-company", async (_e, id: unknown) => {
    const c = await company(id);
    const map = await all();
    map.delete(c.id);
    queue = queue.catch(() => {}).then(() => unlink(fileOf(c.id)).catch(() => {}));
    await queue;
    return list(map);
  });
  ipcMain.handle("store:save-model", async (_e, id: unknown, model: unknown) => {
    if (!isModel(model)) throw new Error("not a model");
    const c = await company(id);
    // A reviewed model is locked: its build and name never change again.
    const lock = (m: SavedModel): SavedModel =>
      m.reviewed ? { ...model, name: m.name, build: m.build, reviewed: m.reviewed } : model;
    const models = c.models.some((m) => m.id === model.id)
      ? c.models.map((m) => (m.id === model.id ? lock(m) : m))
      : [...c.models, model];
    return put({ ...c, models, played: Date.now() });
  });
  ipcMain.handle("store:delete-model", async (_e, id: unknown, modelId: unknown) => {
    if (typeof modelId !== "string") throw new Error("model id must be text");
    const c = await company(id);
    return put({ ...c, models: c.models.filter((m) => m.id !== modelId), played: Date.now() });
  });
  ipcMain.handle("store:settings", () => loadSettings());
  ipcMain.handle("store:set-settings", async (_e, next: unknown) => {
    const x = next as Partial<Settings> | null;
    if (!x || typeof x.sound !== "boolean") throw new Error("bad settings");
    settings = { sound: x.sound };
    await atomicWrite(settingsFile(), settings);
    return settings;
  });
  ipcMain.handle("app:quit", () => app.quit());
}
