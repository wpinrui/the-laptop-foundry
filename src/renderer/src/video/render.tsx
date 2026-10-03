import { Canvas, type RootState, useThree } from "@react-three/fiber";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createRoot } from "react-dom/client";
import { type Fit, solve } from "../engine";
import { drawOverlay, type Frame, looksOf, type Program, SILENT_WPS, type StageControl, type Timeline, timelineOf, VideoStage } from "./scene";
import { preloadSets } from "./sets";

// A video, rendered offline: the scene is stepped at a fixed frame rate in a
// hidden canvas of its own, each frame composited with its overlay and handed
// to WebCodecs, the narration mixed and encoded beside it, and both muxed into
// one MP4. Nothing waits on a wall clock, so it runs as fast as the machine
// renders and never drops a frame.

export const FPS = 30;
/**
 * The 3D view renders at two thirds of the file's size and is scaled up under
 * the full-size cards and captions: about twice as fast as rendering it at
 * full size on the GPU, with the text still sharp.
 */
const GL_SCALE = 2 / 3;
const VIDEO_BITRATE = 6_000_000;
const AUDIO_RATE = 48_000;
const AUDIO_BITRATE = 96_000;
/** Frames the encoder may hold before the renderer waits for it. */
const QUEUE = 6;
/** Longest wait for the laptop's lock screen before rendering without it, ms. */
const LOCK_WAIT = 5000;

export interface Voice {
  sampleRate: number;
  clips: Float32Array[];
}

export class Cancelled extends Error {}

const VIDEO_CODECS = [
  { codec: "avc1.640032", mux: "avc" },
  { codec: "vp09.00.40.08", mux: "vp9" },
] as const;
const AUDIO_CODECS = [
  { codec: "mp4a.40.2", mux: "aac" },
  { codec: "opus", mux: "opus" },
] as const;

/** H.264 for phone galleries, on the GPU's encoder where there is one; VP9 where there is no H.264. */
async function pickVideo(f: Frame): Promise<{ mux: (typeof VIDEO_CODECS)[number]["mux"]; config: VideoEncoderConfig }> {
  for (const c of VIDEO_CODECS)
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
      const config: VideoEncoderConfig = {
        codec: c.codec,
        width: f.w,
        height: f.h,
        bitrate: VIDEO_BITRATE,
        framerate: FPS,
        latencyMode: "quality",
        hardwareAcceleration,
      };
      if ((await VideoEncoder.isConfigSupported(config)).supported) return { mux: c.mux, config };
    }
  throw new Error("no video encoder");
}

async function pickAudio(): Promise<(typeof AUDIO_CODECS)[number] | null> {
  for (const c of AUDIO_CODECS) {
    const s = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: AUDIO_RATE, numberOfChannels: 1, bitrate: AUDIO_BITRATE });
    if (s.supported) return c;
  }
  return null;
}

/** Gives the page a turn between frames, so the game stays responsive while the video renders. */
function yieldTask(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((r) => setTimeout(r, 0));
}

/** The narration as one track: each line's clip at its start, resampled to the encoder's rate. */
async function mixdown(voice: Voice, p: Program): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(p.total * AUDIO_RATE), AUDIO_RATE);
  voice.clips.forEach((c, i) => {
    const b = ctx.createBuffer(1, Math.max(1, c.length), voice.sampleRate);
    b.copyToChannel(new Float32Array(c), 0);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(p.captions[i]?.start ?? 0);
  });
  return (await ctx.startRendering()).getChannelData(0);
}

async function encodeAudio(pcm: Float32Array, codec: string, muxer: Muxer<ArrayBufferTarget>): Promise<void> {
  let failed: unknown = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      failed = e;
    },
  });
  enc.configure({ codec, sampleRate: AUDIO_RATE, numberOfChannels: 1, bitrate: AUDIO_BITRATE });
  const step = 4800;
  for (let at = 0; at < pcm.length; at += step) {
    const data = pcm.slice(at, Math.min(pcm.length, at + step));
    const a = new AudioData({
      format: "f32-planar",
      sampleRate: AUDIO_RATE,
      numberOfChannels: 1,
      numberOfFrames: data.length,
      timestamp: Math.round((at * 1e6) / AUDIO_RATE),
      data,
    });
    enc.encode(a);
    a.close();
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
}

