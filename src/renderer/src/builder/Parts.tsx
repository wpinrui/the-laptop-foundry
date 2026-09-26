import { type ReactNode, useMemo } from "react";
import {
  type Build,
  type BuildPart,
  CONTENT,
  type Category,
  type Fit,
  type OptionValue,
  type Part,
  type Problem,
  panelsFor,
  partPrice,
  partsFor,
  solve,
} from "../engine";
import { formatOption, panelLabel } from "./format";
import { problemText } from "./problems";
import { Chip, Chips, Label, money } from "./ui";

// A slot list and the options for the selected slot, one row each: name, spec
// line and price. Options that would add a problem are dimmed with the reason.

export type SetBuild = (f: (b: Build) => Build) => void;

export interface Slot {
  key: string;
  name: string;
  cat: Category;
  /** Index within the category's list (second drive is 1). */
  index: number;
  optional: boolean;
}

const OPTION_NAME: Record<string, string> = {
  refresh: "Refresh",
  capacity: "Capacity",
  slots: "Slots",
  cells: "Cells",
  wh: "Capacity",
  pitch: "Key pitch",
  cols: "Layout",
  light: "Backlight",
  mechanism: "Mechanism",
  buttons: "Buttons",
  stick: "Pointing stick",
  switchable: "Switching",
  shutter: "Shutter",
  bluetooth: "Bluetooth",
  thickness: "Thickness",
};

