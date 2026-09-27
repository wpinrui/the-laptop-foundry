# Spike: narrated video of the quarter's best seller

GDD stretch goal: "A cinematic video review, narrated with non-language-model text-to-speech, with pre-animated camera variety." This spike builds a working end-to-end prototype and records what it would take to ship.

## What works

- **Where:** in a campaign, once a quarter has been played, a **Shorts** button sits next to **End quarter**. It plays a vertical (1080 by 1920) short about the last quarter's best-selling laptop, the player's or a rival's. The short is made in the background as soon as End quarter resolves; the button pulses until it is ready, then plays the finished file at once. When it ends, **Replay** and **Save** appear; **Save** writes the MP4 through a save dialog.
- **Best seller:** the sales step now records the quarter's top seller (`SalesRecord.top`, id and units). Before, rivals' sales were kept only per maker. Saves from before this fall back to the player's best-selling model.
- **Script** (`src/renderer/src/video/script.ts`): 8 to 9 lines from hand-written templates, picked per laptop and quarter by the game's seeded rng. Hook, units and share, price and parts, up to two pros, standout figures (weight, thickness, battery, refresh, noise, whichever stand out), the biggest con, the published review score and any awards, sign-off. Separate variants when the best seller is the player's own. Each line carries a caption, a spoken form (figures spelled for the voice, hyphens dropped from part names) and a shot. No em-dashes or middots anywhere. A headless run over six campaign quarters gave 85 to 94 words per script; the voiced video runs about 40 seconds.
- **Voice:** Piper's `en_US-norman-medium` (VITS, fp16 ONNX), run by `sherpa-onnx-node` in the main process, one clip per line over a top-frame-only IPC handler (`video:say`). Offline, no language model.
- **Video** (`src/renderer/src/video/VideoScreen.tsx`): the game's own `Model` on the menu stage's plinth, lights and fog. Seven shots, each cut to its line's audio: title push-in, hero orbit, keyboard close-up pan, ports (the side with more ports), screen push-in, lid from behind, slow turntable turn. Over it, drawn on a 2D canvas: title card, sales card (units, share bar), stats card, score ring with award badges, word-chunk captions and a progress bar. `src/renderer/src/video/render.tsx` renders it offline in a hidden canvas of its own React root: the timeline stepped at 30 fps, the 3D view at 720 by 1280 scaled up under full-size cards and captions, each frame encoded by WebCodecs (H.264 High, GPU encoder preferred; VP9 if there is no H.264), the narration mixed at 48 kHz and encoded to AAC (Opus fallback), muxed by `mp4-muxer` (MIT, about 69 KB unminified). A newer quarter cancels a render still running. Finished shorts stay in memory for the session and on disk beside the save (`companies/<id>.shorts/<year>q<n>.mp4`, only the latest quarter kept, removed with the company). Measured on this machine: about 1.9 times real time for a 40 s short (21 s of render, about 26 s from End quarter to ready with the voice), about 29 MB at 6 Mbit/s. Rendering the 3D view at full 1080 by 1920 ran at only 1.2 to 1.6 times real time, bound by the GPU. A reopened save plays its kept short in under half a second.
- **Verified headlessly:** `yarn build` succeeds. A hidden, muted Electron probe started the built main process and drove a fresh campaign through End quarter to Shorts. Captured frames show every card and shot (framing checked by eye). The video ran 48.8 s from click to Save, with about 6 s of voice loading and synthesis up front. Piper over IPC in the built app: first call 3.1 s for 20.5 s of speech (model load included), then about 0.1 s per short line. A canvas plus WebAudio recording gave `video/webm;codecs=vp9,opus` with an audio track.

## TTS comparison

Measured on this machine (i5-12600, 12 threads) with a 20 second test paragraph. RTF is synthesis time over audio length; lower is faster.

| Option | Quality | Size shipped | Load | Speed | Licence | Capturable into the recording |
|---|---|---|---|---|---|---|
| **Web Speech API** (`speechSynthesis`) | OS voices; SAPI-grade on Windows | 0 | n/a | n/a | OS | **No.** Audio goes straight to the OS mixer; no stream to record. In Electron 42 on this machine `getVoices()` returned **no voices at all** |
| **Piper VITS, native** (sherpa-onnx-node in main), fp32 | Natural, clear neural voice | 63.5 MB model + 23 MB runtime (win-x64) | 2.0 s | RTF 0.07 (4 threads) | Addon Apache-2.0; voice per model card, below | Yes: PCM comes back as Float32 |
| **Piper VITS, native, fp16** (chosen) | Same as fp32 by design, not A/B listened | **32.6 MB** model + 0.8 MB English espeak data + 23 MB runtime | 2.2 to 2.9 s | RTF 0.05 to 0.08 | as above | Yes |
| Piper VITS, native, int8 | Slight quantisation loss expected | 19.3 MB | 2.8 s | RTF 0.28 to 0.32 (int8 is slower on CPU here) | as above | Yes |
| Piper VITS in the renderer (onnxruntime-web, wasm) | Same voices | 14 to 28 MB wasm + model + an espeak-ng wasm phonemizer | 2.0 to 2.7 s | RTF 0.29 single thread, 0.13 at 4 threads (needs cross-origin isolation) | onnxruntime MIT, espeak-ng GPL-3.0 | Yes |
| Windows SAPI to WAV (`System.Speech` from main) | Robotic, older voices | 0 | fast | fast | OS | Yes (WAV file) but **Windows only**, not measured (PowerShell was off limits in this run) |
| Formant synth (eSpeak NG alone, meSpeak.js, SAM) | Robotic, retro | about 1 to 2 MB | instant | very fast | eSpeak NG GPL-3.0; SAM unclear | Yes |

