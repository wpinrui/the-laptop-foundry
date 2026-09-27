import { eraFor } from "./content/eras";
import type { Build, OptionValue } from "./types";

// The player's fan size: a diameter in mm on the cooling part, each fan the same.
// Absent means Auto: the fit sizes the fans for the chip heat.

/** Smallest fan the player may fit, mm: a thin ultraportable's blower. */
export const FAN_MIN = 40;

/** Fan diameters the player may choose in a year, mm. */
export function fanRange(year: number): [number, number] {
  return [FAN_MIN, Math.round(eraFor(year).fan.max.x)];
}

/** Whether a cooling option value is a fan size the year allows. */
export function fanOptionOk(year: number, key: string, value: OptionValue): boolean {
  if (key !== "fan" || typeof value !== "number") return false;
  const [lo, hi] = fanRange(year);
  return value >= lo && value <= hi;
}

/** The player's fan diameter, mm, within the year's range; undefined on Auto. */
export function fanSizeOf(build: Build): number | undefined {
  const v = build.parts.cooling?.[0]?.opts?.fan;
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const [lo, hi] = fanRange(build.year);
  return Math.min(hi, Math.max(lo, v));
}

/** The build with its fans set to `size` mm, or back to Auto when undefined. */
export function withFanSize(build: Build, size: number | undefined): Build {
  const list = [...(build.parts.cooling ?? [])];
  const bp = list[0];
  if (!bp) return build;
  const { fan: _fan, ...rest } = bp.opts ?? {};
  const opts = size === undefined ? rest : { ...rest, fan: size };
  list[0] = Object.keys(opts).length > 0 ? { ...bp, opts } : { part: bp.part };
  return { ...build, parts: { ...build.parts, cooling: list } };
}
