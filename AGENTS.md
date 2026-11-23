# Working on Grid

Notes for agents and people changing this repository.

## Names

- Write "Grid" in sentences and `ongrid` in code.
- The commands will be `grid` and `ongrid`. They do the same thing.
- Internal packages use the `@ongrid/` scope. The scope is provisional. It appears in the
  package names under `packages/` and in imports between packages, and nowhere else.

## Layout

- `packages/floorplan`: the plan schema, geometry, validation and exporters. It stays pure: no
  React, no Three.js, no DOM and no network. Every tolerance and limit a check uses lives in one
  table, `src/geometry/tolerances.ts` (MSG-15), and is read through `tolerance()` or `limit()`;
  `src/geometry/__tests__/tolerances.test.ts` fails on a tolerance literal anywhere else in the
  geometry, validation or schema, and when the table in `docs/tolerances.md` no longer matches
  it. Its figures are Grid's own drawing checks and cite no document.
- `packages/floorplan/src/messages/` (MSG-11): Grid's own words, one file per language (`en.ts`, the
  source; `es.ts`, a draft translation, not reviewed), keyed by code with named placeholders, and
  `say`, which fills them with figures in the language's decimal mark and names as written.
  `uses.ts` holds the room uses with a label per language. A sentence Grid writes goes there and
  nowhere else: `packages/cli/src/__tests__/ownWords.test.ts` counts English sentences in every
  other source file against its list of what is left to move. See `docs/languages.md`.
- `packages/floorplan/src/geometry/areas.ts` (ARE-9): net, gross internal and gross external
  area per floor and per use, from the spaces and the worked-out outside walls. Every figure
  carries its rule from `MEASURES`, in Grid's own words; the table in `docs/areas.md` must match
  it, and no measuring standard is named anywhere but in a figure record (a test checks both).
  The CLI's `quantities/areas.ts` adds room sizes, free floor, circulation and each figure's state.
  `partyWalls.ts` (ARE-14) measures a flat, or the rooms in no flat, to the middle of its party walls.
- `packages/floorplan/src/geometry/arc.ts` (CNT-18): a curved wall (C21, `arc` in the schema):
  its curve worked out from its centre and sweep, its faults, and the stations straight pieces
  follow it by. Read a wall that may be curved through `wall.ts`: `wallLength`, `wallFrameAt`,
  `wallSegments` (its chords) and `wallSliceShape` (its faces as true arcs); `wallAxis` throws
  for a curved wall, so no code takes its chord for it.
- `packages/floorplan/src/rooms/` (WRT-2): writing a plan rooms first and reading any plan back
  as rooms text. `compile.ts` works out the walls, their kinds, the room boundaries and the
  openings' places from rooms text (the language is in its header); `read.ts` reads a plan back
  and checks the reading by writing it again, so it loses nothing; `stamp.ts` keeps what the
  plan records about how it was written (`written`). The plan file is the source of truth and
  rooms text a way of writing and reading it. `fixtures/rooms/` holds the lab's eight buildings
  as rooms text with their originals; `rooms/__tests__/buildings.test.ts` holds them to it.
- `packages/floorplan/src/geometry/patterns.ts` (LVL-8): opening patterns (`patterns`, C12 in
  `types/floorplan.ts`) expanded into plain openings (`expandPatterns`, `withPatterns`). Every
  reader expands first (`loadPlan` unless read whole, `inspectPlan`, `exportPlan`, the pictures),
  so exporters and checks see plain openings only; the commands that write the plan keep the
  patterns. `facade.ts` works out a side of the building in elevation (`planFacade`) from the
  floors' outlines, levels, slabs and roofs; the viewer's `picture/facade.ts` only draws it.
