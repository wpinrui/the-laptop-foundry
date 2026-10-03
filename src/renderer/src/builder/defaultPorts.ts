import type { BuildPort, Side } from "../engine";

// A typical mainstream laptop's ports, year by year, on its left and right
// walls (every layout has both), each wall's list in its order from the rear.
// Only ports the content offers in that year. On an Intel build the fast
// USB-C ports are Thunderbolt instead, as Intel laptops shipped them.

type Wall = string[];

const LOADOUTS: Record<number, [Wall, Wall]> = {
  2006: [
    ["dc-jack", "vga", "ethernet-100", "usb-a-2.0", "usb-a-2.0", "headphone-mic"],
    ["modem-rj11", "pc-card", "firewire-400", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2007: [
    ["dc-jack", "vga", "ethernet-1g", "usb-a-2.0", "usb-a-2.0", "headphone-mic"],
    ["modem-rj11", "pc-card", "firewire-400", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2008: [
    ["dc-jack", "vga", "ethernet-1g", "usb-a-2.0", "usb-a-2.0", "headphone-mic"],
    ["modem-rj11", "expresscard-54", "firewire-400", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2009: [
    ["dc-jack", "vga", "hdmi-1.3", "ethernet-1g", "usb-a-2.0", "usb-a-2.0", "headphone-mic"],
    ["modem-rj11", "expresscard-54", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2010: [
    ["dc-jack", "vga", "hdmi-1.3", "ethernet-1g", "esata-usb", "usb-a-2.0", "headphone-mic"],
    ["expresscard-34", "usb-a-2.0", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2011: [
    ["dc-jack", "vga", "hdmi-1.4", "ethernet-1g", "usb-a-5g", "usb-a-2.0", "headphone-mic"],
    ["usb-a-2.0", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2012: [
    ["dc-jack", "vga", "hdmi-1.4", "ethernet-1g", "usb-a-5g", "usb-a-5g", "audio-combo"],
    ["usb-a-2.0", "usb-a-2.0", "sd-reader", "lock-slot"],
  ],
  2013: [
    ["dc-jack", "vga", "hdmi-1.4", "ethernet-1g", "usb-a-5g", "usb-a-5g"],
    ["usb-a-2.0", "sd-reader", "audio-combo", "lock-slot"],
  ],
  2014: [
    ["dc-jack", "hdmi-1.4", "ethernet-1g", "usb-a-5g", "usb-a-5g"],
    ["vga", "usb-a-2.0", "sd-reader", "audio-combo", "lock-slot"],
  ],
  2015: [
    ["dc-jack", "hdmi-1.4", "ethernet-1g", "usb-a-5g", "usb-a-5g"],
    ["usb-a-5g", "sd-reader", "audio-combo", "lock-slot"],
  ],
  2016: [
    ["dc-jack", "hdmi-2.0", "ethernet-1g", "usb-c-10g", "usb-a-5g"],
    ["usb-a-5g", "sd-reader", "audio-combo", "lock-slot"],
  ],
  2017: [
    ["dc-jack", "hdmi-2.0", "ethernet-1g", "usb-c-10g", "usb-a-5g"],
    ["usb-a-5g", "sd-reader", "audio-combo", "lock-slot"],
  ],
  2018: [
    ["dc-jack", "hdmi-2.0", "usb-c-10g", "usb-a-5g"],
    ["usb-a-5g", "sd-reader", "audio-combo", "lock-slot"],
  ],
  2019: [
    ["dc-jack", "hdmi-2.0", "usb-c-10g", "usb-a-5g"],
    ["usb-a-5g", "microsd-reader", "audio-combo", "lock-slot"],
  ],
  // USB-C charging takes over from the barrel jack.
  2020: [
    ["usb-c-10g", "usb-c-10g", "hdmi-2.0", "usb-a-5g"],
    ["usb-a-5g", "microsd-reader", "audio-combo", "lock-slot"],
  ],
  2021: [
    ["usb4-40g", "usb-c-10g", "hdmi-2.1", "usb-a-5g"],
    ["usb-a-5g", "microsd-reader", "audio-combo", "lock-slot"],
  ],
  2022: [
    ["usb4-40g", "usb4-40g", "hdmi-2.1", "usb-a-5g"],
    ["usb-a-5g", "microsd-reader", "audio-combo", "lock-slot"],
  ],
  2023: [
    ["usb4-40g", "usb4-40g", "hdmi-2.1", "usb-a-10g"],
    ["usb-a-5g", "microsd-reader", "audio-combo", "lock-slot"],
  ],
  2024: [
    ["usb4-40g", "usb4-40g", "hdmi-2.1", "usb-a-10g"],
    ["usb-a-10g", "microsd-reader", "audio-combo", "lock-slot"],
  ],
  2025: [
    ["usb4-40g", "usb4-40g", "hdmi-2.1", "usb-a-10g"],
    ["usb-c-10g", "usb-a-10g", "audio-combo", "lock-slot"],
  ],
  2026: [
    ["usb4-40g", "usb4-40g", "hdmi-2.1", "usb-a-10g"],
    ["usb-c-10g", "usb-a-10g", "audio-combo", "lock-slot"],
  ],
};

const YEARS = Object.keys(LOADOUTS).map(Number);

/** On an Intel build, the year's Thunderbolt in place of its fastest USB-C: 3 from 2016, 4 from 2021. */
function thunderbolt(part: string, year: number): string {
  if (year >= 2021 && part === "usb4-40g") return "thunderbolt-4";
  if (year >= 2016 && year <= 2020 && part === "usb-c-10g") return "thunderbolt-3";
  return part;
}

/** The year's default ports, left wall then right; the nearest year's outside 2006 to 2026. */
export function defaultPorts(year: number, intel = false): BuildPort[] {
  const y = YEARS.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a));
  const [left, right] = LOADOUTS[y];
  const on = (side: Side) => (part: string): BuildPort => ({ part: intel ? thunderbolt(part, y) : part, side });
  return [...left.map(on("left")), ...right.map(on("right"))];
}
