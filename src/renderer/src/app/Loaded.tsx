import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

/**
 * Calls `onReady` once, `frames` frames after it mounts. A place puts it in
 * its Suspense boundary, mounted only once its last loading step is done, so
 * the travel card over it lifts when nothing is left to pop in.
 */
export function Loaded({ onReady, frames = 3 }: { onReady: () => void; frames?: number }) {
  const n = useRef(0);
  const done = useRef(onReady);
  done.current = onReady;
  useFrame(() => {
    n.current += 1;
    if (n.current === frames) done.current();
  });
  return null;
}
