# The Laptop Foundry

Design document for versions 0.1 and 0.2. Version 0.1 is described as it exists. Version 0.2 is built, described under Version 0.2; anything left as a plan there says so.

## Frontend text rule

**NEVER add needless text to the frontend. EVER.** If the game is usable without a piece of text, that text does not ship. This applies to every screen, label, tooltip, heading, hint and message. Distinguish items by weight, size, colour or spacing, never by separator glyphs. If two items would get identical treatment, they are one item: merge them or cut one.

## Concept

The player picks a year, builds a laptop from components, and receives a professional review of it with a score.

Version 0.1 has no tycoon features. There is no sales simulation, no capital and no balance. The loop is build, get reviewed, duplicate to try again, and use the laptop.

Version 0.2 keeps that loop as sandbox mode and adds a campaign mode with a market, finances and sales.

Each place has a feel:

- Building feels like being in a workshop.
- Using the laptop feels like being in a cafe.
- Reading the review feels like being on the internet of that era.

## Company and models

- The player can run several companies, each a separate save. New company names one; Load company switches between them.
- A company is named when it is created.
- The player names each laptop model. A name randomiser helps when they have writer's block.
- A model can be edited until it is reviewed. A reviewed model is locked and cannot be edited.
- Duplicating any model creates a new, independent, unreviewed model with a copy of its build.
- The player names every model, typing a name or rolling one from the randomiser. There are no placeholder names.
- The player can delete models to prevent clutter.

## Years

- The player picks any year from 2006 to 2026. Every year is open, each with its own parts, options and rivals.
- From 0.2 this free pick is sandbox mode. Campaign mode starts at a chosen year and moves forward a quarter at a time.
- Each year offers two generations of processors and graphics: that year's and the one before.
- The year gates everything available: parts, bodies, materials and specification options. Colours, keycap styling and decals are open in every year.
- Moving a model to a year where a part does not exist makes that part unavailable.

## Building

### Flow

- The laptop is visible in three dimensions throughout, including its internal layout as it changes. The reference is the engine and car builder in Automation.
- Building is a fixed line of stages: year, chassis, screen, internals, keyboard, trackpad, webcam, ports, colour, decals and done.
- The player can jump between stages freely.
- Fit problems show live on every stage.
- The builder is a mode over the workshop's free view, on the same turntable in the same room. Back, Done and Esc return to free view in place, the laptop still on the turntable.
- Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes, for the whole visit to the builder. Edits less than half a second apart are one step.
- Ports, colour and decals can be loaded from any saved model, newest first. Ports also load the era's default set, with Thunderbolt on an Intel build.
- A selected port can be replaced by another port in place. The ports view only turns to another wall when the player picks one.
- Colour sets the laptop's wallpaper from an image file. With none set it is the company's.
- Done ranks the build by market score against every laptop that year within a quarter of its price, with the two above and the two below.
- A lid slider opens and shuts the lid. It is a view setting, not part of the design.

### Free view

- Free view is the workshop itself: the player walks it in first person, starting in front of the turntable.
- On the empty turntable: E New laptop, which names it and opens the builder, and Q Put laptop, which picks any laptop from a list.
- On a shelved laptop: E Work on laptop build, which puts it on the turntable and opens the builder, N Next shelf, and X Discard.
- On the turntable's laptop: B Build, C Duplicate, P Put away, X Discard, L lid, R turn over, O cover, E use and F full screen.
- The prompts name the laptop they act on, with its year.
- Discard asks first, in the same dialog as every delete.

### Bodies

- The player chooses from 16 shaped body types. Each has its own years, from the square Workhorse slab to wedges, capsules, knife edges and teardrops.
- A body's shape changes the room inside, so it counts in the minimum body dimensions.
- Each body has a signature slider for its shape. Some let the player set the inset of each side, or curve a tapered underside.
- All bodies are standard clamshells. There are no convertibles.
- The player can scale a body along x, y and z, alone or in combination, in the spirit of SketchUp. Thickness steps in 0.1 mm.
- Each chassis dimension has a button that fits it to the minimum the build needs.
- Scaling lets a body hold a larger battery, a larger screen, better speakers and similar.
- The Chassis stage shows shortfalls and a section view.
- The player picks materials, by year, and any colour for the lid, deck, bottom, bezel, key plate and trackpad.

### Components

