# WRT-39: thick outside walls meet at their corners when written rooms first

## Outcome

- A plan written as rooms text whose outside walls are thick (masonry of 1.5 m, a 3 m west
  front) gets walls that meet at every corner, as thin walls do: each end reaches the centre
  line of the wall it meets, however thick that wall is. No room's outline runs onto a wall
  it does not list, so `grid check` gives no `room/space-mismatch` the writer made.
- Where two rooms are open to each other and the outside turns a corner at the end of the open
  line (an aisle open to a transept), the two outside walls meet each other at their centre
  lines, as at any corner, and the corner is made good. Neither stops on the open line and pokes
  into the room on its other side.
- A run of rooms along a thick outside wall gets one outside wall along them, with the walls
  between the rooms reaching its centre line, as with thin walls.
- Plans with walls up to 0.6 m thick are written as before.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `buildWalls`:
  - The search for the wall an end meets took only walls whose centre line lies within
    `roomsWallWidest` (0.6 m) of the end. An end at a room's corner lies half the meeting
    wall's thickness from its centre line, so walls thicker than 1.2 m never met. The reach is
    now the larger of `roomsWallWidest` and half the meeting wall's thickness (measured along
    the end's direction) plus `gap`, and along the meeting wall the larger of `roomsWallWidest`
    and half the wall's own thickness plus `gap`. Only for walls at a real angle
    (`nearlyParallel`) and never further than a joined corner may reach (`mitreReach` half
    thicknesses): a wall nearly in line would otherwise be met kilometres away. No new
    tolerance.
  - A wall "holds" the end (WRT-17) when the end stands in its body within `gap`, not a
    millionth of a metre: a corner written to the millimetre (a polygon room) still holds it.
  - When the end stands in a solid wall's body and on a dividing line both, it ends in the
    solid wall: a dividing line bounds two rooms and is not what an outside wall turns into.
  - Of two walls about as near (within `gap`), a wall of one of the end's own rooms: where a
    room stands over another room's wall, its own walls still close its own corner. Otherwise the
    nearer one is kept, as before, so thin-walled plans read back as they were.
  - `covered`, which decides whether two stretches on one line are one wall seen across the end
    of a crossing wall, reaches a crossing wall as far as half the line's own thickness too, so
    a thick outside wall along a row of rooms stays one wall.
- `packages/floorplan/src/geometry/wallFaults.ts` (outside the card's area, kept small): at the
  open inside corner the two outside walls now meet at their centre lines, and the dividing line
  stops at the rooms' corner (ARE-28), so the room's straight side has a stretch between the
  line's end and the wall's end. The `gap` fault named it, with a fix that would bring the
  mismatch back. A gap that the body of a wall across the side closes, where one of the side's
  pieces ends in that wall, is no longer a gap (`cornerCovers`). The writer cannot avoid it:
  any wall that ends on the open line is lengthened by `gap` in the space check and runs into
  the room beyond, and running the line on into the wall would undo ARE-28.
- `joints.ts` and the space check are left as they are: once the walls meet at their centre
  lines, the corner fill the check already makes closes the corner.
- `docs/rooms-first.md` and the `wall/gap` row in `docs/plan-file.md` say so.

## Done

- `packages/floorplan/src/rooms/__tests__/thickCorners.test.ts`: rooms text with 1.8 m outside
  walls and a 3 m west front, an aisle open to a transept, and a row of rooms along the thick
  front: no `room/space-mismatch` and no wall fault from `validatePlan`, each wall end on the
  centre line of the wall it meets, the front one wall. It fails before the change.
- The rooms tests, the lab's eight buildings (`buildings.test.ts`) and the school read back
  (`rooms.test.ts`) unchanged; the wall-fault tests still find real gaps.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the own-words and
  tolerance tests, `npm run scoreboard` not worse.
