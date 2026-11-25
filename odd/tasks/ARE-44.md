# ARE-44: the brief's step line reads every change of level on the way in

## Outcome

A person who asks for "no step" (or "at most 0.02 m") gets a line that looks at every step on the
way in, as `grid_measure what=access` does: a door's sill, a change of floor level between two
rooms (their floor offsets), and the step between the ground outside and the floor inside the
entrance (the site's stated ground plus the room's floor offset). Drawing the doors flush no longer
turns the line met while a raised floor or a stepped entrance is still there.

## Design

- `packages/cli/src/brief/lines.ts`, the `step` branch of `figureLines`, reads three things:
  1. every door's sill (as before);
  2. every step between rooms from `planSteps` (per floor, as access reads it): a door or
     dividing line where one floor stands higher than the other by more than the figure;
  3. the entrance doors (`entranceOf`): the height of the floor inside above the ground outside,
     `groundLevel(...).above` for the floor plus `roomFloorOffset`, only when the plan states a
     ground (`site.ground`); with none stated, nothing is said, as in access (which says it cannot tell).
- A step is judged by its size against the figure, the same comparison as a sill (`> value + eps`).
- Each shortfall is its own line naming its part; a level step's part is the opening, or the wall
  for a dividing line. A step is never counted twice: a sill and a level step at one door are two
  different things (the sill is the door's, the level the floors').
- `quantities/access.ts` is only read, not changed.

## Done

- `brief/__tests__/steps.test.ts` fails before and passes after: a flush door between a room and a
  room with a raised floor (`floorOffset`) is missed; the entrance with a stated ground and a raised
  floor is missed; a plan with level floors and no sill is met.
- The existing brief tests still pass (`npx vitest run packages/cli/src/brief`).
- `ownWords`, `tolerances`, typecheck, lint, and the scoreboard do not get worse.