Processors and graphics are real named parts. Everything else is chosen by specification or standard, for example Universal Serial Bus 3.2, Wi-Fi 7, or a 2560 by 1440 in-plane switching panel at 60 hertz. More specification options unlock as the years advance.

| Category | How it is chosen |
|---|---|
| Processor | Real named part |
| Graphics | Real named part, or the processor's integrated graphics |
| Mainboard | Part of the internals |
| Memory | Specification |
| Storage | Hard disk or solid-state drive, at most two in total, limited by the body |
| Display | Free specification: size, ratio, resolution, panel type, refresh rate, bezel, brightness and gamut. Panel type, density and refresh rate are gated per type and per year. Brightness is a slider up to the panel type's ceiling for the year, with an HDR peak on OLED and Mini-LED. Gamut is a chosen tier. A combination nobody sold that year is a custom panel at a premium; only what no maker could build that year is blocked |
| Battery | Specification. A pouch is sized by length, depth and thickness, and its capacity follows |
| Hot-swappable battery | Optional |
| Cooling | No fan, one fan, two fans, or two fans on a vapour chamber. Fan size and the fan grill are the player's |
| Optical drive | Specification |
| Ports | Standards, laid out along a side wall in the player's list order |
| Wireless | Standard |
| Keyboard | Specification, plus keycap shape, colours and legends |
| Trackpad | Chosen by technology: buttons, clickpad from 2008, or haptic from 2015. Size is a free slider bounded by the palm rest. Surface, glass or Mylar, is a priced spec |
| Webcam | Specification |
| Speakers | Specification, plus grill and arrangement |

Cooling:

- Every fan has a diameter slider, with Auto handing it back to the fit. A bigger fan cools better and runs quieter but costs room.
- Fans always cool better than no fan at the same power, and two fans beat one.
- The fan grill is stock, none, uniform, or bottom, and may wrap under onto a rear bevel. A more open grill moves more air.

Speakers:

- The speaker grill sits on the deck or the front wall, as dots, slots, bars or hexes, with a hole size.
- Speakers may stand upright on their long edge, and bunch or line up across or along.

Processor rules:

- Apple Silicon is excluded from the player's parts. Apple M1 to M5 exist for Apple rivals only.
- Qualcomm Snapdragon processors are probably included.
- Part data is hand-curated and not exhaustive. It covers the main players per part per year.

The operating system is always Windows. The player does not choose it and it affects nothing.

### Layout and fit

- Every component physically occupies space and is modelled in three dimensions.
- The fit arranges the internals. Drives, batteries and speakers turn and move to shrink the chassis.
- The player may pin a drive, battery or speaker set to a zone, a turn or an arrangement. Auto hands it back to the fit.
- A drive or optical drive stacks over the board or battery when the chassis is thick enough.
- Fans and fin stacks take floor space.
- The player places the keyboard, trackpad, webcam and ports on the laptop, within allowed ranges. Keyboard and trackpad stay centred. The keyboard may move back over the hinge strip. A placed part that runs into another is a fit problem.
- The player chooses a layout, much as an Automation player changes engine layout to fit a car.
- Layouts are mostly cosmetic, but each sets the minimum x, y and z of the internals. So layout decides what fits.
- Port placement is the player's. Reviewers can praise things like charging from both sides.
- A build may not fit. The player then rescales the body or changes parts.

### Keycaps and decals

- The player styles the keycaps: shape, the colours of letters, modifiers and accent keys, and the legends' font, colour, alignment, case, size and weight.
- The shapes are square, rounded, round and smile. New builds have black keys with white legends.
- The player adds text, preset, emoji and imported image decals (SVG, PNG, JPEG or WebP) to the lid, palm rest, bottom and bezel, each etched, printed or embossed.
- A decal is filled or outlined, and turns about its centre. An SVG may keep its own colours.
- Emoji come from the full Twemoji set, with skin tones.
- Text decals and key legends choose from 18 open fonts in sans, condensed, serif and mono groups.
- Decals stay on the flat part of shaped faces.

### Engineering spend

- The player can spend more to make parts smaller or pack them tighter.
- Each part has a Compact slider, shown only where it changes anything. Compact spend takes height and room off parts such as the keyboard, trackpad, display and speakers. The chassis has Packing and Material spend.
- The player can spend more on better materials: lighter, better at heat transfer, or more durable.
- Quality spend gives diminishing returns on the display (colour accuracy and uniformity), keyboard (key wobble, snap, actuation force and deck flex), trackpad (clickable share, friction, rattle and drivers), speakers (bass cutoff and level) and webcam (lens and sensor).
- Spending is free in version 0.1 and in sandbox mode, and maxing every slider is allowed. Webcam quality is the one exception with a trade-off: it grows the webcam module. Every other spend has none.
- All spending adds to the displayed cost price.

