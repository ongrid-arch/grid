# ARE-32: a wall that frames an opening is not inside it

## Outcome

- A wall that ends on another wall with its centre line at the jamb of an opening frames the
  opening: `wall/ends-in-opening` says nothing of it. A corridor carried through an opening as
  wide as the corridor between its walls' centre lines, or a half-round bay whose mouth is one
  opening, gives no note on `grid check`, the drawing or the sheet.
- The same holds wherever the plan stands: a row of identical blocks gets the same answer for
  every block, because the meeting point is compared with the jamb through `openingOverrun`
  (1 mm) from the table, never as two numbers that must be exactly equal.
- A wall that meets the other wall anywhere else with its body in the opening is still named,
  as before: inside the opening, or just outside a jamb with part of its thickness across it
  (the lab's Berlin flat partition, 0.1 m off a window's jamb and 25 mm into it).

## Design

- `packages/floorplan/src/geometry/openingPlaces.ts`
  - A `Cover` keeps `at`, where the meeting wall's centre line crosses the wall it meets.
  - `wall/ends-in-opening` is not said when `at` lies within `openingOverrun` of either jamb:
    that wall makes the jamb. Otherwise the body test stays as it was. A first try that excused
    every wall meeting at or past a jamb dropped the Berlin flat's checked note, so only the
    jamb itself is excused.
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
  - a wall that meets 5 mm inside the opening, or 5 mm outside it with its body in it, is still
    named; the MS-8 cases and the Berlin flat's notes stay as they are.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the words and
  tolerance tests, and `npm run scoreboard` (no count gets worse).
