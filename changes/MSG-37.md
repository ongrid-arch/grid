# 2026-11-28: write and edit answers in the plan's display units (MSG-37)

## For people

- On a plan you read in millimetres, centimetres or feet and inches, writing rooms text and the
  common edits now answer in those units, as the drawing and the areas already did: a room reads
  `27'-7" x 30'-10", 849.9 sq ft (78.96 m²)`, an interior wall `4 1/2"`, a door `813 mm`, and an
  edit says `window "w1" width 3'-11" → 3'-3"` and `net 931 sq ft (86.46 m²) → 930 sq ft
  (86.37 m²)` (MSG-37). A plan in metres answers word for word as before.
- A length that falls on a half is rounded one way, up, wherever it is shown: two walls of the
  same thickness no longer read 4" and 5", and 0.5005 m reads 501 mm.

## For agents

- `grid_write_rooms` and `grid write`: the room sizes and areas, the total, each wall's thickness
  and length and the openings' figures are in the plan's `display`; in feet and inches a wall's
  thickness is in inches to the eighth, and square feet keep square metres beside them. The
  compiler's guesses, warnings and refusals stay in metres.
- `grid_change_opening` (width, height, sill, removed), `grid_change_wall` (thickness, each face's
  move) and `grid_move_room_side` (how far the side moved) say their figures in the plan's
  display, and the before and after line of every edit answer (`net … → …`, walls out and new,
  walls another height or thickness, a move) is in it too. `grid_compare` and `grid_diff` are as
  they were.
- In the library, `showThickness` and `plainMetres` in `types/units.ts`; `comparePlans` takes an
  optional `display`.
- No new code in the record.
