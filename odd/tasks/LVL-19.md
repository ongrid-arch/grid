# LVL-19: a stair or lift written through to the roof reaches the roof terrace

## Outcome

A stair or a lift written once in rooms text with `through <floor>` stands on every floor up to
that floor, the roof floor with its terrace too, and the check joins those floors to the ground
floor by it: no floor it reaches is said to be joined to the ground by no stair, and the terrace on
the roof is looked at by the route checks.

What was missing is the way in. A stair's door is written to a room that does not rise with it,
the ground floor's corridor, so the door stayed on the ground floor, and on the roof the stair or
the lift stood with no door at all: the terrace was said to have no door, or the lift was. Now, on
a floor where a rising stair or lift has no door of its own, Grid carries the doors it has on the
floor it is written on up to that floor, in the same place, when the same stretch of its wall
there is shared with a room of that floor (the terrace). The write answer says which doors were
carried and to which rooms, and a floor that writes its own door keeps it and gets none carried.

## Design

- `packages/floorplan/src/rooms/compile.ts`: after every floor's walls, rooms and openings are
  worked out (`emit`), a new step, `carryShaftDoors`. For each floor and each group of rooms that
  rose to it (rooms joined by openings among themselves, a stair and the lift beside it), when one
  of them is a stair or a lift and no opening of the group leads out of it on that floor (to a room
  of the floor's own or to the outside), each door or opening (never a window) of the group's
  stairs and lifts on the floor they are written on that leads to a room that does not rise is
  carried up: the same span of the line it lies on, in that room's wall on this floor, when that
  wall is shared with a room of this floor (not a rising room). Its id takes the floor's id in
  front, as any id written on several floors does; its width, height, sill, kind and what it opens
  into come with it, its side and hinge turned when the wall there runs the other way.
- Only stairs and lifts: they are what joins the floors, and they must be entered on every floor
  they serve. A riser or a shaft that rises is not entered on every floor, so it gets none.
- A floor that writes any door into the group keeps what it writes and gets nothing carried, so
  floors that write their own stair door (a corridor on every floor) are as before.
- A door that finds no room of the floor at its place (the stair's wall there faces the outside
  or another rising room) is not carried; nothing is guessed.
- The write answer warns `rooms/door-carried`, once, naming each carried door with its floor and
  the room it now leads to, and how to write the floor's own door instead. Its words are in
  `messages/en.ts` and `messages/es.ts`.
- The plan file holds the carried door written out, as with every other carried part, so the
  read back writes it as the floor's own door line and the reading writes the same plan again.
- No new convention, no new message code in the record: `rooms/door-carried` is a write warning.

## Done

- `packages/floorplan/src/rooms/__tests__/throughRoof.test.ts`: a block whose stair and lift are
  written once through to a roof terrace floor: the stair's door is carried to the terrace, the
  lift's door through the stair is carried with them, the warning names them, the check says no
  floor is unjoined and no room lacks a door; a floor writing its own stair door gets none; a door
  whose place faces the outside on the roof is not carried; the reading back writes the same plan.
- The rooms fixtures (`buildings.test.ts`) and the floor-copy tests keep their plans.
- `tsc --noEmit -p packages/floorplan`, lint, `npx vitest run packages/floorplan`,
  `ownWords.test.ts` and `tolerances.test.ts`.
