import type { PanelOption, PanelType } from "../types";

// Every allowed combination of size, resolution and type is its own row, with
// its own brightness and colour, so no impossible panel can be specified.
// Refresh rates are the rates that row may run at. Active area comes from
// diagonal and aspect.

export const PANEL_TYPES: PanelType[] = [
  // CCFL backlight, about 5.5 mm at 12.1 inch to 6.5 mm at 17 inch, inverter in the chin.
  {
    id: "tn-matte",
    name: "TN matte",
    from: 1995,
    until: 2010,
    thickness: [5.5, 6.5],
    inverter: { x: 100, y: 10, z: 5 },
  },
  {
    id: "tn-glossy",
    name: "TN glossy",
    from: 2003,
    until: 2010,
    thickness: [5.5, 6.5],
    inverter: { x: 100, y: 10, z: 5 },
  },
  {
    id: "ips-type",
    name: "IPS-type",
    from: 2004,
    until: 2010,
    thickness: [5.5, 6.5],
    inverter: { x: 100, y: 10, z: 5 },
  },
  // Including cover glass.
  {
    id: "ips",
    name: "IPS",
    from: 2012,
    until: 2099,
    thickness: 3.5,
    coverGlass: true,
  },
  {
    id: "oled",
    name: "OLED",
    from: 2019,
    until: 2099,
    thickness: 2.1,
    coverGlass: true,
  },
  {
    id: "mini-led",
    name: "Mini-LED",
    from: 2021,
    until: 2099,
    thickness: 5.0,
    coverGlass: true,
  },
];

const W: [number, number] = [16, 10];
const XGA: [number, number] = [4, 3];

type Row = [
  inches: number,
  aspect: [number, number],
  res: [number, number],
  type: string,
  refresh: number[],
  nits: number,
  gamut: string,
];

function rows(from: number, until: number, list: Row[]): PanelOption[] {
  return list.map(([inches, aspect, res, type, refresh, nits, gamut]) => ({
    id: `${from}-${inches}-${res[0]}x${res[1]}-${type}`,
    name: `${inches} inch ${res[0]} by ${res[1]} ${type}`,
    from,
    until,
    inches,
    aspect,
    res,
    type,
    refresh,
    nits,
    gamut,
  }));
}

const TN = "45% sRGB";
const IPSTYPE = "60% sRGB";
const SRGB = "100% sRGB";
const P3 = "100% DCI-P3";

export const PANELS: PanelOption[] = [
  ...rows(2006, 2008, [
    [12.1, W, [1280, 800], "tn-matte", [60], 180, TN],
    [12.1, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [12.1, XGA, [1024, 768], "tn-matte", [60], 150, TN],
    [12.1, XGA, [1400, 1050], "ips-type", [60], 180, IPSTYPE],
    [13.3, W, [1280, 800], "tn-matte", [60], 170, TN],
    [13.3, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [14.1, W, [1280, 800], "tn-matte", [60], 170, TN],
    [14.1, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [14.1, W, [1440, 900], "tn-glossy", [60], 200, TN],
    [14.1, XGA, [1024, 768], "tn-matte", [60], 150, TN],
    [14.1, XGA, [1400, 1050], "tn-matte", [60], 170, TN],
    [14.1, XGA, [1400, 1050], "ips-type", [60], 180, IPSTYPE],
    [15, XGA, [1024, 768], "tn-matte", [60], 150, TN],
    [15, XGA, [1400, 1050], "tn-matte", [60], 170, TN],
    [15, XGA, [1600, 1200], "ips-type", [60], 180, IPSTYPE],
    [15.4, W, [1280, 800], "tn-matte", [60], 170, TN],
    [15.4, W, [1280, 800], "tn-glossy", [60], 200, TN],
    [15.4, W, [1440, 900], "tn-glossy", [60], 200, TN],
    [15.4, W, [1680, 1050], "tn-matte", [60], 180, TN],
    [15.4, W, [1680, 1050], "tn-glossy", [60], 200, TN],
    [15.4, W, [1920, 1200], "tn-matte", [60], 180, TN],
    [17, W, [1440, 900], "tn-glossy", [60], 200, TN],
    [17, W, [1680, 1050], "tn-glossy", [60], 200, TN],
    [17, W, [1920, 1200], "tn-matte", [60], 180, TN],
    [17, W, [1920, 1200], "tn-glossy", [60], 200, TN],
  ]),
  ...rows(2026, 2030, [
    [13.3, W, [1920, 1200], "ips", [60], 400, SRGB],
    [13.3, W, [2880, 1800], "oled", [60, 120], 400, P3],
    [13.5, [3, 2], [2256, 1504], "ips", [60, 120], 400, SRGB],
    [14, W, [1920, 1200], "ips", [60], 300, SRGB],
    [14, W, [2560, 1600], "ips", [120, 165], 500, SRGB],
    [14, W, [2880, 1800], "oled", [60, 120], 400, P3],
    [15.6, [16, 9], [1920, 1080], "ips", [60, 144], 300, SRGB],
    [15.6, [16, 9], [2560, 1440], "ips", [165, 240], 350, SRGB],
    [16, W, [1920, 1200], "ips", [60, 165], 300, SRGB],
    [16, W, [2560, 1600], "ips", [165, 240], 500, SRGB],
    [16, W, [2880, 1800], "oled", [120, 240], 400, P3],
    [16, W, [3200, 2000], "mini-led", [165], 600, P3],
    [16, W, [3840, 2400], "oled", [60, 120], 400, P3],
    [18, W, [2560, 1600], "ips", [240], 500, SRGB],
    [18, W, [3840, 2400], "mini-led", [120, 240], 600, P3],
  ]),
];

/** Active area in mm, from the diagonal and aspect. */
export function activeArea(p: PanelOption): { x: number; y: number } {
  const [a, b] = p.aspect;
  const d = p.inches * 25.4;
  const h = Math.hypot(a, b);
  return { x: (d * a) / h, y: (d * b) / h };
}

export function panelThickness(t: PanelType, inches: number): number {
  if (typeof t.thickness === "number") return t.thickness;
  const [lo, hi] = t.thickness;
  const f = Math.min(1, Math.max(0, (inches - 12.1) / (17 - 12.1)));
  return lo + (hi - lo) * f;
}