### Power

- Processor and graphics power limits start at reasonable defaults. The player can tweak them.
- Every build gets High, Medium and Low profile presets. The player can tweak or disable any profile.

### Price

- The player sets a retail price in United States dollars at that year's nominal value.
- The price decides the budget tier of the device class.
- The build's cost price is displayed.
- In 0.1 and sandbox mode, price has no other mechanical effect. From 0.2 in campaign mode, price counts in the market score and in sales.

### Live measurements

- The builder shows raw measurements once the laptop is complete and has powered on, and keeps them live from then on.
- Live measurements are exact. They come from the same simulation the reviewer uses.
- The builder never shows ratings or the overall score. Those are revealed in the review.

## Simulation

- Performance depends on power limits.
- Thermals are simulated over time. A poorly cooled build scores well in short tests and drops in sustained ones.
- A poorly cooled build never fails outright. It always throttles, runs hot to the touch, and the reviewer punishes it.
- Material durability feeds the review.
- Battery drain depends on the activity and the power profile.
- Fan noise depends on the cooling solution and the load.

## Device classes

The game works out the class. The player never picks it. A class is one cell of a three-axis matrix:

| Axis | Values | Decided by |
|---|---|---|
| Budget | Low, midrange, premium | Player-set price |
| Body | Thin and light, medium, large | The build |
| Performance | Office, mixed-use, gaming | The build |

An example class is a premium thin and light mixed-use laptop.

## Rating

The review score is the critics' score. It is separate from the market score and never compares the build to other laptops.

- Each category is scored from its measurement or, for chassis, keyboard, pointing device, display, audio, camera and connectivity, from a formula over the specification. The formulas are shared with the market score's headline stats.
- A measurement is placed on an absolute scale for the model's year, between a low and a high reference. The low reference scores 65 and the high one 92. Below the low end the score falls fast. Above the high end it keeps rising but never reaches 100, so exceptional builds still gain.
- The scales tighten by year: great battery life or a great display in 2026 is more than it was in 2006. Keyboards are the exception, since keys got shallower rather than better.
- The overall score is a weighted mean of the categories. The weights depend on the device class: gaming leans on games, temperature and noise, thin and light on weight and battery, office on keyboard, battery and connectivity, and premium on chassis and display.
- The scores follow from the build, so reopening a review shows the same scores. Rivals are scored the same way.
- Pros and cons come from the build's own best and worst categories and a few standout measurements. There is no score nudge.

### Categories

Chassis, keyboard, pointing device, connectivity, weight, battery life, display, games performance, application performance, temperature, noise, audio and camera.

There is no sustainability score.

## Rivals

Rivals are generated per company. The hand-built 0.1 fields are gone.

- Rivals come from real makers and their real laptop lines, listed under Version 0.2, "Makers and lines". Each line on sale in a year makes one model that year.
- Each company has its own market per year: the rival models of every line on sale that year.
- A year's market is generated the first time the year is opened in the company, then saved with the company. It never changes after that.
- The seed comes from the company and the year, so the same company and year always generate the same market.
- A year opens when the company enters it, when a campaign reaches it, and before a review or the laptop of that year opens.
- Rivals carry their real company and model names until the game goes public.
- Rivals build under the same constraints as the player. Apple lines may use Apple M-series processors, which the player cannot use.
- Rivals never shape a review score or the pros and cons.
- Rivals fill the comparison tables, the value verdict, the charts and Kilnbench's ranking, and give the player a field to beat.
- Every rival has its own full review.

## Benchmarks and games

### Processor benchmark

- An original lookalike of Cinebench measures sustained single-core and multi-core performance.
- It comes in era editions.

### Games

- Graphics performance is measured by three fictional games instead of a graphics benchmark.
- The three tiers are a light game that runs on a toaster, a middle game, and a demanding game.
- Each game re-releases every three years.
- Each game is tested at low, medium, high and ultra presets. Each preset uses an era-appropriate resolution, the way Notebookcheck's older reviews ran low presets at 1024 by 768 and recent ones run everything at 1920 by 1080.
- A native-resolution run is added when the panel exceeds 1920 by 1080.

