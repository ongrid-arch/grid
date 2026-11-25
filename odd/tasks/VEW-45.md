# VEW-45: a door with no swing is said and drawn one way

## Outcome

A door that states no swing is said the same way in the write answer and the check: "no swing
stated", its sweep not checked, and the write answer also says how it is drawn (a dashed line and
"?" on a drawing sheet, a plain gap in the working picture), so nobody is told one thing while
another is drawn.

## Design

- The plan records no difference between a door written `no-swing` and a door that never said,
  so both are the same case, "no swing stated". Telling them apart would need a new field and a
  new convention, which this change does not take.
- `rooms.rawRoom.noSwing` (en, es) and the matching sentence in `rooms/compile.ts` now say all of
  what happens: the sweep is not checked, a drawing sheet marks it with a dashed line and "?",
  the working picture leaves a plain gap.
- Decision: the working look keeps no mark. Giving it the mark was tried and refused: the app's
  screen canvas is built from that look and holds exactly one `role="img"`, so the mark would
  break its structure and change every canvas snapshot.
- Tests: the write answer's wording.

## Done

- `rooms` tests for the write answer, `looks.test.ts` for the working look, `ownWords` and
  `tolerances` tests, typecheck, lint, scoreboard.
