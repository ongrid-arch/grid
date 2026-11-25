# WRT-41: a room keeps its written size when a side of it is opened

## Outcome

- Two rooms written rooms first and opened to each other by a `wall between <a> and <b> virtual`
  line keep the inside sizes the text gives them, wherever that line is written: before the
  rooms, as already worked, or after them, as people usually write it. A room placed beside the
  other (`east of`, `north of` and the like) is placed against it, with no wall's width between
  them, exactly as `open` on its room line places it. So `open` and `virtual` give the same plan.
- The same holds for a unit, or a row of units (`place`, `repeat`), placed beside a room it is
  opened to: when every room of the unit on the side it is placed against is opened to the room
  it is placed beside, the unit is placed against it.
- Lines inside a unit that open two of its own rooms to each other do the same within the unit.
- So the size `grid write` reports for such a room is the size the file holds, and every later
  reading (`grid_areas`, `grid describe`, the drawing, the sheet) gives the same figure. The
  writer gives no `rooms/area-differs` note for it.
- Rooms placed by their corner (`at x,y`) or as polygons stay where the text puts them: a
  dividing line written into the gap between two such rooms still lies in the middle of it, and
  the writer still says, with `rooms/area-differs`, that the rooms come out larger than written.

## Design

- `packages/floorplan/src/rooms/compile.ts`:
  - Each floor's draft gets `ahead`: the pairs of rooms its own lines open by a `virtual` wall
    line, read once when the floor starts (its `floor` line, or the first line for the floor no
    line names), up to the next `floor` line. Unit bodies and raw lines are passed over; a line
    that cannot be read is left for its own turn, which says what is wrong with it.
  - `gapBetween` leaves no gap between two rooms of such a pair, as it does for `open` and for a
    `virtual` line written before the rooms.
  - `placeUnit` reads the unit's own lines for such pairs before placing its rooms, and places
    the unit against the room it is placed beside, with no gap, when every room on the unit's
    facing side is in such a pair (or `open`) with one of the rooms it is placed beside. A `gap`
    written on the place line still wins.
  - Nothing else changes: the dividing line is worked out as before, and with the rooms now
    touching it lies on their shared face.
- Decision: the rooms move rather than the line. A dividing line has no thickness (the plan
  file reads a virtual wall as a line), so with a wall's width between two rooms one of them
  must grow unless the two touch. Moving the room placed beside the other is what `open`
  already does, and it keeps every room's written size; the cost is that the rooms placed
  after it move by that width too, as they would with `open`.
- Decision: rooms placed by their corner or as polygons are not moved, since the text gives
  their places outright. Their note stays as it is.
- No new code, no new tolerance, no new convention; `layout.ts` needs no change (it writes no
  dividing lines).

## Done

- `packages/floorplan/src/rooms/__tests__/openSides.test.ts`, failing before the change:
  - two rooms with the dividing line written after them each keep 22.50 m² as Grid measures
    them, with no `rooms/area-differs`, and the plan is the same as with `open` on the line;
  - a row of bays repeated north of a corridor and opened to it by lines written after keeps
    each bay's size;
  - a unit whose own two rooms are opened by a line inside it keeps both sizes;
  - a stair opened to a landing in feet and inches keeps its 42 sq ft;
  - rooms placed `at` with a gap still say `rooms/area-differs`.
- `npx vitest run packages/floorplan --maxWorkers=2 --minWorkers=1`, `npm run typecheck`,
  `npm run lint`, `packages/cli/src/__tests__/ownWords.test.ts`, the tolerances test and
  `npm run scoreboard`.
