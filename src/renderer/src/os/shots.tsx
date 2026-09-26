import { type Build, gameEdition, type Measurements, panelOf, results, simulate, solve } from "../engine";
import wallSmall from "../assets/os/wallpaper-small.jpg?inline";
import { lookOf as lookOfPanel } from "../review/look";
import { paintAsh } from "./art";
import { AshApp, Desktop, Lock, lookOf, Screen, SysApp, Win } from "./Os";
import { snapshot } from "./snapshot";
import { sysGroups } from "./sys";
import { type Era, eraOf, type Owner, type Power } from "./types";

// Still pictures of the laptop's screen for the menu's lock screen, the
// builder's desktop and the review photos. Each is the real OS, laid out at
// the panel's logical resolution and cached per laptop and aspect.

export type OsShot = "lock" | "desktop" | "ash" | "sys";

export interface ShotInput {
  shot: OsShot;
  build: Build;
  owner: Owner;
  /** The model's full name, for System. */
  model: string;
  /** Width over height of the panel as drawn. */
  aspect: number;
  /** Canvas width to draw at. */
  outW: number;
}

const FULL: Power = { battery: true, pct: 100, plugged: false, time: "Fully charged" };

/** The panel's logical size, matched to the drawn aspect. */
function logical(build: Build, aspect: number): [number, number] {
  const look = lookOfPanel(panelOf(build));
  const h = look?.height ?? 810;
  return [Math.round(h * aspect), h];
}

function ashFrame(detail: Era, w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paintAsh(g, w, h, detail, "high", 3.2);
  return c.toDataURL("image/jpeg", 0.85);
}

function ashState(build: Build, m: Measurements) {
  const ed = gameEdition(build.year);
  const game = results(build, m, ed)?.games.find((g) => g.id === "ashfall");
  const run = game?.runs?.find((r) => r.preset === "high" && !r.native);
  return { ed, fps: run?.fps ?? 0 };
}

function nodeFor(i: ShotInput, w: number, h: number) {
  const era = eraOf(i.build.year);
  const now = new Date();
  const bar = { era, app: null, power: FULL, muted: false, year: i.build.year, now };
  if (i.shot === "lock")
    return (
      <Screen era={era}>
        <Lock era={era} owner={i.owner} wallpaper={wallSmall} power={FULL} now={now} year={i.build.year} />
      </Screen>
    );
  if (i.shot === "desktop")
    return (
      <Screen era={era}>
        <Desktop {...bar} wallpaper={wallSmall} />
      </Screen>
    );
  const m = simulate(i.build, solve(i.build));
  if (i.shot === "sys")
    return (
      <Screen era={era}>
        <Desktop {...bar} app="sys" wallpaper={wallSmall}>
          <Win app="sys" title={SYS_TITLE[lookOf(era)]} w={SYS_SIZE[lookOf(era)][0]} h={SYS_SIZE[lookOf(era)][1]}>
            <SysApp
              era={era}
              groups={sysGroups(
                i.model,
                i.build,
                m,
                { cpuGhz: 0, gpuMhz: 0 },
                { ...FULL, time: "fully charged" },
              )}
            />
          </Win>
        </Desktop>
      </Screen>
    );
  const a = ashState(i.build, m);
  const detail = eraOf(a.ed);
  return (
    <Screen era={era}>
      <Desktop {...bar} app="ash" wallpaper={wallSmall}>
        <Win app="ash" title={`Ashfall ${a.ed}`} w={99999} h={99999}>
          <AshApp
            era={era}
            editions={[a.ed]}
            edition={a.ed}
            preset="high"
            fps={a.fps}
            detail={detail}
            refusal={null}
            still={{ image: ashFrame(detail, Math.round(w * 0.6), Math.round(h * 0.55)), fps: a.fps }}
          />
        </Win>
      </Desktop>
    </Screen>
  );
}

export const SYS_TITLE: Record<Era, string> = { 2006: "System Properties", 2016: "System", 2026: "Settings" };
export const SYS_SIZE: Record<Era, [number, number]> = { 2006: [840, 640], 2016: [1080, 670], 2026: [1100, 690] };

/** A plain stand-in when the real picture cannot be drawn: the wallpaper. */
function fallback(outW: number, aspect: number): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = Math.round(outW);
  c.height = Math.round(outW / aspect);
  return new Promise((res) => {
    const img = new Image();
    const done = () => res(c);
    img.onload = () => {
      const g = c.getContext("2d");
      if (g) {
        const k = Math.max(c.width / img.width, c.height / img.height);
        g.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
      }
      done();
    };
    img.onerror = done;
    img.src = wallSmall;
  });
}

const cache = new Map<string, Promise<HTMLCanvasElement>>();

/** A picture of the OS; the same inputs give the same cached canvas. */
export function osShot(i: ShotInput): Promise<HTMLCanvasElement> {
  const key = [i.shot, i.aspect.toFixed(3), Math.round(i.outW), i.owner.maker, i.owner.wordmark, i.model, JSON.stringify(i.build)].join("|");
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      // Out of any render or effect in progress, so the off-screen root may flush.
      await Promise.resolve();
      const [w, h] = logical(i.build, i.aspect);
      try {
        return await snapshot(nodeFor(i, w, h), lookOf(eraOf(i.build.year)), w, h, i.outW);
      } catch (e) {
        console.error("OS picture fell back to the wallpaper", e);
        return fallback(i.outW, i.aspect);
      }
    })();
    if (cache.size > 40) cache.clear();
    cache.set(key, p);
  }
  return p;
}
