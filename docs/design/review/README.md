# Handoff: Notebookcheck review (reveal + article in three eras)

## Overview
This is the payoff of the game loop. When a review is published, the player sees a short reveal in the Foundry workshop, then reads the article on the laptop's own screen. The article's look follows the era of the laptop's model year, using the existing `eraOf()` in `ReviewSite.tsx`: 2006, 2016 or 2026.

## About the design files
The files in this folder are **HTML design references**, not production code. Rebuild them in the existing app:
- `src/renderer/src/review/ReviewSite.tsx`, `review.css` and `ReviewScreen.tsx`;
- the site tokens in `styles/tokens.css` (`--site06-*`, `--site16-*`, `--site26-*`, `--score-*`).

All content comes from `reviewOf()` in `engine/review/index.ts`. Do not hard-code the copy you see here.

## Fidelity
The look and layout are **high fidelity**. The laptops, rivals, scores and text are **placeholders** written to match what the engine produces.

## Files
- `Review.dc.html`: all the mockups. Section `1a` is the reveal (frames R1 to R4); `1b`, `1c` and `1d` are the 2006, 2016 and 2026 articles, drawn at full length.
- `builder-laptop.js`: the stand-in 3D laptop. `screen="review"` draws the article on the laptop's screen, with `review-era`, `review-state` (`load`, `rating` or `page`) and `review-score`.
- `review-shot.js`, `review-scenes.js`, `repo-parts.js`: the review photo sets, already handed off separately. They are used here only to show where each photo goes.
- `screenshots/`: one image of each reveal frame and each era page.

## 1a Reveal (Foundry style; see `docs/design/foundry/style.md`)
It plays once, the first time a review opens. From Open to the score takes about 6 s.
1. **R1 Published.**
   - The laptop sits on the plinth, lid closed, screen off.
   - The left column shows:
     - "Notebookcheck" in Barlow Condensed 600, 20 px, capitals, letter-spacing 0.18em, muted colour;
     - the company and model in Barlow Condensed 700, 96 px, line-height 0.9;
     - the date in Plex Mono 16, muted.
   - Buttons: **Open** (the primary button) and **Later**.
2. **R2 Open.** No interface on screen.
   - The lid opens from 0° to 105° over 900 ms, ease-in-out.
   - The camera eases from the hero view to the front view over 1200 ms.
   - The screen turns on and shows the site loading in the era's style: 2006 a progress bar, 2016 an accent line under the header, 2026 a thin line under the header.
3. **R3 Score lands.** The camera settles on the screen view, shifted right by 0.2.
   - The left column shows:
     - the overall score in Plex Mono 150, counting up over about 900 ms;
     - the band word in Barlow Condensed 700 44: Excellent (90 and up), Good (80 and up), Average (70 and up), Poor below that;
     - the headline in Plex Sans 20;
     - the 13 category bars in two columns, each a 2 px track with the fill and a Plex Mono value.
   - The bars fill in turn, one every 40 ms.
   - Buttons: **Read review** and **Later**.
   - **The score sets the tone:**
     - Great: the number is in the accent colour with a warm glow (`text-shadow: 0 0 40px rgba(240,145,61,.55)`), the keyboard backlight turns on and the warm light from the screen swells.
     - Good or fair: the number is in the accent colour, with no glow.
     - Poor (R3b): the number and bars are muted `#a8998a`, the front fill light dims to 0.2, there is no glow and no backlight.
4. **R4 Read.** The camera pulls back to the full screen.
   - The article is on the laptop's screen, filtered by `lookOf(panel)` exactly as today.
   - Only **Back** and **F** are shown, in the top left.
   - F toggles a clean full-screen page, and Esc leaves it. This is unchanged.

Opening the same review again skips straight to R4. Following a link to a rival's review also opens at R4, with no reveal.

## The article, all eras (same order as `reviewOf()`)
- **Header:** headline, date, hero photo (`studio/hero`), verdict, pros and cons (2026 puts the verdict and score first; 2006 and 2016 put them at the end, as the real site did).
- **Specifications:** `review.specs`.
- **Case and connectivity:** `studio/closed` and `studio/rear`; `size/top`; the size and weight table; the ports text; `ports/left` and `ports/right`, each captioned with its port list; `teardown/top`; the durability table.
- **Input devices:** `studio/top`.
- **Webcam:** the webcam table.
- **Display:** the display table; `viewing/grid` and `outdoor/table`.
- **Performance:**
  - Kilnbench multi-core and single-core bar charts against the peers;
  - processor power as first run against sustained (`cooling.cpuWatts.first` and `.sustained`, shown as two bars because there is no curve over time);
  - graphics sustained;
  - the games table (Low, Medium, High, Ultra, plus Native when the panel is above 1080p);
  - `desk/screen` and `desk/wide`.
- **Emissions:** noise text; the idle and load noise scale (2016); the noise-under-load chart; surface temperature as two 3×3 grids for top and bottom (`surface.readings.load`), with the hottest cell in bold; `thermal/deck` and `thermal/bottom`.
- **Speakers:** the speakers table.
- **Energy management:** idle and load draw and capacity; battery life charts for Wi-Fi browsing and video.
  - I assumed `battery.runtime[balanced].web` and `.video`, plus a draw figure; check these against the engine.
- **Rating:** the 13 categories and the overall score (`rollScores`), then the peers as cards (2016 and 2026).

**Comparison deltas, one convention on every page:**
- The number is the rival's value against the subject, `(rival − mine) / mine`, rounded, shown with its true sign.
- Green when the rival does worse than the subject, red when it does better, grey at 0.
- For lower-is-better metrics (noise, temperature) only the colour flips, never the sign.
- The subject's own row is bold and has no delta.

