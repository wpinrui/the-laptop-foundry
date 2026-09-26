# Review photo scenes: handoff

Build the review photo sets into the game. `review-scenes.js` is the source of truth. `Review Photo Scenes.dc.html` shows the expected result for each shot; open it in a browser to compare.

## Files
- `review-scenes.js`: the deliverable. Sets, lights, camera framing and asset loading for all eight scenes. Port to TS at `src/renderer/src/viewer/reviewScenes.ts`.
- `repo-parts.js`: a JS copy of `models/roles/fan.ts` and `fin.ts`, used only by the preview. Do not port it; use the real modules.
- `review-shot.js`: the preview renderer with a stand-in laptop. For reference only. It shows how a caller drives `buildShot`.
- `Review Photo Scenes.dc.html`: the spec page, with numbers, reference renders and asset credits.

## API
```ts
buildShot(sceneId, shotId, { era, size, aspect }) => Promise<{
  scene, camera, lid, laptopRoot, coverRoot, env, screen, thermal, toneMapping, exposure
}>
```
- `size` is `{ w, d, h, t }` in mm: `w, d, h` = `fit.shell.outer.x, .y, .z`; `t` = lid thickness (optional).
- `era` is the build year; it is bucketed to 2006, 2016 or 2026.
- The scene is in mm, y up, with the same world frame as `viewer/space.ts`. Put the game's `Model` under `laptopRoot` exactly as `Scene` places it, and set its lid to `lid`. Do not reposition it: some sets move or rotate `laptopRoot` themselves (teardown, outdoor, size).
- Scene and shot ids are the keys of `SCENES` and each scene's `shots`.

## What the game must supply
1. **Laptop:** its Model under `laptopRoot`, lid at `lid`.
2. **Teardown:** turn off the bottom cover in the Model and render the cover on its own under `coverRoot`, inner face up. `laptopRoot` is already flipped upside down.
3. **Screen:** `screen` is `'wallpaper' | 'test' | 'bench' | 'sysinfo' | null`. Map each id to the game's texture. Viewing angles: shift the test image per panel type before each of the five renders. Outdoor: add glare for glossy panels.
4. **Thermal:** when `thermal` is true, replace the laptop's materials with the unlit false-colour heat map. The set is kept neutral and dark for this.
5. **Composites:**
   - Viewing angles: render the five shots and lay them out with `VIEWING_GRID`.
   - Size comparison: draw rival outlines using `SIZE_FRAME`. The frame is 840 mm wide, laptops share one centre x and front edge, and the A4 sheet position is included.

## Renderer settings per shot
- `outputColorSpace = SRGB`.
- `toneMapping = shot.toneMapping`, `toneMappingExposure = shot.exposure`.
- `shadowMap.enabled = true`, PCF.
- If `scene.environment` is unset, use the existing `Reflections` (RoomEnvironment) at `env`. Studio and outdoor set their own HDRI environment.
- Render at 16:9. Pass the canvas aspect as `aspect`.

## Assets (Poly Haven, CC0)
- The full list is in `ASSETS` inside `review-scenes.js`. Sizes: HDRIs 1k for the studio and 2k for outdoor, models as 1k glTF, oak texture at 1k.
- Download them into the app's resources.
- Call `setAssetResolver(async (id, kind, res) => ...)`. It returns `{ url }` for an HDRI, `{ url, include: { relPath: url } }` for a glTF, and `{ maps: { map, rough, nor } }` for a texture.
- There must be no network calls at runtime.
- Credit them in the game's credits. The page's Assets section has names, authors and links.

## Wire up
- Replace the hard-coded studio in `viewer/Photos.tsx` with `buildShot`. Keep the cache and the hidden, render-once flow.
- Caption each photo from its shot id. Update `PHOTO_CAPTIONS` in `ReviewSite.tsx`.
- Note: `ReviewSite.tsx` currently hides the photos (`photos.length ? 0 && ...`). Turn that back on when this is ready.

## Must hold
- **Deterministic:** the same build always gives the same pixels. Nothing is random; keep it that way.
- **Any laptop 250 to 400 mm wide:** check `hero`, `teardown/top`, `outdoor/table` and `size/top` at 250 and 400 in all three eras.
- **No text or branding anywhere in a set.**
