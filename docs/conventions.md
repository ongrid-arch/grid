# The plan file's conventions

Read this when you read or write a plan file's coordinates by hand: where a wall's line runs, where
an opening sits on it, how a room names its walls, which way the axes run and how floors stack.
Rooms text ([rooms-first.md](rooms-first.md)) works all of these out for you; the
[guide for agents](agent-guide.md) says when to write the plan file's own way instead.

These five hold for every plan file, and every reader of a plan reads them the same way. They are
stated in the header of `packages/floorplan/src/types/floorplan.ts`, which numbers them C1 to C5;
the later ones, which add parts to a plan, are in [the table below](#the-later-conventions).

- [C1 · A wall's thickness](#c1--a-walls-thickness)
- [C2 · Where an opening sits](#c2--where-an-opening-sits)
- [C3 · A room's boundary](#c3--a-rooms-boundary)
- [C4 · The coordinates](#c4--the-coordinates)
- [C5 · Floors](#c5--floors)
- [The later conventions](#the-later-conventions)

## C1 · A wall's thickness

![A wall grows half its thickness to each side of its start-to-end centre line](conventions/c1-wall-thickness.svg)

A wall's `start` and `end` are the two ends of its centre line, and the wall grows half its
`thickness` to each side of it. Two walls that meet share the point where their centre lines meet,
so a room's inside faces lie half a wall in from the lines you give. A dividing line (`"virtual":
true`) is a line with no thickness: its `thickness` may be 0 and is never used.

A survey taped to a wall's inside face may say so instead: `"face": "left"` or `"right"` says the
line is that face of the wall, as you walk from `start` to `end`, and Grid moves it to the centre
line when it reads the plan ([A wall placed by its face](plan-file.md#a-wall-placed-by-its-face)).

## C2 · Where an opening sits

![An opening's offset runs along the wall from its start to the opening's near edge](conventions/c2-opening-position.svg)

An opening names its `wall`, and `offset` is the distance along that wall, from the wall's `start`
to the near edge of the opening; `width` runs on from there. The opening must lie on its wall:
`offset` is at least 0, and `offset + width` at most the wall's length. A door's `hinge` names the
end of the opening it turns on (`start`, the end nearer the wall's start, or `end`), and `swing`
the side it opens toward: `left` is the side on your left as you walk from the wall's `start` to its
`end`. A door with neither draws no swing. `sill` is the height of the opening's bottom above the
floor: 0 for a door.

## C3 · A room's boundary

![A room lists its walls counter-clockwise, and its area is measured to their inside faces](conventions/c3-room-boundary.svg)

A room's `boundary` lists the walls round it by id, in order counter-clockwise as seen from above.
Its area is measured to the inside faces of those walls: the floor you walk on, never to the centre
lines. In the drawing, four walls 0.2 m thick on centre lines 4.2 by 3.2 m apart make a room of 4.0
by 3.0 m, 12 m². A plan written from rooms text works its boundaries out and keeps them so; edit
one by hand and the check says so (`room/derived-edited`).

## C4 · The coordinates

![x runs right, to the east; y runs up the drawing, to the north; in metres](conventions/c4-coordinates.svg)

Every length and point is in metres. `x` runs to the right of the drawing and `y` up it; rooms text
and Grid's words call those east and north, whatever the plan says about its real north
([North, front and where the building is](plan-file.md#north-front-and-where-the-building-is)).
A point is `[x, y]`. In 3D the height is its own axis: a point `[x, y]` at a height `h` is
`(x, h, -y)`.

## C5 · Floors

![Floors share one origin and stack by level; level orders them and is never a height](conventions/c5-floors.svg)

A plan is a stack of floors sharing one origin: a point `[x, y]` is the same place on every floor,
and floors are never moved sideways to stack them. Every wall and room names its `floor`; unstated,
it is on the ground floor, which is what a plan of one floor is. An opening is on its wall's floor
and never names one. A floor's `level` orders the floors (0 the ground floor, 1 the one above, -1 a
basement, 0.5 a half level) and is never a height. Where a floor stands and how high it is are
`elevation` and `height`, in metres, when the plan states them; otherwise Grid stacks each floor on
the one below at the height of its walls ([Floor levels and heights](plan-file.md#floor-levels-and-heights)).

## The later conventions

Each later convention adds a part a plan may hold, and a plan that states none of it reads exactly
as before. The plan file's page says what each holds and what its checks mean.

| Convention | What it adds | Where it is |
|---|---|---|
| C6 | Fixtures: toilets, basins, showers, baths and kitchen runs, each placed by its middle and turn | [Fixtures](plan-file.md#fixtures) |
| C7 | The plan's real north, which way its y runs, its front and where it sits on the earth | [North, front and where the building is](plan-file.md#north-front-and-where-the-building-is) |
| C8 | Where a value came from: given, measured, scanned or assumed, and how sure it is | [Where a value came from](plan-file.md#where-a-value-came-from) |
| C9 | Facts of the person's own on walls, openings, rooms and floors, and a room's own number | [Facts of your own, and room numbers](plan-file.md#facts-of-your-own-and-room-numbers) |
| C10 | The country the building is in, which picks the figures the checks apply | [The place](plan-file.md#the-place) |
| C11 | Saved views: named cameras kept with the plan | [Saved views, and the camera record](plan-file.md#saved-views-and-the-camera-record) |
| C12 | Opening patterns: a facade's rhythm stated once and expanded into plain openings | [Opening patterns](plan-file.md#opening-patterns) |
| C13 | The plot: its boundary, the street edges, set-backs and what stands on it | [The plot](plan-file.md#the-plot-its-boundary-set-backs-and-what-is-on-it) |
| C14 | Which rooms and routes need to be accessible | [What needs to be accessible](plan-file.md#what-needs-to-be-accessible) |
| C15 | Lengths taped on site, kept beside the drawing as checks | [Lengths taped on site](plan-file.md#lengths-taped-on-site) |
| C16 | Phases: existing, demolished and new parts, and a fit-out on a base plan | [Existing, demolished and new](plan-file.md#existing-demolished-and-new) |
| C17 | A floor's outline, its homes and its parking spaces, before or beside its walls | [A floor outline before the walls](plan-file.md#a-floor-outline-before-the-walls) |
| C18 | Flats and flat types: named groups of rooms | [Flats and flat types](plan-file.md#flats-and-flat-types) |
| C19 | Walls that rise through floors, and floors that do not line up on purpose | [Walls through floors, and floors that line up](plan-file.md#walls-through-floors-and-floors-that-line-up) |
| C20 | Kinds of door and window and the part that opens | [Kinds of door and window](plan-file.md#kinds-of-door-and-window-their-handing-and-the-part-that-opens) |
| C21 | A curved wall: an arc round a centre, through a sweep | [A curved wall](plan-file.md#a-curved-wall) |
| C23 | A plan that is part of a larger building: party walls, what lies beyond a wall, several buildings, context | [Part of a larger building](plan-file.md#part-of-a-larger-building) |
| C24 | Named wall, door and window types, and room finishes | [Named wall, door and window types, and finishes](plan-file.md#named-wall-door-and-window-types-and-finishes) |
| C25 | Columns and structural grids | [Columns and a structural grid](plan-file.md#columns-and-a-structural-grid) |
| C26 | Outdoor space, roofed or open | [Outdoor space, roofed or open](plan-file.md#outdoor-space-roofed-or-open) |
| C29 | Parking bays and ramps | [Parking bays and ramps](plan-file.md#parking-bays-and-ramps) |
| C30 | A library of fixtures, furniture and typical rooms, placed by name | [The library](library.md#what-the-library-holds) |
| C31 | A trace image under the plan | [A trace image under the plan](plan-file.md#a-trace-image-under-the-plan) |
| C32 | Grid's words in any language, kept in the plan | [Grid's words in another language](plan-file.md#grids-words-in-another-language) |

The plan's whole structure, every field each part may hold, is the JSON Schema the build writes
beside the command (`plan.schema.json`), which the tool server serves as `grid://schema/plan`
([the guide for agents](agent-guide.md#where-to-read-more)).
