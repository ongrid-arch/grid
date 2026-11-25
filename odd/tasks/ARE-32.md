# ARE-32: a wall that frames an opening is not inside it

## Outcome

- A wall that ends on another wall with its centre line at the jamb of an opening frames the
  opening: `wall/ends-in-opening` says nothing of it. A corridor carried through an opening as
  wide as the corridor between its walls' centre lines, or a half-round bay whose mouth is one
  opening, gives no note on `grid check`, the drawing or the sheet.
- The same holds wherever the plan stands: a row of identical blocks gets the same answer for
  every block, because the meeting point is compared with the jamb through `openingOverrun`
  (1 mm) from the table, never as two numbers that must be exactly equal.
- A wall whose centre line meets the other wall inside the opening, by more than that
  tolerance, is still named, as before.

## Design

- `packages/floorplan/src/geometry/openingPlaces.ts`
  - A `Cover` keeps `at`, where the meeting wall's centre line crosses the wall it meets.
  - `wall/ends-in-opening` is said only when `at` lies inside the opening's span by more than
    `openingOverrun` at both jambs (and the body runs into it, as before). A wall at or past a
    jamb stands beside the opening and makes its jamb.
  - `opening/crosses-wall` is left as it is: there the opening's own wall ends on, or runs
    through, the other wall, so an opening that reaches that wall's centre line runs into its
    body at a corner, which the lab's MS-8 case names.
  - `wallEndInOpening`, the edits' test, is left stricter: a new wall the edits draw keeps its
    whole body clear of openings, so an edit never makes the note. It uses the same tolerance.
- `packages/floorplan/src/geometry/tolerances.ts` and `docs/tolerances.md`: the words for
  `openingOverrun` say what it decides for a wall end. The figure does not change.
- Decision: the jamb is measured at the meeting wall's centre line, not its face. Walls in a
  plan are drawn on centre lines (C1), and an opening "as wide as the corridor" or "as wide as
  the bay's mouth" is written between centre lines, so that is where its jambs are meant to be.

## Done

- `packages/floorplan/src/geometry/__tests__/openingPlaces.test.ts`:
  - a corridor of 0.1 m walls carried through a 0.3 m wall by an opening as wide as the
    corridor between centre lines gives no place note, on twelve blocks placed at awkward
    offsets, and the same with the opening a hair (under 1 mm) wider;
  - a half-round bay whose mouth is one opening gives no `wall/ends-in-opening`;
  - a wall that meets 5 mm inside the opening is still named; the MS-8 cases stay as they are.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the words and
  tolerance tests, and `npm run scoreboard` (no count gets worse).
