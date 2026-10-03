import { useFrame } from "@react-three/fiber";
import { type Dispatch, memo, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SavedModel } from "../../../preload/store";
import { type Build, colourHex, decorOf, type Fit, migrateBody, migrateColours, migrateScreen, solve } from "../engine";
import { PLINTH_H } from "../foundry/Stage";
import { Model, surfacesOf } from "../viewer/Scene";
import { bakeLaptop, freeze, SHELF_TEX, type Shelf, useShelf } from "../viewer/shelf";
import { type FreeState, freeStart } from "./Free";

// The archive: every laptop the company has built, standing a little open on the shelving
// along the workshop's front wall, oldest first, in rows that fill. The
// shelving holds 32; with more, N in free view shows the next 32. Looking at
// one in free view, E puts it on the turntable, and the laptop there goes back
// to its own spot. Shelved laptops cast no shadows and take no pointer.

/** Laptops the shelving holds at once: four shelves of eight. */
export const SHELF_PAGE = 32;
const PER_SHELF = 8;
/** The shelving, from the designer's workshop (metres there, mm here): its span, the shelves' tops, the boards' depth. */
const X0 = 4400;
const SLOT = 550;
const TOPS = [1680, 1230, 780, 330];
const BACK = 6480;
const MID = 6315;
/** Shelved laptops stand a little open, screens to the room, so every shelf reads from standing height. */
const SHELF_LID = 100;
/** Where a laptop this deep sits: centred on the board, its open lid clear of the wall. */
const depthAt = (D: number) => Math.min(MID, BACK - 50 - D / 2);
/** The workshop floor, as in free view: the room is lifted so its turntable top (0.95 m) is at the plinth's height. */
const FLOOR = PLINTH_H - 950;
/** Shelved laptops mount a few a frame, so walking in never stalls on solving them all. */
const MOUNT_PER_FRAME = 2;
/** Frames a shelved laptop's meshes must hold still before they are baked. */
const BAKE_AFTER = 2;

const noLabel = () => "";
const noHover = () => {};
const noRaycast = () => {};

/** What finding a shelved laptop costs, once per saved version. */
interface Look {
  build: Build;
  fit: Fit;
  colours: { floor: string; deck: string; lid: string };
}
const looks = new WeakMap<SavedModel, Look | null>();

function lookOf(m: SavedModel): Look | null {
  if (looks.has(m)) return looks.get(m) ?? null;
  let look: Look | null = null;
  try {
    const build = migrateBody(migrateColours(migrateScreen(m.build as Build)));
    const fit = solve(build);
    look = {
      build,
      fit,
      colours: {
        floor: colourHex(build.finish.floor.colour),
        deck: colourHex(build.finish.deck.colour),
        lid: colourHex(build.finish.lid.colour),
      },
    };
  } catch {
    look = null;
  }
  looks.set(m, look);
  return look;
}

/** The order the shelving fills in: oldest first. */
export const shelfOrder = (models: SavedModel[]) => [...models].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));

/** A ray's nearest shelved laptop within reach. */
export type AimShelf = (ray: THREE.Ray, reach: number) => { id: string; d: number } | null;

const Shelved = memo(function Shelved({
  shelf,
  model,
  x,
  y,
  onBaked,
}: {
  shelf: Shelf;
  model: SavedModel;
  x: number;
  y: number;
  /** Once it shows: baked, or never, when it cannot be solved. */
  onBaked: (id: string) => void;
}) {
  const look = lookOf(model);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount
  useEffect(() => {
    if (!look) onBaked(model.id);
  }, []);
  const src = useRef<THREE.Group>(null);
  const settle = useRef({ n: -1, frames: 0, done: false });
  const surfaces = useMemo(() => (look ? surfacesOf(look.build) : undefined), [look]);
  const decor = useMemo(() => (look ? decorOf(look.build) : undefined), [look]);
  useFrame(() => {
    const s = src.current;
    const st = settle.current;
    if (st.done || !s) return;
    // The laptop builds its units as it mounts: baked once its meshes stop changing.
    let n = 0;
    s.traverse((o) => {
      n++;
      o.raycast = noRaycast;
    });
    if (n !== st.n) {
      st.n = n;
      st.frames = 0;
    } else if (++st.frames >= BAKE_AFTER) {
      st.done = true;
      shelf.set(model.id, bakeLaptop(s, shelf.root));
      freeze(s);
      onBaked(model.id);
    }
  });
  if (!look || !surfaces) return null;
  const D = look.fit.shell.outer.y;
  return (
    <group position={[x, y, depthAt(D)]} rotation-y={Math.PI}>
      {/* Never drawn: the source of the shelf's baked meshes, and the owner of its marks. */}
      <group ref={src} visible={false}>
        <Model
          fit={look.fit}
          year={look.build.year}
          lidAngle={SHELF_LID}
          colours={look.colours}
          surfaces={surfaces}
          decor={decor}
          xray={false}
          labelFor={noLabel}
          onHover={noHover}
          problems={false}
          unlit
          texWidth={SHELF_TEX}
        />
      </group>
    </group>
  );
});

