# ARE-53: a measure between two things says when it crosses a wall

## Outcome

`grid_measure what=between` gives the straight distance from one thing to another. When that
straight line runs through a wall that is neither of the two things, the answer no longer calls
the distance "clear": it says "overall, through wall <id>" (every wall it passes, in order from
the first thing) and the data lists them under `through`. When the line crosses no wall, the
answer is as before and `through` is empty. A line that runs through a door or opening in a wall
is not counted as crossing that wall.

## Design

- `packages/cli/src/quantities/measure.ts`: `wallsCrossed(plan, floor, from, to, leave)` returns
  the ids of the solid walls (not dividing lines) on the floor whose faces the segment from `from`
  to `to` passes through, in order along it. A wall in `leave` (the things measured, or the wall
  an opening stands in) is skipped. The segment is shortened by the joint tolerance at each end,
  so touching a face at its end is not crossing. Where the segment passes through a wall inside
  the hole of one of its openings, that wall is not counted.
- `packages/cli/src/mcp/readTools.ts`: `what=between` calls it with the nearest points the
  distance already gives, words the answer and adds `through` to the data.
- Decision: the nearest-points line is what is tested, not every possible tape line; it is the
  figure the answer already gives. Easy to widen later.
- Docs: `docs/tool-server.md`, the paragraph on `what=between`.

## Done

- Tests in `packages/cli/src/mcp/__tests__/measureBetween.test.ts`: two rooms with a partition
  and a second room between them (wall named, order), a clear measure with `through` empty, the
  walls of the two things themselves not counted, a door in a wall not counted.
- `npm run typecheck`, `npm run lint`, the cli test folder, `ownWords` and `tolerances` tests,
  `npm run scoreboard`.