export function optionName(key: string): string {
  return OPTION_NAME[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function withPart(b: Build, cat: Category, index: number, id: string): Build {
  const list = [...(b.parts[cat] ?? [])];
  if (!id) list.splice(index, 1);
  else if (list[index]?.part !== id) list[index] = { part: id };
  const parts = { ...b.parts };
  if (list.length === 0) delete parts[cat];
  else parts[cat] = list;
  const out = { ...b, parts };
  // New chips start from their own default power limits.
  if (cat === "processor" || cat === "graphics") delete out.power;
  return out;
}

export function withOption(b: Build, cat: Category, index: number, key: string, v: OptionValue): Build {
  const list = [...(b.parts[cat] ?? [])];
  const bp = list[index];
  if (!bp) return b;
  list[index] = { ...bp, opts: { ...bp.opts, [key]: v } };
  return { ...b, parts: { ...b.parts, [cat]: list } };
}

const two = (a: (string | number | undefined)[]) => a.filter((x) => x !== undefined && x !== "").join("  ");

function range(part: Part, key: string): string {
  const vs = part.options?.[key];
  if (!vs || vs.length === 0) return "";
  const a = formatOption(key, vs[0]);
  if (vs.length === 1) return a;
  const nums = vs.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === vs.length)
    return `${formatOption(key, Math.min(...nums))} to ${formatOption(key, Math.max(...nums))}`;
  return a;
}

/** One line of spec under a part's name. */
export function specLine(cat: Category, id: string): string {
  if (cat === "display") {
    const p = CONTENT.panels.find((x) => x.id === id);
    return p ? two([`${p.nits} nits`, p.gamut, `${Math.max(...p.refresh)} Hz`]) : "";
  }
  const part = CONTENT.parts.find((p) => p.id === id);
  if (!part) return "";
  const pw = part.power;
  switch (cat) {
    case "processor":
      return two([part.info?.platform as string, pw && `${pw.sustained} W`]);
    case "graphics":
      return two([part.info?.memory as string, pw && `${pw.sustained} W`]);
    case "memory":
    case "storage":
      return range(part, "capacity");
    case "battery":
      return part.options?.cells ? range(part, "cells") : range(part, "wh");
    case "cooling": {
      const s = Array.isArray(part.shape) ? part.shape[0] : part.shape;
      return s.kind === "fan" ? (s.count === 0 ? "Fanless" : `${s.count} ${s.count === 1 ? "fan" : "fans"}${s.chamber ? "  vapour chamber" : ""}`) : "";
    }
    default:
      return two(Object.keys(part.options ?? {}).slice(0, 2).map((k) => range(part, k)));
  }
}

function problemKey(p: Problem): string {
  const r = p as Record<string, unknown>;
  return [p.kind, p.code, r.axis, r.part, r.needs, r.ref, r.category, r.side].join("|");
}

interface Row {
  id: string;
  name: string;
  spec: string;
  price: number | null;
  reason: string | null;
}

function nameOfPart(cat: Category, id: string): string {
  if (cat === "display") {
    const p = CONTENT.panels.find((x) => x.id === id);
    return p ? panelLabel(p) : id;
  }
  return CONTENT.parts.find((p) => p.id === id)?.name ?? id;
}

function rowsFor(slot: Slot, build: Build, fit: Fit): Row[] {
  const year = build.year;
  const current = build.parts[slot.cat]?.[slot.index];
  const ids =
    slot.cat === "display" ? panelsFor(year).map((p) => p.id) : partsFor(slot.cat, year).map((p) => p.id);
  if (current && !ids.includes(current.part)) ids.unshift(current.part);
  const before = new Set(fit.problems.map(problemKey));
  const reason = (id: string): string | null => {
    if (current?.part === id) return null;
    try {
      const added = solve(withPart(build, slot.cat, slot.index, id)).problems.filter(
        (p) => !(p.kind === "compat" && p.code === "missing") && !before.has(problemKey(p)),
      );
      return added[0] ? problemText(added[0]) : null;
    } catch {
      return "Cannot be built";
    }
  };
  const rows: Row[] = ids.map((id) => {
    const bp: BuildPart = current?.part === id ? current : { part: id };
    return {
      id,
      name: nameOfPart(slot.cat, id),
      spec: specLine(slot.cat, id),
      price: partPrice(slot.cat, bp, year),
      reason: reason(id),
    };
  });
  if (slot.optional || !current) {
    let name = "None";
    let spec = "";
    if (slot.cat === "graphics") {
      const cpu = CONTENT.parts.find((p) => p.id === build.parts.processor?.[0]?.part);
      name = "Integrated";
      spec = String(cpu?.info?.igpu ?? "");
    }
    if (slot.optional) rows.unshift({ id: "", name, spec, price: null, reason: null });
  }
  return rows;
}

export function SlotList({
  slots,
  selected,
  onSelect,
  warn,
  size = "list",
  children,
}: {
  slots: Slot[];
  selected: string;
  onSelect: (key: string) => void;
  warn: (s: Slot) => boolean;
  size?: "list" | "big";
  children?: ReactNode;
}) {
  return (
    <div className={size === "big" ? "bd-slots big" : "bd-slots"}>
      {slots.map((s) => (
        <button
          type="button"
          key={s.key}
          className={["bd-row-item", s.key === selected ? "on" : "", warn(s) ? "warn" : ""].join(" ")}
          onClick={() => onSelect(s.key)}
        >
          {s.name}
        </button>
      ))}
      {children}
    </div>
  );
}

/** The options for one slot, with the chosen part's option chips under them. */
export function Options({
  slot,
  build,
  fit,
  set,
  children,
}: {
  slot: Slot;
  build: Build;
  fit: Fit;
  set: SetBuild;
  children?: ReactNode;
}) {
  const rows = useMemo(() => rowsFor(slot, build, fit), [slot, build, fit]);
  const current = build.parts[slot.cat]?.[slot.index];
  const optionLists: [string, OptionValue[]][] = [];
  if (current) {
    if (slot.cat === "display") {
      const panel = CONTENT.panels.find((p) => p.id === current.part);
      if (panel && panel.refresh.length > 1) optionLists.push(["refresh", panel.refresh]);
    } else {
      const part = CONTENT.parts.find((p) => p.id === current.part);
      for (const [k, vs] of Object.entries(part?.options ?? {})) if (vs.length > 1) optionLists.push([k, vs]);
    }
  }
  return (
    <div className="bd-options fd-in" key={slot.key}>
      <div className="bd-option-rows">
        {rows.map((r) => {
          const on = (current?.part ?? "") === r.id;
          return (
            <button
              type="button"
              key={r.id || "none"}
              className={["bd-option", on ? "on" : "", r.reason ? "off" : ""].join(" ")}
              title={r.reason ?? undefined}
              onClick={() => set((b) => withPart(b, slot.cat, slot.index, r.id))}
            >
              <span>
                <b>{r.name}</b>
                {r.reason ? <small className="warn">{r.reason}</small> : r.spec && <small>{r.spec}</small>}
              </span>
              {r.price !== null && <i>{money(r.price)}</i>}
            </button>
          );
        })}
      </div>
      {(optionLists.length > 0 || children) && (
        <div className="bd-option-extra">
          {optionLists.map(([k, vs]) => {
            const value = current?.opts?.[k] ?? vs[0];
            return (
              <div key={k} className="bd-field">
                <Label>{optionName(k)}</Label>
                <Chips>
                  {vs.map((v) => (
                    <Chip
                      key={String(v)}
                      on={String(v) === String(value)}
                      onClick={() => set((b) => withOption(b, slot.cat, slot.index, k, v))}
                    >
                      {formatOption(k, v)}
                    </Chip>
                  ))}
                </Chips>
              </div>
            );
          })}
          {children}
        </div>
      )}
    </div>
  );
}
