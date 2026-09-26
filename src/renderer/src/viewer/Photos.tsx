import { Canvas, createPortal, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { type Build, colourHex, decorOf, type Fit, solve } from "../engine";
import { buildShot, SIZE_FRAME, VIEWING_GRID } from "./reviewScenes";
import {
  heatMaterial,
  type PanelLook,
  panelLook,
  rivalOutlines,
  type ScreenKind,
  screenTexture,
} from "./reviewShots";
import { BottomCover, Model, surfacesOf } from "./Scene";

// Professional shots: the review's photos, taken automatically on the review
// sets in reviewScenes.ts. The player does not direct angles or lighting, and
// nothing is random, so the same build always gives the same photos. Rendered
// once on a hidden canvas and cached.

/** One photo: its id is "scene/shot", which the review site captions and places. */
interface Job {
  id: string;
  scene: string;
  shot: string;
}

const SIDES = ["left", "right", "rear", "front"] as const;

/** Every photo of a build, in the order they are taken. Port shots skip sides with no ports. */
function jobsFor(build: Build): Job[] {
  const j = (scene: string, shot: string): Job => ({ id: `${scene}/${shot}`, scene, shot });
  const sides = new Set(build.ports.map((p) => p.side));
  return [
    ...["hero", "closed", "top", "left", "right", "rear"].map((s) => j("studio", s)),
    ...SIDES.filter((s) => sides.has(s)).map((s) => j("ports", s)),
    j("size", "top"),
    j("teardown", "top"),
    j("viewing", "grid"),
    j("outdoor", "table"),
    j("desk", "wide"),
    j("desk", "screen"),
    j("thermal", "deck"),
    j("thermal", "bottom"),
  ];
}

const W = 1280;
const H = 720;

interface Pose {
  lid: number;
  lock?: THREE.Texture;
  gloss: number;
  teardown: boolean;
  n: number;
}

const noLabel = () => "";
const noHover = () => {};
const frames = (n: number) =>
  new Promise<void>((res) => {
    const step = (k: number) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });

/** Disposes a set, but never the cached assets it shares with other sets. */
function disposeSet(root: THREE.Object3D, keep: THREE.Object3D[]) {
  root.traverse((o) => {
    if (keep.includes(o) || o.userData.keep) return;
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of mats) if (!x.userData.keep) x.dispose();
    (o as THREE.DirectionalLight).shadow?.dispose?.();
  });
}

