# ARE-21: a route to outside takes the nearest way out

## Outcome

- `grid_measure what=route to=outside` walks to every way out on the floor and answers with the
  shortest by walked length, not the one the search met first (which was the one with the
  smaller id when the ways out were equally many rooms away).
- The answer says which way out it chose (`exit`) and lists the others with their walked length
  (`otherExits`), nearest first, so a person can see what was passed over.
- A route between two rooms is unchanged.

## Design

- `routeBetween` in `packages/cli/src/quantities/measure.ts`. For `to === 'outside'` it takes each
  way out (every room-to-`OUTSIDE` link from `wayGraph`), finds the way with the fewest rooms to
  that doorway's room, measures it with `walkedLength`, and keeps the shortest length. A way whose
  length cannot be measured ranks after every measured one; ties go to fewer rooms, then to id.
  Fewest-rooms-per-exit is kept as the path to an exit: it is what the route measure already
  meant by a route, and a longer detour to the same exit is not a nearer way out.
- `Route` gains optional `exit` and `otherExits`, present only for a route to outside.
- `grid_measure` text (`packages/cli/src/mcp/readTools.ts`) adds one line naming the chosen exit
  and the others with their lengths. The wide-route measure (`use.ts`) reads `routeBetween`, so its
  first way now starts from the nearest exit too; its search for another way is untouched.
- No new convention, no new message code.

## Done

- `packages/cli/src/quantities/__tests__/nearestExit.test.ts`: a plan with two ways out, the one
  with the smaller id far away and the other near; the route takes the near one, lists the far
  one; also through the tool's text and data. Fails before the change.
- Existing walked and curved-wall route tests still pass.
- typecheck, lint, `packages/cli` tests, scoreboard.
