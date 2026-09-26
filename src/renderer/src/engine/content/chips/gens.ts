// Generations of processors and discrete graphics, per maker, in the order
// the maker ranked them. The builder offers a maker's two newest generations
// that had launched by the build's year. Rank, not launch date, decides which
// is newer: Arrow Lake launched after Lunar Lake but sits below it, so a 2026
// build gets Panther Lake and Lunar Lake. Budget lines (Atom, Celeron N and
// the like) belong to the generation they launched alongside.

export type Vendor = "intel" | "amd" | "qualcomm" | "nvidia" | "radeon" | "arc";

export interface Generation {
  id: string;
  vendor: Vendor;
  name: string;
  /** First year laptops shipped with it. */
  launch: number;
  /** Order within the vendor: higher is newer. */
  rank: number;
}

const list = (vendor: Vendor, rows: [id: string, name: string, launch: number][]): Generation[] =>
  rows.map(([id, name, launch], i) => ({ id, vendor, name, launch, rank: i + 1 }));

export const GENERATIONS: Generation[] = [
  ...list("intel", [
    ["intel-yonah", "Core Duo (Yonah)", 2006],
    ["intel-merom", "Core 2 Duo (Merom)", 2006],
    ["intel-penryn", "Core 2 Duo (Penryn)", 2008],
    ["intel-core-1", "Core i 1st gen (Arrandale)", 2009],
    ["intel-sandy-bridge", "Core i 2nd gen (Sandy Bridge)", 2011],
    ["intel-ivy-bridge", "Core i 3rd gen (Ivy Bridge)", 2012],
    ["intel-haswell", "Core i 4th gen (Haswell)", 2013],
    ["intel-broadwell", "Core i 5th gen (Broadwell)", 2014],
    ["intel-skylake", "Core i 6th gen (Skylake)", 2015],
    ["intel-kaby-lake", "Core i 7th gen (Kaby Lake)", 2016],
    ["intel-coffee-lake", "Core i 8th and 9th gen (Coffee Lake)", 2017],
    ["intel-core-10", "Core i 10th gen (Comet Lake, Ice Lake)", 2019],
    ["intel-tiger-lake", "Core i 11th gen (Tiger Lake)", 2020],
    ["intel-alder-lake", "Core i 12th gen (Alder Lake)", 2022],
    ["intel-raptor-lake", "Core i 13th gen (Raptor Lake)", 2023],
    ["intel-core-ultra-1", "Core Ultra series 1 (Meteor Lake)", 2023],
    ["intel-arrow-lake", "Core Ultra 200H and HX (Arrow Lake)", 2025],
    ["intel-lunar-lake", "Core Ultra 200V (Lunar Lake)", 2024],
    ["intel-panther-lake", "Core Ultra series 3 (Panther Lake, Wildcat Lake)", 2026],
  ]),
  ...list("amd", [
    ["amd-k8", "Turion 64 X2 (K8)", 2005],
    ["amd-puma", "Turion X2 Ultra (Puma)", 2008],
    ["amd-tigris", "Turion II (Tigris)", 2009],
    ["amd-danube", "Phenom II and Turion II (Danube, Nile)", 2010],
    ["amd-2011", "A-Series and E-Series (Llano, Brazos)", 2011],
    ["amd-2012", "A-Series (Trinity)", 2012],
    ["amd-2013", "A-Series (Richland, Kabini)", 2013],
    ["amd-2014", "A-Series (Kaveri, Beema)", 2014],
    ["amd-2015", "A-Series (Carrizo)", 2015],
    ["amd-2016", "A-Series (Bristol Ridge, Stoney Ridge)", 2016],
    ["amd-ryzen-2000", "Ryzen 2000 (Raven Ridge)", 2017],
    ["amd-ryzen-3000", "Ryzen 3000 (Picasso)", 2019],
    ["amd-ryzen-4000", "Ryzen 4000 (Renoir)", 2020],
    ["amd-ryzen-5000", "Ryzen 5000 (Cezanne)", 2021],
    ["amd-ryzen-6000", "Ryzen 6000 (Rembrandt)", 2022],
    ["amd-ryzen-7000", "Ryzen 7000 (Phoenix, Dragon Range)", 2023],
    ["amd-ryzen-8040", "Ryzen 8040 (Hawk Point)", 2024],
    ["amd-ryzen-ai-300", "Ryzen AI 300 (Strix Point, Strix Halo)", 2024],
    ["amd-ryzen-ai-400", "Ryzen AI 400 (Gorgon Point)", 2026],
  ]),
  ...list("qualcomm", [
    ["qualcomm-x1", "Snapdragon X", 2024],
    ["qualcomm-x2", "Snapdragon X2", 2026],
  ]),
  ...list("nvidia", [
    ["nvidia-go7", "GeForce Go 7", 2006],
    ["nvidia-8m", "GeForce 8M", 2007],
    ["nvidia-9m", "GeForce 9M", 2008],
    ["nvidia-200m", "GeForce 200M", 2009],
    ["nvidia-300m", "GeForce 300M", 2010],
    ["nvidia-400m", "GeForce 400M (Fermi)", 2010],
    ["nvidia-500m", "GeForce 500M", 2011],
    ["nvidia-600m", "GeForce 600M (Kepler)", 2012],
    ["nvidia-700m", "GeForce 700M", 2013],
    ["nvidia-800m", "GeForce 800M", 2014],
    ["nvidia-900m", "GeForce 900M (Maxwell)", 2015],
    ["nvidia-pascal", "GeForce 10 (Pascal)", 2016],
    ["nvidia-turing", "GeForce 16 and RTX 20 (Turing)", 2019],
    ["nvidia-ampere", "GeForce RTX 30 (Ampere)", 2021],
    ["nvidia-ada", "GeForce RTX 40 (Ada)", 2023],
    ["nvidia-blackwell", "GeForce RTX 50 (Blackwell)", 2025],
  ]),
  ...list("radeon", [
    ["radeon-x1000", "Mobility Radeon X1000", 2006],
    ["radeon-hd2000", "Mobility Radeon HD 2000", 2007],
    ["radeon-hd3000", "Mobility Radeon HD 3000", 2008],
    ["radeon-hd4000", "Mobility Radeon HD 4000", 2009],
    ["radeon-hd5000", "Mobility Radeon HD 5000", 2010],
    ["radeon-hd6000m", "Radeon HD 6000M", 2011],
    ["radeon-hd7000m", "Radeon HD 7000M", 2012],
    ["radeon-hd8000m", "Radeon HD 8000M", 2013],
    ["radeon-m200", "Radeon R5, R7 and R9 M200", 2014],
    ["radeon-m300", "Radeon M300", 2015],
    ["radeon-m400", "Radeon M400 and RX 400", 2016],
    ["radeon-rx500", "Radeon RX 500", 2017],
    ["radeon-rx5000m", "Radeon RX 5000M", 2020],
    ["radeon-rx6000m", "Radeon RX 6000M", 2021],
    ["radeon-rx7000m", "Radeon RX 7000M", 2023],
  ]),
  ...list("arc", [["arc-alchemist", "Arc A-series (Alchemist)", 2022]]),
];

const byId = new Map(GENERATIONS.map((g) => [g.id, g]));

export function generationOf(id: string | undefined): Generation | undefined {
  return id ? byId.get(id) : undefined;
}

/** A maker's generations the builder offers in a year: the two newest by rank that had launched. */
export function offeredGenerations(vendor: Vendor, year: number): Generation[] {
  return GENERATIONS.filter((g) => g.vendor === vendor && g.launch <= year)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 2);
}

/** Every generation id the builder offers in a year, across makers. */
export function offeredGenerationIds(year: number): Set<string> {
  const vendors = [...new Set(GENERATIONS.map((g) => g.vendor))];
  return new Set(vendors.flatMap((v) => offeredGenerations(v, year).map((g) => g.id)));
}
