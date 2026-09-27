import type { ClassCell, CpuVendor, HeadlineStat, Line, LineShape, Maker, PriceWaypoint, StatWeights } from "./types";
import { HEADLINE_STATS } from "./types";

// Real makers and their real laptop lines, 2006 to 2026 (GDD, Version 0.2,
// "Makers and lines"). A line makes one model per year. Nothing reads this yet:
// the rival generator will.
//
// Years are calendar years a model was on sale in the US. A year without a
// real refresh carries the model over, so the generator may still make a
// model for it. Prices are typical launch prices in the year's nominal US
// dollars, low to high configuration. Shapes pick the class cell (see
// engine/price classify), the body ids, the panel range and the processor
// makers. Priorities are points out of 100 over the market score's headline
// stats, normalised to sum to 1.

export const MAKERS: Maker[] = [
  { id: "lenovo", name: "Lenovo" },
  { id: "dell", name: "Dell" },
  { id: "hp", name: "HP" },
  { id: "apple", name: "Apple" },
  { id: "asus", name: "Asus" },
  { id: "acer", name: "Acer" },
  { id: "msi", name: "MSI" },
  { id: "samsung", name: "Samsung" },
  { id: "microsoft", name: "Microsoft" },
  { id: "razer", name: "Razer" },
  { id: "toshiba", name: "Toshiba" },
  { id: "sony", name: "Sony" },
];

/** Priority points out of 100; missing stats are 0. */
function w(points: Partial<Record<HeadlineStat, number>>): StatWeights {
  const out = {} as StatWeights;
  for (const k of HEADLINE_STATS) out[k] = (points[k] ?? 0) / 100;
  return out;
}

function cell(budget: ClassCell["budget"], body: ClassCell["body"], performance: ClassCell["performance"]): ClassCell {
  return { budget, body, performance };
}

function shape(from: number, c: ClassCell, bodies: string[], screen: [number, number], cpu: CpuVendor[]): LineShape {
  return { from, class: c, bodies, screen, cpu };
}

function p(year: number, low: number, high: number): PriceWaypoint {
  return { year, low, high };
}

const TL = "thin and light";

