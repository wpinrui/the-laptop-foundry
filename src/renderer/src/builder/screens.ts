import * as THREE from "three";
import { token } from "../viewer/theme";

// The Screen stage's test grid on the builder's laptop, drawn at the panel's
// own aspect. Once the laptop is valid its OS takes the screen (os/useOsScreen).

export type ScreenKind = "off" | "grid";

function canvas(ratio: number): [HTMLCanvasElement, CanvasRenderingContext2D | null, number, number] {
  const W = 1280;
  const H = Math.max(200, Math.round(W / Math.max(0.5, ratio)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return [c, c.getContext("2d"), W, H];
}

export function screenTexture(kind: ScreenKind, ratio: number, name: string): THREE.CanvasTexture | undefined {
  if (kind === "off") return undefined;
  const [c, g, W, H] = canvas(ratio);
  if (g) {
    if (kind === "grid") {
      g.fillStyle = token("screen-grid");
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.55;
      g.strokeStyle = token("accent-hex");
      g.lineWidth = 1;
      for (let x = 0; x <= W; x += W / 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      for (let y = 0; y <= H; y += W / 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = token("text");
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, W - 3, H - 3);
      g.beginPath();
      g.arc(W / 2, H / 2, H * 0.36, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