### Eras

- Reviews use the benchmark and game editions of the model's year.
- In their own play, the player can run a newer edition on an older laptop.
- An edition refuses to run on hardware that lacks a feature it needs.

### Results

- Every benchmark and game result exists for every model, whether or not the player ran it.
- Results are available wherever scores are displayed.
- There is no side-by-side comparison view.

## The review

### Publication

- While the game is private, reviews are published by Notebookcheck.
- If the game ever goes public, no real names remain anywhere.

### Structure

The review follows Notebookcheck's order:

1. Verdict, with pros and cons
2. Specifications
3. Case and connectivity
4. Input devices
5. Display
6. Performance
7. Emissions
8. Energy management
9. Rating breakdown

- Comparison tables set the build against the rivals of its year and class.
- Each test uses the profile Notebookcheck would use for it. Performance tests run on the highest enabled profile. Battery runtime runs on a balanced one.
- The verdict comments on value against the player-set price, for example calling a build overpriced.
- There are no award badges in version 0.1. From version 0.2, a campaign's award winners carry a badge on their review, and the review site lists a year's awards.

### Writing

- Review text is assembled from hand-written templates and phrases.
- No language model writes any review copy.

### Presentation

- Professional shots of the built laptop are taken automatically. The player does not direct angles or lighting.
- Scores are presented in a highly designed piece that gives real satisfaction for a great score.
- The player can consume the review the way they would read a Notebookcheck review.
- The review site looks like the internet of the model's era.
- A freshly built laptop sits in the workshop. The review opens on that laptop's own screen.
- The laptop's display specifications affect how the review looks on it. A low-resolution panel looks coarse. A dim panel looks dim.
- Pressing F shows the laptop's screen full screen. Full screen keeps the panel simulation, seen head-on: resolution, brightness and colour apply, viewing angle does not.

## The laptop's screen and sound

### Panel simulation

- Every page on the laptop's screen is shown as the build's panel would show it in that room.
- Brightness is set against the room's light. Blacks lift with the panel's black level and the room's reflection.
- Colour gamut sets saturation. Resolution sets sharpness.
- Viewing angle depends on the panel family. TN darkens and inverts from below, washes out from above and shifts colour from the side. IPS loses a little contrast and glows. OLED tints far off axis. Mini LED haloes faintly.
- A glossy panel adds glare from the room.
- The screen lights the scene around it in the colour of what it shows.

### Speakers

- Every sound the laptop plays goes through a model of the build's speakers.
- Speaker size sets the bass cutoff. The grill cuts treble. Power sets how loud it plays before it distorts.
- Stereo speakers pan and spread with where the player is. Sound falls off with distance.
- A build with no speakers plays no sound.

### Browser

- The laptop's OS has a Firefox-style browser that loads the real internet.
- Each tab is a sandboxed frame. Sites never reach the game's own window, and cannot navigate it or download.
- Ads and trackers are blocked, including YouTube video ads.
- SponsorBlock skips sponsor segments on YouTube.
- Google sign-in works.
- A site's full screen fills the laptop's screen, never the game window.

## The cafe

The cafe is where the player uses a laptop they built. Version 0.1 carries a minimal set:

- The cafe is the designer's exported room.
- The player walks the cafe in first person and sits at the table where their laptop is.
- Sitting and using are separate. Seated, the player looks around and zooms with the mouse wheel. Using frees the cursor on the laptop's screen.
- The player can browse the in-game review site and read reviews of any of their laptops and any rival.
- The player can browse the real internet in the laptop's browser.
- The player can run the processor benchmark and the demanding game. Both show a mock of the real visuals at the build's simulated speed or frame rate. The games cannot be played.
- The battery drains 30 times faster than real time, varying with activity.
- The player plugs in and unplugs with C, aiming at the laptop or the power socket in the table.
- F shows the screen full screen.

## The world map

The player is always on the world map or in one of five places: the Workshop, the Cafe, the Office, Courts and the Studio.

