import { useEffect, useState } from "react";
import type { Build } from "../engine";
import companyWall from "../assets/os/wallpaper.jpg";
import companySmall from "../assets/os/wallpaper-small.jpg?inline";

// The one place that decides a laptop's wallpaper. The player's company keeps
// its own in every era, or a model's own picture when the player set one; each
// rival maker has its own default per era (assets/os/walls, Unsplash photos).
// Live screens take a URL; pictures drawn into a canvas (os/shots) need a data
// URL, so the small copies are inlined, each in its own chunk loaded on demand.

const BIG = import.meta.glob<string>("../assets/os/walls/*.jpg", { query: "?url", import: "default", eager: true });
const SMALL = import.meta.glob<string>("../assets/os/walls/*-small.jpg", { query: "?inline", import: "default" });

const path = (maker: string, era: number, small: boolean) => `../assets/os/walls/${maker}-${era}${small ? "-small" : ""}.jpg`;

/** The first year of the wallpaper era a year falls in. */
export function wallEraOf(year: number): number {
  if (year <= 2010) return 2006;
  if (year <= 2015) return 2011;
  if (year <= 2020) return 2016;
  return 2021;
}

/** A wallpaper's size for a year: the top of that era's laptop resolutions, 16:10. */
export function wallSizeOf(year: number): [number, number] {
  const era = wallEraOf(year);
  if (era === 2006) return [1920, 1200];
  if (era === 2021) return [3840, 2400];
  return [2560, 1600];
}

/** The small copies are at most this wide. */
const SMALL_W = 1280;

/** A maker's default wallpaper URL for a year; null, or a maker with none, gets the player's company's. */
export function wallpaperFor(maker: string | null | undefined, year: number, small = false): string {
  const url = maker ? BIG[path(maker, wallEraOf(year), small)] : undefined;
  return url ?? (small ? companySmall : companyWall);
}

const custom = new Map<string, Promise<string | null>>();

/** A model's own wallpaper as a data URL; null when it is gone. */
export function customWallpaper(id: string): Promise<string | null> {
  let p = custom.get(id);
  if (!p) {
    p = window.api.wallpaper.get(id).catch(() => null);
    custom.set(id, p);
  }
  return p;
}

/** The laptop's own picture, when it is the player's and one is set. */
const ownId = (maker: string | null | undefined, build: Build | null) => (!maker && build?.wallpaper) || null;

/** The wallpaper URL for a live screen; the default until a model's own picture has loaded. */
export function useWallpaper(maker: string | null | undefined, build: Build): string {
  const id = ownId(maker, build);
  const fallback = wallpaperFor(maker, build.year);
  const [got, setGot] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    customWallpaper(id).then((url) => {
      if (live && url) setGot({ id, url });
    });
    return () => {
      live = false;
    };
  }, [id]);
  return id && got?.id === id ? got.url : fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("the wallpaper did not load"));
    img.src = src;
  });
}

/** The image cover-cropped, centred, to `w` x `h`, never enlarged. */
async function cover(src: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!(w0 > 0 && h0 > 0)) throw new Error("the wallpaper has no size");
  const k0 = Math.max(w / w0, h / h0);
  const fit = Math.min(1, 1 / k0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * fit));
  c.height = Math.max(1, Math.round(h * fit));
  const k = Math.max(c.width / w0, c.height / h0);
  const g = c.getContext("2d");
  if (!g) throw new Error("no 2D context");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (c.width - w0 * k) / 2, (c.height - h0 * k) / 2, w0 * k, h0 * k);
  return c;
}

const smallCustom = new Map<string, Promise<string | null>>();

/** A model's own wallpaper, small, as a data URL. */
function smallOwn(id: string, year: number): Promise<string | null> {
  let p = smallCustom.get(id);
  if (!p) {
    p = customWallpaper(id).then(async (url) => {
      if (!url) return null;
      const [w, h] = wallSizeOf(year);
      const c = await cover(url, SMALL_W, Math.round((SMALL_W * h) / w));
      return c.toDataURL("image/jpeg", 0.85);
    });
    p = p.catch(() => null);
    smallCustom.set(id, p);
  }
  return p;
}

/** The small wallpaper as a data URL, for pictures of the OS drawn into a canvas. */
export async function wallpaperData(maker: string | null | undefined, build: Build): Promise<string> {
  const id = ownId(maker, build);
  if (id) {
    const own = await smallOwn(id, build.year);
    if (own) return own;
  }
  const load = maker ? SMALL[path(maker, wallEraOf(build.year), true)] : undefined;
  if (load) {
    try {
      return await load();
    } catch (e) {
      console.error("a maker's wallpaper did not load", e);
    }
  }
  return companySmall;
}

/**
 * Opens a file picker for a model's own wallpaper, cover-crops it to the
 * year's size and keeps it. The new id; null when cancelled; an error note
 * when the file is no image.
 */
export async function pickWallpaper(year: number): Promise<{ id: string } | { error: string } | null> {
  const got = await window.api.wallpaper.pick();
  if (!got) return null;
  if ("error" in got) return { error: got.error === "too-big" ? `That file is over ${got.limit}` : "That file is not a JPEG, PNG or WebP image" };
  try {
    const [w, h] = wallSizeOf(year);
    const c = await cover(got.image, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return { error: "That image could not be read" };
    const id = await window.api.wallpaper.save(new Uint8Array(await blob.arrayBuffer()));
    return { id };
  } catch {
    return { error: "That image could not be read" };
  }
}
