import { useEffect, useRef, useState } from "react";
import { available, type Build, CONTENT, PIECES, rivalsFor } from "../engine";
import type { Optimised } from "../engine/market/optimise";
import { SEGMENTS } from "../engine/market/segments";
import { useMarket } from "../market/markets";
import OptimiseWorker from "../market/optimise.worker?worker&inline";
import { Dropdown } from "./Dropdown";
import type { SetBuild } from "./Parts";

// Dev only: replaces the build with the most profitable one for a buyer
// segment, priced, keeping the player's colours, keycaps, decals and wallpaper.

/** The optimised build with the player's cosmetics kept, finishes the new materials cannot take swapped for the generator's. */
function applyOptimised(b: Build, o: Build): Build {
  const finish = {} as Build["finish"];
  for (const piece of PIECES) {
    const mat = CONTENT.materials.find((m) => m.id === o.materials[piece]);
    const ok = (mat?.finishes ?? []).some((f) => {
      const tex = CONTENT.finishes.find((x) => x.id === f);
      return f === b.finish[piece].texture && !!tex && available(tex, o.year);
    });
    finish[piece] = { colour: b.finish[piece].colour, texture: ok ? b.finish[piece].texture : o.finish[piece].texture };
  }
  const out: Build = { ...o, year: b.year, finish };
  if (b.stage !== undefined) out.stage = b.stage;
  if (b.keys) out.keys = b.keys;
  if (b.marks) out.marks = b.marks;
  if (b.wallpaper) out.wallpaper = b.wallpaper;
  if (b.bezel) out.bezel = b.bezel;
  if (b.pad) out.pad = b.pad;
  if (b.keyDeck) out.keyDeck = b.keyDeck;
  return out;
}

export function Optimise({ build, set, locked }: { build: Build; set: SetBuild; locked: boolean }) {
  const ready = useMarket(build.year);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const run = (segment: string) => {
    worker.current?.terminate();
    const w = new OptimiseWorker();
    worker.current = w;
    setBusy(true);
    w.onmessage = (e: MessageEvent<{ ok: boolean; result?: Optimised | null; error?: string }>) => {
      w.terminate();
      worker.current = null;
      setBusy(false);
      const r = e.data.result;
      if (e.data.ok && r) set((b) => applyOptimised(b, r.build));
      else console.error("optimise failed", e.data.error ?? "no valid build");
    };
    w.onerror = (e) => {
      w.terminate();
      worker.current = null;
      setBusy(false);
      console.error("optimise failed", e);
    };
    w.postMessage({ segment, year: build.year, rivals: rivalsFor(build.year) });
  };
  return (
    <Dropdown
      label="Optimise"
      value={null}
      placeholder={busy ? "Optimising" : "Optimise"}
      disabled={locked || busy || !ready}
      options={SEGMENTS.map((s) => ({ key: s.id, label: s.name }))}
      onChange={run}
    />
  );
}