- Opening a company reopens it where the player left it; a new company, or one whose place is gone, opens in the office.
- The map is a street plan with the five places on street corners. A panel beside it names the selected destination and holds Go.
- The place the player walked out of is marked as the current place and cannot be picked. A dashed route runs along the streets from it to the destination.
- The Workshop and the Cafe ask which laptop to bring. The Workshop offers None first, by default. The Cafe always takes one, and is shut until a laptop works.
- Any laptop can come to the Workshop, drafts included. Only a laptop that works can come to the Cafe.
- The Workshop opens in free view in front of the turntable, with the laptop brought along on it, or an empty turntable.
- The Cafe opens through the street entrance, with the laptop brought along on the table. Empty handed, the table is bare and nothing asks for a laptop.
- Walking out through the Workshop's personnel door returns to the map. In the Cafe and Courts the exit door is a wall to walk into: aiming at it shows E Leave, which returns to the map. So does Map in any pause menu.
- From a place, Stay goes back in. From the menu, Menu goes back to the main menu.
- Each place has a short description on the map.
- Travelling to a place shows Going to it until the place has loaded. Closing a review or a video, Stay, and going between the workshop and the builder are no travel and show nothing.
- The Office is where the player runs the company: see The office.
- The Studio is where a laptop's commercial is made: see The studio. It is shut while no laptop can have one.
- Courts is the store, walked in first person. Its display tables hold what is on sale: in a campaign the last played quarter's shelf, rivals and the player's released models; in a sandbox the generated market of the year.
- Courts is laid out by department: MacBook, Gaming, Budget, Creator, Business, Thin and Light, and Everyday, each a laptop's first match in that order. Each department has its own colour and an overhead sign, its tables sorted by price. The player's own laptops are on a table by the door.
- Each table's sign shows its department, its price range and its makers.
- Each price tag carries the price and the specs. Courts shows no review scores.
- The inspect card shows the laptop's class and its share of its class's sales. Create clone names a copy and takes it to the workshop's turntable.
- Aiming at a laptop, E inspects it: a card with its maker, name, price, sales, specs and when it was released, a quarter such as 2024 Q2 in a campaign and the model's year in a sandbox. Previous and next step along the tables.
- From the inspect view, E uses the laptop as in the Cafe: its own OS on its screen, a store demo account under the maker's name, or the company's for the player's own models. Clicks and typing go to the OS, the screen and speakers are that laptop's, F shows it full screen and E stops using. Display units run on mains power. A laptop whose build does not work cannot be used.

## The office

The Office is a small loft in the workshop's building, and works as a 3D menu. Its stations run clockwise from the desk: Desk, Finance, Market intel, Marketing, Door, TV, Product wall and Trophy cabinet.

- Each station is a fixed view, and its panel is open whenever the view is on it, with no key or click to open or close it. Left and Right glide the camera to the next station and swap to its panel; Up and Down pick a laptop at the Desk and on the product wall. Nothing in the room is clicked. Key prompts along the bottom name the keys.
- A strip along the top shows the quarter, the cash, last quarter's profit and End quarter at every station and in free roam. End quarter is only there; it plays the quarter report, then returns to the Desk.
- Desk: where the business is run, at one glance across the view. The company's overview (quarter, cash, profit trend, alerts for sold out laptops, reviews due, new awards and a ready short), the laptops with their status and stock, and for the picked one everything that decides its production and price: run size, price, unit cost with the run size's effect, the retailers' cut, margin, setup, overhead, marketing, profit and break-even, stock, sold and wanted last quarter, and Release or Order, with Use, Read review, Open in the workshop, Duplicate, Delete and New model.
- Finance: the Books, with the statement and sales beside them. Marketing: the Brand. Market intel: the Market screen's Quarter, Rivals, Buyers and Store.
- Product wall: a showcase of the company's laptops on shelves, newest first, in as many bays as they fill. A draft stands in foam grey, a laptop in stock has its screen lit, and a sold out one is dark with its lid half shut. Its panel shows the picked laptop and the list at a glance; decisions are made at the Desk.
- Trophy cabinet: a cup, obelisk or plaque per award won, and the panel's awards and reviews. TV: the company's finished videos, shorts and commercials, newest first, picked and watched on its screen with its sound, or full screen.
- Door: E leaves to the map. Arriving from the map starts at the door and walks to the Desk.
- M walks the room in first person, with WASD and the mouse, the panels hidden; M again returns to the nearest station. Aiming at a laptop on the product wall that works, E uses it as in the Cafe: its own OS on its screen, F full screen and E stops using. Aiming at the door, E leaves. The desk's monitor is scenery.
- A sandbox company's office has no Finance, Market intel or Marketing in the ring and no End quarter.

## The studio

The Studio is a small commercial studio, walked in first person. At its editing desk the player makes a commercial for one of their laptops.

