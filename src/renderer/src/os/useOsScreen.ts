import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { type Build, panelOf } from "../engine";
import { lookOf as lookOfPanel } from "../review/look";
import { BOOT_MS, paintBoot } from "./art";
import { osFontsReady } from "./fonts";
import { lookOf } from "./Os";
import { type OsShot, osShot } from "./shots";
import { eraOf, type Owner } from "./types";

// The OS on a laptop's screen in 3D: a still picture (the menu's lock
// screen), or the boot playing into the desktop (the builder).

function textureOf(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A texture of one still of the OS, once it is drawn. */
export function useOsStill(
  shot: OsShot,
  build: Build | null,
  owner: Owner,
  model: string,
  aspect: number,
  outW = 1280,
): THREE.CanvasTexture | undefined {
  const [tex, setTex] = useState<THREE.CanvasTexture>();
  const key = build ? JSON.stringify(build) : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the build's content
  useEffect(() => {
    if (!build) return;
    let live = true;
    let made: THREE.CanvasTexture | undefined;
    osShot({ shot, build, owner, model, aspect, outW }).then((c) => {
      if (!live) return;
      made = textureOf(c);
      setTex(made);
    });
    return () => {
      live = false;
      made?.dispose();
    };
  }, [shot, key, owner.maker, owner.wordmark, model, aspect.toFixed(3), outW]);
  return build ? tex : undefined;
}

/**
 * The laptop's own screen while it is being built: nothing while `on` is
 * false; when it turns on, the era's boot plays on the panel and settles on
 * the desktop. Turning off and on again boots again.
 */
export function useBootingScreen(on: boolean, build: Build, owner: Owner, model: string, aspect: number): THREE.CanvasTexture | undefined {
  const [tex, setTex] = useState<THREE.CanvasTexture>();
  const latest = useRef({ build, owner, model });
  latest.current = { build, owner, model };
  const era = eraOf(build.year);
  const logicalH = lookOfPanel(panelOf(build))?.height ?? 810;
  const ratio = Math.round(aspect * 100) / 100;
  // biome-ignore lint/correctness/useExhaustiveDependencies: boots again only when the screen itself changes
  useEffect(() => {
    if (!on) {
      setTex(undefined);
      return;
    }
    const W = 1280;
    const H = Math.max(200, Math.round(W / Math.max(0.5, ratio)));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const t = textureOf(c);
    setTex(t);
    let raf = 0;
    let start = 0;
    let ready = false;
    let desk: HTMLCanvasElement | null = null;
    let live = true;
    const { build: b, owner: o, model: m } = latest.current;
    osFontsReady(lookOf(era)).then(() => {
      ready = true;
    });
    osShot({ shot: "desktop", build: b, owner: o, model: m, aspect: ratio, outW: W }).then((d) => {
      if (live) desk = d;
    });
    const u = H / logicalH;
    const loop = (now: number) => {
      if (!g) return;
      if (!ready) {
        g.fillStyle = "#000";
        g.fillRect(0, 0, W, H);
        t.needsUpdate = true;
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!start) start = now;
      const ms = now - start;
      if (ms >= BOOT_MS && desk) {
        g.drawImage(desk, 0, 0, W, H);
        t.needsUpdate = true;
        return;
      }
      paintBoot(g, W, H, lookOf(era), o.maker, o.wordmark, Math.min(ms, BOOT_MS), u);
      t.needsUpdate = true;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [on, era, ratio, logicalH, owner.maker]);
  return on ? tex : undefined;
}
