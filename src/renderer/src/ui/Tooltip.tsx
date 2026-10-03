import {
  cloneElement,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./tooltip.css";

type Anchor = {
  onPointerEnter?: (e: PointerEvent<Element>) => void;
  onPointerLeave?: (e: PointerEvent<Element>) => void;
  onPointerDown?: (e: PointerEvent<Element>) => void;
  onFocus?: (e: FocusEvent<Element>) => void;
  onBlur?: (e: FocusEvent<Element>) => void;
  "aria-describedby"?: string;
};

/** Space between the anchor and the card, and between the card and the window edge, in px. */
const GAP = 8;

/**
 * A small card beside its one DOM element child while that child is hovered or
 * keyboard focused. The card sits in document.body at a fixed position, so no
 * overflow on the way up clips it.
 */
export function Tooltip({
  tip,
  children,
  className,
}: {
  tip: ReactNode;
  children: ReactElement<Anchor>;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const id = useId();
  const own = children.props;
  const empty =
    tip === undefined || tip === null || tip === false || tip === "";

  const show = (e: SyntheticEvent<Element>) => {
    if (!empty) setAnchor(e.currentTarget.getBoundingClientRect());
  };
  const hide = () => {
    setAnchor(null);
    setAt(null);
  };

  useLayoutEffect(() => {
    if (!anchor || !card.current) return;
    const c = card.current.getBoundingClientRect();
    let top = anchor.bottom + GAP;
    if (top + c.height > window.innerHeight - GAP)
      top = Math.max(GAP, anchor.top - GAP - c.height);
    const centred = anchor.left + anchor.width / 2 - c.width / 2;
    const left = Math.max(
      GAP,
      Math.min(centred, window.innerWidth - GAP - c.width),
    );
    setAt({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, [anchor]);

  const trigger = cloneElement(children, {
    onPointerEnter: (e: PointerEvent<Element>) => {
      own.onPointerEnter?.(e);
      if (e.pointerType !== "touch") show(e);
    },
    onPointerLeave: (e: PointerEvent<Element>) => {
      own.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: PointerEvent<Element>) => {
      own.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: FocusEvent<Element>) => {
      own.onFocus?.(e);
      if (e.target instanceof Element && e.target.matches(":focus-visible"))
        show(e);
    },
    onBlur: (e: FocusEvent<Element>) => {
      own.onBlur?.(e);
      hide();
    },
    "aria-describedby": anchor ? id : own["aria-describedby"],
  });

  return (
    <>
      {trigger}
      {anchor &&
        !empty &&
        createPortal(
          <div
            ref={card}
            id={id}
            role="tooltip"
            className={className ? `tt ${className}` : "tt"}
            style={
              at
                ? { left: at.left, top: at.top }
                : { left: 0, top: 0, visibility: "hidden" }
            }
          >
            {tip}
          </div>,
          document.body,
        )}
    </>
  );
}
