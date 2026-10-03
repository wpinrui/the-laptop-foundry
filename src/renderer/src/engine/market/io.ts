import { available, type Content } from "../content";
import { WIFI_LAB } from "../content/peripherals";
import type { Measurements } from "../sim";
import type { Build } from "../types";

// Era-aware connectivity (GDD, Market score): each port scores its speed times
// how much buyers of the year still want its type, ports group by function
// with diminishing returns for more of the same, charging from two sides
// counts only on USB-C class ports, Wi-Fi is measured against the cards on
// sale that year, and Bluetooth is expected once it is common.

/** Value over the years, 0 to 1, linear between points and flat past the ends. */
type Curve = [year: number, value: number][];

export function curveAt(c: Curve, year: number): number {
  if (year <= c[0][0]) return c[0][1];
  const last = c[c.length - 1];
  if (year >= last[0]) return last[1];
  const i = c.findIndex((p) => p[0] > year);
  const [a, b] = [c[i - 1], c[i]];
  return a[1] + ((b[1] - a[1]) * (year - a[0])) / (b[0] - a[0]);
}

type Fn = "video" | "net" | "usbA" | "usbC" | "cards" | "legacy" | "audio" | "lock";

const HDMI: Curve = [[2006, 0.4], [2009, 0.9], [2011, 1]];
const DP: Curve = [[2009, 0.5], [2014, 0.5], [2018, 0.2], [2021, 0]];
const ETHERNET: Curve = [[2006, 1], [2012, 1], [2016, 0.6], [2020, 0.4], [2026, 0.3]];
const USB_A: Curve = [[2006, 1], [2016, 1], [2022, 0.8], [2026, 0.7]];
const USB_C: Curve = [[2015, 0.6], [2017, 0.9], [2019, 1]];
const CARD: Curve = [[2006, 0.7], [2010, 1], [2018, 0.8], [2026, 0.6]];
const EXPRESS: Curve = [[2006, 0.4], [2010, 0.3], [2013, 0]];

/** Per port: its function, signalling rate in Gbit/s, and how much the year's buyers want it. */
const PORTS: Record<string, { fn: Fn; gbps: number; want: Curve }> = {
  vga: { fn: "video", gbps: 0.5, want: [[2006, 1], [2010, 1], [2013, 0.5], [2016, 0.1], [2018, 0]] },
  "dvi-d": { fn: "video", gbps: 1, want: [[2006, 0.4], [2009, 0.2], [2012, 0]] },
  "s-video": { fn: "video", gbps: 0.2, want: [[2006, 0.3], [2009, 0]] },
  "hdmi-1.3": { fn: "video", gbps: 3, want: HDMI },
  "hdmi-1.4": { fn: "video", gbps: 5, want: HDMI },
  "hdmi-2.0": { fn: "video", gbps: 14, want: HDMI },
  "hdmi-2.1": { fn: "video", gbps: 40, want: HDMI },
  "mini-dp": { fn: "video", gbps: 8, want: DP },
  displayport: { fn: "video", gbps: 8, want: DP },
  "ethernet-100": { fn: "net", gbps: 0.1, want: [[2006, 0.8], [2009, 0.4], [2012, 0.2]] },
  "ethernet-1g": { fn: "net", gbps: 1, want: ETHERNET },
  "ethernet-2.5g": { fn: "net", gbps: 2.5, want: ETHERNET },
  "ethernet-drop-jaw": { fn: "net", gbps: 1, want: ETHERNET },
  "modem-rj11": { fn: "legacy", gbps: 0.05, want: [[2006, 0.4], [2008, 0.2], [2010, 0]] },
  "usb-a-2.0": { fn: "usbA", gbps: 0.48, want: [[2006, 1], [2012, 1], [2016, 0.7], [2022, 0.5]] },
  "usb-a-5g": { fn: "usbA", gbps: 5, want: USB_A },
  "usb-a-10g": { fn: "usbA", gbps: 10, want: USB_A },
  "esata-usb": { fn: "usbA", gbps: 3, want: [[2008, 1], [2013, 0.8]] },
  "usb-c-5g": { fn: "usbC", gbps: 5, want: USB_C },
  "usb-c-10g": { fn: "usbC", gbps: 10, want: USB_C },
  "usb4-40g": { fn: "usbC", gbps: 40, want: USB_C },
  "thunderbolt-1": { fn: "usbC", gbps: 10, want: [[2011, 0.5]] },
  "thunderbolt-2": { fn: "usbC", gbps: 20, want: [[2013, 0.5]] },
  "thunderbolt-3": { fn: "usbC", gbps: 40, want: USB_C },
  "thunderbolt-4": { fn: "usbC", gbps: 40, want: USB_C },
  "thunderbolt-5": { fn: "usbC", gbps: 80, want: USB_C },
  "firewire-400": { fn: "legacy", gbps: 0.4, want: [[2006, 0.4], [2010, 0]] },
  "pc-card": { fn: "legacy", gbps: 1, want: [[2006, 0.5], [2008, 0.2]] },
  "expresscard-34": { fn: "legacy", gbps: 2.5, want: EXPRESS },
  "expresscard-54": { fn: "legacy", gbps: 2.5, want: EXPRESS },
  "sd-reader": { fn: "cards", gbps: 0.8, want: CARD },
  "sd-reader-uhs2": { fn: "cards", gbps: 2.5, want: CARD },
  "microsd-reader": { fn: "cards", gbps: 0.8, want: [[2014, 0.4]] },
  "headphone-mic": { fn: "audio", gbps: 0, want: [[2006, 1], [2012, 1], [2014, 0.8]] },
  "audio-combo": { fn: "audio", gbps: 0, want: [[2006, 1]] },
  "lock-slot": { fn: "lock", gbps: 0, want: [[2006, 0.2]] },
};