## 1b 2006: portal (`rs-2006`)
- Viewport 1280, page background `--site06-bg #e9edf2`, a fixed 980 px column.
- Masthead: a gradient from `#6f9fd8` to `#1d4f91`; logo in Georgia bold italic 26 with ".net" at 13; a search box and a Go button.
  - Tabs: News, Reviews (active: white background, blue text), Forum, Top 10, Benchmarks.
- A 700 px text column and a 230 px sidebar with a 16 px gap.
  - Sidebar boxes, each with a blue header strip: the rating (Georgia 44 in the band colour, the word, the model, processor and graphics); Top 10 of the class; Contents.
- Type: Verdana 12 / 1.45.
  - H1: 18 px, blue.
  - H2: 14 px on the row colour, with a 4 px blue left border.
- Hero photo floated right, 300 wide, in a 1 px frame.
- Photos are 216 px thumbnails in a row, each with a 10 px caption.
- Tables have blue headers with white 11 px text; the subject's row is bold on `#f2f5f9`; rival names are links in `#0645ad`.
- Bar charts: 12 px bars with a bevelled gradient; the subject is amber (`#f3c26b` to `#d98b1c`), rivals are blue.
- Temperature grids: 62×30 cells in five fixed colour steps.
- The verdict is at the end: the verdict text beside a 150 px rating box, then a Pro/Contra table, then the rating table with category bars and a Total row.

## 1c 2016: flat magazine (`rs-2016`)
- Viewport 1366.
- Header bar 60 px high in `#2b2f36`: the logo in Source Sans 800 22 with a 3 px `#e5532d` underline; navigation in capitals 13 with letter-spacing 0.08em.
- The hero is a full-width studio shot 540 px high with a dark gradient.
  - Over it: an orange "Review" tag, the headline in Source Sans 300 42, and the dek (the subheading, `dek` in the mockup data) at 18.
- Page grid 1100 wide: a 760 px article on white with 36 × 44 px padding, and a 300 px rail.
  - The rail holds the rating ring, the word, the model and the contents; it should stay in place as the page scrolls.
- Type: Source Sans 3, 16 / 1.6.
  - H2: 19 px, capitals, letter-spacing 0.05em, in `#e5532d`.
- Photos are a two-column grid with 13 px italic captions.
- Bar charts: 26 px bars in pastel colours (the subject is `#8fb1d6`), the value inside the bar, the delta on the right.
- Tables: a 2 px top rule under the headers; the subject's row on `#fdf3ef`.
- Games: fps coloured green at 60 and above, and red and bold below 30.
- Temperature grids: 72×48 cells with 3 px corners.
- The verdict is at the end: a 160 px conic ring, round + and − pro and con markers, then the category bars in two columns.

## 1d 2026: editorial (`rs-2026`)
- Viewport 1440, background `#fbfaf7`.
- Header 68 px high with a bottom rule: the logo in Hanken Grotesk 800 24 with letter-spacing −0.04em, a pill-shaped search field.
- Top of the page, 1200 wide:
  - "Review" and the date in the accent colour `#3b5bdb`;
  - the H1 in Hanken 800 60 / 1.02 with letter-spacing −0.035em;
  - the dek in Newsreader italic 24;
  - the hero photo with an 8 px radius.
- Verdict block: a grid of the text and a 380 px column.
  - The text column: the verdict in Newsreader 20 / 1.6, then pros and cons in two columns with coloured capital labels.
  - The 380 px column holds the score card: white, 14 px radius, a 128 px ring, the word, the category bars and the price.
  - For a great score, the card gets a glow: `box-shadow 0 0 0 6px rgba(255,215,102,.35), 0 0 60px rgba(255,215,102,.45)`.
- Body: a 210 px contents rail (it follows the scroll and marks the current section with a 2 px accent rule), a 720 px article, and figures that run 120 px wider into the right margin.
- H2: Hanken 700 28.
- Charts: Hanken; the title has a 1 px ink rule and a "Higher/Lower is better" note; 10 px rounded bars, the subject in the accent colour and rivals `#b9b3a6`; values in tabular figures; the delta column in colour.
- Games: a heat-tinted grid (`oklch` from pale to green by fps, reddish below 30).
- Temperature grids: 64 px rows, colour mapped continuously from 25 to 49 °C with `oklch`, 10 px radius.
- Energy: three stat cards. Competitors: cards with a 12 px radius.

## Tokens
- Existing: `--site06-*`, `--site16-*`, `--site26-*`, `--score-poor #c9463d`, `--score-fair #d99a2b`, `--score-good #3f9d5a`, `--score-great #1f8f7a`, `--score-glow #ffd766`.
- New for 2016: an accent wash `#fdf3ef`, and the pastel series `#c9d6e3 #e6d3c4 #d4e4d1 #e2d6ea #f0e2b6`.
- New fonts: Source Sans 3 (2016); Hanken Grotesk and Newsreader (2026).

## Implementation notes
- The site look is original. Only the name `PUBLICATION` ("Notebookcheck") is used; it is a single constant.
- Every number shown already exists in `Facts`, `Results` and `Review`, except the energy fields flagged above.
- Photos come from `usePhotos`. Re-enable `<Photos>`: `ReviewSite.tsx` currently switches it off with `0 &&`.
- The reveal is a new state in `ReviewScreen.tsx`, going `published`, then `open`, then `score`, then `read`, and saved per review id so it plays once.
