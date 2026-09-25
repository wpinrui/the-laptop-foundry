// Colours for the 3D scene come from tokens.css, read at runtime, so
// tokens.css stays the single source of raw colour.

const cache = new Map<string, string>();

export function token(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  cache.set(name, v);
  return v;
}

const ROLE_TOKEN: Record<string, string> = {
  board: "role-board",
  cpu: "role-chip",
  gpu: "role-chip",
  chipset: "role-chip",
  vrm: "role-vrm",
  mem: "role-memory",
  m2: "role-storage",
  wlan: "role-wireless",
  bt: "role-wireless",
  tb: "role-chip",
  battery: "role-battery",
  fan: "role-fan",
  fin: "role-fin",
  drive: "role-drive",
  odd: "role-optical",
  spk: "role-speaker",
  hinge: "role-hinge",
  "port:left": "role-port",
  "port:right": "role-port",
  "port:rear": "role-port",
  "port:front": "role-port",
  keys: "role-keys",
  pad: "role-pad",
  panel: "role-panel",
  inverter: "role-inverter",
  webcam: "role-webcam",
  kblight: "role-light",
};

export function roleColour(role: string): string {
  return token(ROLE_TOKEN[role] ?? "role-chip");
}
