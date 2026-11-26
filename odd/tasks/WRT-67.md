# WRT-67: say the floor a wall from a gap takes, and how to close it

## Outcome

When rooms text leaves a gap between two rooms and Grid makes it a wall thicker than the walls
line's inside walls, the write's answer warns for each such wall (`rooms/wall-from-gap`, once a
pair of rooms), with:

- how much thicker it is than the inside walls and the floor that is wall instead of room
  (`0.40 m thicker ... 1.72 m² of floor is in it`);
- the fix as a line would write it: the size of either room that closes the gap to an inside
  wall (`'2.3 x 4.3' for 'hall'`), or, for a room with no plain size, how far to move it.

A wall between two indoor rooms that happens to be as thick as the outside walls is no longer
silent: the outside thickness is the outside walls', and only a thickness a line states for an
inside wall (a `walls` word on a room, a `wall between` line, a `walltype`, a unit's `gap`)
keeps an inside wall quiet. A wall between a room and outdoor space keeps its own wording
(WRT-31).

## Design

- `packages/floorplan/src/rooms/compile.ts`, where WRT-17 says a wall from a gap:
  - for a pair with no outdoor side, the thicknesses that count as stated leave out the walls
    line's outside thickness;
  - the warning gets `{floor}` (only when the wall is thicker than the wall the rooms would be
    set apart by, `gapBetween`) and `{fix}`; the wall's length is what the two rooms share on
    that floor, summed over every stretch, so an L-shaped room's two stretches count once each;
  - the sizes that close the gap come from the same reckoning as WRT-55's `rooms/gap` refusal
    (a room written `w x d` grows by the difference toward the other), shared in one helper.
- `packages/floorplan/src/messages/en.ts` (and the draft `es.ts`): the wording, with the new
  placeholders. No new code: `rooms/wall-from-gap` is the rooms writer's own warning.
- Decisions: the area is the extra thickness times the length shared, figured to two decimals,
  not a measure of the plan's areas (ARE-9 measures those); a gap thinner than the inside walls
  keeps "move a room" with no area, since no floor is lost.

## Done

- `packages/floorplan/src/rooms/__tests__/wallFromGap.test.ts`: a 0.5 m gap with inside walls
  0.1 warns with 0.40 m, the area and the closing sizes; a wall between two indoor rooms at the
  outside thickness warns; a stated `walls 0.3` keeps it quiet; a room by polygon gets the move
  fix; the warning comes once a pair.
- The rooms tests (`packages/floorplan/src/rooms/__tests__/`), the type check of
  `packages/floorplan`, lint, `ownWords.test.ts` and `tolerances.test.ts`.
