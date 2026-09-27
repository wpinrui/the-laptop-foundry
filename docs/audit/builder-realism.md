# Builder realism audit

Audit of every builder stage and part for realism, as of commit `ac7c246`. Each finding says what is wrong, where, what the real world did, and the fix. Problem types:

- **Unrealistic**: the game allows or shows something that did not exist, or gets a value wrong.
- **Over-constraining**: the game blocks something makers did build.
- **Under-constraining**: the game allows something no maker could build.
- **Dead slider**: a control that changes nothing but the cost.
- **Missing quality**: an area where real makers spent more for diminishing returns, with no way to do so in the game.

Size: S under 50 lines, M under 250, L 250 or more. The last column names the fix slice (PR branch) or says why it is left for later.

## How the display gate works today

`maxPpi(year)` in `src/renderer/src/engine/screen.ts:88` takes the densest panel any row sold that year and allows **half again** that, whatever the panel type. The 2006 to 2010 rows top out at 1400 by 1050 on 12.1 inch (145 ppi), floored to 150, so every type may go to 225 ppi from 2006. That is why a 15.4 inch 2880 by 1800 IPS panel (220 ppi) is legal in 2007, five years before the Retina MacBook Pro. `maxHz(year)` (`screen.ts:74`) is likewise one ceiling for every type, and there is no joint limit on resolution times refresh, so 4K at 240 Hz is legal from 2019. Brightness and gamut are not player choices at all: a custom panel copies them from the nearest sold row (`screen.ts:221`), so the brightest screen in 2026 is the 600 nit Mini-LED row.

## Findings

### Display

