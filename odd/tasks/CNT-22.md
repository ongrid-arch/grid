# CNT-22: curved walls no longer break the gross internal area or the room edits

## Outcome

- A floor with curved outside walls (a rounded-square tower plate, a building with round corners)
  gets its gross internal area, as a floor of straight walls does. Before, the cut of the outer
  walls from the floor was made of one strip per straight piece of each curve, with a corner made
  good between every two pieces: dozens of slivers that the polygon library could not order, so
  about one plate in five had no gross internal area, and a building with one such floor had
  none at all.
- When the cut still cannot be made, the reason given is in Grid's own words. No answer, note or
  sheet cover prints a polygon library's error message.
- An edit that does not touch a curved wall works on a plan that has one. Merging two rooms that
  share a straight wall works when either room, or a room nearby, has a curved wall, and the
  curved wall is left as it was. Before, the merge was refused for a curved wall anywhere round
  either room, and threw a programming error ("has no straight axis") for one elsewhere on the
  floor. The openings an edit seats again skip a curved wall the edit does not change. An edit that
  would cut or move a curved wall is still refused, in words.

## Design

- `packages/floorplan/src/geometry/areas.ts`, the wall-face code only:
  - A curved wall's body, and each outer stretch of it, is one band that follows the curve
    (`wallSlicePolygon`, the stations `arc.ts` already gives), not a strip per piece. A whole
    circle is two half bands, since one ring cannot go round and back. A straight wall is a strip,
    as before.
  - The corners made good (`cornerFills`) are worked out between walls, not between the pieces of
    one curve: a curved wall gives one short run at each end, along its tangent there, so it is
    made good to the wall it meets as before, and no patch lies between two pieces of itself.
  - `insideFace`'s reason when every grid fails no longer carries the library's message.
  - Decision: no change to `polygons.ts` (shared with other checks) or to `spaces.ts`; the bands are
    built in `areas.ts` from what `wall.ts` already gives.
- `packages/cli/src/edit/`:
  - `merge.ts`: refused only when the wall the merge cuts is curved (`refuseCurved` on the shared
    wall). `ccwBoundary` and `cutAt` read a curved wall by its points (`wallPointAt`, its ends), never
    its axis: the curved wall the outline passes is placed by the middle of the room's side on it,
    and one that ends on the cut wall is cut at its end.
  - `seat.ts`: an opening on a curved wall the edit does not change keeps its offset; one on a curved
    wall the edit changes is refused in words (`refuseCurved`). Lengths are `wallLength`.
- `packages/cli/src/mcp/__tests__/curvedWalls.test.ts`: the merge of the living room (with its bay)
  and the kitchen now works and keeps the bay; the move of the bay is still refused.
- No new message code, no new convention, no new sentence: the reason for a failed cut keeps its
  place in the count of English sentences.

## Done

- `packages/floorplan/src/geometry/__tests__/curvedAreas.test.ts`: a 32 m rounded-square plate with
  corner radii from 2 m to 8 m, turned and moved off the origin, gives a gross internal area on
  every one, within 0.5% of the area worked out by hand; forty floors of it give the building's
  total; a reason for a failed cut names no library.
- `packages/cli/src/edit/__tests__/curvedEdits.test.ts`: merging two rooms that share a straight
  wall on a floor with a curved hall wall works and leaves the curved wall as it was; a merge with a
  curved wall round one of the rooms works; a merge that would cut a curved wall is refused in
  words; seating openings beside a curved wall with a room-anchored window on it does not throw.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, the own-words and contract
  tests, and `npm run scoreboard` no worse than `scoreboard/current.json`.
