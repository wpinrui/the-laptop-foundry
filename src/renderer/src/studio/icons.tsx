import type { SceneKind } from "../video/commercial";

// The studio editor's icons, from the designer's mock: one stroke path each,
// drawn on a 24 unit grid.

export const ICON = {
  keyboard: "M3 6h18v12H3zM6.5 10h1M10.5 10h1M14.5 10h1M17.5 10h1M7 14h10",
  ports: "M2 9h20v6H2zM5 12h3M10 12h2M14 12h1.5M18 12h1",
  screen: "M3 4h18v12H3zM2 20h20",
  lid: "M3 19h18M5 19 10 5M14 19a8 8 0 0 0-3-6",
  turn: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5",
  hero: "M3 16l9 4 9-4-9-3zM6.5 14.8 8 5l10 3-1.5 6.5",
  glance: "M4 5l14 3v10L4 20zM20.5 9v8",
  side: "M3 16h18v3H3zM6 16 17 5",
  top: "M5 10h14v10H5zM12 2v5M9.5 4.5 12 7l2.5-2.5",
  orbit: "M21 12c0 2.2-4 4-9 4s-9-1.8-9-4 4-4 9-4M10 6l2 2-2 2",
  push: "M9 9h6v6H9zM3 3l4 4M21 3l-4 4M3 21l4-4M21 21l-4-4",
  title: "M5 5h14M12 5v14M8 19h8",
  sales: "M3 20h18M6 16v-4M11 16V7M16 16v-6",
  stats: "M4 7h3M11 7h9M4 12h3M11 12h9M4 17h3M11 17h9",
  price: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  spec: "M4 18a8 8 0 1 1 16 0M12 18l4-5",
  quote: "M4 7h4v5H5v1.5L7 17M14 7h4v5h-3v1.5l2 3.5",
  chips: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  launch: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  logo: "M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z",
  score: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  speaker: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  mute: "M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6",
  play: "M8 5v14l11-7z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  film: "M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4",
  tv: "M3 6h18v12H3zM8 21h8M12 18v3",
  back: "m15 18-6-6 6-6",
  down: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
} as const;

/** The scene library's labels. */
export const LABEL: Record<SceneKind, string> = {
  keyboard: "Keys",
  ports: "Ports",
  screen: "Screen",
  lid: "Lid",
  turn: "Turn",
  hero: "Hero",
  glance: "Glance",
  side: "Side",
  top: "Top",
  orbit: "Orbit",
  push: "Push",
  title: "Title",
  sales: "Sales",
  stats: "Stats",
  score: "Score",
  price: "Price",
  spec: "Spec",
  quote: "Quote",
  chips: "Chips",
  launch: "Launch",
  logo: "Logo",
};

export function Icon({ d, size = 22, width = 1.75, fill = false }: { d: string; size?: number; width?: number; fill?: boolean }) {
  return (
    <svg
      className="st-icon"
      style={{ width: `calc(${size} * var(--u))`, height: `calc(${size} * var(--u))` }}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