- Each laptop can have one commercial, ever. In a campaign only released laptops can; in a sandbox, any laptop that works.
- The script is typed line by line. The narrator reads each line and it shows as a caption.
- The timeline runs along the script, word by word. Scenes are dragged onto it and their start and end trimmed to any word: keyboard, ports, screen, lid and turn, and cards for title, sales, stats and score. Where no scene is placed, the video shows slow b-roll pans of the laptop from showcase angles, the lid angle changing from pan to pan.
- The video is 9:16, 1:1 or 16:9, narrated by any installed narrator or silent. A live estimate shows its length; 90 seconds is the limit.
- Finish spins a wheel. Its wedges are sized by their odds: -50% 8%, -25% 12%, 0% 19%, +10% 20%, +25% 18%, +50% 11%, +100% 9%, +200% 3%, so +20% on average. In a campaign the result scales the laptop's demand in the next quarter to resolve, stock still capping its sales; until then the Desk shows it on that laptop. In a sandbox the wheel spins and changes nothing.

## Videos

Every video is an MP4 made in the background, wherever the player is.

- Shorts and commercials are made in two separate queues, one video at a time each.
- A short is made for each quarter that resolves. The queue always finishes the one it is making, then makes the newest quarter's short not yet made; quarters played past in between get none.
- Commercials are made in the order they were finished.
- A video plays only once it is finished.

## The system menu

In the Office, Esc opens the system menu: Resume, Map, New company, Load company, Sound and Quit. Esc or Resume return to exactly where the player was, a laptop in use included. The other places keep their own Esc pause menus, which end with New company, Load company and Quit.

Esc in any pause menu closes it again; the pointer is never lost to it.

## Version 0.2

Version 0.2 is built. It came in three parts: a realism audit of the builder, then scoring and the market, then the sales simulation.

### Step 0: builder realism audit

Before any other 0.2 work, the builder is audited and fixed for realism. The work may take liberties where it has a good reason.

- Parts and options are gated to their real years. A 3K IPS panel in 2007 is not offered.
- Display brightness has a ceiling per year, rising to 1000 nits and more by 2026.
- Keyboard and trackpad quality depend on more than key travel.
- Trackpad size presets are weighed against the free slider.
- Compact sliders that do nothing are fixed or removed.
- Quality sliders give diminishing returns on cutting-edge technology.

### First half: scoring and the market

#### Review score

The review score is the critics' score. It replaces the 0.1 dice.

- Each of the 13 categories is scored on its own.
- Categories with a measurement are scored from it. Chassis, keyboard, pointing device, display, audio, camera and connectivity are scored from a formula over the specification.
- Every scale is absolute and tightens by year. A score never compares the build to other laptops.
- The first scales are drafted from what the game's own parts can achieve in each year. They are tuned by play-testing.
- The review score feeds critics, awards and sales bonuses.

#### Makers and lines

Rivals come from real makers and their real laptop lines. Each line has its real years, a class, a price band and its priorities. A line makes one model per year.

| Maker | Lines |
|---|---|
| Lenovo | IdeaPad, Yoga, ThinkPad, Legion |
| Dell | Inspiron, XPS, Latitude, Alienware |
| HP | Pavilion, Envy, Spectre, EliteBook, Omen |
| Apple | MacBook, MacBook Air, MacBook Pro |
| Asus | VivoBook, ZenBook, ROG |
| Acer | Aspire, Swift, Predator |
| MSI | Modern, Prestige, gaming lines |
| Samsung | Galaxy Book |
| Microsoft | Surface Laptop |
| Razer | Blade |
| Toshiba | Satellite, Portege, until Toshiba left the market |
| Sony | VAIO, until 2014 |

- Apple lines may use the M-series chips. The player still cannot.

#### Rival generator

- The generator picks parts for a line and year, then swaps and fixes parts in a cheap loop until the build is valid and decent.
- A year's market is generated the first time that year is opened in a company, then saved with the company.
- The hand-built rival fields are deleted.
- A line never sells its own parts at a loss. If its usual price band would, the price rises to the lowest point that still covers them.

#### Market score

The market score is the tycoon score. It rates a laptop for buyers directly and is separate from the review score.

