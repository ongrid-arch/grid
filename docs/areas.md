# Measuring areas

Read this to know what an area figure measures, which gross area comes first where, how the
room and opening schedules are made, and how the quantities for a first estimate are measured
and priced from your own rates.

Grid gives three areas, per floor and per use, from the spaces the walls enclose, and lists
outdoor space apart; a flat's area to the middle of its party walls and the free floor beside the
floor area (ARE-14), and the living area under air and the total under roof (ARE-60), are
measured from the same rooms. Each is
described in Grid's own words by what it measures, and no figure is said to follow a published
standard: a standard's rule would come in only as a figure record, with its document, edition,
clause, place, day read and status, and none is carried yet.

| Measure | What it measures | Not taken off | What the plan cannot say |
|---|---|---|---|
| Net area | Net area is the floor inside each room, measured to the faces of its walls, less any hole in it, any room drawn inside it and the floor the columns standing in it cover, a room marked as a void (open to the floor below, so with no floor) not counting at all; a stair or a lift shaft drawn as a room on floor after floor counts once, on the floor it rises from, and only the part of a stair or lift room that lies over the one below is taken off, so a landing, or a half flight of a split level beside the stair below, counts on the level it serves. | Nothing else inside a room is taken off: fixed units, a column drawn as a short wall rather than as a column, and floor under a low ceiling all count. | The plan cannot say which rooms the reader counts: a store drawn as a room counts unless it is named as outside, and a balcony, a terrace or a garden counts unless it is marked as outdoor space. |
| Gross internal area | Gross internal area is the floor inside the inside face of the walls that face outside, with the inner walls and partitions counted, and less any void, which has no floor. | Inner walls, partitions, stairs and floor no room claims are not taken off. | Which walls face outside is worked out from the rooms beside them, an outdoor space being the outside; floor no room claims, such as a courtyard or a light well not drawn as outdoor space, may be covered or not, so it counts. |
| Gross external area | Gross external area is the floor inside the outside face of the walls, every wall counted, and less any void, which has no floor. | Outer walls, inner walls and floor no room claims are not taken off. | A wall shared with a neighbour, or with common parts the plan does not draw, counts to its middle once the plan marks it separating; any other wall counts in full, a wall standing apart too. |
| Area by headroom | Area by headroom is the floor of each room with at least 1.5 m, and with at least 2.2 m, of height over it, from the room's floor to its ceiling or to the underside of the roof its floor states, whichever is lower. | It is measured on the room's whole floor: nothing standing in the room is taken off, a column neither, and floor under a lowered zone of the ceiling counts by that zone's height. | The plan cannot say how deep the roof is built up or where a low slope is boxed in, so the height is taken to the roof's underside as stated, from its eaves on the outside walls' lines. |
| Outdoor area | Outdoor area is the floor of each room the plan marks as outdoor space, roofed or open, measured to the faces of its walls and edges as a room is. | It is in no net, gross internal or gross external figure, and nor is a wall that bounds outdoor space and no room, such as a fence or a parapet. | The plan cannot say how much of an outdoor space a local rule counts, such as part of a balcony: Grid counts none of it unless the caller states such a rule, with where it comes from. |
| Area to the party walls | Area to the party walls is the floor of a flat's rooms with the walls and partitions between them, measured to the middle of each wall it shares with another flat, the common parts or a neighbour, and to the inside face of the walls that face outside, or to their outside face for the outside-face figure. | Nothing inside the flat is taken off: its inner walls, its partitions, its columns and its stair, on each floor it stands on, are all in it. | The plan cannot say which rooms make a flat but by its flats list, so floor no room claims and outdoor space are in no flat's figure, and a wall to a neighbour counts to its middle only once the plan marks it separating. |
| Free floor | Free floor is a room's net area less the floor its fixtures stand on: their footprints, joined where they overlap, within the room. | Only the fixtures the plan states are taken off, at the sizes it states: loose furniture, which the plan does not hold, and the floor kept clear in front of a fixture both count as free. | The plan cannot say what stands in a room beyond what it states: a room with no fixtures stated is free floor all over, and a zone's fixtures are its room's too. |
| Living area under air | Living area under air is the floor inside the outside face of the walls round the rooms that are heated or cooled, the walls between two of them counted, and a wall between one of them and a room that is not, or the outside, counted in full; less any void, which has no floor. | Inner walls, partitions, stairs and floor no room claims among the rooms under air are not taken off. | The plan cannot say which rooms are heated or cooled unless a room states it: unstated, a room is under air unless it is used for parking, and outdoor space never is, so a lanai, a covered entry or an unheated store drawn as a room counts until it is marked unconditioned. |
| Total under roof | Total under roof is the gross external area, every enclosed room in it whether heated or not, a garage too, plus the floor of each outdoor space a roof covers, such as a porch, a carport or a lanai, measured to its own edges. | Outer walls, inner walls, rooms not under air and floor no room claims are not taken off. | The plan cannot say how far a roof reaches past the walls, so a covered outdoor space counts by its own floor and an overhang beyond it does not; a room named as outside is in neither figure. |