export const LINES: Line[] = [
  // ------------------------------------------------------------ Lenovo
  {
    id: "lenovo-ideapad",
    maker: "lenovo",
    name: "IdeaPad",
    years: [[2008, 2026]],
    shapes: [
      // The Y-series multimedia machines were the line's face until Legion took gaming.
      shape(2008, cell("midrange", "medium", "mixed-use"), ["pillow", "slant", "workhorse"], [14, 17], ["intel"]),
      shape(2014, cell("low", "medium", "office"), ["slant", "float", "capsule", "workhorse"], [14, 17.3], ["intel", "amd"]),
      shape(2019, cell("low", "medium", "office"), ["ultra", "float", "lift", "slant"], [14, 16], ["amd", "intel"]),
    ],
    price: [p(2008, 800, 1300), p(2013, 600, 1100), p(2014, 350, 700), p(2020, 400, 800), p(2026, 450, 900)],
    priorities: w({ price: 25, app: 12, games: 4, battery: 10, portability: 8, display: 8, chassis: 6, keyboard: 8, trackpad: 4, connectivity: 7, thermals: 4, audio: 4 }),
    note: "Launched January 2008 (Y510, U110). The 2007 rival field's Y510 is its early announcement.",
  },
  {
    id: "lenovo-yoga",
    maker: "lenovo",
    name: "Yoga",
    names: [
      { from: 2012, name: "IdeaPad Yoga" },
      { from: 2013, name: "Yoga" },
    ],
    years: [[2012, 2026]],
    shapes: [
      shape(2012, cell("midrange", TL, "office"), ["capsule", "wedge", "slant"], [13.3, 14], ["intel"]),
      shape(2015, cell("midrange", TL, "office"), ["ultra", "capsule", "wedge"], [13.3, 15.6], ["intel"]),
      shape(2020, cell("premium", TL, "office"), ["ultra", "aero", "knife", "capsule"], [13.3, 16], ["intel", "amd"]),
    ],
    price: [p(2012, 1000, 1600), p(2016, 900, 1500), p(2020, 1000, 1700), p(2026, 1100, 1900)],
    priorities: w({ price: 10, app: 10, games: 1, battery: 14, portability: 16, display: 15, chassis: 14, keyboard: 7, trackpad: 5, connectivity: 3, thermals: 2, audio: 3 }),
  },
  {
    id: "lenovo-thinkpad",
    maker: "lenovo",
    name: "ThinkPad",
    years: [[2006, 2026]],
    shapes: [
      // The T series is the line's model.
      shape(2006, cell("premium", "medium", "office"), ["workhorse"], [12.1, 15.4], ["intel"]),
      shape(2012, cell("premium", "medium", "office"), ["workhorse", "slant"], [12.5, 15.6], ["intel"]),
      shape(2019, cell("premium", TL, "office"), ["workhorse", "ultra", "slant"], [13.3, 16], ["intel", "amd"]),
      shape(2024, cell("premium", TL, "office"), ["workhorse", "ultra", "slant"], [13.3, 16], ["intel", "amd", "qualcomm"]),
    ],
    price: [p(2006, 1300, 2400), p(2012, 1000, 1900), p(2019, 1200, 2100), p(2026, 1300, 2300)],
    priorities: w({ price: 8, app: 12, battery: 14, portability: 8, display: 5, chassis: 15, keyboard: 20, trackpad: 6, connectivity: 9, thermals: 3 }),
  },
  {
    id: "lenovo-legion",
    maker: "lenovo",
    name: "Legion",
    years: [[2017, 2026]],
    shapes: [shape(2017, cell("midrange", "medium", "gaming"), ["shelf", "slant", "workhorse"], [15.6, 17.3], ["intel", "amd"])],
    price: [p(2017, 900, 1800), p(2021, 1100, 2200), p(2026, 1200, 2800)],
    priorities: w({ price: 12, app: 12, games: 30, battery: 2, portability: 2, display: 12, chassis: 6, keyboard: 8, trackpad: 1, connectivity: 5, thermals: 9, audio: 1 }),
    note: "Legion Y520 and Y720, January 2017. Before that the IdeaPad Y series carried Lenovo gaming.",
  },

  // ------------------------------------------------------------ Dell
  {
    id: "dell-inspiron",
    maker: "dell",
    name: "Inspiron",
    names: [
      { from: 2006, name: "Inspiron" },
      { from: 2025, name: "Dell Plus" },
    ],
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("low", "medium", "office"), ["pillow", "workhorse"], [14, 17], ["intel"]),
      shape(2010, cell("low", "medium", "office"), ["slant", "pillow", "workhorse"], [14, 17.3], ["intel", "amd"]),
      shape(2016, cell("low", "medium", "office"), ["slant", "float", "capsule"], [14, 17.3], ["intel", "amd"]),
      shape(2021, cell("low", "medium", "office"), ["ultra", "aero", "float", "slant"], [14, 16], ["intel", "amd"]),
    ],
    price: [p(2006, 600, 1100), p(2012, 450, 900), p(2020, 450, 900), p(2026, 500, 1000)],
    priorities: w({ price: 30, app: 12, games: 3, battery: 10, portability: 6, display: 7, chassis: 6, keyboard: 7, trackpad: 4, connectivity: 7, thermals: 4, audio: 4 }),
    note: "Dell retired the Inspiron, XPS and Latitude names in 2025 for Dell, Dell Pro and Dell Premium. The products carried on, so the lines do too, under the new names.",
  },
  {
    id: "dell-xps",
    maker: "dell",
    name: "XPS",
    names: [
      { from: 2006, name: "XPS" },
      { from: 2025, name: "Dell Premium" },
      { from: 2026, name: "XPS" },
    ],
    years: [[2006, 2026]],
    shapes: [
      // M1330, M1530, Studio XPS, XPS 15: premium multimedia.
      shape(2006, cell("premium", "medium", "mixed-use"), ["workhorse", "pillow", "slant"], [13.3, 17], ["intel"]),
      // The XPS 13 becomes the line's face.
      shape(2012, cell("premium", TL, "office"), ["wedge", "blade", "ultra"], [13.3, 15.6], ["intel"]),
      shape(2019, cell("premium", TL, "office"), ["ultra", "knife", "aero"], [13.3, 16], ["intel"]),
      shape(2024, cell("premium", TL, "office"), ["aero", "ultra", "knife"], [13.4, 16], ["intel", "qualcomm"]),
    ],
    price: [p(2006, 1300, 2800), p(2012, 1000, 1800), p(2018, 1000, 2000), p(2026, 1300, 2400)],
    priorities: w({ price: 5, app: 13, games: 3, battery: 12, portability: 14, display: 18, chassis: 16, keyboard: 6, trackpad: 7, connectivity: 2, thermals: 1, audio: 3 }),
    note: "Sold as Dell 14 and 16 Premium in 2025; the XPS name came back in January 2026.",
  },
  {
    id: "dell-latitude",
    maker: "dell",
    name: "Latitude",
    names: [
      { from: 2006, name: "Latitude" },
      { from: 2025, name: "Dell Pro" },
    ],
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("premium", "medium", "office"), ["workhorse", "field"], [12.1, 15.4], ["intel"]),
      shape(2019, cell("premium", TL, "office"), ["workhorse", "ultra", "slant", "field"], [13.3, 15.6], ["intel", "amd"]),
    ],
    price: [p(2006, 1200, 2200), p(2016, 900, 1800), p(2026, 1200, 2200)],
    priorities: w({ price: 10, app: 12, battery: 15, portability: 8, display: 5, chassis: 16, keyboard: 14, trackpad: 5, connectivity: 12, thermals: 3 }),
  },
  {
    id: "dell-alienware",
    maker: "dell",
    name: "Alienware",
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("premium", "large", "gaming"), ["workhorse", "wedge", "slant"], [15.4, 17], ["intel"]),
      shape(2014, cell("premium", "large", "gaming"), ["shelf", "workhorse", "slant"], [15.6, 17.3], ["intel"]),
      shape(2021, cell("premium", "large", "gaming"), ["shelf", "workhorse", "slant"], [15.6, 18], ["intel", "amd"]),
    ],
    price: [p(2006, 2200, 4500), p(2012, 1500, 3500), p(2018, 1300, 3500), p(2026, 1800, 4500)],
    priorities: w({ price: 3, app: 12, games: 32, battery: 1, portability: 1, display: 14, chassis: 12, keyboard: 7, trackpad: 1, connectivity: 5, thermals: 8, audio: 4 }),
    note: "Dell bought Alienware in 2006 and kept it as its own brand, so it counts from 2006.",
  },

  // ------------------------------------------------------------ HP
  {
    id: "hp-pavilion",
    maker: "hp",
    name: "Pavilion",
    names: [
      { from: 2006, name: "Pavilion" },
      { from: 2025, name: "OmniBook 5" },
    ],
    years: [[2006, 2026]],
    shapes: [
      // The dv series sat above the Compaq Presario budget machines.
      shape(2006, cell("midrange", "medium", "office"), ["pillow", "workhorse"], [14, 17], ["intel", "amd"]),
      shape(2013, cell("low", "medium", "office"), ["slant", "capsule", "float"], [14, 17.3], ["intel", "amd"]),
      shape(2019, cell("low", "medium", "office"), ["ultra", "slant", "float"], [14, 16], ["intel", "amd"]),
    ],
    price: [p(2006, 800, 1500), p(2012, 550, 1000), p(2013, 450, 850), p(2026, 500, 950)],
    priorities: w({ price: 28, app: 11, games: 4, battery: 9, portability: 6, display: 8, chassis: 7, keyboard: 6, trackpad: 4, connectivity: 6, thermals: 3, audio: 8 }),
    note: "HP folded Pavilion, Envy and Spectre into OmniBook for 2025. The lines carry on under the new names.",
  },
  {
    id: "hp-envy",
    maker: "hp",
    name: "Envy",
    names: [
      { from: 2009, name: "Envy" },
      { from: 2025, name: "OmniBook 7" },
    ],
    years: [[2009, 2026]],
    shapes: [
      shape(2009, cell("premium", "medium", "mixed-use"), ["blade", "wedge", "slant"], [13.3, 17.3], ["intel"]),
      shape(2013, cell("midrange", TL, "office"), ["slant", "capsule", "wedge"], [13.3, 15.6], ["intel", "amd"]),
      shape(2019, cell("midrange", TL, "office"), ["ultra", "knife", "facet"], [13.3, 16], ["intel", "amd"]),
    ],
    price: [p(2009, 1200, 2000), p(2012, 1000, 1700), p(2013, 800, 1400), p(2026, 800, 1400)],
    priorities: w({ price: 12, app: 12, games: 3, battery: 11, portability: 12, display: 13, chassis: 15, keyboard: 6, trackpad: 5, connectivity: 3, thermals: 2, audio: 6 }),
    note: "Envy 13 and 15, October 2009, from the Voodoo acquisition.",
  },
  {
    id: "hp-spectre",
    maker: "hp",
    name: "Spectre",
    names: [
      { from: 2012, name: "Spectre" },
      { from: 2025, name: "OmniBook Ultra" },
    ],
    years: [[2012, 2026]],
    shapes: [
      shape(2012, cell("premium", TL, "office"), ["wedge", "blade", "capsule"], [13.3, 14], ["intel"]),
      shape(2015, cell("premium", TL, "office"), ["ultra", "wedge", "capsule"], [13.3, 15.6], ["intel"]),
      shape(2019, cell("premium", TL, "office"), ["facet", "knife", "ultra"], [13.3, 16], ["intel"]),
    ],
    price: [p(2012, 1000, 1600), p(2016, 1150, 1700), p(2026, 1300, 2000)],
    priorities: w({ price: 4, app: 10, games: 1, battery: 13, portability: 16, display: 17, chassis: 20, keyboard: 6, trackpad: 5, connectivity: 2, thermals: 1, audio: 5 }),
    note: "Envy 14 Spectre, February 2012.",
  },
  {
    id: "hp-elitebook",
    maker: "hp",
    name: "EliteBook",
    names: [
      { from: 2006, name: "Compaq" },
      { from: 2008, name: "EliteBook" },
    ],
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("premium", "medium", "office"), ["workhorse"], [12.1, 15.4], ["intel"]),
      shape(2013, cell("premium", TL, "office"), ["workhorse", "blade", "slant"], [12.5, 15.6], ["intel", "amd"]),
      shape(2016, cell("premium", TL, "office"), ["ultra", "workhorse", "knife"], [13.3, 15.6], ["intel", "amd"]),
      shape(2024, cell("premium", TL, "office"), ["ultra", "knife", "workhorse"], [13.3, 16], ["intel", "amd", "qualcomm"]),
    ],
    price: [p(2006, 1200, 2200), p(2013, 1100, 2000), p(2026, 1200, 2300)],
    priorities: w({ price: 8, app: 12, battery: 14, portability: 10, display: 6, chassis: 16, keyboard: 14, trackpad: 5, connectivity: 11, thermals: 3, audio: 1 }),
    note: "EliteBook launched in 2008 as the direct successor of HP Compaq business notebooks (2510p to 2530p, 6910p to 6930p), so 2006 and 2007 run under the Compaq name, as the rival field does.",
  },
  {
    id: "hp-omen",
    maker: "hp",
    name: "Omen",
    years: [[2014, 2026]],
    shapes: [
      shape(2014, cell("premium", "medium", "gaming"), ["slant", "blade", "wedge"], [15.6, 15.6], ["intel"]),
      shape(2016, cell("midrange", "medium", "gaming"), ["shelf", "slant", "workhorse"], [15.6, 17.3], ["intel", "amd"]),
    ],
    price: [p(2014, 1500, 2200), p(2016, 1000, 1800), p(2026, 1100, 2600)],
    priorities: w({ price: 16, app: 11, games: 30, battery: 2, portability: 2, display: 11, chassis: 6, keyboard: 7, trackpad: 1, connectivity: 4, thermals: 8, audio: 2 }),
    note: "Omen 15, November 2014. From 2016 Omen by HP replaced Pavilion Gaming and moved down to midrange.",
  },

  // ------------------------------------------------------------ Apple
  {
    id: "apple-macbook",
    maker: "apple",
    name: "MacBook",
    years: [
      [2006, 2011],
      [2015, 2019],
    ],
    shapes: [
      shape(2006, cell("midrange", "medium", "office"), ["pillow", "teardrop"], [13.3, 13.3], ["intel"]),
      shape(2015, cell("premium", TL, "office"), ["teardrop", "ultra", "wedge"], [12, 12], ["intel"]),
    ],
    price: [p(2006, 1099, 1499), p(2011, 999, 999), p(2015, 1299, 1599), p(2019, 1299, 1599)],
    priorities: w({ price: 12, app: 10, games: 2, battery: 16, portability: 14, display: 10, chassis: 14, keyboard: 6, trackpad: 9, connectivity: 2, thermals: 2, audio: 3 }),
    note: "The white MacBook's last model was Mid 2010; consumer sales ended July 2011 (education until February 2012). The 12-inch ran from April 2015 to July 2019, last refreshed in 2017.",
  },
  {
    id: "apple-macbook-air",
    maker: "apple",
    name: "MacBook Air",
    years: [[2008, 2026]],
    shapes: [
      shape(2008, cell("premium", TL, "office"), ["teardrop", "wedge"], [13.3, 13.3], ["intel"]),
      shape(2010, cell("midrange", TL, "office"), ["wedge", "teardrop"], [11.6, 13.3], ["intel"]),
      shape(2018, cell("midrange", TL, "office"), ["wedge", "ultra"], [13.3, 13.3], ["intel"]),
      shape(2020, cell("midrange", TL, "office"), ["wedge", "ultra"], [13.3, 13.3], ["apple"]),
      shape(2022, cell("midrange", TL, "office"), ["aero", "ultra"], [13.6, 15.3], ["apple"]),
    ],
    price: [p(2008, 1799, 3098), p(2010, 999, 1599), p(2016, 899, 1199), p(2020, 999, 1249), p(2023, 1099, 1699), p(2026, 999, 1799)],
    priorities: w({ price: 8, app: 10, games: 1, battery: 18, portability: 18, display: 11, chassis: 14, keyboard: 6, trackpad: 9, connectivity: 1, thermals: 2, audio: 2 }),
    rivalOnlyFrom: 2020,
    note: "The M1 Air (November 2020) is the 2020 model.",
  },
  {
    id: "apple-macbook-pro",
    maker: "apple",
    name: "MacBook Pro",
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("premium", "medium", "mixed-use"), ["teardrop", "pillow"], [15.4, 17], ["intel"]),
      shape(2009, cell("premium", "medium", "mixed-use"), ["slant", "teardrop"], [13.3, 17], ["intel"]),
      shape(2013, cell("premium", "medium", "mixed-use"), ["slant", "teardrop"], [13.3, 15.4], ["intel"]),
      shape(2016, cell("premium", "medium", "mixed-use"), ["ultra", "slant"], [13.3, 15.4], ["intel"]),
      shape(2019, cell("premium", "medium", "mixed-use"), ["ultra", "slant"], [13.3, 16], ["intel"]),
      shape(2020, cell("premium", "medium", "mixed-use"), ["ultra", "slant"], [13.3, 16], ["apple"]),
      shape(2021, cell("premium", "medium", "mixed-use"), ["aero", "ultra"], [14.2, 16.2], ["apple"]),
    ],
    price: [p(2006, 1999, 2799), p(2012, 1199, 2799), p(2016, 1499, 2799), p(2021, 1999, 3499), p(2026, 1599, 3999)],
    priorities: w({ price: 2, app: 20, games: 4, battery: 12, portability: 6, display: 18, chassis: 14, keyboard: 5, trackpad: 8, connectivity: 4, thermals: 3, audio: 4 }),
    rivalOnlyFrom: 2020,
    note: "The 15 and 16 inch Pro is the line's model. 17 inch dropped in 2012, 13 inch from 2009, M1 13 inch (November 2020) is the 2020 model.",
  },

  // ------------------------------------------------------------ Asus
  {
    id: "asus-vivobook",
    maker: "asus",
    name: "VivoBook",
    names: [
      { from: 2006, name: "X series" },
      { from: 2012, name: "VivoBook" },
    ],
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("low", "medium", "office"), ["pillow", "workhorse"], [14, 17], ["intel"]),
      shape(2012, cell("low", "medium", "office"), ["slant", "capsule", "pillow"], [11.6, 15.6], ["intel", "amd"]),
      shape(2019, cell("low", "medium", "office"), ["lift", "ultra", "float"], [14, 16], ["intel", "amd"]),
      shape(2024, cell("low", "medium", "office"), ["lift", "ultra", "aero"], [14, 16], ["intel", "amd", "qualcomm"]),
    ],
    price: [p(2006, 600, 1000), p(2012, 400, 800), p(2026, 450, 950)],
    priorities: w({ price: 32, app: 12, games: 3, battery: 10, portability: 8, display: 7, chassis: 6, keyboard: 6, trackpad: 4, connectivity: 6, thermals: 3, audio: 3 }),
    note: "VivoBook launched in late 2012 and absorbed the mainstream X series (X540 and on were sold as VivoBook), so the X series stands in from 2006.",
  },
  {
    id: "asus-zenbook",
    maker: "asus",
    name: "ZenBook",
    years: [[2011, 2026]],
    shapes: [
      shape(2011, cell("midrange", TL, "office"), ["wedge", "teardrop"], [11.6, 13.3], ["intel"]),
      shape(2015, cell("midrange", TL, "office"), ["ultra", "wedge"], [13.3, 15.6], ["intel"]),
      shape(2019, cell("midrange", TL, "office"), ["lift", "ultra", "knife"], [13.3, 15.6], ["intel", "amd"]),
      shape(2022, cell("midrange", TL, "office"), ["aero", "ultra", "lift"], [13.3, 16], ["intel", "amd"]),
      shape(2025, cell("midrange", TL, "office"), ["aero", "ultra", "lift"], [13.3, 16], ["intel", "amd", "qualcomm"]),
    ],
    price: [p(2011, 999, 1499), p(2015, 700, 1300), p(2026, 900, 1600)],
    priorities: w({ price: 12, app: 10, games: 2, battery: 14, portability: 17, display: 14, chassis: 14, keyboard: 6, trackpad: 5, connectivity: 3, thermals: 1, audio: 2 }),
    note: "UX21 and UX31, October 2011.",
  },
  {
    id: "asus-rog",
    maker: "asus",
    name: "ROG",
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("premium", "large", "gaming"), ["workhorse", "pillow", "wedge"], [15.4, 17.3], ["intel"]),
      shape(2014, cell("premium", "medium", "gaming"), ["slant", "shelf", "blade"], [15.6, 17.3], ["intel"]),
      shape(2019, cell("premium", "medium", "gaming"), ["shelf", "slant", "knife"], [14, 18], ["intel", "amd"]),
    ],
    price: [p(2006, 1800, 3000), p(2014, 1200, 2600), p(2026, 1400, 3500)],
    priorities: w({ price: 5, app: 12, games: 32, battery: 2, portability: 2, display: 14, chassis: 8, keyboard: 8, trackpad: 1, connectivity: 5, thermals: 9, audio: 2 }),
    note: "Republic of Gamers laptops from the 2006 G1 and G2P.",
  },

  // ------------------------------------------------------------ Acer
  {
    id: "acer-aspire",
    maker: "acer",
    name: "Aspire",
    years: [[2006, 2026]],
    shapes: [
      shape(2006, cell("low", "medium", "office"), ["pillow", "workhorse"], [14, 17], ["intel", "amd"]),
      shape(2012, cell("low", "medium", "office"), ["slant", "capsule", "float"], [14, 17.3], ["intel", "amd"]),
      shape(2019, cell("low", "medium", "office"), ["slant", "ultra", "float"], [14, 17.3], ["intel", "amd"]),
    ],
    price: [p(2006, 500, 1000), p(2012, 400, 750), p(2026, 400, 800)],
    priorities: w({ price: 34, app: 12, games: 3, battery: 10, portability: 6, display: 6, chassis: 5, keyboard: 6, trackpad: 3, connectivity: 8, thermals: 3, audio: 4 }),
  },
  {
    id: "acer-swift",
    maker: "acer",
    name: "Swift",
    names: [
      { from: 2011, name: "Aspire S" },
      { from: 2016, name: "Swift" },
    ],
    years: [[2011, 2026]],
    shapes: [
      shape(2011, cell("premium", TL, "office"), ["wedge", "blade"], [13.3, 13.3], ["intel"]),
      shape(2016, cell("midrange", TL, "office"), ["ultra", "wedge"], [13.3, 15.6], ["intel", "amd"]),
      shape(2021, cell("midrange", TL, "office"), ["ultra", "aero", "knife"], [13.3, 16], ["intel", "amd"]),
      shape(2024, cell("midrange", TL, "office"), ["aero", "ultra", "knife"], [13.3, 16], ["intel", "amd", "qualcomm"]),
    ],
    price: [p(2011, 900, 1650), p(2016, 600, 1200), p(2026, 700, 1400)],
    priorities: w({ price: 16, app: 10, games: 1, battery: 15, portability: 22, display: 11, chassis: 11, keyboard: 5, trackpad: 4, connectivity: 3, thermals: 1, audio: 1 }),
    note: "Swift launched in 2016 as the successor of the Aspire S3 and S7 ultrabooks (from 2011), which stand in before it.",
  },
  {
    id: "acer-predator",
    maker: "acer",
    name: "Predator",
    years: [[2015, 2026]],
    shapes: [
      shape(2015, cell("premium", "large", "gaming"), ["shelf", "workhorse", "slant"], [15.6, 17.3], ["intel"]),
      // Helios 300 becomes the volume model.
      shape(2017, cell("midrange", "medium", "gaming"), ["shelf", "slant"], [15.6, 17.3], ["intel", "amd"]),
    ],
    price: [p(2015, 1500, 2500), p(2017, 1100, 2400), p(2026, 1300, 3000)],
    priorities: w({ price: 12, app: 11, games: 32, battery: 2, portability: 1, display: 12, chassis: 6, keyboard: 8, trackpad: 1, connectivity: 4, thermals: 10, audio: 1 }),
    note: "Predator 15 and 17, 2015. Before that Acer gaming ran as Aspire models.",
  },

  // ------------------------------------------------------------ MSI
  {
    id: "msi-modern",
    maker: "msi",
    name: "Modern",
    years: [[2019, 2026]],
    shapes: [shape(2019, cell("low", TL, "office"), ["lift", "ultra", "slant"], [14, 15.6], ["intel", "amd"])],
    price: [p(2019, 550, 900), p(2026, 500, 900)],
    priorities: w({ price: 30, app: 12, battery: 13, portability: 16, display: 6, chassis: 6, keyboard: 6, trackpad: 3, connectivity: 6, thermals: 2 }),
    note: "Modern 14 and 15, Computex 2019.",
  },
  {
    id: "msi-prestige",
    maker: "msi",
    name: "Prestige",
    years: [[2019, 2026]],
    shapes: [shape(2019, cell("premium", TL, "mixed-use"), ["ultra", "knife", "aero"], [13.3, 16], ["intel"])],
    price: [p(2019, 1200, 1800), p(2026, 1100, 1900)],
    priorities: w({ price: 8, app: 18, games: 5, battery: 14, portability: 14, display: 18, chassis: 10, keyboard: 5, trackpad: 4, connectivity: 3, thermals: 1 }),
    note: "Prestige 14 and 15, Computex 2019, for creators.",
  },
  {
    id: "msi-titan",
    maker: "msi",
    name: "Titan",
    names: [
      { from: 2008, name: "GX" },
      { from: 2009, name: "GT" },
      { from: 2015, name: "Titan" },
    ],
    years: [[2008, 2026]],
    shapes: [
      shape(2008, cell("premium", "large", "gaming"), ["workhorse", "wedge", "slant"], [15.4, 17.3], ["intel"]),
      shape(2014, cell("premium", "large", "gaming"), ["shelf", "workhorse", "slant"], [17.3, 18], ["intel"]),
    ],
    price: [p(2008, 1500, 2500), p(2014, 2000, 3500), p(2020, 2500, 4500), p(2026, 3500, 5500)],
    priorities: w({ price: 1, app: 14, games: 34, battery: 1, display: 14, chassis: 6, keyboard: 12, trackpad: 1, connectivity: 6, thermals: 9, audio: 2 }),
    note: "MSI's flagship desktop replacement: GX600 and GX700, then GT, then GT80 Titan from 2015 and Titan 18 today.",
  },
  {
    id: "msi-katana",
    maker: "msi",
    name: "Katana",
    names: [
      { from: 2017, name: "GF" },
      { from: 2021, name: "Katana" },
    ],
    years: [[2017, 2026]],
    shapes: [shape(2017, cell("midrange", "medium", "gaming"), ["slant", "shelf", "workhorse"], [15.6, 17.3], ["intel"])],
    price: [p(2017, 750, 1100), p(2026, 800, 1300)],
    priorities: w({ price: 30, app: 10, games: 30, battery: 2, portability: 3, display: 7, chassis: 3, keyboard: 5, trackpad: 1, connectivity: 3, thermals: 5, audio: 1 }),
    note: "MSI's entry gaming line: GF62 and GF63 from 2017, Katana from 2021.",
  },

  // ------------------------------------------------------------ Samsung
  {
    id: "samsung-galaxy-book",
    maker: "samsung",
    name: "Galaxy Book",
    names: [
      { from: 2011, name: "Series 9" },
      { from: 2013, name: "ATIV Book 9" },
      { from: 2015, name: "Notebook 9" },
      { from: 2018, name: "Galaxy Book" },
    ],
    years: [[2011, 2026]],
    shapes: [
      shape(2011, cell("premium", TL, "office"), ["wedge", "blade", "teardrop"], [13.3, 15], ["intel"]),
      shape(2015, cell("premium", TL, "office"), ["ultra", "wedge"], [13.3, 15], ["intel"]),
      shape(2021, cell("premium", TL, "office"), ["aero", "ultra", "knife"], [13.3, 16], ["intel"]),
      shape(2024, cell("premium", TL, "office"), ["aero", "ultra", "knife"], [14, 16], ["intel", "qualcomm"]),
    ],
    price: [p(2011, 1300, 1700), p(2015, 1000, 1500), p(2021, 1000, 1600), p(2026, 1100, 1900)],
    priorities: w({ price: 8, app: 9, games: 1, battery: 16, portability: 20, display: 20, chassis: 12, keyboard: 5, trackpad: 4, connectivity: 2, thermals: 1, audio: 2 }),
    note: "Galaxy Book naming from 2018. Before it, the same premium thin-and-light slot ran from the 2011 Series 9 through ATIV Book 9 and Notebook 9. Samsung's earlier US laptops were minor, so the line starts in 2011.",
  },

  // ------------------------------------------------------------ Microsoft
  {
    id: "microsoft-surface-laptop",
    maker: "microsoft",
    name: "Surface Laptop",
    years: [[2017, 2026]],
    shapes: [
      shape(2017, cell("premium", TL, "office"), ["ultra", "capsule"], [13.5, 13.5], ["intel"]),
      shape(2019, cell("premium", TL, "office"), ["ultra", "capsule"], [13.5, 15], ["intel", "amd"]),
      shape(2021, cell("premium", TL, "office"), ["aero", "ultra"], [13.5, 15], ["intel", "amd"]),
      shape(2024, cell("premium", TL, "office"), ["aero", "ultra"], [13, 15], ["qualcomm", "intel"]),
    ],
    price: [p(2017, 999, 2199), p(2021, 999, 2399), p(2026, 899, 2400)],
    priorities: w({ price: 8, app: 9, games: 1, battery: 15, portability: 14, display: 18, chassis: 17, keyboard: 8, trackpad: 6, connectivity: 1, thermals: 1, audio: 2 }),
    note: "Surface Laptop, May 2017.",
  },

  // ------------------------------------------------------------ Razer
  {
    id: "razer-blade",
    maker: "razer",
    name: "Blade",
    years: [[2012, 2026]],
    shapes: [
      shape(2012, cell("premium", "medium", "gaming"), ["workhorse", "slant", "blade"], [14, 17.3], ["intel"]),
      shape(2018, cell("premium", "medium", "gaming"), ["workhorse", "knife", "slant"], [14, 17.3], ["intel"]),
      shape(2021, cell("premium", "medium", "gaming"), ["workhorse", "knife", "aero"], [14, 18], ["intel", "amd"]),
    ],
    price: [p(2012, 1800, 2800), p(2018, 1900, 3000), p(2026, 2300, 4500)],
    priorities: w({ price: 2, app: 12, games: 28, battery: 3, portability: 10, display: 15, chassis: 16, keyboard: 5, trackpad: 4, connectivity: 2, thermals: 2, audio: 1 }),
    note: "The first Razer Blade shipped in January 2012.",
  },

  // ------------------------------------------------------------ Toshiba
  {
    id: "toshiba-satellite",
    maker: "toshiba",
    name: "Satellite",
    years: [[2006, 2016]],
    shapes: [
      shape(2006, cell("low", "medium", "office"), ["pillow", "workhorse"], [14, 17], ["intel", "amd"]),
      shape(2010, cell("low", "medium", "office"), ["slant", "pillow", "workhorse"], [14, 17.3], ["intel", "amd"]),
      shape(2013, cell("low", "medium", "office"), ["slant", "capsule", "float"], [14, 17.3], ["intel", "amd"]),
    ],
    price: [p(2006, 600, 1100), p(2016, 400, 800)],
    priorities: w({ price: 34, app: 11, games: 3, battery: 9, portability: 5, display: 7, chassis: 6, keyboard: 6, trackpad: 3, connectivity: 8, thermals: 3, audio: 5 }),
    note: "Toshiba left the US consumer laptop market in 2016 and kept only business machines.",
  },
  {
    id: "toshiba-portege",
    maker: "toshiba",
    name: "Portege",
    years: [[2006, 2018]],
    shapes: [
      shape(2006, cell("premium", TL, "office"), ["workhorse", "wedge"], [12.1, 14], ["intel"]),
      shape(2011, cell("premium", TL, "office"), ["workhorse", "blade", "wedge"], [12.5, 14], ["intel"]),
      shape(2015, cell("premium", TL, "office"), ["ultra", "workhorse", "blade"], [12.5, 14], ["intel"]),
    ],
    price: [p(2006, 1500, 2300), p(2011, 1100, 1700), p(2018, 1200, 1800)],
    priorities: w({ price: 6, app: 8, battery: 18, portability: 26, display: 5, chassis: 10, keyboard: 10, trackpad: 4, connectivity: 11, thermals: 2 }),
    note: "Toshiba sold 80.1 percent of its PC business to Sharp on 1 October 2018; from January 2019 the laptops are Dynabook. 2018 is Toshiba's last year.",
  },

  // ------------------------------------------------------------ Sony
  {
    id: "sony-vaio",
    maker: "sony",
    name: "VAIO",
    years: [[2006, 2014]],
    shapes: [
      // SZ, TZ, Z, then VAIO Pro: the thin premium lineage is the line's model.
      shape(2006, cell("premium", TL, "office"), ["spine", "teardrop", "wedge"], [11.1, 13.3], ["intel"]),
      shape(2012, cell("premium", TL, "office"), ["teardrop", "wedge", "blade"], [11.6, 13.3], ["intel"]),
    ],
    price: [p(2006, 1500, 2800), p(2014, 1000, 2000)],
    priorities: w({ price: 6, app: 10, games: 2, battery: 12, portability: 20, display: 16, chassis: 16, keyboard: 5, trackpad: 3, connectivity: 4, thermals: 1, audio: 5 }),
    note: "Sony sold VAIO to Japan Industrial Partners in 2014; its last models were the 2014 Fit and Pro.",
  },
];

