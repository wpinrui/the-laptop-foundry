import { useEffect, useRef, useState } from "react";
import { quarterLabel } from "../engine/campaign";
import type { ReadyShort } from "./shorts";
import "./video.css";

// Plays the quarter's short, already rendered in the background, from its file.
// The <video> element is only the source: it decodes and plays the sound, kept
// 1px and transparent. Its frames are painted onto a canvas every animation
// frame. A visible <video> can be lifted by the GPU into a hardware overlay
// drawn above the page, hiding the buttons beside it; a canvas never is.

export function VideoScreen({ video, onBack }: { video: ReadyShort; onBack: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLCanvasElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

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
      <canvas ref={screen} className="vd-out" width={1080} height={1920} />
      <div className="vd-track">
        <div ref={line} />
      </div>
      <div className="vd-title">
        <span>{quarterLabel(video.quarter)}</span>
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
