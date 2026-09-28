import { useEffect, useRef, useState } from "react";
import type { ReadyShort } from "./shorts";
import "./video.css";

// Plays the quarter's short, already rendered in the background, from its file.

export function VideoScreen({ video, onBack }: { video: ReadyShort; onBack: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape") onBack();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onBack]);

  const replay = () => {
    const v = player.current;
    if (!v) return;
    v.currentTime = 0;
    setDone(false);
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
      <video ref={player} className="vd-out" src={video.url} autoPlay playsInline onEnded={() => setDone(true)} />
      <div className="vd-bar">
        {done && (
          <>
            <button type="button" className="fd-text" onClick={replay}>
              Replay
            </button>
            <button type="button" className="fd-text" disabled={saving} onClick={save}>
              Save
            </button>
          </>
        )}
        <button type="button" className="fd-text" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
