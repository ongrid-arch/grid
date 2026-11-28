# ARE-78: a route between rooms on different floors

## Outcome

- `grid_measure what=route` from a room on one floor to a room on another answers with the way,
  up or down the stairs the plan states and the stair rooms one over the other, with every door
  and stair on it and how far it is walked, where it used to refuse ("the plan says nothing of
  what joins floors") although the way-out check follows the same stairs.
- When no stair joins the two floors but a lift shaft does (lift rooms one over the other), the
  route goes by the lift and says so: a step of `type` `lift`, walked from the middle of one lift
  room to the middle of the one over it, the ride left out.
- With several stairs, the route takes the one that makes the walk shortest, not the first the
  search meets, and lists the others with their lengths (`otherWays`), as a route to outside
  lists its other ways out.
- A route to outside is unchanged: it keeps to the way-out check's stairs, never a lift.
- A route between two rooms of one floor keeps to that floor, as before.

## Design

- `packages/cli/src/quantities/measure.ts`:
  - `routeSearch` reads the floor joins for a route between rooms of different floors too, not
    only for the way out, and its goal is the target room on its own floor. It takes the joins
    from its caller (worked out once per route) and may be limited to one stair or lift off the
    floor it starts on (`onlyJoin`), as the way out may be limited to one doorway (ARE-21).
  - `stairJoins(plan, lifts)` keeps the lift joins when asked; a lift step has `type` `lift` and
    no width. Lifts are taken only when no way by the stairs is found, because a stair is the way
    a person can always walk and the way the check reads.
  - `routeBetween`, for two rooms on different floors: one search per join that leaves the
    starting floor, each measured; the shortest walked wins (measured ones first, then fewest
    rooms, then the join's id), the others are `otherWays` (`via`, `type`, `rooms`, `length`).
- `packages/cli/src/mcp/readTools.ts`: the refusal goes; the answer adds one line on the other
  ways when there are some, and one on a lift when the route takes one. The tool's text says a
  route crosses floors. Sentences go through `say` (`route.otherWays`, `route.byLift`), in
  `en.ts` and the draft `es.ts`.
- A body's width is not set against a way up or down (as for the way out): stair widths are not
  measured here.
- No new convention, no new message code. The rooms-text compiler is not touched.

## Done

- `packages/cli/src/quantities/__tests__/acrossFloors.test.ts`: from the study upstairs to the
  bedroom below by the stated stair, with its walked length and the stair's share; down two
  floors of stair rooms; by a lift shaft when there is no stair, said as a lift; with two stairs,
  the shorter walk taken and the other listed; a route on one floor and the way out unchanged.
  Through the tool: the text and data of a route across floors, which was refused before.
- Existing route tests (`walked`, `routesAgree`, `nearestExit`, `routeEnds`) pass.
- build, typecheck, lint, the folders touched, `packages/cli/src/mcp`, scoreboard.
