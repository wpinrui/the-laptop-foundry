import { type BrowserWindow, ipcMain, type WebFrameMain } from "electron";

// Carries the laptop's speaker model and where the player is from the game's
// top frame to the browser's site frames, whose preload plays the tab's sound
// through it (src/preload/site.ts). Only the top frame may set it; only site
// frames get it. Nothing else crosses.

const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

export interface SpeakerState {
  p: { hp: number; hpQ: number; peakHz: number; peakDb: number; lp: number; drive: number; level: number; stereo: boolean };
  vol: number;
  dist: number;
  pan: number;
  width: number;
}

/** A clean copy of what the game sent: plain numbers in range, nothing more. */
function clean(v: unknown): SpeakerState | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const p = (s.p && typeof s.p === "object" ? s.p : {}) as Record<string, unknown>;
  return {
    p: {
      hp: num(p.hp, 20, 2000, 200),
      hpQ: num(p.hpQ, 0.3, 3, 0.7),
      peakHz: num(p.peakHz, 200, 12000, 2800),
      peakDb: num(p.peakDb, -12, 12, 0),
      lp: num(p.lp, 1000, 20000, 16000),
      drive: num(p.drive, 0.05, 4, 1),
      level: num(p.level, 0, 1, 0),
      stereo: p.stereo === true,
    },
    vol: num(s.vol, 0, 1, 0),
    dist: num(s.dist, 0, 1, 1),
    pan: num(s.pan, -1, 1, 0),
    width: num(s.width, 0, 1, 1),
  };
}

export function registerSpeakerIpc(win: BrowserWindow, isSite: (f: WebFrameMain | null) => boolean): void {
  let state: SpeakerState | null = null;
  ipcMain.removeAllListeners("fox-speaker:set");
  ipcMain.removeAllListeners("fox-speaker:start");
  ipcMain.on("fox-speaker:set", (e, v: unknown) => {
    if (win.isDestroyed() || e.sender !== win.webContents || !e.senderFrame || e.senderFrame.parent) return;
    const next = clean(v);
    if (!next) return;
    state = next;
    let frames: WebFrameMain[] = [];
    try {
      frames = win.webContents.mainFrame.framesInSubtree;
    } catch {}
    for (const f of frames) {
      try {
        if (isSite(f)) f.send("fox-speaker", state);
      } catch {}
    }
  });
  // A site document just starting asks for the current state, synchronously.
  ipcMain.on("fox-speaker:start", (e) => {
    e.returnValue = isSite(e.senderFrame) ? state : null;
  });
}
