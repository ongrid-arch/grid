# WRT-52: a dividing line takes no wall's width, so opened bays keep their module

## Outcome

- WRT-41 already places two rooms opened by a `virtual` line against each other, and a row of
  one-room bays repeated beside each other or beside a corridor. What was left: a room or a unit
  placed beside a unit of several rooms, where only some of them are opened to it, still kept a
  wall's width between the two, so the opened rooms grew by it and the bays drifted off their
  module. Now the gap is worked out for the rooms that will face each other across it, two by
  two, and a dividing line between two of them takes none.
- A room placed beside a unit (a corridor south of a bay whose lab is opened to it, an open lab
  east of a bay of a lab and its write-up room) goes against the room it is opened to, and keeps
  the size written for it, with no `rooms/area-differs`.
- Rooms sized to centre lines (`sizes centre`) or outside faces keep their module across bays
  whose labs are opened to each other while their write-up rooms have walls between them: a bay
  written 3.3 m wide measures 3.3 m between its centre lines, every one of them, repeats
  included, with the dividing lines and the walls on the same 3.3 m lines. A lab between two
  dividing lines is 3.3 m inside, a write-up room between two walls 3.15 m.
- Sized to inside faces, the same bays cannot both keep their sizes: the write-up rooms need the
  wall between them and the labs beside them do not. That stays as it is: the wall keeps its
  width, the dividing line lies in its middle and the answer says the labs came out larger.

## Design

- `packages/floorplan/src/rooms/compile.ts`, dividing lines and placement beside a room or unit
  only:
  - Each room keeps what its size took off each side for the walls round it (`off`, zero for a
    room sized to its inside faces).
  - `gapAcross`: for what is placed (one room, or a unit's rooms) and what it is placed beside,
    the rooms on each side that face the other (no room of their own in front of them) and whose
    extents overlap along the gap, two by two. Each two need the wall between them
    (`gapBetween`: none for a dividing line or `open`, else the wall a line states or their
    walls), less how far each stands back from its side's face. The gap is the most any two
    need, and never below none. When no two face each other the rule before stays (WRT-41's
    every-facing-room-opened, then the walls' thickness).
  - Lining up (`align`) a room or unit sized to centre lines or outside faces, placed beside one
    sized the same way, lines up the sizes as written, not the inside faces, so a write-up room
    north of a lab with a dividing line to its east stands back half the wall on that side.
  - Two such rooms whose sizes as written line up give no `rooms/out-of-line` note for the
    half wall each took off (the write-up room's face stands back from the lab's dividing line).
  - A `gap` written on a place line still wins. Rooms placed by their corner or as polygons are
    not moved.
- Decision: the gap is worked out pair by pair rather than from every room of a unit, since a
  unit's rooms that do not face what it is placed beside have no wall with it. A wall stated by
  a `wall between` line for one such two now counts for the unit too.
- No new code, no new tolerance, no new convention, no new sentence.

## Done

- `packages/floorplan/src/rooms/__tests__/dividingModule.test.ts`, failing before the change:
  - an open lab placed beside a bay of a lab and a write-up room, opened to the lab only, keeps
    its size and the lab its size, with no `rooms/area-differs`;
  - a corridor placed south of a row of such bays, opened to each lab, keeps every lab's size;
  - centre-sized bays of a lab and a write-up room, repeated, with the labs opened to each other:
    every dividing line and wall on a 3.3 m line, a middle lab 3.3 m inside, a middle write-up
    room 3.15 m, no problem;
  - the same bays sized to inside faces still say the labs came out larger.
- `npx vitest run packages/floorplan --maxWorkers=2 --minWorkers=1`, `npm run typecheck`,
  `npm run lint`, `packages/cli/src/__tests__/ownWords.test.ts`, the tolerances test and
  `npm run scoreboard`.
