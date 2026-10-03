import { Canvas, useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { solve } from "../engine";
import { drawOverlay, looksOf, type Program, VideoStage } from "../video/scene";
import { preloadSets } from "../video/sets";

// The commercial as it stands, played live in the editor's frame: the same
// scene the render steps through, on its estimated timing, moving between
// its sets cut by cut, its cards and captions drawn over it. No sound.

const noop = () => {};

function Clock({ program, time, playing, onEnd, overlay }: {
  program: Program;
  time: RefObject<number>;
  playing: boolean;
  onEnd: () => void;
  overlay: RefObject<HTMLCanvasElement | null>;
}) {
  useFrame((_, dt) => {
    if (playing) {
      time.current = Math.min(program.total, time.current + dt);
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

/** The frame's size in design px: 358 tall, or 800 wide when that is narrower. */
export function frameSize(w: number, h: number): { w: number; h: number } {
  const fw = Math.min(800, (358 * w) / h);
  return { w: fw, h: fw === 800 ? (800 * h) / w : 358 };
}

export function Preview({ program, time, playing, onEnd }: {
  program: Program;
  time: RefObject<number>;
  playing: boolean;
  onEnd: () => void;
}) {
  const overlay = useRef<HTMLCanvasElement>(null);
  const build = program.facts.subject.build;
  const fit = useMemo(() => {
    try {
      return solve(build);
    } catch {
      return null;
    }
  }, [build]);
  const sets = looksOf(program)
    .map((l) => l.set)
    .join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the sets it uses
  useEffect(() => preloadSets(looksOf(program).map((l) => l.set)), [sets]);
  const f = frameSize(program.frame.w, program.frame.h);
  return (
    <div className="st-frame" style={{ width: `calc(${f.w} * var(--u))`, height: `calc(${f.h} * var(--u))` }}>
      {fit && (
        <Canvas
          key={program.facts.subject.id}
          shadows={{ enabled: true, type: THREE.PCFShadowMap }}
          dpr={[0.75, 1]}
          camera={{ fov: program.frame.fov, near: 0.01, far: 60, position: [0, 1.2, 1] }}
        >
          <VideoStage program={program} fit={fit} time={time} onScreen={noop} onSet={noop} follow />
          <Clock program={program} time={time} playing={playing} onEnd={onEnd} overlay={overlay} />
        </Canvas>
      )}
      <canvas ref={overlay} className="st-frame-over" />
    </div>
  );
}
