# Modelling

Every part of the laptop is a placeholder box until you replace it. Build one model per entry below, top of the list first.

## How to deliver a model

### The contract

A model is one TypeScript module that builds a three.js object for a box the engine hands it.

- File: `src/renderer/src/models/roles/<key>.ts`, where `<key>` is the entry's key.
- It exports `model`, typed `ModelModule` from `src/renderer/src/models/contract.ts`:

```ts
import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

function build(box: ModelBox, options: Record<string, string | number>, ctx: ModelContext): THREE.Object3D {
  // ...
}

export const model: ModelModule = { key: "fan", build };
```

- `box` is `{ width, height, depth }` in mm: the space the engine solved for this part. Fill it and stay inside it.
- `options` are the chosen part's options, defaults filled in, e.g. `{ capacity: 16, slots: 2 }`.
- `ctx` holds everything else:
  - `ctx.year`: 2006 or 2026. The look changes with the year.
  - `ctx.part`: the part's id, e.g. `"usb-c-10g"` or `"vapour-chamber"`.
  - `ctx.piece`: `"floor"`, `"deck"` or `"lid"`.
  - `ctx.edge`: for parts against an outer wall, the side of your box that faces outside (`"left"`, `"right"`, `"front"`, `"back"`).
  - `ctx.hinge`: the body's hinge style (`"full"`, `"barrel"`, `"drop"`).
  - `ctx.removable`: a removable battery; its underside is the outside of the laptop.
  - `ctx.materials`: the only materials you may use.
  - `ctx.random()`: the only randomness you may use.
- Adding the file is the whole delivery. It registers itself; nothing else in the repo changes.

### Conventions

- 1 unit = 1 mm.
- Origin at the centre of the box.
- x is width, left to right. y is height, up is +y. z is depth, and the front faces +z.
- Base parts (floor and deck): front is the laptop's front edge, up is out of the keyboard.
- Lid parts: front (+z) is the screen side, toward the user with the lid open. +y runs up the screen toward the top bezel.
- Materials: use `ctx.materials.body`, `metal`, `plastic`, `rubber`, `glass`, `glow` and `accent` only. Never create a material. The engine re-skins parts through these slots. `body` is the part's own colour. `glow` is for anything lit. `accent` is a coloured accent, blue by default, e.g. USB tongues; the engine may recolour it.
- Anchors: an empty `THREE.Object3D` child named `anchor:<name>`, placed where the name says. Each entry lists the anchors it must have.
- No text, labels, logos or brand names on any model, unless a real laptop part carries them (keycap legends are the only case here, and are optional).

### Rules the check enforces

- Inside the box, within 0.05 mm, anchors included.
- Deterministic: the same inputs give the same model. Use `ctx.random()` if you need variation, never `Math.random`.
- No external assets, loaders, textures from files, network or clock. Everything is built from code.
- Within the entry's triangle budget and build-time budget.
- Only `ctx.materials`.
- Every required anchor present.

### How to verify

```
yarn test src/renderer/src/models
```

It builds your model at every size and in every context the game produces for that key, and checks every rule above. It prints the worst triangle count and build time. Green means done on the technical side. To see it, run `yarn dev`. In development, a model that leaves its box gets a red outline.

### The example to copy

`src/renderer/src/models/roles/fan.ts` is the reference fan. It shows the whole contract:
- reading the box and `ctx.year`;
- facing an opening toward `ctx.edge`;
- using only slot materials;
- placing the anchors.

Copy its structure.

## Entries

Size ranges are width by height by depth in model space, in mm. They come from the engine's own content and solver (`src/renderer/src/models/ranges.ts`); the check tests the full range. The look must hold at every size in the range, not only the typical one.

### 1. fan: replace the reference fan with a production-quality fan

