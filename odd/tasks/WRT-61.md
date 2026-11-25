# WRT-61: rooms laid out from an area get a sensible shape

## Outcome

A first layout from the brief (`grid_write_rooms layout=…`, `grid write --layout`) gives a room
asked for by its area alone a shape a person can use. No side of it is narrower than
`layoutNarrowest` (Grid's own size, not a code figure), or than the room's own square when it is
smaller than that, and with `sizes` its long side is at most `layoutLongest` times its short
side. A half bath of about 2.8 m² beside rooms nearly 4 m deep is drawn about 1.2 x 2.3 m, not
0.71 x 3.96 m. With `tidy` every room of a row is still as deep as the row, so a small room is
made wider than its area needs and the answer names it, as for any size not kept.

## Design

- `packages/floorplan/src/geometry/tolerances.ts`: two limits of Grid's own, `layoutNarrowest`
  (1.2 m) and `layoutLongest` (2, a ratio), with their rows in `docs/tolerances.md`.
- `packages/floorplan/src/rooms/layout.ts`: a room given only an area has a shortest side,
  the larger of `layoutNarrowest` (or its square's side, when smaller) and the side its area
  gives at the longest proportion. `fit` keeps the old shape (the row's depth by the width that
  keeps the area) while that holds; in a row deeper than the room's longest side the room is as
  narrow as its shortest side allows and, with `sizes`, only as deep as its area needs, so the
  outline steps; with `tidy` it is as deep as the row and larger than asked. A row is never
  shallower than the shortest side of an area room in it: that side is one of the row's
  depths and a shallower one is not tried, so a room is never stretched long the other way.
- The search between ways of packing is unchanged: a room made larger makes the rectangle
  larger, so the packing that needs it least is still the one kept.
- No new convention, no new message code. The answer's words are unchanged: a size not kept is
  named as before.

## Done

- `packages/floorplan/src/rooms/__tests__/layout.test.ts`: a home whose rooms are nearly 4 m deep
  and a half bath of 2.8 m²: with `sizes` it keeps its area at a usable shape; with `tidy` no
  side is under the narrowest and it is named as not kept; a closet smaller than the narrowest
  square is a square; every layout's text writes the plan with no problem. These fail before
  the change.
- `packages/cli/src/brief/__tests__/layout.test.ts`: the same half bath through
  `grid_write_rooms layout=sizes`.
- The type check, lint, the floorplan and cli brief tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
