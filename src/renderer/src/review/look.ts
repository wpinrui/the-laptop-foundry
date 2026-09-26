import type { PanelOption } from "../engine";
import { activeArea } from "../engine/content/display";

// How a panel shows a page: the logical size after display scaling, and the
// filter its brightness, colour and surface put on it.

export interface Look {
  width: number;
  height: number;
  mm: { x: number; y: number };
  filter: string;
  glare: number;
  shift: number;
}

export function lookOf(panel: PanelOption | undefined): Look | null {
  if (!panel) return null;
  const mm = activeArea(panel);
  const ppi = panel.res[0] / (mm.x / 25.4);
  // Windows scaling: dense panels lay the page out at fewer CSS pixels.
  const scale = ppi < 140 ? 1 : ppi < 170 ? 1.25 : ppi < 220 ? 1.5 : 2;
  const width = Math.round(panel.res[0] / scale);
  const height = Math.round(panel.res[1] / scale);
  const tn = panel.type.startsWith("tn");
  const glossy = panel.type.includes("glossy") || panel.type === "oled";
  const gamut = panel.gamut.startsWith("45")
    ? 0.7
    : panel.gamut.startsWith("60")
      ? 0.85
      : panel.gamut.includes("P3")
        ? 1.15
        : 1;
  const brightness = Math.min(1.1, Math.max(0.45, panel.nits / 380));
  const blur = Math.max(0, (135 - ppi) / 90);
  const contrast = panel.type === "oled" ? 1.12 : tn ? 0.82 : panel.type === "ips-type" ? 0.9 : 1;
  return {
    width,
    height,
    mm,
    filter: `brightness(${brightness.toFixed(2)}) contrast(${contrast}) saturate(${gamut}) blur(${blur.toFixed(2)}px)`,
    glare: glossy ? 0.16 : 0,
    shift: tn ? 0.35 : panel.type === "ips-type" ? 0.1 : 0,
  };
}