| # | Area | Problem | Evidence | Real world | Fix | Size | Slice |
|---|---|---|---|---|---|---|---|
| D1 | Density cap | Under-constraining | `screen.ts:88` 1.5 times the densest row, all types | IPS laptop panels: about 135 ppi to 2009 (ThinkPad FlexView 15 inch UXGA 133 ppi), 227 ppi in 2012 (Retina MacBook Pro), 276 in 2013 (13.3 inch 3200 by 1800), 282 in 2014 (15.6 inch 4K), 331 in 2018 (13.3 inch 4K), 338 in 2020 (13.4 inch 3840 by 2400). TN about 150 to 2009, 168 in 2010 (VAIO Z 13.1 inch 1080p) | Per type, per year density table | M | `fix/display-year-gating` |
| D2 | Refresh cap | Under-constraining | `screen.ts:74` one cap for every type: 120 Hz from 2010, 240 Hz from 2019 | 120 Hz TN from 2010 (3D gaming), IPS 120 Hz 2017, 144 Hz 2018, 240 Hz 2019, 300 Hz 2020, 360 Hz 2021, 480 Hz 2024. OLED 60 Hz to 2020, 90 Hz 2021, 120 Hz 2022, 240 Hz 2024. Mini-LED 60 Hz 2020, 120 Hz 2021, 165 Hz 2022, 240 Hz 2023 | Per type refresh table | S | `fix/display-year-gating` |
| D3 | Resolution times refresh | Under-constraining | No check anywhere | Panel link bandwidth grew slowly: 1920 by 1200 at 60 Hz in 2006, 1080p at 120 Hz in 2010, 4K at 60 Hz in 2014, 4K at 120 Hz in 2020, 2560 by 1600 at 240 Hz in 2023 | Pixel rate cap per year | S | `fix/display-year-gating` |
| D4 | OLED start year | Over-constraining | `screen.ts:19` OLED from 2019 | ThinkPad X1 Yoga OLED and Alienware 13 OLED shipped in 2016 | OLED from 2016 at 2016 limits (about 225 ppi, 60 Hz) | S | `fix/display-year-gating` |
| D5 | Mini-LED start year | Over-constraining | `screen.ts:20` Mini-LED from 2021 | MSI Creator 17 (2020): 17.3 inch 4K Mini-LED, 240 zones, 1000 nit HDR | Mini-LED from 2020 | S | `fix/display-year-gating` |
| D6 | Brightness | Missing quality, over-constraining | `screen.ts:221` brightness copied from the nearest row; top in 2026 is 600 nits (`display.ts:197`) | Sunlight-readable LCDs: Toughbook CF-30 1000 nits (2007), CF-31 1200 nits (2010), Latitude 7330 Rugged 1400 nits (2022). Mini-LED MacBook Pro: 1000 nits SDR, 1600 nits HDR peak (2021 to 2024). Tandem OLED: 500 nits SDR, 1000 nits HDR peak (2024) | Brightness is a spec: a slider up to the type's ceiling for the year, cost rising faster than the nits. HDR peak on OLED and Mini-LED becomes a lab figure | M | `fix/display-year-gating` |
| D7 | Gamut | Missing quality | Gamut copied from the nearest row, never chosen | Wide gamut LCDs from 2008 (HP DreamColor, RGB LED backlights). OLED and Mini-LED are wide by nature. TN never passed about 100% sRGB | Gamut is a spec, capped by type and year, priced by tier | S | `fix/display-year-gating` |
| D8 | OLED and Mini-LED lab in the 2016 era | Unrealistic | `display.ts:317` looks up `2016:oled`, which does not exist, and falls back to the 2026 IPS profile: a 2019 OLED measures a finite contrast and IPS response times | OLED is self-emissive in every year | Fall back to the type's own profile before IPS | S | `fix/display-year-gating` |
| D9 | 2010 panels | Unrealistic | `screen.ts:49` switches TN and IPS to LED types in 2010, but the 2010 rows are CCFL (`display.ts:104`), so no 2010 spec matches a sold row and every 2010 screen is a custom panel at a premium | The rows say 2006 to 2010 is CCFL | Switch at 2011, matching the rows | S | `fix/display-year-gating` |
| D10 | Display calibration and uniformity | Missing quality | Delta E and uniformity are rolled per panel id (`display.ts:342`), nothing the player can buy | Factory calibration (HP DreamColor 2008, Dell XPS and Surface from about 2015) and uniformity binning cost more and give diminishing returns | Display quality slider: better Delta E and uniformity toward a per era floor, convex cost | M | `feat/quality-sliders` |
| D11 | Display Compact | Dead slider (no control) | `units.ts:289` and `price/index.ts:479` read `spend.display`, but no stage shows it | Thinner glass and backlight stacks are real engineering spend | Show Compact on the Screen stage | S | `fix/compact-sliders` |
| D12 | Diagonal range | Over-constraining | `screen.ts:30` 10 to 18.4 inch | 7 and 8.9 inch netbooks (Eee PC 2007 and 2008), 20.1 inch Dell XPS M2010 (2006), 21 inch Acer Predator 21 X (2016) | Widen to 7 to 21 inch; bodies still decide what fits | S | `fix/display-year-gating` |
| D13 | LED backlight in 2008 and 2009 | Over-constraining | CCFL to 2010 for every panel | LED backlights shipped from 2007 (MacBook Pro 15) and were common by 2009 | Not changed: needs LED rows for 2008 to 2010 and a backlight choice; low impact | M | Later |

### Keyboard

| # | Area | Problem | Evidence | Real world | Fix | Size | Slice |
|---|---|---|---|---|---|---|---|
| K1 | Quality beyond travel | Missing quality | `peripherals.ts:192` keyboards differ only by travel, pitch, numpad and light; `sim/specs.ts:86` reads travel from the name | Reviews judge stability (key wobble), tactile snap, actuation force and deck flex. A ThinkPad and a budget board with the same travel feel nothing alike | Keyboard quality slider giving key wobble (mm), snap ratio (%), actuation force (g) and deck flex (mm) as specs | M | `feat/keyboard-trackpad-quality` |
| K2 | Compact on keyboards | Unrealistic | `peripherals.ts:191` full Compact halves the stack: a 2.5 mm travel board at 3.0 mm, a 1.5 mm board at 1.8 mm | The stack is at least travel plus cap and plate, about 1.4 mm more | Stack floor of travel plus 1.4 mm | S | `fix/compact-sliders` |
| K3 | 2.0 mm travel start | Over-constraining | `peripherals.ts:225` 2.0 mm from 2011 | Island keyboards with about 2 mm travel shipped from 2006 (VAIO, MacBook) | From 2006 | S | `feat/keyboard-trackpad-quality` |
| K4 | Per-key RGB and RGB zones | Under-constraining | `peripherals.ts:245` per-key RGB on 1.0 mm boards from 2015 and 1.5 mm from 2012; RGB zones from 2011 | Zoned RGB from 2009 (Alienware M17x), per-key RGB from 2016 (Razer Blade Chroma) | Option values get their own years | S | `feat/keyboard-trackpad-quality` |
| K5 | Full-height mechanical | Over-constraining | Only a 1.8 mm low-profile mechanical from 2019 | MSI GT80 and GT83 Titan (2015 to 2017) had Cherry MX Brown at about 3.5 mm travel | Add it for 2015 to 2019 | S | `feat/keyboard-trackpad-quality` |