- Headline stats: application performance, games performance, battery life, portability (weight and thickness), display, chassis and build, keyboard, trackpad, connectivity, thermals and noise, audio, and price.
- Buyer segments are Laptop Tycoon's 20 segments, ported directly with their relative weights and remapped onto these headline stats.
- Each stat is taken as a ratio to that year's market average, clamped to 0.5 to 1.5.
- Per segment, the mean ratio under that segment's weights maps linearly to 1 to 10: 0.5 gives 1 and 1.5 gives 10.
- Uniform noise of up to 0.5 either way is added, and the result is rounded.
- A stat is good for a segment at a ratio of 1.15 or more, and bad at 0.85 or less.

#### Using the laptop

- A simple text editor, its documents saved with the company. The keyboard specification does not affect typing.
- Page loads are throttled by the build's hardware.
- Mock gameplay for the light and middle games.
- Real internet browsing and speaker-filtered sound are already built. Video clips are dropped.

### Second half: the sales simulation

#### Modes

- Campaign mode: the player picks a start year from 2006 to 2025, starts with $5,000,000 cash, and plays forward one quarter at a time with End quarter. A campaign has no last year: only bankruptcy ends it.
- Past 2026 the world holds at 2026: the same parts, options, rival lines, price ranges, review scales, buyer populations and era looks, and the 2026 game editions. No new parts appear and none disappear. Marketing costs and price ceilings keep rising 3% a year.
- Sandbox mode: today's free-year building stays, with no money and no sales. The 0.1 rules on spending and price hold there.

#### Finances

- Releasing a model pays design and certification, then chassis tooling, once: $300,000 and $700,000 for a new chassis, $75,000 and $50,000 for a refresh on a body already tooled.
- A production run is ordered at a size from 100 to 100,000 units. A unit pays the build's full cost at 5,000 units. Smaller runs pay more per unit, about 116% at 1,000 and 139% at 100; economies of scale bring larger runs to about 89% at 10,000, 71% at 50,000 and a floor of 70% beyond.
- Retailers keep 20% of every sale's retail price.
- Fixed overhead runs $150,000 a quarter, plus $40,000 for every released line still holding stock.
- Unsold stock costs 4% of its production value a quarter in holding, about 16% a year.
- A company that ends a year with negative cash goes bust and the campaign ends.

#### Sales

- Each segment's buyers this quarter, a share of its population on a seasonal curve, split among every laptop on sale by appeal.
- Appeal multiplies the market score (exponential: a 10 sells about 4.8 times an average 5.5, a 1 about a fifth), price against the segment's price ceiling (full appeal up to 60% of it, easing to about 30% at the ceiling, then falling fast past it, to about 14% of that at 50% over), screen size fit, a launch novelty bonus that decays roughly 15% a quarter, faster for segments that chase the new, the critics' review score, award bonuses, the maker's brand, and up to 12% random noise a quarter.
- Every buyer buys. The player's sales stop at stock; rivals never run out.
- A good quarter's buyers spread word of mouth, growing reach in the segments that bought.

#### Marketing and brand

- Reach, the share of a segment that knows the company, and perception, its opinion of the company, are tracked per segment, ported from Laptop Tycoon.
- A new company starts at 2% reach and neutral perception everywhere. Reach never falls below 1%.
- Five paid campaign tiers run per segment per quarter, from grassroots at $2,000 to cultural omnipresence at $3,000,000, in 2000 dollars, rising 3% a year. Each grows reach toward a ceiling and spills some of its new buyers to neighbouring segments. Reach a campaign doesn't hold decays back down every quarter.
- Perception moves with buyers' experience of value, market score and review score against par, smoothed a quarter at a time. A bad experience weighs 1.5 times a good one.

#### Critics and awards

- Critics publish a laptop's review the quarter after it goes on sale, the player's and the rivals' alike.
- Until its review is published, a laptop counts as a review of 65 with buyers: neither help nor harm.
- In a campaign the player can review an unreleased model as a private preview. It shows the score critics will give and counts for nothing.
- Awards are given at the end of each Q4, across every laptop launched that year.
- Awards are judged from review scores and measured categories, never the market score.

| Award | Judged by |
|---|---|
| Best overall | Overall review score |
| Best value | Review score per dollar, among laptops at or above the year's median score |
| Best portable | Mean of weight, battery life and overall |
| Best performance | Application performance |
| Best business | Mean of keyboard, battery life, connectivity, chassis and overall |
| Best gaming | Games performance |

- Each award speaks to a set of buyer segments, primary and secondary.
- A winner's appeal rises by 10% in its award's primary segments, and 2% in secondary ones, for the whole next year.
- A player's win adds 5 perception at once in the primary segments, and 1 in secondary ones.
- The review site shows a year's awards and a badge on each winner's review. The company view lists the player's awards.

