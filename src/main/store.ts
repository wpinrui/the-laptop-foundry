import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { handleTop } from "./ipc";
import { shortsDir } from "./video";
import type { SavedCampaign, SavedCommercial, SavedCompany, SavedModel, SavedNote, SavedPlace, SavedScene, Settings } from "../preload/store";

// Each company is one save: one JSON file in the companies folder of the user
// data folder. Settings live in their own file. Writes go to a temporary file
// first and are renamed over the old one, one at a time, so a crash never
// leaves a half-written file.

const dir = () => join(app.getPath("userData"), "companies");
const fileOf = (id: string) => join(dir(), `${id}.json`);
/** A company's generated markets, kept apart so a campaign or model save does not rewrite them. */
const marketsOf = (id: string) => join(dir(), `${id}.markets.json`);
const settingsFile = () => join(app.getPath("userData"), "settings.json");
/** The single save used before companies became separate saves. */
const legacyFile = () => join(app.getPath("userData"), "foundry.json");

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NAME = 60;
/** A campaign starts from 2006 to 2025 and runs on with no end. */
const FIRST_START = 2006;
const LAST_START = 2025;

function isStart(y: unknown): y is number {
  return typeof y === "number" && Number.isInteger(y) && y >= FIRST_START && y <= LAST_START;
}

function isCash(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1e12;
}

/** A saved campaign, or undefined for a sandbox company. */
function readCampaign(raw: unknown): SavedCampaign | undefined {
  const x = raw as Partial<SavedCampaign> | null | undefined;
  if (!x || !isStart(x.start)) return undefined;
  const state = x.state;
  const base: SavedCampaign = isCash(x.cash) ? { start: x.start, cash: x.cash } : { start: x.start };
  return state && typeof state === "object" ? { ...base, state } : base;
}

let companies: Map<string, SavedCompany> | null = null;
let settings: Settings | null = null;
let queue: Promise<void> = Promise.resolve();

/** Companies whose markets are still inside their main file, from before markets had their own. */
const unsplit = new Set<string>();

function atomicWrite(path: string, value: unknown, pretty = true): Promise<void> {
  const text = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  // A failed write must not stop the ones queued after it.
  queue = queue.catch(() => {}).then(async () => {
    await mkdir(dir(), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, text, "utf8");
    await rename(tmp, path);
  });
  return queue;
}