- **Key and file**: `fan`, `src/renderer/src/models/roles/fan.ts` (replace the existing file).
- **What**: a laptop blower fan: housing, round intake in the top plate, rotor of blades, an open outlet on one side.
- **Size**: 2006: 50 to 70 wide and deep, 6 to 12 high. 2026: 50 to 90 wide and deep, 3 to 12 high. The fan is square in plan; width equals depth.
- **Options**: none. `ctx.part` is `one-fan`, `two-fans` or `vapour-chamber`; the fan looks the same in each.
- **Years**: 2006 fans have 9 to 13 thick blades and a metal top plate. 2026 fans have 30 or more thin blades and a dark plastic housing.
- **Outlet**: the open side faces `ctx.edge` (`back` or `left`), toward the fin stack.
- **Anchors**: `hub` (top centre of the rotor), `outlet` (centre of the outlet opening).
- **Budget**: 4,000 triangles, 8 ms.
- **Reference**: `src/renderer/src/models/roles/fan.ts`; fan limits in `src/renderer/src/engine/content/eras.ts`.
- **Done when**: the check is green and the fan reads as a real laptop fan at 3 mm and at 12 mm thick.
- **Status**: Ready.

### 2. keys: keyboard

- **File**: `src/renderer/src/models/roles/keys.ts`.
- **What**: the keyboard assembly: keycaps on a plate, six rows. The box top is the top surface of the laptop; keycap tops sit at the top of the box.
- **Size**: 2006: 250.5 to 355.5 wide, 5 to 6.5 high, 106 to 118 deep. 2026: 265 to 355.5 wide, 2.2 to 5 high, 112 to 118 deep.
- **Options**:
  - `cols`: 15 is a standard layout; 19 adds a numpad on the right.
  - `pitch`: 17, 18 or 19 mm between key centres.
  - `light`:
    - `none`: unlit caps.
    - `lid-light`: unlit caps; the light is a separate lid part.
    - `backlit`, `white`: glow under legends and around caps, using `glow`.
    - `rgb-zones`, `rgb-per-key`: the same, using `glow`; the engine will colour it.
- **Parts**: `kb-2.5`, `kb-3.0` (2006); `kb-1.0`, `kb-1.5`, `kb-mech-1.8` (2026). Travel shows as key height: taller caps for longer travel.
- **Years**: 2006 caps are tall and sculpted, with narrow gaps. 2026 caps are flat chiclet keys with wide gaps.
- **Legends**: optional. If you add them, make them geometry, within the budget.
- **Anchors**: none.
- **Budget**: 40,000 triangles, 30 ms.
- **Reference**: `src/renderer/src/engine/content/peripherals.ts` (footprint and stack heights); `src/renderer/src/engine/units.ts` (`case "keys"`).
- **Done when**: green, and both layouts read correctly at 17 and 19 mm pitch.
- **Status**: Ready.

### 3. panel: display panel

- **File**: `src/renderer/src/models/roles/panel.ts`.
- **What**: the display module in the lid. Width and height are the active area; depth is the module thickness.
- **Size**: 2006: 245.9 to 366.2 wide, 162.9 to 228.9 high, 4.7 to 6.5 deep. 2026: 285.3 to 387.7 wide, 179 to 242.3 high, 1.8 to 5 deep.
- **Options**: `refresh` (no visual change).
- **Parts**: `ctx.part` names the panel row, e.g. `2006-15.4-1680x1050-tn-matte`. The type is in the id.
  - `tn-matte`: matte surface.
  - `tn-glossy`: glossy surface.
  - `ips-type`: matte.
  - `ips`, `oled`, `mini-led`: 2026, under cover glass.
- **Years**: 2006 is a CCFL module with a metal frame and a matte or glossy film; the bezel is a separate lid part. 2026 is cover glass edge to edge over the active area.
- **Screen surface**: make the viewing face one separate mesh named `screen`, using `glass` or `glow`. The engine will put the in-game screen on it later.
- **Anchors**: none.
- **Budget**: 2,000 triangles, 6 ms.
- **Reference**: `src/renderer/src/engine/content/display.ts`.
- **Done when**: green, and matte, glossy and cover-glass panels read differently.
- **Status**: Ready.

