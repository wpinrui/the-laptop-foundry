import { Canvas, type RootState, useThree } from "@react-three/fiber";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { type Fit, solve } from "../engine";
import { drawOverlay, FOV, H, ShortStage, SILENT_WPS, type Timeline, timelineOf, W } from "./scene";
import type { Short } from "./script";

// The short, rendered offline: the scene is stepped at a fixed frame rate in a
// hidden canvas of its own, each frame composited with its overlay and handed
// to WebCodecs, the narration mixed and encoded beside it, and both muxed into
// one MP4. Nothing waits on a wall clock, so it runs as fast as the machine
// renders and never drops a frame.

export const FPS = 30;
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

async function pickVideo(): Promise<(typeof VIDEO_CODECS)[number]> {
  for (const c of VIDEO_CODECS) {
    const s = await VideoEncoder.isConfigSupported({ codec: c.codec, width: W, height: H, bitrate: VIDEO_BITRATE, framerate: FPS });
    if (s.supported) return c;
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
async function mixdown(voice: Voice, tl: Timeline): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(tl.total * AUDIO_RATE), AUDIO_RATE);
  voice.clips.forEach((c, i) => {
    const b = ctx.createBuffer(1, Math.max(1, c.length), voice.sampleRate);
    b.copyToChannel(new Float32Array(c), 0);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(tl.starts[i]);
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
  short: Short;
  tl: Timeline;
  voice: Voice | null;
  cancelled: () => boolean;
}

/** Steps the scene through every frame, encodes it with the narration and returns the MP4. */
async function encode(job: Job, state: RootState, time: { current: number }): Promise<Blob> {
  const { short, tl, voice, cancelled } = job;
  const vc = await pickVideo();
  const ac = voice ? await pickAudio() : null;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vc.mux, width: W, height: H, frameRate: FPS },
    audio: ac ? { codec: ac.mux, numberOfChannels: 1, sampleRate: AUDIO_RATE } : undefined,
    fastStart: "in-memory",
  });
  if (voice && ac) await encodeAudio(await mixdown(voice, tl), ac.codec, muxer);

  let failed: unknown = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failed = e;
    },
  });
  enc.configure({ codec: vc.codec, width: W, height: H, bitrate: VIDEO_BITRATE, framerate: FPS, latencyMode: "quality" });
  const frame = new OffscreenCanvas(W, H);
  const g = frame.getContext("2d");
  if (!g) throw new Error("no 2d context");
  const gl = state.gl.domElement;
  const frames = Math.ceil(tl.total * FPS);
  try {
    for (let f = 0; f < frames; f++) {
      if (cancelled()) throw new Cancelled();
      if (failed) throw failed;
      const t = f / FPS;
      time.current = t;
      state.advance(t * 1000);
      g.fillStyle = "#14100d";
      g.fillRect(0, 0, W, H);
      g.drawImage(gl, 0, 0, W, H);
      drawOverlay(g, short, tl, t);
      const vf = new VideoFrame(frame, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > QUEUE) await new Promise((r) => enc.addEventListener("dequeue", r, { once: true }));
      await yieldTask();
    }
    await enc.flush();
    if (failed) throw failed;
  } finally {
    if (enc.state !== "closed") enc.close();
  }
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

/** Hands the renderer the r3f state once the canvas is up. */
function Driver({ onState }: { onState: (s: RootState) => void }) {
  const state = useThree();
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the canvas mounts
  useEffect(() => onState(state), []);
  return null;
}

function Renderer({ job, fit, done }: { job: Job; fit: Fit; done: (r: Blob | Error) => void }) {
  const time = useRef(0);
  const ready = useMemo(() => {
    let state: (s: RootState) => void = () => {};
    let lock: () => void = () => {};
    const both = Promise.all([
      new Promise<RootState>((r) => {
        state = r;
      }),
      Promise.race([new Promise<void>((r) => (lock = r)), new Promise<void>((r) => setTimeout(r, LOCK_WAIT))]),
      document.fonts.ready,
    ]);
    return { both, state: (s: RootState) => state(s), lock: () => lock() };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mounted job
  useEffect(() => {
    ready.both
      .then(async ([state]) => {
        // A few warm-up frames: shadow maps, the environment and textures settle before frame one.
        for (let i = 0; i < 3; i++) {
          state.advance(0);
          await yieldTask();
        }
        return encode(job, state, time);
      })
      .then(done, (e) => done(e instanceof Error ? e : new Error(String(e))));
  }, []);
  return (
    <Canvas
      flat
      shadows
      dpr={1}
      frameloop="never"
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ fov: FOV, near: 10, far: 6000, position: [0, 500, 800] }}
    >
      <ShortStage short={job.short} fit={fit} tl={job.tl} time={time} onLock={ready.lock} />
      <Driver onState={ready.state} />
    </Canvas>
  );
}

/** The timeline of a short: each line as long as its clip, or its caption at a speaking rate without a voice. */
export function timelineFor(short: Short, voice: Voice | null): Timeline {
  if (voice && voice.clips.length === short.lines.length) return timelineOf(voice.clips.map((c) => c.length / voice.sampleRate));
  return timelineOf(short.lines.map((l) => 0.6 + l.text.split(/\s+/).length / SILENT_WPS));
}

/**
 * Renders the short to an MP4 in a hidden canvas of its own React root, away
 * from whatever the player is looking at. Rejects with Cancelled once
 * `cancelled` turns true.
 */
export function renderShort(short: Short, voice: Voice | null, cancelled: () => boolean): Promise<Blob> {
  let fit: Fit;
  try {
    fit = solve(short.facts.subject.build);
  } catch (e) {
    return Promise.reject(e);
  }
  const v = voice && voice.clips.length === short.lines.length ? voice : null;
  const job: Job = { short, tl: timelineFor(short, v), voice: v, cancelled };
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-${W * 4}px;top:0;width:${W}px;height:${H}px;pointer-events:none;visibility:hidden;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise<Blob>((resolve, reject) => {
    const done = (r: Blob | Error) => {
      // Unmounted on the next turn: the encoder's last callbacks run first.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      if (r instanceof Blob) resolve(r);
      else reject(r);
    };
    root.render(<Renderer job={job} fit={fit} done={done} />);
  });
}