interface Job {
  program: Program;
  voice: Voice | null;
  cancelled: () => boolean;
  /** How far through the frames, 0 to 1. */
  onProgress: (p: number) => void;
}

/** A rendered video: the MP4 and a small still of the laptop from it. */
export interface Rendered {
  video: Blob;
  /** A JPEG of the hero shot without captions, or null when it could not be taken. */
  poster: Blob | null;
}

/** The poster's longer side in pixels; the shorter follows the video's shape. */
const POSTER_LONG = 320;

/** Steps the scene through every frame, encodes it with the narration and returns the MP4 and its poster. */
async function encode(job: Job, state: RootState, time: { current: number }, stage: StageControl): Promise<Rendered> {
  const { program, voice, cancelled, onProgress } = job;
  const { w: W, h: H } = program.frame;
  const k = POSTER_LONG / Math.max(W, H);
  const posterW = Math.round(W * k);
  const posterH = Math.round(H * k);
  const began = performance.now();
  const vc = await pickVideo(program.frame);
  const ac = voice ? await pickAudio() : null;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vc.mux, width: W, height: H, frameRate: FPS },
    audio: ac ? { codec: ac.mux, numberOfChannels: 1, sampleRate: AUDIO_RATE } : undefined,
    fastStart: "in-memory",
  });
  if (voice && ac) await encodeAudio(await mixdown(voice, program), ac.codec, muxer);

  let failed: unknown = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failed = e;
    },
  });
  enc.configure(vc.config);
  const frame = new OffscreenCanvas(W, H);
  const g = frame.getContext("2d");
  if (!g) throw new Error("no 2d context");
  const gl = state.gl.domElement;
  const frames = Math.ceil(program.total * FPS);
  const still = Math.min(frames - 1, Math.floor(program.poster * FPS));
  let poster: Promise<Blob | null> = Promise.resolve(null);
  try {
    for (let f = 0; f < frames; f++) {
      if (cancelled()) throw new Cancelled();
      if (failed) throw failed;
      const t = f / FPS;
      time.current = t;
      // A new cut's set and lid angle are in the scene, and its shadow drawn, before the frame.
      await stage.current?.(t);
      if (f % FPS === 0) onProgress(f / frames);
      state.advance(t * 1000);
      g.fillStyle = "#14100d";
      g.fillRect(0, 0, W, H);
      g.drawImage(gl, 0, 0, W, H);
      if (f === still) {
        // The 3D view alone, before the captions go over it.
        const p = new OffscreenCanvas(posterW, posterH);
        p.getContext("2d")?.drawImage(frame, 0, 0, posterW, posterH);
        poster = p.convertToBlob({ type: "image/jpeg", quality: 0.85 }).catch(() => null);
      }
      drawOverlay(g, program, t);
      const vf = new VideoFrame(frame, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
      vf.close();
      // Polled as well: an encoder that fails sends no more dequeue events.
      while (enc.encodeQueueSize > QUEUE && !failed)
        await new Promise((r) => {
          enc.addEventListener("dequeue", r, { once: true });
          setTimeout(r, 50);
        });
      await yieldTask();
    }
    await enc.flush();
    if (failed) throw failed;
  } finally {
    if (enc.state !== "closed") enc.close();
  }
  muxer.finalize();
  const secs = (performance.now() - began) / 1000;
  console.info(`video: ${frames} frames (${program.total.toFixed(1)} s, ${vc.mux} ${vc.config.hardwareAcceleration}${ac ? `+${ac.mux}` : ""}) in ${secs.toFixed(1)} s, ${(program.total / secs).toFixed(2)}x real time, ${target.buffer.byteLength} bytes`);
  return { video: new Blob([target.buffer], { type: "video/mp4" }), poster: await poster };
}

