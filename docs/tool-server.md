# The tool server

Read this when you are an agent calling Grid, or set up the host that starts it. `grid serve`
and `grid mcp` start the same server; the lines that install it in an agent are in the
[README](../README.md#installing-grid-in-an-agent).

- [The tools](#the-tools)
- [Asking across the parts: fields, find and count](#asking-across-the-parts-fields-find-and-count)
- [The label, and retelling a report](#the-label-and-retelling-a-report)
- [A camera you can set, and saved views](#a-camera-you-can-set-and-saved-views)
- [The preview, shared with the person](#the-preview-shared-with-the-person)
- [Measuring from faces, and a room's height](#measuring-from-faces-and-a-rooms-height)
- [What a change did](#what-a-change-did)
- [A note set aside as seen](#a-note-set-aside-as-seen)
- [Reporting a problem](#reporting-a-problem)
- [The guide and the plan's schema, as resources](#the-guide-and-the-plans-schema-as-resources)
- [Protocol versions](#protocol-versions)

## The tools

`grid serve` is an MCP server over standard input and output, for an agent's host to start.
Its tools are listed in a fixed order: first those that read the plan, in the order of the
requests people make most, with the problem report last of them, then the preview and the preview page's own call, the export, the sheet, the start marker, the seen mark and the brief, and last the thirteen that
change the plan, writing it rooms first leading and saving a view last. Every tool has a title, a read-only or destructive hint, an input schema with an example
and the allowed values of each argument, and an output schema. Each answer is short text with
the same facts as data; a view also returns its picture. A length argument is metres, or text with its unit (`12'6"`, `360 cm`); the measuring tools, the views and the sheet write in `units` and `decimal`, or the plan's `display`, the person's own units, and in metres when neither says (see [Units](plan-file.md#units)). The check and the edit answers are in metres.

| Tool | Answers |
|---|---|
| `grid_compare` | Options side by side (net, gross internal, gross external, circulation, area by use), and what differs by room name, walls and openings; a plan mirrored or moved is said to be so. With `picture`, one sheet at one scale |
| `grid_diff` | What changed since the start marker or the last commit, by what stands where, not by ids: issues first (a door that now joins other rooms, a wall that now meets an opening, notes that came and went), the verdict room by room with how many ids were only renamed, then the changes one line each; with `rooms`, the changes outside them; with a picture unless `picture: false` (see below) |
| `grid_areas` | Each room's size and net area, totals by floor and by use, gross internal and gross external area (the one usual in `country` first, or as `gross` asks; see [areas.md](areas.md)), each flat's area from the plan's flats list and the rooms in no flat, each to the middle of its party walls too (ARE-14), the outdoor space listed apart by kind, roofed or open (CNT-7), left out of every total unless `outdoor_rules` states a rule that counts part of it, the free floor beside the floor area where fixtures stand, and under a roof the floor states the floor by headroom band, in metres or feet, as text or CSV, each figure with its rule stated |
| `grid_takeoff` | Metres of wall by kind, per room floor, ceiling (with its height and lowered zones), skirting and wall face less openings, and per floor the slab and the roof over every part with nothing above, marked assumed, with the rules stated; with `for=estimate` the bill of quantities for a first estimate, each line with its key, rule and assumed mark, priced only from the person's rates file or given as a rate card ([areas.md](areas.md#quantities-for-a-first-estimate)); with `for=change` a plan's work as three lists, demolish, make good and new, priced the same way ([plan-file.md](plan-file.md#existing-demolished-and-new)); on a plan that names wall types or finishes, the walls of each named type and each finish's total too, and the estimate prices them by type and by finish ([areas.md](areas.md#finishes-and-wall-types)); text or CSV |
| `grid_schedule` | Doors, windows and openings by type and size, with the rooms each joins; with `of=rooms` the room schedule (number, name, use, area, height, floor, and the totals), with `of=openings` each opening once, with `of=flats` each flat and the unit mix by type, with `of=doors` or `of=windows` the door or window schedule by type (the plan's named types first, with their names and materials, then by kind and size) with each type's marks, with `of=finishes` the finishes plan, room by room, with each finish's total ([areas.md](areas.md#schedules)); a room's stated number and each part's facts of the person's own go with them; text or CSV |
| `grid_fields` | What can be asked of the plan: the fields Grid works out for each kind of part, with their units, and the facts of the person's own the parts carry, with how many carry each and their values (see below) |
| `grid_find` | The walls, doors, windows, openings, rooms or floors that meet every condition, by id, with only the fields asked for, and a `view` for `grid_view` that picks them out |
| `grid_count` | The parts that meet every condition, grouped by a field or fact, each group with its count, its sums and its ids, and a `view` for `grid_view` that colours each group |
| `grid_measure` | A room's sizes, height and widest circle; the clear distance between two walls, doors, windows or rooms, or to a point, from their faces; a wall's length; whether a box or a circle fits; the way between rooms with every door on it and how far it is walked, and whether a body or a trolley of a given width gets through, clear of the fixtures; a room's use indicators (turning circle, doorways' clear widths, the way through, the floor round each fixture, a window a fixture stands in front of); what is narrower than the person's own figure; which way each room, outside wall and window faces by the plan's north; which rooms get the sun, as a table of geometry per room (each window wall's way, the window area against the floor area, the depth from each window wall); the plot: how far the building stands from each edge of the site's boundary against the set-back the person asked for, each face's distance to the edge in front of it, and the plot coverage; and the accessibility measurements, as numbers (each door's clear width, each corridor's narrowest point, turning space, and the steps on the way in from the entrance); the library `grid_place_item` places from (`what=library`), and whether a library entry fits by its name (`what=fit` with `name`) ([library.md](library.md)) |
| `grid_view` | A floor plan (in the working look or black and white, always on light paper: `look` `dark` draws the working look and says so (SHT-10), with or without sizes, and with `ids` the check view: every room, door and window id on the picture and in the text, with areas, what each door joins, counts and the drawing's problems; with `crop` just one room, door, window or wall, by id or a room's name; with `hide`, `colour` and `key` what it shows, as `grid draw --hide`, `--colour` and `--key`, and with `colour` set to a field or fact, or `highlight` set to ids, the parts picked out (see below); always with each part's box in image pixels), a facade (`kind=facade` with `side`: one side of the drawing in elevation, every floor at its level, as `grid draw --facade`, with the walls, openings and levels it shows in `facade`), the model through a camera you set (a side or corner, or a bearing from the plan's north, with tilt, distance, eye height, lens and a room to point at), a saved view by name, or an eye-level view in a room with the window sills against the eye; every 3D picture with its camera record ([below](#a-camera-you-can-set-and-saved-views)); or with `kind` `section` a section along a line through every floor (`cut`, `toward`), its levels, room heights and what Grid takes hatched and listed in the picture, the text and `section` (LVL-9); a plan takes `marks` (`levels`, `elevations`, `section`, `schedule`) to mark them, as `grid draw --marks`; `schedule` draws each room's and opening's mark in the schedules; a plan with a trace image has it drawn under the floor, and the text says where it lies, its scale and how a pixel of it maps to the plan, or why it is not drawn ([a trace image under the plan](plan-file.md#a-trace-image-under-the-plan)) |
| `grid_describe` | The plan in room terms, as `grid describe`; with `length=walk`, walked room by room from its way in, standing in each doorway, with `pictures` a picture at eye height from each ([below](#a-routes-length-and-a-walk-through)); with `as=rooms`, as rooms text to change and write again |
| `grid_check` | The check, short and about this plan unless `full`, always labelled "General guidance, not your local rules", then the place the figures were for (the plan's `site.country`, or `country`; with none, no figure is applied); the notes the person set aside are listed under Seen; with `firm-standards.json` beside the plan, the firm's own standards' notes (`firm/…`) under their own heading, apart from the code figures ([firm-standards.md](firm-standards.md)) |
| `grid_report_problem` | A draft issue about a failure the agent met, for the person to file or not: Grid sends nothing (see below) |
| `grid_preview` | Shows the person a floor in 2d or 3d in Grid's preview, a room framed, parts picked out and a note, and answers with the picture the preview shows; with no argument but `plan`, reads what the person selected by clicking (see [below](#the-preview-shared-with-the-person)) |
| `grid_preview_sync` | The preview page's own call, which a host that shows MCP Apps lists for the page only: the drawing, the shared record, and what the person did there. Not for an agent |
| `grid_export` | Writes DXF, IFC, GLB or OBJ into `exports/`, and says what the file leaves out of the plan (the file says it too); a file that would hold nothing of the plan is refused. A DXF takes its layers and pens from `dxf-layers.json` in the project folder when there is one, and answers with it as `dxfProfile` ([what the DXF holds](commands.md#what-the-dxf-holds-hnd-1)) |
| `grid_sheet` | Writes the plan as an A3 PDF into `exports/`: layout `client` (cover, a page per floor, the words as `sheet`) or `check` (every id, use and finding); or layout `drawing`, one floor at a true scale (`scale`, `paper`, `floor`, `roomSizes`) as a vector PDF, an SVG and a PNG, with the PNG in the answer |
| `grid_mark_start` | Keeps the plan as it is now under a name, `start` unless named, in `plan.markers.json` beside the plan, for `grid_diff` to compare with; or takes one off. At most 5 |
| `grid_mark_seen` | Sets a note of `grid_check` aside as seen, with the person's reason and the name or role they give, in `plan.seen.json` beside the plan; or takes the mark off (see below) |
| `grid_write_brief` | Writes the brief beside the plan from the person's words, before the first room: room areas and counts, inside sizes, the footprint, rooms that must or must not touch, and the person's own figures, each with its level, its quote and whether it was given or assumed, and what is still open; answers with each line met or missed ([brief.md](brief.md)) |
| `grid_write_rooms` | Writes the plan from rooms text, as `grid write`: the walls, their kinds, the room boundaries and the openings' places worked out. With `layout` (`tidy` or `sizes`) in place of `rooms`, a first layout from the brief beside the plan, with each size not kept and by how much ([brief.md](brief.md#a-first-layout-from-the-brief)); with `scan`, from a phone room scan, as `grid write --scan`, with what was assumed and the scan kept beside the plan ([commands.md](commands.md#a-plan-from-a-phone-room-scan-grid-write---scan)). It takes one of `rooms`, `layout` and `scan` |
| `grid_change_opening` | Changes a door or window (width, height, sill, type, which room it opens into, which side it is hinged on as seen from a room, its kind), moves it to a side of a room, places it from a room's side or an end of its wall and keeps it there (its anchor), or removes it |
| `grid_change_type` | Changes one of the plan's named wall, door or window types (thickness, height, size, kind, glazed, material), and every part of it takes the change in the same call; adds a type, gives it to parts by id (taking out their own values for what it states), or makes it the default for parts that name none ([plan-file.md](plan-file.md#named-wall-door-and-window-types-and-finishes)) |
| `grid_move_room_side` | Moves one side of a room out or in, or to an inside size; walls ending on it follow, and openings keep their anchor or their place in the building |
| `grid_mirror` | Mirrors the plan left to right or top to bottom (`how`), or turns it a quarter or half round (`turn`: 90, 180, 270 or -90 degrees, counter-clockwise as Grid draws it) |
| `grid_merge_rooms` | Knocks two rooms into one, taking out the stretch of wall they share. Two rooms of different uses need `use`, or `zones` to keep both as zones of one open-plan room ([Zones inside one room](plan-file.md#zones-inside-one-room)); left out, the call is refused and asks. The verdict names any use the plan no longer has |
| `grid_split_room` | Splits a room with a new wall, the new room taking one side, with a door in it |
| `grid_add_room` | Builds a room against the outside of a side of a room, saying what happens to openings in the wall it covers |
| `grid_stretch` | Makes the whole building wider or longer, at its outside wall or through a room |
| `grid_rename_room` | Renames a room or changes its use, saying which checks now look at it, or names its floor, wall, ceiling and skirting finishes |
| `grid_square_scan` | Squares a scanned plan: turns each wall marked scanned (every wall with `all`) within about 3 degrees of the plan's main directions onto them, and says how far each wall turned and moved ([Where a value came from](plan-file.md#where-a-value-came-from)) |
| `grid_place_item` | Places a fixture, a piece of furniture or a typical room from the library by name, at a point and a turn, and says the room each item landed in and whether it fits: a wall it runs into, an item it stands in, the clear floor kept in front of one that something blocks; an office's entry from the library folder beside the plan is copied into the plan ([library.md](library.md)) |
| `grid_save_view` | Saves a camera record `grid_view` returned under a name, with the plan, in its `views`, as Grid's setting and as BCF's camera; with `replace` over a view of that name, with `remove` takes one out ([below](#a-camera-you-can-set-and-saved-views)) |

Every change answers with what it changed, what it guessed and what it could not keep, and
names the plan by its path in the project, so its size does not grow with the building. When a
brief is kept beside the plan, it answers with each of its lines met or missed too, and a size
written in a room's name is read against the room until the brief gives one; the first plan
written with no brief beside it gets one line saying so ([brief.md](brief.md)). When the plan
keeps lengths taped on site, every change, and `grid_check`, answers with the table of each one
taped against drawn, and `taped` in its data (HND-11,
[lengths taped on site](plan-file.md#lengths-taped-on-site)).

A tool that names no plan reads the project's `plan.json` in a folder `grid init` made. A floor
or room the plan does not have is refused with the ones it has, a room, wall, door or window
with the nearest id the plan has, and the word sent is never repeated back. A request line over 1 MiB and an id over 64 characters are refused, naming the
limit. A change that would leave the drawing with a new problem is refused and nothing is
written; otherwise only the change is written back, and keys Grid does not know stay. The
answer to a change also names every door or doorless opening that now joins other rooms, read
from where it stands: `bath-door joined bath and lounge; it now joins kitchen and lounge.`

Room names and ids go into every export and sheet, and travel with the plan file: never put a
person's name in a room's name or id. Who sits where belongs in the occupancy file beside the
plan, which no export, sheet or tool reads ([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).
`grid_write_rooms`, `grid_export`, `grid_sheet` and the server's instructions say so.

`grid_export` answers with what its file leaves out (HND-6): `leftOut`, how many parts, and
`leftOutParts`, each part with its `kind`, `id`, `place` (for a part left out when the plan was
read), `floor` and `code` (the line of `grid_check` that leaves it out). The file carries the
same note ([What an export leaves out](commands.md#what-an-export-leaves-out-hnd-6)). An export
that would hold no wall, room or fixture is refused, and nothing is written. `approximated` lists
the curved walls, and the rooms along them, that the file writes with their curve as straight
pieces (CNT-18), each with its `kind`, `id` and `floor`; empty for a plan with no curved wall.

`grid draw --ids` draws the same check view for a person: each room's id in brackets after its
name, and each door's and window's id beside it, upright.

## Asking across the parts: fields, find and count

Walls, doors, windows, rooms and floors may carry facts of the person's own: a fire rating, a
department, a room number, a head count ([Facts of your own](plan-file.md#facts-of-your-own-and-room-numbers)).
Three short tools ask across them, and across what Grid works out of every part (CNT-9). Each
is one call for one request.

- `grid_fields` lists what can be asked. Its `fields` are Grid's: `id`, `kind`, `floor`, a room's
  and a floor's `name`, a room's `number` and `use`, `area` (m², net, as `grid_areas` measures it,
  for rooms and floors), `height`, `width` and `sill` (m), a wall's `length` and `thickness` (m),
  `wall kind` and `virtual`, an opening's `wall`, `rooms` (the rooms beside a wall, or on an
  opening's two sides, `outside` where there is none) and a floor's `level`. Its `facts` are the
  person's, as the plan names them: each with its type (`text`, `number`, `yes-no` or `mixed`),
  the kinds of part that carry it, how many do, and its values.
- `grid_find` gives the parts that meet every condition in `where`: their `ids`, and `rows` with
  only the fields named in `fields` beside each id. "Which doors have no fire rating" is
  `{ "kind": ["door"], "where": ["fire rating is missing"] }`.
- `grid_count` groups the parts that meet every condition by the field or fact in `by`, and sums
  the fields of numbers in `sum`: each group's `value`, `count`, `sums`, `missing` (how many had
  no value to add) and `ids`, largest first and the parts that state none last, then the
  `total`. "Area per department" is `{ "kind": ["room"], "by": "department", "sum": ["area"] }`.
  A zone of a room (CNT-8) is counted in no group: its floor is its room's. The text names the
  zones left out; `grid_find` lists them, and gives a zone no `number`, since its room has one.

Both take `kind`, `floor` and `room` (the room, the walls beside it and the openings into it) to
narrow what is looked at. A condition is one line, a field or fact and a test: `is missing`,
`is set`, `=` and `!=` (text in any capitals; `yes` or `no`; a list holds the value), `<`, `<=`,
`>` and `>=` (numbers; a length may give its unit, as `width < 900 mm`), and `contains`. A part
with no value for a field meets only `is missing`. A fact is matched whatever its capitals,
spaces, dashes or underscores; one with the name of a field of Grid's is asked for as
`properties.<name>`. A field or fact the plan does not have is refused with the nearest name,
never with the word sent.

Each answer carries a `view`, the arguments of `grid_view` that show it: `grid_find`'s picks its
parts out in one colour (`highlight`, their ids), and `grid_count`'s colours each group of the
floor by its value (`colour`, the field it grouped by), with a key. The `floor` is the one that
holds most of them; `floors` lists every floor they are on. `grid_view` also takes either
argument by hand. Grid checks nothing against a fact: no answer says what a fire rating or a
head count means for the plan.

## The label, and retelling a report

Every answer's text starts with "General guidance, not your local rules", and its data carries
it as `label` (MSG-3); the server adds it where it answers, so no tool can leave it out. A
refusal is not an answer about the plan and has no label. The server's instructions tell the
agent how to retell a report (`src/mcp/retelling.ts`): start with the label and keep it; never
say a plan complies, is approved, meets code or has passed anything; give each figure as the
figure used here, with its basis and its status. The plugin's skill carries the same words.
`npm run retell` scores how well a model keeps to them (see the scoreboard's
[README](../scoreboard/README.md#the-retelling-set)).

## The person's language

`grid_check`, `grid_describe`, `grid_view` and `grid_sheet` take `language` (`en` or `es`; the
plan's own `display.language` when left out): Grid's own words, the label first, come back in that
language, with its decimal mark (MSG-11). The codes, kinds, ids, figures and each line's `values`
are the same in every language, so an agent can retell a result in any language from the codes
and values. Room names stay as written. The tools' own descriptions stay in English. For
`grid_view`, the picture's words follow the language (a plan's key and marks, a facade's or a
section's title, caption, level names and list of what Grid took); the answer's text stays the
tool's English, and a section's `assumed` keeps its English `words`. The Spanish words are a draft
translation, not reviewed yet ([Languages](languages.md)).

## A camera you can set, and saved views

Read this when the person asks for a 3D view from somewhere in particular ("the living room from
the south-west, from higher up"), asks to move one ("a bit lower and more from the left"), or
asks to keep one. `grid_view kind=3d` takes the camera (VEW-3):

| Argument | What it sets |
|---|---|
| `room` | The room to point at: the middle of its floor, half way up its storey. On a plan of several floors the room's floor is cut away unless `floor` says otherwise. The middle of the building when left out |
| `from` or `bearing` | Where the camera stands: a side or corner of the drawing (`south-east`, `above`; north is the drawing's top here, as in every argument), or a compass bearing in degrees from the north the plan states, or from the top of the drawing when it states none |
| `tilt` | Degrees the camera looks down; below 0 it looks up. At most 89 |
| `distance` | Metres from the camera to what it is pointed at |
| `eye_height` | Metres from the floor of the room pointed at (or the floor cut away, or the ground floor) up to the camera. With a tilt and no distance, the camera stands back along its bearing until it is that high; level, or with a distance, the point it looks at moves up or down to meet it |
| `lens` | The focal length in millimetres on a 36 × 24 mm sensor. 28.97 (45° tall, as the app opens) when left out |
| `floor` | The floor cut away: nothing above it is drawn |
| `camera` | A camera record `grid_view` returned, to start from |
| `view` | A view saved with the plan, by name, to start from |
| `turn`, `tilt_by` | From `camera`, `view` or Grid's own framing: walk round what the camera is pointed at, degrees to its left (below 0 to its right), and add degrees to its tilt (below 0 lower) |

Every 3D and eye picture comes back with its camera record in `camera`: the setting (`target`,
`bearing`, `bearingFrom`, `north`, `tilt`, `distance`, `lens`, `cut`), what follows from it on
this plan (`eyeHeight` above `floor`, the `floors` drawn, and `standingIn`, the room the camera
stands in or "outside any room"), and BCF's camera (`position`, `direction`, `up`, `fieldOfView`,
`aspectRatio`). The fields are in [the plan file](plan-file.md#saved-views-and-the-camera-record).
The text says the same in a few lines, and names the views the plan has saved.

"Lower and more from the left" is one call: send the last record back as `camera` with `turn: 20,
tilt_by: -10`, or with its `bearing` and `tilt` changed; both give the same camera. A record sent
back unchanged gives the same record, digit for digit. `grid_save_view` saves a record under a
name the person gives; `grid_view view=<name>` and `grid draw --view <name>` call it up with the
same record. A name already saved is refused unless `replace` is true. The app's 3D view opens
at a record handed to it (`Canvas3D`'s `camera`), and the stills are taken with the same
settings (`recordCamera`), so the person and the agent see the same picture.

## The preview, shared with the person

Read this when the person should see the plan while you talk ("show me", "where is that?"), or
says "this", "here" or "the one I clicked" (VEW-4). Grid's preview is one page with the plan in
2D and 3D. A host that shows MCP Apps shows it beside the chat: `grid_preview` names it as its
app (`_meta.ui.resourceUri`, `ui://grid/preview`), and the server lists it as a resource of type
`text/html;profile=mcp-app` that loads nothing from anywhere else. Anywhere else the person runs
`grid preview` and opens the page it prints in a browser on the same computer
([commands.md](commands.md#the-preview-in-a-browser-grid-preview)). Both pages show the same
thing, and draw again within 2 s of the plan file changing.

The person and the agent meet in one record beside the plan, `<plan>.preview.json`
(`plan.preview.json` beside `plan.json`), which the plan knows nothing of and no export, sheet
or drawing reads. It holds the same camera record as `grid_view`'s ([above](#a-camera-you-can-set-and-saved-views)):

| Field | What it holds | Written by |
|---|---|---|
| `view` | `2d` or `3d` | both |
| `floor` | The floor shown, or null for the lowest (in 3d, the whole building) | both |
| `camera` | In 3d, the camera record the preview looks through, or null for Grid's own view | both |
| `selected` | What the person clicked last: `id`, `kind` (`room`, `wall`, `door`, `window`, `opening`, `fixture`) and `floor`, or null | the page |
| `highlight` | The ids the agent picked out | `grid_preview` |
| `frame` | The room the agent framed, or null | `grid_preview` |
| `note` | The agent's note, at most 120 characters | `grid_preview` |
| `revision`, `changedBy` | One higher on every write, and who wrote it last (`agent` or `person`) | both |

`grid_preview` takes `floor`, `room` (framed, and its floor shown), `view`, `highlight` (ids, an
empty list for none), `camera` (a record `grid_view` returned; the view becomes 3d) and `note`.
It checks each against the plan, writes the record and answers with what the preview now shows,
what the person has selected, and the picture: `grid_view`'s plan with the parts picked out and
cropped to the room, or the model through the preview's camera, as an image with its text. A
host without the page loses nothing. Called with no argument but `plan`, it writes nothing and
answers with what the person selected and what the preview shows, without a picture. Its data:
`floor`, `view`, `room` (the frame), `note`, `highlight`, `selected` (`id`, `kind`, `name`,
`floor`, or null), `camera`, `revision`, `planFile`, `previewFile` and `shown` (false for a read).

On the page a click on the 2D drawing returns the id of the part under it (each part of the
viewer's SVG carries its `data-id`); a click on the 3D picture is turned into a ray through the
camera record and meets the nearest wall, door or window in its wall, or room floor
(`pickInModel`). Either becomes `selected`. In an MCP App the page also tells the host
(`ui/update-model-context`), so the selection reaches the agent's next turn without a call.
Dragging the 3D picture turns the camera and the wheel moves it nearer or further; both are
written as `camera`.

`grid_preview_sync` is the page's call (`_meta.ui.visibility` `app`). It takes `plan`, `since`
(the revision the page has), `look` (`working` or `dark`), and what the person did: `floor`,
`view`, `select` (an id), `clear`, `pick` (`x` and `y` on the 3D picture, 0 to 1 from its
top-left corner) and `camera`. It answers `changed`, `revision` (the drawing's key and the
record's revision), `planFile`, `record`, `selected` and `picked`; when the drawing changed,
`floors`, `parts` and `drawing` (2d: `svg` and each part's `box` in the SVG's frame; 3d: its
`camera`) with the picture as a PNG; when only the record changed, `drawing` is null; when
nothing changed, `changed` is false. Where the canvas a PNG needs is not installed, both tools
say so and still move the preview.

Which hosts show an MCP App from a local tool server is not settled here: Grid follows the
MCP Apps standard of 2026-01-26 and has been tried against a stand-in host, not a real one.

## Measuring from faces, and a room's height

`grid_measure` measures as a person with a tape does, so an agent does no arithmetic of its own.
`what=between` gives the clear distance from one wall, door, window, opening or room to another,
or to a point given as `x` and `y` (the plan names no points): a wall by its faces, an opening
by the edges of its hole in the wall, a room by its inside outline. A door's distance from the
inside corner is the distance between the door and the wall at that corner: in a house whose
entrance sits 1.00 m along the south wall's centre line, with a west wall 0.30 m thick, the
answer is 0.85 m, not 1.00 m. Two things on different floors are refused. `what=wall` gives a
wall's length on its centre line and the length of its face in each room beside it.

A room may state its height, floor to ceiling, in metres:

```json
{ "id": "loft", "name": "Loft room", "boundary": ["l1", "l2", "l3", "l4"], "height": 2.3 }
```

`what=room` gives the height and where it comes from, by this rule:

1. A height the room states wins, whatever its walls stand; the answer gives their heights beside it.
2. Otherwise, when the solid walls round the room all stand one height, the room is that high.
3. When they differ, the room is as high as the lowest of them, because a level ceiling rests on
   every wall round it. The answer names the lowest walls and the highest height.
4. Dividing lines stand no height and are left out. With no solid wall round it, the height is
   not known.

A wall that states no height gets 2.7 m, which cannot be told from a stated 2.7 m. The plan
comparison in `@ongrid/floorplan` (`diffPlans`) reports a room height stated, changed or taken out.

## A route's length, and a walk-through

`grid_measure what=route` (VEW-9) gives the rooms passed through in order (`rooms`), every door,
opening or open side on the way (`steps`) and how far it is walked (`length`, with each room's
share in `legs`). It is walked from the middle of the room it starts in (the centre of the
widest circle the room holds) to the middle of each doorway on the room's face, straight through
the hole to the middle of its other face, and on to the middle of the room it ends in, or to the
outside face of the door out with `to=outside`. Inside a room the line is the shortest that keeps
to its floor, round inside corners and holes. In the lab's two-bed flat, Bedroom 1 to the Hall
is 2.19 m in the bedroom, 0.10 m through the wall and 2.05 m in the Hall: 4.34 m. With `width`,
the way the body or trolley gets through by carries its `length` too. A length is null when a
room on the way has no outline Grid can measure.

`grid_describe length=walk` is the long form of the description: the plan walked room by room.
Each floor starts at its way in: the front door the plan names, else the widest door from outside
into a corridor, else the widest door from outside; a floor with no door from outside starts in
its stair room. The walk takes the ways on from each room from left to right as you stand in its
doorway, goes as deep as it can and comes back, so a room off a room comes straight after it. In
each room you stand in the doorway you came in by, at its middle, facing in square to the wall,
and what is in the room is said by the wall it is on: ahead (from left to right, each so far to
your left or right), on your left and on your right (each so far ahead), and in the wall you
stand in. A fixture is on the wall nearest its middle. Each wall comes with how far it is,
straight out from where you stand. A plan whose y runs down the page is the building mirrored,
and left and right are read the right way round. A floor laid out like an earlier one is said
once; `floor` walks one floor. A room no way reaches is listed as not reached.

With `pictures=true` the answer carries a picture from each doorway, at eye height (1.6 m), a
step into the room, looking ahead: VEW-3's eye camera, in the walk's order, at most 12 an answer.
`pictures` in the data lists each one's room, floor, eye height and heading. `grid describe
--length walk --pictures <folder>` writes them all into a folder that must be there, as
`walk-01.png`, `walk-02.png` and on. The walk checks nothing and says so.

## What a change did

Call `grid_mark_start` before an edit and `grid_diff` after every save. `grid_mark_start` copies
the plan as it is into `plan.markers.json` beside it, under `name` (`start` unless named); a plan
keeps at most 5 markers, and `remove: true` takes one off. `grid_diff` takes no plans to compare:
it reads the plan and the earlier version itself, the marker `since` names, or with
`since: "git"` the version last committed in the project's own `.git` folder, read from git's
files without running git. With neither, it uses the marker `start` when there is one, else git.
With `since: "phase"`, a plan with existing, demolished and new parts is compared with itself,
before its work against after it (CNT-10).

It pairs the two versions by what stands where before it trusts an id, as
[`grid diff`](commands.md#what-a-change-did-grid-mark-and-grid-diff) says, and answers issues
first, then a verdict room by room, then the changes one line each. `show` chooses how much:
`summary`, `changes`, `issues` or `all` (the default). Pass `rooms`, the rooms you meant to edit,
and every change outside them is named. A plan that is the earlier one mirrored or turned a
quarter or half round is said to be so first, in `turn` and in the line after "Compared with"
(`The plan is mirrored left to right (east and west swap), and every room keeps its size.`), and
compared from there, so a flipped flat is not every wall moved. Unless `picture: false`, and when something changed, it
returns one picture of a floor: removed in red, added in green, changed rooms in amber with their
old and new area, the rest pale. A plan written rooms first in both versions is compared by its
rooms and openings: widening the living room of the two-bedroom flat by 30 cm reads as two
lines, the living room's new size and the four rooms beside it moved 0.30 m as they were, and the
kitchen door stayed where it was.

## Use indicators: will it fit, can you turn, is the window blocked

Read this when the person asks whether a wheelchair can turn in a room, whether a trolley gets
along the hall, how much room there is beside a bath, or whether a fixture stands in front of a
window. `grid_measure` answers with use indicators (CNT-13): each line starts "Indicator,", says
what it measured, the width it set that against and whose width it is: the person's own, given
as an argument, or one of Grid's own indicators from the
[tolerance table](tolerances.md) (`useDoorwayClear` 0.8 m, `usePassageWidth` 0.9 m,
`useTurningCircle` 1.5 m, `useClearSpace` 0.6 m). Grid's own figures are indicators, never a
rule from any code, and the answer says so. Every measure keeps clear of the fixtures the plan
holds (`items`); furniture, radiators and the swing of a leaf are not in the plan.

| Ask | Call | Indicator (`code` in the data) |
|---|---|---|
| Can a wheelchair turn in the bathroom? | `what=use`, `room`, `diameter` (or Grid's own) | `use/turning-space`: the widest circle the free floor holds, and where |
| What clear width does each doorway leave? | `what=use`, `room`, `width` | `use/doorway-clear-width`: the widest stretch of the hole no fixture stands in front of (within `useApproachDepth`, 0.3 m), less `useOpenLeaf` (0.05 m) for a door's open leaf and stop |
| Is the way through the room wide enough? | `what=use`, `room`, `width` | `use/passage-width`: the widest body that gets from one doorway to another, or from its one doorway to its widest point, and what stands either side of its narrowest point |
| Is there room beside the bath? | `what=use`, `room`, `clearance` | `use/space-by-fixture`: the clear floor straight out from the front and each side of every fixture to the nearest wall face, doorway or fixture |
| Does anything block the window? | `what=use`, `room` | `use/window-blocked`: how much of a window's width a fixture higher than its sill stands in front of |
| Does a 0.7 m wheelchair get from the bedroom to the front door? | `what=route`, `room`, `to`, `width` | `use/passage-width` along the way: each doorway's clear width and the way through each room; when the way with the fewest rooms is too narrow, what stops it and another way that is wide enough, if one is |

The way through a room is measured on a grid of points `useRaster` (2 cm) apart, so a width is
found to within a few centimetres; where the way starts or ends it may start anywhere in the
room. A room bigger than `useRasterCells` points is measured on a coarser grid. `grid_check`
names a door whose leaf swings into a fixture (`opening/door-hits-item`, with the fixture's
label, kind and id), and a fixture standing in front of a doorway (`item/blocks-doorway`) or in
front of a window and higher than its sill (`item/blocks-window`), each with what it measured.

## Accessibility measurements, as numbers

Read this when the person asks whether they can get in and round the plan with a wheelchair, a
walker or a pram: how wide the doors are, how narrow the hall gets, whether they can turn, and
whether there is a step. `grid_measure what=access` (CNT-17) measures the rooms and routes the
plan marks as needing to be accessible ([`accessible`](plan-file.md#what-needs-to-be-accessible)),
or every room when it marks none, and says which. It takes only `plan`, `units` and `decimal`.

| What it lists | From | In the data |
|---|---|---|
| Every door and doorless opening of a room measured, or on a way: the hole in the wall, the clear width past an open leaf (less `useOpenLeaf`, 0.05 m, and any fixture in front of it), and its sill when it stands above the floor | CNT-13's `doorwayClearance` | `doors`: `id`, `type`, `between`, `hole`, `leaf`, `clear`, `sill`, `entrance`, `against` |
| Each room used as a corridor, at its narrowest from end to end (its two ends are the sides of its outline no wider than it, farthest apart); its widest circle when Grid finds no two ends | CNT-13's `passageWidth` | `corridors`: `room`, `narrowest`, `at`, `widest`, `against` |
| Each room's turning space: the widest circle its free floor holds | CNT-13's `turningSpace` | `turning`: `room`, `diameter`, `at`, `against` |
| The way in from the entrance to each room marked (and each route marked), room by room, with every step on it and its height: a door's sill, a change of level between rooms (LVL-7), the ground outside when the site states its level (LVL-4), and the risers of a stair; between floors a lift where one joins them, else a stair (LVL-3) | the way-out check's ways, `planSteps`, `groundLevel`, `floorJoins` | `ways`: `from`, `to`, `entrance`, `found`, `legs`, `joins`, `steps` (`kind`, `at`, `height`, `count`, `up`), `narrowest`, `cannotTell` |

The entrance is the front door the plan names (`front.opening`) when it leads outside, else
every door out of the ground floor. Where Grid cannot tell, the answer says so: the step from
the ground when the site states no ground level, the steps of a stair drawn only as rooms, a
floor no stair or lift joins. It ends with what it did not look at (`notLookedAt`): door leaves
and handles, thresholds other than a sill, ramps (the plan cannot state one), inside a lift,
fittings the plan does not hold, surfaces and heights of controls, the way outside, and whether
any number is enough.

A number is set against a figure (`against`, each `{ figure, short }`) only when the figure is
the person's own, from the brief beside the plan ([brief.md](brief.md): `door_width`,
`corridor_width`, `turning_circle` with its rooms, `step`), and every such line says "your
figure" (`figure.from: "yours"`, `figure.label: "your figure"`); or a figure from a code that a
named person has confirmed against its source (`confirmedFigure` in `@ongrid/rules`: status
`checked-once` or `checked-twice`, each check by a person, for the place the plan states and the
kind of building it was read for). No figure Grid holds is confirmed yet, so today none is used
and the answer says so. A door's width is set against the person's `door_width` by its clear
width, not its hole. No line says a room, a route or the plan is accessible.

`grid_check` gives a plan that marks anything one line, `plan/not-checked-access`: what is
marked was not checked, since Grid holds no figure for it that a named person has confirmed.

## Which rooms get the sun: a table of geometry

Read this when the person asks which rooms get the sun, which way the bedroom windows look, how
much window a room has for its size, or how deep a room runs from its windows. `grid_measure`
with `what=sun` (BRF-5) answers with a table per room, and `room` gives one room's. It is
geometry and nothing more: Grid works out no sun path, shade, sky, glass or reflection, and the
table says nothing of how much daylight or sun a room gets, nor whether that is enough. Every
line of the table starts "Geometry,", after the label and the north.

| Column | What it is |
|---|---|
| Window wall | A stretch of outside wall with a window in it, behind the room, as `what=facing` finds it |
| Faces, bearing | The way the wall's outside face looks: the bearing in degrees clockwise from north and the nearest of the eight points of the compass, turned by the plan's `north` |
| Windows | Each window in that stretch: its hole in the wall, width by height, and that area, with no frame taken off |
| Window area against floor area | The windows' areas added up for the room, and that as a share of the room's net floor area (`windowToFloor`, a ratio in the data, a percentage in the text) |
| Depth | The distance, square to the window wall, from its inside face to the farthest point of the room's floor. An L-shaped room is as deep as the leg that runs farthest from the wall |

North is read from the plan as `what=facing` reads it. A plan that states no north is answered
with north as the top of the drawing, and the line after the label says so first; each window
wall's line then says "if the top of the drawing is north". Doors and openings are not counted,
glazed or not, because the plan does not say which are glazed. A room with no window in an
outside wall gets one line saying so. For the lab's two-bed flat with `"north": 30`:

```text
North, as the plan states it: 30° counter-clockwise from the top of the drawing (north 30).
Geometry, not a daylight result: each room's window walls, the way each faces, the window area against the floor area, and how deep the room runs from each window wall.
Geometry, "Living room" ("living"): floor 18.48 m², windows 4.52 m², 24.5% of the floor area, in 2 window walls.
Geometry, "Living room" ("living"), window wall "ext-south": faces south-west (bearing 210°); windows "win-living-south" 1.80 m wide × 1.50 m high, 2.70 m²; the room runs 4.20 m deep from its inside face.
Geometry, "Hall" ("hall"): floor 5.33 m², no window in an outside wall.
```

The table lives in `grid_measure` and not in a tool of its own, so it adds no tool: it reads
the same walls and north as `what=facing`, and it measures rooms as `what=room` does. The
geometry is `planSunTable` in `@ongrid/floorplan` (`src/geometry/sun.ts`).

A zone (CNT-8) is part of its room, and the room is the place: `what=use` on a zone, and
`what=route` from or to one, measures its room as a whole, says so on its first line, and names
the zone asked for in the data (`zone`, `fromZone`, `toZone`).

## The plot: distances to the boundary, and the coverage

Read this when the person asks how far the house is from the boundary, whether it keeps the
set-back they asked for, or how much of the plot it covers. `grid_measure` with `what=site`
(BRF-3) answers from the site's `boundary`, `streets` and `setbacks`
([plan-file.md](plan-file.md#the-plot-its-boundary-set-backs-and-what-is-on-it)). It takes no
other argument. The building is measured from its outside face: the outer faces of the walls of
every floor at or above the ground floor, as one shape seen from above.

- **The plot**: its area, how many edges it has, and which are on the street.
- **Plot coverage**: the part of the building's shape inside the boundary against the plot's area.
- **Each edge**: the least distance from the building, with the set-back asked for that edge
  beside it and how far short of it the building stands, or how far it reaches over the edge.
  The set-backs are the person's own figures, under their heading; no line says a distance is
  enough.
- **Each face**: its way, its length and its distance to the edge of the boundary in front of
  it, square to the face.

North is read as `what=facing` reads it, and a plan that states none is answered with north as
the top of the drawing, said first. The lab's house slid 2 m east in its 15 × 30 m plot, with 3 m
asked from every edge (EL-16):

```text
North, as the plan states it: up the drawing (+y) (north 0).
The plot: 450.00 m² inside a boundary of 4 edges; on the street: edge 1 (the south boundary).
Plot coverage: 20%, the building's 90.00 m² on the 450.00 m² plot.
The person's own figures: theirs, not from any code or standard.
From each edge of the boundary, the least distance to the building:
  Edge 1, on the street: 10.00 m from the south boundary; you asked for 3.00 m.
  Edge 2: 1.00 m from the east boundary; you asked for 3.00 m: 2.00 m short.
  Edge 3: 10.00 m from the north boundary; you asked for 3.00 m.
  Edge 4: 5.00 m from the west boundary; you asked for 3.00 m.
```

The data holds `boundary` (`area`, `problem`, and each edge's `edge`, `from`, `to`, `length`,
`faces`, `bearing`, `street`, `name`, `setback`, `distance`, `past`, `short`, `face` and
`floor`), `footprint` (`area`, `floors`), `coverage` (`ratio`, `percent`, `covered`, `plot`),
`faces` and `things`. `grid_check` gives the same shortfall as a finding,
`plan/setback-short`. The geometry is `siteMeasures` in `@ongrid/floorplan`
(`src/geometry/site.ts`).

### How much fits: massing, storeys and the person's site limits

Before any wall exists, a floor may state its outline (BRF-4,
[plan-file.md](plan-file.md#a-floor-outline-before-the-walls)), and the answer measures it as it
would the walls: after the plot's lines come the storeys and each floor's gross external area,
massing marked as such, then "Site limits": the person's own `plot_coverage`, `floor_area_ratio`,
`building_height` and `parking_per_home` from the brief beside the plan
([brief.md](brief.md#the-persons-own-figures)), and the plan's set-backs edge by edge. Each says
what is used, the limit and met or not met, and how it was measured, naming the area rule: Grid
brings no limit, proposes no layout and optimises nothing. FD-1's massing, two floors of the
outline (3, 5), (15.762, 5), (18.482, 22), (3, 22) on the lab's 500 m² plot:

```text
Storeys: 2 storeys at or above the ground floor, none below it; counted by level, from the floors that hold an outline or walls that close one.
  "Ground floor": gross external 240.07 m², massing: its outline, no walls yet.
  "First floor": gross external 240.07 m², massing: its outline, no walls yet.
Site limits, the person's own figures: theirs, not from any code or standard.
  Plot coverage: used 48.0%, your limit at most 40%: not met. Measured as the building seen from above, every floor at or above the ground floor, inside the plot's boundary, over the plot's area: 240.07 m² over 500.00 m².
  Floor area ratio: used 0.96, your limit at most 1: met. Measured as Gross external area (…), of every floor at or above the ground floor, over the plot's area: 480.15 m² over 500.00 m².
  Building height: used 6.50 m, your limit at most 9.00 m: met. …
  Parking per home: used 0.75 spaces per home, your limit at least 1 space per home: not met. …
```

The data adds `storeys` (`above`, `below`, `storeys`, `empty`), `limits` (each `limit`, `edge`
for a set-back, `state` `met`, `missed` or `not-measured`, `used`, `allowed`, `most`, `unit`,
`rule`, `why`, `assumed`, `source`) and `brief`. The same limits are lines of the brief in every
change's answer. `grid_areas` gives the storeys too (`storeys`, and a line when a floor is
massing). The geometry is `planStoreys` and `buildingHeight` in `@ongrid/floorplan`
(`src/geometry/storeys.ts`); the limits are `siteLimits` (`packages/cli/src/quantities/limits.ts`).

## A note set aside as seen

`grid_check` answers short by default (MSG-10): the notes, the figures they used, what each
check looked at in counts, and one line on what `full: true` adds (the checks run, every figure
and what these checks never look at). Its data is the whole record either way.

When the person has read a note and asks to set it aside, `grid_mark_seen` marks it: the note's
`line` number and `code` as `grid_check` gave them (with the same `country`), the person's
`reason`, and `by`, the name or role they give. An agent never guesses either, and never marks a
note the person did not ask about. The tool writes `plan.seen.json` beside the plan, never the
plan, and refuses a number that now names a note of another code. A seen note is not dealt
with: `grid_check` still lists it, under Seen, with the reason and who marked it, and lists it as
new again, saying so, as soon as one of its parts changes. `unmark: true` takes a mark off. The
marks file and its format are in the [result contract](result-contract.md#the-short-report-and-seen-notes).

## Reporting a problem

`grid_report_problem` turns a failure an agent met into a draft issue, and sends nothing. It
reads the plan, writes nothing, and is marked read-only. The agent passes the tool it called,
the call's arguments and answer, what it expected, and the code of the result record's line the
problem is about (or the ids of the parts, `parts`), and may pass its client's name. The draft
holds:

- Grid's version, the result record's version, and the protocol version when the request names
  it (a 2026-07-28 client does; after `initialize` the server keeps nothing, so it says so);
- the call, its answer (the first 4,000 characters) and what the agent expected;
- the record's line for that code: its message, what was found and needed, and the fix; for a
  plan the command refuses, the refusal and the record that says so;
- the smallest plan that shows it: the parts the line names, in `also` or quoted in its words,
  and the parts named, with what they touch. A room brings its walls, a door or window its wall,
  and a wall named itself the walls that cross or meet it and its openings. With nothing named,
  the whole plan.

The plan and every text of the draft are cleared before they are shown. Room names are replaced
by their uses (`bedroom`, `bedroom 2`, or `room`), every id by its kind and a number
(`wall-3`, `door-2`), a floor's name by `floor 1`. A fixture's label, the trace image, the
project id, the record of how the plan was written and any field Grid does not know are left
out; only numbers and Grid's own words are kept. Paths, file names, web addresses and email
addresses in the arguments, the answer and what was expected become `<path>`, `<file>`,
`<address>` and `<email>`. What is left follows the plan's text rule. Room names and ids go into
every export, which is why they are never filed as they are
([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).

The answer holds the draft (`title`, `body`, `labels`) and `link`, the repository's issue form
with the title, the `agent-drafted` label and, when the link stays under about 8 KB, the body
filled in (`linkHasBody`). The form is `.github/ISSUE_TEMPLATE/agent-drafted.md`. The agent
shows the person the draft exactly as returned; the person opens the link and files it, or not.
An agent never files, posts or sends it.

## The guide and the plan's schema, as resources

Besides the preview page, the server offers two resources an agent reads before its first plan
(CMD-7): `grid://guide`, the [guide for agents](agent-guide.md) as markdown, and
`grid://schema/plan`, the plan file's structure as a draft-07 JSON Schema with its format
version, the same file the build writes beside the command (`plan.schema.json`). Both are made
from the code when they are read, so they say what this Grid reads. The server's instructions,
which carry the guide's first paragraphs word for word and point to both resources, are sent on
`initialize` as well as on `server/discover`.

## Hosted mode

Read this when Grid is to be reached by address from a chat app (Claude, ChatGPT) instead of
started by a host on one computer (AIV-19).

`grid mcp --http [--port <n>] [--host <address>]` (and `grid serve --http`) serves the same tools
over MCP Streamable HTTP: one endpoint, `POST /mcp`, answered with one JSON message each. It is
stateless: no session, no account, nothing stored, and it reads and writes no file of its own.
It listens on 127.0.0.1 and port 8787 unless told otherwise (`--host 0.0.0.0` to be reached from
other computers); `GET /healthz` answers `ok`. `--project` does not go with it.

- **The plan travels with the call.** Every tool that takes `plan` takes `plan_json` instead: the
  whole plan, as the JSON object a plan file holds (a JSON text of it is read too). The server
  puts it in a project that lives in memory for that one request, runs the tool exactly as it
  runs on a file, and drops it. The tools that change the plan answer with the changed plan as
  `plan_json`, in the data and, compact, at the end of the text; pass it to the next call. There
  is no `out`.
- **Which tools.** The reading tools and the tools that change the plan, as `grid_` names. Not
  offered: the export, the sheet, the start marker, the seen mark, the brief, the preview and its
  page call, `grid_compare` (it takes two files), `grid_diff` (it reads git) and
  `grid_report_problem`. `grid_write_rooms` takes rooms text only, with no `plan_json` for a first
  plan and no scan or layout. The one added tool is `grid_show_plan`.
- **The plan's page.** `ui://grid/plan` (`text/html;profile=mcp-app`) is an MCP App that draws the
  plan floor by floor from the viewer's own SVG. `grid_show_plan` and every tool that changes the
  plan link it with `_meta.ui.resourceUri`, and send the drawings in the result's `_meta`
  (`grid/drawings`), which the page reads and the agent is not shown. It loads nothing and calls
  nothing; a host that shows no MCP App shows the text only (`grid_view` gives a picture).
- **Limits.** A request is JSON (`Content-Type: application/json`) of at most 1 MiB, else 415 or
  413. `GET` and `DELETE` are 405: there is no stream and no session. A browser call is let
  through only from `https://claude.ai`, `https://chatgpt.com` and `https://chat.openai.com`, with
  that origin echoed, never a wildcard; any other `Origin` is 403, and a call with none (a
  server's) needs none. On a loopback address, a request addressed to another name is 421.
- **The label stays.** Every result still leads with "General guidance, not your local rules" and
  carries it as `label`; no result says a plan complies or is approved.

Grid does not host this itself: running it for others (its address, its uptime, its cost) is the
person's decision.

## Protocol versions

The tool server answers clients of both eras of the protocol: an older client that opens with
`initialize` (2024-11-05, 2025-03-26 and 2025-06-18), and a 2026-07-28 client that sends no
handshake, names its version in each request's `_meta` and starts with `server/discover`. A
version it does not speak is refused with the ones it does. It keeps no state between calls:
the plan file is the only state.