/** Each further port of a function is worth this share of the one before: a second USB port helps, a second Ethernet jack does not. */
const DUPLICATE: Record<Fn, number> = { usbA: 0.5, usbC: 0.5, video: 0.15, cards: 0.1, legacy: 0.2, net: 0, audio: 0, lock: 0 };
/** How much lacking Bluetooth costs while it is an option, by year. */
const BLUETOOTH_EXPECTED: Curve = [[2006, 0.3], [2009, 0.8]];

/**
 * Connectivity, a sum of points:
 *   each port      want(year) x (0.5 + 0.25 log2(1 + Gbit/s)), the best of each
 *                  function in full, each further one DUPLICATE of the one before
 *   charging from two sides on USB-C class ports   +1
 *   Wi-Fi          2 x measured receive over the mean of the year's cards, 0.25 to 2
 *   Bluetooth      +1; lacking it while it is an option costs BLUETOOTH_EXPECTED
 */
export function connectivityOf(build: Build, m: Measurements, content: Content): number {
  const y = build.year;
  const byFn = new Map<Fn, number[]>();
  const charge = new Set<string>();
  for (const bp of build.ports) {
    const part = content.parts.find((p) => p.id === bp.part);
    const shape = part && !Array.isArray(part.shape) && part.shape.kind === "port" ? part.shape : undefined;
    if (shape?.charges && bp.part !== "dc-jack") charge.add(bp.side);
    const d = PORTS[bp.part];
    if (!d) continue;
    const v = curveAt(d.want, y) * (0.5 + 0.25 * Math.log2(1 + d.gbps));
    const list = byFn.get(d.fn) ?? [];
    for (let i = 0; i < (shape?.count ?? 1); i++) list.push(v);
    byFn.set(d.fn, list);
  }
  let points = 0;
  for (const [fn, list] of byFn) {
    list.sort((a, b) => b - a);
    list.forEach((v, i) => {
      points += v * DUPLICATE[fn] ** i;
    });
  }
  if (charge.size >= 2) points += 1;
  const cards = content.parts.filter((p) => p.category === "wireless" && available(p, y));
  const mean = cards.reduce((a, p) => a + (WIFI_LAB[p.id]?.receive ?? 0), 0) / Math.max(1, cards.length);
  if (m.lab.wifi) points += 2 * Math.min(2, Math.max(0.25, m.lab.wifi.receive / Math.max(1, mean)));
  const wl = build.parts.wireless?.[0];
  const card = wl ? content.parts.find((p) => p.id === wl.part) : undefined;
  if (card) {
    const options = card.options?.bluetooth ?? [];
    const bt = wl?.opts?.bluetooth ?? options[0];
    if (options.length === 0 || (bt !== undefined && bt !== "none")) points += 1;
    else points -= curveAt(BLUETOOTH_EXPECTED, y);
  }
  return Math.max(0, points);
}