- `packages/floorplan/src/scan/` (HND-12): a phone room scan read in, Apple's room model first.
  `roomModel.ts` reads the scan (its shape in Grid's words is in its header), `toPlan.ts` pairs
  each wall's two faces and writes the rooms through `compileRoomsText`, marking every part
  `scanned` and listing what it assumed, and `evidence.ts` is the scan kept beside the plan
  (`<plan>.scan.json`, written by `packages/cli/src/command/scan.ts`), keyed by the scan's ids,
  which a re-scan is matched to. Test scans are invented in `test-support/roomScan.ts`, never
  copied from a real scan or Apple's samples.
- A trace image under the plan (HND-10, C31): `packages/floorplan/src/geometry/trace.ts` works out
  its scale (from `calibration`, two points and a length, or `scale`), its floor, its corners and
  the one transform it is drawn with; `packages/cli/src/trace/traceImage.ts` reads the picture
  through the project's files (a `.png`, `.jpg` or `.jpeg`, checked by its header) and says what
  became of it; the viewer's `planPicture` draws it, given as a `data:` address, over the rooms'
  fills and under every line, and reads no file. `loadPlan` refuses a path that is not a picture.
- `packages/floorplan/src/geometry/items.ts` (CNT-12): the plan's fixtures (`items`, C6 in
  `types/floorplan.ts`): their footprints, symbols, rooms, the floor they take and their checks.
  CNT-11 decided fixtures first; CNT-20 added furniture (`FURNITURE_KINDS`), and every kind is one
  entry of the kinds registry (`itemKinds.ts`). A fixture is never a wall or a room.
- `packages/floorplan/src/geometry/partTypes.ts` (CNT-15): named wall, door and window types
  (`types`, C24 in `types/floorplan.ts`) and room finishes. `withTypes` fills each part from its
  type when the plan is read, records it in `typed` and `statedWall` and `statedOpening` leave it
  out of the file, so a reader reads the part and a change to the type reaches every part of it.
  The quantities by type and finish are the CLI's `quantities/finishes.ts`; the change is
  `edit/types.ts` (`grid_change_type`, `grid edit type`).
