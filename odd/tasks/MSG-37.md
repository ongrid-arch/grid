# MSG-37 · Write and edit answers in the plan's display units

## Outcome

On a plan whose display is millimetres, centimetres or feet and inches, the answer to writing
rooms text (`grid write`, `grid_write_rooms`) and the answer to the common edits (an opening's
width, height or sill, a wall's thickness, a room's side moved) give their lengths and areas in
that display, as `grid_areas`, the drawing and the sheet already do. A 4 1/2" wall reads
`4 1/2"`, not `0.1143 m`; a room reads `27'-6" x 30'-10"`, and its area `850 sq ft (78.96 m²)`.
A half is rounded one way, away from zero, whatever the floating point noise of the metres
behind it, so two walls of the same thickness never read 4" and 5". A plan in metres (the
default) answers word for word as before.

## Design

- `packages/floorplan/src/types/units.ts`: `showLength` rounds a half away from zero: the
  metres are nudged by `lengthEqual` (the tolerance table's rounding noise) before rounding, in
  feet and inches and in m, cm and mm alike. No new tolerance.
- `packages/floorplan/src/rooms/answer.ts`: `roomsAnswer` takes the plan's display. In metres
  it writes what it wrote; in any other display each room's size and area, each wall's
  thickness and length, the total, and the figures of the opening lines (Grid's own `0.90 m`
  figures, written by the compiler) are written in it. A wall thickness in feet and inches is in
  inches to the eighth (`4 1/2"`), as a thickness is read; other lengths take the display's own
  precision. `compile.ts` is not touched: the opening lines it writes are rewritten figure by
  figure (`<n> m`) in the answer, the only text of its own the answer rewrites.
- `packages/cli/src/command/write.ts` and the `grid_write_rooms` tool pass the written plan's
  display.
- `packages/cli/src/edit/edits.ts`: the said lines of `changeOpening`, `changeWallThickness` and
  `moveRoomSide` write their before → after figures in the plan's display (`displayFor` with
  the plan), the metres wording unchanged in metres.
- `packages/cli/src/quantities/compare.ts`: `comparePlans` takes an optional display; the
  verdict's net areas, wall lengths and move are written in it. The edit answer
  (`writeTools.ts`) passes the plan's display; `grid_compare` and `grid_diff` are left as they
  are.

Decisions: metres keep their exact old wording, so no metres answer changes; areas in square feet
keep square metres beside them, as `areaText` does everywhere else; the compiler's other words
(guesses, warnings, refusals) stay in metres (the compiler is not in this change's area).

Left for later: `grid describe` (its compact KEY says metres and stays so), check findings and
code figures beside metres (the rules package), the brief's answers and its reading of `50ft` as
a height, refusals of the compiler, and the tools' schema words ("in metres").

## Done

- `packages/floorplan/src/types/__tests__`: a half inch rounds up at whole inches, a half
  millimetre at whole millimetres, whatever the float behind it.
- `packages/floorplan/src/rooms/__tests__`: the write answer in ft-in and in mm; in metres as
  before.
- `packages/cli/src/mcp/__tests__`: `grid_write_rooms` and `grid_change_opening` /
  `grid_change_wall` on a ft-in plan answer in feet and inches; on a metres plan as before.
- build, typecheck, lint, vitest on the folders touched plus `packages/cli/src/mcp` and
  `packages/cli/src/command`, the tolerance test, `npm run scoreboard`.
