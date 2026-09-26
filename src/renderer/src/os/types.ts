import type { Build } from "../engine";
import type { Era } from "../review/Charts";
import { eraOf } from "../review/ReviewSite";

export type { Era };
export { eraOf };

export type AppId = "kiln" | "ash" | "web" | "sys";

/** Who the laptop belongs to, as its OS shows it. */
export interface Owner {
  /** The company name: the boot screen's maker and the lock screen's user. */
  maker: string;
  /** The 2006 wordmark: the lid's text mark, else the maker in capitals. */
  wordmark: string;
}

export function ownerOf(build: Build, company: string): Owner {
  const lid = (build.marks ?? []).find((m) => m.surface === "lid" && m.kind === "text" && m.text.trim());
  const maker = company.trim();
  return { maker, wordmark: (lid?.text.trim() || maker).toUpperCase() };
}

/** The battery as the tray reads it. */
export interface Power {
  /** False on a laptop with no battery: the tray shows no level. */
  battery: boolean;
  pct: number;
  plugged: boolean;
  /** "2 h 14 min left", "1 min to full", "Fully charged". */
  time: string;
}

/** Minutes as the tray prints them. */
export function duration(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The real local time, moved into the laptop's year. */
export function clockOf(now: Date, year: number) {
  // 29 February falls back a day in a year that has none.
  const day = now.getMonth() === 1 ? Math.min(now.getDate(), 28) : now.getDate();
  const d = new Date(year, now.getMonth(), day);
  const h = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, "0");
  return {
    time: `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`,
    short: `${h % 12 || 12}:${mm}`,
    date: `${d.getMonth() + 1}/${d.getDate()}/${year}`,
    long: `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`,
  };
}
