# ARE-81: travel from a point, and from a room's or a floor's farthest point

## Outcome

An agent asked "how far is it from here to the nearest way out" or "what is the longest walk to
a stair on this floor" gets a walked length from Grid, never a straight line it worked out itself:

- `grid_measure what=route` with `x` and `y` and no room starts from that point: Grid finds the
  room the point stands in (on `floor`, when more than one floor has a room under it) and walks
  the route from there, to `outside` or to a room, on one floor or across floors.
- `start: "farthest point"` starts from the point of the room's floor that is the longest walk
  from where the route ends, by its nearest way: for `to: "outside"` the point whose nearest way
  out is the farthest of all, not the corner farthest from the door the middle happens to take.
- `start: "farthest point"` with no room and no point measures every room of a floor (the only
  floor, or `floor`): each room's farthest point and its walked length, longest first, and the
  whole route from the floor's farthest point.

## Design

- `packages/cli/src/quantities/measure.ts`: `everyWay(survey, from, to, ends)` gives every way
  `routeBetween` weighs (each way out to `outside`, each stair or lift off the floor to a room on
  another floor, the one way on the same floor), best first; `routeBetween` picks from it, so its
  answers do not change. `roomAtPoint(survey, point, floor)` finds the room a point stands in (a
  zone gives its room).
- `packages/cli/src/quantities/farthest.ts` (new): `farthestPoint(survey, room, to)` walks each way
  from the door it leaves the room by once, then for every corner of the room's outline and holes
  and points along its sides (every `farthestPointStep`), takes the shortest of
  "across the room to that way's door, plus the rest of that way" and keeps the point where it is
  longest. The route from that point is then walked in full through `routeBetween` with the point
  as its start, so the answer reads as every other route. `farthestOnFloor` does it per room.
  The farthest point is sought on the room's outline: the rule says so.
- `walked.ts`: `WalkPoint.at` gains `farthest point`; `StartAt` takes it through `routeBetween`.
- Tolerance `farthestPointStep` (0.25 m) in `geometry/tolerances.ts` and `docs/tolerances.md`.
- `packages/cli/src/mcp/readTools.ts`: `start` enum gains `farthest point`; `floor` is taken by
  route; route no longer needs a room when a point or `farthest point` is given. New sentences in
  `packages/floorplan/src/messages/en.ts` (and `es.ts`).
- Decisions: `farthest corner` stays as it was (an agent may rely on it). Rooms measured on a
  floor leave out outdoor spaces, zones (their room is measured) and the route's own end room.
  A floor's rooms that no way reaches are listed as not reached.

## Done

- `packages/cli/src/quantities/__tests__/farthest.test.ts`: a room with two doors out, where the
  farthest point by nearest exit differs from the farthest corner; a point given with no room;
  a floor's farthest room first; a route across floors from a point upstairs.
- A grid_measure call for each new form, and refusals: a point on no room's floor, a point on two
  floors without `floor`.
- build, typecheck, lint, vitest on `packages/cli/src/quantities`, `packages/cli/src/__tests__`,
  `packages/cli/src/mcp`, `packages/cli/src/command`, `packages/floorplan/src/__tests__` and the
  tolerances test, `npm run scoreboard`.
