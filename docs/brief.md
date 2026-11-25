# The brief

Read this when you keep what a person asked for beside their plan, or need to know what a line
met or missed after an edit means.

- [What the brief holds](#what-the-brief-holds)
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

- **A room wish** names one room by the name it has in the plan (`name`, any case, or its id),
  or the rooms of a use (`use`). It may give a `count`, a net area (`area`, about; or `at_least`,
  `at_most`, in m²) and an inside size (`inside`, metres, either way round). With none of them it
  asks only for the room to be there.
- **The footprint** gives the outside sizes (`width` and `depth`, either way round) or the area
  it covers (`area`), or both.
- **Rooms that touch**: two rooms' names that must share a wall (`must`, `should`) or must not
  (`avoid`).
- **Every wish has a level**: `must`, `should`, or `avoid`, a wish for the drawing not to hold
  it (no garage; the bathroom not next to the kitchen). The footprint and the figures take
  `must` or `should`.
- **Every wish says where it came from**, in the words a plan's own marks use: `given` by the
  person, with their words in `quote` (a given wish without them is refused), or `assumed` by the
  agent, for the person to confirm. An assumed figure is written "assumed 4.5", not "asked 4.5".
- **What is still open**: the person's words for something with no figure yet go in `open`, with
  what is still to ask in `about`.

A wish Grid cannot read is refused naming its place (`rooms[2].area must be a number of square
metres above 0…`), never repeating the person's words, and nothing is written.

## The person's own figures

The figures under `figures` are the person's, not a code's or a standard's. The file holds them
under the heading "The person's own figures: theirs, not from any code or standard.", and every
answer lists them under it. Grid knows five sizes, all in metres, and four site limits (BRF-4):

| Figure | Measured as | Short of it |
|---|---|---|
| `door_width` | the clear width every door and doorless opening leaves, leaf by leaf, as `grid_measure what=access` gives it; with `measure`, `leaf` (the leaf it opens by) or `hole` (the hole in the wall) instead | narrower |
| `corridor_width` | each room used as a corridor at its narrowest point from end to end, clear of fixtures, the figure `grid_measure what=access` gives; the line says where it is | less |
| `turning_circle` | the widest circle each room holds, in the empty room; `rooms` names the rooms it is for, every room when left out | less |
| `step` | the sill of every door and doorless opening above its floor; 0 for none | higher |
| `ceiling_height` | each room's height, as `grid_measure` gives it | lower |
| `plot_coverage` | a percentage: the building seen from above, every floor at or above the ground floor, inside the plot's boundary, over the plot's area | more |
| `floor_area_ratio` | the gross area of every floor at or above the ground floor over the plot's area, by `measure`: `gross_external` or `gross_internal` ([areas.md](areas.md)) | more |
| `building_height` | metres from the ground (`site.ground`, else the ground floor's floor level) to the top of the highest roof | more |
| `parking_per_home` | the parking spaces the floors state over the homes they state (`floors[].parking`, `floors[].homes`); 0 for none | fewer |

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

## Met and missed after every change

Every change to the plan answers with the brief beside the plan it read, line by line, against
the plan as it now is: each edit tool, `grid edit`, `grid_write_rooms` and `grid write`. The
answer's data holds the lines as `brief`: `{ file, problem, lines }`, each line with its `state`,
`wish`, `level`, `source`, `quote`, `asked`, `drawn`, `unit`, the `parts` it is about and its
`text`. An edit lists 12 lines, missed first; `grid_write_brief` with no `brief` lists them all.

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
  `grid_measure` gives them; the footprint to the outside face of the lowest floor's walls, its
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
  `at_most`) takes its row's depth and the width that keeps it. Of every way of sharing the rooms
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

