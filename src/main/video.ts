import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { handleTop } from "./ipc";

// The videos' narration, storage and export: the quarter shorts and the commercials. The voice is Kokoro-82M
// (Apache-2.0) run offline by sherpa-onnx's native addon; no language model
// and no network. scripts/fetch-voice.mjs puts the model in
// resources/voice/kokoro. Without it the video plays silent, on caption timing.

interface Audio {
  samples: Float32Array;
  sampleRate: number;
}
interface Tts {
  sampleRate: number;
  generateAsync(req: { text: string; sid: number; speed: number; enableExternalBuffer: boolean }): Promise<Audio>;
}

const MAX_LINES = 24;
const MAX_CHARS = 400;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
/** A poster still is a small JPEG. */
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
/**
 * The narrators, by name, as Kokoro v1.0's speaker ids: its best graded
 * English voices. Saves naming a voice since dropped move to the nearest
 * kept one (see main/store.ts).
 */
const NARRATORS: Record<string, number> = { heart: 3, bella: 2, emma: 21, michael: 16 };
/** A touch quicker than Kokoro's own pace, for a short. */
const SPEED = 1.08;
const COMPANY = /^[0-9a-f-]{36}$/i;
/** A quarter's short ("2016q3-v4") or a commercial ("ad-<id>-v1"). */
const QUARTER = /^\d{4}q[1-4](-v\d{1,3})?$/;
const AD = /^ad-[0-9a-f-]{36}-v\d{1,3}$/i;
/** Quarter shorts kept per company; older quarters' files go. */
const KEEP_SHORTS = 12;

/** Where a company's rendered shorts are kept, beside its save. */
export function shortsDir(company: string): string {
  return join(app.getPath("userData"), "companies", `${company}.shorts`);
}

function shortFile(company: unknown, quarter: unknown): { dir: string; file: string } {
  if (typeof company !== "string" || !COMPANY.test(company) || typeof quarter !== "string" || !(QUARTER.test(quarter) || AD.test(quarter)))
    throw new Error("video: bad short");
  const dir = shortsDir(company);
  return { dir, file: join(dir, `${quarter}.mp4`) };
}

function voiceDir(): string {
  return app.isPackaged ? join(process.resourcesPath, "voice") : join(app.getAppPath(), "resources", "voice");
}

let loading: Promise<Tts | null> | null = null;

/** The voice, loaded once on first use. Null when the model or the addon is missing. */
function voice(): Promise<Tts | null> {
  loading ??= (async () => {
    const dir = join(voiceDir(), "kokoro");
    // The full-precision model when it was fetched (yarn voice --fp32), else the int8 one.
    const model = [join(dir, "model.onnx"), join(dir, "model.int8.onnx")].find((m) => existsSync(m));
    if (!model) return null;
    try {
      type Sherpa = { OfflineTts: { createAsync(config: unknown): Promise<Tts> } };
      // A CommonJS module: its exports may only be on the default.
      const mod = (await import("sherpa-onnx-node")) as unknown as Sherpa & { default?: Sherpa };
      const sherpa = mod.default ?? mod;
      return await sherpa.OfflineTts.createAsync({
        model: {
          kokoro: {
            model,
            voices: join(dir, "voices.bin"),
            tokens: join(dir, "tokens.txt"),
            dataDir: join(dir, "espeak-ng-data"),
            lexicon: join(dir, "lexicon-us-en.txt"),
            lang: "en-us",
          },
          numThreads: 4,
          provider: "cpu",
          debug: 0,
        },
        maxNumSentences: 1,
      });
    } catch (e) {
      console.error("voice: could not load", e);
      return null;
    }
  })();
  return loading;
}

