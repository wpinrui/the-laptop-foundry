// PROBE: temporary dev entry for the hidden store probe. Removed before landing.
import { useEffect, useState } from "react";
import type { SavedCompany, SavedModel } from "../../../preload/store";
import { type CampaignState, newCampaign, release, resolveQuarter } from "../engine/campaign";
import { buildCost } from "../engine/campaign/release";
import { rivalsFor } from "../engine/market/field";
import { ensureMarket, openMarkets } from "../market/markets";
import { StoreWorld } from "./StoreWorld";

type W = Window & {
  __probe?: { stage: string; ack: string; log: string[]; metrics?: unknown };
  __storeGl?: { gl: import("three").WebGLRenderer; scene: import("three").Scene; camera: import("three").Camera };
  __storeBaked?: { n: number; triangles: number };
  __storeSeats?: number;
  __storeInspect?: (i: number) => void;
};
const w = window as W;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(name: string) {
  const p = w.__probe;
  if (!p) return;
  p.stage = `shot:${name}`;
  while (p.ack !== name) await sleep(100);
}

function key(code: string, type: "keydown" | "keyup") {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

async function measure(label: string) {
  const s = w.__storeGl;
  if (!s) return null;
  const gl = s.gl;
  const ctx = gl.getContext();
  const px = new Uint8Array(4);
  const times: number[] = [];
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    gl.render(s.scene, s.camera);
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const info = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries };
  // Natural frame pacing over two seconds.
  const deltas: number[] = [];
  let last = performance.now();
  await new Promise<void>((done) => {
    const end = last + 2000;
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  deltas.sort((a, b) => a - b);
  return { label, renderMedianMs: times[20], renderP90Ms: times[36], rafMedianMs: deltas[Math.floor(deltas.length / 2)], rafP90Ms: deltas[Math.floor(deltas.length * 0.9)], size: [gl.domElement.width, gl.domElement.height], ...info };
}

export function Probe({ mode }: { mode: string }) {
  const [company, setCompany] = useState<SavedCompany | null>(null);
  const [campaign, setCampaign] = useState<CampaignState | null>(null);
  useEffect(() => {
    w.__probe = { stage: "start", ack: "", log: [] };
    const c: SavedCompany = { version: 1, id: `probe-${mode}`, name: "Foundry", created: 0, played: 0, models: [], markets: {} };
    openMarkets(c);
    (async () => {
      if (mode === "2024") {
        await ensureMarket(2023);
        await ensureMarket(2024);
        const rivals = [...rivalsFor(2023), ...rivalsFor(2024)];
        const own = rivalsFor(2024).find((r) => r.maker === "dell") ?? rivalsFor(2024)[0];
        const cost = buildCost(own.build);
        const build = { ...own.build, price: Math.round(cost * 1.6) };
        const models: SavedModel[] = [{ id: "own", name: "Anvil 14", build, created: 0, updated: 0 }];
        let s = newCampaign(2024);
        s = release(s, "own", build.price, cost, 5000, false) ?? s;
        s = resolveQuarter(s, { models, company: c.id, rivals });
        setCampaign(s);
        setCompany({ ...c, models, campaign: { start: 2024 } });
      } else if (mode === "full") {
        for (const y of [2020, 2021, 2022, 2023, 2024]) await ensureMarket(y);
        (window as unknown as { __probeFull?: number[] }).__probeFull = [2020, 2021, 2022, 2023, 2024];
        setCompany(c);
      } else {
        await ensureMarket(2007);
        await ensureMarket(2008);
        setCompany(c);
      }
    })().catch((e) => w.__probe?.log.push(String(e?.stack ?? e)));
  }, [mode]);

  useEffect(() => {
    if (!company) return;
    (async () => {
      const t0 = performance.now();
      while (!w.__storeSeats || !w.__storeBaked || w.__storeBaked.n < w.__storeSeats) {
        await sleep(200);
        if (performance.now() - t0 > 120000) break;
      }
      { const st = (window as unknown as { __bakeStats?: Record<string, number> }).__bakeStats ?? {}; w.__probe?.log.push(JSON.stringify(Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 25))); }
      w.__probe?.log.push(`seats ${w.__storeSeats} baked ${JSON.stringify(w.__storeBaked)} in ${Math.round(performance.now() - t0)} ms`);
      await sleep(2500);
      const metrics: unknown[] = [];
      metrics.push(await measure("entrance"));
      await shot("entrance");
      key("ShiftLeft", "keydown");
      key("KeyW", "keydown");
      await sleep(12000);
      key("KeyW", "keyup");
      key("ShiftLeft", "keyup");
      await sleep(500);
      metrics.push(await measure("aisle"));
      await shot("aisle");
      w.__storeInspect?.(Math.min(4, (w.__storeSeats ?? 1) - 1));
      await sleep(1500);
      metrics.push(await measure("inspect"));
      await shot("inspect");
      if (w.__probe) {
        w.__probe.metrics = metrics;
        w.__probe.stage = "done";
      }
    })().catch((e) => w.__probe?.log.push(String(e?.stack ?? e)));
  }, [company]);

  if (!company) return null;
  return <StoreWorld company={company} campaign={campaign} year={mode === "2024" ? undefined : mode === "full" ? 2024 : 2008} onLeave={() => w.__probe?.log.push("left")} />;
}
