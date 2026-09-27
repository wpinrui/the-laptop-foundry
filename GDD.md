# The Laptop Foundry

Design document for versions 0.1 and 0.2. Version 0.1 is described as it exists. Version 0.2 is the plan, set out under Version 0.2.

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
- Building is a fixed line of stages: year, chassis, screen, inside, surface, keys, finish, decals and price.
- The player can jump between stages freely.
- Fit problems show live on every stage.
- The builder stands in a workshop room, the laptop on a turntable.
- A lid slider opens and shuts the lid. It is a view setting, not part of the design.

### Free view

- Free view lets the player walk the workshop in first person.
- Looking at the laptop offers what its state allows: turn it over, take its bottom cover off, open or shut the lid, or use it.
- Using it runs the laptop's own OS on its screen, as in the cafe.
- F shows the screen full screen. The mouse wheel zooms.

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
| Display | Free specification: size, ratio, resolution, panel type, refresh rate and bezel. A combination nobody sold that year is a custom panel at a premium; only what no maker could build that year is blocked |
| Battery | Specification. A pouch is sized by length, depth and thickness, and its capacity follows |
| Hot-swappable battery | Optional |
| Cooling | No fan, one fan, two fans, or two fans on a vapour chamber. Fan size and the fan grill are the player's |
| Optical drive | Specification |
| Ports | Standards, laid out along a side wall in the player's list order |
| Wireless | Standard |
| Keyboard | Specification, plus keycap shape, colours and legends |
| Trackpad | Specification |
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
- The player adds text, preset, emoji and imported image decals (SVG, PNG, JPEG or WebP) to the lid, palm rest, bottom and bezel, each etched, printed or embossed.
- A decal is filled or outlined, and turns about its centre. An SVG may keep its own colours.
- Emoji come from the full Twemoji set, with skin tones.
- Text decals and key legends choose from 18 open fonts in sans, condensed, serif and mono groups.
- Decals stay on the flat part of shaped faces.

### Engineering spend

- The player can spend more to make parts smaller or pack them tighter.
- Each part has a Compact slider. Compact spend takes height and room off parts such as the keyboard, trackpad and speakers. The chassis has Packing and Material spend.
- The player can spend more on better materials: lighter, better at heat transfer, or more durable.
- Spending is free in version 0.1 and in sandbox mode. There is no trade-off, and maxing every slider is allowed.
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

In 0.1 every score is a dice roll. Version 0.2 replaces the dice with the review score under Version 0.2.

- Each category score and the overall score are rolled at random.
- The roll is fixed per model. Reopening a review shows the same scores. A duplicate is a new model, so it rolls again.
- Rivals roll the same way.
- Pros and cons still come from measurements that stand out against the rivals. There is no score nudge.

### Categories

Chassis, keyboard, pointing device, connectivity, weight, battery life, display, games performance, application performance, temperature, noise, audio and camera.

There is no sustainability score.

## Rivals

This is the 0.1 field. Version 0.2 replaces it with generated lines from more makers, under Version 0.2.

- Rivals are real laptops from six real makers: Lenovo, HP, Dell, Apple, Asus and Acer.
- The six makers are constant across all years. There are no entries or exits.
- Each maker is set to compete or not compete in each class. That setting applies to every year.
- Rivals carry their real company and model names until the game goes public.
- Rivals are hand-built and hard-coded as presets per year and class. Every year from 2006 to 2026 has its own field. Every player build faces the same field.
- Rivals build under the same constraints as the player. The Apple-based rival may use Apple M-series processors, which the player cannot use.
- Rivals only shape the pros and cons.
- Rivals fill the comparison tables and give the player a field to beat.
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
- There are no award badges in version 0.1.

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
- Fan noise is audible in the cafe.
- The battery drains 30 times faster than real time, varying with activity.
- The player plugs in and unplugs with C, aiming at the laptop or the power socket in the table.
- F shows the screen full screen.

## Version 0.2

Version 0.2 is the plan. It comes in three parts: a realism audit of the builder, then scoring and the market, then the sales simulation.

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

#### Market score

The market score is the tycoon score. It rates a laptop for buyers directly and is separate from the review score.

- Headline stats: application performance, games performance, battery life, portability (weight and thickness), display, chassis and build, keyboard, trackpad, connectivity, thermals and noise, audio, and price.
- Buyer segments are Laptop Tycoon's 20 segments, ported directly with their relative weights and remapped onto these headline stats.
- Each stat is taken as a ratio to that year's market average, clamped to 0.5 to 1.5.
- Per segment, the mean ratio under that segment's weights maps linearly to 1 to 10: 0.5 gives 1 and 1.5 gives 10.
- Uniform noise of up to 0.5 either way is added, and the result is rounded.
- A stat is good for a segment at a ratio of 1.15 or more, and bad at 0.85 or less.

#### Using the laptop

- A simple text editor. The keyboard specification does not affect typing.
- Page loads are throttled by the build's hardware.
- Mock gameplay for the light and middle games.
- Real internet browsing and speaker-filtered sound are already built. Video clips are dropped.

### Second half: the sales simulation

#### Modes

- Campaign mode: the player picks a start year from 2006 to 2025 and plays forward in quarter turns to 2026.
- Sandbox mode: today's free-year building stays, with no money and no sales. The 0.1 rules on spending and price hold there.

#### Finances

- The company has cash.
- Part and tooling costs, production runs and stock, and the retailers' cut decide profit.
- A company can go bust.

#### Sales

- Each segment has a demand per quarter, on a seasonal curve.
- Laptops split that demand by market score and price, plus bonuses from the review score, awards and novelty.
- Rivals sell too.

#### Marketing and brand

- The company has reach and reputation per segment.
- Sales, reviews and paid campaigns grow them.

#### Critics and awards

- Critics review a laptop after launch.
- Awards are given at year end.
- Both come from the review score.

#### Rival timing

- Each line launches its yearly model in a given quarter.

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