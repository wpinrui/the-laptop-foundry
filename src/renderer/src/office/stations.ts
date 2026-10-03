// The office's stations, clockwise from the desk: the order the arrow keys
// step round the room. Each station's panel is open while the view is on it. Finance, Market intel and Marketing run a campaign's
// business, so a sandbox company's ring leaves them out.

export type StationId = "desk" | "finance" | "market" | "marketing" | "door" | "tv" | "products" | "trophies";

export const STATIONS: { id: StationId; label: string; campaign: boolean }[] = [
  { id: "desk", label: "Desk", campaign: false },
  { id: "finance", label: "Finance", campaign: true },
  { id: "market", label: "Market intel", campaign: true },
  { id: "marketing", label: "Marketing", campaign: true },
  { id: "door", label: "Door", campaign: false },
  { id: "tv", label: "TV", campaign: false },
  { id: "products", label: "Product wall", campaign: false },
  { id: "trophies", label: "Trophy cabinet", campaign: false },
];

export const labelOf = (id: StationId) => STATIONS.find((s) => s.id === id)?.label ?? "";

/** The stations the arrow keys visit, in order. */
export function ringOf(campaign: boolean): StationId[] {
  return STATIONS.filter((s) => campaign || !s.campaign).map((s) => s.id);
}

/** The station `step` places round the ring from `at`. */
export function stepFrom(ring: StationId[], at: StationId, step: number): StationId {
  const i = Math.max(0, ring.indexOf(at));
  return ring[(i + step + ring.length) % ring.length];
}

/** Where the office stands when it opens or comes back into view. */
export interface OfficeAt {
  station: StationId;
  /** The laptop picked at the Desk and on the product wall; the newest when null. */
  model: string | null;
  /** Just in from the map: start in free roam beside the Desk. */
  arrive: boolean;
}

export const OFFICE_START: OfficeAt = { station: "desk", model: null, arrive: true };