### Trackpad

| # | Area | Problem | Evidence | Real world | Fix | Size | Slice |
|---|---|---|---|---|---|---|---|
| T1 | Size presets and the free slider | Two mechanisms for one thing | `peripherals.ts:325` ten size parts; `solve.ts:315` lets the player stretch any of them 40% either way | Size is a design choice limited by the palm rest and the era | Keep the free size, bounded per year; the parts become the technology (buttons, clickpad, haptic). The size sliders are the finer control and already exist on the laptop; presets only repeated them | M | `feat/keyboard-trackpad-quality` |
| T2 | Surface | Unrealistic | `FinishStage.tsx:24` glass or matte is a free cosmetic choice in any year, at no cost | Glass pads from 2008 (unibody MacBook), on Windows from about 2012; Mylar before | Surface is a trackpad spec, dated and priced; Finish keeps the colour | S | `feat/keyboard-trackpad-quality` |
| T3 | Haptic start | Unrealistic | `peripherals.ts:332` haptic from 2018 | Force Touch from 2015 (MacBook), haptic Windows pads from 2022 (XPS 13 Plus, ThinkPad Z13) | Haptic from 2015 | S | `feat/keyboard-trackpad-quality` |
| T4 | Clickpad start | Over-constraining | Clickpads from 2011 (`peripherals.ts:329`) | Clickpads from 2008 (MacBook), 2009 on Windows (Synaptics ClickPad) | From 2008 | S | `feat/keyboard-trackpad-quality` |
| T5 | Quality | Missing quality | Pads differ by size and mechanism only | Click area of a hinged pad, surface friction, rattle and drivers (Windows Precision Touchpad from 2013) are what reviews judge | Trackpad quality slider giving clickable share (%), friction, rattle (mm) and driver as specs | M | `feat/keyboard-trackpad-quality` |

### Speakers and webcam

| # | Area | Problem | Evidence | Real world | Fix | Size | Slice |
|---|---|---|---|---|---|---|---|
| S1 | Speaker quality | Missing quality | `panel/speaker.ts:73` the sound follows driver area and a per part wattage only | Better drivers, enclosures and amplifiers extend bass and loudness with diminishing returns | Speaker quality slider: lower bass cutoff (Hz) and higher level (dB), fed into the in-game sound | S | `feat/quality-sliders` |
| W1 | Webcam quality | Missing quality | `peripherals.ts:338` webcams differ by resolution and IR only | Sensor size and lens aperture set low light quality; premium laptops spend on them | Webcam quality slider: aperture (f-number) and sensor size (inch type) as specs | S | `feat/quality-sliders` |
| W2 | 720p start | Over-constraining | `peripherals.ts:362` 720p from 2011 | HD webcams from 2009 and 2010 | From 2009 | S | `feat/keyboard-trackpad-quality` |
| W3 | IR camera start | Over-constraining | `peripherals.ts:367` 1080p with IR from 2020 and no IR at 720p | Windows Hello IR cameras from 2015 (Surface Pro 4, 720p) | Add 720p with IR from 2015 | S | `feat/keyboard-trackpad-quality` |

### Compact sliders

The Inside stage shows a Compact slider on every slot (`Stages.tsx:645`), and every one adds cost (`price/index.ts:490`). On many parts it changes nothing else.