On every floor the gross external area is the net area, plus the floor under columns,
the walls and the floor no room claims, to a millionth of a square metre. A room named outside is the outside, as outdoor space is: the walls round it face outside and its floor is in no net, gross internal or gross external figure. Where rooms overlap, or run over
walls or outside them, the answer says how much floor that is, and the sum takes it off. The
gross internal area leaves out the walls that face outside, stretch by stretch, as Grid works
them out from the rooms beside them, with the corners between them; a floor with no such wall
has none. A room Grid could not draw is named and left out of every figure.

The three are held in order (ARE-20): on every floor and in all, the gross external area holds
the gross internal area, and the gross internal area holds the net. Where the drawing puts one
below a figure it must hold, most often a room that runs past the walls, so that its floor is in
the net and in no gross figure, the figure is still given, and `grid_areas` marks it not proven,
with a sentence in its state (`why`) and in the notes that says which figure is short of which, by
how much and why. In the library: each floor's `doubts` and each gross total's `doubt` in
`planAreaFigures(plan)`.

An outdoor space inside the walls, such as a courtyard, a cloister's garth or a light well marked
as outdoor space, is out of both gross figures, whatever bounds it: walls Grid works out as facing
it, or an open side drawn as a virtual wall, such as an arcade. Floor no
room claims still counts in both, since Grid cannot tell whether it is covered: mark an open
courtyard as outdoor space to take it out.

Gross internal area takes off the walls that face outside now, worked out from the rooms beside
each wall (ARE-39). A wall built as an outside wall (stated `exterior`) stays one as a fact of the
wall, but it faces outside only where it has no room on one face: where rooms stand on both faces,
as the old end wall of a building does once it is extended, its floor counts in gross internal area.

### Living area under air and total under roof

A home is often sold by the floor of the rooms that are heated or cooled. A room says whether it
is with `conditioned` ([plan-file.md](plan-file.md)), or `conditioned` and `unconditioned` on its
rooms text line, or `grid_rename_room` with `conditioned: true` or `false`. Unstated, a room is
under air unless its use is parking; outdoor space and a void never are, and a zone is as its room
is. So a garage is out until it says otherwise, and a lanai, a covered entry or an unheated store
drawn as a room is in until it is marked unconditioned.

- The living area under air (`conditioned`) is measured as the gross external area is, with the
  rooms not under air as the outside: the wall between the house and its garage faces outside and
  counts in full with the house, and the garage's own walls, and the stretches of a long wall that
  run along it, are in no part of it. A house of a 6 × 5 m living room and a
  3 × 5 m garage under 0.3 m outer walls with a 0.1 m wall between, is 54.32 m² gross external and
  35.84 m² under air, 6.4 × 5.6 m.
- The total under roof (`underRoof`) is the gross external area, garage in, plus the floor of the
  outdoor spaces a roof covers (a porch, a carport, a roofed lanai), each to its own edges.