### 4. pad: trackpad

- **File**: `src/renderer/src/models/roles/pad.ts`.
- **What**: the pad surface, flush with the top of the box, plus button rows.
- **Size**: 2006: 65 to 85 wide, 3.5 to 4.5 high, 52 to 74 deep. 2026: 110 to 160 wide, 2.5 to 4.5 high, 70 to 112 deep.
- **Options**:
  - `buttons`: `separate` adds a 12 mm button row along the front (+z) edge; `clickpad` has none.
  - `stick`: `yes` adds a 12 mm row of three buttons along the back (-z) edge.
  - `mechanism`: `haptic` or `mechanical` (no visible change).
- **Years**: 2006 pads are small, matte and recessed, with two chunky buttons. 2026 pads are large glass-smooth clickpads.
- **Anchors**: none.
- **Budget**: 1,500 triangles, 4 ms.
- **Reference**: `src/renderer/src/engine/content/peripherals.ts` (`TRACKPADS`).
- **Done when**: green, and every combination of buttons and stick lays out correctly.
- **Status**: Ready.

### 5. hinge: hinge mount

- **File**: `src/renderer/src/models/roles/hinge.ts`.
- **What**: one of the two hinge mounts at the rear corners of the base.
- **Size**: 2006: 25 to 30 wide, 5 to 6 high, 20 deep. 2026: 30 to 35 wide, 4 to 5 high, 15 to 20 deep.
- **Options**: none. The look follows `ctx.hinge`:
  - `full`: part of a full-width hinge cover.
  - `barrel`: a round barrel.
  - `drop`: a low drop-hinge bracket.
- **Years**: 2006 is chunky and metal; 2026 is slim.
- **Anchors**: none.
- **Budget**: 2,000 triangles, 6 ms.
- **Reference**: `src/renderer/src/engine/content/bodies.ts`.
- **Done when**: green, and all three hinge styles read clearly.
- **Status**: Ready.

### 6. port: ports

- **File**: `src/renderer/src/models/roles/port.ts` (one module draws every port).
- **What**: the connector behind an opening in the side wall. The opening faces `ctx.edge`.
- **Size**: 2006: 5 to 86 wide, 3 to 15 high, 5 to 86 deep. 2026: 5 to 30 wide, 2 to 14 high, 5 to 30 deep.
  - On a left or right edge, the opening's width runs along depth (z) and the connector reaches in along width (x).
  - On a back or front edge, the other way round.
- **Options**: none. `ctx.part` is the port:
  - Power: `dc-jack`.
  - Video: `vga`, `dvi-d`, `s-video`, `hdmi-1.3`, `hdmi-2.1`.
  - Network: `ethernet-100`, `ethernet-1g`, `ethernet-2.5g`, `ethernet-drop-jaw`, `modem-rj11`.
  - USB: `usb-a-2.0`, `usb-a-5g`, `usb-a-10g`, `usb-c-10g`, `usb4-40g`, `thunderbolt-4`, `thunderbolt-5`, `firewire-400`.
  - Cards: `pc-card`, `expresscard-34`, `expresscard-54`, `sd-reader`, `sd-reader-uhs2`, `microsd-reader`.
  - Audio: `headphone-mic` (one opening each), `audio-combo`.
  - Other: `lock-slot`.
- **Years**: 2006 USB-A tongues stay black `plastic`. 2026 USB-A at 5 Gbps and up use `accent` for the tongue. Use plastic or body elsewhere; no text.
- **Anchors**: `opening` (centre of the opening, on the `ctx.edge` face).
- **Budget**: 1,500 triangles, 4 ms.
- **Reference**: `src/renderer/src/engine/content/ports.ts`.
- **Done when**: green, and every port reads as itself on all four edges.
- **Status**: Ready.

### 7. battery: battery

