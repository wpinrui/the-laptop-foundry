# The Laptop Foundry: Style Guide

Direction: Foundry. A warm, dark workshop where the laptop is the only thing lit.

This guide covers the start menu, new company, load company, the laptop list and the cafe. The build and review phases come in a later pass.

Reference mockups are in `mockups/`, named `1a-*.png`. They are 1440 by 810.

## 1. Principles

1. **The laptop is the hero.** Every menu screen sits on a live 3D scene with one of the player's laptops turning slowly. The interface gives it room and never covers it.
2. **No needless text.** If the game works without a piece of text, that text does not ship. No headings, hints, tooltips, welcome lines or meta text. The only words on screen are entries, names, values and actions.
3. **Tell items apart by type, not ornament.** Use weight, size, colour and spacing. Never use separator glyphs.
4. **Punctuation.** Never use middots (·) or em dashes (—) anywhere in frontend copy.
5. **Nothing is locked in the cafe.** The player moves freely. The interface appears only when the player aims at something usable.

## 2. Colour

| Token | Value | Use |
|---|---|---|
| `--ground` | `#14100d` | Base background, scene clear colour and fog |
| `--ground-deep` | `#0e0b09` | Rail panel base, used at 80% opacity with a blur |
| `--text` | `#efe6dc` | Primary text and entries |
| `--muted` | `#a8998a` | Secondary entries, dates, counts, Back and Delete |
| `--accent` | `oklch(0.76 0.16 55)` | Focus and selection, the primary button, the caret |
| `--accent-wash` | `rgba(232,137,74,0.12)` | Background of the selected row |
| `--warning` | `oklch(0.82 0.14 85)` | Fit problems, such as "Battery does not fit" |
| `--line` | `rgba(239,230,220,0.14)` | Row dividers |
| `--line-strong` | `rgba(239,230,220,0.30)` | Secondary button outlines |

Rules:
- Only one accent. The focused or selected thing is the only accent-coloured element on screen, apart from the primary button.
- Text on the primary button is `--ground` on `--accent`.
- Don't add new colours. For a tint, mix an existing token with transparency.

## 3. Typography

| Role | Family | Weight | Size | Case and tracking |
|---|---|---|---|---|
| Title (start menu only) | Barlow Condensed | 700 | 116px, line height 0.86 | Upper |
| Hero name (selected laptop) | Barlow Condensed | 700 | 80px, line height 0.95 | Upper |
| Name input | Barlow Condensed | 600 | 72px | As typed |
| Primary entry | Barlow Condensed | 600 | 42px | Upper, +0.02em |
| Company name (rail header) | Barlow Condensed | 700 | 44px | Upper |
| List row (company) | Barlow Condensed | 600 | 40px | Upper |
| List row (laptop) | Barlow Condensed | 600 | 28px | As named |
| Secondary entry | Barlow Condensed | 600 | 24px | Upper, +0.04em |
| Button | Barlow Condensed | 600 to 700 | 18 to 24px | Upper, +0.04em |
| Prompt label | Barlow Condensed | 600 | 22px | Upper, +0.04em |
| Field label | IBM Plex Mono | 400 | 14px | Upper, +0.14em |
| Value, date, count | IBM Plex Mono | 400 to 500 | 13 to 18px | As is |
| Score | IBM Plex Mono | 500 | 28px | Numerals only |
| Body text (if ever needed) | IBM Plex Sans | 400 | 16px | Sentence case |

- Model names keep the case the player typed in the list, and go to upper case only as the hero name.
- Values always use mono, so that years, scores and counts line up.

## 4. Spacing and layout

- The canvas is designed at 1440 by 810 and scales with the window.
- **Left column:** menus start 104px from the left edge and are centred vertically.
- **Stacks:** 64px between the title and the menu. 12px between primary entries. 30px between the primary group and the secondary group. 8px within the secondary group.
- **Rail:** 440px wide, full height, 36px side padding, 44px top padding. Rows have 18px of vertical padding.
- **Action bar:** 12px gap between buttons.
- **Scrim:** a left-to-right gradient from `--ground` at 92% to 50% at 36% of the width, reaching 0% at 60%. On the laptop list, a bottom gradient 300px tall fades from 90% to 0%.
- **Corners:** none. Every button and field is square.

## 5. Components

### Menu entry
Plain text with no box. At rest it is `--text`. When focused or hovered it turns `--accent`. Secondary entries (Settings, Quit) are smaller and `--muted`. An entry can carry one mono sub-line underneath, such as the company name under Continue.

### Primary button
A solid `--accent` block with `--ground` text, 14px by 40px of padding (12px by 30px in action bars). There is one per screen at most.

### Secondary button
A 1px `--line-strong` outline with `--text` text and 11px by 22px of padding. For destructive actions, use `--muted` text.

### Text action
Bare `--muted` Barlow text, used for Back and Delete next to a primary button.