export function registerVideo(): void {
  /** One clip per line in the named narrator's voice, or null when there is no voice. */
  handleTop("video:say", async (_e, lines: unknown, narrator: unknown) => {
    if (!Array.isArray(lines) || lines.length > MAX_LINES || !lines.every((l) => typeof l === "string"))
      throw new Error("video:say: lines must be strings");
    const sid = typeof narrator === "string" && narrator in NARRATORS ? NARRATORS[narrator] : NARRATORS.michael;
    const tts = await voice();
    if (!tts) return null;
    const clips: Float32Array[] = [];
    // Electron's V8 refuses the addon's external buffers, so every clip is copied out.
    for (const text of lines as string[]) {
      const a = await tts.generateAsync({ text: text.slice(0, MAX_CHARS), sid, speed: SPEED, enableExternalBuffer: false });
      clips.push(a.samples);
    }
    return { sampleRate: tts.sampleRate, clips };
  });

  /** A short rendered before, or null. */
  handleTop("video:kept", async (_e, company: unknown, quarter: unknown) => {
    const { file } = shortFile(company, quarter);
    return readFile(file).then(
      (b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength),
      () => null,
    );
  });

  /** Keeps a rendered video for the company: a quarter's short or a commercial. Files of an older version go, and the oldest quarters' shorts past KEEP_SHORTS. */
  handleTop("video:keep", async (_e, company: unknown, quarter: unknown, bytes: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("video:keep: bad video");
    const { dir, file } = shortFile(company, quarter);
    await mkdir(dir, { recursive: true });
    await writeFile(file, bytes);
    const name = quarter as string;
    const version = name.match(/-v\d+$/)?.[0] ?? "";
    const ad = AD.test(name);
    const files = await readdir(dir);
    const base = (f: string) => f.replace(/\.(mp4|jpg)$/, "");
    for (const f of files) {
      const b = base(f);
      if ((ad ? AD.test(b) : QUARTER.test(b)) && !b.endsWith(version)) await rm(join(dir, f), { force: true });
    }
    if (!ad) {
      const shorts = [...new Set(files.map(base).filter((b) => QUARTER.test(b) && b.endsWith(version)))].sort().reverse();
      for (const old of shorts.slice(KEEP_SHORTS))
        for (const ext of [".mp4", ".jpg"]) await rm(join(dir, `${old}${ext}`), { force: true });
    }
  });

  /** Every video kept for the company, by file name without its extension, with when it was written. */
  handleTop("video:list", async (_e, company: unknown) => {
    if (typeof company !== "string" || !COMPANY.test(company)) throw new Error("video:list: bad company");
    const dir = shortsDir(company);
    const names = await readdir(dir).catch(() => [] as string[]);
    const out: { file: string; time: number }[] = [];
    for (const n of names) {
      if (!n.endsWith(".mp4")) continue;
      const file = n.slice(0, -4);
      if (!QUARTER.test(file) && !AD.test(file)) continue;
      const s = await stat(join(dir, n)).catch(() => null);
      if (s) out.push({ file, time: s.mtimeMs });
    }
    return out;
  });

  /** The narrators that can speak: every voice once the model is installed, none without it. */
  handleTop("video:voices", async () => ((await voice()) ? Object.keys(NARRATORS) : []));

  /** A short's poster still kept before, or null. */
  handleTop("video:poster", async (_e, company: unknown, quarter: unknown) => {
    const { file } = shortFile(company, quarter);
    return readFile(file.replace(/\.mp4$/, ".jpg")).then(
      (b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength),
      () => null,
    );
  });

  /** Keeps a short's poster still beside it. */
  handleTop("video:keepPoster", async (_e, company: unknown, quarter: unknown, bytes: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_POSTER_BYTES) throw new Error("video:keepPoster: bad poster");
    const { dir, file } = shortFile(company, quarter);
    await mkdir(dir, { recursive: true });
    await writeFile(file.replace(/\.mp4$/, ".jpg"), bytes);
  });

  /** Saves a rendered video where the player picks. True once written. */
  handleTop("video:save", async (e, bytes: unknown, name: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("video:save: bad video");
    const safe = typeof name === "string" ? name.replace(/[^\w\- ]+/g, "").trim().slice(0, 80) : "";
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = {
      defaultPath: join(app.getPath("videos"), `${safe || "laptop"}.mp4`),
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return false;
    await writeFile(r.filePath, bytes);
    return true;
  });
}
