import { useSyncExternalStore } from "react";

// The open campaign's awards, as the review site prints them. The app sets
// them when a company opens or its campaign moves; a sandbox company has none.

export interface Honour {
  year: number;
  /** The award's name. */
  award: string;
  /** The winning model's or rival's id. */
  id: string;
  company: string;
  name: string;
}

let current: Honour[] = [];
const subscribers = new Set<() => void>();

export function setHonours(next: Honour[]): void {
  current = next;
  for (const f of subscribers) f();
}

function subscribe(f: () => void): () => void {
  subscribers.add(f);
  return () => subscribers.delete(f);
}

export function useHonours(): Honour[] {
  return useSyncExternalStore(subscribe, () => current);
}