- `packages/floorplan/src/geometry/itemKinds.ts` (CNT-20): the one registry of the kinds of
  thing an item may be (`ITEM_KIND_DEFINITIONS`, `registerItemKind`): each kind's group (a fixture
  takes free floor, furniture none), word, agent text, plain symbol and own checks. Every reader
  of a kind (the drawing, the DXF and IFC, the counts and the check) goes through it, so a new kind
  is one entry; `__tests__/itemKinds.test.ts` holds a dummy kind to reaching all of them.
  `src/library/` (C30) is the library placed from by name: `builtIn.ts` Grid's own sizes and
  typical rooms, `index.ts` the lookup (the plan's own `library`, an office's files, Grid's) and
  placing; `withLibrary` in `types/floorplan.ts` fills an item from its entry, `statedItem` writes
  it back. The CLI reads the office's `library/` folder beside the plan (`src/library/office.ts`)
  and places with `grid_place_item` (`edit/place.ts`). See `docs/library.md`.
- `packages/floorplan/src/geometry/columns.ts` (CNT-16): the plan's columns (`columns`, C25), a
  thing of their own, never a wall, a room or a fixture: their footprints, the room each stands in,
  the floor it takes off that room's area (`roomColumnArea`, read by `roomFloorArea`), the floors it
  rises `through` and its checks. `structuralGrid.ts` works out a named grid's lines (`grids`) and
  the dimensions of their spacing; a grid is drawn only.
- `packages/floorplan/src/geometry/parking.ts` (CNT-19): parking bays (`bays`, C29), things of
  their own, never rooms: their footprints, each floor's count by number (`planBayCounts`) and
  their checks; and ramps (`ramps`) between two floors, laid out as stairs are (`planRamps`): the
  two levels in metres, the length along the middle line, the slope worked out beside the one the
  plan states. A ramp opens its upper floor's slab (`envelope.ts`). A swept-path check is not here.
- `packages/floorplan/src/types/facts.ts` (CNT-9): facts of the person's own, in `properties` on
  walls, openings, rooms and floors (C9 in `types/floorplan.ts`), and a room's stated `number`. Grid
  checks nothing against a fact. A field that carries one is listed in `FACT_FIELDS`, and the
  sheet places it in `FACT_COVERAGE` (`packages/cli/src/sheet/coverage.ts`).
- `packages/floorplan/src/geometry/phases.ts` (CNT-10): a plan's phases, `existing`, `demolished`
  and `new` on walls, openings and rooms (C16 in `types/floorplan.ts`). `planInState` gives the
  building before or after the work; everything that measures or checks reads it after
  (`surveyPlan`, `planAreaFigures`, `checkLocalRules` and the like), `validatePlan` checks each
  state on its own, and the drawing and the exports read both, each part with its phase. A plan
  with no phase is read as before. `mergeBase` reads a fit-out's `base` plan in as existing; the
  command reads the base file in `command/plan.ts`, and `cli/src/edit/phases.ts` refuses an edit
  that touches it and makes an edit of a plan with phases the work.
- A survey drawn from its own numbers (HND-11): a wall may be placed by a face (`face` in
  `types/floorplan.ts`); the reading moves it to its centre line and records `placedBy`, and
  `statedWall` writes the face back. Every change that moves a wall end goes through
  `wallWithEnds`, so no centre point lands in a file as a face. `geometry/taped.ts` sets the
  plan's `taped` lengths against the drawing; the CLI's `src/taped/table.ts` prints them after
  `grid check` and every change. `geometry/export/origin.ts` decides where an export writes a
  plan from: `site.origin` for a plan far from (0, 0), and the GLB keeps that offset in one node.
- `packages/rules`: the checks that apply a figure from a building code, and the figures,
  each with where it was read and how far it has been checked. See its `README.md` before
  adding or changing a rule. It also holds the front door, `inspectPlan` (MSG-1,
  `src/result/`): one call that never throws and returns one record, one list with one count,
  for `grid check` and `grid_check`. `docs/result-contract.md` is the record's contract, and a
  test fails when it and `src/result/catalogue.ts` list different codes. A new message code
  gets its one wording, what is needed and the fix in that catalogue, and its row of the code
  table and its entry for agents in the change's fragment, `changes/<ID>.md` (see Rules).
- A firm's own standards (COD-8): `firm-standards.json` beside the plan, read and checked in
  `packages/cli/src/firm/` (`standards.ts` the file, `measure.ts` the plan measured by CNT-13's
  indicators and ARE-9's net area) and worded in `packages/rules/src/result/firm.ts` as `firm/`
  findings under their own heading, never with a code's figures. `docs/firm-standards.md`.
- `packages/viewer`: the 2D and 3D views. It draws what the core gives it and never
  computes geometry of its own. A look (SHT-1, `src/picture/look.ts`) is a named set of values
  the one drawing function, `planScene`, applies to the same geometry: `working` for the screen
  and every picture an agent gets, `technical` for sheets and `grid draw`, black on white with
  line weights in millimetres on paper from a pen set chosen by scale (1:50, 1:100, 1:200).
- `packages/cli`: the `grid` command (`ongrid` runs the same file): `init`, `write`, `edit`, `mark`, `diff`, `check`,
  `describe`, `draw`, `export`, `sheet`, `tidy`, `preview`, `serve` and `mcp`, in `src/command/`. `write`
  (WRT-2) writes a plan from rooms text, the main way to write one, or with `--scan` from a phone
  room scan (HND-12); `describe --as rooms` reads
  it back. `tidy` (MSG-12) lists the
  library's wall faults and makes the chosen fixes on the plan file as read. `describe` (VEW-5, `src/describe/`)
  prints the plan in three lengths, for a person (never an id) or an agent (`--for agent`), and
  walked room by room as its long form (VEW-9, `walk.ts`, `--length walk`); a route's walked
  length is `src/quantities/walked.ts`. A
  folder holding `grid.json` (`grid init` writes it) is a Grid project: there `check`,
  `describe`, `draw`, `export` and `sheet` read its `plan.json` when no plan is named. `check`
  (MSG-10) is short by default and whole with `--full`; `--seen <n>` sets a note aside as seen in
  `<plan>.seen.json` beside the plan (`src/seen/marks.ts`), keyed to the content of the parts the
  note is about, so a change to one of them makes it new again. A seen note is always listed. `npm run build` bundles it with esbuild into
  `packages/cli/dist/grid.mjs`, which is git-ignored. The `grid` and `ongrid` bins point to
  `bin/grid.mjs`, a committed launcher that runs it, because npm links bins at install time. Its end-to-end tests run that file as a
  child process; `npm test` builds it first. Every option is strict: an unknown, repeated or
  meaningless one is refused by name.
- `grid serve` (CMD-5, `packages/cli/src/mcp/`) is the tool server an agent uses: 33 tools named
  `grid_…`, in a fixed order (reading tools by the requests they answer, the problem report
  last of them (CMD-13, `src/report/`, which sends nothing), then the preview and the preview
  page's own call (VEW-4, `previewTools.ts`), the
  export, the sheet, the start marker (WRT-8), the seen mark (MSG-10, `seenTool.ts`), the brief (BRF-1,
  `briefTool.ts`), and the tools that change the plan, the saved views last (VEW-3, `viewTool.ts`)).
  Each is written once in `readTools.ts`, `writeTools.ts`, `previewTools.ts`, `reportTool.ts`, `seenTool.ts`, `briefTool.ts` or `viewTool.ts`; `toolkit.ts` turns its argument list into both the input schema and the
  check. The measuring is in `src/quantities/` (CNT-9's asking across parts by their fields and
  facts, for `grid_fields`, `grid_find` and `grid_count`, in `query.ts`), the changes in `src/edit/`, the views in
  `src/draw/views.ts`. A 3D picture is taken from one camera record (VEW-3,
  `packages/floorplan/src/geometry/camera.ts`): `src/draw/cameraAsk.ts` turns a call into it,
  and the app's 3D view and the stills open at it (`recordCamera` in `packages/viewer`). `src/mcp/__tests__/tools.test.ts` fails when a tool loses its prefix,
  title, hint, examples or output schema, or when the order changes; `replay/replay.test.ts`
  replays the lab's five Y conversations and holds the score. A description starts "Use this
  when…" and says when not to use the tool.
- The edits (WRT-3, `packages/cli/src/edit/`): one sentence of request is one call. `edits.ts`
  holds the patch every change makes and the opening and side moves; `merge.ts`, `split.ts`,
  `addRoom.ts`, `stretch.ts` and `rename.ts` the room edits; `seat.ts` where openings go when
  walls change (an opening's `anchor`, else its place in the building). The room edits are the
  tools in `src/mcp/editTools.ts` and the verbs of `grid edit` (`src/command/edit.ts`), made
  from the tools' own arguments. `edit/__tests__/requests.test.ts` replays the lab's six flat
  requests (WR-2) against the hand-made versions in `packages/floorplan/fixtures/edits/`.
- The brief (BRF-1, `packages/cli/src/brief/`): what the person asked for, in `<plan>.brief.json`
  beside the plan. `brief.ts` reads and writes it (each wish with a level, a quote and `given` or
  `assumed`; the person's own figures under their heading, an unknown one refused with the known
  ones), `lines.ts` measures each wish against the plan by the same rules as `grid_areas` and
  `grid_measure` and writes it met or missed, never as a score, and `answer.ts` adds the lines to
  every change's answer and the one reminder on a first plan with no brief. `grid_write_brief`
  writes it; `docs/brief.md` is its page.
- Accessibility measurements (CNT-17, `packages/cli/src/quantities/access.ts`, `grid_measure
  what=access`): for the rooms and routes a plan marks (`accessible`, C14), or every room, each
  door's clear width, each corridor's narrowest point, turning space and the steps on the way in,
  from CNT-13's, LVL-3's, LVL-4's and LVL-7's measures. Numbers are set only against the brief's
  figures, said as "your figure", and a code's once `confirmedFigure` (`packages/rules`) gives
  one: a named person checked it. No line says a plan is accessible.
- `grid diff` and `grid mark` (WRT-8, `packages/cli/src/versions/`, tools `grid_diff` and
  `grid_mark_start` in `src/mcp/diffTools.ts`): the plan against a start marker
  (`plan.markers.json` beside it, at most `MARKERS_MAX`) or its last commit, read from the
  project's own `.git` without running git (`git.ts`). The comparison is the core's
  `compareBuildings` (`packages/floorplan/src/geometry/diff/building.ts`), which pairs by place
  first (`place.ts`); the picture is the viewer's `comparisonPicture`.
- The preview (VEW-4): one viewer page, `packages/viewer/src/page/previewPage.ts`, that shows the
  plan in 2D (the viewer's SVG) and 3D (a still through the camera record) and draws only what the
  page's tool, `grid_preview_sync`, gives it. The tool server serves it as an MCP App resource
  (`ui://grid/preview`, `projectResources` in `serveTools.ts`); `grid preview`
  (`packages/cli/src/preview/localServer.ts`) serves it on 127.0.0.1 for hosts that show none.
  Page and agent share one record beside the plan, `<plan>.preview.json` (`src/preview/record.ts`):
  what is shown, the camera, what the person selected, the ids picked out and the room framed. A
  click on the 3D picture is met in the core (`pickInModel`, `geometry/pick.ts`).
- `grid mcp` is the same server under the name agents start it by: `npx -y ongrid mcp` (CMD-9).
  `src/mcp/protocol.ts` answers both eras of the protocol: `initialize` for older clients, and
  for 2026-07-28 clients the version in each request's `_meta` and `server/discover`; a version
  it does not speak is refused with the ones it does. It keeps no state between lines.
- Hosted mode (AIV-19): `grid mcp --http` (`src/mcp/http.ts`, Node's own `http`) serves the same
  tools over MCP Streamable HTTP, stateless. `src/mcp/hostedTools.ts` swaps each tool's path
  arguments for `plan_json` and runs the tool on a `MemoryProject` (`src/fs/memoryProject.ts`, no
  `fs`), so no tool has a hosted form of its own and nothing touches the host's disk. Its words
  are the `hosted.*` keys of the message files. `packages/viewer/src/page/hostedPage.ts` is its
  MCP App page, `ui://grid/plan`. See `docs/tool-server.md`, "Hosted mode".
- `grid sheet` (VEW-7, `src/sheet/`) writes an A3 PDF of the plan: `pages.ts` decides what
  is on each page from existing code (`planAreas`, `floorElevations`, `planFacts`, `checkPlan`),
  `pdf.ts` lays it out, and the pictures come from `drawPlan` and `drawStill`. The sheet never
  draws or measures a part of its own. `coverage.ts` says what it does with each top-level part
  of `FloorPlan`; a part added to the schema fails the type check there until it is placed.
  Its fonts, Source Serif 4 and Source Sans 3 (OFL 1.1), are in `packages/cli/fonts/`.
- Every way Grid is installed comes from one file, `packages/cli/src/distribution/listing.ts`:
  the npm package's manifest, the registry's `server.json`, the plugin folder for Claude Code
  and Codex with its marketplaces, the Cursor link, the set-up lines and the `.mcpb` manifest.
  `npm run pack:local --workspace ongrid` (`pack.mjs`, after a build) writes them all into
  `packages/cli/dist/release/` and publishes nothing; `src/distribution/__tests__/install.e2e.test.ts`
  installs each from the packed tarball, offline, in an empty folder and makes a call. The README's
  install section must match `installText()`: a test checks it. Publishing waits on CMD-8.
- `scoreboard/`: the lab's plans, damage sets and expected figures, and the runner behind
  `npm run scoreboard`. It prints five counts and fails when one is worse than
  `scoreboard/current.json`. Its `README.md` defines the counts. A feature branch does not
  edit `current.json`: it says which counts it moves, from what to what, in its review note.
  The person who merges it runs the scoreboard on `main` after the merge and stores the counts
  (`npm run scoreboard -- --write-current`) in their own commit.
- `docs/`: the documentation, one page per topic: `rooms-first.md`, `commands.md`,
  `tool-server.md`, `plan-file.md`, `tolerances.md` and `result-contract.md`. The root
  `README.md` is the front page: what Grid is, installing and running it, and a table of these
  pages. Agents are their first readers: each page opens with one line on when to read it, and
  its headings stay stable, because the README, other pages and tests point at them.
- A plan file is read one way (MSG-9): `src/fs/textEncoding.ts` turns its bytes into text
  (byte-order mark, UTF-16, strict UTF-8) and `src/command/planText.ts` limits and cleans its
  names, ids and lists before the schema. The tool server's arguments use the same character
  rule. A refusal names the part and the limit, never the text.
- Every file the command or the tool server reads or writes goes through
  `packages/cli/src/fs/projectFiles.ts`, which keeps it inside the project folder. Nothing else
  in `packages/cli` imports `fs`: `src/__tests__/fileAccess.test.ts` fails if it does. It
  writes through Grid's one atomic writer, `packages/rules/src/store/atomicWrite.ts`, which the
  rules store uses too. A path written inside a plan, such as its trace image
  (`referenceImage.path`), is resolved the same way, from the project folder, by `loadPlan`
  (CMD-15). `src/command/__tests__/everyPath.e2e.test.ts` hands every path a command or tool
  takes the lab's T-5 cases and a link out of the project; a new command or tool argument that
  takes a path fails it until its slot is listed there.

## Commands

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run scoreboard
```

Run the type check, the tests and the scoreboard before calling a change done.

## Rules

- Node 22, npm, TypeScript in strict mode.
- English in code, comments and docs.
- Conventional commits.
- A change people will notice, or a change to what a tool answers, writes its own changelog
  fragment, `changes/<ID>.md`: its line for people, its entry for the changelog for agents and
  any new code's row of the contract's code table (`changes/README.md` has the form). It does
  not edit `CHANGELOG.md` or the changelog for agents in `docs/result-contract.md`, so changes
  built at the same time do not conflict there. Versions are cut only by the release step in
  `RELEASING.md` (QAR-10, `scripts/release.mjs`), which writes the fragments into both
  changelogs and deletes them, writes every version, runs the gates and stops before publishing.
- A new convention in the header of `packages/floorplan/src/types/floorplan.ts` (C1, C2 and on)
  takes the number the change's brief gives it. Features built at the same time get theirs from
  whoever coordinates them, never by taking the next free one. A change made alone, whose brief
  names none, takes the next free number. `types/__tests__/conventions.test.ts` fails when two
  conventions share a number.
- Grid is licensed under Apache-2.0. See `LICENSE` and `NOTICE`.
- Every `package.json` has `"license": "Apache-2.0"` and keeps `"private": true` until
  publishing is approved. A test checks both.
- No dependency may be under a GPL, LGPL, AGPL, MPL or EPL licence. `npm run check:licenses`
  checks `package-lock.json`, and CI runs it. It also reads the parts list (`sbom.cdx.json`) a
  ready-built package ships beside its binary, and holds those parts to the same rule. The one
  exception is `ACCEPTED_BUNDLED` in `scripts/check-licenses.mjs`: parts under MPL-2.0 inside a
  permissively licensed package's binary, shipped unchanged and named in `NOTICE` with where
  their source is (today four, inside `@napi-rs/canvas`). The owner accepted them on
  2026-11-22, to be reviewed again before publishing (`RELEASING.md`). Adding a part to that
  list is the owner's decision, never an agent's.
- Never commit secrets, `.env` files, personal data or paths from your own machine.
- A feature documents itself in the `docs/` page for its topic, or in a new page with a row in
  the README's documentation table, and never by appending a section to `README.md`.

## Rules and standards

The checks in `packages/floorplan` are checks on the drawing and cite no document. The checks in
`packages/rules` apply figures from building codes. Keep what is stored here to facts and our
own words.

- A check may state a figure and say where it comes from: the document, its edition and the
  clause number.
- Never copy text from a standard, a code or a regulation into this repository. No sentences,
  tables, definitions or images of them. Describe a rule in your own words.
- Only cite a source you were allowed to read.
- Every figure records its document, edition, clause, where it applies, the day it was read
  and a status. A figure an AI found is `ai-found` until a named person has checked it
  against the document. An AI is never recorded as the one who verified a figure.
- A rule that holds only for some buildings or places runs only there, and says so.
- Do not add collections of rules gathered from a publisher's website.
- Every report keeps the label "General guidance, not your local rules". No message says a
  plan complies or is approved.
- A short quote that a rules lookup collects, with its address, is saved in the user's own
  project. It never belongs in this repository.
- Do not copy code from another project unless its licence allows it. When you do, say where
  it came from and under which licence. Copied code keeps its own licence and copyright
  notice: leave its header in place, and add the notice to `NOTICE` when its licence asks
  for that.