| # | Part | Effect today | Evidence | Fix | Slice |
|---|---|---|---|---|---|
| C1 | Storage (every drive) | None | `storage.ts:26`, `storage.ts:46` `compact: []` | Hide; standard form factors | `fix/compact-sliders` |
| C2 | Optical drives | None | `peripherals.ts:23` | Hide; slim drives are their own parts | `fix/compact-sliders` |
| C3 | Wireless | None | `peripherals.ts:54` and on | Hide; M.2 cards are standard | `fix/compact-sliders` |
| C4 | SO-DIMM memory | None | `memory.ts:22` and on | Hide; soldered memory keeps it | `fix/compact-sliders` |
| C5 | 18650 battery | None | `power.ts:23` | Hide; cells are a standard size. Pouches keep it (denser cells) | `fix/compact-sliders` |
| C6 | Bay battery, fanless cooling | None | `power.ts:93`, `power.ts:120` | Hide | `fix/compact-sliders` |
| C7 | Keyboard | Too strong | See K2 | Floor the stack | `fix/compact-sliders` |
| C8 | Processor | Shrinks the package block 15% in x | `processors.ts:199` | Kept: read as tighter HDI routing round the package; the block is the package plus its keep-out | Kept |

A hidden slider no longer costs: spend on a part with nothing to compact is ignored by the price.

### Engineering and quality spend

| # | Area | Problem | Evidence | Fix | Slice |
|---|---|---|---|---|---|
| Q1 | No quality spend | Missing quality | `types.ts:643` spend is only Compact per category, packing and material | A separate quality level per area (display, keyboard, trackpad, speakers, webcam), 0 to 100%, whose specs improve with diminishing returns toward a per era ceiling while the cost rises steeply. Every level resolves to measured specs, not points | `feat/quality-sliders` and `feat/keyboard-trackpad-quality` |
| Q2 | Material spend | Fine | `sim/index.ts:113` thinner walls, higher durability | Kept | Kept |

### Other parts (storage, memory, ports, wireless, optical, battery, materials, bodies)

