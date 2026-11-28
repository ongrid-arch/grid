# The brief

Read this when you keep what a person asked for beside their plan, or need to know what a line
met or missed after an edit means.

- [What the brief holds](#what-the-brief-holds)
- [Totals, floors, departments and rooms inside a room](#totals-floors-departments-and-rooms-inside-a-room)
- [One wish added, removed or changed](#one-wish-added-removed-or-changed)
- [The person's own figures](#the-persons-own-figures)
- [Met and missed after every change](#met-and-missed-after-every-change)
- [A size written in a room's name](#a-size-written-in-a-rooms-name)
- [The first plan with no brief](#the-first-plan-with-no-brief)
- [A first layout from the brief](#a-first-layout-from-the-brief)

## What the brief holds

The brief is what the person asked for, kept in a file of its own beside the plan:
`plan.brief.json` beside `plan.json`, `option-b.brief.json` beside `option-b.json`. It is read
and written only inside the project folder, like the plan. The plan knows nothing of it, and no
export, sheet or drawing reads it.

An agent writes it in one call, `grid_write_brief`, from the person's words, before the first
room is drawn: the plan need not exist yet. The call replaces the whole brief; with no `brief`
it reads the one there and writes nothing. A plan that is there and that Grid refuses is refused
here too, as by every tool, and no brief is written.

```json
{
  "version": "1",
  "rooms": [
    { "name": "Bathroom 1", "area": 4.5, "level": "must", "source": "given", "quote": "a small bathroom, about 4.5 square metres" },
    { "use": "bedroom", "count": 3, "level": "must", "source": "given", "quote": "three bedrooms" },
    { "name": "Kitchen", "inside": [3, 4], "level": "should", "source": "assumed" }
  ],
  "footprint": { "width": 10, "depth": 12, "level": "should", "source": "given", "quote": "the plot takes about 10 by 12" },
  "touch": [{ "rooms": ["Kitchen", "Bathroom 1"], "level": "avoid", "source": "given", "quote": "not the bathroom next to the kitchen" }],
  "figures": {
    "heading": "The person's own figures: theirs, not from any code or standard.",
    "door_width": { "value": 0.8, "level": "must", "source": "given", "quote": "my chair needs 80 cm doors" }
  },
  "open": [{ "quote": "somewhere to work from home", "about": "its size, and which room" }]
}
```

- **A room wish** names one room by the name it has in the plan (`name`, any case, or its id; a name also means the rooms numbered after it, "Consult" for "Consult 1" and "Consult 2", and a count line lists the rooms it counted),
  or the rooms of a use (`use`). It may give a `count` (exactly how many) or `count_at_least` and `count_at_most` ("at least 4 toilet rooms"), always rooms and never square metres, a net area (`area`, about; or `at_least`,
  `at_most`, in m² only) and an inside size (`inside`, metres, either way round). With none of them it
  asks only for the room to be there. A name also means the rooms whose room type (`roomType`) it is,
  and a name in the plural the rooms named in the singular ("Phone booths" counts "Phone booth 1"
  to "Phone booth 6", ARE-67).
- **Seats, desks and covers** (ARE-67): a room wish may give `seats`, `desks` or `covers` (a cover
  is a seat at a table), exactly, or `<what>_at_least` and `<what>_at_most`. They are counted from the
  furniture as [`grid_measure what=seats`](tool-server.md#seats-desks-and-covers-counted-from-the-furniture)
  counts them: in the room, in a zone when the wish names one, or in all the rooms of the name or
  use together, the line listing each room's count. A wish that gives none of them but whose quote
  says a number of seats, covers or desks ("a cafe with 24 seats") is counted against at least that
  many, and the line says the number was read from the person's words.
- **The footprint** gives the outside sizes (`width` and `depth`, either way round) or the area
  it covers (`area`), or both. With `measure: "inside"` (ARE-69) they are measured inside the
  outside walls: the sizes of the box round the ground floor's rooms, the area its gross internal
  area. Left out, `outside`.
- **Rooms that touch**: two rooms' names that must share a wall (`must`, `should`) or must not
  (`avoid`). Rooms kept apart are judged by the ways between them too: a door straight between
  them, or a way through other rooms by open gaps only (doorless openings and open edges), joins
  them, and the line names the rooms and gaps that do ("joined through "Reception" by two open
  gaps"). A door anywhere on the way keeps them apart, and the line says so; the outside is never
  a room between.
- **Every wish has a level**: `must`, `should`, or `avoid`, a wish for the drawing not to hold
  it (no garage; the bathroom not next to the kitchen). The footprint and the figures take
  `must` or `should`.
- **Every wish says where it came from**, in the words a plan's own marks use: `given` by the
  person, with their words in `quote` (a given wish without them is refused), or `assumed` by the
  agent, for the person to confirm. An assumed figure is written "assumed 4.5", not "asked 4.5".
- **What is still open**: the person's words for something with no figure yet go in `open`, with
  what is still to ask in `about`.

A wish Grid cannot read is refused naming its place (`rooms[2].area must be a number of square
metres above 0…`), never repeating the person's words. It names every fault of that wish, not
the first, joined by `;` (MSG-33). The wish is left out and returned in `refused`; the other
wishes are written. A field the brief does not take (`notes`), a list that is no list and figures
that are no object are refused lines of their own the same way, and the rest is kept. Only a
brief with no wish Grid can read, or a wrong `version`, writes nothing.

## Totals, floors, departments and rooms inside a room

ARE-69. A room wish may say more of what the person said:

- **`total_area`** (or `total_at_least`, `total_at_most`, m²): the net area of all the rooms the
  wish means together, one line. "About 30,000 m² of offices" is
  `{ "use": "office", "total_area": 30000 }`, never `area`, which is each room's own.
- **`floor`**: only the rooms on that floor, by its id or name, any case: a wish per floor.
- **`fact`**: only the rooms carrying a fact of the person's own (`properties`, CNT-9),
  `{ "name": "department", "value": "Surgery" }`, the value left out for any: a wish per
  department. The line names both: `rooms used as ward on floor "Level 2" with department "Surgery"`.
- **`with_inner: true`**: each room measured with the rooms inside it, those whose every way in
  is through it (an en-suite, a wardrobe), on its floor. The line names them: `"Bedroom 1" with
  "En-suite 1" inside it area asked 15.75, drawn 15.75 m²`.
- **`diameter`** (m): about this diameter, the widest circle the room holds, as `grid_measure`
  gives it, for a round room or courtyard; met within 5%.

**Many rooms missed the same way** are said as one line: when a wish's sizes (area, inside or
diameter) miss in four rooms or more, the misses are one line with how many of how many, the
size drawn, the same or from least to most, and the rooms by name (at most 12, then how many
more), its `parts` every room. A size asked per room far above the largest drawn (more than
twice) adds that a total is given by `total_area`.

## One wish added, removed or changed

ARE-69. Every line names its wish's place in the brief in `where`: `rooms[2]`, `touch[0]`,
`open[1]`, `footprint`, `figures.door_width` (null on a size read from a room's name). To change
one wish, `grid_write_brief` takes, in place of `brief` and with no `replace`:

- **`add`**: wishes as a brief holds them. Rooms, touch and open go after the ones kept; a
  footprint, a figure or `people` replaces its own. With no brief kept, it starts one.
- **`remove`**: places to take out, each as the brief is before the call.
- **`update`**: `{ "where": "rooms[0]", "with": { "area": 5 } }`: the fields to set on one wish,
  a field set to null taken out.

The update comes first, then the removals, then what is added, and the brief is read again whole:
a wish made wrong is refused as any line is, and a place the brief does not hold is refused naming
it. `brief` together with any of them is refused.

## What a write replaced, and the brief kept with a marker

CMD-57. A write over a brief kept, whole with `replace: true` or one wish at a time, says what it
replaced, wish by wish, and gives the brief it replaced in its data as `replaced.previous`, in the
form `brief` takes, so passing it back with `replace: true` puts it back. `replaced` is null when
there was no brief before. Each wish is paired with the one it was by what it is about, not by its
place: a room wish by its name or use, floor and fact; a touch by its two rooms; an open wish by
its quote; the footprint, a figure and `people` by their key. A wish is:

- **weakened** when it asks for less: a must made a should, a smallest figure lowered, a largest
  raised (an `_at_most`, a step, a site limit), or a figure taken out of it;
- **tightened** the other way round;
- **changed** for anything else: a quote, its source, an about size, a level to or from avoid;
- **removed** or **added**.

The weakened and removed come first. `grid_mark_start` (and `grid mark`) keeps the brief beside
the plan with the marker, and `grid_diff` since that marker lists the brief's changes the same way
(see [the tool server](tool-server.md#what-a-change-did)).

## The person's own figures

The figures under `figures` are the person's, not a code's or a standard's. The file holds them
under the heading "The person's own figures: theirs, not from any code or standard.", and every
answer lists them under it. Grid knows five sizes, all in metres, four site limits (BRF-4) and three counts of the furniture (ARE-67), and the whole plan's efficiency, homes and storeys (ARE-69):

| Figure | Measured as | Short of it |
|---|---|---|
| `door_width` | the clear width every door and doorless opening leaves, leaf by leaf, as `grid_measure what=access` gives it; with `measure`, `leaf` (the leaf it opens by) or `hole` (the hole in the wall) instead | narrower |
| `corridor_width` | each room used as a corridor at its narrowest point from end to end, clear of fixtures, the figure `grid_measure what=access` gives, with a line saying where it is and whether it meets the figure for each measured corridor | less |
| `turning_circle` | the widest circle each room holds, in the empty room; `rooms` names the rooms it is for, every room when left out | less |
| `step` | the sill of every door and doorless opening above its floor; 0 for none | higher |
| `ceiling_height` | each room's height, as `grid_measure` gives it | lower |
| `plot_coverage` | a percentage: the building seen from above, every floor at or above the ground floor, inside the plot's boundary, over the plot's area | more |
| `floor_area_ratio` | the gross area of every floor at or above the ground floor over the plot's area, by `measure`: `gross_external` or `gross_internal` ([areas.md](areas.md)) | more |
| `building_height` | metres from the ground (`site.ground`, else the ground floor's floor level) to the top of the highest roof | more |
| `parking_per_home` | the parking spaces the floors state over the homes they state (`floors[].parking`, `floors[].homes`); 0 for none | fewer |
| `seats`, `desks`, `covers` | ARE-67: the whole plan's seats, desks or covers, a whole number, counted from the furniture as `grid_measure what=seats` counts them; the line gives each floor's count | fewer |
| `efficiency` | ARE-69: a percentage, the whole plan's lettable area over its gross internal area, as `grid_areas` gives it ([areas.md](areas.md)) | less |
| `homes` | ARE-69: a whole number, the flats the plan lists (`flats`), else the homes its floors state | fewer |
| `storeys` | ARE-69: a whole number, exactly: the floors at or above the ground floor | other than asked |

**A figure for some rooms, uses, a fact or a way** (ARE-69): `door_width`, `corridor_width`,
`turning_circle`, `step` and `ceiling_height` take `rooms` (by name), `uses`, `fact` (as on a room
wish) and `routes`, each `{ "from": "Ward", "to": "Theatre" }`, from the entrance when `from` is
left out. A room is measured when it is named, of a use, carries the fact or is on a way; a door
when it opens into a room named, of a use or carrying the fact, or is on a way. A way is the one
with the fewest rooms between, on one floor, by the doors and openings `grid_measure` walks; a way
Grid cannot find is an open line, and nothing on it is measured. With none of them, every room and
door is measured, as before. A bed-sized door width is
`{ "value": 1.1, "routes": [{ "from": "Ward", "to": "Theatre" }] }`. `grid_measure what=access`
still sets every door against the figure.

The site limits are measured on the plan as drawn, massing or walls
([plan-file.md](plan-file.md#a-floor-outline-before-the-walls)), and the plan's own set-backs
(`site.setbacks`) are reported with them: `grid_measure what=site` gives each as used, allowed and
met or not, with the area rule named
([the tool server](tool-server.md#the-plot-distances-to-the-boundary-and-the-coverage)). A ratio
that names no `measure` is measured by the gross measure usual for the plan's place, else by gross
external area, and the line says it was assumed, for the person to confirm. A limit that cannot
be measured (no boundary, a gross internal area on a floor with no walls, no homes stated) is open,
with the reason. Grid brings no limit of its own, and no line says a plan is allowed.

```json
"figures": {
  "plot_coverage": { "value": 40, "level": "must", "source": "given", "quote": "the plot can be 40% built on" },
  "floor_area_ratio": { "value": 1, "measure": "gross_external", "level": "must", "source": "given", "quote": "a ratio of one" }
}
```

`grid_measure what=access` sets its accessibility measurements against `door_width` (by a door's
clear width past its leaf), `corridor_width` (by a corridor's narrowest point), `turning_circle`
and `step`, and says each as "your figure" (CNT-17,
[the tool server](tool-server.md#accessibility-measurements-as-numbers)).

When Grid finds no two ends of a corridor, both the brief and the access measure give the widest
circle it holds and say why.

A door is judged by one rule wherever a figure meets it (ARE-27): the brief's lines,
`grid_measure what=access`, a firm's `door_clear_width` and `grid check` read the same width, and
each says which width it measured. `door_width` takes `measure`: `clear` (left out, the default),
`leaf` or `hole`:

```json
"door_width": { "value": 0.9, "measure": "leaf", "level": "must", "source": "given", "quote": "90 cm door leaves" }
```

- **Clear width**: the hole less what an open leaf and its stop take (`useOpenLeaf`), leaf by
  leaf, and less what fixtures stand in front of it. A door that swings or folds takes the
  allowance; a sliding, pocket, roller or garage door leaves its whole hole.
- **A pair** (`kind: "double"`) is two leaves. With `opens`, the plan states its active leaf, and
  the door is judged by that leaf. With none, both leaves open together, each taking its own
  allowance: a 1.8 m pair leaves 1.70 m. A single door with `opens` beside a fixed panel is judged
  by the part that opens.
- **Leaf width** is the width of the leaf or leaves it is judged by, with no allowance.

`grid check` and `grid_check` list the figures of the brief beside the plan that the drawing
misses, after the report and under their own heading: the person's, not from any code or
standard. They carry no code in the record.

A figure Grid does not know is refused with the ones it knows. Each door, room or opening short
of a figure is one line; a figure nothing is short of is one line met.

## Who the building is for

`people` (ARE-68) holds who the building, or some of its rooms, is for: `pupils`, `covers`, `keys`,
`beds`, `capacity` or `desks`, each a whole number, or a `count` with the `rooms` it is for, by name
or id. It is a fact, not a wish: no line measures it, and a brief may hold it alone. `grid_areas`
and `grid_compare` read it for the area per person ([areas.md](areas.md#the-area-per-person)), the
gross internal area per pupil or the net per key; a figure in the call comes first.

```json
{ "version": "1", "people": { "pupils": 420, "covers": { "count": 80, "rooms": ["Dining hall"] } } }
```

## Met and missed after every change

Every change to the plan answers with the brief beside the plan it read, line by line, against
the plan as it now is: each edit tool, `grid edit`, `grid_write_rooms` and `grid write`. The
answer's data holds the lines as `brief`: `{ file, problem, lines }`, each line with its `state`,
`wish`, `level`, `source`, `quote`, `asked`, `drawn`, `unit`, the `parts` it is about and its
`text`, and `where`, its wish's place in the brief (ARE-69). An edit lists 12 lines, missed first; `grid_write_brief` with no `brief` lists them all.

```text
The brief ("plan.brief.json"), each line measured as the drawing is: …
  missed (must): "Bathroom 1" area asked 4.5, drawn 11.93 m².
  met (must): rooms used as bedroom: asked 3, drawn 3.
  The person's own figures: theirs, not from any code or standard.
    missed (must): door "door-bath" ("Hall" to "Bathroom") width asked at least 0.8, drawn 0.55 m.
  A line met says the drawing holds what the person asked for, and nothing about any rule.
```

- A line is **met**, **missed** or **open** (nothing drawn yet, or a room that cannot be
  measured). It is written in words, asked against drawn, and never as a score.
- **The target and the drawing are measured by the same rule**: a room's net area and inside
  size as [`grid_areas`](areas.md) gives them, to the faces of its walls; widths and circles as
  `grid_measure` gives them; the footprint to the outside face of the ground floor's walls, its
  area the gross external area.
- An `area` or an `inside` size is met within 5% of the figure asked (`briefAbout` in
  [tolerances.md](tolerances.md)); `at_least` and `at_most` are met at the figure.
- A line met says only that the drawing holds what was asked. It never says a plan is allowed,
  and the answer says so.
- A brief that cannot be read is said in one line, and the change is written as asked.

## A size written in a room's name

Until the brief gives a room a size, a size written in its name is read against the room as
drawn (lab R-14): square metres (`12 m²`, `12 m2`, `12 sqm`), square feet (`120 sq ft`) or mats
(`6 tatami`, `6 jo`, `6畳`). A mat is taken as 0.9 × 1.8 m, Grid's own reading of one, citing no
document. When the drawn size is further than 2% from the size named (`nameSize`), the answer
says so: `differs: "6 tatami room" is named 6 mats; drawn 5.80 mats (9.40 m², a mat taken as
0.90 × 1.80 m), net area.`

## The rooms every home is assumed to have

A home is each flat the plan lists, or, with no flats, the whole plan when a room in it is used
as a bedroom or a living room (ARE-72). Grid assumes every home has a bathroom, a kitchen and a
way in: a room used as one or named so ("Kitchen / living" has a kitchen), and a door, opening or
open edge from one of its rooms to the outside or to a room that is not the home's (a flat's way
in is through the common corridor). When a home lacks one and the brief says nothing of it, the
brief's lines offer it as an assumed line, with or without a brief yet:

`missed (should, assumed): a kitchen in every home, Grid's assumption, missing from the home: …`

It is the agent's to confirm with the person. A room wish of that use, or whose name says it, at
any level (`avoid` when the home has none on purpose), is the person's word and ends the line; for
a way in, a wish whose name or words say entrance, entry, front door or way in. The line has
`source: "assumed"` and `where: null`. A survey, which records what stands, gets none.

## Questions about homes after the check

After `grid check` and `grid_check`, brief or none and with no place needed, Grid asks about the
plan's homes under "Worth a look in the homes": each home lacking a bathroom, a kitchen or a way
in; a bedroom, living room or dining room under 4 m² of net floor or narrower than 1.8 m, and a
kitchen, bathroom or toilet under 0.8 m² or narrower than 0.6 m, a room's width being the widest
circle it holds as `grid_measure` gives it (`homeRoomSmallest`, `homeRoomNarrowest`,
`homeWetRoomSmallest`, `homeWetRoomNarrowest` in [tolerances.md](tolerances.md)); and a room whose
name says one use ("Bedroom 2") while its use says another (`living`). Near uses are not asked
about: a WC used as a bathroom, a dining room used as living, a study as an office, a store as a
utility room or a garage. Each is a question in Grid's own figures, never a rule, and the check's
record and count are unchanged. The measures are `packages/cli/src/quantities/homes.ts`.

## The first plan with no brief

When a plan is first written (`grid_write_rooms` or `grid write` on a plan that is not there, is
empty or is still the starter plan) and no brief is kept beside it, the answer gives one line
saying so, and the plan is written as asked. It is a reminder, never a refusal, and it is not
repeated on the writes after.

## A first layout from the brief

From the brief's rooms, with their sizes and the rooms it wants to touch, Grid writes a first
layout (BRF-6): `grid_write_rooms` with `layout` in place of `rooms`, or `grid write --layout`.
It packs the rooms into rooms text and writes that as any rooms text is
([rooms-first.md](rooms-first.md)), so the plan is an ordinary plan written rooms first, and
the answer gives the rooms text back to change and write again.

```text
First layout from the brief ("plan.brief.json"): 5 rooms in two rows along "Hall", 7.00 x 8.90 m inside the outside walls, in a rectangle. It places no door or window: add them to the rooms text.
Added "Hall", 1.10 m wide (Grid's own size, not a code figure): the brief names no corridor for the rooms to stand along.
Sizes not kept (3):
  met (must): "Kitchen" inside asked 2.4 x 3, drawn 2.40 x 3.10 m: 0.24 m² more.
  missed (must): "Bathroom" inside asked 1.7 x 2, drawn 1.70 x 3.10 m: 1.87 m² more.
  missed (must): "Bedroom 1" inside asked 4.1 x 3.2, drawn 3.30 x 4.50 m: 1.73 m² more.
```

- **`tidy`**: the outline is a rectangle. Every room in a row is as deep as the row, and the
  shorter row's room already changed, else its largest, takes up the length left over. Each
  size not kept is the brief's own line for it, met or missed, with how much its area changed.
- **`sizes`**: every size is kept, and the outline steps where the rooms differ.
- **How it packs**: three rooms or more, or a corridor in the brief, stand in two rows, one on
  each side of a hall running east-west: the brief's first room used as a corridor, or a hall
  Grid adds (`layoutHall` in [tolerances.md](tolerances.md)). Fewer stand in one row. A size is
  either way round, so a room may be turned; a room given only an area (or `at_least`,
  `at_most`) takes its row's depth and the width that keeps it, so long as no side of it is
  under `layoutNarrowest` (or its own square's side, when it is smaller) and, keeping its area,
  it is no more than `layoutLongest` times as long as wide (both Grid's own, WRT-61). In a row
  deeper than that it is as narrow as that allows: with `sizes` only as deep as its area needs,
  the outline stepping; with `tidy` as deep as the row, and named as a size not kept. No row is
  shallower than such a room's shortest side. Of every way of sharing the rooms
  between the rows and every depth a row could take, it keeps the one that holds the most wishes
  to touch, then the smallest rectangle, then the squarest. The same brief gives the same plan,
  byte for byte.
- **What it places**: a room wish by name, `count` times; a wish for the rooms of a use, as many
  more as its `count` asks, named after the use ("Bedroom 3"). A wish to avoid a room, or a count
  of 0, places nothing. A room with no size is not placed, and the answer says so.
- **What it does not do**: doors and windows, the footprint (its line is said, not packed to),
  the plot, the orientation, more than one floor, rooms that are not rectangles, and more than
  `layoutRooms` rooms.
- With no brief beside the plan, or one that can't be read, nothing is written. Over a plan
  written some other way it is refused as rooms text is, and `replace` writes over it.
- `layout` is one of three ways in, with `rooms` and `scan` (a phone room scan,
  [commands.md](commands.md#a-plan-from-a-phone-room-scan-grid-write---scan)): a call with none of
  them, or more than one, is refused naming them, and so is `grid write --layout` with a rooms
  file or `--scan`.

The answer's data adds `layout`: `shape`, `rooms` (the rooms text written), `outline`, `added`
(the hall Grid added, by name, or null), `notKept` (each `room`, `name`, `text` and `by`, the
change of its area in m²), `notPlaced` and `touch` (`wished`, `held`). Every answer of
`grid_write_rooms` carries `layout`, null unless a layout was written, as it carries `scan`.