- **File**: `src/renderer/src/models/roles/battery.ts`.
- **What**: the battery pack.
- **Size**: 2006: 142 to 329.4 wide, 8 to 21 high, 42 to 82 deep. 2026: 51 to 435.3 wide, 4.5 to 8.5 high, 34 to 89 deep.
- **Options and parts**:
  - `li-ion-18650`: `cells` 4, 6, 9 or 12; rows of cylindrical cells in a pack.
  - `slim-li-po-2006`: `wh` 40 or 55; a flat pack.
  - `li-po-pouch`: `wh` 45 to 99.9, `thickness` `slim` or `standard`; a flat pouch.
  - `bridge-battery`: a small internal cell (2026 hot-swap).
- **Removable**: when `ctx.removable` is true, the underside (-y) is the outside of the laptop. Give it a finished casing with a latch.
- **Years**: 2006 packs are in hard plastic casings. 2026 pouches are bare foil with a flex connector.
- **Anchors**: `connector` (where the pack plugs into the laptop).
- **Budget**: 2,000 triangles, 8 ms.
- **Reference**: `src/renderer/src/engine/content/power.ts`.
- **Done when**: green, and cell packs, slim packs and pouches read differently.
- **Status**: Ready.

### 8. board: mainboard

- **File**: `src/renderer/src/models/roles/board.ts`.
- **What**: the bare PCB only. Chips, memory, M.2 drives and cards are separate parts drawn on top of it. Draw the PCB as a slab at the bottom of the box: 1.6 mm thick in 2006, 1.0 mm in 2026. Keep the rest of the box free, apart from low surface detail (traces, small components under 1 mm).
- **Size**: 2006: 119.3 to 161.2 wide, 8.6 to 11.6 high, 107.6 to 154.6 deep. 2026: 97.5 to 149 wide, 5 to 10.2 high, 117.6 to 153 deep.
- **Options**: none.
- **Years**: 2006 is a green PCB; 2026 is a dark PCB.
- **Anchors**: none.
- **Budget**: 6,000 triangles, 10 ms.
- **Reference**: `src/renderer/src/engine/board.ts`.
- **Done when**: green, and nothing drawn overlaps the chips.
- **Status**: Ready.

### 9. fin: fin stack

- **File**: `src/renderer/src/models/roles/fin.ts`.
- **What**: a heat-sink fin stack behind a vent. The fins run from the fan to the wall facing `ctx.edge`.
- **Size**: 2006: 6.8 to 70 wide and deep, 6 to 12 high. 2026: 6.8 to 90 wide and deep, 3 to 12 high. One plan dimension is the fin depth (6.8 to 8); the other matches the fan.
- **Options**: none.
- **Years**: 2006 is copper with thick fins; 2026 is thin, dense fins.
- **Anchors**: `vent` (centre of the face on `ctx.edge`).
- **Budget**: 3,000 triangles, 8 ms.
- **Reference**: the reference fan for edge handling.
- **Done when**: green.
- **Status**: Ready.

### 10. spk: speaker

- **File**: `src/renderer/src/models/roles/spk.ts`.
- **What**: one speaker driver in its enclosure.
- **Size**: 2006: 25.5 to 45 wide, 6.8 to 14 high, 12.8 to 40 deep. 2026: 10.2 to 20 wide, 3.8 to 9 high, 29.8 to 60 deep.
- **Options**: none. `ctx.part` names the set; tell the driver from the box:
  - 2006: 45 by 40 is the subwoofer.
  - 2026: 45 or 60 deep is a woofer; 35 deep is a tweeter.
- **Years**: 2006 is round cones; 2026 is sealed boxes with a grille.
- **Anchors**: none.
- **Budget**: 2,000 triangles, 6 ms.
- **Reference**: `src/renderer/src/engine/content/peripherals.ts` (`SPEAKERS`).
- **Done when**: green.
- **Status**: Ready.

### 11. drive: bay drive

