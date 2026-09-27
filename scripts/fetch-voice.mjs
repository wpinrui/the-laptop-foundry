// Fetches the narration voice for the quarter video into resources/voice:
// Piper's en_US "norman" (medium, fp16 ONNX, about 32 MB), trained by Bryce
// Beattie from public domain LibriVox recordings, packed by sherpa-onnx with
// its espeak-ng phoneme data. Only the English phoneme data is kept. Skips
// when the voice is already there; the game plays the video silent without it.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "resources", "voice");
const NAME = "vits-piper-en_US-norman-medium-fp16";
const URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${NAME}.tar.bz2`;

if (existsSync(join(out, "en_US-norman-medium.onnx"))) process.exit(0);

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
  const data = join(out, "espeak-ng-data");
  mkdirSync(join(data, "lang", "gmw"), { recursive: true });
  for (const f of ["en_US-norman-medium.onnx", "tokens.txt", "MODEL_CARD"]) cpSync(join(src, f), join(out, f));
  for (const f of ["en_dict", "phondata", "phonindex", "phontab", "intonations", "phondata-manifest"])
    cpSync(join(src, "espeak-ng-data", f), join(data, f));
  for (const f of ["en", "en-US"]) cpSync(join(src, "espeak-ng-data", "lang", "gmw", f), join(data, "lang", "gmw", f));
  console.log(`[fetch-voice] voice in ${out}`);
} catch (e) {
  // Never fails the build: the video plays without narration.
  console.warn(`[fetch-voice] skipped: ${e instanceof Error ? e.message : e}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