/** Takes every photo of the build in turn on the review sets, then reports them. */
function Shooter({
  id,
  build,
  fit,
  onDone,
}: {
  id: string;
  build: Build;
  fit: Fit;
  onDone: (photos: Record<string, string>) => void;
}) {
  const gl = useThree((s) => s.gl);
  const holder = useMemo(() => new THREE.Group(), []);
  const coverHolder = useMemo(() => new THREE.Group(), []);
  const [pose, setPose] = useState<Pose>({ lid: 110, gloss: 0.35, teardown: false, n: 0 });
  const waiting = useRef<(() => void)[]>([]);
  const count = useRef(0);
  // Children's effects run first, so every unit is built by the time this resolves.
  useEffect(() => {
    for (const f of waiting.current.splice(0)) f();
  }, [pose]);

  const colour = (cid: string) => colourHex(cid);
  const colours = useMemo(
    () => ({
      floor: colour(build.finish.floor.colour),
      deck: colour(build.finish.deck.colour),
      lid: colour(build.finish.lid.colour),
    }),
    [build],
  );
  const surfaces = useMemo(() => surfacesOf(build), [build]);

  useEffect(() => {
    let cancelled = false;
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    const out = fit.shell.outer;
    const size = { w: out.x, d: out.y, h: out.z, t: fit.shell.lid.size.z };
    const panel = fit.boxes.find((b) => b.kind === "unit" && b.role === "panel");
    const aspect = panel ? panel.size.x / panel.size.y : 16 / 10;
    const look: PanelLook = panelLook(build);
    const gloss = look.glossy ? 0.05 : 0.55;
    const heat = heatMaterial(build, fit);
    const apply = (p: Omit<Pose, "n">) =>
      new Promise<void>((res) => {
        waiting.current.push(res);
        count.current += 1;
        setPose({ ...p, n: count.current });
      });

    /** Renders one shot into `ctx` at the given rectangle. */
    async function shoot(
      sceneId: string,
      shotId: string,
      w: number,
      h: number,
      ctx: CanvasRenderingContext2D,
      dx: number,
      dy: number,
      view?: { daz: number; del: number },
    ) {
      const s = await buildShot(sceneId, shotId, { era: build.year, size, aspect: w / h });
      if (cancelled) return;
      const lock = s.screen ? screenTexture(s.screen as ScreenKind, build.year, aspect, look, view) : undefined;
      await apply({ lid: s.lid, lock, gloss, teardown: sceneId === "teardown" });
      s.laptopRoot.add(holder);
      if (s.coverRoot) s.coverRoot.add(coverHolder);
      await frames(2);
      if (cancelled) return;
      const swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      s.scene.updateMatrixWorld(true);
      for (const root of [holder, coverHolder])
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          if (s.thermal) {
            swapped.set(m, m.material);
            m.material = heat;
          }
        });
      heat.uniforms.uInv.value.copy(s.laptopRoot.matrixWorld).invert();
      if (!s.scene.environment) s.scene.environment = env;
      s.scene.environmentIntensity = s.env;
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = s.toneMapping;
      gl.toneMappingExposure = s.exposure;
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFShadowMap;
      gl.shadowMap.needsUpdate = true;
      gl.setSize(w, h, false);
      gl.render(s.scene, s.camera);
      ctx.drawImage(gl.domElement, 0, 0, w, h, dx, dy, w, h);
      for (const [m, mat] of swapped) m.material = mat;
      holder.removeFromParent();
      coverHolder.removeFromParent();
      disposeSet(s.scene, []);
      lock?.dispose();
    }

    async function take(job: Job): Promise<string | null> {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      if (job.scene === "viewing") {
        // Five views in a cross, each shot at the cell's own size.
        const G = VIEWING_GRID;
        const cw = Math.floor((W - G.gutterPx * 2) / G.cols);
        const ch = Math.floor((H - G.gutterPx * 2) / G.rows);
        ctx.fillStyle = G.fill;
        ctx.fillRect(0, 0, W, H);
        const views: Record<string, { daz: number; del: number }> = {
          centre: { daz: 0, del: 0 },
          left: { daz: -45, del: 0 },
          right: { daz: 45, del: 0 },
          above: { daz: 0, del: 40 },
          below: { daz: 0, del: -25 },
        };
        for (const [shot, [cx, cy]] of Object.entries(G.cells) as [string, number[]][]) {
          await shoot("viewing", shot, cw, ch, ctx, cx * (cw + G.gutterPx), cy * (ch + G.gutterPx), views[shot]);
          if (cancelled) return null;
        }
      } else {
        await shoot(job.scene, job.shot, W, H, ctx, 0, 0);
        if (cancelled) return null;
        if (job.scene === "size") {
          // Rival footprints on the same scale, centre x and front edge as the test unit.
          const k = W / SIZE_FRAME.widthMm;
          const px = (x: number) => W / 2 + x * k;
          const pz = (z: number) => H / 2 + z * k;
          ctx.save();
          ctx.strokeStyle = "#6d665d";
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 7]);
          for (const o of rivalOutlines(id, build, { w: size.w, d: size.d })) {
            const x0 = px(SIZE_FRAME.laptopCentreX - o.w / 2);
            const z0 = pz(SIZE_FRAME.frontEdgeZ - o.d);
            ctx.strokeRect(x0, z0, o.w * k, o.d * k);
          }
          ctx.restore();
        }
      }
      return c.toDataURL("image/jpeg", 0.88);
    }

    (async () => {
      const photos: Record<string, string> = {};
      for (const job of jobsFor(build)) {
        if (cancelled) return;
        try {
          const url = await take(job);
          if (url) photos[job.id] = url;
        } catch (e) {
          // One set that cannot be built must never stop the rest.
          console.error(`review photo ${job.id} could not be taken`, e);
          holder.removeFromParent();
          coverHolder.removeFromParent();
        }
      }
      if (!cancelled) onDone(photos);
    })();
    return () => {
      cancelled = true;
      for (const f of waiting.current.splice(0)) f();
      env.dispose();
      pmrem.dispose();
      room.dispose();
      heat.dispose();
    };
    // Runs once per mount: the shoot is keyed on the build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {createPortal(
        <Model
          fit={fit}
          year={build.year}
          lidAngle={pose.lid}
          colours={colours}
          decor={decorOf(build)}
          labelFor={noLabel}
          onHover={noHover}
          surfaces={surfaces}
          xray={false}
          lockScreen={pose.lock}
          screenGloss={pose.gloss}
          floorless={pose.teardown}
        />,
        holder,
      )}
      {pose.teardown &&
        createPortal(<BottomCover fit={fit} colour={colours.floor} surface={surfaces.floor} />, coverHolder)}
    </>
  );
}

/** A hidden canvas that photographs one build and reports the photos. */
function PhotoShoot({
  id,
  build,
  onDone,
}: {
  id: string;
  build: Build;
  onDone: (photos: Record<string, string>) => void;
}) {
  const fit = useMemo(() => solve(build), [build]);
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: W, height: H, pointerEvents: "none" }}>
      <Canvas gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={1} frameloop="never" shadows="percentage">
        <Shooter id={id} build={build} fit={fit} onDone={onDone} />
      </Canvas>
    </div>
  );
}

const cache = new Map<string, Record<string, string>>();

/**
 * Photos of a build, keyed by `key` (one set per model and build), as
 * "scene/shot" to image URL. Returns the photos once taken, and the hidden
 * shoot to render until then.
 */
export function usePhotos(
  key: string | null,
  build: Build | null,
): { photos: Record<string, string> | null; shoot: ReactNode } {
  const full = key && build ? `${key}|${JSON.stringify(build)}` : null;
  const [, bump] = useState(0);
  const photos = full ? (cache.get(full) ?? null) : null;
  const shoot =
    full && key && build && !photos ? (
      <PhotoShoot
        key={full}
        id={key}
        build={build}
        onDone={(p) => {
          cache.set(full, p);
          bump((n) => n + 1);
        }}
      />
    ) : null;
  return { photos, shoot };
}
