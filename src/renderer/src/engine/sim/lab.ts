import { type Content, CONTENT } from "../content";
import { type PanelLab, panelLab } from "../content/display";
import { panelOf } from "../screen";
import { MEMORY_LAB } from "../content/memory";
import { WIFI_LAB } from "../content/peripherals";
import { type StorageLab, storageLab } from "../content/storage";
import type { Build, BuildPart, Part } from "../types";

// Lab figures that come from the parts alone: the display, drives, Wi-Fi and
// memory as a review lab would measure them. Deterministic per part.

export type { PanelLab, StorageLab };

export interface WifiLab {
  /** iperf at 1 m, Mbit/s. */
  send: number;
  receive: number;
}

export interface MemoryLab {
  /** MT/s. */
  mts: number;
  channels: "single" | "dual" | "quad";
  /** Total bus width, bits. */
  bits: number;
  /** Theoretical peak, GB/s. */
  peak: number;
  /** Measured read bandwidth, GB/s. */
  read: number;
  /** Measured latency, ns. */
  latency: number;
}

export interface Lab {
  display: PanelLab | null;
  /** One entry per drive, in build order. */
  storage: (StorageLab & { part: string; capacity: number })[];
  wifi: WifiLab | null;
  memory: MemoryLab | null;
}

function capacityOf(bp: BuildPart, part: Part | undefined): number {
  return Number(bp.opts?.capacity ?? part?.options?.capacity?.[0] ?? 0);
}

export function labOf(build: Build, content: Content = CONTENT): Lab {
  const partOf = (id: string) => content.parts.find((p) => p.id === id);

  const panel = panelOf(build, content);

  const storage: Lab["storage"] = [];
  for (const bp of build.parts.storage ?? []) {
    const capacity = capacityOf(bp, partOf(bp.part));
    const s = storageLab(bp.part, capacity);
    if (s) storage.push({ ...s, part: bp.part, capacity });
  }

  const wl = build.parts.wireless?.[0];
  const wifi = wl ? (WIFI_LAB[wl.part] ?? null) : null;

  return {
    display: panel ? panelLab(panel) : null,
    storage,
    wifi: wifi ? { ...wifi } : null,
    memory: memoryLab(build, content),
  };
}

function memoryLab(build: Build, content: Content): MemoryLab | null {
  const bp = build.parts.memory?.[0];
  const t = bp && MEMORY_LAB[bp.part];
  if (!bp || !t) return null;
  const part = content.parts.find((p) => p.id === bp.part);
  const cpu = content.parts.find((p) => p.id === build.parts.processor?.[0]?.part);
  const provides = cpu?.provides ?? [];
  let mts = t.mts;
  let efficiency = t.efficiency;
  let latency = t.latency;
  let n: number;
  if (provides.includes("mem:128gb")) {
    // Strix Halo: a 256-bit LPDDR5X-8000 bus.
    n = 4;
    mts = 8000;
  } else if (t.fixedDual) {
    n = 2;
  } else {
    const slots = Number(bp.opts?.slots ?? part?.options?.slots?.[0] ?? 1);
    n = slots >= 2 ? 2 : 1;
  }
  // 2006 AMD parts carry the controller on the die: lower latency, no front-side bus in the way.
  if (bp.part === "ddr2-667-sodimm" && provides.includes("platform:amd")) {
    efficiency = 0.7;
    latency = 75;
  }
  const bits = t.bits * n;
  const peak = (mts * bits) / 8 / 1000;
  return {
    mts,
    channels: n >= 4 ? "quad" : n === 2 ? "dual" : "single",
    bits,
    peak: Math.round(peak * 10) / 10,
    read: Math.round(peak * efficiency * 10) / 10,
    latency,
  };
}