/** Hands the renderer the r3f state once the canvas is up. */
function Driver({ onState }: { onState: (s: RootState) => void }) {
  const state = useThree();
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the canvas mounts
  useEffect(() => {
    onState(state);
  }, []);
  return null;
}

function Renderer({ job, fit, done }: { job: Job; fit: Fit; done: (r: Rendered | Error) => void }) {
  const time = useRef(0);
  const stage = useRef<StageControl["current"]>(null);
  const ready = useMemo(() => {
    let state: (s: RootState) => void = () => {};
    let set: () => void = () => {};
    let lock: () => void = () => {};
    const locked = new Promise<void>((r) => {
      lock = r;
    });
    const both = Promise.all([
      new Promise<RootState>((r) => {
        state = r;
      }),
      // The set loads first; the laptop and its lock screen go on it after.
      new Promise<void>((r) => {
        set = r;
      }).then(() => Promise.race([locked, new Promise<void>((r) => setTimeout(r, LOCK_WAIT))])),
      document.fonts.ready,
    ]);
    return { both, state: (s: RootState) => state(s), set: () => set(), lock: () => lock() };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mounted job
  useEffect(() => {
    ready.both
      .then(async ([state]) => {
        // A few warm-up frames: shadow maps, the environment and textures settle before frame one.
        // The set and the laptop hold still, so the key light's shadow is drawn here and kept.
        for (let i = 0; i < 3; i++) {
          state.gl.shadowMap.needsUpdate = true;
          state.advance(0);
          await yieldTask();
        }
        return encode(job, state, time, stage);
      })
      .then(done, (e) => done(e instanceof Error ? e : new Error(String(e))));
  }, []);
  return (
    <Canvas
      shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: false }}
      dpr={GL_SCALE}
      frameloop="never"
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ fov: job.program.frame.fov, near: 0.01, far: 20, position: [0, 1.2, 1] }}
    >
      <VideoStage program={job.program} fit={fit} time={time} onLock={ready.lock} onSet={ready.set} control={stage} />
      <Driver onState={ready.state} />
    </Canvas>
  );
}

/** How long a caption shows without a voice, seconds: its words at a speaking rate. */
export const silentDur = (text: string) => 0.6 + text.split(/\s+/).length / SILENT_WPS;

/** The timeline of a video's lines: each as long as its clip, or its caption at a speaking rate without a voice. */
export function timelineFor(lines: string[], voice: Voice | null): Timeline {
  if (voice && voice.clips.length === lines.length) return timelineOf(voice.clips.map((c) => c.length / voice.sampleRate));
  return timelineOf(lines.map(silentDur));
}

/** The voice when it has a clip for every line, else none: the video then runs on caption timing. */
export function voiceFor(lines: number, voice: Voice | null): Voice | null {
  return voice && voice.clips.length === lines ? voice : null;
}

/**
 * Renders a program to an MP4 in a hidden canvas of its own React root, away
 * from whatever the player is looking at. Rejects with Cancelled once
 * `cancelled` turns true. `voice` has one clip per caption, or is null.
 */
export function renderVideo(
  program: Program,
  voice: Voice | null,
  cancelled: () => boolean = () => false,
  onProgress: (p: number) => void = () => {},
): Promise<Rendered> {
  let fit: Fit;
  try {
    fit = solve(program.facts.subject.build);
  } catch (e) {
    return Promise.reject(e);
  }
  const job: Job = { program, voice: voiceFor(program.captions.length, voice), cancelled, onProgress };
  // Every set the video moves between is loading before it starts.
  preloadSets(looksOf(program).map((l) => l.set));
  const { w: W, h: H } = program.frame;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-${W * 4}px;top:0;width:${W}px;height:${H}px;pointer-events:none;visibility:hidden;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise<Rendered>((resolve, reject) => {
    const done = (r: Rendered | Error) => {
      // Unmounted on the next turn: the encoder's last callbacks run first.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      if (r instanceof Error) reject(r);
      else resolve(r);
    };
    root.render(<Renderer job={job} fit={fit} done={done} />);
  });
}
