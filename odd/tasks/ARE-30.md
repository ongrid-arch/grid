# ARE-30: a route ends at the door of the stair or exit room it reaches

## Outcome

- A route to a stair room (or a lift) ends at the doorway into it, on the stair room's own side of the
  wall, not at the middle of the widest circle the room holds. Two identical stairs are walked to
  the same length from the same door.
- A route's start and end are stated: each is the middle of the room, the room's door, the room's
  farthest corner, or a point the person gives. The answer of `grid_measure what=route` carries both
  points as coordinates (`startPoint`, `endPoint`, with `startAt`, `endAt` saying which kind).
- A route to `outside` ends at the outside face of the door out, as before, and says so.

## Design

- `packages/cli/src/quantities/walked.ts`: `walkRoute` takes `ends` (`start`: `middle` | `door` |
  `farthest corner` | a point; `end`: `middle` | `door`). `Walked` gains `start` and `end` points
  and their kinds. Default start is the middle; default end is `door` when the last room's use is
  `stair` or `lift`, else the middle (so no existing figure for an ordinary room moves).
- `farthest corner` is the corner of the start room's outline that is farthest, walked, from the
  point the route leaves the room by.
- `packages/cli/src/quantities/measure.ts`: `routeBetween` passes `ends` through; `Route` gains
  `startPoint`, `endPoint`, `startAt`, `endAt`.
- `packages/cli/src/mcp/readTools.ts`: `grid_measure what=route` takes `start`, `end` and, for a
  start point, `x` and `y`. The text names both points.
- Decision: a given point must lie on the start room's floor, else the call is refused by name.
  A given end point is not offered (an end is a place, `to` says which).

## Done

- `quantities/__tests__/routeEnds.test.ts`: a route to a stair room ends at its door and two
  identical stair rooms give the same length; start kinds; the points in the answer; a point off the
  floor refused.
- walked, routesAgree, nearestExit and measure tests still pass; ownWords and tolerances tests pass;
  typecheck, lint and the scoreboard do not get worse.
