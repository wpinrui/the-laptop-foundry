import * as THREE from "three";
import { token } from "../viewer/theme";

// What the builder's laptop shows on its display: off, a test grid (Screen
// stage), the boot screen with the model's name (power on) and a warm desktop
// once it runs. Canvas textures, drawn at the panel's own aspect.

export type ScreenKind = "off" | "grid" | "boot" | "desk";

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
    } else if (kind === "boot") {
      const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      r.addColorStop(0, token("screen-boot"));
      r.addColorStop(1, token("screen-boot-edge"));
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
      g.fillStyle = token("text");
      g.font = `700 ${Math.round(H * 0.13)}px "Barlow Condensed"`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(name.toUpperCase(), W / 2, H * 0.46);
      g.globalAlpha = 0.18;
      g.fillRect(W * 0.4, H * 0.62, W * 0.2, 4);
      g.globalAlpha = 1;
      g.fillStyle = token("accent-hex");
      g.fillRect(W * 0.4, H * 0.62, W * 0.13, 4);
    } else {
      const r = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W);
      r.addColorStop(0, token("screen-desk"));
      r.addColorStop(1, token("screen-desk-edge"));
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.85;
      g.fillStyle = token("ground");
      g.fillRect(0, H - 34, W, 34);
      g.globalAlpha = 1;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