function isNote(n: unknown): n is SavedNote {
  const x = n as SavedNote;
  return (
    !!x &&
    typeof x.name === "string" &&
    x.name.trim() !== "" &&
    typeof x.text === "string" &&
    typeof x.updated === "number"
  );
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

const RATIOS = ["9:16", "1:1", "16:9"];
const SETS = ["desk", "night", "bench", "park", "lounge", "beach", "den", "library", "train", "cabin", "cyclorama"];
const isSetOrNone = (x: unknown) => x === undefined || (typeof x === "string" && SETS.includes(x));
const MAX_LINES = 24;
const MAX_LINE = 400;
const MAX_SCENES = 200;

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100000;

/** The cards of the one-track timeline, before cards had their own track. */
const LEGACY_CARDS = ["title", "sales", "stats", "score"];

const isTrack = (t: unknown): t is SavedScene[] =>
  Array.isArray(t) &&
  t.length <= MAX_SCENES &&
  t.every((s) => !!s && typeof s.kind === "string" && isCount(s.startWord) && isCount(s.endWord) && s.endWord > s.startWord && isSetOrNone(s.set));

/** A commercial from before its timeline had two tracks, split onto them at the same words: its shots onto the angle track, its cards onto the card track. */
/** Narrators since dropped, to the nearest kept one: same voice and accent where one is kept. */
const VOICE_MOVED: Record<string, string> = {
  alloy: "heart", aoede: "heart", jessica: "heart", kore: "heart", nicole: "bella", nova: "heart", river: "heart", sarah: "heart", sky: "heart",
  adam: "michael", echo: "michael", eric: "michael", fenrir: "michael", liam: "michael", onyx: "michael", puck: "michael", santa: "michael",
  alice: "emma", isabella: "emma", lily: "emma",
  daniel: "michael", fable: "michael", george: "michael", lewis: "michael",
};

/** The retired sweep's papers, in its palette order, as the cyclorama's nearest. */
const SWEEP_PAPER = [3, 4, 6, 7, 4];
const unSweep = (s: unknown) => (s === "sweep" ? "cyclorama" : s);

/** A commercial filmed on the retired sweep, moved to the cyclorama with the nearest paper. */
function migrateSweep(c: unknown): unknown {
  const x = c as { set?: unknown; brollSet?: unknown; paper?: unknown; angles?: unknown; scenes?: unknown } | null;
  if (!x || typeof x !== "object") return c;
  const tracks = ["angles", "scenes"] as const;
  const onSweep = (t: unknown) => Array.isArray(t) && t.some((s) => !!s && (s as { set?: unknown }).set === "sweep");
  if (x.set !== "sweep" && x.brollSet !== "sweep" && !tracks.some((k) => onSweep(x[k]))) return c;
  const out: Record<string, unknown> = { ...x };
  if (x.set !== undefined) out.set = unSweep(x.set);
  if (x.brollSet !== undefined) out.brollSet = unSweep(x.brollSet);
  for (const k of tracks)
    if (Array.isArray(x[k])) out[k] = (x[k] as unknown[]).map((s) => (s && typeof s === "object" && "set" in s ? { ...s, set: unSweep((s as { set?: unknown }).set) } : s));
  if (isCount(x.paper)) out.paper = SWEEP_PAPER[x.paper % SWEEP_PAPER.length];
  return out;
}

function migrateCommercial(c: unknown): unknown {
  c = migrateSweep(c);
  const v = c as { voice?: unknown } | null;
  if (v && typeof v === "object" && typeof v.voice === "string" && VOICE_MOVED[v.voice]) c = { ...v, voice: VOICE_MOVED[v.voice] };
  const x = c as (Partial<SavedCommercial> & { scenes?: unknown }) | null;
  if (!x || typeof x !== "object" || x.angles !== undefined || !isTrack(x.scenes)) return c;
  const scenes = x.scenes as SavedScene[];
  const rest: Record<string, unknown> = { ...x };
  delete rest.scenes;
  return {
    ...rest,
    angles: scenes.filter((s) => !LEGACY_CARDS.includes(s.kind)),
    cards: scenes.filter((s) => LEGACY_CARDS.includes(s.kind)).map(({ kind, startWord, endWord }) => ({ kind, startWord, endWord })),
  };
}

function isCommercial(c: unknown): c is SavedCommercial {
  const x = c as SavedCommercial;
  return (
    !!x &&
    typeof x.id === "string" &&
    ID.test(x.id) &&
    typeof x.model === "string" &&
    Array.isArray(x.lines) &&
    x.lines.length <= MAX_LINES &&
    x.lines.every((l) => typeof l === "string" && l.length <= MAX_LINE) &&
    isTrack(x.angles) &&
    isTrack(x.cards) &&
    isSetOrNone(x.set) &&
    isSetOrNone(x.brollSet) &&
    (x.paper === undefined || isCount(x.paper)) &&
    RATIOS.includes(x.ratio) &&
    (x.voice === null || typeof x.voice === "string") &&
    typeof x.made === "number" &&
    typeof x.multiplier === "number" &&
    Number.isFinite(x.multiplier) &&
    x.multiplier > 0 &&
    x.multiplier <= 10
  );
}

const PLACES = ["map", "office", "workshop", "cafe", "courts", "studio"];
function readPlace(raw: unknown): SavedPlace | undefined {
  const x = raw as Partial<SavedPlace> | null | undefined;
  if (!x || typeof x.at !== "string" || !PLACES.includes(x.at)) return undefined;
  return typeof x.model === "string" ? { at: x.at, model: x.model } : { at: x.at };
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
    campaign: readCampaign(x.campaign),
    markets: x.markets && typeof x.markets === "object" && !Array.isArray(x.markets) ? x.markets : undefined,
    notes: Array.isArray(x.notes) ? x.notes.filter(isNote) : undefined,
    commercials: Array.isArray(x.commercials) ? x.commercials.map(migrateCommercial).filter(isCommercial) : undefined,
    place: readPlace(x.place),
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
      if (!c) continue;
      let markets: unknown;
      try {
        markets = JSON.parse(await readFile(marketsOf(id), "utf8"));
      } catch {}
      if (markets && typeof markets === "object" && !Array.isArray(markets))
        c.markets = { ...c.markets, ...(markets as Record<string, unknown>) };
      else if (c.markets) unsplit.add(id);
      found.set(id, c);
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

/** The company without its markets: what the renderer gets back after a save, so the markets are not copied each time. */
function lean(c: SavedCompany): SavedCompany {
  const { markets: _, ...rest } = c;
  return rest;
}

/** Saves the company. Its markets file is rewritten only when the markets changed. */
async function put(c: SavedCompany, markets = false): Promise<SavedCompany> {
  (await all()).set(c.id, c);
  if (markets || unsplit.has(c.id)) {
    // The markets land before the main file drops them, so a crash between the two loses nothing.
    const w = atomicWrite(marketsOf(c.id), c.markets ?? {}, false);
    unsplit.delete(c.id);
    await w;
  }
  await atomicWrite(fileOf(c.id), lean(c));
  return c;
}

async function loadSettings(): Promise<Settings> {
  if (settings) return settings;
  try {
    const x = JSON.parse(await readFile(settingsFile(), "utf8")) as Partial<Settings> & { sound?: boolean };
    const def = defaultSettings();
    // Older settings held only a sound switch: off becomes a silent master.
    settings = {
      master: x.sound === false ? 0 : (volume(x.master) ?? def.master),
      music: volume(x.music) ?? def.music,
      sfx: volume(x.sfx) ?? def.sfx,
    };
  } catch {
    settings = defaultSettings();
  }
  return settings;
}

const defaultSettings = (): Settings => ({ master: 0.8, music: 0.6, sfx: 0.8 });

function volume(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

export function registerStore(): void {
  handleTop("store:companies", async () => list(await all()).map(lean));
  handleTop("store:create-company", async (_e, name: unknown, start: unknown, cash: unknown) => {
    if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME)
      throw new Error("company name must be text");
    if (start !== null && start !== undefined && !isStart(start)) throw new Error("bad campaign start");
    if (cash !== null && cash !== undefined && !isCash(cash)) throw new Error("bad starting cash");
    const now = Date.now();
    const c: SavedCompany = { version: 1, id: randomUUID(), name: name.trim(), created: now, played: now, models: [] };
    return put(isStart(start) ? { ...c, campaign: isCash(cash) ? { start, cash } : { start } } : c);
  });
  handleTop("store:open-company", async (_e, id: unknown) => {
    const c = await company(id);
    return put({ ...c, played: Date.now() });
  });
  handleTop("store:delete-company", async (_e, id: unknown) => {
    const c = await company(id);
    const map = await all();
    map.delete(c.id);
    queue = queue
      .catch(() => {})
      .then(() => unlink(fileOf(c.id)).catch(() => {}))
      .then(() => unlink(marketsOf(c.id)).catch(() => {}))
      .then(() => rm(shortsDir(c.id), { recursive: true, force: true }).catch(() => {}));
    await queue;
    return list(map).map(lean);
  });
  handleTop("store:save-model", async (_e, id: unknown, model: unknown) => {
    if (!isModel(model)) throw new Error("not a model");
    const c = await company(id);
    // A reviewed model is locked: its build and name never change again.
    const lock = (m: SavedModel): SavedModel =>
      m.reviewed ? { ...model, name: m.name, build: m.build, reviewed: m.reviewed } : model;
    const models = c.models.some((m) => m.id === model.id)
      ? c.models.map((m) => (m.id === model.id ? lock(m) : m))
      : [...c.models, model];
    return lean(await put({ ...c, models, played: Date.now() }));
  });
  handleTop("store:save-campaign", async (_e, id: unknown, campaign: unknown) => {
    const c = await company(id);
    const next = readCampaign(campaign);
    // A sandbox never becomes a campaign, and a campaign keeps its start year.
    if (!c.campaign || !next || next.start !== c.campaign.start) throw new Error("bad campaign");
    // The starting cash is set once, when the company is made.
    const { cash: _, ...rest } = next;
    const kept = c.campaign.cash === undefined ? rest : { ...rest, cash: c.campaign.cash };
    return lean(await put({ ...c, campaign: kept, played: Date.now() }));
  });
  handleTop("store:save-market", async (_e, id: unknown, year: unknown, market: unknown) => {
    if (typeof year !== "number" || !Number.isInteger(year) || year < FIRST_START)
      throw new Error("bad market year");
    if (!market || typeof market !== "object") throw new Error("bad market");
    const c = await company(id);
    return lean(await put({ ...c, markets: { ...c.markets, [year]: market } }, true));
  });
  handleTop("store:save-place", async (_e, id: unknown, place: unknown) => {
    const p = readPlace(place);
    if (!p) throw new Error("bad place");
    const c = await company(id);
    return lean(await put({ ...c, place: p }));
  });
  /** Records a finished commercial. A laptop gets one, ever. */
  handleTop("store:save-commercial", async (_e, id: unknown, commercial: unknown) => {
    if (!isCommercial(commercial)) throw new Error("bad commercial");
    const c = await company(id);
    const had = c.commercials ?? [];
    if (had.some((x) => x.model === commercial.model || x.id === commercial.id)) throw new Error("that laptop has a commercial");
    return lean(await put({ ...c, commercials: [...had, commercial], played: Date.now() }));
  });
  handleTop("store:save-notes", async (_e, id: unknown, notes: unknown) => {
    if (!Array.isArray(notes) || !notes.every(isNote)) throw new Error("bad notes");
    const c = await company(id);
    return lean(await put({ ...c, notes }));
  });
  handleTop("store:delete-model",async (_e, id: unknown, modelId: unknown) => {
    if (typeof modelId !== "string") throw new Error("model id must be text");
    const c = await company(id);
    // Its commercial goes with it, the record and the video files.
    const gone = (c.commercials ?? []).filter((x) => x.model === modelId).map((x) => `ad-${x.id}-`);
    if (gone.length > 0) {
      const dir = shortsDir(c.id);
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const f of files) if (gone.some((g) => f.startsWith(g))) await rm(join(dir, f), { force: true });
    }
    const commercials = c.commercials?.filter((x) => x.model !== modelId);
    return lean(await put({ ...c, models: c.models.filter((m) => m.id !== modelId), ...(commercials ? { commercials } : {}), played: Date.now() }));
  });
  handleTop("store:settings", () => loadSettings());
  handleTop("store:set-settings", async (_e, next: unknown) => {
    const x = next as Partial<Settings> | null;
    const master = volume(x?.master);
    const music = volume(x?.music);
    const sfx = volume(x?.sfx);
    if (master === null || music === null || sfx === null) throw new Error("bad settings");
    settings = { master, music, sfx };
    await atomicWrite(settingsFile(), settings);
    return settings;
  });
  handleTop("app:quit", () => app.quit());
}
