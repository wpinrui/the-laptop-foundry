import { type BrowserWindow, ipcMain, type WebFrameMain } from "electron";
import { handleTop } from "./ipc";

// How fast the laptop in the game loads pages. The game's top frame sends the
// build's factors; every page load request from a browser tab then waits as
// long as that laptop would have taken: its drive, its connection, and its
// processor slowed further when the memory is short and the system swaps.
// Three queues, as one machine has one drive, one line and one main thread.
// The game's own requests never wait.

export interface Pace {
  /** How many times slower the processor is than a current flagship, 1 or more. */
  cpu: number;
  /** Installed memory, GB. */
  ramGb: number;
  disk: "hdd" | "sata" | "nvme";
  /** The era's typical home connection. */
  mbps: number;
  rttMs: number;
}

const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** A clean copy of what the game sent: plain numbers in range, nothing more. Null turns pacing off. */
function clean(v: unknown): Pace | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  return {
    cpu: num(s.cpu, 1, 30, 1),
    ramGb: num(s.ramGb, 0.25, 256, 16),
    disk: s.disk === "hdd" || s.disk === "sata" ? s.disk : "nvme",
    mbps: num(s.mbps, 0.5, 10000, 1000),
    rttMs: num(s.rttMs, 0, 500, 0),
  };
}

/** What a request costs a page load: bytes over the line and main-thread work at flagship speed. */
const COST: Record<string, { kb: number; ms: number }> = {
  subFrame: { kb: 50, ms: 20 },
  script: { kb: 25, ms: 4 },
  stylesheet: { kb: 10, ms: 2 },
  image: { kb: 15, ms: 0.5 },
  font: { kb: 20, ms: 0.5 },
};

/** A drive's time to find a file in the cache, ms. */
const SEEK: Record<Pace["disk"], number> = { hdd: 9, sata: 0.3, nvme: 0.05 };
/** How much each GB short of what the web needs slows the processor, by the drive it swaps to. */
const SWAP: Record<Pace["disk"], number> = { hdd: 0.3, sata: 0.08, nvme: 0.03 };
/** The memory a browser with a modern page open wants, GB. */
const NEED_GB = 4;
/** The host's own line already takes this long, ms. */
const HOST_RTT = 10;
/** No single request waits longer than this, so nothing times out. */
const MAX_WAIT = 8000;

let pace: Pace | null = null;
const free = { disk: 0, line: 0, cpu: 0 };

export function registerPaceIpc(win: BrowserWindow): void {
  ipcMain.removeHandler("fox:pace");
  handleTop("fox:pace", (e, v: unknown) => {
    if (win.isDestroyed() || e.sender !== win.webContents) return;
    pace = clean(v);
  });
}

/**
 * How long a tab's request waits, ms. Only for requests from a browser tab
 * (the caller checks); a tab's own document starts a new page, so the queues
 * the last page left behind are dropped.
 */
export function paceWait(win: BrowserWindow, d: { resourceType: string; frame?: WebFrameMain | null }): number {
  const p = pace;
  const cost = COST[d.resourceType];
  if (!p || !cost) return 0;
  const now = Date.now();
  let tabDoc = false;
  try {
    tabDoc = d.resourceType === "subFrame" && d.frame?.parent?.frameTreeNodeId === win.webContents.mainFrame.frameTreeNodeId;
  } catch {}
  if (tabDoc) {
    free.disk = now;
    free.line = now;
    free.cpu = now;
  }
  free.disk = Math.max(now, free.disk) + SEEK[p.disk];
  free.line = Math.max(free.disk, free.line) + (cost.kb * 8) / p.mbps;
  const arrive = free.line + Math.max(0, p.rttMs - HOST_RTT);
  const swap = 1 + Math.max(0, NEED_GB - p.ramGb) * SWAP[p.disk];
  free.cpu = Math.max(arrive, free.cpu) + cost.ms * (p.cpu - 1) * swap;
  // A page that keeps loading never builds a backlog past the cap.
  for (const k of ["disk", "line", "cpu"] as const) free[k] = Math.min(free[k], now + MAX_WAIT);
  return Math.min(MAX_WAIT, Math.max(0, Math.round(free.cpu - now)));
}
