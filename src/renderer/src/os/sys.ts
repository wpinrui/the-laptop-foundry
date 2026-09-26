import { type Build, CONTENT, type Measurements, panelOf, type Part } from "../engine";
import { memoryText, PANEL_TYPE, storageText } from "../engine/review";
import type { SysGroup } from "./Os";
import type { Power } from "./types";

// The System window's groups, from the build and the running simulation.

const partOf = (b: Build, cat: "processor" | "graphics"): Part | undefined => {
  const id = b.parts[cat]?.[0]?.part;
  return id ? CONTENT.parts.find((p) => p.id === id) : undefined;
};

const ghz = (n: number) => `${n.toFixed(2)} GHz`;

/**
 * `cpuGhz` and `gpuMhz` are the live clocks: what the processor and graphics
 * run at this second. A graphics clock of 0 is an idle integrated chip.
 */
export function sysGroups(
  model: string,
  build: Build,
  m: Measurements,
  live: { cpuGhz: number; gpuMhz: number },
  power: Power,
): SysGroup[] {
  const cpu = partOf(build, "processor");
  const gpu = partOf(build, "graphics");
  const cores = Number(cpu?.info?.cores ?? 0);
  const threads = Number(cpu?.info?.threads ?? cores);
  const top = cpu?.power?.clock?.single;
  const gClock = (gpu ?? cpu)?.power?.gpuClock;
  const panel = panelOf(build);
  const out: SysGroup[] = [
    {
      title: "Laptop",
      tab: "general",
      rows: [
        ["Model", model],
        ["Year", String(build.year)],
      ],
    },
    {
      title: "Processor",
      tab: "hardware",
      rows: [
        ["Name", cpu?.name ?? "Unknown"],
        ...(cores ? ([["Cores", `${cores} ${cores === 1 ? "core" : "cores"}, ${threads} ${threads === 1 ? "thread" : "threads"}`]] as [string, string][]) : []),
        ["Clock", top ? `${ghz(live.cpuGhz || top)} of ${ghz(top)}` : ghz(live.cpuGhz)],
      ],
    },
    {
      title: "Graphics",
      tab: "hardware",
      rows: [
        ["Name", gpu?.name ?? String(cpu?.info?.igpu ?? "Integrated graphics")],
        ["Memory", gpu ? String(gpu.info?.memory ?? "Dedicated") : "Shared"],
        [
          "Clock",
          live.gpuMhz > 0 ? `${Math.round(live.gpuMhz)} MHz` : gClock ? `Idle, up to ${gClock.boost} MHz` : "Idle",
        ],
      ],
    },
    { title: "Memory", tab: "hardware", rows: [["Installed", memoryText(CONTENT, build) || "None"]] },
    { title: "Storage", tab: "hardware", rows: [["Drive", storageText(CONTENT, build) || "None"]] },
  ];
  if (panel)
    out.push({
      title: "Display",
      tab: "hardware",
      rows: [
        [
          "Panel",
          `${panel.inches} in, ${panel.res[0]} x ${panel.res[1]}, ${panel.hz ?? 60} Hz, ${PANEL_TYPE[panel.type] ?? panel.type}`,
        ],
      ],
    });
  const wh = m.battery?.wh;
  out.push({
    title: "Battery",
    tab: "power",
    rows: wh
      ? [
          ["Capacity", `${Math.round(wh * 10) / 10} Wh`],
          ["Level", `${power.pct}%`],
          ["State", power.plugged ? `Plugged in, ${power.time}` : `On battery, ${power.time}`],
        ]
      : [["State", "No battery"]],
  });
  return out;
}
