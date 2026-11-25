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
    the end's direction), and along the meeting wall the larger of `roomsWallWidest` and half
    the wall's own thickness. No new tolerance: both figures come from the walls themselves.
  - When the end stands in a solid wall's body and on a dividing line both, it ends in the
    solid wall: a dividing line bounds two rooms and is not what an outside wall turns into.
  - `covered`, which decides whether two stretches on one line are one wall seen across the end
    of a crossing wall, reaches a crossing wall as far as half the line's own thickness too, so
    a thick outside wall along a row of rooms stays one wall.
- `joints.ts` and the space check are left as they are: once the walls meet at their centre
  lines, the corner fill the check already makes closes the corner.
- Decisions: the dividing line loses to a solid wall only where both hold the end; elsewhere
  the nearer one is kept, as before.

## Done

- `packages/floorplan/src/rooms/__tests__/thickCorners.test.ts`: rooms text with 1.8 m outside
  walls and a 3 m west front, an aisle open to a transept, and a row of rooms along the thick
  front: no `room/space-mismatch` and no wall fault from `validatePlan`, each wall end on the
  centre line of the wall it meets, the front one wall. It fails before the change.
- The rooms tests and the lab's eight buildings (`buildings.test.ts`) unchanged.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the own-words and
  tolerance tests, `npm run scoreboard` not worse.
