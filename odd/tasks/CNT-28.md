# CNT-28: a curved wall's ends are wall ends in the corner checks

## Outcome

- A straight wall that ends on a curved wall, at the curve's end or along it, meets a wall
  there: no wall fault says it "runs past its corner ... where it meets no other wall", and
  `grid check` and `grid_check` list no `wall/overrun` for it.
- A room bounded in part by a curved wall is looked at by the wall-fault checks as the curved
  wall's own work said it was: its straight walls are checked for overruns, gaps and walls
  crossing it, and the corner a straight wall makes with the curve counts as a corner on that
  straight wall.
- A straight wall that really runs on past the end of a curved wall, into nothing, is still
  named, with the curved wall as the wall it makes its corner with. Its fix moves the straight
  wall's end back; Grid never offers to move the curved wall's end, which would move its curve.
- No fault is about a curved wall itself and no fix moves one, as before.

## Design

- `packages/floorplan/src/geometry/wallFaults.ts` only.
  - The faults keep measuring straight walls only (`Seg`). Beside them each floor now keeps its
    sound curved walls (`Bend`: the wall, its curve from `arc.ts`, its thickness), the ones
    `curveFault` finds nothing wrong with, standing on the floor and not refused.
  - A room is traced when every wall it lists is a straight wall or a sound curved wall on the
    floor. Before, a room listing a curved wall was left out, so the curved wall's corners were
    never seen, though the comment on `segOf` (CNT-18) said those rooms were still traced.
  - `overrunFaults`: a corner a straight wall makes with a curved wall counts on the straight
    wall (the curved wall is the `other` it meets there), and so does a straight wall that runs
    on into a curved wall with no corner between them. The "if instead the other wall is meant to
    reach..." suggestion is left out when the other wall is curved.
  - `touchesAnother`: a free end that lies on a curved wall, within half its thickness and `gap`
    of the curve, meets a wall, as it does on a straight one. The distance to the curve is
    worked out from the curve itself (`curveAlong`, `curvePointAt`), not from its pieces.
  - `short` at a corner with a curved wall stays unchecked, as before: a fix there would have to
    move the curve's end or measure along the curve, which is a change of its own.
- Decision: no new message code and no new wording. The fault the person no longer sees is the
  only change people notice.

## Done

- New tests in `packages/floorplan/src/geometry/__tests__/wallFaults.test.ts`, failing before:
  - a straight wall running along two rooms to the end of a curved wall: no fault, and
    `validatePlan` lists no `wall/overrun`;
  - a straight wall that ends on the middle of a curved wall: no fault;
  - a straight wall listed only in a room with a curved wall, ending at the curve: no fault;
  - a straight wall running 1 m past a curved wall's end: one `overrun` naming the curved wall,
    its fix moves the straight wall only, and the message offers no move of the curved wall.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the cli's
  `ownWords.test.ts`, `npm run scoreboard`.
