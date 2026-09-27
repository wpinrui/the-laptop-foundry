import { CONTENT, type Measurements } from "../engine";
import type { Build } from "../engine/types";

// How fast the laptop loads pages in its browser: the build's processor,
// memory and boot drive, and the typical home connection of its year. The
// main process holds every tab's page load requests back to match
// (src/main/pace.ts).

/** A current flagship's single-core score: the speed pages load at unslowed. */
const FLAGSHIP_SINGLE = 2100;

/** A typical home connection by year: Mbps down and round trip ms. */
const NET: [year: number, mbps: number, rtt: number][] = [
  [2006, 6, 60],
  [2011, 15, 40],
  [2016, 50, 25],
  [2021, 200, 15],
  [2026, 500, 10],
];

function netOf(year: number): { mbps: number; rttMs: number } {
  if (year <= NET[0][0]) return { mbps: NET[0][1], rttMs: NET[0][2] };
  for (let i = 1; i < NET.length; i++) {
    const [y0, m0, r0] = NET[i - 1];
    const [y1, m1, r1] = NET[i];
    if (year <= y1) {
      const t = (year - y0) / (y1 - y0);
      return { mbps: m0 * (m1 / m0) ** t, rttMs: r0 + (r1 - r0) * t };
    }
  }
  const last = NET[NET.length - 1];
  return { mbps: last[1], rttMs: last[2] };
}

export interface PaceState {
  cpu: number;
  ramGb: number;
  disk: "hdd" | "sata" | "nvme";
  mbps: number;
  rttMs: number;
}

export function paceOf(build: Build, m: Measurements): PaceState {
  const part = (id: string | undefined) => (id ? CONTENT.parts.find((p) => p.id === id) : undefined);
  const mem = build.parts.memory?.[0];
  const memPart = part(mem?.part);
  const cpuPart = part(build.parts.processor?.[0]?.part);
  const ramGb = Number(mem?.opts?.capacity ?? memPart?.options?.capacity?.[0] ?? cpuPart?.info?.onPackageGb ?? 4) || 4;
  const drive = part(build.parts.storage?.[0]?.part);
  const name = `${drive?.id ?? ""} ${drive?.name ?? ""}`;
  const disk = /hdd/i.test(name) ? "hdd" : /nvme/i.test(name) ? "nvme" : "sata";
  const single = m.performance?.single ?? FLAGSHIP_SINGLE;
  return { cpu: Math.max(1, FLAGSHIP_SINGLE / Math.max(1, single)), ramGb, disk, ...netOf(build.year) };
}

let sent = "";

/** Tells the main process how fast this laptop loads pages; null while no laptop is running. */
export function setPace(p: PaceState | null) {
  const key = JSON.stringify(p);
  if (key === sent) return;
  sent = key;
  window.api?.fox?.pace?.(p).catch(() => {});
}
