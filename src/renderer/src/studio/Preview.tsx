import { Canvas, useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { solve } from "../engine";
import { drawOverlay, type Program, VideoStage } from "../video/scene";
import type { Look } from "../video/sets";

// The commercial as it stands, played live in the studio: the same scene the
// render steps through, on its estimated timing, its overlay drawn over it.
// No sound. A stand-in for the designer's preview.

const noop = () => {};

function Clock({ program, time, playing, onEnd, overlay, scrub }: {
  program: Program;
  time: RefObject<number>;
  playing: boolean;
  onEnd: () => void;
  overlay: RefObject<HTMLCanvasElement | null>;
  scrub: RefObject<HTMLInputElement | null>;
}) {
  useFrame((_, dt) => {
    if (playing) {
      time.current = Math.min(program.total, time.current + dt);
      if (scrub.current) scrub.current.value = String(time.current);
      if (time.current >= program.total) onEnd();
    }
    const c = overlay.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    if (c.width !== program.frame.w || c.height !== program.frame.h) {
      c.width = program.frame.w;
      c.height = program.frame.h;
    }
    g.clearRect(0, 0, c.width, c.height);
    drawOverlay(g, program, time.current);
  });
  return null;
}

export function Preview({ program, look }: { program: Program; look: Look }) {
  const time = useRef(0);
  const overlay = useRef<HTMLCanvasElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(false);
  const fit = useMemo(() => {
    try {
      return solve(program.facts.subject.build);
    } catch {
      return null;
    }
  }, [program.facts.subject.build]);
  const f = program.frame;
  if (!fit) return <div className="st-preview" style={{ aspectRatio: `${f.w} / ${f.h}` }} />;
  return (
    <div className="st-preview-wrap">
      <div className="st-preview" style={{ aspectRatio: `${f.w} / ${f.h}` }}>
        <Canvas
          key={`${look.set}:${look.paper}:${program.facts.subject.id}`}
          shadows={{ enabled: true, type: THREE.PCFShadowMap }}
          dpr={[0.5, 1]}
          camera={{ fov: f.fov, near: 0.01, far: 20, position: [0, 1.2, 1] }}
        >
          <VideoStage program={program} fit={fit} look={look} time={time} onLock={noop} onSet={noop} follow />
          <Clock program={program} time={time} playing={playing} onEnd={() => setPlaying(false)} overlay={overlay} scrub={scrub} />
        </Canvas>
        <canvas ref={overlay} className="st-preview-over" />
      </div>
      <div className="st-preview-bar">
        <button
          type="button"
          className="fd-text"
          onClick={() => {
            if (!playing && time.current >= program.total) time.current = 0;
            setPlaying((p) => !p);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          ref={scrub}
          type="range"
          min={0}
          max={program.total}
          step={0.05}
          defaultValue={0}
          onPointerDown={() => setPlaying(false)}
          onChange={(e) => {
            time.current = Number(e.target.value);
          }}
        />
      </div>
    </div>
  );
}