- **File**: `src/renderer/src/models/roles/drive.ts`.
- **What**: a 2.5 or 1.8 inch drive lying flat.
- **Size**: 2006: 78.5 to 100 wide, 5 to 9.5 high, 54 to 69.8 deep. 2026: 100 wide, 7 high, 69.8 deep.
- **Options**: `capacity` (no visual change).
- **Parts**: `hdd25-5400`, `hdd25-7200`, `hdd18`, `ssd18-pata` (2006); `ssd25-sata` (2026). Hard disks show a metal lid and a connector; SSDs a plain case.
- **Anchors**: none.
- **Budget**: 3,000 triangles, 8 ms.
- **Done when**: green.
- **Status**: Ready.

### 12. odd: optical bay

- **File**: `src/renderer/src/models/roles/odd.ts`.
- **What**: an optical drive, with its bezel and tray slot on the `ctx.edge` face. Part `bay-battery` is instead a battery shaped like the drive, with a plain bezel.
- **Size**: 126 wide, 9.5 to 12.7 high, 128 deep, in both years.
- **Options**: none.
- **Parts**: `combo`, `dvd-rw-dl`, `dvd-rw-slim-2006`, `bd-writer`, `hd-dvd`, `bay-battery` (2006); `dvd-rw-slim`, `bd-writer-slim` (2026).
- **Anchors**: `slot` (centre of the tray slot on the `ctx.edge` face).
- **Budget**: 3,000 triangles, 8 ms.
- **Done when**: green.
- **Status**: Ready.

### 13. webcam: webcam

- **File**: `src/renderer/src/models/roles/webcam.ts`.
- **What**: the camera module in the top bezel, lens facing +z.
- **Size**: 2006: 21.3 to 30 wide, 5.1 to 7 high, 3 to 4.5 deep. 2026: 17 to 55 wide, 3.4 to 5 high, 2.4 to 3.5 deep.
- **Options**: `shutter`: `yes` adds a sliding privacy shutter beside the lens.
- **Parts**: `cam-1080p-ir` and `cam-5mp-ir` add IR emitters beside the lens.
- **Anchors**: `lens` (centre of the lens face).
- **Budget**: 1,500 triangles, 4 ms.
- **Done when**: green.
- **Status**: Ready.

### 14. cpu: processor package

- **File**: `src/renderer/src/models/roles/cpu.ts`.
- **What**: the processor package on the board.
- **Size**: 2006: 29.8 to 35 wide, 2 to 4 high, 35 deep. 2026: 21.3 to 50 wide, 1.5 to 2 high, 25 to 52.5 deep.
- **Options**: none. `ctx.part` is the processor:
  - 2006 socketed parts show a socket under a square package; `core-duo-u2500` is soldered.
  - 2026 parts are bare dies on a substrate.
- **Anchors**: `die` (top centre of the die, where the heat leaves).
- **Budget**: 800 triangles, 4 ms.
- **Reference**: `src/renderer/src/engine/content/processors.ts`.
- **Done when**: green.
- **Status**: Ready.

### 15. gpu: discrete graphics

- **File**: `src/renderer/src/models/roles/gpu.ts`.
- **What**: the graphics chip with its memory around it. 2006 MXM parts are a module on a connector.
- **Size**: 2006: 38.3 to 100 wide, 2 to 7 high, 38.3 to 82 deep. 2026: 46.8 to 75 wide, 2 high, 38.3 to 70 deep.
- **Options**: none.
- **Parts**:
  - `geforce-go-7600`, `radeon-x1600`, `geforce-go-7900-gtx`: MXM modules.
  - Everything else is soldered.
- **Anchors**: `die`.
- **Budget**: 1,500 triangles, 4 ms.
- **Reference**: `src/renderer/src/engine/content/graphics.ts`.
- **Done when**: green.
- **Status**: Ready.

### 16. mem: memory

- **File**: `src/renderer/src/models/roles/mem.ts`.
- **What**: memory on the board.
- **Size**: 2006: 30 wide, 4.6 to 9.2 high, 67.6 deep. 2026: 23 to 40 wide, 1.2 to 9.2 high, 25.5 to 78 deep.
- **Options**:
  - `slots`: 1 or 2 stacked SO-DIMMs.
  - `capacity`: no visual change.
