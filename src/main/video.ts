import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { handleTop } from "./ipc";

// The quarter video's narration and export. The voice is Piper's "norman"
// (VITS, public domain data) run offline by sherpa-onnx's native addon; no
// language model and no network. scripts/fetch-voice.mjs puts the model in
// resources/voice. Without it the video plays silent, on caption timing.

interface Audio {
  samples: Float32Array;
  sampleRate: number;
}
interface Tts {
  sampleRate: number;
  generateAsync(req: { text: string; sid: number; speed: number }): Promise<Audio>;
}

const MAX_LINES = 24;
const MAX_CHARS = 400;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

function voiceDir(): string {
  return app.isPackaged ? join(process.resourcesPath, "voice") : join(app.getAppPath(), "resources", "voice");
}

let loading: Promise<Tts | null> | null = null;

/** The voice, loaded once on first use. Null when the model or the addon is missing. */
function voice(): Promise<Tts | null> {
  loading ??= (async () => {
    const dir = voiceDir();
    const model = join(dir, "en_US-norman-medium.onnx");
    if (!existsSync(model)) return null;
    try {
      const sherpa = (await import("sherpa-onnx-node")) as unknown as {
        OfflineTts: { createAsync(config: unknown): Promise<Tts> };
      };
      return await sherpa.OfflineTts.createAsync({
        model: {
          vits: { model, tokens: join(dir, "tokens.txt"), dataDir: join(dir, "espeak-ng-data") },
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
  /** One clip per line, or null when there is no voice. */
  handleTop("video:say", async (_e, lines: unknown) => {
    if (!Array.isArray(lines) || lines.length > MAX_LINES || !lines.every((l) => typeof l === "string"))
      throw new Error("video:say: lines must be strings");
    const tts = await voice();
    if (!tts) return null;
    const clips: Float32Array[] = [];
    for (const text of lines as string[]) {
      const a = await tts.generateAsync({ text: text.slice(0, MAX_CHARS), sid: 0, speed: 1.05 });
      clips.push(a.samples);
    }
    return { sampleRate: tts.sampleRate, clips };
  });

  /** Saves a recorded video where the player picks. True once written. */
  handleTop("video:save", async (e, bytes: unknown, name: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("video:save: bad video");
    const safe = typeof name === "string" ? name.replace(/[^\w\- ]+/g, "").trim().slice(0, 80) : "";
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = {
      defaultPath: join(app.getPath("videos"), `${safe || "laptop"}.webm`),
      filters: [{ name: "WebM video", extensions: ["webm"] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return false;
    await writeFile(r.filePath, bytes);
    return true;
  });
}
