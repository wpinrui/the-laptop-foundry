import type { Line } from "./types";

// Plausible model names per maker convention and era, for generated rivals.
// Not real model numbers: close enough to read as the maker's own.

export interface NameCtx {
  /** The line's name that year (makers.ts nameFor). */
  n: string;
  year: number;
  /** Panel diagonal, inches. */
  diag: number;
  /** The model's place in the line's range, 0 (base) to 1 (top). */
  tier: number;
  vendor: string;
  /** Processor name, for Apple's chip suffix. */
  cpuName: string;
}

/** 3, 5 or 7 by tier: the range digit many makers use. */
const t357 = (t: number) => (t < 0.4 ? 3 : t < 0.7 ? 5 : 7);
const inch = (d: number) => Math.round(d);
const letter = (i: number) => String.fromCharCode(65 + (((i % 26) + 26) % 26));
const chip = (c: NameCtx) => {
  const m = /Apple (M\d+(?: Pro| Max)?)/.exec(c.cpuName);
  return m ? ` (${m[1]})` : "";
};

const RULES: Record<string, (c: NameCtx) => string> = {
  "lenovo-ideapad": (c) =>
    c.year < 2014
      ? `${c.n} Y${inch(c.diag) >= 17 ? 7 : 5}${(c.year - 2005) % 10}0`
      : c.year < 2020
        ? `${c.n} ${t357(c.tier)}${(c.year - 2014) % 10}0-${inch(c.diag)}`
        : `${c.n} ${c.tier >= 0.5 ? "Slim " : ""}${t357(c.tier)} ${inch(c.diag)} Gen ${c.year - 2015}`,
  "lenovo-yoga": (c) =>
    c.year < 2016
      ? `${c.n} ${inch(c.diag)}`
      : c.year < 2020
        ? `${c.n} ${c.tier >= 0.6 ? 9 : 7}${(c.year - 2014) % 10}0`
        : `${c.n} ${c.tier >= 0.6 ? "Slim 7" : "7"}${c.vendor === "intel" ? "i" : ""} ${inch(c.diag)} Gen ${c.year - 2015}`,
  "lenovo-thinkpad": (c) =>
    c.year < 2008
      ? `${c.n} T6${c.year - 2006}`
      : c.year < 2020
        ? `${c.n} T${c.diag >= 15 ? 5 : 4}${Math.max(0, c.year - 2010)}0`
        : `${c.n} T${c.diag >= 15 ? 16 : 14} Gen ${c.year - 2019}`,
  "lenovo-legion": (c) =>
    c.year < 2020
      ? `${c.n} Y${c.tier >= 0.6 ? 7 : 5}${c.year - 2015}0`
      : `${c.n} ${c.tier >= 0.6 ? "Pro 7" : "5"}${c.vendor === "intel" ? "i" : ""} ${inch(c.diag)} Gen ${c.year - 2015}`,
  "dell-inspiron": (c) =>
    c.n.startsWith("Dell ")
      ? `Dell ${inch(c.diag)} ${c.n.slice(5)}`
      : c.year < 2010
        ? `${c.n} ${inch(c.diag)}${(c.year - 2005) * 10 + 5}`
        : c.year < 2014
          ? `${c.n} ${inch(c.diag)}R`
          : c.year < 2020
            ? `${c.n} ${inch(c.diag)} ${t357(c.tier)}000`
            : `${c.n} ${inch(c.diag)} ${t357(c.tier)}${inch(c.diag) - 10}${c.year - 2020}0`,
  "dell-xps": (c) =>
    c.n.startsWith("Dell ")
      ? `Dell ${inch(c.diag)} ${c.n.slice(5)}`
      : c.year < 2012
        ? `${c.n} M${inch(c.diag)}30`
        : `${c.n} ${inch(c.diag)}`,
  "dell-latitude": (c) =>
    c.n.startsWith("Dell ")
      ? `${c.n} ${inch(c.diag)}`
      : c.year < 2008
        ? `${c.n} D${c.diag >= 15 ? 8 : 6}${c.year - 2004}0`
        : c.year < 2014
          ? `${c.n} E6${c.diag >= 15 ? 5 : 4}${Math.max(0, c.year - 2009)}0`
          : `${c.n} ${t357(c.tier)}${inch(c.diag) - 10}${(c.year - 2010) % 10}0`,
  "dell-alienware": (c) =>
    c.year < 2010
      ? `${c.n} m${inch(c.diag)}x`
      : c.year < 2019
        ? `${c.n} ${inch(c.diag)} R${Math.max(1, c.year - 2013)}`
        : `${c.n} m${inch(c.diag)} R${c.year - 2018}`,
  "hp-pavilion": (c) =>
    c.n !== "Pavilion"
      ? `${c.n} ${inch(c.diag)}`
      : c.year < 2013
        ? `${c.n} dv${c.diag >= 17 ? 7 : c.diag >= 15 ? 6 : 4}-${c.year - 2005}${Math.floor(c.tier * 9)}00`
        : `${c.n} ${inch(c.diag)}`,
  "hp-envy": (c) => (c.year >= 2016 && c.tier >= 0.5 && c.n === "Envy" ? `${c.n} x360 ${inch(c.diag)}` : `${c.n} ${inch(c.diag)}`),
  "hp-spectre": (c) => (c.year >= 2016 && c.n === "Spectre" ? `${c.n} x360 ${inch(c.diag)}` : `${c.n} ${inch(c.diag)}`),
  "hp-elitebook": (c) =>
    c.n === "Compaq"
      ? `${c.n} nc${c.diag >= 15 ? 8 : 6}4${c.year - 2006}0`
      : c.year < 2014
        ? `${c.n} 8${inch(c.diag) - 10}${(c.year - 2006) % 10}0p`
        : `${c.n} 8${inch(c.diag) - 10}0 G${c.year - 2013}`,
  "hp-omen": (c) => (c.year >= 2020 && c.tier >= 0.7 ? `${c.n} Transcend ${inch(c.diag)}` : `${c.n} ${inch(c.diag)}`),
  "apple-macbook": (c) => `${c.n} ${inch(c.diag)}-inch`,
  "apple-macbook-air": (c) => `${c.n} ${inch(c.diag)}-inch${chip(c)}`,
  "apple-macbook-pro": (c) => `${c.n} ${inch(c.diag)}-inch${chip(c)}`,
  "asus-vivobook": (c) =>
    c.n === "X series" ? `X${inch(c.diag)}${letter(c.year - 2006)}` : `${c.n} ${c.tier >= 0.6 ? "S" : ""}${inch(c.diag)}`,
  "asus-zenbook": (c) =>
    c.year < 2019 ? `${c.n} UX${c.diag < 14 ? 3 : c.diag < 15 ? 4 : 5}${(c.year - 2010) % 10}0` : `${c.n}${c.tier >= 0.7 ? " S" : ""} ${inch(c.diag)}`,
  "asus-rog": (c) =>
    c.year < 2013
      ? `G${c.diag >= 17 ? 7 : 5}${Math.max(1, c.year - 2007)}`
      : c.year < 2019
        ? `${c.n} G${c.diag >= 17 ? 75 : 55}${(c.year - 2013) % 10}`
        : `${c.n} ${c.tier >= 0.6 ? "Zephyrus" : "Strix"} G${inch(c.diag)}`,
  "acer-aspire": (c) =>
    c.year < 2014
      ? `${c.n} ${inch(c.diag) - 10}${(c.year - 2002) % 10}${Math.floor(c.tier * 9)}0`
      : c.year < 2019
        ? `${c.n} E ${inch(c.diag)}`
        : `${c.n} ${t357(c.tier)} A${t357(c.tier)}${inch(c.diag)}-${c.year - 1965}`,
  "acer-swift": (c) => (c.n === "Aspire S" ? `${c.n}${c.year - 2008}` : `${c.n} ${c.tier >= 0.6 ? "Go" : t357(c.tier)} ${inch(c.diag)}`),
  "acer-predator": (c) =>
    c.year < 2017 ? `${c.n} ${inch(c.diag)}` : c.year < 2021 ? `${c.n} Helios ${c.tier >= 0.6 ? 500 : 300}` : `${c.n} Helios ${inch(c.diag)}`,
  "msi-modern": (c) => `${c.n} ${inch(c.diag)}`,
  "msi-prestige": (c) => `${c.n} ${inch(c.diag)}`,
  "msi-titan": (c) =>
    c.n === "Titan" ? `${c.n} GT${inch(c.diag)}` : `${c.n}${c.diag >= 17 ? 7 : 6}${(c.year - 2006) % 10}${Math.floor(c.tier * 9)}`,
  "msi-katana": (c) => (c.n === "GF" ? `GF${c.diag >= 17 ? 7 : 6}${(c.year - 2014) % 10}` : `${c.n} ${inch(c.diag)}`),
  "samsung-galaxy-book": (c) =>
    c.n === "Galaxy Book" ? `${c.n}${c.year >= 2021 ? c.year - 2019 : ""} Pro ${inch(c.diag)}` : `${c.n} ${inch(c.diag)}`,
  "microsoft-surface-laptop": (c) => `${c.n}${c.year === 2017 ? "" : ` ${c.year - 2016}`} ${inch(c.diag)}-inch`,
  "razer-blade": (c) => `${c.n} ${inch(c.diag)}`,
  "toshiba-satellite": (c) =>
    c.year < 2013
      ? `${c.n} ${c.tier < 0.4 ? "L" : "A"}${(c.year - 2003) % 10}${c.diag >= 16 ? 5 : 0}5`
      : `${c.n} ${c.tier < 0.4 ? "C" : c.tier < 0.7 ? "L" : "S"}${inch(c.diag)}-${letter(c.year - 2013)}`,
  "toshiba-portege": (c) =>
    c.year < 2011 ? `${c.n} R${(c.year - 2002) % 10}00` : c.year < 2014 ? `${c.n} Z${(c.year - 2002) % 10}30` : `${c.n} X${inch(c.diag) * 2 + 2}-${letter(c.year - 2014)}`,
  "sony-vaio": (c) => `${c.n} ${c.year < 2007 ? "SZ" : c.year < 2008 ? "TZ" : c.year < 2013 ? "Z" : "Pro"}${c.year >= 2013 ? ` ${inch(c.diag)}` : ""}`,
};

/** A plausible name for the line's model in the year. */
export function modelName(line: Line, ctx: NameCtx): string {
  const rule = RULES[line.id];
  return rule ? rule(ctx) : `${ctx.n} ${inch(ctx.diag)}`;
}
