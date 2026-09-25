import type { Part, PortGroup } from "../types";

// Opening is width along the edge by height. Depth is how far the connector
// reaches into the chassis (USB-A calibrated to a 13.5 mm mid-mount receptacle). A side's strip packs its ports in group order:
// power, video, network, USB, cards, audio, then anything else.

function port(
  id: string,
  name: string,
  from: number,
  until: number,
  group: PortGroup,
  width: number,
  height: number,
  depth: number,
  extra: {
    charges?: boolean;
    count?: number;
    controller?: boolean;
    needs?: string[];
  } = {},
): Part {
  return {
    id,
    name,
    category: "port",
    from,
    until,
    shape: {
      kind: "port",
      width,
      height,
      depth,
      group,
      count: extra.count,
      charges: extra.charges,
      controller: extra.controller ? { x: 20, y: 20, z: 1.5 } : undefined,
    },
    compact: [],
    needs: extra.needs,
  };
}

const intel = ["platform:intel"];

export const PORTS: Part[] = [
  port("dc-jack", "DC barrel jack", 1990, 2099, "power", 9, 9, 13, {
    charges: true,
  }),
  port("vga", "VGA", 1990, 2014, "video", 31, 13, 12),
  port("dvi-d", "DVI-D", 2000, 2012, "video", 40, 15, 12),
  port("s-video", "S-Video", 1995, 2010, "video", 10, 10, 12),
  port("hdmi-1.3", "HDMI", 2006, 2014, "video", 15, 6, 12),
  port("hdmi-2.1", "HDMI 2.1", 2020, 2099, "video", 15, 6, 12),
  port("ethernet-100", "Ethernet 100M", 1995, 2012, "network", 16, 14, 21),
  port("ethernet-1g", "Ethernet 1G", 2004, 2099, "network", 16, 14, 21),
  port("ethernet-2.5g", "Ethernet 2.5G", 2020, 2099, "network", 16, 14, 21),
  port(
    "ethernet-drop-jaw",
    "Ethernet, drop-jaw",
    2015,
    2099,
    "network",
    16,
    8,
    21,
  ),
  port("modem-rj11", "Modem RJ11", 1990, 2010, "network", 11, 10, 16),
  port("usb-a-2.0", "USB-A 2.0", 2001, 2014, "usb", 14, 7, 13.5),
  port("usb-a-5g", "USB-A 5 Gbps", 2010, 2099, "usb", 14, 7, 13.5),
  port("usb-a-10g", "USB-A 10 Gbps", 2014, 2099, "usb", 14, 7, 13.5),
  port("usb-c-10g", "USB-C 10 Gbps", 2016, 2099, "usb", 9.5, 4, 9, {
    charges: true,
  }),
  port("usb4-40g", "USB4 40 Gbps", 2020, 2099, "usb", 9.5, 4, 9, {
    charges: true,
  }),
  port("thunderbolt-4", "Thunderbolt 4", 2020, 2099, "usb", 9.5, 4, 9, {
    charges: true,
    needs: intel,
  }),
  port("thunderbolt-5", "Thunderbolt 5", 2024, 2099, "usb", 9.5, 4, 9, {
    charges: true,
    needs: intel,
    controller: true,
  }),
  port("firewire-400", "FireWire 400 (4-pin)", 1998, 2010, "usb", 6, 4, 10),
  port("pc-card", "PC Card (Type II)", 1995, 2008, "cards", 56, 7, 86),
  port("expresscard-34", "ExpressCard/34", 2005, 2012, "cards", 36, 7, 75),
  port("expresscard-54", "ExpressCard/54", 2005, 2012, "cards", 56, 7, 75),
  port("sd-reader", "SD card reader", 2004, 2016, "cards", 26, 4, 30),
  port(
    "sd-reader-uhs2",
    "SD card reader (UHS-II)",
    2018,
    2099,
    "cards",
    26,
    4,
    30,
  ),
  port("microsd-reader", "microSD reader", 2014, 2099, "cards", 12, 2, 15),
  port(
    "headphone-mic",
    "Headphone, mic (separate)",
    1990,
    2012,
    "audio",
    7,
    7,
    12,
    { count: 2 },
  ),
  port("audio-combo", "3.5 mm combo jack", 2012, 2099, "audio", 7, 7, 12),
  port("lock-slot", "Lock slot", 1995, 2099, "other", 7, 3, 5),
];

export const PORT_GROUP_ORDER: PortGroup[] = [
  "power",
  "video",
  "network",
  "usb",
  "cards",
  "audio",
  "other",
];