- **Parts**:
  - `ddr2-667-sodimm`, `ddr5-5600-sodimm`: sticks in slots.
  - `lpcamm2`: a flat module.
  - `lpddr5x-soldered`: chips on the board.
- **Anchors**: none.
- **Budget**: 1,500 triangles, 4 ms.
- **Done when**: green.
- **Status**: Ready.

### 17. m2: M.2 drive

- **File**: `src/renderer/src/models/roles/m2.ts`.
- **What**: an M.2 stick in its slot.
- **Size**: 22 wide, 2.4 to 3.5 high, 30 to 80 deep (2026 only).
- **Options**: `capacity` (no visual change).
- **Parts**: `m2-2280-g5` has a heat spreader on top.
- **Anchors**: none.
- **Budget**: 1,500 triangles, 4 ms.
- **Done when**: green.
- **Status**: Ready.

### 18. wlan: wireless card

- **File**: `src/renderer/src/models/roles/wlan.ts`.
- **What**: the wireless card with antenna leads.
- **Size**: 2006: 30 wide, 4 high, 51 deep (Mini PCIe). 2026: 22 wide, 3 high, 30 deep (M.2 2230).
- **Options**: `bluetooth` (2006; the Bluetooth module is its own part, `bt`).
- **Anchors**: none.
- **Budget**: 1,000 triangles, 4 ms.
- **Done when**: green.
- **Status**: Ready.

### 19. vrm: power stage

- **File**: `src/renderer/src/models/roles/vrm.ts`.
- **What**: inductors and MOSFETs beside a processor or graphics chip.
- **Size**: 2006: 3.1 to 12 wide, 3 high, 35 to 82 deep. 2026: 4.8 to 24.1 wide, 2 high, 25 to 70 deep.
- **Options**: none.
- **Anchors**: none.
- **Budget**: 1,500 triangles, 4 ms.
- **Done when**: green at the narrowest width.
- **Status**: Ready.

### 20. chipset: chipset

- **File**: `src/renderer/src/models/roles/chipset.ts`.
- **What**: the chipset. 2006 is two packages side by side; 2026 (HM870) is one.
- **Size**: 2006: 55.3 to 70 wide, 2 high, 35 deep. 2026: 21.3 to 25 wide, 2 high, 25 deep.
- **Anchors**: none.
- **Budget**: 600 triangles, 4 ms.
- **Status**: Ready.

### 21. inverter: backlight inverter

- **File**: `src/renderer/src/models/roles/inverter.ts`.
- **What**: the 2006 CCFL inverter board in the lid chin.
- **Size**: 100 wide, 10 high, 5 deep (2006 only).
- **Anchors**: none.
- **Budget**: 800 triangles, 4 ms.
- **Status**: Ready.

### 22. kblight: keyboard light

- **File**: `src/renderer/src/models/roles/kblight.ts`.
- **What**: the 2006 lid-mounted keyboard light in the top bezel. Its lamp faces +z and down (-y); the lamp uses `glow`.
- **Size**: 12 wide, 5 high, 4 deep (2006 only).
- **Anchors**: none.
- **Budget**: 500 triangles, 4 ms.
- **Status**: Ready.

### 23. bt: Bluetooth module

- **File**: `src/renderer/src/models/roles/bt.ts`.
- **What**: the 2006 add-on Bluetooth module.
- **Size**: 15 wide, 3 high, 20 deep (2006 only).
- **Budget**: 500 triangles, 4 ms.
- **Status**: Ready.

### 24. tb: Thunderbolt controller

- **File**: `src/renderer/src/models/roles/tb.ts`.
- **What**: the Thunderbolt 5 controller chip.
- **Size**: 20 wide, 1.5 high, 20 deep (2026 only).
- **Budget**: 500 triangles, 4 ms.
- **Status**: Ready.