`grid_areas` gives both on every floor and in all (`conditioned`, `underRoof`), marks each room
not under air (`unconditioned`) and lists them (`notUnderAir`). For a plan built in the US, where
homes are measured to the outside face (the plan's `site.country`, or `country`), its answer, the
client sheet's cover and `grid_compare`'s rows lead with these two figures, so a home is never
headlined with its garage in; elsewhere `grid_areas` says them where a room states `conditioned`.
In the library: `planAreaFigures(plan).conditioned`, `.underRoof` and `.reader.underAirFirst`.

### One building measured apart

Two buildings built against each other on the same floors can be measured apart (ARE-20):
`grid_areas` with `apart_rooms`, the rooms of one of them, gives their net area, counted as the net
counts it, and their area to the middle of each wall they share with the rest of the plan, to the
inside face and to the outside face of the walls that face outside, as a flat's area to its party
walls is measured. Measured apart, the two buildings add up to the whole. An id that is no room the
net counts on the floors given (a zone, an outdoor space, a room named outside, a stair counted
below) is named and left out. In the library: `planAreaFigures(plan, { apart })`. A building the
plan names (CNT-6) is a group of floors, and is measured from its own floors without this.

Under a sloped roof (LVL-6) a room's floor is also given by headroom band: how much of it has at
least 1.5 m (`headroomLow`) and at least 2.2 m (`headroomFull`) of height over it, Grid's own
figures, not a code figure ([tolerances.md](tolerances.md)). The height is measured from the room's
floor to the lower of its ceiling (its own `height`, else its storey's, with any lowered zone) and
the underside of the roof its floor states ([plan-file.md](plan-file.md#sloped-roofs-and-ceilings)).
`grid_areas` gives the bands for each room on such a floor, with its lowest and highest height,
and adds them up per floor and in all; a floor that states no roof gets none, since its ceilings
are level. In the library: `roomHeadroom(plan, room)`. No band is checked against a figure: the
bands are reported, and nothing says a room is high enough.

A column the plan states (CNT-16, [plan-file.md](plan-file.md#columns-and-a-structural-grid))
comes off the net area of the room it stands in: the smallest room on its floor whose floor holds
its middle, zones aside. What it takes off is the floor it covers inside that room's outline, so a
column built into a wall takes off only the part that stands in the room; a round column's is
its true circle's. Each room in `grid_areas` lists its columns and the floor they cover
(`columns`), each floor says how much its columns take (`columns`), and a note says it in words;
the gross figures still hold that floor. An open office of 90.09 m² with three columns 0.37 m
square measures 89.68 m² (lab EL-6). A column that rises through floors comes off each floor it
stands on. A column drawn as a short wall is not a column, and its room keeps that floor.

A stair is counted once (SHT-11, lab DR-5). Where rooms used as a stair lie one over the other
on neighbouring floors, joined as the way-out check joins them (they share at least half of the
smaller one), they are one stair, and its floor is counted on the floor it rises from: the
lowest of them. The stair rooms over it keep their own area in the room list, marked with the
room they are counted with (`countedWith`), and are in no net figure, no area by use and no
circulation figure; the answer says so in a note. The gross areas still hold them, so on every
floor the gross external area is the net area plus those stair rooms (`overStairs`), the rooms
named outside, the walls and the floor no room claims. The same holds when only some floors are
asked for: a floor's stair room over the stair below is counted on the floor below.

Only the floor that lies over the open stair below comes off (ARE-35). A stair room that lies
only partly over the one below, as the half flights of a split level step aside level by level,
loses just the part over it (`overStair`: that floor, and the room below it lies over): its
`area` is the rest, a landing or its own half flight, which is in the net, its use and the
circulation figure on the level it serves, and a note says how much was taken off. The part over
the stair below is in `overStairs`, so the floor's gross figures still add up. A stair room wholly
over the one below, to within `areaReported`, is counted with the lowest room of its stair as
above, found through the rooms that lie wholly over one another. Grid takes the whole of the stair
room below as open: it cannot say which part of it is flight and which is landing. A stair the
plan states (`stairs`) adds no floor of its own: its flights stand in rooms already measured. A
lift shaft is counted the same way (ARE-22): lift rooms one over the other on neighbouring floors
are one shaft, its floor is counted once on the floor it rises from, and the lift rooms over it are
in no net figure, so a tower's net area and its net to gross figure do not hold the shaft on every
floor. Lift rooms that do not line up are counted on each floor they stand on.

Every tool that counts rooms or adds up their areas counts them by this one rule (CNT-27): a zone
with its room, a stair or lift shaft once, on the floor it rises from, and no void, outdoor space
or room named outside. `grid_count` leaves those rooms out of its groups and lists each in
`notCounted` with why, so an area sum is the net; `stairs: "per floor"` counts each floor's stair
and lift rooms instead. The room schedule marks them, the brief counts a shaft once when it counts
rooms, and `grid_compare`'s room count and the verdict of every change count a shaft once.

Which gross area comes first follows the country the plan will be built in: the inside face of
the outer walls in the UK and most of Europe, the outside face for homes in the US. With no
country, or one Grid has no usual measure for, both are given; either or both can be asked for.
In the library: `planAreaFigures(plan, options)`, `MEASURES` and `usualGross(country)`. The
`grid_areas` tool ([tool-server.md](tool-server.md)) prints each figure with its rule, takes
`country` and `gross`, and marks each figure's state ([result-contract.md](result-contract.md)).

A flat's area (CNT-4, lab EL-1) is read from the plan's own list of flats
([plan-file.md](plan-file.md#flats-and-flat-types)), never from the rooms' names: the net area of
the rooms the plan lists for it, each counted as the net counts it, so a zone is in its room, a
room named outside is in no flat's figure, and a stair counts once, on the floor it rises from. A
duplex has its area floor by floor and in all. The rooms in no flat, the common parts, are given
apart, so the flats and the common parts add up to the net. `grid_areas` gives both on a plan
that lists flats; on the lab's four-flat floor that is 68.27 m² for each one-bedroom flat, 99.23 m²
for each two-bedroom flat and 84.49 m² in no flat. In the library: `planAreaFigures(plan).flats`
and `notInFlats`.

### A flat to the middle of its party walls

The figure a developer quotes for a flat runs to the middle of its party walls (ARE-14, lab R-1).
Grid gives it beside the net for every flat the plan lists (`toPartyWalls`), in the same two kinds
as the gross areas and in the order the reader asked for: to the inside face of the walls that
face outside (`grossInternal`), or to their outside face (`grossExternal`). Each side of a room is
taken past the wall it lies on: by half that wall where another room of the flat, another flat,
the common parts or a neighbour lies beyond it, by none of it or all of it where it faces outside,
as the gross areas work that out ([the measures table](#measuring-areas)). The corner between two
such sides is filled to where their lines meet, and the rooms of a flat are joined, so a wall
inside the flat is counted once. A wall with no room drawn beyond it counts to its middle only
when the plan marks it separating ([plan-file.md](plan-file.md)); any other faces outside. An
outdoor space is the outside to the flat, and a zone is in its room. A duplex is measured floor by
floor and added up.

The rooms in no flat, the common parts, are measured the same way (`notInFlatsToPartyWalls`), so
on a floor where every room is in a flat or the common parts, the flats, the common parts and the
floor no room claims add up to the floor's gross internal area, and in the outside-face kind to
its gross external area. On the lab's four-flat floor each one-bedroom flat is 72.95 m² to the
inside face of the outer walls and 79.11 m² to their outside face, beside its 68.27 m² net.
`grid_areas` prints the figure after each flat's net, and the rule's sentence after the list.

A floor may state its outline before any wall (BRF-4,
[plan-file.md](plan-file.md#a-floor-outline-before-the-walls)). On a floor with walls the outline is
joined with what they enclose, and floor inside it that no wall encloses is floor no room claims,
in both gross figures. A floor with an outline and no walls is massing: its gross external area
is the area inside its outline, and it has no net area and no gross internal area, since there is
no inside face of walls to measure to; the answer names the massing floors. `grid_areas` also
counts the storeys, by level, from the floors that hold an outline or walls that close one.

## Lettable area, the core and efficiency

Net to gross holds every room the net counts, the lift shafts, the stairs, the plant rooms and the
corridors with them, so it is not the share of a building that can be let or sold. `grid_areas`
gives that apart (ARE-68):

- **Lettable area** is the net area of the rooms a tenant or a buyer has the use of, what is often
  called the net internal or net lettable area, counted by Grid's own rule from the rooms as
  drawn. A room that states its tenure ([plan-file.md](plan-file.md)) is lettable when it is
  `private`, `shared` or `commercial` and not when it is `common`; a room that states none is
  lettable unless its use is stair, lift, plant, corridor or parking. The person may choose
  instead (`lettable_uses`, `lettable_tenures`): a room of a chosen use or tenure is lettable, and
  no other. The answer lists the floor the net counts that is not lettable, by use, so a loading bay
  drawn as storage is seen.
- **The core** is the rooms used as stair, lift or plant on each floor plate, a stair or lift room
  counted with the one below included: its share of a plate is what stands on it, though the net
  counts a shaft's floor once (SHT-11, ARE-22). Each floor lists its core rooms.
- **Efficiency** is the lettable area over the gross internal area: per floor, per floor type (the
  floors whose largest lettable use is the same: the retail podium, the office floors, the hotel
  floors) and in all. A floor with no gross internal area has none.

Each floor's line in `grid_areas` ends with its lettable area, efficiency, core and core share;
the data is under `lettable` (`floors`, `floorTypes`, `lettableByUse`, `notLettable`, `states`,
`rules`), and each `grid_compare` row carries `lettable`, `core`, `efficiency` and `coreShare`. In
the library: `lettableFigures(planAreas(survey), choice)` in `packages/cli/src/quantities/lettable.ts`.

### The area per person

Given who the building is for, `people` in the call or in the brief
([brief.md](brief.md#who-the-building-is-for)): `pupils`, `covers`, `keys`, `beds`, `capacity` or
`desks`, `grid_areas` and `grid_compare` give the gross internal, gross external, net and lettable
area per one: per pupil, per key, per cover. A figure for named rooms (80 covers in the dining
hall) is measured on those rooms' net only. With no figure, the covers and desks counted from the
furniture ([tool-server.md](tool-server.md#seats-desks-and-covers-counted-from-the-furniture)) give
theirs, said as counted. The figure is the person's, never an occupancy Grid works out.

### Frontage zones

`grid_measure what=frontage` (with `room`) gives a shop's floor in bands of depth from its
frontage, A, B, C and the rest, each in m² and sq ft. The frontage is the side of the room on the
wall named (`wall`), else on the wall with the most opening width the room opens through (its shop
front), else its longest side on an outside wall. The room's floor as drawn is cut by lines
parallel to that side, `depth` metres apart, Grid's own default 6.1 m (20 ft), the depth shops are
often zoned by, into `bands` bands (3) and the rest; the bands add up to the floor. No band is
weighted: the bands are measured, not valued, and columns and fixtures are not taken off.

### A room as written

`grid_areas as_written` gives each room's floor to the middle of every wall it lies on, the
corners filled, whatever lies beyond the wall (`asWritten` on each room): the size a room written
to its walls' centre lines in rooms text was written at, as a stand or a module is sold by its
nominal size. It is beside the net area and in no total. A 6 × 20 m shop inside 0.2 m walls is
120 m² net and 125.24 m² as written. In the library: `toWallMiddles` in
`packages/floorplan/src/geometry/partyWalls.ts`.

## Outdoor space

A room the plan marks as outdoor space (CNT-7, [plan-file.md](plan-file.md#outdoor-space-roofed-or-open)),
a garden, a courtyard, a terrace, a balcony, a light well, a porch, a carport or another, roofed
or open, is measured as a room is and listed apart: it is in no net area, no area by use, no
flat's area and no gross figure, and the answer gives the outdoor area on each floor, by kind and
roofed or open (`outdoor`), with a note. To the building an outdoor space is the outside: the
gross figures are measured to the building's walls alone, so a wall between a room and an
outdoor space faces outside, and a wall that bounds outdoor space and no room (a fence, a
parapet round a terrace, the plot's edge drawn as a line, a porch's posts) is in no figure. An
outdoor space inside the walls, a courtyard or a light well, is taken off both gross figures.
The lab's house of 76.34 m² drawn with its gardens round it as rooms totals 436.34 m² net and
450 m² gross; with the gardens, the driveway and the side passages marked outdoor it is 76.34 m²
net, 78.96 m² gross internal and 90.00 m² gross external, and 360.00 m² of outdoor space listed
apart (lab EL-8).

No share of an outdoor space is counted by Grid. A local rule may count part of a balcony or a
terrace; the person can state one per kind, its share and the rule in their words with where it
comes from: `grid_areas` with `outdoor_rules` (ARE-14), such as
`{ "balcony": { "share": 0.5, "rule": "Half of each balcony, as my lender counts it" } }`, and in
the library `planAreaFigures(plan, { outdoorWeights })`. The weighted figure is then given beside
the outdoor area (`outdoor.weighted`, with each kind's share and what it counts, and `withNet`,
the net with that floor added), and each flat that holds outdoor space gives its own
(`outdoor`), never in the net or a gross figure. The answer always says which: with no rule, that
the outdoor space is left out of every total; with one, each kind it counts, at what share and by
which rule, said as the person's own and not checked by Grid, and the kinds no rule counts. Grid
holds no such rule of its own.

A garden or boundary wall drawn as a wall, standing apart with no room on either side (CNT-26,
[plan-file.md](plan-file.md#inside-and-outside-walls)), is in no figure either, and a ring of them
round the plot encloses no floor: the lab's house with a 1.8 m wall round its 15 × 30 m plot is
76.34 m² net, 78.96 m² gross internal and 90.00 m² gross external, as it is alone.

The site's things (BRF-3: fences, gates, paths, paving, trees and pools) are in no area: they are
never rooms. The plot coverage, the building's shape seen from above against the plot's area, is
not one of these figures: `grid_measure` with `what=site` gives it, from the outside face of every
floor at or above the ground floor ([tool-server.md](tool-server.md#the-plot-distances-to-the-boundary-and-the-coverage)).
A floor area ratio the person gives is measured there too, by the gross measure they name: the
figure's name and what it measures are said with it.

## Free floor

Where fixtures stand (CNT-12, [plan-file.md](plan-file.md)), a room's free floor is given beside
its net area (ARE-14, lab S-6): the net less the floor its fixtures' footprints cover, joined where
they overlap, within the room. A shop of 60 m² with 15 m² of counters and shelving runs has 45 m²
of free floor: the two figures are a quarter apart, and each is said with its name. `grid_areas`
gives the free floor for each room with fixtures (`free`, with `fixtures`, the floor they take),
for each zone that holds a fixture's middle (the zone's part; its room's free floor holds it
too), for each flat, for each floor and in all, beside the net, and prints the total with its
rule. Only fixtures the plan states are taken off: loose furniture is not held yet, and a room
with none stated is free floor all over. The kinds of fixture are CNT-11's, none of them a shop's:
until shop kinds are decided, a counter or a run of shelving fixed to the floor is drawn as a
`kitchen-run` with its own label, and its footprint is taken off as any fixture's is.

## Schedules

Two schedules are built on these areas (ARE-12), as data first: the text of `grid_schedule`,
its CSV and the tables on the check set are all written from the same rows, so no part reads
another's printed text.

- **The room schedule** (`grid_schedule` with `of=rooms`): one row per room, with its number,
  name, use, net area, height and floor, then each floor's total, named by its floor, and the
  total of all floors. Grid numbers the rooms 1, 2, 3… floor by floor from the lowest, then by
  id, so the schedule is the same whatever the order of the file. A room that states its number
  in the plan (CNT-9) is given that number, and the rooms that state one come first on their
  floor, in its order; each row carries the room's facts of the person's own, and the CSV has a
  column for each ([Facts of your own](plan-file.md#facts-of-your-own-and-room-numbers)).
  The height follows the rule in [tool-server.md](tool-server.md) (a height the room states, or
  the lowest solid wall round it). A room Grid could not draw is listed with no area, and the
  totals say they leave it out. A room the net counts in no total (a stair or lift room over the
  lowest of its shaft, a void, outdoor space) is still a row, marked `notCounted` with why (CNT-27),
  and the CSV gains a `not in totals` column; the rows without it add up to each total, and a
  total's room count counts them only.
- **The flat schedule** (`grid_schedule` with `of=flats`, CNT-4): one row per flat the plan lists,
  numbered in id order, with its type, whether it is mirrored, its floors, its rooms, its
  bedrooms and its area as above, then all flats and the rooms in no flat, and the unit mix by
  type: for each flat type the plan states, how many flats of it, how many of those mirrored, the
  bedrooms of each when they all have as many (ARE-15), their share of the flats, their area and
  the area of one on average. On such a plan the room schedule
  gives each room's flat, and its CSV a `flat` column. `grid sheet --layout check` ends with the
  flat schedule and the mix.
- **The opening schedule** (`grid_schedule` with `of=openings`): every door, window and doorless
  opening once, numbered by floor, then doors, doorless openings and windows, each by id, with
  its size (the hole in the wall) and what lies on its two sides: a room's name, `outside`,
  `nothing drawn` or `a room left out`. A door between two rooms is one row, not one for each
  room. Each row carries the opening's facts of the person's own, a fire rating say, and the CSV
  has a column for each. Without `of`, `grid_schedule` groups the openings by type and size, as
  before.
- **The door schedule and the window schedule** (`grid_schedule` with `of=doors` or `of=windows`,
  ARE-15): the doors, or the windows, grouped into types, one row per type with its count and
  the marks of its openings, as a supplier orders them. A door or window of one of the plan's
  named types (CNT-15, [named types](plan-file.md#named-wall-door-and-window-types-and-finishes))
  is that type: a row of its own, first, in the order the plan lists its types, with
  `basis: named`, its key `door-type:<id>`, its `name`, `material` and `glazed`; one that states
  a size of its own is a type apart (`door-type:D90:1x2.1`). The others are grouped by the kind
  the plan states (CNT-14) and the size of the hole in the wall, and the part that opens when the
  plan states one, with `basis: kind-and-size`; their key is the one the estimate and the IFC
  use, `door:0.9x2.1`, `door:sliding:2.2x2.1` (with `:opens:0.9x2.1` for a stated part). A
  window type lists its sills. The CSV has `name` and `material` columns when a row is a named
  type.
- **The finishes schedule** (`grid_schedule` with `of=finishes`, CNT-15): the finishes plan, one
  row per room with its floor, wall, ceiling and skirting finish and the quantity of each, then
  each zone that names a finish of its own, after its room, and each finish's total. See
  [finishes and wall types](#finishes-and-wall-types).

### Marks

Every row of the room and opening schedules has a mark, and `grid_view` with `marks schedule`
(`grid draw --marks schedule`, and every floor page of `grid sheet --layout check`) draws it
beside its part, so the drawing and the schedules point at each other (ARE-15):

- a room's mark is its number in the room schedule of every floor: the number it states, else
  Grid's;
- an opening's mark is its type's letter, `D` for a door, `W` for a window and `O` for a doorless
  opening, and its place among the openings of that type in the opening schedule of every floor:
  `D1`, `D2`… `W1`…. Marks are codes, the same in every language.

A mark belongs to its part's id, and is the same when one floor is asked for. An edit that keeps
the parts' ids keeps their marks: a room grown or shrunk, a door's kind or handing changed. A
part added by an edit, a room split say, takes its place in id order, so the marks after it in
that order move up by one. A room's stated number (CNT-9) holds whatever is added.

With `format=csv`, numbers are bare (a dot for decimals, no units in the cell, never a negative
zero), so a spreadsheet reads them as numbers; the units are in the column names. A row that
cannot be written, a missing name or an area that is not a number, stops the schedule with an
error naming the row; it is never left out in silence. `grid sheet --layout check` ends with
both schedules as tables, the opening schedule by mark, and the door and window types.


## Take-off

A void contributes zero floor, ceiling and skirting to `grid_takeoff`. The take-off
gives the length of its open edge for a guard, including doorways and doorless
openings in the surrounding walls. In CSV, each void has a `guard` row with the
measurement in the length column. A column through the void leaves the full
opening deducted from the gross floor areas.

## Finishes and wall types

A room or a zone may name its floor, wall, ceiling and skirting finishes, and a wall its named type
(CNT-15, [the plan file](plan-file.md#named-wall-door-and-window-types-and-finishes)). The
finishes plan, the take-off and the estimate measure them from the same rows
(`packages/cli/src/quantities/finishes.ts`), so a finishes plan and a flooring order agree:

- a room's finish covers the room, less each of its zones that names its own finish for that
  surface: that part is the zone's. A kitchen kept as a zone of an open-plan room keeps its tiled
  floor by its own area (lab AC-4);
- the floor and the ceiling are the net area, the walls the inside wall face less openings, the
  skirting the inside perimeter less doorways, as `grid_takeoff` measures each room;
- a surface no room or zone names a finish for is listed as not stated, never given one, and
  never read from the room's use.

`grid_takeoff` gives, on a plan that names any, `wallTypes` (each named wall type's walls: how
many, their gross and net length, their face on one side, the type's material and whether it is
glazed) and `finishes` (each finish's total by surface, with the rooms and zones it covers).
`grid_schedule of=finishes` gives them room by room.

## Quantities for a first estimate

`grid_takeoff` with `for=estimate` (ARE-13) turns the plan into the lines a first estimate
needs. Each line has a key, a quantity in m², m or nr, its rule in one sentence and an
`assumed` mark. They are built on the measuring above: the rooms' take-off, the gross internal
area, each opening once as the schedule counts it, and each floor's outline.

| Key | Line | Assumed |
|---|---|---|
| `floor:finish:<name>` | CNT-15: the floor of the rooms and zones that name this finish (a zone's is its part of its room), each by its net area | no |
| `floor:<use>` | Floor finish: the net area of the rooms of that use that name no floor finish, so a stair is counted once, on the floor it rises from. The person decides which finish a use gets, by the key they price | no |
| `ceiling:finish:<name>`, `wall_finish:finish:<name>`, `skirting:finish:<name>` | CNT-15: the ceilings, inside wall faces and skirting of the rooms and zones that name this finish | no |
| `ceiling` | Ceilings: a flat ceiling as big as the floor below it, in every room but an outdoor space open to the sky | yes |
| `wall_finish:<use>` | Inside wall faces of the rooms of that use, at the height of each wall, less every door, window and opening at full size; both faces of an inside wall count | no |
| `skirting` | Each room's inside perimeter less the width of its doors and doorless openings | no |
| `reveals` | Round each door and window, its sides and head, and its sill when it has one, times its wall's thickness | no |
| `wall-type:<id>:<thickness>` | CNT-15: the walls of one of the plan's named types at one thickness, by the type, so a party wall is never priced as a partition (lab AC-5) | no |
| `wall:<kind>:<thickness>` | The other walls, by the kind the plan states and their thickness: the length between the faces of the walls each one meets (its centre line where it turns a corner, CNT-31) times its height, less openings | no |
| `wall_gable`, `external_finish_gable` | CNT-34: under a roof the floor states, the part of the walls' faces (and of the outside face) above the lowest their tops stand, a gable end's triangle, apart from the lines above, which take the rest; none where no roof cuts a wall | no |
| `external_finish` | The outer edge of each floor's outline, corners in, times the height of the wall it runs along, less openings | no |
| `door-type:<id>`, `window-type:<id>` | CNT-15: the doors and windows of one of the plan's named types, each counted once | no |
| `door:<w>x<h>`, `window:<w>x<h>` | The other doors and windows, by the size of their hole in the wall, each counted once | no |
| `slab` | A slab under the lowest floor's outline, as the take-off lays it: less its openings and any open outdoor space on the ground | yes |
| `upper_floor` | Each upper floor's gross internal area, less every opening in its floor over a stair, a stair room, a lift or a ramp (CNT-31); a void is out of the gross internal area already | yes |
| `roof` | A roof over every part of a floor's outline that no floor above and no open outdoor space covers, so a single-storey part has its roof: on its slope where the floor states a sloped roof, else flat | yes |
| `ridge`, `eaves`, `verge`, `hip` | CNT-31: the edges of the sloped roofs the floors state, in metres, verges and hips along the slope, over the rectangle the roof spans with no overhang and no valleys, as Grid lays the roof | yes |
| `gross_internal` | The gross internal area, for a rate for the whole building: an alternative to the other lines, never added to them | no |

The plan holds no slab, floor structure, roof or ceiling yet, so those lines are worked out from
the outlines and say so. A floor that is part of a larger building gets a slab like any other,
and no roof where the plan states more of the building above it, as `grid_takeoff` does. A room Grid could not draw is left out
of the room lines, and the answer names it.

A cost comes only from the person's own rates, in a file of their own beside the plan:
`rates.json`, or the file passed as `rates`, inside the project folder. Grid has no prices.

```json
{
  "label": "Where these rates come from",
  "currency": "EUR",
  "rates": {
    "floor": { "rate": 40, "unit": "m2" },
    "floor:bathroom": { "rate": 85, "unit": "m2", "waste": 0.1 },
    "wall:exterior": { "rate": 120, "unit": "m2" },
    "door": { "rate": 350, "unit": "nr" }
  },
  "orders": {
    "Plasterboard": { "for": ["wall_finish", "ceiling"], "covers": 2.88, "waste": 0.1, "pack": "sheets of 1.2 x 2.4 m" },
    "Paint": { "for": ["wall_finish", "ceiling"], "covers": 50, "coats": 2, "pack": "tins of 5 l" }
  }
}
```

- A rates file that names no currency is refused, and so is a rate below 0 or in a unit other
  than `m2`, `m`, `nr`, `ft2` or `ft`. A field Grid does not read is refused by name.
- A rate prices the lines whose key it is, or begins with followed by a colon: `wall:exterior`
  prices every outside wall thickness, `door` every door size, and an exact key wins over a
  shorter one. A rate per ft² or ft is turned into one per m² or m.
- A key is a word in small letters (`floor`, `wall-type`), then whatever follows its colons: a
  type's id or a finish's name stays as the plan writes it (`floor:finish:Oak boards`), so the
  rate card, filled in, is read back as it is (CNT-31).
- A rate's `waste` is a share added to the quantity before it is priced.
- A line with no rate, or with a rate left `null`, is listed and never filled. A rate in another
  unit than its line's is not used, and is listed apart from the lines with no rate. A rate that
  prices no line of the plan is named, so a mistyped key shows.
- The total adds up the priced lines only, and says when it is not the whole cost.
- An order says which lines it is for, how much one pack covers in their unit, the coats and
  the waste; Grid gives the whole packs needed. Every figure in it is the person's.

With no rates file the answer holds no money: it is a rate card, every line with its key and
unit, and the data's `rateCard` is a rates file ready to fill in. With `format=csv` the bill is
one row per line with its rule and assumed mark, then the total and the orders; amounts are
values, not formulas.