#### Rival timing

- Each line launches its yearly model in a quarter fixed per company, line and year: business lines early in the year, consumer lines skew to back to school and the holidays, gaming lines chase the fall game releases and the holidays. Apple and Microsoft follow their own announcement calendars instead.
- A model stays on sale until its successor launches, plus a quarter to clear stock, or four quarters after its own launch if the line ends.

#### Market world

- Every quarter the campaign keeps its whole shelf: units sold per laptop per buyer segment, the player's and the rivals', the quarter's launches, the player's prices and demand, and the brand's reach and reputation. It keeps every quarter of the campaign, about 360 KB over 2006 to 2026, and more for every year played past it.
- The Market screen: Quarter, Rivals, Buyers and Store tabs, a quarter picker driving every tab but Store, and Close, or Continue after End quarter. End quarter opens it over the office on the quarter just played; the office's Market intel station holds it on the last played quarter.
- Quarter: the company's units, revenue, profit, share and rank against the market; every maker's share and movement; the quarter's launches with review scores; the best sellers, with the player's own ranks, and the year's awards in a Q4.
- Rivals: for a player model, the five rivals it competes with most (buyer overlap times price closeness) by units won, and a stat matrix of indices on the market's par with buyer weights and a market score.
- Buyers: every segment's buyers, wants, the share the company won, units per player model, and the brand's reach and reputation.
- Store: the laptop's OS with Courts open, the same retailer site every laptop's OS carries, in its era's look, with class matrix filters, best seller ranks, real stock and similar laptops from the Rivals overlap.

## Stretch goals

- A cinematic video review, narrated with non-language-model text-to-speech, with pre-animated camera variety. Feasibility is not judged yet.
- Opening the laptop's webcam in the cafe, showing a simulated view at the webcam's quality

## Technology

- Electron with TypeScript, targeting Windows
- A three-dimensional renderer that works well with Claude Design's three-dimensional outputs

## Implementation requirements

### Modular assembly

This is the highest-priority technical requirement. For every combination of choices, the engine must assemble the laptop predictably. Parts must never fail to fit together visually.

- Every part is parametric. It is built from rules, scales along defined axes, and exposes fixed attachment points.
- Every body and layout defines named mounting zones.
- The engine assembles by rule. It never relies on a hand-placed model per combination.
- A part that cannot satisfy its zone is flagged as not fitting.
- Modelling stays minimal. Many permutations are generated from few base models.

### Fit solving

- Layout, body shape and parts produce the minimum body dimensions deterministically.
- It runs fast enough for live feedback on every change.

### Shared simulation

- The builder and the reviewer run the same simulation, because live measurements must be exact.
- The thermal model runs over time so it can produce throttling in sustained tests.

### Power and performance curves

- Processors and graphics need performance across power levels, not a single number, so power tweaks and throttling work.
- Each architecture gets a formula, fitted to one or two curated real data points per part. This keeps data entry to a minimum.

### Cross-era features

- Every benchmark and game edition declares the hardware features it needs.
- Every processor and graphics part declares the features it has.

### The in-game screen

- The page is laid live over the three-dimensional laptop screen. The panel's effects are drawn over it, so input lands on the page itself.
- The texture is filtered by the panel's resolution, brightness and colour.
- Full screen keeps the filter, seen head-on.
- The real internet is sandboxed. Done.
- Sound is filtered to match the speaker specification. Done.
- From version 0.2, page loads are throttled to match the hardware.

### Era websites

- The review site needs a distinct design per era.

### Review text

- Hand-written fragments must combine without obvious repetition across many reviews.

### Versions

- There is no save compatibility promise across game versions.

## Content to curate

- Processors and graphics per year, with feature lists and power curve data points
- Specification options per category, with unlock years
- Preset bodies with year availability, scaling limits and layouts
- Materials with year availability
- In 0.1, which of the six makers compete in which classes, and rival presets per year and class
- From 0.2, makers and their lines, each with its years, class, price band, priorities and launch quarter
- From 0.2, review score scales per category and year
- From 0.2, Laptop Tycoon's 20 buyer segments and their weights, remapped onto the headline stats
- Processor benchmark editions
- Three games with an edition every three years
- Era website designs
- Review writing fragments
- Name randomiser word lists

## Open decisions

- Where the player views benchmark and game results was left open.