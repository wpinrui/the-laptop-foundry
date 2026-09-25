import type { Colour, Finish, Material } from "../types";

// Wall thickness and allowed pieces per material live in the era rows.
export const MATERIALS: Material[] = [
  {
    id: "plastic",
    name: "Plastic (ABS/PC)",
    from: 1990,
    until: 2099,
    density: 1.2,
    finishes: ["matte", "glossy", "soft-touch"],
  },
  {
    id: "magnesium",
    name: "Magnesium alloy",
    from: 1995,
    until: 2099,
    density: 1.8,
    finishes: ["matte", "soft-touch"],
  },
  {
    id: "aluminium",
    name: "Aluminium",
    from: 1998,
    until: 2099,
    density: 2.7,
    finishes: ["brushed", "anodised", "matte"],
  },
  {
    id: "cfrp",
    name: "Carbon fibre (CFRP)",
    from: 2004,
    until: 2099,
    density: 1.6,
    finishes: ["matte", "soft-touch"],
  },
];

export const FINISHES: Finish[] = [
  { id: "matte", name: "Matte", from: 1990, until: 2099 },
  { id: "glossy", name: "Glossy", from: 1990, until: 2099 },
  { id: "soft-touch", name: "Soft-touch", from: 1998, until: 2099 },
  { id: "brushed", name: "Brushed", from: 1998, until: 2099 },
  { id: "anodised", name: "Anodised", from: 1998, until: 2099 },
];

export const COLOURS: Colour[] = [
  { id: "black", name: "Black", from: 1990, until: 2099, hex: "#1b1b1d" },
  { id: "silver", name: "Silver", from: 1998, until: 2099, hex: "#c4c6c8" },
  { id: "white", name: "White", from: 2000, until: 2099, hex: "#f2f2ef" },
  {
    id: "piano-black",
    name: "Piano black",
    from: 2005,
    until: 2012,
    hex: "#0a0a0c",
  },
  { id: "graphite", name: "Graphite", from: 2015, until: 2099, hex: "#3d3f43" },
  {
    id: "deep-blue",
    name: "Deep blue",
    from: 2018,
    until: 2099,
    hex: "#1f2d4d",
  },
];
