import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  type Build,
  CONTENT,
  type PanelOption,
  panelOf,
  RIVALS,
  reviewOf,
  rivalSubject,
  type Subject,
  solve,
} from "../engine";
import { activeArea } from "../engine/content/display";
import { Scene, surfacesOf } from "../viewer/Scene";
import { usePhotos } from "../viewer/Photos";
import { ReviewSite } from "./ReviewSite";

// The review opens on the laptop's own screen. The page is filtered by the
// panel: resolution, brightness, colour and surface. F shows it full screen,
// clean, with no panel simulation.

export interface Look {
  width: number;
  height: number;
  mm: { x: number; y: number };
  filter: string;
  glare: number;
  shift: number;
}

export function lookOf(panel: PanelOption | undefined): Look | null {
  if (!panel) return null;
  const mm = activeArea(panel);
  const ppi = panel.res[0] / (mm.x / 25.4);
  // Windows scaling: dense panels lay the page out at fewer CSS pixels.
  const scale = ppi < 140 ? 1 : ppi < 170 ? 1.25 : ppi < 220 ? 1.5 : 2;
  const width = Math.round(panel.res[0] / scale);
  const height = Math.round(panel.res[1] / scale);
  const tn = panel.type.startsWith("tn");
  const glossy = panel.type.includes("glossy") || panel.type === "oled";
  const gamut = panel.gamut.startsWith("45")
    ? 0.7
    : panel.gamut.startsWith("60")
      ? 0.85
      : panel.gamut.includes("P3")
        ? 1.15
        : 1;
  const brightness = Math.min(1.1, Math.max(0.45, panel.nits / 380));
  const blur = Math.max(0, (135 - ppi) / 90);
  const contrast = panel.type === "oled" ? 1.12 : tn ? 0.82 : panel.type === "ips-type" ? 0.9 : 1;
  return {
    width,
    height,
    mm,
    filter: `brightness(${brightness.toFixed(2)}) contrast(${contrast}) saturate(${gamut}) blur(${blur.toFixed(2)}px)`,
    glare: glossy ? 0.16 : 0,
    shift: tn ? 0.35 : panel.type === "ips-type" ? 0.1 : 0,
  };
}

export function ReviewScreen({
  subject,
  onBack,
}: {
  subject: Subject;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<string[]>([subject.id]);
  const [full, setFull] = useState(false);
  const current = history[history.length - 1];

  const shown = useMemo(() => {
    if (current === subject.id) return subject;
    const r = RIVALS.find((x) => x.id === current);
    return r ? rivalSubject(r) : subject;
  }, [current, subject]);
  const review = useMemo(() => reviewOf(shown), [shown]);
  const { photos, shoot } = usePhotos(shown.id, shown.build);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "f" || e.key === "F") setFull((v) => !v);
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const build: Build = subject.build;
  const fit = useMemo(() => solve(build), [build]);
  const panel = panelOf(build);
  const look = lookOf(panel);
  const colour = (id: string) =>
    CONTENT.colours.find((c) => c.id === id)?.hex ?? "";
  const surfaces = useMemo(() => surfacesOf(build), [build]);
  const colours = useMemo(
    () => ({
      floor: colour(build.finish.floor.colour),
      deck: colour(build.finish.deck.colour),
      lid: colour(build.finish.lid.colour),
    }),
    [build],
  );

  const open = (id: string) => setHistory((h) => [...h, id]);
  const home = () => setHistory([subject.id]);
  const site = (
    <ReviewSite review={review} onOpen={open} onHome={home} photos={photos} />
  );

  const page = look ? (
    <div
      className="panel-page"
      style={{ width: look.width, height: look.height } as CSSProperties}
    >
      <div className="scroller" style={{ filter: look.filter }}>
        {site}
      </div>
      {look.shift > 0 && <div className="shift" style={{ opacity: look.shift }} />}
      {look.glare > 0 && <div className="glare" style={{ opacity: look.glare }} />}
    </div>
  ) : null;

  const lidDepth = fit.shell.lid.size.y;
  return (
    <div className="review-screen">
      <div className="review-bar">
        <button type="button" onClick={onBack}>
          ‹
        </button>
        {history.length > 1 && (
          <button
            type="button"
            onClick={() => setHistory((h) => h.slice(0, -1))}
          >
            Back
          </button>
        )}
        <button type="button" onClick={() => setFull(true)}>
          F
        </button>
      </div>
      <Scene
        fit={fit}
        year={build.year}
        lidAngle={105}
        colours={colours}
        surfaces={surfaces}
        xray={false}
        workshop
        labelFor={() => ""}
        onHover={() => {}}
        screen={
          look && page ? { node: page, width: look.width, mm: look.mm } : undefined
        }
        camera={{
          position: [0, lidDepth * 0.75, lidDepth * 1.45],
          target: [0, lidDepth * 0.45, -lidDepth * 0.45],
        }}
      />
      {(full || !look) && <div className="fullscreen-page">{site}</div>}
      {shoot}
    </div>
  );
}