// ------------------------------------------------------------ lookups

export function onSale(line: Line, year: number): boolean {
  return line.years.some(([a, b]) => year >= a && year <= b);
}

/** Every line with a model on sale in the year. */
export function linesIn(year: number): Line[] {
  return LINES.filter((l) => onSale(l, year));
}

/** The shape in force in the year: the last one starting at or before it. */
export function shapeFor(line: Line, year: number): LineShape {
  let out = line.shapes[0];
  for (const s of line.shapes) if (s.from <= year) out = s;
  return out;
}

/** The name the line sold under in the year. */
export function nameFor(line: Line, year: number): string {
  let out = line.name;
  for (const n of line.names ?? []) if (n.from <= year) out = n.name;
  return out;
}

/** Launch price range in the year, in a straight line between waypoints, clamped at the ends. */
export function priceFor(line: Line, year: number): [low: number, high: number] {
  const pts = line.price;
  if (year <= pts[0].year) return [pts[0].low, pts[0].high];
  const last = pts[pts.length - 1];
  if (year >= last.year) return [last.low, last.high];
  const i = pts.findIndex((q) => q.year > year);
  const a = pts[i - 1];
  const b = pts[i];
  const t = (year - a.year) / (b.year - a.year);
  return [Math.round(a.low + (b.low - a.low) * t), Math.round(a.high + (b.high - a.high) * t)];
}
