import type { OptionValue } from "../engine";

// Option values are shown as the value itself with its unit. No keys, no prose.

const WORDS: Record<string, Record<string, string>> = {
  cols: { "15": "Standard", "19": "Numpad" },
  light: {
    none: "Unlit",
    "lid-light": "Lid light",
    backlit: "Backlit",
    white: "White backlight",
    "rgb-zones": "RGB zones",
    "rgb-per-key": "Per-key RGB",
  },
  buttons: { clickpad: "Clickpad", separate: "Buttons" },
  stick: { no: "No pointing stick", yes: "Pointing stick" },
  switchable: { no: "Always on", yes: "Switchable" },
  shutter: { no: "No shutter", yes: "Privacy shutter" },
  bluetooth: { none: "No Bluetooth", "2.0": "Bluetooth 2.0" },
  mechanism: { haptic: "Haptic", mechanical: "Mechanical" },
  thickness: { slim: "Slim", standard: "Standard" },
};

function gb(v: number): string {
  if (v < 1) return `${v * 1024} MB`;
  if (v >= 1024) return `${v / 1024} TB`;
  return `${v} GB`;
}

export function formatOption(key: string, value: OptionValue): string {
  const word = WORDS[key]?.[String(value)];
  if (word) return word;
  const n = Number(value);
  switch (key) {
    case "capacity":
      return gb(n);
    case "slots":
      return n === 1 ? "1 slot" : `${n} slots`;
    case "cells":
      return `${n}-cell`;
    case "wh":
      return `${n} Wh`;
    case "pitch":
      return `${n} mm keys`;
    case "refresh":
      return `${n} Hz`;
    default:
      return String(value);
  }
}

const PANEL_TYPE: Record<string, string> = {
  "tn-matte": "TN matte",
  "tn-glossy": "TN glossy",
  "ips-type": "IPS",
  ips: "IPS",
  oled: "OLED",
  "mini-led": "Mini-LED",
};

export function panelLabel(p: {
  inches: number;
  res: [number, number];
  type: string;
}): string {
  return `${p.inches}" ${p.res[0]} x ${p.res[1]} ${PANEL_TYPE[p.type] ?? p.type}`;
}
