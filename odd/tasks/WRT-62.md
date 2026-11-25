# WRT-62: read units in polygon points

## Outcome

A room drawn as a polygon in rooms text takes its points with units, as a size does:
`polygon 0ft,0ft 40ft,0ft 40ft,25ft 0,25ft` is the same room as its points in metres. A point
whose length Grid cannot read is refused on its line saying which word it could not read and the
forms a length takes, never as a polygon with fewer than three points. A polygon whose points
carry a unit is taken as meant at any size, as a size with its unit is, so it is not asked about.

## Design

- `packages/floorplan/src/rooms/words.ts`: one test for a word that is written as a point,
  `isPointWord`: one comma, and each side starting as a number does (a digit, a point, a sign
  or a bracket). It does not read the lengths; `pointOf` does, and refuses a bad one by name.
- `packages/floorplan/src/rooms/compile.ts`: the polygon reads every point word that follows it
  through `pointOf`, which already reads units (`numberOf`), and the `x,y` form of the room line's
  words (what a mistyped word was most likely meant to be) uses the same test. A polygon with a
  unit in any of its points sides is no longer asked about as written with no unit.
- The refusal for fewer than three points names the forms a point takes, units included.
- Decision: one point written with a unit is enough to take the whole polygon as meant; a
  polygon mixing `0` with `40ft` is common and the zero needs no unit.
- No new convention and no new message code.

## Done

- `packages/floorplan/src/rooms/__tests__/units.test.ts`: a polygon in feet, in feet and inches
  and in millimetres writes the same room as in metres; a point with a unit Grid cannot read is
  refused as `rooms/units` or `rooms/syntax` naming the word, not as too few points; a long
  polygon in feet is not asked about, the same one bare still is.
- Type check of `packages/floorplan`, lint, the rooms tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
