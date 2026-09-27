import { type ReactNode, useLayoutEffect, useRef } from "react";
import { type PanelFx, VIEW_EVENT, type View, viewFx } from "./fx";
import { CAST_COLOUR, FULL_HALF_ANGLE } from "./tuning";

// The page as the panel shows it: the filter on the page and the light the
// panel and room lay over it. Every layer over the page lets the pointer
// through. The 3D screen sends the view each frame as an event on the root;
// anywhere else (full screen) it stays head-on.

const FULL: View = { v: 0, h: 0, half: FULL_HALF_ANGLE };

function show(el: HTMLElement | null, opacity: number) {
  if (!el) return;
  const o = Math.max(0, Math.min(1, opacity));
  el.style.display = o > 0.002 ? "block" : "none";
  el.style.opacity = o.toFixed(3);
}

export function PanelPage({
  fx,
  width,
  height,
  children,
}: {
  fx: PanelFx;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const haze = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const tint = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const apply = (view: View) => {
      const f = viewFx(fx, view);
      if (scroller.current) scroller.current.style.filter = f.filter;
      show(haze.current, fx.haze + f.wash);
      if (edge.current) {
        show(edge.current, f.top > 0.002 || f.bottom > 0.002 ? 1 : 0);
        edge.current.style.background = `linear-gradient(rgba(0,0,0,${f.top.toFixed(3)}), transparent 50%, rgba(255,255,255,${f.bottom.toFixed(3)}))`;
      }
      show(glow.current, f.glow);
      show(tint.current, f.tint);
    };
    apply(FULL);
    const on = (e: Event) => apply((e as CustomEvent<View>).detail);
    el.addEventListener(VIEW_EVENT, on);
    return () => el.removeEventListener(VIEW_EVENT, on);
  }, [fx]);

  return (
    <div ref={root} className="panel-page" style={{ width, height }}>
      <div ref={scroller} className="scroller" style={{ overflow: "hidden" }}>
        {children}
      </div>
      <div ref={haze} className="pfx" style={{ background: `rgb(${fx.hazeColour})` }} />
      {fx.cast > 0 && <div className="pfx" style={{ background: `rgb(${CAST_COLOUR})`, opacity: fx.cast }} />}
      <div ref={edge} className="pfx" />
      <div ref={glow} className="pfx pfx-glow" />
      <div ref={tint} className="pfx pfx-tint" />
      {fx.glare > 0 && <div className="glare" style={{ opacity: fx.glare }} />}
    </div>
  );
}
