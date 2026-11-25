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
  words, accents and all. A plan whose file already holds such ids reads back with plain ones in
  their place (CMD-24): the read-back names each in a comment, and writing it back gives the plan
  those ids. Every tool and option reads an id by this one rule (`readPlainId`).
- In a text read in feet (`display ft-in`, or `numbers ft`), `12-6` is refused as `rooms/units`:
  it reads as 12 minus 6. Write `12'6"` or `12ft6in` for twelve feet six inches, or `(12-6)` in
  brackets for the difference. A sum such as `3.0+0.3` is read as before.
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
- A floor line starts each storey (WRT-14):
  `floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]`.
  The name is in quotes, or left out and the id names the floor (`floor ground`). `level` is the
  storey number, 0 the ground floor, 1 the one above, -1 a basement, 0.5 a half level; it is
  never a height. `elevation` is the metres from the ground floor's level up to this floor's,
  `height` from this floor to its ceiling (its walls take it), `slab` the floor it stands on. A
  floor with no elevation stands on the one below, at that floor's elevation and height plus its
  own slab, so a floor-to-floor figure is each floor's `elevation`, not its `height`. Settings
  written `elevation=0` or `level: 1` are read as `elevation 0` and `level 1`; an unquoted name,
  `level 2.85` or `level -9ft` is refused, and every refusal shows the whole line.

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
- `outdoor terrace` on a room line marks it as outdoor space (CNT-7), one of `garden`,
  `courtyard`, `terrace`, `balcony`, `light-well`, `porch`, `carport` or `other`, and `roofed` or
  `unroofed` after it says whether a roof covers it; unstated, a porch and a carport are roofed.
  Its walls are written as any room's are, so give its open sides with `open` or a `virtual` wall
  ([outdoor space](plan-file.md#outdoor-space-roofed-or-open)). The wall between it and a room is
  an outside wall: `exterior`, and a room placed beside it (or it beside a room, a unit's rooms
  or a room's corner) is set off by the outside thickness, unless a `wall between` line or the
  building room's own `walls` says otherwise (LVL-12). The outdoor space's own `walls` never
  thins the building's wall: they are its edges, a railing or a fence. A window onto it is in an
  outside wall. Rooms placed by hand that leave another gap there are said once
  (`rooms/wall-from-gap`), with the `wall between` line that keeps it (WRT-31).
- `*` stretches a side as far as the room named after `until`. `inside <room> corner ne` cuts a
  room out of another's corner. `unit`, `place`, `repeat` and `mirror` write a group of rooms
  once; `copy <floor>` starts a floor from another, and `through <floor>` stands a room on the
  floors above its own ([many of one room](#many-of-one-room-floors-copied-and-walls-through-floors)).
- Rooms that overlap, that touch with no wall between them (unless one is `open` to the other),
  or that leave a gap that is neither a wall nor a room are refused in plain words naming both
  rooms. Every refusal has a code, such as `rooms/overlap`.
- `open` on a room line and `wall between <a> and <b> virtual` anywhere on the floor (or in the
  unit) say the same thing: a room placed beside the other is placed against it, with a dividing
  line on their shared face, so both keep the size written for them (WRT-41). A unit placed
  beside a room goes against it when every room on its facing side is opened to that room. Rooms
  placed by their corner (`at x,y`) or as polygons stay where they are written: a dividing line
  in a gap between them lies in its middle, and the answer says the rooms came out larger
  (`rooms/area-differs`).
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
  thickness (`rooms/wall-from-gap`), and any other note (`rooms/check`). A part written `raw` is
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
  floor.
- The answer counts and measures every part written, raw or not: the floors that hold a part,
  every room with its inside area by Grid's own measure (a raw room too, marked "written raw"),
  and the area in all. When parts were written raw, a line says how many walls, rooms and
  openings were, kept as written; the walls "worked out" and the openings "placed" are the ones
  Grid worked out.
- A room's name and its id go into every export and sheet, and travel with the plan file: name
  a room for what it is, never for a person. Who sits where is kept in a file of its own
  ([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).
- The full language is in the header of `packages/floorplan/src/rooms/compile.ts`. The
  [guide for agents](agent-guide.md) has it in short, with what agents ask first, and
  [samples/](samples/) three whole plans written this way.

## Many of one room, floors copied, and walls through floors

A room type written once can be placed many times (WRT-4). `unit` writes it, with settings that
each placement may change; `repeat` places it in a row, the first where the line says and each
next one on the given side of the one before; `first` and `last` settings hold for the two ends
only, such as end rooms a wall's width narrower. `mirror north-south` turns the row to face the
other way. The lab's hotel floor, twelve rooms and a corridor that the hand-drawn file holds in
103 parts, is 17 lines (`packages/floorplan/fixtures/rooms/hotel.rooms`):

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

A numeric first label counts up (301, 302, … 306) and any other takes a number after it (A1,
A2, …). Each part's id is its name in the unit and the placement's label, `room-301`,
`door-306`, so the same text writes the same ids every time, and a row that grows by one keeps
the ids it had.

- `floor l4 "Fourth floor" level 4 copy l3 with openings` starts a floor as a copy of another,
  on its own line, as `copy l3` does on the line after. The copy takes the floor's outline, roof,
  parapet, homes and parking too; a `raw floor` line on the copy sets any of them for that floor
  alone, and `null` takes one off it (`raw floor {"roof": null}`). Without `with openings` it
  takes none of the doors and windows, and the answer warns (`rooms/copy-no-openings`) when
  copies are left with none.
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

The plan file holds every room, wall and opening written out, floor by floor, with the ids the
text gave them: a repeat, a copy or a room through several floors leaves nothing in the file for
another program to work out.

A unit can be a flat type (CNT-4): `unit one flat "One bedroom" "Flat {n}"`, the type's name and,
if given, the flat's name with `{n}` for the label. Every placement of it, by `place` or `repeat`,
is a flat of that type in the plan's [flats](plan-file.md#flats-and-flat-types), with the label as
its id, the rooms placed as its rooms, and `mirrored` when it is placed mirrored one way. The
lab's four-flat floor places two flat types twice each, one of each mirrored
(`packages/floorplan/fixtures/rooms/four-flats.rooms`):

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
floor stay rooms text. The walls line's height is one the walls state themselves (WRT-40): a wall
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
