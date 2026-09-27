import { useEffect, useRef, useState } from "react";

/**
 * The same reference for as long as the value's content is unchanged, so a
 * memo keyed on it survives a re-solve that rebuilt an equal object.
 */
export function useStable<T>(value: T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  const key = JSON.stringify(value) ?? "";
  if (!ref.current || ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

/**
 * The value, held back while it keeps changing: a lone change, such as a
 * click, comes through at once; in a run of changes, such as a slider drag,
 * the last value comes through once it has held still for `ms`.
 */
export function useSettled<T>(value: T, ms = 150): T {
  const [settled, setSettled] = useState(value);
  // When the last change finished drawing: a change soon after it is part of a run.
  const done = useRef(Number.NEGATIVE_INFINITY);
  const seen = useRef({ value, quiet: true });
  if (!Object.is(seen.current.value, value))
    seen.current = { value, quiet: performance.now() - done.current > ms };
  const quiet = seen.current.quiet;
  useEffect(() => {
    done.current = performance.now();
    if (Object.is(value, settled)) return;
    if (quiet) {
      setSettled(() => value);
      return;
    }
    const t = setTimeout(() => setSettled(() => value), ms);
    return () => clearTimeout(t);
  }, [value, settled, ms, quiet]);
  return quiet ? value : settled;
}
