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

// Plays a finished video, a quarter's short or a commercial, from its file. The
// <video> itself is shown, so Chromium keeps its frames in step with its sound; a
// hidden one copied to a canvas falls behind. It may be lifted into a hardware
// overlay drawn above the page, so nothing else is ever laid over its box: the
// title, the progress line and the buttons sit in the strip beneath it.

export function VideoScreen({ video, onBack }: { video: PlayingVideo; onBack: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
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
      if (v && line.current && v.duration > 0) line.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const measure = () => {
    const v = player.current;
    if (v?.videoWidth && v.videoHeight) setShape(v.videoWidth / v.videoHeight);
  };

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
      <video ref={player} className="vd-out" src={video.url} autoPlay playsInline onLoadedMetadata={measure} />
      <div className="vd-track" style={{ width: `min(100vw, calc((100vh - var(--vd-strip)) * ${shape}))` }}>
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
