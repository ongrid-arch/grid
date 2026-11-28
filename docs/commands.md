# Commands

Read this to run Grid from a shell: what each command does, its options and exit codes, and the
folder it reads and writes. `grid` and `ongrid` are the same command. To write a plan, start
with [rooms-first.md](rooms-first.md); an agent calls the same work as tools, in
[tool-server.md](tool-server.md).

- [The commands](#the-commands)
- [Options and exit codes](#options-and-exit-codes)
- [Starting a project: `grid init`](#starting-a-project-grid-init)
- [The reading tools as commands: `grid areas`, `grid find` and the others](#the-reading-tools-as-commands-grid-areas-grid-find-and-the-others)
- [The project folder](#the-project-folder)
- [The report, short or full, and notes seen: `grid check`](#the-report-short-or-full-and-notes-seen-grid-check)
- [Describing a plan: `grid describe`](#describing-a-plan-grid-describe)
- [A plan from a phone room scan: `grid write --scan`](#a-plan-from-a-phone-room-scan-grid-write---scan)
- [What a change did: `grid mark` and `grid diff`](#what-a-change-did-grid-mark-and-grid-diff)
- [Walls that do not meet: `grid tidy`](#walls-that-do-not-meet-grid-tidy)
- [What went wrong, on the drawing: `grid draw`](#what-went-wrong-on-the-drawing-grid-draw)
- [What a drawing shows: `--hide`, `--colour` and `--key`](#what-a-drawing-shows---hide---colour-and---key)
- [Stairs, lifts and the floor above on the drawing](#stairs-lifts-and-the-floor-above-on-the-drawing)
- [The 3D model as a picture: `grid draw --3d`](#the-3d-model-as-a-picture-grid-draw---3d), and a saved view: `--view`
- [A picture of the plan: `grid draw`](#a-picture-of-the-plan-grid-draw)
- [Sections, and the marks on a plan: `grid draw --section` and `--marks`](#sections-and-the-marks-on-a-plan-grid-draw---section-and---marks)
- [A facade: `grid draw --facade`](#a-facade-grid-draw---facade)
- [A site plan: `grid draw --site`](#a-site-plan-grid-draw---site)
- [A sheet for people: `grid sheet`](#a-sheet-for-people-grid-sheet)
- [Who sits where: `grid occupancy`](#who-sits-where-grid-occupancy)
- [The preview in a browser: `grid preview`](#the-preview-in-a-browser-grid-preview)

## The commands

| Command | What it does |
|---|---|
| `grid init [<folder>]` | Starts a project folder: `grid.json`, a starter `plan.json` and `exports/` (see below) |
| `grid write <plan.rooms> \| --layout tidy\|sizes [--plan <plan.json>] [--replace] [--dry-run] [--json]` | Writes a plan from rooms text, the main way to write one: Grid works out the walls (see [Writing a plan rooms first](rooms-first.md)). `--dry-run` tries the rooms text and answers as the write would, writing nothing (CMD-54). With a brief beside the plan, it says each line met or missed ([the brief](brief.md)). `--layout`, in place of the rooms file, writes a first layout from the brief, in a rectangle (`tidy`) or keeping every size (`sizes`), with each size not kept and by how much ([A first layout from the brief](brief.md#a-first-layout-from-the-brief)) |
| `grid write --scan <scan.json> [--plan <plan.json>] [--replace] [--json]` | Writes a plan from a phone room scan, and keeps the scan beside it as `<plan>.scan.json` (see below) |
| `grid check [<plan>] [--floor <id>] [--country <place>] [--full] [--json] [--seen <n> --reason <text> --by <name> \| --unseen <n>]` | Prints the report, short and about this plan unless `--full`. Every report is labelled "General guidance, not your local rules". `--country` names the place for this check, in place of the plan's `site.country`. `--seen` sets a note aside as seen (see below). With `firm-standards.json` beside the plan, the firm's own standards are set against it too, under their own heading ([a firm's own standards](firm-standards.md)) |
| `grid describe [<plan>] [--length line\|rooms\|walls\|walk] [--for person\|agent] [--as rooms] [--floor <id>] [--pictures <folder>]` | Describes the plan in a few lines: its rooms, which rooms each opening joins, with `--length walls` its walls, and with `--length walk` the plan walked room by room, with `--pictures` a picture from each doorway (see below). `--as rooms` reads it back as rooms text, each room's number and facts on its line (WRT-74) |
| `grid draw [<plan>] [--png \| --3d \| --view <name>] [--facade <side>] [--look <name>] [--hide <parts>] [--colour use\|finish] [--key] [--marks <marks>] [--section <x1,y1:x2,y2> [--toward left\|right]] [--site \| --with-site] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`, or a saved view with `--view`, or one side of the building in elevation with `--facade north` (`east`, `south`, `west`), or with `--section` a section along a line through every floor, or with `--site` the site plan, and with `--with-site` the site faint under a floor ([below](#a-site-plan-grid-draw---site)); to standard output unless `--out` names a file. In the technical look (black on white, lines in millimetres on paper) unless `--look working`; a file is always on light paper, so `--look dark` is refused ([below](#how-each-look-draws-a-plan)). `--hide`, `--colour` and `--key` choose what it shows, `--marks` adds level, elevation, section and schedule marks to a plan (see below) |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj\|geojson\|json\|csv\|xlsx [--what <table>] [--csv <table>] [--units <unit>] [--decimal point\|comma] [--floor <id>\|<name>\|all] [--scale <n>] [--no-roofs] [--arc-segments <n>] [--doors closed\|open\|gaps\|markers] [--walls whole\|rooms] [--date <date>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file. `--floor all` writes one file per floor; `--scale` (DXF) sets its sheets' scale ([every floor in one DXF](#every-floor-in-one-dxf-at-a-scale-that-fits-vew-72)). A GLB or OBJ leaves its roofs out with `--no-roofs` and writes a whole circle of curved wall with `--arc-segments` pieces; an OBJ comes with `grid.mtl` beside it ([3D files](3d-files.md)). A GLB writes its doors shut on their hinges, open, as gaps or as markers with `--doors`, and its straight walls in a piece per room with `--walls rooms` ([for a game engine or a renderer](3d-files.md#for-a-game-engine-or-a-renderer)). A GeoJSON or JSON holds the plan's geometry as data, every floor in one frame ([the plan as data](plan-data.md)). A CSV or XLSX holds one of the plan's tables, `--what` (or `--csv <table>`), for a spreadsheet ([a table for a spreadsheet](#a-table-for-a-spreadsheet-csv-and-xlsx-vew-83)). An IFC is stamped with `--date` (`2026-01-31` or a time), else `SOURCE_DATE_EPOCH` (seconds), else now: name either and two runs write the same bytes |
| `grid sheet [<plan>] [--layout client\|check] [--sheet <sheet.json>] [--out <file.pdf>]` | Writes the plan as an A3 PDF for people: `--layout client`, with the words of `sheet.json`, or `--layout check`, with ids and findings (see below) |
| `grid sheet [<plan>] --scale 1:N --paper A4\|A3\|A2\|A1\|A0 [--floor <id>] [--split] [--room-sizes on\|off] [--out <file.pdf>]` | Writes every floor (or one) at one true scale as a vector PDF of a page each, and an SVG and a PNG of each page, with a scale bar, caption, north and title block (`--layout drawing`, see below) |
| `grid areas`, `grid schedule`, `grid takeoff`, `grid measure <what>`, `grid count`, `grid find`, `grid fields`, `grid compare <plan> <plan>...`, `grid brief` | Each runs the reading tool of that name (`grid brief` is `grid_write_brief` reading the brief, never writing it) with the tool's own arguments as options, and prints its text; `--json` prints exactly its structured answer, `--csv` a table where there is one, and `--fail-on` exits 3 when the answer holds a condition, for CI (see [below](#the-reading-tools-as-commands-grid-areas-grid-find-and-the-others)) |
| `grid edit <verb> [<plan>] [options]` | Changes the plan, one sentence of request a command: `opening`, `wall` (one wall's thickness), `type` (one named wall, door or window type, which every part of it takes; a list option such as `--parts` takes its items split at commas), `move-side`, `merge`, `split`, `add-room`, `stretch`, `rename`, `mirror` (`--how left-right`, or `--turn 90` to turn the plan a quarter, counter-clockwise as Grid draws it), `square` (squares a scanned plan and says how far each wall moved), `place` (a fixture, furniture or a typical room from the library by name, [library.md](library.md)), `add-opening` (a door, window or doorless opening in a side of a room or the wall between two rooms), `phase` (walls, doors, windows and rooms marked existing, demolished or new), `start-works` (the plan as it stands marked existing), `phase-from` (one plan with phases from `--before` and `--after`), `trace` (the trace image under the plan set, placed, scaled and turned) and `fit-out` (a fit-out started on `--base`, the base's rooms as its own), each the tool of that name in [the tool server](tool-server.md) with the same options (`grid edit <verb> --help`), and the same lines of [the brief](brief.md) |
| `grid mark [<name>] [<plan.json>] [--plan <plan.json>] [--remove] [--who <name>] [--note <text>]` | Keeps the plan as it is now under a name, `start` unless named, in `plan.markers.json` beside it, for `grid diff` to compare with: no git needed. The latest 20, the oldest rolling off (see below) |
| `grid diff [<plan>] [--since <version>] [--to <version>] [--rooms <ids>] [--show all\|summary\|changes\|issues\|facts\|history] [--picture\|--out <file.png>] [--floor <id>] [--json]` | Says what changed since a marker or the last commit, by what stands where, not by ids: issues first, then the verdict room by room, then each change (see below) |
| `grid occupancy [<plan>]` | Lists who sits where, by room, from the occupancy file beside the plan; no export carries it (see below) |
| `grid preview [<plan>] [--port <n>]` | Serves the preview as a page on this computer only: the plan in 2D and 3D, the part you click shared with the agent, the room it frames and the parts it picks out; it draws again within 2 s of the plan changing (see below) |
| `grid serve` | Starts the tool server on standard input and output, with the 69 tools in [the tool server](tool-server.md); `--tools view,areas,write,edit` lists only the groups named, with `grid_project` and `grid_help` ([tool groups](tool-server.md#a-short-tool-list-grid_help-and-tool-groups)) |
| `grid mcp` | The same as `grid serve`, under the name agents start it by (`npx -y ongrid mcp`), with the same `--tools` |

A plan is told by what it holds: a list of walls, rooms or openings, or the stamp Grid writes. `grid write` never
writes a plan into `grid.json`, into a file Grid keeps beside a plan (`<plan>.markers.json`, `.seen.json`,
`.brief.json`, `.preview.json`, `.scan.json`) or into a JSON file that holds none of those, and `--replace` does not
change that; every command that reads a plan refuses such a file in one line.

A DXF, DWG, IFC, PDF, PNG or JPEG file handed over as a plan (CMD-20) is known by its first bytes, whatever its name
or ending, and refused in one line that says what it is, that Grid does not read it yet, and what to do: write the
rooms as rooms text and run `grid write`, or, for a picture, lay it under a plan as its trace (`referenceImage`, see
[the plan file](plan-file.md)). Grid writes DXF and IFC (`grid export`) but does not read them back.

## Options and exit codes

Every command also takes `--project <folder>` (see below). An unknown, repeated or
meaningless option is refused by name. The command exits 0 when it did its work, 1 when the
plan or a path was refused or a file could not be written, 2 when the command line was
refused, and 3 when the answer holds the condition `--fail-on` named. A refusal is one line on
standard error. Findings in a report are not a refusal: `grid check` still exits 0, unless it is
given `--fail-on problems` (a problem to act on) or `--fail-on notes` (a note not set aside as
seen), when it exits 3 after printing the report.

## The reading tools as commands: `grid areas`, `grid find` and the others

Each of these commands runs one reading tool of [the tool server](tool-server.md), the way the
server runs it, so a shell, a script or CI gets the answer an agent gets:

| Command | Tool | `--csv` | `--fail-on` |
|---|---|---|---|
| `grid areas` | `grid_areas` | the tool's CSV | `unproven`: a figure is not proven from the drawing |
| `grid schedule` | `grid_schedule` | the tool's CSV | `found` or `none`: the schedule has a row, or none |
| `grid takeoff` | `grid_takeoff` | the tool's CSV | `assumed`: a line of the bill is assumed (with `--for`) |
| `grid measure <what>` | `grid_measure` | | `short`: for `fit`, `narrow`, `route` and `use`, the answer falls short |
| `grid count` | `grid_count` | the groups | `found` or `none`: a part is counted, or none |
| `grid find` | `grid_find` | the rows | `found` or `none`: a part is found, or none |
| `grid fields` | `grid_fields` | | |
| `grid compare <plan> <plan>...` | `grid_compare` | | `differs`: a plan is not the same building as the first |
| `grid brief` | `grid_write_brief`, reading only | | `missed` or `open`: a line of the brief is missed, or open |

- A command's options are its tool's arguments, with dashes for underscores (`--narrower-than`
  for `narrower_than`), and a list option takes its items split at commas (`--kind door,window`).
  `grid <command> --help` lists them with the tool's own words. The plan is the one file named,
  or the project's `plan.json`; `grid compare` takes 2 to 6 plan files, and `grid measure` what
  to measure as its first word (or `--what`).
- Without options of its own a command prints the tool's text. `--json` prints exactly the
  tool's structured answer, the record the server sends as `structuredContent`, with the label
  and the plan's revision, and never shortened. `--csv` is the same as `--format csv` where the
  tool writes CSV; for `find` and `count` it writes the rows or the groups. Every CSV has its
  header on line 1 and the label in its last row (VEW-83).
- `--fail-on` prints the answer and then exits 3 when it holds, so a build can stop on it:
  `grid find --kind door --where "width < 0.8" --fail-on found`. A condition the command does not
  take, or one that means nothing for the call, is refused before anything runs.
- A refusal of the tool is exit 1, in one line, with its arguments spelt as options.

## Starting a project: `grid init`

```bash
npx --no grid init demo
cd demo
npx --no grid check
npx --no grid export --format dxf
```

`grid init demo` makes the folder `demo` (the folder above it must exist) and writes:

| Path | What it is |
|---|---|
| `grid.json` | Marks the folder as a Grid project, and holds the project's id |
| `plan.json` | A starter plan: a two-room flat with its room uses and door swings stated, to change. It stores the same project id |
| `exports/` | Where `grid export` writes |
| `.gitignore` | The line `exports/`, added when it isn't there |

With no folder, `grid init` starts the project in the folder it runs in. A folder is a Grid
project when it holds `grid.json`. In a Grid project (the folder Grid runs in, or the one
named with `--project`), `check`, `describe`, `draw`, `export` and `sheet` read `plan.json` when no
plan file is named, and `export` writes into `exports/`. A plan file named on the command line is used
instead. With no `grid.json` the same holds (CMD-18): the folder's own `plan.json` is the plan, for reading
and for writing, in the commands and in the tool server. When it is not there, the refusal says which
folder and file Grid looked in and what to do, and `grid_project` lists what the folder holds.

`grid init` never replaces a file. It refuses, changing nothing, a folder that already
holds `grid.json` (a second `grid init`) or `plan.json`, or a file named `exports`. Any
other folder is fine, empty or not: `grid init` only adds its own files.

The rules store (`@ongrid/rules/store`) keeps a project's build location and rules sheet on
this computer, outside the project folder, so a copy of the project never carries them. It
names them by the id in `grid.json`.

## The project folder

Grid reads and writes files only inside one folder, the project folder:

- the folder named with `--project <folder>`, or else the folder Grid runs in;
- never the top of a disk (`/`, `C:\`) or the home folder, where "inside" would mean almost
  anywhere. Run Grid in the folder that holds the plan, or name that folder with `--project`.

A relative path on the command line starts from the folder Grid runs in, as in any shell. A
path given to a tool of `grid serve` starts from the project folder, since a host may start
the server anywhere. `grid serve` started at the top of a disk or in the home folder still
runs, and each tool answers that it needs `--project`.

Symbolic links are followed, for the file and every folder above it, and the real path must
be inside the real project folder. Refused, with a message naming the path and the project
folder:

- a path outside the project, by `..`, as an absolute path or through a link;
- web addresses and other schemes (`https:`, `file:`, `data:`, `javascript:` ...);
- network and device paths (`\\server\share`, `\\?\C:\`);
- names Windows keeps for devices, with or without an extension (`CON`, `NUL`, `AUX`, `PRN`,
  `COM1` to `COM9`, `LPT1` to `LPT9`), hidden data streams (`plan.json:stream`), names
  ending in a dot or a space, and control, direction-override or invisible characters (a
  zero-width space, a word joiner, a soft hyphen).

These hold on every system, so a path in a plan means the same wherever the plan goes; `\`
and `/` both separate folders. Grid creates no folder on the way, except `exports/` and the
one folder `grid init` is asked to make.

A file Grid writes gets the mode your umask gives, as a file you make yourself would (`0644`
under the usual `022`), so a teammate in the same group or a web server can read the plan and
its exports. A file Grid replaces keeps the mode it had. A file you made read-only (`chmod 444`,
or the read-only attribute on Windows) is refused, and left as it is: `Can't write "plan.json":
it is read-only, so Grid leaves it as it is`. The rules store, kept outside the project on this
computer, stays readable by you only (CMD-30).

An export's file name comes from the plan file's name, never from text inside the plan.
Grid sanitises it rather than refusing it, and says so on standard error: a name Windows
keeps for a device gets `plan-` in front (`plan-con.dxf`); a name longer than five words or
40 characters, or one that reads as a claim about the plan or an instruction, becomes
`floor-plan`; one floor of several is named after the floor, its name or else its id, made safe
by the same rules (`house-first-floor.dxf`), and by its place in the plan (`house-floor-2.dxf`)
when nothing usable is left of it; a file of the whole building is named by the plan alone
(`house.glb`, `house.dxf`).

Every export writes the plan's walls, rooms and openings in id order (`w2` before `w10`), so the
same building gives the same bytes whatever order its file lists them in, and two exports can be
compared line by line. The IFC gives each element an identity made from the plan's `projectId`
with the element's kind, floor and id, so a re-export is recognised as the same model whatever
the plan file is called; keep those ids stable. A plan with no `projectId` falls back to the
plan file's name.

### What an export leaves out (HND-6)

An export holds what the views draw, and leaves out the parts validation says cannot be drawn:
a zero-length wall, the rooms and openings that rest on it, an opening on a wall whose id is
used on several floors. It leaves out the parts the reader left out too (MSG-6): an id used
twice, a value a part cannot do without. Each file says so, and so does the command:

- On standard error, one line: how many parts, of which kinds, the first few by id (or by their
  place in the file, `openings[4]`, when the reader could not read the id), and that
  `grid check` says why.
- In the file, only when something was left out, so the file of a sound plan is as it was:
  - IFC: the property set `Grid_LeftOut` on the building, with `Parts` (how many), `Note` (in
    words), and for each kind a count and its ids (`Openings`, `OpeningIds`, `Rooms`, `RoomIds`,
    `Walls`, `WallIds`, `Fixtures`, `FixtureIds`, `Floors`, `FloorIds`).
  - DXF: the layer `GRID-LEFT-OUT`, with the same note as text under the drawing: a line that
    says how many, then a line or more per kind with the ids.
  - OBJ: the same note as comment lines after the header.
  - GLB: `asset.extras.gridLeftOut`, with `count`, `note` and `parts` (each part as the tool
    server's receipt gives it).
- An id that several parts share is named once, with how many (`"bath" 4 times`).
- The site's things (CMD-56) are named apart, since nothing is wrong with them: the IFC and the
  OBJ write none of them, and a GLB of one floor none, so a file of the floor the site is drawn
  on names each as a site thing left out (`SiteThings` and `SiteThingIds` in `Grid_LeftOut`), and
  says that a DXF draws them, and so does a GLB of the whole building.

A curved wall (CNT-18) is in every export, but not every format writes an arc. The DXF writes a
curved wall's faces as true arcs (a polyline with bulges) and a curved dividing line as an `ARC`
or a `CIRCLE`; the IFC writes its `Axis` as a true arc (an `IfcTrimmedCurve` on an `IfcCircle`).
Everything else that follows a curve is written as straight pieces that follow it, at most
`arcSagitta` (1 mm) off it on a curve of ordinary size: the room outlines along a curved wall in
every format, a curved wall's body in the IFC, and its faces in the OBJ and the GLB, which hold
only triangles. The command says so on standard error, one line naming the walls and rooms, and
the file says so beside what it leaves out, with how far off the pieces are at most: the property
set `Grid_Approximated` in an IFC, the `GRID-LEFT-OUT` layer in a DXF, comment lines in an OBJ and
`asset.extras.gridApproximated` in a GLB. A plan with no curved wall gets none of it.

A DXF, an OBJ and a GLB of one floor (`--floor` names one) name what is left out of that floor, every opening no floor holds, and every part the reader left out, which Grid
cannot place on a floor. The IFC, and a DXF, OBJ or GLB of the whole building, name what is left
out of every floor; a DXF of every floor names each floor's under that floor.

### A table for a spreadsheet: CSV and XLSX (VEW-83)

`grid export --format csv --what <table>` (or `grid export --csv <table>`) and `--format xlsx
--what <table>` write one of the plan's tables as a file a spreadsheet, a script or a supplier
opens as it is. `grid_export` takes the same as `format`, `what`, `units` and `decimal`.

| `what` | The table, as the reading tool gives it with `format=csv` |
| --- | --- |
| `estimate` | The bill of quantities, `grid_takeoff for=estimate`, priced from `rates.json` beside the plan when there is one |
| `takeoff` | The take-off by room, `grid_takeoff` |
| `areas` | The area table, `grid_areas` |
| `doors`, `windows` | The door or window schedule by type, `grid_schedule of=doors` or `of=windows` |
| `rooms` | The room schedule, `grid_schedule of=rooms` |
| `finishes` | The finishes plan, `grid_schedule of=finishes` |

- The file is the reading tool's own table, so it never differs from it; nothing is measured
  again. Its name is `<plan>-<what>.csv` (`house-areas.csv`, `house-first-floor-rooms.xlsx` for
  one floor) in `exports/`, replacing an earlier copy: name another file with `--out`
  (`exports/areas-rev-b.csv`) to keep a revision. `--floor` takes one floor; `all` is refused.
- The header is line 1 and the label, "General guidance, not your local rules", the last row,
  so a spreadsheet and `pandas.read_csv` take the header as the header.
- A decimal comma (`--decimal comma`, else the plan's display, else its language's) splits the
  fields with semicolons and writes numbers with a comma, as a spreadsheet set to a decimal comma
  opens them; a point splits with commas. Lengths are in `--units` (named in the column heads),
  areas in square metres and square feet.
- A CSV starts with a UTF-8 byte-order mark, so a spreadsheet reads accents and m² right; read it
  in Python with `encoding="utf-8-sig"`, which pandas does by itself.
- An XLSX is one sheet named after the table: the header bold and frozen, numbers as numbers, text
  as text cells, which a spreadsheet never runs as a formula. A CSV keeps the quote mark in front
  of a text that would read as one.
- An estimate's amounts and its total are rounded to the currency's smallest unit (two decimals
  for EUR, none for JPY, two for a code Grid does not know); a rate is as given.
- `grid_export`'s answer holds the CSV text as `csv`, with `what`, `columns`, `rows` and
  `separator`, so a host that shows the agent only the structured answer still hands it the
  table. The reading tools' `format=csv` answers carry the same text as `csv` in their data.

### Every floor in one DXF, at a scale that fits (VEW-72)

With no `--floor`, a DXF holds every floor too. In model space the floors stand side by side,
lowest on the left: the first where the plan places it, each next one moved along X by a whole
number of 10 m past the one before, with its title saying how far (`Floor "First", drawn 20 m along
X from where the plan places it`), so a drafter can move it back onto the others. Each floor has a
paper layout of its own, named after the floor (its name, else its id), whose viewport shows that
floor. `--floor <id>` or `--floor <name>` writes that floor alone, on one layout, `Sheet`, as
before; `--floor all` writes one file per floor into `exports/`, each named after its floor, and
names any floor that holds nothing, for which no file is written. `--floor all` takes no `--out`.

Every sheet is A3 across, at one scale for the file: `--scale` (`200` or `1:200`), else the scale
the project's `dxf-layers.json` states, else the largest of 1:100, 1:200, 1:500 and 1:1000 at
which every floor, its dimensions, label and notes fit the viewport. Grid starts at 1:100, its
sheet's usual scale; 1:50 is drawn when stated. Text and dashes are sized for the scale used. A
floor that does not fit at the scale used is drawn at it all the same, round its middle, and its
sheet and the command say so with the scale it fits at (`The plan does not fit on A3 at 1:100:
the sheet shows the middle of it. It fits at 1:500.`). The command says the scale on standard
error unless it is 1:100, not stated, with every floor on its sheet.

### Every floor in one 3D file (VEW-64)

With no `--floor`, a GLB or an OBJ holds the whole building, as the 3D view stacks it: every floor
with its walls, rooms, openings, stairs, slab, roof and parapet, each floor at its elevation (its
floor level above the ground floor's, the same levels the 3D view and the IFC use).

- GLB: one root node, `building`, with one child node per floor, lowest first, named by the
  floor's id and moved up to its elevation (`translation` `[0, elevation, 0]`), its parts below it,
  and `extras.gridFloor` and `extras.gridElevation` on it. A plan at survey coordinates keeps its
  site offset on the root node (HND-11).
- OBJ: OBJ has no nodes, so every point is written at its height in the building (Z), and each
  floor's objects follow a comment line `# grid-floor "<id>" elevation=<metres>`. No `g` lines.
- `--floor <id>` writes that floor alone, still at its elevation: in a GLB its node is the root and
  carries the elevation (and the site offset), in an OBJ the points do. Files of single floors
  dropped into one scene land where they belong.

For a plan of several floors the command says on standard error, in one line, which floors the
file holds and at what height, and how many of the plan's floors it does not hold, so a file of
one floor never reads as the whole building. A DXF says the same of its one floor.

The views validate each floor on its own, so a wall id written on two floors is drawn and
exported on each, while `grid check`, which validates the whole plan, says the id is used twice
(`plan/duplicate-id`). The export names what its file leaves out, not every line `grid check`
gives.

An export that would hold nothing of the plan (no wall, room or fixture that can be drawn, on
the floor asked for) is refused with exit code 1, and no file is written: `Nothing to export:
plan.json has no wall, room or fixture that can be drawn.` It names what is left out, when
anything is.

### What the DXF holds (HND-1)

The DXF is written for a drafter to go on working in: in metres, in layers an office can name and
pen its own way, one floor or every floor ([above](#every-floor-in-one-dxf-at-a-scale-that-fits-vew-72)).

- **Version and units.** AutoCAD 2013's DXF (`AC1027`), whose text is UTF-8, so a room called
  "Baño" or "寝室" is stored as it is written and every reader shows it so. `$INSUNITS` is 6
  (metres) and `$MEASUREMENT` metric; the plan's own axes, 1:1, +Y up. A backslash, a caret and
  `%%` in a name are written so that a CAD program does not read them as codes.
- **Walls** are closed outlines, one per solid piece between openings, with their corners joined
  as the drawing joins them, on `GRID-WALLS-EXTERIOR` or `GRID-WALLS-INTERIOR`. Each wall is
  filled by a solid hatch on `GRID-WALLS-FILL`. A dividing line is one dashed line on
  `GRID-WALLS-VIRTUAL`. In a plan with phases (CNT-10) each wall goes on its phase's layer
  instead: `GRID-WALLS-EXISTING`, `GRID-WALLS-NEW` (filled on `GRID-WALLS-FILL-NEW`) or
  `GRID-WALLS-DEMOLISHED` (dashed, unfilled), and each opening to be demolished is its dashed
  outline on `GRID-OPENINGS-DEMOLISHED`
  ([existing, demolished and new](plan-file.md#existing-demolished-and-new)).
- **Doors, windows and doorless openings are blocks**, one per schedule type (VEW-72: its kind,
  width and height, or the plan's named type) in one wall thickness, named by width by height and
  the wall's thickness in millimetres (`GRID-WINDOW-1200x1500-W200`; a named type adds its id,
  `GRID-DOOR-OAK-900x2100-W200`), inserted on `GRID-DOORS`, `GRID-WINDOWS` or `GRID-OPENINGS` and
  turned along their wall, so they can be counted and swapped: two windows of one width and two
  heights are two blocks. Each insert carries the attributes `MARK` (shown by the opening: its
  mark in the schedules, `D1`, `W1`, the same the IFC writes as the door's or window's Tag),
  `TYPE` (the schedule type, `window:1.2x1.5`), `WIDTH`, `HEIGHT` and `SILL` (metres, kept in the
  file, not drawn). A block is drawn along +X from its insertion point. A door that states its
  hinge and swing has a block per hand, named in Grid's one convention, the side its hinges are on
  seen from the side it opens toward: `-RH` or `-LH`, as the schedule says it ("hinged on the
  right") and the IFC door style's name ("single swing, right hand"; IFC's own operation type
  names the side looking the way the door opens, so a right-hand door is `SINGLE_SWING_LEFT`
  there). A door hung from its other jamb is the same block turned half round. Its leaf and swing
  are on `GRID-DOOR-SWINGS` inside the block. A door that states neither has a block of its own
  with no swing (`GRID-DOOR-900x2100-W200`).
- **A door or window of a kind** ([kinds of door and window](plan-file.md#kinds-of-door-and-window-their-handing-and-the-part-that-opens))
  other than one leaf, or one that states the part that opens, is drawn by its kind's symbol, one
  block per symbol, named with its kind, the part that opens and a garage door's height
  (`GRID-DOOR-SLIDING-2400x2100-W200`, `GRID-DOOR-SINGLE-1200x2100-W200-RH-P800`, `GRID-WINDOW-HIGH-LEVEL-1200x600-W200`).
  A door's leaves and swings are on `GRID-DOOR-SWINGS`, its fixed panel and a window's faces and
  glass on the insert's layer, and what the symbol shows above the cut or hidden in the wall (a
  pocket, a roll, a garage door open overhead, a high-level window) dashed on
  `GRID-OPENINGS-ABOVE`.
- **A fixture hung above the cut** (CNT-55: a wall unit, a hood, an item whose `elevation` is 1 m
  or more) is inserted on `GRID-FIXTURES-ABOVE`, dashed, and a commercial kitchen's piece (a
  range, a fryer, a prep table, a dishwasher, a hood) has its label written at its middle.
- **Dimensions** are dimension entities on `GRID-DIMENSIONS`, in the style `GRID` (ticks, metres
  to two places): the chains outside the plan and the room sizes inside it that the drawing
  shows ([the sizes on a drawing](#the-sizes-on-a-drawing)); a curve's radius is a radial
  dimension, its centre and a point on the curve, written `R 6.00`, and its chord an aligned one.
- **The site** (CMD-56), once, on the first floor of the file the site is drawn on (the ground
  floor), under everything else: the plot's boundary, closed, on `GRID-SITE-BOUNDARY`; each
  set-back line at the person's own figure on `GRID-SITE-SETBACKS`, dashed; paving and a path's
  strip as closed outlines on `GRID-SITE-PAVING` and `GRID-SITE-PATHS`; fences and gates as their
  lines on `GRID-SITE-FENCES`; a pool's edge on `GRID-SITE-POOLS`; and a tree as its trunk (as
  wide as the 3D views draw it, `treeDrawnTrunk`) and the circle of its canopy on
  `GRID-SITE-TREES`.
- **Massing** (CMD-56). A floor that states an outline and has no walls
  ([a floor outline before the walls](plan-file.md#a-floor-outline-before-the-walls)) is its
  outline, a closed polyline on `GRID-MASSING`, at the floor's level above the ground floor's (its
  elevation) and as thick as its storey is high, so a CAD program that shows thickness draws it as
  a block. A plan of massing alone exports.
- **Room tags.** Each room gets the block `GRID-ROOM-TAG` on `GRID-ROOM-TAGS`, with the attributes
  `NUMBER` (the number the room states, else Grid's count, as in the schedule), `NAME` and `AREA`
  (the net area, `12.40 m²`).
- **A sheet.** Besides the model, the layout `Sheet` (a layout per floor in a file of every floor)
  is an A3 sheet across, in millimetres, with a border, one viewport (on `GRID-VIEWPORT`, which
  does not plot) showing the plan at the scale chosen above, and the scale and the label under it. Text
  and dimensions are sized for that scale: names 2.5 mm, other text 2 mm on paper.
- **Also on their own layers**, as before: the fixtures (`GRID-FIXTURES`), the sketch
  (`GRID-SKETCH-` and the category), the notes (`GRID-NOTES`), the facts (`GRID-FACTS`), what the
  file leaves out (`GRID-LEFT-OUT`, under the dimensions) and the label, "General guidance, not
  your local rules", above the dimensions (`GRID-LABELS`). A layer is listed only when something
  is drawn on it. Stairs, lifts, steps and the floor above are not in the DXF yet.

#### An office's own layers and pens: `dxf-layers.json`

With no profile the DXF uses Grid's own: the `GRID-` layers above, every line in the drawing's
foreground colour (7, the fill in 8), line weights from 0.13 mm to 0.5 mm, and the largest
standard scale the plan fits at (VEW-72), 1:100 for most plans.
An office that wants its own writes them once in `dxf-layers.json` in the project folder, beside
`grid.json`; `grid export` and `grid_export` read it for every DXF and say so (`Layers and pens
from dxf-layers.json.`). A category the file leaves out keeps Grid's pen:

```json
{
  "scale": 50,
  "layers": {
    "walls-outside": { "layer": "WALLS-OUT", "colour": 7, "lineweight": 0.5 },
    "doors": { "layer": "DOORS", "colour": 3, "lineweight": 0.25, "linetype": "continuous" },
    "dividing-lines": { "linetype": "dash-dot" }
  }
}
```

- `scale`: a whole number from 1 to 1000; 50 is 1:50. It sets the sheet's viewport and every text
  and dimension size, and the length of the dashes. Left out, the largest standard scale the plan
  fits at (VEW-72); `--scale` wins over it.
- The categories: `walls-outside`, `walls-inside`, `dividing-lines`, `wall-fill`, `rooms`,
  `room-tags`, `doors`, `door-swings`, `windows`, `openings`, `openings-above`, `fixtures`,
  `fixtures-above` (CNT-55: an item hung above the cut, dashed), `site-boundary`, `setbacks`,
  `paving`, `paths`, `fences`, `pools`, `trees`, `massing` (CMD-56), `dimensions`, `notes`,
  `sketch` (a prefix: each category goes on it, a dash and its name), `facts`, `left-out`,
  `label`, `sheet` and `viewport`.
- Each takes `layer` (1 to 255 characters, none of `< > / \ " : ; ? * | = ,` or a backtick),
  `colour` (a drawing colour number, 1 to 255), `lineweight` (in millimetres, one of those the
  format holds: 0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7,
  0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2 or 2.11) and `linetype` (`continuous`, `dashed`, `dotted`
  or `dash-dot`).
- Two categories may share a layer only with the same pen.

A profile that is there and wrong refuses the export with exit code 1, naming every part that is
wrong and never repeating what it holds, and no file is written: `dxf-layers.json in the project
folder is not a profile Grid can use: layers.doors.colour must be a whole number from 1 to 255
…`. It is read as every file is, inside the project: one reached through a link out of it is
refused.

### What the IFC holds (HND-2)

The IFC is written so that a BIM program can schedule and take off from it. Everything in it is
something the plan already says, put in the field IFC has for it; where the plan says nothing,
the file says that too.

- **The site and its buildings** (CMD-56). The `IfcSite` carries the plot's boundary, when the
  plan states one that does not cross itself, as its footprint: a closed polyline in a
  `FootPrint` view. Each building the plan names is an `IfcBuilding` of its own, with its own
  storeys (LVL-23). A massing floor, an outline with no walls, is an `IfcBuildingElementProxy` on
  its storey, its `ObjectType` `Massing` and its `Tag` the floor's id: the outline swept up the
  storey's height, with `GrossFootprintArea`, `Height` and `GrossVolume` in its `BaseQuantities`.
  The site's things (fences, paths, paving, trees, pools) are not written: the file names them as
  left out ([what an export leaves out](#what-an-export-leaves-out-hnd-6)).
- **Rooms.** Each room is a space whose name is its number and whose long name is the room's
  name. Numbers are the room schedule's (`grid_schedule`): the number a room states in the plan
  (`number`, CNT-9), else Grid's count: floors by level, then by id, on each floor the rooms that
  state a number first, by it, then the others by id, 1, 2, 3… across the floors. The use, when
  the plan states one, is the space's object type and `Category` in `Pset_SpaceCommon`, whose
  `Reference` is the number. Grid's own set
  `Grid_Space` holds `Id`, `Number` (text when the room states it, else Grid's count), `Use`
  (`not said` when the plan states none), `Area`, and
  `AreaMeasure` and `AreaRule`, which name the measure and its rule: the net area as
  `grid_areas` measures it.
- **Finishes** (CMD-55). A room's finishes are in `Pset_SpaceCommon` as `FloorCovering`,
  `WallCovering`, `CeilingCovering` and `SkirtingBoard`, and all of them in Grid's own set
  `Grid_Finishes`: `Floor`, `Walls`, `Ceiling`, `Skirting` (or `NoSkirting`), `Wall <wall id>`
  for a wall's face finished on its own, and `Band <n> Finish`, `Height`, `From`, `Wall` and
  `Behind` for each band. A ceiling covering is associated with its finish as its material. A
  glazed wall and a glazed door's leaves are styled as glass, as a window's glass is.
- **Another tool's identity** (CNT-59). A wall, door, window, opening, space or storey whose
  part keeps an `identity` is written with its GlobalId, Name and Tag in place of Grid's own
  ([what another tool calls a part](plan-file.md#what-another-tool-calls-a-part)).
- **Base quantities**, as `Qto_…BaseQuantities` sets:
  - spaces: height, perimeter, footprint (`GrossFloorArea`), net area (`NetFloorArea`), volume;
  - walls: length on the axis, thickness, height, footprint with corners joined, side area and
    volume, gross and less every opening in the wall;
  - slabs, roof slabs and stair landings: thickness, perimeter, area and volume, and for a slab
    a stair, lift shaft or void opens, its net area and volume too (IFC2x3 has no roof set: the
    roof's slab carries it);
  - doors and windows: width, height and area of the hole in the wall; a doorless opening the
    same, with its depth; an opening in a slab its depth and area;
  - ceilings (`Qto_CoveringBaseQuantities`): their area; parapets: height, footprint and volume.
  - under a roof the floor states (LVL-6), each is measured as written, cut to the roof: a wall's
    and a space's height is its highest point, and their side area and volume are under the
    slope; a sloped roof slab's area is on the slope, its thickness measured upright, and with
    rooflights its net area and volume are the roof less them.
- **Slabs.** They are the ones the 3D view draws ([Slabs, roofs, ceilings and the
  ground](plan-file.md#slabs-roofs-ceilings-and-the-ground)): one per floor over its outline, a
  piece of its own under a room set above or below its storey, and a flat roof over every part
  with nothing above. The plan states no slab or roof outline, so each is Grid's and says so in
  `Grid_Slab`: `Assumed`, `ThicknessStated` (whether the floor states its slab's thickness) and
  a `Note` on what Grid took. A roof the floor states is still laid out by Grid (its outline, its eaves on the
  outside walls' lines, its thickness), so it is `Assumed` too, and its `Note` says which parts
  are the plan's.
- **Walls** are typed by the kind the plan states and their thickness (`Exterior wall 0.3 m`),
  the same grouping the estimate prices (`wall:exterior:0.3` is the type's tag). Each type
  carries a one-layer material set; its walls carry the set's usage. The plan holds no build-up,
  and the type's description says so. A wall of one of the plan's named types (CNT-15,
  [named types](plan-file.md#named-wall-door-and-window-types-and-finishes)) is typed by it: the
  type's name, tagged `wall-type:<id>:<thickness>`, its element type `Interior wall, glazed` when
  the type is glazed, and its layer's material the type's own. A layer whose material the plan
  does not state is of one material named `Not stated` (lab AU3-4), never a word Grid made up.
- **Doors and windows** are typed by size, and doors by handing too (`Door 0.9 x 2.1 m, single
  swing, left`), tagged as the estimate keys them (`door:0.9x2.1`). A door whose swing the plan
  does not state is typed by its size alone. A door or window that states its kind (CNT-14) is
  typed by it too, tagged `door:sliding:2.2x2.1`, with IFC's operation for it (`DOUBLE_DOOR_SLIDING`,
  `FOLDING_TO_LEFT`, `ROLLINGUP`; a garage door is user-defined and its name says it lifts
  overhead). A door or window of one of the plan's named types (CNT-15) is typed by it, named after
  it (a door with its handing too) and tagged `door-type:<id>`, and carries the type's material,
  `Not stated` when it states none. Each door and window holds its frame, its leaves (closed, hung from the face of the
  wall it opens toward) and its glass, styled as glass; the OBJ and GLB hold the same parts as
  `frame_`, `leaf_` and `glass_` objects.
- **Flats** are not written as zones: the plan format holds no flats yet.
- **Where it stands.** A plan that reaches more than 500 m from the origin (`farFromOrigin`) is
  moved, in whole steps of that distance, to near the origin, and the move is the site's
  placement: everything keeps its place, and its own coordinates stay small. A plan that states
  its `site` keeps the site's origin on that point (CNT-3), and the building's placement holds
  the rest of the move. There is always at least one storey.

## The report, short or full, and notes seen: `grid check`

`grid check` prints a short report about this plan (MSG-10): the label, each line to look at
with what was found, what was needed and the fix, the figures those lines used (each as the
figure used here, with its document, edition, clause and status), what each check looked at in
counts, with the parts it could not look at and why, and one line on what `--full` adds.
`--full` prints the whole report: the checks run, every figure, each part each check looked at
or skipped, and what these checks never look at. `--json` always gives the whole check. A plan
that keeps lengths taped on site gets, after its notes, the table of each one taped against drawn,
and `grid write` and `grid edit` print it after every change too (HND-11,
[lengths taped on site](plan-file.md#lengths-taped-on-site)):

```text
Taped against drawn (4; 1 differs): each length taped on site, set against the drawing's inside faces.
  What was taped                                                taped    drawn     off
  Bedroom, the side along wall "ext-s"                        3.470 m  3.470 m   0.000  agrees (within 0.010 m)
  Bedroom, the side along wall "ext-w"                        3.200 m  3.200 m   0.000  agrees (within 0.010 m)
  Hall, the side along wall "ext-s"                           1.400 m  1.200 m  -0.200  differs (within 0.010 m)
  Bedroom, corner "ext-w"/"ext-s" to corner "bed-hall"/"row"  4.690 m  4.684 m  -0.006  agrees (within 0.010 m)
```

The line after the label says the place the figures were for and where it came from (COD-3).
The plan states its place in `site.country` ([the place](plan-file.md#the-place)); `--country`
names another for this check: a country's name or its two- or three-letter code, such as `US`,
`USA`, `United States` or `Spain`, in any case. A place not on Grid's list is refused with exit
code 2, naming `--country` and never the text. With no place stated, no figure is applied, and
the line says so: `--country US` checks against the US figures for one run.

```text
General guidance, not your local rules
No place is stated, so no code figure was applied. State it in the plan as site.country, or give --country.
```

A note you have looked at can be set aside as seen, with why and who:

```bash
grid check --seen 3 --reason "A box room, kept small on purpose" --by "Owner"
grid check --unseen 3
```

The number is the note's in the report of the whole plan (with `--country`, give the same
country). The mark is written to the marks file beside the plan, `plan.seen.json` beside
`plan.json`, and the report follows. A seen note is still listed, under "Seen", with its reason,
who marked it and the day, and the count says how many are seen. When one of the parts it is
about changes (the room or its walls, the door or its wall, the floor, or the plan for a note
about the plan), the note is listed as new again, saying it was seen before and what changed.
`--reason` and `--by` go with `--seen` only. Who marked it is the name or role you give: it is
kept only in the marks file, which no export, sheet or drawing reads.

A change that brings a seen note back says so (MSG-29): `grid edit` and `grid diff` name each
note that held before and is new again after, with its number in the report counted for the
country the note was marked with (a mark made with `--country` keeps it), who marked it and which
of its parts changed.

## Describing a plan: `grid describe`

`grid describe` is a short account of the plan, for an agent to check its own work without
reading the file: a front door that opens into a bedroom, or a bathroom reached only through
the study, shows on the first read. It answers in four lengths:

| `--length` | What it holds |
|---|---|
| `line` | One line: floors, rooms, bedrooms and bathrooms (by the `use` a room states, never its name), the area inside, and which rooms the doors from outside lead into |
| `rooms` (the default) | The line, then each room's inside size, position and the rooms next to it, and every opening in it with the room on its other side and its distance to the two inside corners of that side |
| `walls` | The rooms, then every wall with its openings, each with the rooms on its two sides |
| `walk` | The plan walked room by room from its way in: in each room, standing in the doorway you came in by, what is ahead, on your left, on your right and in the wall you stand in, and how far |

`--for person` (the default) names rooms and floors by their names and never prints an id.
`--for agent` is terse and carries every id, the offsets along each wall and a key line, so an
agent can edit the plan from it. A floor laid out like an earlier one is said once. Wall and
sill heights are one line: the usual height and the exceptions. What the plan cannot say,
such as where north is, the kind of building when the plan does not say it, how floors connect
when no stair joins them and which rooms make each flat, is said as such; a kind the plan states
is said after the first line. The stairs that join the floors are one line, with the risers and
going Grid worked out. Directions are on the drawing, with north at the top. A plan that states
its real north or its front gets a few more lines: that north, which way each side of the drawing
really faces, and which rooms face each way
([plan-file.md](plan-file.md#north-front-and-where-the-building-is)). A plan whose site states
the plot gets a line on it: its area, how much of it the building covers, and the edge of the
boundary the building comes nearest, with the set-back asked for it
([plan-file.md](plan-file.md#the-plot-its-boundary-set-backs-and-what-is-on-it)). The card checks nothing and
says so; its first line is the label "General guidance, not your local rules", as for every
report (MSG-3). `--as rooms` starts with the label as a comment, which `grid write` ignores, and
`grid draw` puts it in the drawing's top-left corner.

`--length walk` (VEW-9) is the long form. Each floor starts at its way in: the front door the plan
names, else the widest door from outside into a corridor, else the widest door from outside; a
floor with no door from outside starts in its stair room. The walk takes the ways on from each
room from left to right as you stand in its doorway and goes as deep as it can, so a room off a
room comes straight after it. In each room you stand at the middle of the doorway you came in by,
facing in, and the room is said wall by wall: ahead, left, right and the wall you stand in, with
how far each wall and each door, window, open side and fixture is. `--floor <id>` walks one floor;
without it a floor laid out like an earlier one is said once. `--pictures <folder>` writes a
picture from each doorway into the folder, which must be there: at eye height (1.6 m), a step
into the room, looking ahead, as `walk-01.png`, `walk-02.png` and on, each named under its room.
`--floor` and `--pictures` go with `--length walk` only. How a route's length is walked is in
[tool-server.md](tool-server.md#a-routes-length-and-a-walk-through).

A room that is not a rectangle square to the drawing is said by its shape (CMD-49), with the unit
on every length: `round, 35.4 m across`; a curved band (a room between two curves on one centre)
by its length along its middle and its width; a rectangle turned on the drawing by its own sides
and its turn, `5 m × 3 m, turned 7° on the drawing`; any other four-sided room by its four sides
going round; and any other room with a curve by its widest across and up, with each curve's
radius and length. `--for agent` adds a token after the size (`round:`, `band:`, `turned:`,
`sides:`, `curves:`, in its key line), and the walk says a round room and a band the same way
where it stops in them.

## A plan from a phone room scan: `grid write --scan`

`grid write --scan room.json` writes the plan from a room scanned with a phone (HND-12), and
`grid_write_rooms` does the same with `scan` in place of `rooms`. Grid reads Apple's room model
first: the JSON an iPhone or iPad with a depth sensor saves a captured room as, with its walls,
doors, windows, openings and objects as surfaces, each with its own id, its size, where it
stands (a 4 by 4 transform), what it is and how sure the capture is; newer captures add floor
outlines, storeys and room types. The file is read as a plan file is: inside the project, at
most 64 MB, its text decoded one way, its ids held to the plan's limits; a refusal names the
part and the limit (`walls[0].identifier is 65 characters long; an id may have at most 64`),
never the scan's text.

How the scan becomes a plan:

- **A scan sees each wall from a room.** Each wall surface is one face. A wall between two
  scanned rooms is seen from both: its two faces, facing each other across a gap no wider than
  0.6 m (`roomsWallWidest`), are paired into one wall as thick as the gap. Two faces a little out
  of parallel (within about 5 degrees, `scanFaceTurn`) are turned onto one direction about their
  middles, and the answer says by how much.
- **A wall seen from one side** has no thickness in the scan. It is taken as an outside wall of
  Grid's usual 0.2 m, grown away from the room from its scanned face, so the room keeps its
  size, and its thickness is marked assumed.
- **The rooms** are the scan's floor outlines, each side on the wall face along it (within
  0.05 m, `scanFaceReach`); in a scan with no floor outline, the wall faces joined end to end
  (corners within 0.15 m, `scanCornerGap`) round as many rooms as they close round; faces that
  close round no room are named in what was left out, and a scan where none closes is refused.
  Each room's corners are where its faces'
  lines cross, as every room in Grid is measured, and its name and use come from the scan's room
  type where it gives one. The walls are held to a micrometre, so each room keeps the scan's
  area: the answer gives both, and how far apart they are.
- **Doors, windows and openings** go on the wall the scan names, at their place along it; a
  door within 0.05 m of the floor (`scanOnFloor`) stands on it. A scan does not say how a door is
  hinged, so each is left undecided. A door the scan gives twice, once from each room, is drawn
  once. A toilet and a bath become fixtures; other objects are kept with the scan, not drawn.
- **A scan has no north.** The plan is the scan turned by the least turn that sets its longest
  wall across the drawing, and moved so its walls start at 0,0.

Every part is marked `scanned`, and each value assumed is marked `assumed`
([where a value came from](plan-file.md#where-a-value-came-from)), so `grid check` lists them
under "To confirm" and the drawing shows them dashed. The answer lists everything assumed, one
line each, for the agent to confirm with the person. `grid edit square` squares the scanned walls,
as its own step.

**The scan kept beside the plan.** `plan.scan.json` beside `plan.json` keeps every surface the
scan gave, by its own id, as Grid read it (its list, category, confidence, size, transform,
parent wall, storey and corners), with the plan part it was drawn as, or `null`; and the room
types, how the scan was turned and moved onto the plan, what was assumed, and the plan's
revision as written. Fields of the scan Grid does not read are not kept. It is the person's: a
scan can hold a home's layout, and Grid sends it nowhere.

**A re-scan** is matched to it by the scan's ids: a part whose scan id reappears keeps its plan
id, and the facts of the person's own on it stay; a part with a new scan id gets a new plan id,
never one a part had before; a part whose scan id is gone is gone from the plan, and the answer
names it. A plan changed since Grid wrote it from the scan, or not written from a scan, is
refused with the difference unless `--replace` is given (`replace` for the tool), as rooms text
is; the scan kept beside the plan is replaced by the new one.

## What a change did: `grid mark` and `grid diff`

`grid mark` keeps the plan as it is now, under a name (`start` unless you name another), in a
file of its own beside the plan: `plan.markers.json` beside `plan.json`. The plan knows nothing
of it, and no export, sheet or drawing reads it. A plan keeps the latest 20 markers: marking a new
name past that rolls the oldest off and says which (CMD-44); marking a name again replaces it, and
`--remove` takes one off. `--who` and `--note` keep who set it and why, and `grid diff` says them.
A marker keeps the brief beside the plan as well (CMD-57), and `grid diff` since it lists how the
brief changed, each wish weakened, removed, changed, tightened or added. The plan is named as in every other command, after
the name (`grid mark before plan.json`); `--plan` says the same. `git` is not a marker's name: it means the
version last committed.

`grid diff` compares the plan with an earlier version of itself: the marker `--since` names, or
with `--since git` the version last committed in the project's own git folder. With neither, it
compares with the marker `start` when the plan has one, else with the last commit. With
`--since phase`, a plan with existing, demolished and new parts is compared with itself, before
its work against after it: what is removed is to be demolished, what is added is new (CNT-10). Grid reads
git's own files, through the same project folder rules as every other file, and runs no
program: a `.git` folder in the project folder itself, a SHA-1 repository, the branch `HEAD`
names. A repository whose `.git` is above the project folder is outside it, and is not read.

### The change log and the versions it keeps (CMD-44)

Every change Grid makes to a plan file (`grid edit`, `grid write`, `grid tidy` and every tool of
`grid serve` that changes the plan) keeps the plan it replaced, whole, as a checkpoint in
`plan.checkpoints/<revision>.json` beside `plan.json`, and adds one line to the plan's change log,
`plan.history.jsonl`: when, who (a tool call's `who`), with which tool, the plan's revisions
before and after, the building's change lines and every field that changed, facts of the
person's own and room numbers included. The log is only ever added to; the latest 50 checkpoints
are kept. A change written to another file (`--out`) changes nothing in the plan's log. A change
made by hand or by another program is in no entry: Grid sees it as the plan not being at the
revision its log last wrote.

So `--since` and `--to` name any version Grid keeps:

| Name | The version |
| --- | --- |
| a marker's name | the plan when the marker was set |
| `git`, `git~1`, a commit's first 7 or more hex digits | the plan as committed, on the first-parent line of `HEAD` |
| `last` | the plan before the last change in the log |
| a revision (12 hex digits, as `planRevision` gives it) | the plan now, a checkpoint or a marker with that text |
| `2026-11-26`, `2026-11-26T10:00` | the plan as it stood then by its log; a date alone is its start, UTC unless a zone is given |
| `phase` | the plan before its work (`--since` only) |

A marker's name is read first, so a marker named like a date keeps its meaning. `--to` compares
two earlier versions with each other. `--show facts` lists every field that changed, part by part
(`rooms["bed2"].properties.department: "Sales" → "Finance"`), and `--show history` the log's
entries since the earlier version. A comparison whose building did not change but whose facts or
numbers did says so (`Changes: none to what stands; 2 fields changed, 2 of them facts or numbers.`) and lists the facts and numbers.
The tools `grid_undo` and `grid_restore` put a version back ([tool server](tool-server.md#what-a-change-did)).

The two versions are compared by what stands where in the building, not by ids. The earlier
plan is laid on the later one, moved to its origin when that lines up more walls; each wall is
paired with the wall standing in its place, either way round, its ends within `diffPlace`
(5 cm) of each other ([tolerances](tolerances.md)), each opening with the opening at its place (or, its wall moved, with the opening of its
kind at its place along the paired wall) and
each room with the room on the same walls or the same floor. A wall keeps its id only while it
still stands along its line (MSG-27): the walls left are paired along the line they share, so a
party wall made longer under a new id, or drawn in other pieces and made longer, is the wall it
was with a new stretch, and the stretch of an earlier wall that no later wall stands on is
removed (a wall knocked through to two nibs). What is left is paired by id, and
then two rooms on one floor that share at least three quarters of the larger one's floor
(`diffRoomOverlapShare`) are one room reshaped, whatever their ids. A plan written rooms first in
both versions is paired the same way, with the room's name last (MSG-23); there an id or a name is
kept only by a room that shares at least half of the smaller one's floor (`diffRoomKeptShare`), so
a rewrite that gives a room's number to a room across the building pairs neither with the other. A
point that slipped by less than a centimetre has not moved. A room's walls are compared as a
ring: the same walls from another wall, or the other way round, are the same room. A plan
written rooms first in both versions is compared by its rooms and openings, whose names you
chose: a room that kept its size and moved is said to have moved. Its walls follow its rooms, so
a wall is listed there only when its own figures changed: its thickness, height or kind, or
whether it is a dividing line, curved or on another floor (`Wall "ext-north" thickness 0.34 →
0.30 m, by "Kitchen", "Hall" and "Bedroom 2"`). A plan drawn wall by wall lists every wall that
changed.

A room that grew or shrank names the walls on its outline whose face on its side moved: one made
thinner or thicker, or, in a plan drawn wall by wall, one that moved (`"Kitchen" 13.20 m² →
13.29 m² (…), because wall "ext-north" went from 0.34 to 0.30 m thick`). In the data, each room's
`walls` lists them by id.

A door or window with no change of its own is said by where it went in the building. One that
moved with its wall, or with a room that moved as it was, is said to have moved with it, how far
and which way on the drawing: after `grid edit move-side --room bed1 --side east --by 0.5` on the
two-bedroom flat, `Window "win-bath" moved with its wall, 0.50 m east on the drawing, in
"Bathroom"`. One whose wall moved or was replaced while it kept its place in the building (one of
its faces where it was) is said to have stayed where it was. Neither is a change line: they follow
from the wall or room, and the verdict counts the ones that moved (`2 openings moved with their
walls`).

A door or window moved from one wall to another is a change line that names both walls and what
lies on each side of each, never a distance along its wall, nor its hinge and swing compared
across the two walls: `Window "win-bed1" moved from wall "ext-south", between "Bedroom 1" and
outside, to wall "bed1-north", between "Bathroom" and "Bedroom 1"` (MSG-28). `grid edit opening`
moving it says the same of its new wall and its old one: `It was between "Hall" ↔ "Living"; it is
now between "Living" ↔ outside.`

In a plan with existing, demolished and new parts, a wall, door, window or room whose phase
changed between the two versions is a change of its own, with its phase before and after:
`Window "win-bed1" now to be demolished (was existing), in "Bedroom 1"`, `Wall "bath-north" now
existing (was to be demolished), by "Bathroom" and "Bedroom 2"` (MSG-25). The picture marks it as
changed. A door or window that states no phase of its own follows its wall, whose line says it.
With `--since phase` there is no such line: there each part is compared before and after its work.

The plan's named wall, door and window types, the rooms' finishes and a wall's curve are compared
too (WRT-86). A type added, removed or changed is a change line of its own, by its name and id,
with its figures and the parts that take it (or took it): `Wall type "Concrete 250" ("conc")
added: thickness 0.25 m; taken by wall "ext-east"`, `Wall type "Brick 300" ("brick") thickness
0.30 m → 0.35 m; taken by 4 walls: …`. A wall, door or window that takes another type says so in
its own line (`Wall "ext-south" thickness 0.30 → 0.20 m; type "Brick 300" → "Block 200"`). A room
whose finishes changed is a changed room, surface by surface, then each face finished other than
its walls and its bands of finish: `"Living room" floor finish "Oak" → "Porcelain tile"; walls
finish not stated → "Paint"`. A curve that changed gives its radius, its bulge (the tangent of a
quarter of its sweep, as a raw wall takes it) and its sweep before and after: `Wall "apse" curve
radius 2.00 → 2.00 m, bulge 1.000 → -1.000 (sweep 180° → -180°)`, and a wall made curved or
straight the curve it has or had. The picture draws a wall whose curve or type changed in amber,
its old curve outlined. The data lists them under `types`, `finishes` and `curves`.

A floor in both versions that stands at another height, or has another level, height, slab or
name, is a change of its own, said first with its old and new figures: `Floor "Mezzanine" moved
down 9.50 m: elevation 13.75 m → 4.25 m`. Where a floor stands is worked out as the 3D view and
the IFC stack it, so a floor that states no elevation and moved because a storey under it was
made taller says so too (`Floor "Mezzanine" moved up 9.00 m: standing at 4.25 → 13.25 m`). The data
lists them under `floors`. `grid write` and every change that answers with a verdict say the
same words: a plan whose walls, openings and rooms all stand where they stood but whose
mezzanine moved is never called the same building.

Before anything is paired, the later plan is tried as the earlier one mirrored left to right or
top to bottom, turned a quarter either way or half round, or mirrored across a diagonal. When
one of these stands more walls in their place than the plain way, and at least half of them, the
plan is that turn of the earlier one: the line after "Compared with" says so, with whether every
room kept its size, and everything else is compared from there. After `grid edit mirror --how
left-right` it reads `The plan is mirrored left to right (east and west swap), and every room
keeps its size.`, and a flat whose y was entered running down the page reads as the flat mirrored
top to bottom. A plan that is the same whichever way it is turned, a square room, is not called
turned.

The answer, in this order:

- **Issues**: a door that now joins other rooms, a wall added or moved that now meets another
  wall inside an opening, a room that no longer closes, and the notes of `grid check` that came
  and went. A note `grid check` gives once for several rooms that gained or lost rooms is one
  issue, `note_changed`, saying which rooms it now also names and which it no longer does
  (WRT-64), not one note new and one gone.
  An issue names rooms by their names, as the verdict and the changes do (CMD-34):
  `Door "door-bed1" joined "Bedroom 1" and "Hall"; it now joins "Hall" and "Store"`; the ids are
  in its `entities`, a door's issue listing the door and then the rooms on either side of it.
  With `--since phase` the issues are judged by what the work does (CMD-31): a door whose room
  the work takes out and replaces with a new one is the work, not an issue, while a door that
  comes to join the outside or a room that stood before still is; and an old window the work
  leaves between two rooms, one built against it, is an issue (`window_between_rooms`).
- **Verdict**: room by room, how many ids were only renamed, and with `--rooms` how many changes
  are outside the rooms named. The same building under new ids reads `Same building, 28 ids
  renamed (9 walls, 13 openings, 6 rooms): every room, wall and opening stands where it stood.`
- **Rooms** that changed, moved, came or went, with their old and new net area.
- **The massing and the site** (MSG-27): each floor's outline that came, went, moved or changed
  size, the homes and parking spaces a floor states, the buildings, the plot's boundary and the
  site's things (`Site tree "t2" removed`), each a change line after the floors'. Two options
  with other blocks are never the same building. The verdict ends with the figures that differ,
  side by side: `Side by side: gross external area 1260.00 → 1176.00 m²; plot coverage 17.5 →
  16.3 %; gross external area to the plot (FAR) 0.53 → 0.49; homes 12 → 18` and each boundary
  edge's least distance to the building. The data holds them under `massing`. `grid_compare`
  says the same lines.
- **Changes**, one line each; walls changed the same way are one line
  (`9 walls height 2.60 → 2.70 m: …`). Then the openings that moved with their wall or room,
  and the openings that stayed where they were though their wall moved or was replaced.

`--show summary` stops after the rooms, `--show issues` gives the issues alone, and `--json` the
same as data. `--floor <id>` narrows the rooms, the changes and the openings to one floor, and
says how many change lines it left out (`Changes on floor "first" (1 of 2; 1 on other floors or
about none, left out):`, in the data `floor` and `otherFloors`); a line about a part on that floor
in either version is kept, one about the site alone is left out. The issues, the verdict and the
scope check stay whole. A floor the plan does not have is refused with the floors it has (CMD-32).
`--picture d.png` (or `--out d.png`, the name `grid draw` and `grid sheet` use) writes the comparison as a picture of one floor (the first with
a change, or `--floor`): what was removed in red, what was added in green, what changed in
amber (a wall nudged within its own thickness or made thicker, or an opening that changed or
moved, at its new place with its old place outlined; a room with its old and new area), and the
rest pale. MSG-27: a wall is drawn by what happened to it where it stands. One made longer or
shorter along its line is drawn pale, with only the stretch it gained in green or lost in red; one
that left the ground it stood on (moved across or turned) is red where it stood and green where it
stands, whatever its id; a door or window that stands where it stood is not marked. A room that
took another in is drawn as one changed room labelled with its sum (`Living room: 18.48 + 13.20 +
0.44 = 32.12 m²`, the last term the floor the walls taken out stood on), and the room it took in is
not drawn as removed. When nothing changed it draws
nothing and says so.

## Walls that do not meet: `grid tidy`

`grid tidy [plan.json]` lists the faults where walls meet (a wall short of its corner, a gap in a
straight side, a wall running past its last corner, a copy lying on its original, a dividing
line on a solid wall, a wall listed twice, a wall across a room that does not list it, walls
standing inside a room), each with the fix Grid offers or why it offers none. A fix is offered
only after it was tried and left every room it touches with an outline. `grid tidy --apply
<id>,<id>` makes the fixes named, and `--apply all` every one offered; the faults are looked for
again before each fix, and one an earlier fix took care of is skipped and said so. The plan file
is changed as read, keys Grid does not know included; `--out <file.json>` writes the tidied plan
there instead. `--json` prints the list or what was applied as JSON.

A solid wall drawn across a corner of a room at an angle, which the room does not list, with the
room's own outside walls round the corner (a chamfered corner, a corner entrance), is read as the
room's new face: its fix takes the corner beyond it outside. The room lists the wall in place of
the corner, the two walls it meets end on it, a wall wholly beyond it is taken out, and the doors
and windows on the corner move onto it, in the order they stood, spaced evenly along it (one in
its middle), with their hinge and swing turned when the wall runs the other way; a door already on
it stays where it is. When they do not fit, or the wall carries openings of its own, the room is
split instead. A wall square to the walls it meets, or one with another room round the corner, is
a split of the room, as before. A split that would leave a part with no way in (no door, opening
or open side on any of its walls), or two parts whose only way in is the door between them, says
so in its fix, and its JSON lists those rooms under `seals`; `--apply all` still makes it, so list
the faults first. On the tool server the same is `grid_tidy`.

## Units on the drawing: `grid draw --units`

`grid draw --units m|cm|mm|ft-in` writes the drawing's room areas and dimensions in those
units, and `--decimal point|comma` with that decimal mark: `--units ft-in` draws `12'-6"`,
`--units mm` draws `2860`. Left out, the plan's own `display` is used, or metres. A length typed
on `grid edit` may carry its unit (`--by "12'6\""`, `--width "900 mm"`) and, with
`--decimal comma`, a decimal comma (`--by 0,3`). The plan file stays in metres either way; see
[Units](plan-file.md#units).

## Grid's words in your language: `--lang`

`grid check`, `grid describe`, `grid draw` and `grid sheet` take `--lang en|es`: the language
Grid writes its own words in, the label first. Left out, the plan's own `display.language`, or
English. Spanish writes figures with a decimal comma unless the plan's `display.decimal` says
`point`. Room names stay as the plan writes them, and the codes in brackets stay as they are. The
Spanish words are a draft translation, not reviewed yet; see [Languages](languages.md). A
language Grid does not write is refused by name. `grid draw --section` and `--facade` take it too:
the section's title, level names, list of what Grid took and the line on standard error follow it,
and the level marks keep their decimal point. `grid describe --length walk` walks the plan in the language, and
`grid sheet` writes its figures in the plan's display units with the language's decimal mark
(`8'-6" de alto`, `62,4 m²`).

## What a drawing shows: `--hide`, `--colour` and `--key`

A floor plan picture shows the plan's title and key in a band under the drawing, its notes, tags
and symbols, its sketch, the sizes, the room areas, the door swings and the warnings (the
plan file's writing is in [plan-file.md](plan-file.md#writing-on-the-drawing-and-the-sketch-layer)).
`--hide notes` leaves off the notes and keeps the tags and symbols. `--hide` leaves parts off, named and joined by commas: `title`, `key`, `notes`, `sketch`,
`dimensions`, `areas`, `swings`, `warnings`, `above`. `--colour use` fills each room by its use and
`--colour finish` by its floor finish (each finish the plan's rooms name gets its own pale tint, in
the order they first name it, the same on every floor), and either lists what each fill stands for
in the key, which is then drawn whether or not the plan asks for one. `--key` adds a key where the
plan asks for none, and `--hide key` leaves it off. A word Grid does not know
is refused by name, and none of the three is taken with `--3d`. `grid_view` takes the same as
`hide`, `colour` and `key`.

## How each look draws a plan

A plan is drawn in one of its looks: the technical look (black on white, lines in millimetres on
paper, for files and sheets, and for a section whenever `look` is left out), the working look (the screen's colours, for every picture an agent
gets) and the dark look (the working look on dark paper, for the app's and the preview page's
dark theme only). Each look draws the same geometry; what follows is what each draws its own way
(SHT-10).

- Walls by kind. An outside wall (or a party wall, or one to the common parts), an inside wall and
  a stated partition each have their own fill: in the working look near-black, a mid grey and a
  lighter grey; in the technical look three grey tones inside the black outline, the partition
  outlined with a lighter pen than the walls cut through. Which kind a wall is comes from what
  lies on its two sides (`exterior`, `interior`, `separating`), and from its stated `kind` for a
  partition. The key names each kind the drawing has.
- Above the cut, dashed. A window whose sill is at or above the plan's cut (1.2 m, `planCutHeight`)
  or that is a high-level window is drawn dashed in every look, as a stair past its break line and
  the floor above already are.
- Detail at 1:50 and larger. In the technical look, a drawing whose scale takes the 1:50 pens (up to
  about 1:70) also draws: each wall whose wall type names a material hatched across, on the paper,
  one hatch per material in the order the plan's wall types list them (diagonal, the other way,
  crossed, level, upright, squared, then again), with each material in the key; a frame at each
  side of every door and window (`frameFace`, `frameDepth`); a window's glass as two panes
  (`glassThickness` apart); and a window's sill along each face of its wall (`sillProjection`).
  The plan holds one material per wall type, not a wall's layers, so a wall is hatched as one
  material. `grid sheet` draws its plans with no key band (each page has its own notes), so a
  hatch there is not keyed.
- Tints. `--colour use` and `--colour finish` fill rooms from the look's own tints: pale on light
  paper, dark on dark paper, and listed in the key.
- Contrast. Every colour a look draws text in stands at least 4.5 to 1 from the paper, a room and
  every tint, and every colour it draws a line or mark in at least 3 to 1, by the relative
  luminance of the Web Content Accessibility Guidelines (WCAG 2.2, success criteria 1.4.3 and
  1.4.11). A test holds every look to it.
- Always light in a file. Whatever the screen's theme, a picture written to a file or handed to an
  agent is on light paper: `grid draw` refuses `--look dark`, `grid_view` draws the working look
  when asked for `dark` (and says so), and a 3D picture is always light. Only the preview page's
  own drawing follows the page's theme.

## The sizes on a drawing

A floor plan picture's sizes run along the walls, in the plan's own two main directions (the
way most of its outside walls run), so a house drawn turned is dimensioned along its walls, not
by the box it makes on the page.

- Inside each room: a room with four square corners gets its width and depth, between its
  walls' faces. Any other room (an L, a room with a bay, a skewed one) gets one size per side,
  a little in from that side, and every line stays inside its room.
- Outside the plan, on each side that has them, three chains, nearest first: the openings
  (from the corner to each edge of a door or window in the walls facing that side), the walls
  (each wall's faces where it meets that side, and the corners) and the overall size. Each
  chain runs between the same two outer faces, so it adds up to the overall size. The overall
  width is always below the plan and the overall depth to its left; above and to the right
  there is one only where a chain is.
- Walls that run another way (VEW-22): a facade at an angle, such as a chamfered corner or the
  side of a fan, gets its own chains and its own length, along itself. A plan of two wings or
  more at an angle (each at least three walls and a quarter of the outside length,
  `wingShare`) has each wing dimensioned square to itself. A plan where no way holds half the
  outside length and there is no wing is measured along the page, its overall size from the
  box round its outline. A chain keeps no point closer than `chainSliver` to the one before it,
  so a wall a little off square leaves no sliver, and a wall thinner than `chainThinWall` that
  meets a facade is marked at its centre line.
- Curves (VEW-79) are dimensioned as curves, never one size per straight piece they are traced
  or written by. Each circle a curved wall lies on gets one radius, `R 6.00`, from its centre
  (marked with a cross) to the face that looks at the centre, and each curve that is not a whole
  circle its chord once, pushed out past its bulge. A room's sides along a curve get no size of
  their own. A run of three or more short straight sides turning the same way by no more than
  `curvePieceTurn`, their corners within `curveFit` of one circle, is a curve too: it gets its
  radius and chord, and its walls get no chains of their own outside the plan. A radius longer
  than `radiusLineLongest` is drawn as that much of its line by the curve, with no centre mark,
  and still says the whole radius. In an SVG these are `data-kind="radius"` and `"chord"`.
- Every size measures to a wall's face, or to the line of a dividing line (or of a thin wall),
  which has no faces. A plan records no finishes, so none measures to a finish yet. In an SVG each
  dimension's `data-measured-to` says it, for its two ends: `face`, `centre-line` or `finish`.

In the technical look each dimension line ends in a 45-degree tick and its number runs along
it; the working look keeps plain ends and upright numbers. `--hide dimensions` leaves them all
off.

## Stairs, lifts and the floor above on the drawing

A floor plan is drawn as an architect expects it (SHT-11), from shapes the core works out and the
look only strokes:

- **A stair the plan states** is drawn on both floors it joins, with a line at every riser and
  its walking line ending in an arrow head pointing up. On the floor it rises from, the plan is
  cut 1.2 m above the floor (`planCutHeight` in [tolerances.md](tolerances.md)): the stair is
  solid up to the break line across the flight there, and dashed above it. On the floor it
  arrives on, it lies wholly below the cut and is drawn solid. A stair drawn only as a room used
  as a stair has no stair object, so it gets no treads: state it in `stairs`
  ([plan-file.md](plan-file.md#stairs-that-join-two-floors)).
- **A lift shaft**, a room used as a `lift`, gets a cross in it, corner to corner, on every floor.
- **The floor above** shows as a dashed outline: the outline of the floors at the next level up,
  the one whose area is the gross external area, less the stretches that lie on this floor's own
  outline. What is left is an overhang past the walls, a loft or a floor that steps back inside
  them. A stretch over an inner wall is hidden by the wall. `--hide above` leaves it off. The
  plan cannot say where a floor has a void, so a void inside the walls above is not told apart.

The working look draws all three in thin lines, dashed 4 on 3 pixels; the technical look with its
finest pen (the floor above with the fine pen), dashed 1.5 on 1 mm on paper. The key, where the
picture has one, names the floor above. The app's 2D view and `grid draw` draw the same shapes.
The DXF does not draw them yet.

## What went wrong, on the drawing: `grid draw`

`grid draw` and `grid_view` show what went wrong on the drawing. Every line `grid check` prints
for the floor drawn has its number from that list in a small mark on the room, door, window,
wall or fixture it is about, with its words beside it; a line about the whole floor has its mark
in the top-left corner. The same lines are listed by number under the drawing. A room that
cannot be drawn is not left blank: it is the dashed box round its walls, with its name and the
reason. `docs/result-contract.md` says how the numbers are given.

## The 3D model as a picture: `grid draw --3d`

`grid draw --3d` takes the 3D model as the app opens it: the same scene, from the same camera
(south-east, about 29.5 degrees down, through a 45 degree lens). It needs no browser and no
graphics card: the scene is drawn in software, each face lit flat, without shadows. With
`--floor`, that floor is shown as a cutaway, as in the app, its walls cut to 1.2 m above its floor
(`planCutHeight`) whether the building has one storey or several; without it, the whole building.
The PNG is 1200 by 800 pixels, times `--scale` (up to 4).

The ground (VEW-66) lies at the level the site states (`site.ground`), else at the ground floor's
floor level: the grid's lines, and under them a sheet in the background's colour that hides most
of what lies below it. A basement, a car park's levels or the slab under a garden shows through it
faded, as buried, while what stands above the ground is drawn as before. The sheet is cut away over
every floor whose slab's underside lies below the ground, so the building stands in its hole; with a
floor below the ground shown as a cutaway, only the grid's lines are drawn, over it, so the floor
is seen whole. One level for the whole site: a slope is not drawn.

`grid draw --view <name>` draws a view saved with the plan (VEW-3, `grid_save_view`): the 3D
model through that view's camera, with the floor it was saved with cut away, the same picture
`grid_view view=<name>` gives an agent. The name is matched whatever its capitals; a name the
plan has no view for is refused with the views it has. Not with `--floor`. The views and their
camera record are in [the plan file](plan-file.md#saved-views-and-the-camera-record).

## A picture of the plan: `grid draw`

`grid draw plan.json` writes one floor as an SVG file, and `grid draw plan.json --out
plan.png` as a PNG (`--png` is not needed: the file's ending names the format, and `--png` or
`--3d` with an `--out` that ends in `.svg` is refused); each is a separate run, and the PNG is the same drawing as the SVG. Neither
needs a browser or the app: both are plain function calls in Node, which a program can make too
(`drawPlan` in the `ongrid` package; `planToSvg` in `@ongrid/viewer` for the SVG alone).

Each uncropped floor plan uses the whole building's frame by default. Draw each floor
with the same look, dimension settings and scale to align the pictures. Use
`--frame floor` to fit one floor closely. With `--out`, a floor plan, section or
facade PNG gets a `.pgw` world file beside it. The world file maps pixel centres to
metres in the plan, section or elevation and follows the PNG's `--scale` setting.

The app's 2D view and `grid draw` lay a floor out with one function, `planScene` in
`@ongrid/viewer`. With a floor frame and the same plan, size and look, the elements the
app's view holds are, byte for byte, the ones in the SVG file, which adds its own root and
a sheet of paper (a test holds this for the lab's eight buildings, in each look). What the
command adds on top, the marks of what went wrong and the key under them, is in
[What went wrong, on the drawing](#what-went-wrong-on-the-drawing-grid-draw).

Room names and areas fit inside the visible room floor. Grid can turn a label along a
room, use smaller text, wrap the name or show just the name. Repeated names carry a number,
from the plan when stated or from their order on the floor. The drawing adds a suffix to
duplicate stated numbers to keep them distinct. When a name cannot fit, the room number
can stand in for it, with the name in the key. A room with no clear place even for its
number can be labelled at a closer zoom. Crops and tiles lay out their own labels and
keep the same room numbers.

The PNG is that SVG drawn by Skia, through `@napi-rs/canvas` (MIT). It ships a ready-built
binary for Linux, macOS and Windows, so nothing is compiled when Grid is installed. It is an
optional package: where its binary did not come along, `grid draw --png` says so in one line,
and every command that draws no PNG works without it. The PNG is drawn at its own size, not
enlarged from a smaller one, so `--scale 2` gives a picture twice as wide and as sharp. Its
text is set in the first font of the picture's list that the machine has, so letters can differ
slightly between machines; where each label goes never does. A name in Arabic or Hebrew is drawn
in the Noto fonts Grid ships in `fonts/`, joined and read right to left, on every machine; a name
in Chinese, Japanese, Korean, Thai, Devanagari or an emoji needs a system font that has it.

Over the lab's plans, half the pictures took under 25 ms as SVG and under 70 ms as PNG, and 19 in
20 under 300 ms, on a heavily loaded machine. The time grows faster than the plan: a floor of a
hundred rooms in a grid took about 2 s, of five hundred about 17 s. The figures are in
`reviews/VEW-1.md`.

A plan that names a trace image (`referenceImage`, HND-10) has it drawn under the floor it lies
under, over the rooms' fills and under every line, read from the project folder; standard error
says where it lies and at what scale, or why it is not drawn. A path that leaves the folder or
does not end in `.png`, `.jpg` or `.jpeg` refuses the plan. The plan file's page says how to place
and scale it: [a trace image under the plan](plan-file.md#a-trace-image-under-the-plan).

## Sections, and the marks on a plan: `grid draw --section` and `--marks`

`grid draw --section x1,y1:x2,y2` draws a section instead of a floor plan: a cut along the line
from the first point of the plan to the second, in metres, through every floor, looking to the
left of the line as you walk from the first point to the second, or to the right with
`--toward right`. A person standing on the line and looking that way sees the section's left on
the picture's left.

```bash
grid draw plan.json --section 4.9,-2:4.9,13 --png --out section.png
```

Everything on it is the model's own, as the 3D view, the IFC and the take-off read it (LVL-9):

- **What the line cuts** is drawn solid in the walls' tone, under the heavy outline the plan's cut
  walls have: the walls, with the sill and lintel round each door and window, the slab of each
  floor (open over a stair, a lift shaft or a void), the roof and any parapet, a stair the plan
  states, and the floor of a raised room. Parts that touch are one shape, not a rectangle each.
  A stair is cut as it is built (VEW-11): each flight its treads and risers over a waist, with
  the soffit beneath it parallel to its slope, joined to its landings, which are slabs; nothing
  under a flight or a landing is filled down to the floor. The waist is 0.15 m under the roots of
  the steps, square to the slope (`stairWaist` in [tolerances.md](tolerances.md)), and a landing
  at least one riser thick.
- **What lies beyond the cut** is drawn in a lighter line, the one a facade draws its faces set
  back in: the faces of walls, slab and roof edges and stairs that face you, with their doors and
  windows open, each hiding what is behind it. A stair beyond the cut shows its sides as its
  profile and its risers each at its own place and height (VEW-69), so seen at an angle they step
  up and away, and seen along the flight they leave the room under it open.
- **Fixtures and furniture** (CNT-48) are cut where the line crosses them and seen beyond it, as
  the plain blocks the 3D view stands them up as, on the floor of their room: a kitchen island
  cut across shows its height, with the run against the far wall beyond it. A cut item is drawn
  in paper with a light outline, over the cut and never joined to it, so it never reads as
  structure.
- **The ground** is a facade's ground line, the heaviest pen, at the site's ground level, or at
  the ground floor's level when the site states none. It runs out to the picture's edges, and
  stops only where the building stands through the ground: it runs on under a house on its plinth
  and over a basement that reaches under the garden.
- **The earth** under it is cut too (VEW-65): hatched as a material, over the picture's width,
  down to a metre under the lowest thing cut below the ground (`sectionEarthBelow` in
  [tolerances.md](tolerances.md)). The building's part below the ground is dug out of it, from the
  outside face of its walls and the underside of its lowest slab, so a basement, a car park's
  levels or a sunken room stands in its hole; the walls cut below the ground with the outside on
  one face hold the earth back (`grid_view kind=section` lists them as `retaining`). Where the line
  ends inside that part, the earth and the ground line stop at the cut's end. One ground level is
  taken for the whole site: a ground that slopes is not drawn yet.
- **The levels** stand beside the building (VEW-84), a small gap off its outermost part however
  far the line runs past it, each on a thin datum line back to what it marks: each floor's on the
  left, each roof's (its eaves and ridge, or its top, and the top of a parapet the line cuts) and
  the ground's on the right, in metres from the ground floor's floor level, as `±0.000`, `+2.950`.
  A floor or roof that stands off its side of the building and reaches the other, such as the
  upper half of a split level, is marked on that other side. Levels close together are staggered:
  the tick stays at the level and the words step up clear of the ones below, on a short leader.
- **Each room cut** carries its name and its height, floor to ceiling: its own `height` when it
  states one, else up to the slab or roof over its storey.
- **What the plan does not state and Grid takes** is listed under the drawing, and hatched where
  it is cut: a slab whose thickness the floor does not state, every roof (flat, as LVL-4 takes
  it), a wall whose height nothing states or that the plan marks assumed. A level worked out from
  the floors below, a ground level the site does not state, a room height taken from the storey,
  a stair room with no stated stair, a stair's worked-out risers and the waist its flights are
  drawn with are listed, not hatched.
  `grid draw` says on standard error how many it hatched and listed.
- **A roof the floor states** (`floors[].roof`, LVL-6): a flat one stands at its eaves. A sloped
  one (LVL-20) is cut along its slopes from the eaves to the ridge, and up over its dormers, a band
  as thick as Grid takes a roof (0.25 m, square to the slope), hatched; its edges beyond are drawn
  along the slope, and its eaves and ridge are marked on the right instead of one roof level. The
  walls under it are cut, and seen, up to the roof's underside over their line: an outside wall
  rises to it whatever height it states, so a gable end is closed, and the walls raised past their
  stated height are listed. A room under it that states no height is as high as the roof leaves it
  at its highest (the height `grid_measure what=room` gives), and its headroom bands, 1.5 m and
  2.2 m, are dashed lines over its floor where it has that much height.

A section cuts every floor and writes its levels in metres, so `--floor`, `--hide`, `--colour`,
`--key`, `--ids`, `--units` and `--decimal` are refused with it, by name; so are `--3d`,
`--view` and `--facade`, and `--marks` with any of them.

`--marks` adds the marks for the plan's other drawings to a floor plan, joined by commas:

- `levels`: each room's floor level under its name, worked out as for the section;
- `elevations`: a mark outside each of the plan's four main sides, 1.2 m beyond the drawing and
  its dimensions (`elevationMarkOffset`), its arrow at the side it shows, named by the way that
  side faces: by the north the plan states, else with north at the top of the drawing. Each is
  the side `grid draw --facade` draws from the drawing's side nearest it, north at its top;
- `section`: the line of `--section` as a chain line, heavy at its ends, with an arrow at each end
  looking the way the section looks, named A. With `section` in `--marks`, `--section` marks the
  plan instead of drawing the section;
- `schedule` (ARE-15): each room's and opening's mark in the schedules, in a box: a room's number
  over its name, and each door's, window's and doorless opening's `D1`, `W1` or `O1` beside it,
  on its wall's face away from a door's swing, or on a window's room side. Each mark is the one
  its row has in `grid_schedule` ([areas.md](areas.md#schedules)), so every mark has one row and
  every row one mark. `grid sheet --layout check` draws them on its floor pages.

```bash
grid draw plan.json --floor first --marks levels,elevations,section --section 4.9,-2:4.9,13
grid draw plan.json --marks schedule
```

A plan drawn without `--marks` is drawn as before.

## A facade: `grid draw --facade`

`grid draw --facade <side>` draws one side of the building in elevation (LVL-8): what a person
standing outside that side sees, looking straight at it, every floor stacked at its level. The
sides are the drawing's, as `grid describe` names them: `north` is the top of the drawing,
whatever north the plan states; the caption says which way that side faces on the earth when the
plan states its north.

It draws each wall's outside face from its floor's level to its height, with its doors and
windows at their sills and heads, the edge of the slab each floor stands on, the edge of each
roof over the parts with nothing above and its parapet, and the ground: at the level the
site states (`site.ground`), else at the ground floor's floor level, and nothing below it. The
levels are marked beside the building as a section's are (VEW-84), each on a datum line back to
it and staggered clear of the next: the ground, each floor, a sloped roof's eaves and ridge (its
underside there, the figures a section gives), a flat roof's top and a parapet's top, on the right,
or on the left for a floor or roof that stands off the right of the building and on its left. A plan's opening patterns are drawn as the openings
they place ([opening patterns](plan-file.md#opening-patterns)).

The lines are the look's own, as a plan's are: in the technical look, the default, millimetres on
paper from the pen set for the picture's scale; in the working look, pixels. The ground line is
the heaviest, the outline of the building against the sky the next, then the edges of the faces
on the front plane, and lighter again the faces set back from it (by more than `facadeSameDepth`,
[tolerances.md](tolerances.md)); doors, windows and the floor marks are the finest. A nearer face
hides what stands behind it.

Every wall that turns toward the side and that no nearer face hides is drawn, with its doors and
windows (VEW-25): the building's own outside walls, and on a floor with outdoor space the walls
round it too: a porch's front under the porch's roof, a terrace's parapet, a stair enclosure
standing on a roof terrace, and the front of a floor set back behind a terrace. A wall, or a door
or window, that nearer faces hide whole is left out of the drawing and of the facade's lists.

A curved wall (VEW-79) is one face, its silhouette, with no line where one of the straight
pieces Grid traces it by meets the next, so a round drum is not drawn fluted and a bay not as
boxes laid over each other; its windows stand where they are, narrower the further the curve
turns away. A section draws a curved wall beyond its cut the same way, one face for each run of
it that faces the person looking.

Each window is drawn as it is built (VEW-63): its frame, a sash for each part that opens, its
glass in a tone of its own (a pale grey in the technical look) with a bar where two panes meet, a
sill under it and a head over it. Its kind, stated or given by its window type, decides its panes,
as it decides the 3D view's: a fixed window has one, a pair two, a casement that opens in part a
fixed pane beside it, a sliding window two sashes passing. The sill (`facadeSillDepth`, running
past each side by `sillProjection`) and the head (`facadeHeadDepth`) are Grid's own drawing sizes,
[tolerances.md](tolerances.md): the plan holds neither, and a window from the floor has no sill.

It takes `--png`, `--out`, `--look` and `--scale` (PNG only), as a plan does, and the label in its
corner. It refuses `--3d`, `--view`, `--section` and `--floor` (a facade shows every floor) and
what belongs to a floor plan (`--ids`, `--hide`, `--colour`, `--key`, `--units`, `--decimal`,
`--marks`), by name. Stairs
stand inside and are not seen; a garden wall that bounds no room or outdoor space is not drawn. Under a roof a
floor states (LVL-6), each outside wall is drawn up to the roof, whatever height it states
(VEW-61): a gable end is drawn whole from the eaves to the verge, with no line at the walls'
height, the roof's edges follow its slope, and each plane of it that comes down toward the side is
drawn as a surface. A wall round outdoor space alone keeps its own height.

A sloped roof's plane is drawn as a roof (VEW-12), never as a blank face: its covering as level
courses along its eaves (1.5 mm apart on paper, 6 pixels on the screen), its ridge and hips in the
front plane's pen, its eaves, verges and abutments in its own, and a gutter along each eaves. An
agent reads the same lines from the facade: each band along a sloped roof's edge says which edge
it is (`edge`: `eaves`, `ridge`, `hip`, `verge` or `abutment`, where the roof meets more of the
building above), and each plane lists its edges as seen (`roofLines`). Elevations show a nominal
0.30 m overhang along the exposed edges of pitched roofs (VEW-71). The fascia, gutter and covering
follow the projected edge. Abutments stay where the roof meets the building above. The plan holds
no overhang dimension. Sections, the 3D model and roof quantities use the plan's roof footprint.

## A site plan: `grid draw --site`

`grid draw --site` draws the site plan instead of a floor plan (VEW-85): the plot seen from above
with every building of the plan on it, not only the lowest floor's. Each building is its
footprint in solid fill (its floors at or above its own ground floor, open outdoor space left
out, as `grid_measure what=site` measures it), with its name, its storeys and its height written
on it; a plan that names no buildings is one footprint. Round them: the plot boundary, the
site's things in their own style with the labels the person gave them, the set-back lines dashed
inside the plot at the person's own figures with the figure along each, the street edges drawn
heavier with the street's name outside them (VEW-88; the word for a street when the plan gives
no name), the context shapes round the plan, a scale bar
in the bottom-left corner and the north arrow when the plan states north. The picture is framed
to the whole site, so a plan of many buildings is never framed to one of them. The key under it
says what the fill and the lines are.

```bash
grid draw plan.json --site --out site.svg
grid draw plan.json --site --look working --png --out site.png
grid draw plan.json --floor first --with-site --out first-with-site.svg
```

It takes `--look`, `--png`, `--scale`, `--units`, `--decimal`, `--lang` and `--out`, and refuses
what picks a floor or belongs to another picture (`--floor`, `--frame`, `--ids`, `--hide`,
`--colour`, `--key`, `--marks`, `--3d`, `--view`, `--facade`, `--section`) by name.

`--with-site` draws the site faint under any floor's plan, framed with it: the plot, its things
and their labels, the set-back lines, the street edges and every building's footprint, so an
upper floor's evacuation map shows the assembly point outside. A street's name is set with
`grid_set_site street_names` or a street line in rooms text (`street south "Harbour Road"`).

## A sheet for people: `grid sheet`

`grid sheet [plan.json] [--layout client|check]` writes the plan as an A3 landscape PDF (the client sheet when no layout is named) into
`exports/` beside the plan (`<name>-client.pdf` or `<name>-check.pdf`), or to the `.pdf` that
`--out` names.

- `client` is a presentation for the person the building is for: a cover with the name, a
  headline, a few paragraphs, the 3D picture and up to six figures, then a page per floor with its
  drawing, its room areas and its own paragraphs (SHT-21):
  - The cover's figures start with the gross area and go on with the figures of the plan's kind
    of building (`building`, and each floor's own): homes and bedrooms for a home or a block of
    flats, guest rooms for a hotel, beds and operating theatres for health, platforms and gates
    for transport, classrooms for a school, seats and the clear height of the hall for culture and
    assembly, loading doors (a roller or garage door in an outside wall) and the clear height of
    the tallest room for a warehouse or industry, cells for custody, parking spaces for a car park.
    A plan that states no kind shows each count only where there is one. Then the floors, the
    floor to floor and the height to the roof, the gross external area and, with a site boundary,
    the floor area ratio (gross external area over the site's). Floors are counted, and floor to
    floor taken, by whole storeys: a mezzanine or a terrace inside a taller storey is set aside.
    Figures past six are one line under them, and the rounding rule is said once.
  - Three or more rooms of one use, of one net area, whose names differ only by a number at the
    end are one row of the floor's table: `60 × Bedroom`, the area of each and their sum.
  - Floors that are alike (the same walls, openings, items, stairs and rooms at the same places,
    ids and numbers aside) are printed once as a typical floor, whose subtitle names the floors it
    stands for; a floor with its own words in sheet.json, or with a part left out, keeps its page.
    When floors were folded, an area schedule by floor page and by use follows them.
- `check` is a working set for the person checking the plan: a summary in plain words with the
  number of findings and the three areas, then a page per floor with every room, door and window
  id on the drawing, the area of each room with its use, and every finding on that floor.
- Both layouts follow the floor pages with an elevations page and a sections page (SHT-23). The
  elevations are every side of the building, as `grid draw --facade` draws them; the sections are
  A, along the building's longer side, and B, across it, each cut through the largest room of the
  lowest floor, off any wall that runs along the line, from outside the building to outside it.
  Both lines are marked on every floor plan of the sheet. Every drawing on the two pages is at one
  scale, the largest of 1:50, 1:100, 1:200, 1:250, 1:500 and 1:1000 at which all of them fit, so
  printed at full size on A3 they measure true; each page has a scale bar and a title block
  (project, drawing, scale, date and status). The check sheet lists what the sections took that the
  plan does not state; the client sheet says in one line that they took some. A plan with no walls
  has neither page.

Its figures, tables and drawings are in the plan's `display`, the person's own units (feet and
inches with square feet, millimetres, a decimal comma), and in metres when the plan has none
([Units](plan-file.md#units)). The findings are in metres. SHT-26: a sheet in square metres
prints no square feet, and its footnotes (the rounding, the opening schedule's sizes) name the
units its figures are in. Every sentence of a sheet, its area rules, the schedules' rules and
the limits of the checks too, is in the sheet's language, and no sheet names a tool, an argument
or a command. A sheet is dated the day asked for (`--date`: a date, or a time's own written
day), else `SOURCE_DATE_EPOCH`'s day in UTC, else today where the machine is, never the UTC day.

The words of a client sheet are the author's, in `<plan>.sheet.json` beside the plan (`house.json` reads `house.sheet.json`; `plan.json` also reads an older `sheet.json`), or the file
`--sheet` names:

```json
{
  "version": "1",
  "name": "Example House",
  "headline": "A private retreat for one",
  "drawing": "Ground floor, as built",
  "intro": ["A two-storey home for everyday comfort, work and hosting."],
  "floors": {
    "ground": ["A dedicated study sits beside the entry.", "Wide garden openings lead out."]
  }
}
```

Every field but `version` is optional. `floors` is keyed by the plan's floor ids. A name holds
120 characters, a drawing title 120 (only a drawing at a scale reads it), a headline 200, a paragraph 1,200, and `intro` and each floor at most 3
paragraphs. Each string follows the plan's text rule. Without the file, the sheet carries the
plan's name and no words: Grid writes none in the author's place. A check sheet takes no words.

Grid refuses sheet text that calls the building accessible, wheelchair-friendly, barrier-free
or approved, or says it complies or passes (in English and Spanish). The refusal names the field
and the words. Quoted words within prose are left alone. Grid also checks a headline or
introductory paragraph wrapped in quotation marks. When the brief beside the plan holds your
access figures (`door_width`, `corridor_width`, `turning_circle`), the cover gives priority to
doors, corridors and turning spaces that measure under them, even when the introduction continues
on another page. It shows up to six measurements and says in one line when there are more (SHT-26: a sheet names
no tool; `grid_measure what=access` lists them all).

Grid draws only what the plan holds: no furniture or landscape, and no stair treads but for the
stairs the plan states. Every figure comes from
the same code as `grid check` and the area tools, and every page keeps the label "General
guidance, not your local rules". The pages use Source Serif 4 and Source Sans 3, under the SIL
Open Font Licence 1.1, which ship with Grid in `fonts/`. A sheet needs the canvas a PNG needs.

### One floor at a true scale: `--layout drawing`

`grid sheet [plan.json] --scale 1:100 --paper A4` (or `--layout drawing`) writes one floor as a
drawing to print and measure: a vector PDF, an SVG and a PNG to share, into `exports/` beside the
plan (`<name>-drawing-1-100-A3.pdf`, `.svg` and `.png`, the scale and paper in the name so
drawings at other scales sit beside it; `<name>-floor-2-drawing-1-100-A3` for the second floor of a
plan with several), or beside the `.pdf` that `--out` names.

- `--scale 1:N` (or `N`), a whole N from 1 to 1000. Printed at 100%, not fitted to the page, a
  length on the paper times N is its length in the building: at 1:100 a 10 m wall is 100 mm.
- `--paper A4|A3|A2|A1|A0`, turned the way the floor fits.
- Left out, the scale is the largest of 1:100, 1:200 and 1:500 the floor fits, and the paper the
  smallest that holds it at that scale. A floor too large for the paper asked for is refused, with
  the paper that fits it at that scale and the scale that fits it on that paper.
- Every floor is drawn, one page each, all at the one scale on the one paper: the scale and paper
  every floor fits. A plan of several floors writes one PDF of every page and an SVG and a PNG of
  each, `-page-1.svg`, `-page-2.png` and so on, under no floor's place in the name. A floor too
  large is refused by its name, and the refusal also says how many pages `--split` takes.
- `--floor <id>`: the one floor drawn, alone on its page.
- `--split`: a floor too large for the paper at the scale is cut into equal parts, the fewest the
  paper holds, each on its own page at that scale. Each part's notes say which part it is, and a
  dashed line marks each side where the next part continues. The paper is the one asked for, else
  A0, and the scale the one asked for, else 1:100. A floor that fits stays whole on its page.
- `--room-sizes on|off`: each room's width and depth along its walls. On when left out; the
  dimensions outside the plan are always drawn.

The floor is the technical look's drawing (`grid draw --look technical`): black on white, walls
joined at their corners, dimensions along the walls, lines in millimetres from the pen set for
the scale, and at 1:50 and larger the detail of each wall and opening. Its figures print at
2.5 mm and its room names a little larger. Under it are a caption (what it is, which floor, the
scale and paper), the notes (what the drawing leaves out, a door with no stated swing, a plan with
no north), a scale bar in metres and the north arrow, turned to the north the plan states; with no
north stated there is no arrow and a note says so. The title block, at the foot on the right,
holds the project (the name in `sheet.json`, else the plan's title, else the file's name), the
drawing (the `drawing` words in `sheet.json`, else "Ground floor plan" and the like), the scale and paper, the date, the status (Draft) and the label "General guidance, not
your local rules". The sheet's own text is 2.5 mm for notes and labels, 3 to 3.5 mm for values and
the caption, 5 mm for the drawing's name and 6 mm for the project's.

The three files are one layout in paper millimetres: the SVG writes it (its size in `mm`), and the
PDF and the PNG (150 dpi, at most 4,000 pixels on its longer side) draw it with Skia through the
canvas, every line and letter of the PDF as vector, on Linux, macOS and Windows alike.

## Who sits where: `grid occupancy`

`grid occupancy [plan.json]` reads the occupancy file beside the plan, `plan.occupancy.json`
beside `plan.json`, and prints each seat by its room's name, with its desk and the people at it.
A seat whose room the plan no longer has, after a room was renamed in its id or taken out, is
named by its place in the file (`seats[2]`), with the id it names. Without the file, the command
is refused and says where the file goes.

The file is kept apart from the plan so that people's names never travel with it: no export,
sheet or tool of the tool server reads it, and the tool server has no tool for it. Its format is
in [People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan).

## The preview in a browser: `grid preview`

`grid preview [plan.json]` serves Grid's preview as a page at `http://127.0.0.1:4178/`, or at
another free port when that one is in use (`--port` names one; `0` takes any free one), and keeps
running until Ctrl+C. Open it in a browser on the same computer: it listens on 127.0.0.1 only,
answers only requests addressed to 127.0.0.1 or localhost on its port, and takes calls only from
its own page. It is the page an agent's host shows beside the chat when it shows MCP Apps
([The preview, shared with the person](tool-server.md#the-preview-shared-with-the-person)), for
hosts and editors that do not.

The page shows one floor in 2D, the viewer's own drawing (wheel to zoom, drag to move, double
click to frame again), or the model in 3D (drag to turn it, wheel to move nearer). A click on a
part selects it: the agent reads it with `grid_preview`. The parts the agent picks out are
coloured, the room it frames fills the page, and its note is under the drawing. The page reads
the plan and the record beside it, `plan.preview.json`, every half second, and draws again
within 2 s of either changing. The plan is refused, and nothing is served, when it is outside
the project folder or cannot be read.
