// Fetches the narration voice for the quarter video into resources/voice:
// Kokoro-82M v1.0 (Apache-2.0, hexgrad), packed for sherpa-onnx with its 54
// voices, its US English lexicon and espeak-ng's English phoneme data. Only
// what English narration needs is kept. The int8 model by default (about
// 109 MB, about 1.2 times real time here); `yarn voice --fp32` fetches the
// full-precision one instead (about 311 MB, about 3 times faster). Skips when
// a voice is already there; the game plays the video silent without it.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "resources", "voice");
const fp32 = process.argv.includes("--fp32");
const NAME = fp32 ? "kokoro-multi-lang-v1_0" : "kokoro-int8-multi-lang-v1_0";
const MODEL = fp32 ? "model.onnx" : "model.int8.onnx";
const URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${NAME}.tar.bz2`;

if (existsSync(join(out, "kokoro", MODEL))) process.exit(0);

const work = join(root, "temp", "voice-download");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
  console.log(`[fetch-voice] ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(join(work, "voice.tar.bz2"), Buffer.from(await res.arrayBuffer()));
  // Relative paths: GNU tar reads "C:" in an absolute Windows path as a remote host.
  execFileSync("tar", ["-xjf", "voice.tar.bz2"], { cwd: work, stdio: "inherit" });
  const src = join(work, NAME);
  // The voice before Kokoro, if an older checkout fetched it.
  if (existsSync(out)) for (const f of readdirSync(out)) if (f !== "kokoro") rmSync(join(out, f), { recursive: true, force: true });
  const dst = join(out, "kokoro");
  rmSync(dst, { recursive: true, force: true });
  const data = join(dst, "espeak-ng-data");
  mkdirSync(join(data, "lang", "gmw"), { recursive: true });
  for (const f of [MODEL, "voices.bin", "tokens.txt", "lexicon-us-en.txt", "LICENSE"]) cpSync(join(src, f), join(dst, f));
  for (const f of ["en_dict", "phondata", "phonindex", "phontab", "intonations", "phondata-manifest"])
    cpSync(join(src, "espeak-ng-data", f), join(data, f));
  for (const f of ["en", "en-US"]) cpSync(join(src, "espeak-ng-data", "lang", "gmw", f), join(data, "lang", "gmw", f));
  console.log(`[fetch-voice] voice in ${dst}`);
} catch (e) {
  // Never fails the build: the video plays without narration.
  console.warn(`[fetch-voice] skipped: ${e instanceof Error ? e.message : e}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