### Name field
A mono field label above. The value is typed in 72px Barlow on a 2px `--accent` underline, with a 4px `--accent` block caret. There is no box.

### List row
The name is in Barlow, with a mono sub-line under it (the year, or count and date). The score, if there is one, is right-aligned in mono. A fit problem is written in `--warning` on the sub-line. The selected row gets `--accent-wash` behind it and an `--accent` name. Company rows are divided by `--line` rules. Laptop rows use spacing only.

### Rail
A `--ground-deep` panel at 80% opacity with an 18px backdrop blur and a 1px right border at 12% opacity. The company name heads the rail, with a New model outline button in `--accent`.

### Prompt
A 30px square keycap with a 1.5px `--text` border, a translucent `--ground` fill and a Barlow letter. The label sits beside it in Barlow capitals with a soft text shadow. Mouse actions use a mouse glyph in place of a letter. Prompts stack 10px apart, 32px down and right of the aim dot.

### Aim dot
A 6px `--text` dot at the exact centre of the screen, with a 1px dark outline. It is always visible when walking and when seated.

## 6. 3D staging

- **Ground:** `--ground`, with fog from 1.3m to 3.4m so the room fades into black.
- **Plinth:** a cylinder of about 0.54m diameter and 0.05m tall, in dark bronze (`#241d17`, roughness 0.55, metalness 0.3). It casts and receives soft shadows.
- **Key light:** warm (`#ffb27a`), from high front left, casting soft shadows. A warm spot adds a pool of light on the plinth.
- **Rim light:** cool (`#86a2ff`), from low behind right, picking out the lid edge.
- **Fill:** a low hemisphere light (`#4a382a` over `#0a0806`).
- **Camera:** 30° field of view. The frame is shifted right so the laptop sits clear of the left menu.
- **Motion:**
  - Start menu: a full orbit at about 0.07 radians a second.
  - Laptop list: a sway of plus or minus 0.55 radians around the front three-quarter view, at about 0.12 radians a second, so the front stays readable.
  - Sub-screens (new and load company) use the same scene at a different starting angle.
- **Which laptop:**
  - Start menu: the latest model from the company Continue will load.
  - Load company: follows the selected save.
  - Laptop list: the selected model. Changing the selection swaps the laptop in the scene.
  - With no models yet, a stock body in graphite.
- **Screen:** when the laptop is on a menu, its screen shows a dark warm lock-screen gradient, never readable content.

## 7. Screens

### Start menu
The title is in the upper left. The entries are Continue (with the company name under it), New company and Load company. Settings and Quit are smaller, below them. Continue is hidden when there are no saves.

### New company
One Company field, then Start (primary) and Back. Start is disabled while the field is empty. This is where the company is named. It is not asked on first launch.

### Load company
Saves are listed with their name, laptop count and last-played date. The actions are Load (primary), Delete and Back. Delete needs a second press to confirm.

### Laptop list (rail)
- The rail on the left lists the models, most recently changed first.
- Menu is in the top right and goes back to the start menu.
- The selected model's name is shown large at the lower right of the scene, with the year under it.
- The actions, in order, are Use (primary), Get reviewed or Read review, Open, Duplicate and Delete.
- A model that does not fit shows the problem in `--warning`. Use and Get reviewed are disabled for it.
- Reviewed models show their score in the rail.
- New model and Duplicate go to the name step (a name field with Random, Create and Cancel) before the builder opens.

### Cafe
- **Walking:** first person with WASD and the mouse, at a 62° field of view with a gentle head sway. Nothing is on screen except the aim dot.
- **Aiming at the laptop:** prompts for E to sit and F for full screen.
- **Seated:** the camera settles over the laptop but the player can still look around freely. Aiming at the charging port shows a mouse prompt to plug in. E stands up again.
- **Full screen:** F switches the laptop screen to full screen and back.
- **Paused:** Esc blurs and darkens the scene. The left-column menu shows Resume, Sound (with On or Off in mono) and Leave. Leave returns to the laptop list.
- **Inside the laptop:** battery, power profile and apps stay in the in-game OS, which keeps its era styling. The game HUD never shows them.

## 8. Motion

- Focus and hover: the colour changes in 120ms, ease out.
- Screen changes: the menu fades and slides 12px in 200ms. The 3D scene never cuts. The camera eases to its new angle over 600ms.
- Laptop swap on the list: the old laptop fades as the new one fades in on the same plinth, over 300ms.
- Prompts fade in over 100ms when the aim lands on something, and out over 150ms.
- Pause: the blur and darken take 200ms.

## 9. Copy

- Entries and buttons are verbs or nouns: Continue, Use, Read review, Plug in, Sit.
- No sentences in the interface. Fit problems are the one exception: a short statement such as "Battery does not fit".
- Dates are written `25 Sep 2026`. Counts are written `5 laptops`.
- Never write about the player, the game or the interface. That means no "Welcome back", no "Your laptops" and no "Press any key".