/** The shelving's page of laptops, the one on the turntable left out of its spot. */
export function Archive({
  models,
  page,
  onTable,
  aim,
  onReady,
}: {
  /** In shelf order. */
  models: SavedModel[];
  page: number;
  onTable: string | null;
  aim: RefObject<AimShelf | null>;
  /** Once every laptop on the page shows. */
  onReady: () => void;
}) {
  const slots = useMemo(
    () =>
      models.slice(page * SHELF_PAGE, (page + 1) * SHELF_PAGE).map((m, i) => ({
        m,
        x: X0 + SLOT * ((i % PER_SHELF) + 0.5),
        y: FLOOR + TOPS[Math.floor(i / PER_SHELF)],
      })),
    [models, page],
  );
  const [shown, setShown] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page mounts afresh, a few a frame
  useEffect(() => setShown(0), [page]);
  useFrame(() => {
    if (shown < slots.length) setShown((n) => Math.min(slots.length, n + MOUNT_PER_FRAME));
  });
  // The laptops shown so far: the page is in once every one but the turntable's is.
  const done = useRef(new Set<string>());
  const [, setDone] = useState(0);
  const onBaked = useCallback((id: string) => {
    if (done.current.has(id)) return;
    done.current.add(id);
    setDone((n) => n + 1);
  }, []);
  const all = slots.every(({ m }) => done.current.has(m.id));
  const shelf = useShelf(false);
  // The page is in once every laptop on it is baked and merged.
  const waiting = useRef(true);
  waiting.current = !all;
  useFrame(() => {
    if (!waiting.current && !shelf.busy) {
      waiting.current = true;
      onReady();
    }
  });
  useEffect(() => shelf.keep(new Set(slots.map(({ m }) => m.id))), [shelf, slots]);
  // The laptop on the turntable stays baked on the shelf, left out of the drawing until it is back.
  useEffect(() => {
    for (const { m } of slots) shelf.place(m.id, m.id === onTable ? null : undefined);
  }, [shelf, slots, onTable]);

  const boxes = useMemo(
    () =>
      slots.map(({ m, x, y }) => {
        const look = lookOf(m);
        const W = look?.fit.shell.outer.x ?? 330;
        const D = look?.fit.shell.outer.y ?? 230;
        const T = look ? look.fit.shell.outer.z + look.fit.lidZ : 20;
        const z = depthAt(D);
        // Up to the open lid's top, so it is easy to look at.
        return {
          id: m.id,
          box: new THREE.Box3(new THREE.Vector3(x - W / 2, y, z - D / 2), new THREE.Vector3(x + W / 2, y + T + Math.min(D, 400), z + D / 2)),
        };
      }),
    [slots],
  );
  const hit = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    aim.current = (ray, reach) => {
      let best: { id: string; d: number } | null = null;
      for (const b of boxes) {
        if (b.id === onTable || !ray.intersectBox(b.box, hit)) continue;
        const d = hit.distanceTo(ray.origin);
        if (d < reach && (!best || d < best.d)) best = { id: b.id, d };
      }
      return best;
    };
    return () => {
      aim.current = null;
    };
  }, [aim, boxes, onTable, hit]);

  return (
    <>
      <primitive object={shelf.root} />
      {slots.slice(0, shown).map(({ m, x, y }) => (
        <Shelved key={m.id} shelf={shelf} model={m} x={x} y={y} onBaked={onBaked} />
      ))}
    </>
  );
}

/**
 * The archive in free view: the page shown, what the player looks at, and
 * the keys that move laptops between it and the turntable. `take` gets the
 * chosen model, `putAway` empties the turntable.
 */
export function useArchive(
  models: SavedModel[],
  onTable: string | null,
  setFree: Dispatch<SetStateAction<FreeState | null>>,
  take: (m: SavedModel) => void,
  putAway: () => void,
) {
  const order = useMemo(() => shelfOrder(models), [models]);
  const pages = Math.max(1, Math.ceil(order.length / SHELF_PAGE));
  // Starts on the page holding the laptop on the turntable, or the newest.
  const [page, setPage] = useState(() => {
    const i = onTable ? order.findIndex((m) => m.id === onTable) : -1;
    return Math.floor((i >= 0 ? i : Math.max(0, order.length - 1)) / SHELF_PAGE);
  });
  const shown = Math.min(page, pages - 1);
  const aim = useRef<AimShelf | null>(null);
  const onShelf = useCallback(
    (id: string | null) => setFree((s) => (s && s.shelf !== id ? { ...s, shelf: id } : s)),
    [setFree],
  );
  const keys = {
    take: (id: string) => {
      const m = order.find((x) => x.id === id);
      if (m) take(m);
    },
    putAway: onTable ? putAway : undefined,
    more: pages > 1 ? () => setPage((p) => (p + 1) % pages) : undefined,
  };
  // The first page's laptops all show: the workshop has finished loading.
  const [ready, setReady] = useState(false);
  const shelved = useCallback(() => setReady(true), []);
  const archive = <Archive models={order} page={shown} onTable={onTable} aim={aim} onReady={shelved} />;
  return { archive, aim, onShelf, keys, ready };
}

/**
 * Calls `onReady` once both the workshop room and the archive's shelves are
 * in. Returns what the room calls when it has loaded.
 */
export function useWorkshopReady(shelved: boolean, onReady?: () => void) {
  const [room, setRoom] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    if (!room || !shelved || fired.current) return;
    fired.current = true;
    onReady?.();
  }, [room, shelved, onReady]);
  return useCallback(() => setRoom(true), []);
}

/** Free view's state for a laptop just put on the turntable: shut, as it lay on the shelf. */
export const freshOnTable = (s: FreeState | null, lidOpen = false, flipped = false): FreeState | null =>
  s ? { ...freeStart(lidOpen, flipped), paused: s.paused } : s;
