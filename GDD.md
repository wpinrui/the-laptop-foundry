# The Laptop Foundry

Design document for version 0.1.

## Frontend text rule

**NEVER add needless text to the frontend. EVER.** If the game is usable without a piece of text, that text does not ship. This applies to every screen, label, tooltip, heading, hint and message. Distinguish items by weight, size, colour or spacing, never by separator glyphs. If two items would get identical treatment, they are one item: merge them or cut one.

## Concept

The player picks a year, builds a laptop from components, and receives a professional review of it with a score.

Version 0.1 has no tycoon features. There is no sales simulation, no capital and no balance. The loop is build, get reviewed, duplicate to try again, and use the laptop.

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

- The player picks a year from 2006 to 2026. For 0.1, since it is proof of concept, the only years allowed will be 2006, 2016 and 2026.
- The year gates everything available: parts, bodies, materials and specification options. Colours, keycap styling and marks are open in every year.
- Moving a model to a year where a part does not exist makes that part unavailable.

## Building

### Flow

- The laptop is visible in three dimensions throughout, including its internal layout as it changes. The reference is the engine and car builder in Automation.
- Building is a fixed line of stages: year, chassis, screen, inside, surface, keys, finish, marks and price.
- The player can jump between stages freely.
- Fit problems show live on every stage.

### Bodies

- The player chooses from preset bodies. Availability depends on the year.
- All bodies are standard clamshells. There are no convertibles.
- The player can scale a body along x, y and z, alone or in combination, in the spirit of SketchUp.
- Scaling lets a body hold a larger battery, a larger screen, better speakers and similar.
- The player picks materials, by year, and any colour for the lid, deck, bottom and bezel.

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
| Battery | Specification |
| Hot-swappable battery | Optional |
| Cooling | No fan, one fan, two fans, or two fans on a vapour chamber |
| Optical drive | Specification |
| Ports | Standards, placed by the player along a side wall and up it |
| Wireless | Standard |
| Keyboard | Specification, plus keycap shape, colours and legends |
| Trackpad | Specification |
| Webcam | Specification |
| Speakers | Specification |

Processor rules:

- Apple Silicon is excluded from the player's parts.
- Qualcomm Snapdragon processors are probably included.
- Part data is hand-curated and not exhaustive. It covers the main players per part per year.

The operating system is always Windows. The player does not choose it and it affects nothing.

### Layout and fit

- Every component physically occupies space and is modelled in three dimensions.
- The player never arranges the internals by hand.
- The player places the keyboard, trackpad, webcam and ports on the laptop, within allowed ranges. Keyboard and trackpad stay centred. A placed part that runs into another is a fit problem.
- The player chooses a layout, much as an Automation player changes engine layout to fit a car.
- Layouts are mostly cosmetic, but each sets the minimum x, y and z of the internals. So layout decides what fits.
- Port placement is the player's. Reviewers can praise things like charging from both sides.
- A build may not fit. The player then rescales the body or changes parts.

### Keycaps and marks

- The player styles the keycaps: shape, the colours of letters, modifiers and accent keys, and the legends' font, colour, alignment, case, size and weight.
- The player adds text and imported SVG marks to the lid, palm rest, bottom and bezel, each etched, printed or embossed.

### Engineering spend

- The player can spend more to make parts smaller or pack them tighter.
- The player can spend more on better materials: lighter, better at heat transfer, or more durable.
- Spending is free in version 0.1. There is no trade-off, and maxing every slider is allowed.
- All spending adds to the displayed cost price.

### Power

- Processor and graphics power limits start at reasonable defaults. The player can tweak them.
- Every build gets High, Medium and Low profile presets. The player can tweak or disable any profile.

### Price

- The player sets a retail price in United States dollars at that year's nominal value.
- The price decides the budget tier of the device class.
- The build's cost price is displayed.
- Price has no other mechanical effect.

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

Scoring is deferred past version 0.1. In 0.1 every score is a dice roll.

- Each category score and the overall score are rolled at random.
- The roll is fixed per model. Reopening a review shows the same scores. A duplicate is a new model, so it rolls again.
- Rivals roll the same way.
- Pros and cons still come from measurements that stand out against the rivals. There is no score nudge.

### Categories

Chassis, keyboard, pointing device, connectivity, weight, battery life, display, games performance, application performance, temperature, noise, audio and camera.

There is no sustainability score.

## Rivals

- Rivals come from six fictional makers based on Lenovo, HP, Dell, Apple, Asus and Acer.
- The six makers are constant across all years. There are no entries or exits.
- Each maker is set to compete or not compete in each class. That setting applies to every year.
- Rivals carry fictional company and model names.
- Rivals are hand-built and hard-coded as presets per year and class. Every player build faces the same field.
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
- Pressing F shows the review full screen. Full screen shows the page clean, without panel simulation.

## The cafe

The cafe is where the player uses a laptop they built. Version 0.1 carries a minimal set:

- The player walks the cafe in first person and sits at the table where their laptop is.
- The player can browse the in-game review site and read reviews of any of their laptops and any rival.
- The player can run the processor benchmark and the demanding game. Both show a mock of the real visuals at the build's simulated speed or frame rate. The games cannot be played.
- Fan noise is audible in the cafe.
- The battery drains 30 times faster than real time, varying with activity.
- The player plugs in by clicking the charging port.

## Version 0.2

- Real internet browsing on the laptop
- A simple text editor. The keyboard specification does not affect typing.
- Video clips that show off the screen and speakers
- Page loads that slow down on weak hardware
- Mock gameplay for the light and middle games

## Deferred past 0.1

### Rating scheme

The rating mirrors Notebookcheck's approach. One scheme applies to every year, with expectations adjusted to the year.

#### Scale

- For every year, class and category, the team researches the real best reasonable laptop and the real worst reasonable laptop.
- The best one's measurement maps to about 90%. The worst one's maps to about 50%.
- A curve interpolates between those points and extrapolates beyond them, capped at 100%.
- These anchors only ground expectations. They never appear as products in the game.
- The room above 90% rewards a build that beats the whole field.

#### Weights

- Each of the 27 classes has its own category weights.
- Mathematical curves produce the starting weights. The team then hand-picks them during playtesting.

#### Impression nudge

- The pros and cons list nudges the final score. Standouts that beat every rival push it up. Dealbreakers below the worst rival push it down.
- The nudge is capped at a few percent either way.

#### Rivals

- Category scores never depend on the rivals. Rivals only shape the impression nudge.
- During development, a tool builds each rival to hit a target score within the anchor-defined range. The field spreads from near the top to near the bottom.

#### Content to curate

- Best and worst reasonable real laptops per year, class and category

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

- Layout plus parts produces the minimum body dimensions deterministically.
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

- Web pages render off screen to a texture on the three-dimensional laptop screen.
- Input is forwarded to that page.
- The texture is filtered by the panel's resolution, brightness and colour.
- Full screen bypasses the filter.
- From version 0.2, the real internet must be sandboxed, and page loads are throttled to match the hardware.
- From version 0.2, video audio is filtered to match the speaker specification.

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
- Which of the six makers compete in which classes
- Rival presets per year and class
- Processor benchmark editions
- Three games with an edition every three years
- Era website designs
- Review writing fragments
- Name randomiser word lists

## Open decisions

- Where the player views benchmark and game results was left open.