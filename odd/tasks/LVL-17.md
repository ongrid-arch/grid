# LVL-17: a door into a much higher floor is not a way through

## Outcome

A door or a doorless opening between two rooms of one storey whose floors stand further apart in
height than a step (LVL-7's `floorOffset`, compared against Grid's own `passableRise`) is no longer
taken as a way through. The check names it, `opening/between-levels`, with both rooms and both
floor levels and how far one stands above the other, and the routes (the way-out check, the routes
`grid_measure` walks) do not pass through it. So a foyer door that opens onto a cinema's back row
3 m up is not counted as the back row's way out: the back row has no route out, and the line says
why and what to add.

A door from or into a room used as a stair is a way through whatever the levels: the stair is how a
person climbs between them. A step at the door (a genkan, a sunken wet area, a low stage: no more
than `passableRise`) is a way through, as before.

## Design

- `packages/floorplan/src/geometry/tolerances.ts`: a new limit `passableRise`, 0.3 m, Grid's own
  size and no code figure, the same as `passableSill` ("lower, it is a step"); its row in
  `docs/tolerances.md`.
- `packages/floorplan/src/geometry/rules/graph.ts`: `floorGraph` reads each passable door's and
  doorless opening's two rooms' floor offsets (`roomFloorOffset`, `steps.ts`). When they differ by
  more than `passableRise` (compared as drawn, `overFigure`) and neither room is used as a stair,
  the pair goes in a new list, `betweenLevels` (the opening, the lower and the upper room, each
  room's offset and the rise), and not in `links`. Dividing lines are left as they are (an open
  side, not a door; a stage edged by lines is the card's next question, not this one).
- `packages/floorplan/src/geometry/rules/check.ts`: one finding per such opening,
  `door_between_levels` under the rule `door-leads-somewhere` (no new rule, so the list of checks
  run stays the same), with the rooms lower first and a `levels` record. The two rooms count as
  touched, so a room whose only door is such a door gets "no route out", not "no door".
- `packages/floorplan/src/geometry/rules/types.ts`: the code and the optional `levels` field.
- `packages/floorplan/src/geometry/rules/messages.ts`, `messages/en.ts`, `messages/es.ts`: the
  sentence (door or opening, both rooms, both levels, the rise) and the line's found, needed and fix.
- `packages/floorplan/src/notes/notes.ts`: the note's title and detail.
- `packages/rules/src/result/inspect.ts` and `catalogue.ts`: `door_between_levels` →
  `opening/between-levels`, a finding line whose thing is the opening.
- `changes/LVL-17.md` with the code's row; `docs/plan-file.md` lists the code with the way-out codes.

Decisions taken alone:
- The limit is 0.3 m, a new entry beside `passableSill` with the same figure, so it can be changed
  apart from it.
- Only a room used as a stair lets a route pass between two levels of one storey; Grid has no ramp
  inside a storey (a stated ramp joins two floors), and a lift room is not taken as one.
- A door to the outside from a raised room is left to the existing above-ground check, which reads
  the storey's height and not the room's; that is a separate question.
- Dividing lines between rooms at different levels stay open sides.

## Done

- `packages/floorplan/src/geometry/__tests__/betweenLevels.test.ts`: a foyer with an exterior door
  and a door into a back row 3 m up: the door is in `betweenLevels`, not in `links`; the check gives
  `door_between_levels` naming both rooms and levels, and `no_route_to_exit` for the back row. A
  step of 0.3 m, a stair room between the two, and a doorless opening behave as described.
- `packages/rules/src/result/__tests__/betweenLevels.test.ts`: `inspectPlan` gives one
  `opening/between-levels` finding line on the door, in its own words.
- The contract test, `ownWords.test.ts`, `tolerances.test.ts`, the type check, the lint, the
  floorplan, rules and cli test folders and the scoreboard pass.
