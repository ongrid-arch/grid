# Writing a plan rooms first

Read this first to write a plan. Rooms text names the rooms, doors and windows; Grid works out
the walls. The command is `grid write` ([commands.md](commands.md)) and the tool
`grid_write_rooms` ([tool-server.md](tool-server.md)).

The main way to write a plan, for an agent or a person: name the rooms with their inside sizes
and where each goes, and the doors and windows by the rooms they join. Grid works out the walls,
whether each is an outside or an inside wall, each room's boundary and where each opening sits,
and writes them into the plan file.

```
walls outside 0.3 inside 0.1 height 2.6
room living  "Living room" living   4.4 x 4.2
room kitchen "Kitchen"     kitchen  4.4 x 3.0  north of living
room hall    "Hall"        corridor 1.3 x *    east of living until kitchen
door d-living between hall and living, 0.1 from south, 0.8 wide, opens into living
door front    in hall north, centred, 0.9 wide, opens in, hinged east
window w-living in living south, centred, 1.8 wide, sill 0.6, height 1.5
```

- Lengths are in the person's units. A plain number is metres; a length may carry its unit in
  one word, with no space: `360cm`, `3600mm`, `12ft`, `12ft6in`, `12'6"`, `150in`, so
  `room living "Living room" living 14ft x 12'6"` is as good as `4.267 x 3.81`. A `display` line
  (`display ft-in`, `display mm`, `display m decimal comma`) records how the person reads lengths
  and areas: the drawings, the figures and the sheet follow it, and the read-back writes it again
  ([Units](plan-file.md#units)). The plan file stays in metres either way. Settle the units with
  the brief, from the person's words or their place, and ask only when neither says.
- Under a `display` line that is not metres, a plain number is never taken as metres by
  itself. The display line says what it is with `numbers <m|cm|mm|ft>`: under
  `display ft-in numbers ft`, `room family "Family room" living 18 x 20` is 18 ft by 20 ft; under
  `display mm numbers mm`, `4800 x 3600 at 0,0` is in millimetres, positions as well as sizes.
  Without `numbers`, a plain number other than 0 is refused as `rooms/units`, a question that
  names the number with its unit (`18ft`) and the `numbers` word to add. The read-back writes its
  lengths in metres, so it writes `numbers m` on such a display line. Raw parts are the plan
  file's own JSON and stay in metres.
- An id is written in plain letters, so every tool and edit takes it (MSG-22): a word outside
  quotes has its accents taken off, so `room baño "Baño" baño 2 x 2` writes the id `bano`, and
  `north of baño` names it. The answer names each id written so (`rooms/id-folded`). An id with a
  letter that has no plain form (`客厅`) is refused on its line (`rooms/bad-id`), which offers a plain
  id made from what the part is (`room living "客厅"`). A name in quotes keeps the person's own
  words, accents and all. A name holding a quote mark is written in the other quote mark
  (`"Kid's room"`, `'The "den"'`), or with a backslash before the mark: `"The \"den\""` (WRT-55). A plan whose file already holds such ids reads back with plain ones in
  their place (CMD-24): the read-back names each in a comment, and writing it back gives the plan
  those ids. Every tool and option reads an id by this one rule (`readPlainId`).
- In a text read in feet (`display ft-in`, or `numbers ft`), `12-6` is refused as `rooms/units`:
  it reads as 12 minus 6. Write `12'6"` or `12ft6in` for twelve feet six inches, or `(12-6)` in
  brackets for the difference. A sum such as `3.0+0.3` is read as before.
- A polygon's points take lengths with their unit, as a size does: `polygon 0,0 40ft,0 40ft,25ft
  0,25ft` (WRT-62). A point whose length Grid cannot read is refused naming that word, and a
  polygon with a unit in its points is taken as meant, at any size. A long polygon reads back with
  `m` on its points.
- A polygon's points are its place: from the drawing's origin, or the unit's in a unit. `at x,y`,
  a side (`north of <room>`) or a corner (`inside <room> corner <c>`) on the same line is refused
  as `rooms/syntax`, never read as a move (WRT-63). For `at`, the refusal gives the points moved
  by that much, ready to write in their place.
- A length written with its unit is taken as meant, at any size: `250m x 160m`, `250000mm`,
  `0.5km`. A room side written as a bare number, stretched with `*` or drawn as a polygon that is
  longer than a building's is still written, in metres, and the answer asks about it
  (`rooms/size-question`): past 200 m, 50 m in a home, or 1000 m where the plan or a floor says
  `building assembly`, `sport`, `industry` or `warehouse` (`roomsSideAsked` in
  [tolerances.md](tolerances.md)). Write the unit to say it is meant. Only a bare side past 2 km
  is refused (`rooms/size`), as most likely millimetres.
- North, east, south and west are the drawing's sides, north at the top, even in a plan that
  states its real north ([plan-file.md](plan-file.md#north-front-and-where-the-building-is)).
- A size is east-west by north-south, to the inside faces. `3 x 4 centre` measures to the walls'
  centre lines and `8 x 10 outside` to the outside faces; `sizes outside` makes that the
  default. The answer states for each room what its size measured to, and its inside size.
  A room so sized and placed by its corner (`at x,y`, or the first room, at 0,0) is placed by
  the corner its size measures to, so rooms written on a grid have their walls' centre lines on
  it (WRT-47): `12 x 10.8 centre at 12,0` runs from x = 12 to x = 24. Where two such rooms meet
  on a line, the wall between them is the inside thickness (or the one a `walls` word or a
  `wall between` line gives), its centre line on that line, also where the rest of the side is
  outside; two rooms sized to their outside faces that meet add up to the two sizes, placed by
  their corners or one beside the other (`2.44 x 6.06 outside east of a`, two containers), and so
  do rooms of a unit placed by their corners (WRT-55).
- A room line places a room once and sizes it once: `north of a south of a`, `at` twice, `at`
  with `east of`, or two sizes are refused by name (`rooms/syntax`), never read by the last words.
- The `walls` line is for the floor it is written on, while that floor has no rooms, and every
  floor after it (WRT-47). A walls line written after a floor's rooms leaves that floor with the
  walls it started with, and the answer says so (`rooms/walls-late`); a copied floor keeps the
  walls of the floor it copies. A floor that states its `height` gives its walls that height;
  where the walls line says another, the answer says which won (`rooms/walls-height`).
- A floor line starts each storey (WRT-14):
  `floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]`.
  The name is in quotes, or left out and the id names the floor (`floor ground`). `level` is the
  storey number, 0 the ground floor, 1 the one above, -1 a basement, 0.5 a half level; it is
  never a height. `elevation` is the metres from the ground floor's level up to this floor's,
  `height` from this floor to its ceiling (its walls take it), `slab` the floor it stands on. A
  floor with no elevation stands on the one below, at that floor's elevation and height plus its
  own slab, so a floor-to-floor figure is each floor's `elevation`, not its `height`. Settings
  written `elevation=0` or `level: 1` are read as `elevation 0` and `level 1`; an unquoted name,
  `level 2.85` or `level -9ft` is refused, and every refusal shows the whole line. A refusal
  names the fault (WRT-69): a number right after the id stands where the quoted name goes, and
  is offered as `level <n>` when it can be the storey number; a quoted name written after the
  settings is offered back right after the id; and a word with nothing after it (`slab`) says
  what it takes (`slab <m>`). A walls, doors or windows line ending on one of its words says
  that word needs its value, and `slab`, `elevation` or `level` there is written on the floor line.

  ```
  floor ground "Ground floor" level 0 elevation 0 height 2.6
  floor first "First floor" level 1 elevation 2.875 height 2.6 slab 0.275
  ```
- `floor -0.15` on a room line puts its floor that far below its storey's (a genkan; LVL-7),
  `height 2.4` gives its own height. A word a room line does not take is refused with every word
  it does take, and the one most likely meant with its value: `level 0.6` on a room line is
  answered "Did you mean 'floor 0.6'?" (WRT-35).
- The word after a room's name is its use: one of Grid's uses, a word that plainly means one
  (`wc` is toilet, `bryggers` utility), or `-` for none. The name keeps the person's own word.
  `tenure common` and `type "B2 double"` on a room line say who it is for and the firm's own room
  type. `building office` says what kind of building the plan is, and `building shop` on a
  `floor` line what that floor is ([the plan file](plan-file.md#what-kind-of-building-it-is-and-what-each-room-is-for)).
  `outdoor` or an outdoor kind (`terrace`) written as the use is refused with the line written
  the way that writes: `-` for the use and `outdoor terrace` after the size (in `fixes`).
  Outdoor words such as `patio` and `deck` offer the same correction (WRT-76).
- A room stands on the floor whose floor line comes above it. `floor first` on a room line is
  refused with that (WRT-55): write the floor line, then its rooms under it. On a room line,
  `floor <m>` is a number, its own floor raised or sunk.
- `unconditioned` on a room line says it is neither heated nor cooled, so out of the living area
  under air, and `conditioned` that it is (ARE-60, [areas.md](areas.md#living-area-under-air-and-total-under-roof)):
  `room g "Garage" parking 3 x 5 east of l conditioned` counts a heated garage, and
  `room s "Store" storage 2 x 2 east of k unconditioned` takes an unheated store out. Unstated, a
  parking room is not under air and every other room is. Outdoor space never is: either word on
  its line is read as nothing, and the answer says so (`rooms/conditioned-outdoor`).
- `number "2.03"` on a room line states its room number, `dept "ED"` its department (the fact
  `department`) and `facts department=Sales capacity=4 "head count"=8` facts of the person's own
  (WRT-74, [the plan file](plan-file.md#facts-of-your-own-and-room-numbers)). A value in quotes is
  text; one out of quotes is a number when it reads as one (`4`, not `007`), yes or no for `yes`,
  `no`, `true` or `false`, and text otherwise. A fact given twice, under any spelling, or with no
  value is refused, and so are the three words in a unit, which is placed many times: give each
  placed room its own with `grid_set_facts`, by its id. `grid describe --as rooms` writes a room's
  number and facts on its line; one it could not write so that it reads back the same is kept by
  id when the text is written again, as before.
- `outdoor terrace` on a room line marks it as outdoor space (CNT-7), one of `garden`,
  `courtyard`, `terrace`, `balcony`, `light-well`, `porch`, `carport` or `other`, and `roofed` or
  `unroofed` after it says whether a roof covers it; unstated, a porch and a carport are roofed.
  Its exposed sides and shared edges with other outdoor rooms are open by default
  ([outdoor space](plan-file.md#outdoor-space-roofed-or-open)). The wall between it and an indoor room is
  an outside wall: `exterior`, and a room placed beside it (or it beside a room, a unit's rooms
  or a room's corner) is set off by the outside thickness, unless a `wall between` line or the
  building room's own `walls` says otherwise (LVL-12). The outdoor space's own `walls` never
  thins the building's wall: they are its edges, a railing or a fence. A window onto it is in an
  outside wall. An outdoor room can stand apart from other rooms with unfilled ground between.
- On any room, `edge railing 1.1` draws a railing 1.1 m high along the sides that face no room.
  Its thickness comes from the room's `walls`, or the floor's inside thickness. `edge wall 0.45`
  draws a 0.45 m parapet, using the room's `walls` or the floor's outside thickness. With
  `edge wall` alone, the edge takes the floor's wall height. Use `wall <room> <side> virtual` to
  open one outside side, or `wall <room> <side> railing height 1.1` for a railing on one side.
  On an outdoor room, `height` sets headroom. Put a parapet or railing height after `edge` (WRT-76).
  Write an access gallery as `corridor … outdoor other` or an outside stair room as
  `stair … outdoor other` to use the same open edges.
- `*` stretches a side as far as the room named after `until`: to that room's far face, or to its
  near face less the wall between when that room stands in the way of the stretch, or the line
  says `until near <room>` (WRT-55). A `*` along the room it is placed beside, with no `until`
  (`room hall "Hall" corridor * x 1.4 north of living`), takes that room's extent, and the answer
  says so. `inside <room> corner ne` cuts a
  room out of another's corner and closes it with its own walls, in a corner against the outside
  walls or against a neighbouring room, however small: the end of its wall, seen across the corner
  from the room next door, is never read as a gap or a wall between that room and the host
  (WRT-53). A room cut from a corner may be exactly as wide or as deep as the host's side there
  (a cupboard under a stair, a sleeping loft across a cabin): it is cut across the host as a strip,
  with one dividing wall (or line, with `open`), and the host keeps the rest. A size that with its
  wall comes to the whole side takes the whole side, and the answer says so; a cut that does not
  fit is refused with the sizes that do (WRT-66). `unit`, `place`, `repeat` and `mirror` write a group of rooms
  once; `copy <floor>` starts a floor from another, and `through <floor>` stands a room on the
  floors above its own ([many of one room](#many-of-one-room-floors-copied-and-walls-through-floors)).
- Grid infers one wall from a gap up to 0.6 m. For a thicker wall, give its thickness with
  `walls <t>` on a room, `walls inside <t>` for the floor, or `wall between <a> and <b> <t>`
  for that pair. Write the wall line before the room it places. Rooms placed by their own
  coordinates keep those positions, so the wall takes the measured gap up to the stated
  thickness (WRT-77).
- Rooms that overlap, that touch with no wall between them (unless one is `open` to the other),
  or that leave a gap between indoor rooms are refused in plain words naming both
  rooms. Every refusal has a code, such as `rooms/overlap`. Each gives the advice that applies
  (WRT-55): a gap too wide for a wall is refused with the size of each room that closes it to the
  wall between them; `open` is offered to a room placed beside the other, `open <room>` to one
  placed by its corner, and a corner (`inside <room> corner`) only to a room that fits inside the
  other, or is as wide or as deep as it and smaller the other way. A `wall between` line for two rooms placed touching stands its wall on the line they
  share, each room giving up half of it, and the answer says so (`rooms/wall-on-line`).
- `open` on a room line and `wall between <a> and <b> virtual` anywhere on the floor (or in the
  unit) say the same thing: a room placed beside the other is placed against it, with a dividing
  line on their shared face, so both keep the size written for them (WRT-41). A unit placed
  beside a room goes against it when every room on its facing side is opened to that room. The
  gap beside a unit is worked out for the rooms that face each other across it, two by two, and
  a dividing line takes no wall's width (WRT-52): an open lab beside a bay of a lab and a
  write-up room, opened to the lab only, goes against the lab. Sized to centre lines
  (`sizes centre`), such bays keep their module, repeats included: a bay written 3.3 m wide is
  3.3 m between centre lines, the lab 3.3 m inside between two dividing lines and the write-up
  room half a wall narrower on each walled side. Sized to inside faces they cannot both keep their
  sizes, and the answer says the labs came out larger (`rooms/area-differs`). Rooms
  placed by their corner (`at x,y`) or as polygons stay where they are written: a dividing line
  in a gap between them lies in its middle, and the answer says the rooms came out larger
  (`rooms/area-differs`). A side shared at an angle works as a square one does (CNT-36): a
  polygon room written to the centimetre against the angled side of another, a few millimetres
  off it, still shares that side, and the two get a dividing line, or a wall, along it and no
  outside wall across it. Two rooms opened to each other that share no side are refused,
  naming both and the rooms each shares a side with (`rooms/no-shared-wall`). Sides further out
  of parallel, up to 5 degrees (`roomsFaceTurn`), that are no further apart than a wall at both
  ends of what they share are one wall's two faces, as a scanned room's are (WRT-56): a surveyed
  partition between rooms drawn a little askew, or a curved band of rooms written as facets that
  do not line up with the band beside it. The wall runs along the middle line between the sides,
  as thick as a wall the text states where the gap passes through that thickness, else as the gap
  on average (`rooms/wall-from-gap`). The rooms keep their corners, and the answer says once a
  floor which rooms' sides are out of parallel, by how much and how far a wall's face is off them
  (`rooms/faces-turned`).
  A bare `open` opens the room to the room it is placed beside, and the answer says which (WRT-55);
  `open <room>` names it, also for a room placed `at x,y`, where a bare `open` is refused. On a
  room cut out of a corner (`inside living corner ne open`), `open` opens it to the room it is cut
  out of, with no wall between: a stair or a closet that is part of the room.
- A door or window line may say its kind (CNT-14): `sliding`, `double`, `folding`, `pocket`,
  `roller`, `garage` or `single` for a door, `single`, `double`, `sliding`, `fixed` or
  `high-level` for a window; `part 0.9` (or `part 0.6 x 1.0`) for the part that opens. A door
  is hinged on a side of the drawing (`hinged east`) or, as a person says it, on the left or
  the right seen from the room it opens into, or from another (`hinged left`, `hinged right seen
  from bedroom`). A sliding, pocket, roller or garage door needs no swing, and none is guessed
  for it ([Kinds of door and window](plan-file.md#kinds-of-door-and-window-their-handing-and-the-part-that-opens)).

  ```
  door d-patio in living south, centred, 2.4 wide, sliding
  door d-bed   between hall and bedroom, 0.1 from west, 0.8 wide, opens into bedroom, hinged left
  ```
- A door, window or opening may carry a name after its id, in quotes (`door front "Front door"
  in hall north, centred, 0.9 wide`): it is kept in the opening's facts as `name` (WRT-55).
  Between two rooms, a `<m> from <side>` that, measured along the room's side as before, would
  fall outside the stretch of wall the two share is measured along that stretch, from its end on
  that side, and the answer says so; `opens in` or `opens out` is refused (neither room is the outside),
  with the line written `opens into` each room. The first of those is the room the words most
  often mean: `opens out` out of the smaller room (a toilet or a store opens out into the room
  beside it) and `opens in` into it, or, for two rooms the same size, the room named second
  (WRT-65). A door between two raw rooms, or a raw room and another, is refused the same way.
  A window written in a side that is partly the
  wall to another room goes in that side's outside stretch, placed along it, and the answer says
  so; one that already stands in the outside stretch as written stays where it is.
- A room whose outline steps (a corner cut out for a WC, an L) can have more than one side
  facing one way. `in <room> east.1`, `east.2` picks one, counted from the west, then the south
  (WRT-51). A line that says only `east` there is refused with each of those sides by its word,
  its length and what lies beyond it (a room, or the outside), and with the line written each
  way that writes (`rooms/no-side`, the lines in `fixes`). In a unit, the one side that looks
  onto something outside the unit's own rooms (the corridor, the outside) is taken, and the
  answer says so with the word for each other side: a cabin door written `in cabin north` goes
  to the corridor, not into the cabin's own bath partition. Two rooms that share more than one
  wall (`rooms/two-shared-walls`) are offered the same way, the line with `in <room> <side>` in
  place of `between`, for each shared wall that writes. A door or doorless opening written in a
  side of which a part is onto the outside, as a front door is once a store is carved in the
  hall's corner beside it, is never offered only lines that lead it into a room: when the side
  onto the outside is too short for it, the refusal offers no line and says so, with the side's
  word for a door meant to lead into that room (WRT-57).
- Written over a plan, the answer names each door that now joins other rooms than it did,
  from where it stands, as an edit does; one that no longer leads outside comes first, said so
  ("No longer leads outside: …"). Its count is what `grid check` will list, the routes out
  included, beside the drawing problems: `To look at: 0 → 2, of them problems in the drawing
  0 → 0`; the data has `toLookAt` and `doors` (WRT-57).
- What Grid writes passes its own check (WRT-17). It reads the plan back as `grid check` will
  before writing it, so the walls it works out close every corner and join only where walls meet.
  Each wall end reaches the centre line of the wall it meets however thick the two are (a 1.8 m
  wall at a 3 m front, WRT-39), and where two rooms open to each other and the outside turns a
  corner, the two outside walls meet each other there, not the open line.
  Two doors or windows that share a stretch of one wall, a window over a door too, are refused
  (`rooms/openings-overlap`), as is a door or window that would run off its wall
  (`rooms/opening-fit`) or anything else the check would leave out (`rooms/check`, in the check's
  own words). What the check would still note is said in the answer: floor the rooms close round
  that no room claims (`rooms/hole`, with where it is: write it as a room, `-` for no use, or
  `outdoor courtyard`), a wall only as thick as the gap two rooms leave when no line states that
  thickness (`rooms/wall-from-gap`), and any other note (`rooms/check`). Between two indoor rooms
  the outside thickness is not an inside wall's, and a wall thicker than the one the rooms would
  be set apart by says how much thicker, the floor in it and the size of either room that closes
  the gap, or how far to move a room with no plain size (WRT-67). A part written `raw` is
  the person's own and is kept as written: what the check finds on it is said, never refused.
- A door between two rooms that share no wall (`rooms/no-shared-wall`) is refused with the line
  that would make them share one, when changing how one of them lines up does (BRF-6, lab
  AB-11): `With line 3 written 'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1 align
  east', they share a wall.` Nothing is changed: the line is offered, and the problem carries it
  as data (`fixes`: `line`, `text`).
- From the brief's rooms and sizes, `layout` writes a first layout as rooms text
  ([A first layout from the brief](brief.md#a-first-layout-from-the-brief)).
- What rooms cannot say is written raw, one line of the plan file's own JSON:
  `raw wall {...}`, `raw room {...}`, `raw opening {...}`. Free-standing walls, curved or
  out-of-the-way walls and rooms with holes are written that way.
- A raw wall or room with no `"floor"` is on the floor of the floor line above it, as a room
  line is (WRT-27). One that states its floor keeps it, and one that names a floor the text does
  not write is refused with its line (`rooms/unknown-floor`). A raw opening is on its wall's
  floor: one written under a floor in a wall of another (a wall with no `through`) is refused
  with its line (`rooms/raw`). With no floor line the plan has one floor and a raw part gets no
  floor; a `raw floor` line there gives its fields to that one floor, the ground floor, and the
  plan writes it with them.
- A stair is a line of its own (LVL-21), after the rooms it names:
  `stair <id> ["<name>"] from <floor|room> to <floor|room> in <room>, <width> wide, straight|L|U, runs <side> [then <side>] [along <side>] [risers <n>]`.
  It writes the plan's own stair (`stairs`), which the drawing's treads and break line, the
  sections, the 3D model, the IFC export and the way-out check read: never draw treads as walls
  or leave a stair an empty room. A room after `from` or `to` stands for its floor, and with no
  `in` the stair goes in the room `from` (or else `to`) names. `runs` is the way the walking line
  goes from the `from` floor. Grid lays it in the box of the room's inside faces, each end of the
  walking line a landing as deep as the stair is wide inside the room: a straight one centred
  across the room, or against the side `along` names; an L up the side away from its turn, a
  square landing in the far corner and on towards the side `then` names (a quarter turn
  clockwise from `runs` when left out); a U up one side and back down the other. Grid's stairs
  turn on square landings as wide as the flight, so a U is two landings with a short flight
  across the well between them, in a room wider than twice the stair. `..., <width> wide, run x,y x,y ...`
  gives the walking line itself, for a stair in a room it does not fill. The answer gives, among
  what Grid chose, each stair's walking line, risers, their height, the going and the pitch; a
  stair that does not fit its room is refused naming the room's size and what it needs
  (`rooms/stair`), and an end that lands in no room is said with its line (`rooms/stair-end`).
  `raw stair {...}` takes the plan file's own JSON for a stair, kept as written. The read-back
  writes every stair as a line: in its room when the room gives back its walking line, along
  its walking line otherwise, and raw when Grid cannot lay it out. `grid write` keeps the file's
  stairs when the text writes no stair line, and says so; `grid_add_stair` and
  `grid_change_stair` write and change the same stairs on the tool server.
- A door, window or opening line may name a raw room (WRT-45). `between <a> and <b>` goes in
  the one wall both rooms' boundaries name, and `in <room> <side>` in the one wall of the room
  whose outside face looks that way, a curved wall too. The place is `centred` or
  `<m> from <side>`, measured along the wall (its arc, when curved) from the end that lies that
  way, never `of` another room. When the line does not say which wall (none in common, or
  several), it is refused with the room's name, its walls and the `raw opening {...}` line to
  write instead (`rooms/no-shared-wall`, `rooms/two-shared-walls`, `rooms/no-side`). A floor
  whose rooms are all raw reads its door and window lines like any other.
- Nothing raw is dropped in silence (WRT-48). A raw part's field the plan file does not have is
  refused with its line, the nearest field Grid knows and the fields that place has: a curve is
  `"arc": {"centre": [x, y], "sweep": <degrees>}`, never `bulge` or `spline`, and facts of your
  own go in `"properties"`. A `raw floor` field the floor does not take is named too (a height is
  written on the floor line). Raw takes `wall`, `room`, `opening`, `floor` or `stair`: `raw door` is told
  it is a raw opening, `raw column` and `raw fixture` that the plan file
  holds them in its own lists, `raw staircase` how a stair is written, and `raw site` that the site has lines of its own (`rooms/raw`), however `raw` is written: `Raw stair {...}` and
  `Raw wall {...}` are refused offering `raw stair` and `raw wall`, as rooms text is read in small
  letters (WRT-68). A `plan` line takes one name, in quotes when it has
  spaces, and words after it are refused (`rooms/syntax`); a wall line naming no room of its
  floor is refused with the nearest room (`rooms/unknown-room`).
- The answer counts and measures every part written, raw or not: the floors that hold a part,
  every room with its inside area by Grid's own measure (a raw room too, marked "written raw"),
  and the area in all. The count of rooms says how many were written raw: "(all written raw)"
  for a text of raw lines only, such as the read-back of a floor rooms text cannot give back, or
  "(2 written raw)" (WRT-71). When parts were written raw, a line says how many walls, rooms and
  openings were, kept as written; the walls "worked out" and the openings "placed" are the ones
  Grid worked out.
- A room's name and its id go into every export and sheet, and travel with the plan file: name
  a room for what it is, never for a person. Who sits where is kept in a file of its own
  ([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).
- The full language is by topic, with an example each, in [The whole grammar](#the-whole-grammar)
  below, which the tool server also serves as `grid://guide/rooms`. The
  [guide for agents](agent-guide.md) has it in short, with what agents ask first, and
  [samples/](samples/) three whole plans written this way.

## Many of one room, floors copied, and walls through floors

A room type written once can be placed many times (WRT-4). `unit` writes it, with settings that
each placement may change; `repeat` places it in a row, the first where the line says and each
next one on the given side of the one before; `first` and `last` settings hold for the two ends
only, such as end rooms a wall's width narrower. `mirror north-south` turns the row to face the
other way. The lab's hotel floor, twelve rooms and a corridor that the hand-drawn file holds in
103 parts, is 17 lines:

```
unit guest w=3.45 bw=1.875 door=0.275 win=centred bhinge=south
  room room "Room {n}" bedroom  $w x 7.25
  room bath "Bath {n}" bathroom $bw x 2.25 inside room corner nw wall 0.1 partition
  door door between room and corridor, $door from east, 0.9 wide, opens into room, hinged west
  door bdoor in bath east, 0.75 from south, 0.8 wide, opens into bath, hinged $bhinge
  window win in room south, $win, 2.0 wide
end
repeat guest 6 east as 301 at 0.15,0.15 first w=3.375 bw=1.8 win="0.65 from west" last w=3.375 door=0.2 win="0.725 from west"
room corridor "Corridor" corridor * x 1.4 north of 301 until 306 walls 0.2
repeat guest 6 east as 307 north of corridor mirror north-south bhinge=north first w=3.375 bw=1.8 win="0.65 from west" last w=3.375 door=0.2 win="0.725 from west"
```

A first label ending in digits counts up from them and keeps their width (301, 302, … 306;
001, 002; A01, A02), and any other takes a number after it (A1, A2, …) (WRT-55). Each part's id is its name in the unit and the placement's label, `room-301`,
`door-306`, so the same text writes the same ids every time, and a row that grows by one keeps
the ids it had.

- `fill <length>` on a repeat line works out the one setting written `*` so the row is that long,
  to the faces its rooms' sizes measure to (WRT-55): `repeat bay 6 east as 1 at 0,0 w=* fill 20.7`
  gives six bays and their five walls 20.7 m. A row that cannot come out that long is refused
  (`rooms/fill`). A row whose first unit is placed beside a room across the row (its street, a
  corridor) and that runs past an end of that room is said once, first among the warnings and
  first among the problems when the text is refused, with how much narrower each unit makes it
  end with the room (`rooms/row-overrun`); so is a room of a fixed length placed beside a row.
- `floor l4 "Fourth floor" level 4 copy l3 with openings` starts a floor as a copy of another,
  on its own line, as `copy l3` does on the line after. The copy takes the floor's outline, roof,
  parapet, homes and parking too; a `raw floor` line on the copy sets any of them for that floor
  alone, and `null` takes one off it (`raw floor {"roof": null}`). Without `with openings` it
  takes none of the doors and windows, and the answer warns (`rooms/copy-no-openings`) when
  copies are left with none.
- `copy l3 with openings turn 15 [clockwise] [about x,y] [move dx,dy] [scale 0.95]` copies the
  floor turned (degrees counter-clockwise, or clockwise with the word), about a point (left out,
  the middle of the box round its rooms), scaled about it and then moved (LVL-22). A scale makes
  the rooms smaller or larger and keeps the walls as thick; doors and windows keep their sizes,
  distances and the sides of their rooms. A room written with `through` stays where it is, and the
  floor's outline turns with it; a sloped roof does not, and the answer says so
  (`rooms/turned-roof`) unless the turn is by quarter turns.
- `repeat floors 39 from f00 with openings turn 2 rise 3.4` writes 39 floors after `f00`
  (`f01` … `f39`, counting up from its digits, or from `as <first id>`), each a copy turned,
  moved and scaled once more than the one below and `rise` metres higher: a twisting, stepping
  or tapering tower in one line. Each floor is worked out from the floor repeated, so the last
  carries no rounding of the ones below, and the file holds every floor written out with ids that
  come out the same on every writing. A repeat writes at most 200 floors; lines after it are for
  the last floor it wrote.
- An id written on several floors stays as written on the first floor that writes it, and takes
  its floor's id in front on the others (`l4-room-301`), so a copy never renames the floor it
  copies; the answer names each one.
- `through <floor>` on a room line stands the room, and so its walls, on every floor written
  after its own up to that floor, in the same place: a stair or lift core, a shaft, a block's
  outside walls. What the text says about the walls between such rooms comes with them, and so
  does a door, window or opening written between two rooms that both rise (a stair and its
  lobby); one in a rising room's outside wall stays on its own floor. A floor that writes its own
  opening between the same two rooms keeps its own, and `remove <id>` takes a carried one off. A
  floor copied from one they rise through holds them once.
- A stair or a lift that rises to a floor where no door is written into it (nor into the rising
  rooms its openings join it to) takes up its doors to rooms that do not rise, from the floor it
  is written on, in the same place, where its wall there is shared with a room of that floor (a
  roof terrace) (LVL-19). Each takes the floor's id in front of its id, and the answer names them
  (`rooms/door-carried`). A door whose place there faces the outside or another rising room is not
  carried, a window never is, and a floor that writes a door into the stair gets none.

The plan file holds every room, wall and opening written out, floor by floor, with the ids the
text gave them: a repeat, a copy or a room through several floors leaves nothing in the file for
another program to work out.

A unit can be a flat type (CNT-4): `unit one flat "One bedroom" "Flat {n}"`, the type's name and,
if given, the flat's name with `{n}` for the label. Every placement of it, by `place` or `repeat`,
is a flat of that type in the plan's [flats](plan-file.md#flats-and-flat-types), with the label as
its id, the rooms placed as its rooms, and `mirrored` when it is placed mirrored one way. The
lab's four-flat floor places two flat types twice each, one of each mirrored:

```
unit flat1 flat "One bedroom" "Flat {n}" fh=west
  room living  "Flat {n} Living room" living   5.265 x 4.365
  ...
end
place flat1 as A at 0.175,0.175
place flat1 as B east of riser gap 0.3 mirror east-west fh=east
```

A floor copied from one with flats has them too, each with its floor's id in front when the label
is on an earlier floor too (`f1-A`). `grid write` writes the flat types and the flats a text places
over the file's; a text that places none keeps the file's, and says so. A duplex, a flat on two
floors, is written in the plan file's `flats`: rooms text places a unit on one floor.

An [opening pattern](plan-file.md#opening-patterns) is not rooms text, in a unit or out of one: a
`pattern` line is refused with where it goes. It lives in the plan file's `patterns`, naming its
wall by id, and `grid write` keeps it, so a row's outside wall can carry a pattern on its own floor
and, with its `floors`, on the floors copied from it. Its openings take ids of their own,
`<pattern>-<floor>-<n>`, beside the row's `l3-win-301`; an id that would be another part's is
left out and named (`pattern/id-clash`). A pattern counts from its wall's start, so for a row that
grows, write that wall to start where the row starts (`wall 1 north reversed`): then its openings,
like the rooms, keep their ids when the row grows by one. When the walls written leave a kept
pattern without its wall, `grid write` says so in its answer.

Fixtures and furniture (the plan file's `items`) are written in `item` lines of their own (CNT-45,
[Items](#items)): against a side of a room, their turn worked out, or at a point. `grid describe
--as rooms` writes every item back as an item line, so writing the text again keeps it; the text's
item lines replace the file's items. A text that writes no item line never clears them: they stay
as the file has them, each one that stands against a wall moved with that wall, and their ids
stay taken. `grid write` and `grid_write_rooms` say how many they kept, each one with the room it
stands in now, and name at once one the new walls run into or that now stands in no room
(`itemsKept` in the tool's answer, WRT-46). `grid_add_item`, `grid_move_item` and
`grid_remove_item` add, move and take out one without rewriting the plan. A refusal of a taken id
names the part that holds it and where it is.

The walls Grid works out are named by what they are: `ext-south` for an outside wall facing south,
`w-hall-kitchen` for one between two rooms, `w-hall-south` for one with a room on one side only,
numbered by place (`ext-north-1`, `ext-north-2`) when one building has two of a name, and with the
floor's id in front on a plan of several floors (`g-ext-south`). On a floor with buildings that
share no wall, a shed and a pump house beside it, the building whose room comes first in the text
keeps those names and every other one puts its first room's id in the names that name no room
(`ext-pump-south`). So adding a building elsewhere renames no wall of the others, and a pattern on
one keeps placing its openings.

**The plan file is the source of truth.** Its walls stay in it, and they can still be changed
there or with the tools; rooms text is a way of writing the plan and of reading it.
`grid describe --as rooms` reads any plan back as rooms text, and writing that text again
changes nothing: the walls line comes with every exception the plan holds (a wall's height,
thickness, kind, id or direction), and a floor that rooms text cannot give back as it is comes in
the plan's own terms. Whatever comes in the plan's own terms is named in a comment line above it,
with why (WRT-42): a floor's names the wall or room that stops rooms text (`wall 'ext-south'
stands elsewhere`), and an opening rooms text cannot write as it is (one drawn across the corner
of two rooms) comes as a `raw opening` on its own, so the rooms, walls and other openings of its
floor stay rooms text. What any plan reads back as, copied floors included, writing takes
(WRT-44): a door as wide as its room's side, which the file can hold a tenth of a millimetre wider
than the side, is written to fit it; rooms are placed to the hundredth of a millimetre a wall's
half thickness can fall on (a 4.5 in wall's); a dividing line along a row of open rooms is said
once for each two rooms across it; and a floor after one given in the plan's own terms writes its
ids whole. A wall with no length (its two ends one point), which an older writer could leave in a
plan, is left out of the read-back as the check leaves it out, named in a comment line at the
top. The writer itself never writes one: where two outside walls stand closer than their own
thickness (the notch between two flats of a row) the wall between them is left out, and an
opening put there is refused with its line; a `raw wall` whose two ends are one point is refused
with its line (`rooms/raw`). The walls line's height is one the walls state themselves (WRT-40): a wall
that takes its height from its floor, or rises to its floor's roof, gets it again from the floor
line, never the roof's ridge written as a wall height. So that nothing is lost unseen, `grid write` refuses, with the difference,
rooms text read from an earlier version of the plan (its `based on` line) and rooms text written
over a plan changed some other way since Grid last wrote it; `--replace` writes over it anyway.
It also refuses rooms text that names fewer floors than the plan holds, naming each floor it would
drop with its rooms, outline, homes and parking (WRT-16): read the whole plan back and write that, or
add `--replace` to drop them, which the answer then lists. Rooms text with no rooms is refused
even with `--replace`.

Some parts are derived: Grid works them out and no one writes them. In a plan written rooms
first (it records this in `written`), each room's boundary is derived, and one edited by hand is
refused by the check with its own code, `room/derived-edited`. Grid's own edits keep it derived.
Change the rooms and write them again, or take `written` out to keep the plan as a hand-written
one.

## The whole grammar

Every line rooms text takes, by topic, each with one example Grid writes with no problem. The tool server serves this section as `grid://guide/rooms` and carries it in the `rooms` argument of `grid_write_rooms`; it is written once, and a test holds the two equal.

### Rooms

room <id> "<name>" <use|-> <width> x <depth> [inside|centre|outside] <where>. Width runs east-west, depth north-south. <where>: at x,y (the first room's south-west corner) or <north|south|east|west> of <room> [align <side|centre>] [shift <m>] [until [near] <room>]. A size may be * to stretch until a room. walls <t> [kind] after the place sets the thickness between this room and other indoor rooms. Use edge wall to set the exposed sides to this thickness. number "<text>", dept <text> and facts <name>=<value> ... give it its room number, its department and facts of the person's own.

```rooms
walls outside 0.3 inside 0.1 height 2.7
room living "Living room" living 5.0 x 4.0 at 0,0
room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living
room hall "Hall" corridor * x 1.2 north of living until kitchen
room office "Office" office 3.0 x 3.0 west of living number "2.03" facts department=Sales capacity=4
```

### Openings

door|window|opening <id> ["<name>"] between <room> and <room> | in <room> <side>, centred | <m> from <side> [of <room>], <w> wide [, sill <m>, height <m>, opens into <room>|in|out, hinged <direction>, a kind: single, double, sliding, pocket, folding, roller, garage, fixed, high-level]. An opening has no leaf. A side faced by several of a room's sides is <side>.<k>, counted from the west, then the south.

```rooms
room living "Living room" living 5.0 x 4.0 at 0,0
room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living
door front in living south, 1.0 from west, 0.9 wide, opens in, hinged east
opening pass between living and kitchen, centred, 1.2 wide
window w1 in kitchen east, centred, 1.4 wide, sill 0.9, height 1.2
window w2 in living south, 0.4 from east, 1.8 wide, sliding
```

### Floors

floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [copy <floor> [with openings]] starts a floor; every room after it is on it. level is the storey number (0, 1, 0.5), elevation the metres from the ground floor's level up to this one, height to its ceiling, slab the floor under it. copy takes another floor's rooms (with openings: its doors and windows too), turned, moved or scaled when it says (see turned floors). through <floor> on a room line stands the room and its walls on every floor up to that one, in the same place: a stair, a lift, a shaft. All floors are written in one rooms text, never one plan per floor.

```rooms
floor ground "Ground floor" level 0 elevation 0 height 2.75
room hall "Hall" corridor 2.0 x 4.0 at 0,0
room stair "Stair" stair 1.2 x 4.0 east of hall through second
room flat "Flat" living 3.3 x 4.0 north of hall align west
door front in hall south, centred, 0.9 wide, opens in
opening o-stair between hall and stair, 0.3 from south, 1.0 wide
door d-flat between hall and flat, centred, 0.9 wide, opens into flat
floor first "First floor" level 1 elevation 3.0 height 2.75 copy ground with openings
floor second "Second floor" level 2 elevation 6.0 height 2.75 copy first with openings
```

### Shapes

room <id> "<name>" <use|-> polygon x,y x,y x,y ... draws a room of any shape from its inside corners, counter-clockwise or not: an L, a room turned at any angle, a corner cut on the slant (a chamfer). Its points are where it is, so no at or of on the line. inside <room> corner <ne|nw|se|sw> [wall <t> [kind]] places a room in a corner of another and cuts it out of it.

```rooms
room hall "Prayer hall" assembly polygon 0,0 12,0 14.5,4.5 4.5,9.3
room lobby "Lobby" corridor polygon 0,-4 12,-4 12,-0.1 0,-0.1
room store "Store" storage 2.0 x 1.5 inside lobby corner sw wall 0.1
door d1 between lobby and hall, centred, 1.8 wide, double
```

### Curves

A curved wall is written raw, as Grid's own JSON: raw wall {"id", "start", "end", "thickness", "kind", "arc": {"centre": [x, y], "sweep": <degrees>}}. The wall turns sweep degrees round the centre from start to end, counter-clockwise positive; its radius is the distance from the centre to start, and end lies on that circle; 360 is a whole circle with start and end one point. It is a true arc, never a polyline. A raw room names curved walls in its boundary as it names straight ones.

```rooms
raw wall {"id": "apse", "start": [4, 0], "end": [-4, 0], "thickness": 0.3, "height": 4, "kind": "exterior", "arc": {"centre": [0, 0], "sweep": 180}}
raw wall {"id": "chord", "start": [-4, 0], "end": [4, 0], "thickness": 0.3, "height": 4, "kind": "exterior"}
raw room {"id": "apse-room", "name": "Apse", "use": "assembly", "boundary": ["apse", "chord"]}
```

### Raw parts

raw wall|room|opening|stair|bay|ramp {...} writes one part as Grid's own JSON, for what rooms lines cannot say: a free-standing wall, a room bounded by walls of its own (boundary: its wall ids in order round it), a room with a hole. A door line may name a raw room (the wall both rooms' boundaries name, or the one facing <side>). Columns, fixtures and structural grids are lists of the plan of their own, never rooms text; stairs, parking bays, ramps and the site have lines of their own (below).

```rooms
raw wall {"id": "s", "start": [0, 0], "end": [4, 0], "thickness": 0.2, "height": 3, "kind": "exterior"}
raw wall {"id": "e", "start": [4, 0], "end": [4, 3], "thickness": 0.2, "height": 3, "kind": "exterior"}
raw wall {"id": "n", "start": [4, 3], "end": [0, 3], "thickness": 0.2, "height": 3, "kind": "exterior"}
raw wall {"id": "w", "start": [0, 3], "end": [0, 0], "thickness": 0.2, "height": 3, "kind": "exterior"}
raw room {"id": "kiosk", "name": "Kiosk", "use": "retail", "boundary": ["s", "e", "n", "w"]}
door d1 in kiosk south, centred, 0.9 wide, opens in
```

### Outdoor

outdoor <garden|courtyard|terrace|balcony|light-well|porch|carport|other> [roofed|unroofed] on a room line makes it outdoor space: a garden, a terrace, a balcony off a room, a courtyard. Its outside edges and the sides it shares with other outdoor rooms are open by default. Set the sides facing no room with edge open, edge railing <h> or edge wall [<h>].

```rooms
room living "Living room" living 5.0 x 4.0 at 0,0
room garden "Garden" - 5.0 x 6.0 south of living outdoor garden unroofed
room terrace "Terrace" - 3.0 x 4.0 east of living outdoor terrace roofed edge railing 1.1
door d-garden between living and garden, centred, 1.8 wide, sliding
door d-terrace between living and terrace, centred, 0.9 wide, opens into terrace
```

### Heights

height <h> on a room line gives that room its own ceiling height; floor <m> sets its floor that far above (or, negative, below) its storey's: a lowered entrance, a raised stage. The walls line's height is every wall's; wall lines (below) give one wall its own.

```rooms
walls outside 0.3 inside 0.1 height 2.6
room genkan "Entrance" corridor 1.5 x 1.8 at 0,0 floor -0.15
room living "Living room" living 4.5 x 3.6 east of genkan height 3.2
room stage "Stage" - 4.5 x 2.4 north of living floor 0.6
door front in genkan south, centred, 0.9 wide, opens out
opening o1 between genkan and living, centred, 0.9 wide
opening proscenium between living and stage, centred, 3.6 wide
```

### Open sides

open [<room>] after a room's place leaves no wall between it and the room it is placed beside (or the room named): one space in two rooms, a kitchen open to a living room, a stage open to its hall. wall between <room> and <room> virtual writes a dividing line with no wall. Use open <north|south|east|west> on a room, unit or unit placement to open that side, including where it faces no room. Use wall <room> <side> virtual to set a single outside edge. An opening line makes a gap of a given width in a wall.

```rooms
room living "Living room" living 5.0 x 4.0 at 0,0
room kitchen "Kitchen" kitchen 3.0 x 4.0 east of living open
room dining "Dining" dining 3.0 x 3.0 north of kitchen
wall between kitchen and dining virtual
```

### Roofs

raw floor {"roof": {...}, "parapet": <m>} sets the floor's own fields rooms lines have no words for, after its floor line: its roof ("shape": flat, mono, gable or hip, "eaves" and "ridge" heights above the floor's level, "ridgeRuns": east-west or north-south, "rooflights"), its parapet height, its "outline", "homes" and "parking". On a copied floor, null takes a copied one off.

```rooms
floor ground "Ground floor" level 0
room house "House" living 8.0 x 6.0 at 0,0
raw floor {"roof": {"shape": "gable", "eaves": 2.7, "ridge": 5.2, "ridgeRuns": "east-west"}}
```

### Repeats

unit <name> [setting=default ...] ... end writes rooms and openings once, $setting in its lines; unit <name> flat "<type>" ["Flat {n}"] makes each placement a flat. place <unit> as <label> <where> [mirror east-west|north-south] [gap <t>] [setting=value ...] places it once; repeat <unit> <n> <east|west|north|south> as <first label> <where> [mirror ...] [first setting=value ...] [last setting=value ...] places it n times in a row. {n} in a name is the label; a label ending in digits counts up (301, 302). <setting>=* fill <length> makes the row that long. Write a row of rooms this way, never line by line or by a script.

```rooms
unit cell w=3.0
  room room "Room {n}" bedroom $w x 4.0
  door door in room north, 0.3 from east, 0.9 wide, opens in
  window win in room south, centred, 1.2 wide
end
repeat cell 4 east as 101 at 0,0
room corridor "Corridor" corridor * x 1.5 north of 101 until 104
repeat cell 4 east as 105 north of corridor mirror north-south
```

### Turned floors

copy <floor> [with openings] [turn <deg> [clockwise]] [about x,y] [move dx,dy] [scale <s>] copies a floor turned (degrees counter-clockwise, or clockwise with the word), about a point (left out, the middle of its rooms), scaled about it (rooms smaller or larger, walls as thick) and then moved; on its own line or at the end of a floor line. repeat floors <n> from <floor> [as <first id>] [with openings] [turn <deg>] [about x,y] [move dx,dy] [scale <s>] [rise <m>] writes n floors after it, each a copy turned, moved and scaled once more than the one below and rise metres higher: a twisting, stepping or tapering tower in one line, never corner points worked out by hand. The ids count up from the floor's digits (f00: f01, f02 ...) or from as. A room written with through stays where it is on every floor. Doors and windows keep their sizes and the sides of their rooms.

```rooms
walls outside 0.3 inside 0.1 height 2.8
floor f00 "Typical floor" level 0 elevation 0 slab 0.2
room east "East flat" living 3.95 x 8 at 0,0
room west "West flat" living 3.95 x 8 east of east
door d1 between east and west, centred, 0.9 wide
window w1 in east south, centred, 1.8 wide
repeat floors 3 from f00 with openings turn 90 rise 3
floor top "Top floor" level 4 elevation 12 slab 0.2 copy f00 with openings turn 90 clockwise about 4,4
```

### Stairs

stair <id> ["<name>"] from <floor|room> to <floor|room> in <room>, <width> wide, straight|L|U, runs <north|south|east|west> [then <side>] [along <side>] [risers <n>] lays the plan's own stair in the room, after the rooms: the drawing's treads and break line, the sections, the 3D model, the IFC export and the way-out check read it. A room after from or to stands for its floor, and with no in the stair goes in that room. runs is the way the walking line goes from the from floor; each end keeps a landing as deep as the stair is wide inside the room. L turns on a square landing in the far corner (then: the way it turns, clockwise when left out); U goes up one side and down the other, a short flight across the well, in a room wider than twice the stair; along puts a straight one against that side. ..., <width> wide, run x,y x,y ... gives the walking line itself. Never draw treads as walls. grid_add_stair and grid_change_stair write the same.

```rooms
floor ground "Ground floor"
room hall "Hall" corridor 2.4 x 5 at 0,0
door front in hall south, centred, 0.9 wide, opens in
floor first "First floor" level 1
room landing "Landing" corridor 2.4 x 5 at 0,0
stair st "Main stair" from ground to first in hall, 1 wide, U, runs north
```

### Items

item <id> ["<label>"] <name> [<w> x <d>] [<h> high] [clear <m>] in <room> against <north|east|south|west> [, at <end> | , <m> from <end> | , full width [<d> deep]] stands a fixture or a piece of furniture with its back on that side's inside face, its turn worked out so it faces into the room: centred on the side, in a corner (at west), that far from one end, or as long as the side (a built-in wardrobe). <name> is a library entry (bath, wc, basin, shower-900, kitchen-run-2400, double-bed, wardrobe, sofa-3, desk; grid_measure what=library lists them) or a kind (toilet, basin, shower, bath, kitchen-run, bed, table, chair, sofa, storage, armchair, stool, desk, rug, plant). item <id> <name> ... at x,y [turn <degrees>] [on <floor>] places one by its middle. raw item {...} takes Grid's own JSON for one. An item against a wall moves with it. grid_add_item, grid_move_item and grid_remove_item write the same.

```rooms
room bath "Bathroom" bathroom 2.4 x 2 at 0,0
room bed "Bedroom" bedroom 3.5 x 4 east of bath
door d1 between bath and bed, centred, 0.8 wide
item tub "Bath 1700" bath 1.7 x 0.7 in bath against north, at west
item wc1 wc in bath against east, 0.1 from south
item robe "Built-in wardrobe" wardrobe in bed against east, full width
item bed1 double-bed in bed against north, at west
```

### Parking

After the rooms, the plan's own parking bays and ramps, which the drawing, the bay counts, the takeoff and the slope check read; never draw a bay or a ramp as a room. bays <group> in <room> fill, <width> x <length> [aisle <m>] [rows east-west|north-south] [from <side>] [count <n>] [numbered <first>] fills the room with rows of bays and the aisles between them (a row, an aisle, two rows back to back, an aisle; aisles 6 m, Grid's own, when left out); bays <group> in <room> along <side>, <width> x <length> [count <n>] [offset <m>] [inset <m>] [from <end>] is one row against that side; bays <group> at x,y, <w> x <l>, count <n>, runs <side> [pitch <m>] [turn <deg>] a row by its first bay's middle; bay <id> at x,y, <w> x <l> [turn <deg>] [number <n>] [on <floor>] one bay. car, small, accessible or motorcycle in place of the size is Grid's own starting size, not a code's. A row's bays are <group>-1, <group>-2 and on; numbered B1-01 numbers them on. ramp <id> ["<name>"] from <floor|room> to <floor|room> [in <room>], <width> wide, straight, runs <side> [along <side>] lays a ramp face to face of its room; ..., helix [at x,y] [radius <m>] [turns <n>] [starts <side>] [clockwise] turns it round a circle; ..., run x,y x,y ... gives its middle line; slope <%> is the slope the design means. The answer gives each ramp's rise, length and slope. raw bay {...} and raw ramp {...} take Grid's own JSON. grid_place_bays and grid_add_ramp write the same.

```rooms
floor b1 "Basement" level -1 height 3
room deck "Deck" parking 30 x 20 at 0,0
room spiral "Ramp" parking 12 x 12 east of deck
opening o-b1 between deck and spiral, centred, 6 wide
floor g "Ground" level 0 height 3
room deck "Deck" parking 30 x 20 at 0,0
room spiral "Ramp" parking 12 x 12 east of deck
opening o-g between deck and spiral, centred, 6 wide
door way-in in deck south, centred, 1 wide, opens out
bays b1 in deck fill, 2.5 x 5, aisle 6, numbered B1-01, on b1
ramp h "Helix" from b1 to g in spiral, 3.5 wide, helix, turns 1
```

### Site

plot <width> x <depth> [at x,y] (its south-west corner; centred on the building when left out) or site boundary x,y x,y x,y ... writes the plot; street <north|south|east|west|edge n> names the edges on a street, by the side of the drawing they face; setback <all|street|side|edge n> <m> [assumed] the person's own set-backs; north <degrees> (counter-clockwise from up the drawing, or <degrees> clockwise) or north <up|left|up-right|...> where the arrow points. site origin x,y, site location <latitude>,<longitude>, site elevation <m> and site country <name> say where it is. ground <m> (or ground <m> below|above) is the ground outside, in metres from the ground floor's floor level, the level the sections, the 3D ground and the below-ground check read: ground -0.15 for a floor 15 cm above the ground. site <kind> [<id>] <at x,y | points> [width <m>] [canopy <m>] [height <m>] ["<label>"] is one of the site's things, drawn only, its kind one grid_change_site lists: a tree, paving, a pool, a fence, a gate, or a walk, drive or jetty with its width, never a room. grid_set_site and grid_change_site write the same.

```rooms
room house "House" living 8.0 x 9.0 at 0,0
door front in house south, centred, 0.9 wide, opens in
plot 15 x 30 at -3.5,-10
street south
setback street 5
setback all 2
north 30 clockwise
ground -0.15
site tree oak at 9,15 canopy 5 "Old oak"
site pool pool 0,12 3,12 3,18 0,18
```

### Fit-out

base <base plan> names the plan this one is fitted out in, as the project knows it (base shell.json; in quotes when the name holds a space): the shell, whose walls, doors and windows are read in as existing, drawn, measured and checked with the fit-out, and never written into it. Write the rooms by their inside faces as always: a wall Grid works out whose room faces lie on a base wall's faces is the base's, and the room names it by the base's id. Put a room's face on the base wall's face (a 0.3 m wall on x = 0 has its faces at -0.15 and 0.15) to rest it there; a face a little off one is said, with how far. A door or window in a base wall is refused, as the shell is read-only: its doors and windows are the base's. grid_start_fit_out starts a fit-out with the base's rooms as its own.

```rooms
base shell.json
walls outside 0.2 inside 0.1
room front "Reception" office 5.8 x 7.7 at 0.15,0.15
room back "Treatment" office 5.8 x 7.7 east of front
door d1 between front and back, centred, 0.9 wide, opens into back
```

### Other lines

One statement a line, # starts a comment. A plain number is metres; a length may carry its unit in one word (360cm, 12ft6in). plan "<name>"; building <kind>; display <m|cm|mm|ft-in> [...]; walls outside <t> inside <t> [kind] height <h> (before the rooms of its floor); walltype <t> <kind>; sizes inside|centre|outside; doors height <h>; windows sill <s> height <h>; wall between <room> and <room> [<side>] [<t>] [kind|virtual|railing] [height <h>] [id <id>]; wall <room> <side> [<t>] [kind|virtual|railing] [height <h>]; rename <room> <new id> "<name>" [use]; remove <id>; copy <floor> [with openings] [turn <deg>] [about x,y] [move dx,dy] [scale <s>]; repeat floors <n> from <floor> [...] [rise <m>].

```rooms
plan "Corner shop"
building shop
walls outside 0.3 inside 0.1 height 3.0
doors height 2.2
wall between shop and store 0.2
room shop "Shop" retail 6.0 x 5.0 at 0,0
room store "Store" storage 2.0 x 5.0 east of shop
door front in shop south, centred, 1.2 wide, opens in
door d1 between shop and store, 0.5 from north, 0.9 wide, opens into store
```

