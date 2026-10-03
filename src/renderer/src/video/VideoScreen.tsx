import { useEffect, useRef, useState } from "react";
import "./video.css";

/** A finished video, loaded from its file. */
export interface PlayingVideo {
  /** Its kept file's name. */
  file: string;
  url: string;
  blob: Blob;
  /** The file name offered when saving. */
  name: string;
  /** What it is: the quarter for a short, Commercial for a commercial. */
  label: string;
  /** The model it is about. */
  model: string;
}

// Plays a finished video, a quarter's short or a commercial, from its file.
// The <video> element is only the source: it decodes and plays the sound, kept
// 1px and transparent. Its frames are painted onto a canvas every animation
// frame. A visible <video> can be lifted by the GPU into a hardware overlay
// drawn above the page, hiding the buttons beside it; a canvas never is.

export function VideoScreen({ video, onBack }: { video: PlayingVideo; onBack: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLCanvasElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [shape, setShape] = useState(9 / 16);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape") onBack();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onBack]);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const v = player.current;
      const c = screen.current;
      if (v && line.current && v.duration > 0) line.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      if (!v || !c || v.readyState < 2 || !v.videoWidth) return;
      if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        setShape(v.videoWidth / v.videoHeight);
      }
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const replay = () => {
    const v = player.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play();
  };

  const save = () => {
    if (saving) return;
    setSaving(true);
    video.blob
      .arrayBuffer()
      .then((b) => window.api.video.save(new Uint8Array(b), video.name))
      .finally(() => setSaving(false));
  };

  return (
    <div className="fd vd">
      {/* biome-ignore lint/a11y/useMediaCaption: the captions are burnt into the video */}
      <video ref={player} className="vd-src" src={video.url} autoPlay playsInline />
      <canvas ref={screen} className="vd-out" width={1080} height={1920} style={{ aspectRatio: shape, height: `min(100vh, ${100 / shape}vw)` }} />
      <div className="vd-track" style={{ width: `min(100vw, ${100 * shape}vh)` }}>
        <div ref={line} />
      </div>
      <div className="vd-title">
        <span>{video.label}</span>
        <b>{video.model}</b>
      </div>
      <div className="vd-bar">
        <button type="button" className="fd-text" onClick={replay}>
          Replay
        </button>
        <button type="button" className="fd-text" disabled={saving} onClick={save}>
          Save
        </button>
        <button type="button" className="fd-text back" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
