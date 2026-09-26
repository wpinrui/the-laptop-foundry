import * as THREE from "three";
import type { OptionValue } from "../engine";
import type { LegendSpot } from "../models/roles/keys";

// Keycap legends in the player's own font, colour, case, size and alignment.
// The keys model marks where each legend goes; this lays them out on one
// canvas over the keyboard and redraws once the font has loaded.

const WORDS: Record<string, string> = {
  "@shift": "shift",
  "@enter": "enter",
  "@bksp": "back",
  "@tab": "tab",
  "@caps": "caps",
  "@win": "opt",
  "@left": "←",
  "@right": "→",
  "@up": "↑",
  "@down": "↓",
};

function legendText(raw: string, mode: string): string {
  let t = WORDS[raw] ?? (raw.length > 1 && !/^F\d+$/.test(raw) ? raw.toLowerCase() : raw);
  if (mode === "upper") t = t.toUpperCase();
  else if (mode === "lower") t = t.toLowerCase();
  return t;
}

export function attachLegends(obj: THREE.Object3D, opts: Record<string, OptionValue> | undefined): void {
  if (!opts || opts.legendFont === undefined) return;
  let host: THREE.Object3D | null = null;
  obj.traverse((o) => {
    if (!host && o.userData.legends) host = o;
  });
  const kb = host as THREE.Object3D | null;
  if (!kb) return;
  const spots = kb.userData.legends as LegendSpot[];
  const box = new THREE.Box3().setFromObject(kb);
  kb.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(kb.matrixWorld).invert();
  box.applyMatrix4(inv);
  const W = box.max.x - box.min.x;
  const D = box.max.z - box.min.z;
  if (!(W > 0 && D > 0) || spots.length === 0) return;
  const S = 2048 / W;
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = Math.max(64, Math.round(D * S));
  const g = canvas.getContext("2d");
  const u = D / 6;
  const font = String(opts.legendFont);
  const colour = String(opts.legendColour ?? "#efe6dc");
  const align = String(opts.legendAlign ?? "c");
  const mode = String(opts.legendCase ?? "as");
  const size = Number(opts.legendSize ?? 1);
  const weight = Number(opts.legendWeight ?? 500);
  const draw = () => {
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = colour;
    g.textBaseline = "middle";
    for (const s of spots) {
      if (s.space) continue;
      const text = legendText(s.text, mode);
      const small = text.length > 1;
      let px = (small ? 0.22 : 0.36) * u * S * size;
      g.font = `${weight} ${Math.round(px)}px "${font}"`;
      // Long words shrink to fit the cap.
      const room = s.w * S * 0.84;
      const wide = g.measureText(text).width;
      if (wide > room) {
        px *= room / wide;
        g.font = `${weight} ${Math.round(px)}px "${font}"`;
      }
      const pad = Math.min(u * 0.18, s.w * 0.18);
      const x0 = s.x - box.min.x;
      const z0 = s.z - box.min.z;
      if (align === "c") {
        g.textAlign = "center";
        g.fillText(text, x0 * S, z0 * S);
      } else {
        g.textAlign = "left";
        const y = align === "tl" ? z0 - s.d / 2 + pad + px / S / 2 : z0 + s.d / 2 - pad - px / S / 2;
        g.fillText(text, (x0 - s.w / 2 + pad) * S, y * S);
      }
    }
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const top = Math.max(...spots.map((s) => s.y)) + 0.02;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((box.min.x + box.max.x) / 2, top, (box.min.z + box.max.z) / 2);
  mesh.name = "legends";
  mesh.renderOrder = 3;
  mesh.userData.own = true;
  kb.add(mesh);
  document.fonts
    ?.load(`${weight} 40px "${font}"`)
    .then(() => {
      draw();
      tex.needsUpdate = true;
    })
    .catch(() => {});
}