| # | Area | Problem | Evidence | Real world | Fix | Size | Slice |
|---|---|---|---|---|---|---|---|
| P1 | 2.5 inch SATA SSD start | Over-constraining | `storage.ts:94` from 2010; only a 32 GB 1.8 inch SSD before | Intel X25-M and build-to-order 64 to 128 GB SSDs in 2008 | From 2008 | S | `fix/parts-year-gating` |
| P2 | SSD capacities | Unrealistic | `storage.ts:98` 256 GB to 1 TB from 2010 to 2030 | 2010 SSDs 64 to 256 GB; 1 TB SATA about 2013 | Dated capacity values | S | `fix/parts-year-gating` |
| P3 | NVMe PCIe 3.0 end | Over-constraining | `storage.ts:119` ends 2021 | Budget laptops used PCIe 3.0 NVMe to about 2024 | To 2024, add 2 TB | S | `fix/parts-year-gating` |
| P4 | Memory speed against the processor | Under-constraining | `memSpeed` on processor rows is read by nothing | DDR5-6400 on a 5200-rated processor runs at 5200 | Clamp the memory lab to the processor's rating | M | Later |
| P5 | Memory capacities by year | Unrealistic | `memory.ts:21` 4 GB DDR2 in 2006, `memory.ts:56` 8 GB DDR3-1066 in 2008 | 2 GB DDR2 sticks in 2007, 4 GB DDR3 in 2009, 8 GB in 2011 | Dated capacity values | S | `fix/parts-year-gating` |
| P6 | Four memory slots | Over-constraining | `slots: [2, 1]` everywhere | Workstations and big gaming laptops had 4 slots from 2011 | Later; needs board space rules | M | Later |
| P7 | DDR4-3200 end | Over-constraining | `memory.ts:179` ends 2024 | Budget DDR4 laptops shipped into 2026 | To 2026 | S | `fix/parts-year-gating` |
| P8 | Carbon fibre pieces | Over-constraining | `eras.ts:220` CF deck only from 2016, `eras.ts:247` CF floor only in 2026 | VAIO Z (2011) and VAIO Pro (2013) CF top and bottom; X1 Carbon 2012 | CF deck and floor from 2016 in the 2016 row | S | `fix/parts-year-gating` |
| P9 | SD UHS-I reader end | Over-constraining | `ports.ts:114` `sd-reader` ends 2020 | UHS-I readers are still the norm in 2026 | To 2099 | S | `fix/parts-year-gating` |
| P10 | HDMI 1.4 and 2.0 end, HDMI 2.1 start | Over and under | `ports.ts:54` HDMI 1.4 ends 2019, `ports.ts:57` 2.0 ends 2022, `ports.ts:58` 2.1 from 2020 | HDMI 1.4 to 2022, 2.0 still common in 2026, 2.1 from 2021 | Fix years | S | `fix/parts-year-gating` |
| P11 | USB4 and Thunderbolt 4 platforms | Under-constraining | USB4 has no need; TB4 needs only an Intel platform | USB4 needs Tiger Lake, Ryzen 6000 or later; TB4 integrated only from Tiger Lake | Later; needs platform generation tags | S | Later |
| P12 | USB-A 2.0 end, USB-A 10 Gbps start | Over and under | `ports.ts:73` USB 2.0 ends 2014; `ports.ts:75` 10 Gbps from 2014 | USB 2.0 on budget laptops to about 2022; 10 Gbps from late 2015 | Fix years | S | `fix/parts-year-gating` |
| P13 | Bridge battery start | Unrealistic | `power.ts:101` from 2015 | ThinkPad Power Bridge from 2013 (X240, T440s) | From 2013 | S | `fix/parts-year-gating` |
| P14 | 18650 energy by year | Over-constraining | `power.ts:24` 8 Wh per cell for 1998 to 2015 | About 2.2 Ah cells in 2006, 2.9 to 3.1 Ah by 2012 | Later; the cells part ends 2015 and packs are fixed per save | S | Later |
| P15 | Pouch density | Unrealistic | `power.ts:69` 600 Wh/L from 2015 plus 2% a year plus Compact, near 880 Wh/L in 2026 | About 550 Wh/L in 2015, 720 to 760 in 2026 | Later; moves every 2016 to 2026 battery and all rivals | S | Later |
| P16 | Optical drive gaps | Over-constraining | `peripherals.ts:27` no 12.7 mm DVD writer after 2010; no slim Blu-ray writer 2011 to 2019 | 12.7 mm DVD writers to about 2015; slim BD writers 2010 to 2019 | Add both | S | `fix/parts-year-gating` |
| P17 | Wi-Fi 6 and 802.11ac end | Over-constraining | `peripherals.ts:133` Wi-Fi 6 ends 2023, `peripherals.ts:119` ac ends 2020 | Wi-Fi 6 still in budget 2026 machines, ac to about 2022 | Extend | S | `fix/parts-year-gating` |
| P18 | WWAN, eMMC, SSHD | Over-constraining | No such parts | 3G from 2006, LTE 2012, 5G 2020; eMMC 2014 to 2020; SSHD 2012 to 2016 | Later; new parts need models and review text | M | Later |
| P19 | Body thickness limits | Under-constraining | `bodies.ts:9` z 8 to 55 mm in every year | Thinnest 2006 laptops about 18 mm; 9 mm only from 2017 | Not changed: the solver already forces z up from real part stacks, so a thin 2006 body fails to fit on its own. An era floor would double that rule | M | Later |
| P20 | Facet and lift bodies | Unrealistic | `bodies.ts:354`, `bodies.ts:159` from 2019 | Spectre x360 gem cut and ASUS ErgoLift both 2018 | From 2018 | S | `fix/parts-year-gating` |

## Plan

Highest impact first, one PR each:

- `fix/display-year-gating`: D1 to D9, D12. Landed in #254.
- `feat/keyboard-trackpad-quality`: K1, K3 to K5, T1 to T5, W2, W3, and the dated option values they need. Landed in #257.
- `fix/compact-sliders`: C1 to C7, D11, K2. Landed in #258.
- `feat/quality-sliders`: D10, S1, W1, and the shared quality field. Landed in #260.
- `fix/parts-year-gating`: the `fix/parts-year-gating` rows above. Landed in #261.

Rows marked Later are open: D13, P4, P6, P11, P14, P15, P18, P19.

Every new figure is a concrete spec a review can score from: nits, ppi, Delta E, uniformity %, key wobble mm, snap ratio %, clickable share %, friction coefficient, bass cutoff Hz, aperture f-number. Saves from before these slices load with the old behaviour where a field is missing: no brightness means the nearest sold panel's, no quality means 0, and old trackpad parts migrate to the new ones with their sizes kept.