The renderer wasm numbers time the network only, with fake phoneme ids of a realistic length; phonemizing is extra.

**Choice: Piper `norman` medium, fp16, native in main via sherpa-onnx-node.** It is the only offline option that sounds like a narrator, is capturable, and is fast enough to voice a 40 second script in about 6 seconds cold, model load included. Native beats wasm by about 2 to 6 times and needs no phonemizer build or cross-origin isolation. fp16 halves fp32's size at almost the same speed; int8 is smaller still but 4 times slower on this CPU. Web Speech is out: nothing to record, and no voices in Electron here.

Electron catch: V8's sandbox rejects the addon's external buffers ("External buffers are not allowed", "TTS settlement failed"). Passing `enableExternalBuffer: false` to `generate`/`generateAsync` fixes it.

### Piper English voices by licence

From each voice's `MODEL_CARD` on `rhasspy/piper-voices`. The dataset licence is what matters; the Piper code and model packaging are MIT.

| Safe to ship | Voices |
|---|---|
| Public domain | `en_US-norman`, `en_US-john`, `en_US-kristin`, `en_US-bryce`, `en_US-ljspeech`, `en_GB-cori` (Bryce Beattie; norman, kristin, cori and ljspeech trained from scratch, john fine-tuned from kristin) |
| CC0 | `en_US-joe`, `en_US-reza_ibrahim` |
| Apache-2.0 | `en_US-sam` |
| CC BY 4.0 (credit needed) | `en_US-libritts_r`, `en_GB-vctk`, `en_GB-alba`, `en_GB-aru` |
| CC BY-SA 4.0 (credit, and share-alike on the voice) | `en_GB-northern_english_male`, `en_GB-southern_english_female` |
| Attribution, custom | `en_GB-jenny_dioco` |

| Not safe | Why |
|---|---|
| `en_US-lessac` | Blizzard 2013 licence, non-commercial research |
| `en_US-ryan`, `en_US-hfc_male`, `en_US-hfc_female`, `en_GB-semaine` | CC BY-NC-SA 4.0 |
| `en_US-l2arctic` | CC BY-NC 4.0 |
| `en_US-amy`, `en_US-danny`, `en_US-kusal`, `en_GB-alan` | "See URL" (Mycroft mimic data); unclear, treat as unsafe |
| `en_US-arctic` | CMU Arctic licence, needs a read before use |

Many community Piper voices are fine-tuned from the lessac checkpoint, which may carry lessac's terms. Bryce Beattie's voices say they were trained from scratch. That is one reason the prototype uses `norman`.

## What ships in this PR

- **npm:** `sherpa-onnx-node` 1.13.8 (JS about 0.1 MB) plus its per-platform native package; on Windows `sherpa-onnx-win-x64` is 23 MB (onnxruntime 17.8 MB, sherpa C API 4.6 MB).
- **Voice model: not committed.** `scripts/fetch-voice.mjs` (`yarn voice`, also run before `yarn dev` and `yarn preview`) downloads sherpa-onnx's packaging of `norman` fp16 (a 36 MB archive) and keeps 33 MB: the 32.6 MB model, tokens, its model card, and 0.8 MB of English-only espeak-ng data, in `resources/voice/` (gitignored). `electron-builder.yml` copies it into packaged resources and unpacks the native addon from the asar.
- Without the voice the video still plays, silent, on caption timing.
- **Main and preload changed:** `src/main/video.ts` adds `video:say` and `video:save` through `handleTop`; the preload exposes `window.api.video`.

## What a production version needs

- **Voice decision:** commit a model (Git LFS or a release asset) or keep fetching at build time. Try `john` or `bryce` for a punchier read, and possibly two voices for variety.
- **Phonemizer licence:** sherpa-onnx statically links espeak-ng, which is **GPL-3.0**. That is fine for an open-source MIT game, since the combined work can be distributed under GPL terms, but it blocks a closed-source release. The alternative is a non-GPL grapheme-to-phoneme step (CMUdict lookup plus rules) feeding Piper's phoneme ids.
- **Script:** more templates per slot (5 to 8 each), a runner-up and gap-to-second line, quarter-over-quarter movement ("up from third"), segment wins, price-drop and value lines from the review's value verdict, a spoken-number normaliser (years, model numbers), and SSML-like pauses.
- **Camera:** shots aimed at real part positions from `fit` (port boxes, keyboard well, hinge) instead of proportions of the shell, easing between shots on some cuts, depth of field, the workshop room as a second set, and a check that no shot clips into the laptop on odd shapes.
- **Cards and captions:** the game's fonts and tokens, word-by-word highlight timed from phoneme durations (sherpa can return them), and a landscape 16:9 "review" variant.
- **Tests:** script templates (no dashes or middots, 30 to 60 s at a nominal rate), `bestSeller` fallbacks, the `SalesRecord.top` round trip.
- **Other platforms:** macOS and Linux native packages exist for sherpa-onnx-node but were not tried.

Rough size to production: 1.5 to 2.5 weeks. About 3 to 4 days on script variety and number normalising, 3 days on shots and cards, 2 to 3 days on the offline encoder, and 1 to 2 days on packaging, the voice pipeline and cross-platform checks.

## Risks

- espeak-ng's GPL-3.0 inside the native addon (see above).
- Native addon packaging: asar unpacking and per-platform binaries are untested in a packaged build here.
- Voice quality is judged from Piper's reputation and the model card. **Nobody listened to the output in this spike**; audio was never played through the speakers.
- 33 MB voice plus 23 MB runtime is about 56 MB more per platform in the installer.
